// Scatter clearance for Eastbrook's town kit (docs/design/town-layout-eastbrook.md,
// section 10): no scatter tree, bush or rock grows within EASTBROOK_TOWN_KIT_SCATTER_PAD
// of a kit piece's reach, so no trunk stands against a house front, in a bench aisle
// or through an awning. decoration_exclusions.ts consumes it for the built-in world;
// pure and deterministic, so collision and rendering agree.
// Two more clear grounds ride the same check: the dooryard in front of every
// kit house (a choppable scatter tree stood square before the row terrace's
// doors) and the quay's practice dummies, where a tree stood among the dummies
// a new character first swings at.
import { HUB_HEALING_DUMMY_POS, HUB_TRAINING_DUMMY_POS } from './content/practice_dummies';
import { distancePointToObb, EASTBROOK_LAYOUT, type Obb2 } from './eastbrook_layout';

/** How far scatter keeps off a kit piece's reach. */
export const EASTBROOK_TOWN_KIT_SCATTER_PAD = 2.5;
/** How far scatter keeps off a kit house's front standing point (its dooryard). */
export const EASTBROOK_HOUSE_DOORYARD_RADIUS = 6;
/** How far scatter keeps off each quay practice dummy. */
export const EASTBROOK_DUMMY_CLEAR_RADIUS = 5;

/** Round clear grounds: house dooryards and the quay dummies. */
const CLEAR_DISCS: readonly { x: number; z: number; r: number }[] = [
  ...EASTBROOK_LAYOUT.townKit
    .filter((kit) => kit.role === 'house')
    .map((kit) => ({
      x: kit.frontStandingPoint.x,
      z: kit.frontStandingPoint.z,
      r: EASTBROOK_HOUSE_DOORYARD_RADIUS,
    })),
  { ...HUB_TRAINING_DUMMY_POS, r: EASTBROOK_DUMMY_CLEAR_RADIUS },
  { ...HUB_HEALING_DUMMY_POS, r: EASTBROOK_DUMMY_CLEAR_RADIUS },
];

const REACHES: readonly Obb2[] = EASTBROOK_LAYOUT.townKit.map((kit) => kit.reach);

/** One circle round every reach, so a point far from town costs one test. */
const BOUND = (() => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const reach of REACHES) {
    const r = Math.hypot(reach.halfWidth, reach.halfDepth);
    minX = Math.min(minX, reach.center.x - r);
    maxX = Math.max(maxX, reach.center.x + r);
    minZ = Math.min(minZ, reach.center.z - r);
    maxZ = Math.max(maxZ, reach.center.z + r);
  }
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  return { x, z, radius: Math.hypot(maxX - x, maxZ - z) };
})();

/** Whether (x, z) lies within `pad` yards of a town kit piece's reach. */
export function eastbrookTownKitCovers(
  x: number,
  z: number,
  pad: number = EASTBROOK_TOWN_KIT_SCATTER_PAD,
): boolean {
  for (const disc of CLEAR_DISCS) {
    if (Math.hypot(x - disc.x, z - disc.z) < disc.r) return true;
  }
  if (Math.hypot(x - BOUND.x, z - BOUND.z) > BOUND.radius + pad) return false;
  const point = { x, z };
  for (const reach of REACHES) {
    if (distancePointToObb(point, reach) < pad) return true;
  }
  return false;
}
