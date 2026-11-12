// A house lot on the Eastbrook Vale v2 design: the design building whose front
// door the lot is. The design exports each lot house's front door as a
// `lot_door` point (layout.generated.ts EBV2_POINTS); the building behind it has
// no id of its own in the export, so the door point names it. A lot keyed this
// way reads its door from the design, so a re-import moves the lot with its
// house, and a dropped or renamed door fails at module load (points.ts).
// Pure leaf: no rng, no clock.

import { ebv2Point } from './points';

/** The prefix a design building id carries in HouseLotDef.buildingId. */
export const EBV2_LOT_BUILDING_PREFIX = 'ebv2:';

/** A design building, named by the `lot_door` point at its front door. */
export interface Ebv2LotBuildingRef {
  readonly doorPointId: string;
}

/** The building id a lot on design building `ref` carries (`ebv2:<door point>`). */
export function ebv2LotBuildingId(ref: Ebv2LotBuildingRef): string {
  return `${EBV2_LOT_BUILDING_PREFIX}${ref.doorPointId}`;
}

/** The door point id behind a design building id, or undefined for any other id. */
export function ebv2LotDoorPointOf(buildingId: string): string | undefined {
  return buildingId.startsWith(EBV2_LOT_BUILDING_PREFIX)
    ? buildingId.slice(EBV2_LOT_BUILDING_PREFIX.length)
    : undefined;
}

/** The front door of design building `ref`; throws when the point is not a lot door. */
export function ebv2LotDoor(ref: Ebv2LotBuildingRef): { x: number; z: number } {
  const p = ebv2Point(ref.doorPointId);
  if (p.kind !== 'lot_door') {
    throw new Error(`Eastbrook v2: point '${ref.doorPointId}' is a ${p.kind}, not a lot door`);
  }
  return { x: p.x, z: p.z };
}
