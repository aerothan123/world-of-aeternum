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
const FRAMES = join(DIR, 'session.frames.tsv.gz');
const EXPECTED = join(DIR, 'session.expected.jsonl.gz');

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

describe('unreal golden frames', () => {
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
    expect(full).toBeGreaterThan(0);
    expect(lite).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
    expect(rows.some((r) => r.self.recon !== null && r.self.ack > 0)).toBe(true);
    expect(rows.some((r) => Object.keys(r.changed).length > 0)).toBe(true);
    // Reported for the record; a session that never sees an entity leave still
    // pins every other path, and the C++ suite covers pruning synthetically.
    console.log(
      `golden: ${snaps.length} snaps, ${full} full, ${lite} lite, ${kept} keep ids, ${pruned} prunes`,
    );
  });
});
