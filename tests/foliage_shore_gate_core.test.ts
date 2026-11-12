// The foliage passes' water-gated shore skip (src/render/foliage_shore_gate_core.ts):
// underwater anchors always skip, band-height anchors skip only near real
// water. The repro that motivated it is the Wolf Run basin (owner refinement
// round 4): dry vale ground at h about -3.05 sat inside the height-only beach
// band and lost its grass and flowers along with its green paint.
import { describe, expect, it } from 'vitest';
import { foliageShoreSkip } from '../src/render/foliage_shore_gate_core';
import { SHORE_BAND_HEIGHT } from '../src/render/shore_water_gate_core';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

describe('foliageShoreSkip', () => {
  it('always skips underwater anchors, never dry ground above the band', () => {
    expect(foliageShoreSkip(0, 0, WATER_LEVEL - 0.5, WORLD_SEED)).toBe(true);
    expect(foliageShoreSkip(0, 0, WATER_LEVEL + SHORE_BAND_HEIGHT, WORLD_SEED)).toBe(false);
    expect(foliageShoreSkip(0, 0, WATER_LEVEL + 5, WORLD_SEED)).toBe(false);
  });

  it('lets an inland basin grow: in-band height, but no water nearby', () => {
    // Was the Wolf Run basin at (0,-16)..(24,0). Eastbrook Vale v2 lifted that
    // ground out of the beach band and every in-band vale cell on the design
    // now lies by water, so the same rule is pinned on the Chalkbarrow Coast's
    // low inland plain: in-band, dry, and far from any water.
    for (const [x, z] of [
      [-390, -516],
      [-384, -522],
      [-396, -510],
    ] as const) {
      const h = terrainHeight(x, z, WORLD_SEED);
      expect(h, `(${x},${z}) should sit inside the beach band`).toBeGreaterThan(WATER_LEVEL);
      expect(h).toBeLessThan(WATER_LEVEL + SHORE_BAND_HEIGHT);
      expect(foliageShoreSkip(x, z, h, WORLD_SEED)).toBe(false);
    }
  });

  it("keeps the town's south strand and the lake rim bare", () => {
    // Eastbrook Vale v2: the town's south strand runs along z -170 below the
    // south gate (the old strand at (-14,-136) is inside the walled town now),
    // and the old harbor cove rim (-99,-37) is mill ground; the Mirror Lake
    // west rim stands in for it as the in-band rim beside water.
    for (const [x, z] of [
      [-14, -170],
      [-128, 90],
    ] as const) {
      const h = terrainHeight(x, z, WORLD_SEED);
      expect(h, `(${x},${z}) should sit inside the beach band`).toBeGreaterThan(WATER_LEVEL);
      expect(h).toBeLessThan(WATER_LEVEL + SHORE_BAND_HEIGHT);
      expect(foliageShoreSkip(x, z, h, WORLD_SEED)).toBe(true);
    }
  });
});
