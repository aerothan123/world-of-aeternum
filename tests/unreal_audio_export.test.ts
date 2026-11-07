// Freshness and shape pins for the W15 audio exports to the native client
// (scripts/unreal/audio_export.ts): the audio catalog the Unreal importer and resolver read and
// the music selection parity suites `Wyndlewood.Audio.Parity.*` replay.
// Regenerate with UNREAL_PARITY_UPDATE=1 on this test.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIO_CATALOG_FILE,
  AUDIO_EXPORT_SUBDIR,
  AUDIO_PARITY_SUITES,
  assetFor,
  buildAudioCatalog,
  buildAudioSuite,
} from '../scripts/unreal/audio_export';
import { PARITY_EXPORT_SUBDIR } from '../scripts/unreal/parity_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';
import { instanceMusicDecision } from '../src/game/instance_music';
import { SFX_CLIPS } from '../src/game/sfx_manifest.generated';
import { ZONES } from '../src/sim/data';

const DIR = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);
const UPDATE = process.env.UNREAL_PARITY_UPDATE === '1';

describe('unreal audio parity export', () => {
  for (const name of Object.keys(AUDIO_PARITY_SUITES)) {
    it(
      `committed suite ${name} is fresh`,
      () => {
        const fresh = buildAudioSuite(name);
        expect(fresh.suite).toBe(name);
        expect(fresh.cases.length).toBeGreaterThan(0);
        const dir = join(DIR, PARITY_EXPORT_SUBDIR);
        const path = join(dir, `${name}.json`);
        if (UPDATE) {
          mkdirSync(dir, { recursive: true });
          writeFileSync(path, `${JSON.stringify(fresh)}\n`);
        }
        expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
        // audio_near_water samples the water field across every zone: about 20 s alone,
        // so it alone takes a raised budget for a loaded run.
      },
      name === 'audio_near_water' ? 60_000 : undefined,
    );
  }

  it('the combat suite agrees with the live instanceMusicDecision on the overworld', () => {
    const zone = ZONES[0];
    for (const c of buildAudioSuite('audio_music_combat').cases) {
      const i = c.in as Record<string, boolean | number>;
      if (i.inRaidArena || i.inBattleground || i.crucible) continue;
      const now = 100000;
      const d = instanceMusicDecision({
        now,
        lastCombatEventAt: now - (i.msSinceCombat as number),
        lastBossCombatEventAt: now - (i.msSinceBoss as number),
        inCombat: i.inCombatFlag as boolean,
        playerId: 1,
        playerPos: { x: zone.hub.x + 500, z: zone.hub.z },
        zone,
        inDungeon: false,
        entities: [
          ...(i.aggroed ? [{ kind: 'mob', dead: false, templateId: 'x', aggroTargetId: 1 }] : []),
          ...(i.bossAggro
            ? [
                {
                  kind: 'mob',
                  dead: false,
                  templateId: 'nythraxis_scourge_of_thornpeak',
                  aggroTargetId: 2,
                },
              ]
            : []),
        ],
        riftFloor: null,
      });
      const out = c.out as { inCombat: boolean; musicCombat: boolean; bossEngaged: boolean };
      expect({
        inCombat: d.inCombat,
        musicCombat: d.musicCombat,
        bossEngaged: d.bossEngaged,
      }).toEqual(out);
    }
  });
});

describe('unreal audio catalog export', () => {
  it('committed catalog is fresh', async () => {
    const fresh = await buildAudioCatalog();
    const dir = join(DIR, AUDIO_EXPORT_SUBDIR);
    const path = join(dir, AUDIO_CATALOG_FILE);
    if (UPDATE) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, `${JSON.stringify(fresh)}\n`);
    }
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('covers every manifest SFX key with at least one file', async () => {
    const c = await buildAudioCatalog();
    const keys = new Set(c.sfx.map((s) => s.key));
    for (const k of Object.keys(SFX_CLIPS)) expect(keys.has(k)).toBe(true);
    for (const s of c.sfx) expect(s.files.length).toBeGreaterThan(0);
  });

  it('gives every file a distinct Unreal asset inside the path limit', async () => {
    const c = await buildAudioCatalog();
    const byAsset = new Map<string, string>();
    const all = [
      ...c.sfx.flatMap((s) => s.files),
      ...c.voice,
      ...c.cues,
      ...c.bossTracks,
      ...c.crucible,
      c.defaultBoss,
    ];
    for (const f of all) {
      expect(f.asset.length).toBeLessThan(120);
      const prev = byAsset.get(f.asset);
      if (prev !== undefined) expect(prev).toBe(f.path);
      byAsset.set(f.asset, f.path);
    }
    expect(assetFor('audio/sfx/ui_click.mp3')).toBe('/Game/Wyndlewood/Audio/SFX/ui_click');
  });
});
