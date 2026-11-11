// The core world's ground must not move when the world grows. The expansion
// (src/sim/frontier/) adds land OUTSIDE the shipped zone grid, and every shipped
// terrain rule that used to read the live world bounds now reads the frozen
// CORE_WORLD bounds (src/sim/world_core_bounds.ts), so the ground every other
// crew has placed props, nodes and colliders on stays bit-identical. This pins
// a hash of terrainHeight over the whole shipped rectangle, taken on the code
// from before the expansion.
//
// The one sanctioned change inside the core rect is a tie-in neck (a land
// bridge from an old coast out to the frontier, src/sim/frontier/layout.ts
// FRONTIER_TIE_INS). Each tie-in's footprint is listed in TIE_IN_EXEMPTIONS
// below and skipped by the hash. Adding a tie-in means adding its rect here
// and re-pinning the hash on the PRE-expansion world.ts (check out that file,
// run this test, read the received hash, restore), never on the new code.
import { describe, expect, it } from 'vitest';
import { terrainHeight } from '../src/sim/world';
import { CORE_WORLD } from '../src/sim/world_core_bounds';
import { WORLD_SEED } from '../src/sim/world_seed';

const TIE_IN_EXEMPTIONS: readonly { x0: number; x1: number; z0: number; z1: number }[] = [
  // the Applewold causeway off the Farshore's Sundered Cliffs
  { x0: 330, x1: 440, z0: -180, z1: -90 },
  // the Southway off Eastbrook's south shore, east of the town
  { x0: 50, x1: 96, z0: -180, z1: -98 },
  // Eastbrook Vale v2 (src/sim/eastbrook_v2/): the Unreal design's own ground owns
  // the whole eastbrook_vale slot (it subsumes the Southway rect above), and its
  // edge band eases back to the shipped ground exactly at the slot edge, so every
  // sample outside it must still hash as before. tests/eastbrook_v2_world.test.ts
  // pins the ground inside.
  { x0: -180, x1: 180, z0: -180, z1: 180 },
];

function exempt(x: number, z: number): boolean {
  return TIE_IN_EXEMPTIONS.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
}

function hashHeights(step: number): string {
  // FNV-1a style mix over the float64 bit pattern of every sample.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const buf = new Float64Array(1);
  const bytes = new Uint8Array(buf.buffer);
  for (let z = CORE_WORLD.minZ; z < CORE_WORLD.maxZ - 1; z += step) {
    for (let x = CORE_WORLD.minX; x < CORE_WORLD.maxX - 1; x += step) {
      const sx = x + 0.37;
      const sz = z + 0.61;
      if (exempt(sx, sz)) continue;
      buf[0] = terrainHeight(sx, sz, WORLD_SEED);
      for (let i = 0; i < 8; i++) {
        h1 = Math.imul(h1 ^ bytes[i], 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ bytes[7 - i], 0x811c9dc5) >>> 0;
      }
    }
  }
  return `${h1.toString(16)}:${h2.toString(16)}`;
}

describe('core world terrain parity', () => {
  it('keeps the shipped zone grid ground bit-identical', () => {
    expect(hashHeights(9)).toBe(PINNED_CORE_HASH);
  });
});

// Measured on feature/player-housing 64d84727's world.ts, before any expansion code
// (re-measured there when the Southway's exemption was added; the new code
// gives the same hash). Re-measured with the Eastbrook Vale v2 exemption on
// feature/player-housing a968885f, the tree the v2 port branched from (before the
// design ground existed); the port's code gives the same hash, which is the proof
// that nothing outside the eastbrook_vale slot moved.
const PINNED_CORE_HASH = '8927832c:e6ba61dc';
