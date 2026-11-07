// Cell-cached rock index for the Refined grass collar (see
// `rock_grass_clear_core.ts`). Grass chunk builds ask about many thousands of
// blade positions, so rocks are pulled from the sim's own deterministic
// decoration field one 32 yd cell at a time (`generateDecorationsInBounds`,
// the same records the colliders and the rock renderer read) and memoized.
// The cache is bounded: it resets past ROCK_GRASS_CACHE_MAX cells.

import { ROCK_LANDMARK_SCALE } from '../sim/decoration_dims';
import { generateDecorationsInBounds } from '../sim/world';
import {
  type RockGrassDisc,
  rockGrassBlocked,
  rockGrassDisc,
  rockGrassMaxReach,
} from './rock_grass_clear_core';

const CELL = 32;
const ROCK_GRASS_CACHE_MAX = 4096;
const REACH = rockGrassMaxReach(ROCK_LANDMARK_SCALE[0] + ROCK_LANDMARK_SCALE[1]);

let cacheSeed = Number.NaN;
const cache = new Map<number, RockGrassDisc[]>();

function cellDiscs(seed: number, cx: number, cz: number): RockGrassDisc[] {
  if (seed !== cacheSeed) {
    cache.clear();
    cacheSeed = seed;
  }
  const key = (cx + 32768) * 65536 + (cz + 32768);
  let discs = cache.get(key);
  if (discs) return discs;
  if (cache.size >= ROCK_GRASS_CACHE_MAX) cache.clear();
  const minX = cx * CELL - REACH;
  const minZ = cz * CELL - REACH;
  const decos = generateDecorationsInBounds(seed, {
    minX,
    maxX: minX + CELL + 2 * REACH,
    minZ,
    maxZ: minZ + CELL + 2 * REACH,
  });
  discs = [];
  for (const d of decos) if (d.kind === 'rock') discs.push(rockGrassDisc(d.x, d.z, d.scale));
  cache.set(key, discs);
  return discs;
}

/** Whether the Refined rock collar clears a grass blade at (x, z). */
export function rockGrassClearAt(seed: number, x: number, z: number): boolean {
  const discs = cellDiscs(seed, Math.floor(x / CELL), Math.floor(z / CELL));
  return discs.length > 0 && rockGrassBlocked(discs, x, z);
}

/** Test seam: drop every cached cell. */
export function resetRockGrassClearCache(): void {
  cache.clear();
  cacheSeed = Number.NaN;
}
