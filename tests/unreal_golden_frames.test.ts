// Golden-frame pin for the Unreal client decoder. A real local-server session
// (scripts/unreal/golden_session.mjs) is replayed through ClientWorld.applySnapshot;
// the per-snapshot digest (tests/helpers/unreal_golden.ts) must equal the
// committed expected rows, which the C++ test Wyndlewood.Net.GoldenFrames
// compares its own decode against. Regenerate after a deliberate wire change:
//   UNREAL_GOLDEN_UPDATE=1 npx vitest run tests/unreal_golden_frames.test.ts
// then copy both fixture files into the Unreal project's Tests/Golden folder.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readProtocol } from '../scripts/unreal/protocol_export';
import { type GoldenRow, goldenDigest, parseRecordedFrames } from './helpers/unreal_golden';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = join(ROOT, 'tests/fixtures/unreal_golden');
// session: a Node-recorded walk. ue_route: recorded by the Unreal client itself while it
// walked, targeted, attacked, cast and interacted (-WyndRecord). ue_quest: the Unreal client
// running the real Proving Shore opening (Run the Gauntlet, then Strike True) with no dev commands.
const SESSIONS = ['session', 'ue_route', 'ue_quest'] as const;

function encodeRows(rows: GoldenRow[]): Buffer {
  return gzipSync(`${rows.map((r) => JSON.stringify(r)).join('\n')}\n`, { level: 9 });
}

function decodeRows(buf: Buffer): GoldenRow[] {
  return gunzipSync(buf)
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as GoldenRow);
}

describe.each(SESSIONS)('unreal golden frames: %s', (name) => {
  const FRAMES = join(DIR, `${name}.frames.tsv.gz`);
  const EXPECTED = join(DIR, `${name}.expected.jsonl.gz`);
  const frames = parseRecordedFrames(readFileSync(FRAMES));
  const { allDeltaKeys } = readProtocol(ROOT);
  const rows = goldenDigest(frames, allDeltaKeys);

  it('ClientWorld replay equals the committed golden digest', () => {
    if (process.env.UNREAL_GOLDEN_UPDATE === '1') writeFileSync(EXPECTED, encodeRows(rows));
    expect(rows).toEqual(decodeRows(readFileSync(EXPECTED)));
  });

  it('the recording exercises every decode path the C++ mirror implements', () => {
    const snaps = frames.map((f) => JSON.parse(f.text)).filter((m) => m.t === 'snap');
    const seen = new Set<number>();
    let full = 0;
    let lite = 0;
    let kept = 0;
    let pruned = 0;
    let prev = new Set<number>();
    for (const [i, s] of snaps.entries()) {
      for (const w of s.ents) {
        if (w.k !== undefined) full++;
        else if (seen.has(w.id)) lite++;
        seen.add(w.id);
      }
      kept += (s.keep ?? []).length;
      const now = new Set(rows[i].ents.map((r) => r[0] as number));
      for (const id of prev) if (!now.has(id)) pruned++;
      prev = now;
    }
    expect(snaps.length).toBeGreaterThan(100);
    console.log(`${name}: ${rows.reduce((a, r) => a + r.events.length, 0)} events`);
    expect(full).toBeGreaterThan(0);
    expect(lite).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
    expect(rows.some((r) => r.self.recon !== null && r.self.ack > 0)).toBe(true);
    expect(rows.some((r) => Object.keys(r.changed).length > 0)).toBe(true);
    // Reported for the record; a session that never sees an entity leave still
    // pins every other path, and the C++ suite covers pruning synthetically.
    console.log(
      `golden ${name}: ${snaps.length} snaps, ${full} full, ${lite} lite, ${kept} keep ids, ${pruned} prunes`,
    );
  });
});

// The ue_quest recording is a real starter flow, so ClientWorld must surface its combat and quest
// beats in order: both quests accepted, the three Gauntlet flags, the effigy hit and killed by the
// player, both hand-ins paying xp. (No heal: nothing on the opening hits back, and the bread the
// client eats mid-fight is refused in combat, which is pinned as the server's error event.)
describe('unreal golden frames: ue_quest flow', () => {
  const frames = parseRecordedFrames(readFileSync(join(DIR, 'ue_quest.frames.tsv.gz')));
  const { allDeltaKeys } = readProtocol(ROOT);
  const rows = goldenDigest(frames, allDeltaKeys);
  const events = rows.flatMap((r) => r.events as Record<string, unknown>[]);
  const self = (
    frames.map((f) => JSON.parse(f.text)).find((m) => m.t === 'hello') as { pid: number }
  ).pid;
  const ofType = (type: string) => events.filter((e) => e.type === type);

  it('pins the quest beats in running order', () => {
    const beats = events
      .filter(
        (e) => e.type === 'questAccepted' || e.type === 'questProgress' || e.type === 'questDone',
      )
      .map((e) => `${e.type}:${e.questId}${e.current === undefined ? '' : `:${e.current}`}`);
    expect(beats).toEqual([
      'questAccepted:q_ps_the_gauntlet',
      'questProgress:q_ps_the_gauntlet:1',
      'questProgress:q_ps_the_gauntlet:2',
      'questProgress:q_ps_the_gauntlet:3',
      'questDone:q_ps_the_gauntlet',
      'questAccepted:q_ps_strike_true',
      'questProgress:q_ps_strike_true:1',
      'questDone:q_ps_strike_true',
    ]);
    // The digest sorts the done list.
    expect(rows.at(-1)?.self.qdone).toEqual(['q_ps_strike_true', 'q_ps_the_gauntlet']);
  });

  it('pins the melee hits, the kill and the xp it pays', () => {
    const hits = ofType('damage').filter((e) => e.sourceId === self && e.kind === 'hit');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((e) => e.abilityId === 'heroic_strike')).toBe(true);
    const target = hits[0].targetId;
    expect(ofType('death')).toEqual([
      expect.objectContaining({ entityId: target, killerId: self }),
    ]);
    expect(ofType('xp').map((e) => e.amount)).toEqual([100, 50, 60]);
    expect(ofType('error').map((e) => e.text)).toContain("You can't do that while in combat.");
  });
});
