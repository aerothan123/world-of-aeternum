// Real open ocean, for the swim-fatigue turnback (fatigue.ts). inHollowOpenSea
// (world.ts) is a coarse band test: "far enough from every land lobe's shape
// field". That field cannot see inland water, so a pond or lake whose bed dips
// under the waterline but sits in a gap of the land field (a crater mere, a
// flooded hollow, a lagoon behind a spit) read as open sea and the
// "open sea saps your strength" warning fired a few strokes from shore.
//
// Open ocean here means all three:
// - the band test says open sea;
// - the point is not inside a declared lake footprint (border crossings are
//   already excluded by the band test's fatigue-free corridors);
// - the water is not ENCLOSED: at least one of OCEAN_RAYS compass rays runs
//   OCEAN_REACH yd over nothing but water. A pond, lake or lagoon has land in
//   every direction within that reach; the outer sea always has a way out.
//
// Pure and rng-free (reads only the content and the sea-cell memo), so all
// three hosts agree.

import { inBorderWater, inHollowOpenSea, isInWaterBody, isOpenSeaAt } from './world';

export const OCEAN_REACH = 120;
export const OCEAN_RAYS = 8;
const RAY_STEP = 6;

function isWaterAt(x: number, z: number, seed: number): boolean {
  return isOpenSeaAt(x, z, seed) || isInWaterBody(x, z);
}

/** True when some compass ray from (x, z) runs OCEAN_REACH yd over water. */
export function opensToOcean(x: number, z: number, seed: number): boolean {
  for (let k = 0; k < OCEAN_RAYS; k++) {
    const a = (k / OCEAN_RAYS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let open = true;
    for (let d = RAY_STEP; d <= OCEAN_REACH; d += RAY_STEP) {
      if (!isWaterAt(x + dx * d, z + dz * d, seed)) {
        open = false;
        break;
      }
    }
    if (open) return true;
  }
  return false;
}

/** The swim-fatigue predicate: open sea that is genuinely the open ocean. */
export function inOpenOcean(x: number, z: number, seed: number): boolean {
  if (!inHollowOpenSea(x, z)) return false;
  // a declared lake is inland water, whatever the band test says
  if (isInWaterBody(x, z) && !inBorderWater(x, z)) return false;
  return opensToOcean(x, z, seed);
}
