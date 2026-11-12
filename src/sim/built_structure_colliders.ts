// The authored structures that carry their own colliders, in one list for colliders.ts: the
// built ferry harbors (harbor_structures.ts, the built-in world or a copy of it), then the
// Mirefen tavern (mirefen_tavern.ts, the built-in world only), the Eastbrook town boxes no
// building record carries (eastbrook_town_footprints.ts, the built-in world only) and the
// Eastbrook Vale v2 design solids (eastbrook_v2/colliders.ts, the built-in world only).
// `ebv2StandDown` is the matching filter colliders.ts runs over its finished static list: it
// stands every shipped box down where the design owns the ground, so the pilot town's boxes
// only stand off the design (the harbor cove). Pure leaf, no SimContext, no rng.

import type { Collider } from './colliders';
import { eastbrookTownExtraColliders } from './eastbrook_town_footprints';
import { ebv2Colliders } from './eastbrook_v2/colliders';
import { harborStructureColliders } from './harbor_structures';
import { mirefenTavernColliders } from './mirefen_tavern';
import { groundHeight } from './world';

export { ebv2DropOwned, ebv2StandDown } from './eastbrook_v2/colliders';

export function builtStructureColliders(seed: number, builtInWorld: boolean): Collider[] {
  const harbors = harborStructureColliders(seed);
  if (!builtInWorld) return harbors;
  const groundAt = (x: number, z: number) => groundHeight(x, z, seed);
  return [
    ...harbors,
    ...mirefenTavernColliders(seed),
    ...eastbrookTownExtraColliders(groundAt),
    ...ebv2Colliders(groundAt),
  ];
}
