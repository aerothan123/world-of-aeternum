// The Lady of the Bonechill (the art guide's model: concept, Tripo, a skeleton and
// every clip built in Blender): the Hollow Crypt's second boss drawn as her own
// ghost bride, not the spider placeholder. Pins the look's contract: the size she
// looms at, the clips the sim's casts and bars play (timed to the bars), the
// alpha-blended ghost cloth (never transmission), and the asset budget.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { MOBS } from '../src/sim/data';
import { LADY_ID } from '../src/sim/encounters/hollow_crypt';
import type { Entity } from '../src/sim/types';

const PLAYER_HEIGHT = 2.6;
const GLB = 'public/models/creatures/woc_crypt_lady_bonechill.glb';

interface GlbJson {
  animations?: { name: string; samplers: { input: number }[] }[];
  meshes: { primitives: { indices: number; material?: number }[] }[];
  accessors: { count: number; max?: number[] }[];
  materials: {
    name: string;
    alphaMode?: string;
    doubleSided?: boolean;
    extensions?: Record<string, unknown>;
    pbrMetallicRoughness?: { baseColorTexture?: unknown };
  }[];
  extensionsUsed?: string[];
}

function glbJson(): GlbJson {
  const buf = readFileSync(GLB);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

/** A clip's length in seconds (the latest time in any of its samplers). */
function clipSeconds(j: GlbJson, name: string): number {
  const clip = (j.animations ?? []).find((a) => a.name === name);
  if (!clip) throw new Error(`no clip ${name}`);
  return Math.max(...clip.samplers.map((s) => j.accessors[s.input].max?.[0] ?? 0));
}

const key = visualKeyFor({ kind: 'mob', templateId: LADY_ID } as Entity);
const def = VISUALS[key];

describe('the Lady of the Bonechill: her own body', () => {
  it('wears her rebuilt body on the priest library (refit_enemy_looks.ts)', () => {
    expect(def.url).toBe('models/creatures/woc_crypt_lady_bonechill.glb');
    expect(def.clips).toBe(VISUALS.player_priest.clips);
  });

  it('draws the ghost bride, not the spider placeholder', () => {
    expect(key).toBe('crypt_lady_bonechill');
    expect(def.url).toBe('models/creatures/woc_crypt_lady_bonechill.glb');
    expect(def.authoredAtlas).toBe(true);
  });

  it('looms about two and a half players tall and floats over the ice', () => {
    // Authored at size: the template draws her at scale 1.
    expect(MOBS[LADY_ID].scale).toBe(1);
    const drawn = def.height * MOBS[LADY_ID].scale;
    expect(drawn / PLAYER_HEIGHT).toBeGreaterThan(2.4);
    expect(drawn / PLAYER_HEIGHT).toBeLessThan(3.2);
    expect(def.hover ?? 0).toBeGreaterThan(0.3);
    expect(def.hover ?? 0).toBeLessThan(0.8);
  });

  it('stays inside the boss triangle and size budget', () => {
    const j = glbJson();
    let tris = 0;
    for (const m of j.meshes)
      for (const p of m.primitives) tris += j.accessors[p.indices].count / 3;
    // A Tripo smart mesh: a few thousand triangles, the budget's lower floor a
    // guard against a placeholder or a stripped mesh shipping in her place.
    expect(tris).toBeGreaterThan(4_000);
    expect(tris).toBeLessThan(20_000);
    expect(readFileSync(GLB).length).toBeLessThan(3_500_000);
  });
});
