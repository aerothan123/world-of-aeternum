// The authored structures that carry their own colliders, in one list for colliders.ts: the
// built ferry harbors (harbor_structures.ts, the built-in world or a copy of it), then the
// Mirefen tavern (mirefen_tavern.ts, the built-in world only) and the Eastbrook town boxes no
// building record carries (eastbrook_town_footprints.ts, the built-in world only). Pure leaf,
// no SimContext, no rng.

import type { Collider } from './colliders';
import { eastbrookTownExtraColliders } from './eastbrook_town_footprints';
import { harborStructureColliders } from './harbor_structures';
import { mirefenTavernColliders } from './mirefen_tavern';
import { groundHeight } from './world';

export function builtStructureColliders(seed: number, builtInWorld: boolean): Collider[] {
  const harbors = harborStructureColliders(seed);
  if (!builtInWorld) return harbors;
  return [
    ...harbors,
    ...mirefenTavernColliders(seed),
    ...eastbrookTownExtraColliders((x, z) => groundHeight(x, z, seed)),
  ];
}
