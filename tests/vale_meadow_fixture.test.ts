import { describe, expect, it } from 'vitest';
import { isBlocked, lineOfSightClear } from '../src/sim/colliders';
import { CAMPS, NPCS } from '../src/sim/data';
import { ebv2Weight } from '../src/sim/eastbrook_v2';
import { groundHeight, terrainSteepnessAt, WATER_LEVEL, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';
import { VALE_MEADOW, VALE_MEADOW_RADIUS } from './helpers/vale_meadow';

// Pins the promise tests/helpers/vale_meadow.ts makes to the seed-pinned suites
// that stand there: design ground, dry and level, nothing solid inside the
// radius on any of a spread of seeds, sight lines clear 20 yd out, and no camp
// or NPC close enough to wander in.
const SEEDS = [WORLD_SEED, 42, 7, 2307, 50406, 50423];

describe('the vale meadow test fixture', () => {
  it('stands fully on v2 design ground', () => {
    expect(ebv2Weight(VALE_MEADOW.x, VALE_MEADOW.z)).toBeGreaterThanOrEqual(0.99);
  });

  it('is dry, level and open on every seed', () => {
    const R = VALE_MEADOW_RADIUS;
    const bad: string[] = [];
    for (let dx = -R; dx <= R; dx += 2) {
      for (let dz = -R; dz <= R; dz += 2) {
        if (dx * dx + dz * dz > R * R) continue;
        const x = VALE_MEADOW.x + dx;
        const z = VALE_MEADOW.z + dz;
        const g = groundHeight(x, z, WORLD_SEED);
        if (g < WATER_LEVEL + 0.6 || g < waterLevelAt(x, z, WORLD_SEED) + 0.6)
          bad.push(`wet ${x},${z}`);
        if (terrainSteepnessAt(x, z, WORLD_SEED) > 0.25) bad.push(`steep ${x},${z}`);
        for (const seed of SEEDS)
          if (isBlocked(seed, x, z, 0.6)) bad.push(`solid ${x},${z} @${seed}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps sight lines clear 20 yd out in every direction', () => {
    for (let a = 0; a < 16; a++) {
      const to = {
        x: VALE_MEADOW.x + Math.sin((a * Math.PI) / 8) * 20,
        z: VALE_MEADOW.z + Math.cos((a * Math.PI) / 8) * 20,
      };
      for (const seed of SEEDS)
        expect(lineOfSightClear(seed, VALE_MEADOW, to), `${a} @${seed}`).toBe(true);
    }
  });

  it('keeps every camp 50 yd past its disc and every NPC outside the radius', () => {
    for (const c of CAMPS) {
      const d = Math.hypot(c.center.x - VALE_MEADOW.x, c.center.z - VALE_MEADOW.z);
      expect(d - c.radius, `${c.mobId}@${c.center.x},${c.center.z}`).toBeGreaterThanOrEqual(50);
    }
    for (const n of Object.values(NPCS)) {
      const d = Math.hypot(n.pos.x - VALE_MEADOW.x, n.pos.z - VALE_MEADOW.z);
      expect(d, n.id).toBeGreaterThan(VALE_MEADOW_RADIUS + 4);
    }
  });
});
