// Freshness pin for the W14 creature, ability VFX and telegraph exports
// (scripts/unreal/creature_export.ts): each committed JSON must equal a fresh build from
// the renderer's own tables. Regenerate with UNREAL_CREATURES_UPDATE=1 on this test.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ABILITY_VFX_EXPORT_FILE,
  buildAbilityVfxExport,
  buildCreatureExport,
  buildTelegraphExport,
  CREATURE_EXPORT_FILE,
  TELEGRAPH_EXPORT_FILE,
} from '../scripts/unreal/creature_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';
import { ABILITIES, MOBS } from '../src/sim/data';

const ROOT = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);

function pin(file: string, fresh: unknown) {
  const path = join(ROOT, file);
  if (process.env.UNREAL_CREATURES_UPDATE === '1') {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(fresh, null, 2)}\n`);
  }
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(fresh);
}

describe('unreal creature export', () => {
  it('creature visuals are fresh and cover every mob template', () => {
    const c = buildCreatureExport();
    pin(CREATURE_EXPORT_FILE, c);
    expect(Object.keys(c.mobs).sort()).toEqual(Object.keys(MOBS).sort());
    expect(Object.keys(c.mounts).length).toBeGreaterThan(0);
    expect(c.ferries.length).toBeGreaterThan(0);
  });

  it('ability VFX entries are fresh and every ability id has one', () => {
    const v = buildAbilityVfxExport();
    pin(ABILITY_VFX_EXPORT_FILE, v);
    for (const id of Object.keys(ABILITIES)) expect(v.abilities[id]?.archetype).toBeTruthy();
  });

  it('telegraphs are fresh; a sized lane has a width', () => {
    const t = buildTelegraphExport();
    pin(TELEGRAPH_EXPORT_FILE, t);
    for (const [id, s] of Object.entries(t.casts)) {
      if (s.shape === 'lane' && s.range > 0) expect(s.halfWidth, id).toBeGreaterThan(0);
    }
    // A cast whose source table has no size draws nothing on the web either; the
    // native client reproduces that and the export names them for the owner.
    console.log(
      `telegraphs: ${Object.keys(t.casts).length}, zero-sized: ${t.zeroSized.join(', ')}`,
    );
  });
});
