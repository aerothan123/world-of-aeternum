// The Eastbrook town footprints: what stands solid in the town the Early Access (Unreal) client
// draws, so the server blocks exactly where a wall is seen and nowhere else. The client stands
// an assembled cottage-style building on each town building's anchor (not the painted Tidehold
// model, whose walls and open doorway were larger), so each of those records collides on the
// boxes below instead of its own footprint or baked walls, the town kit pieces it redraws
// (the counting house) do the same (the kit house lots are retired with the old
// town: the lots stand on the v2 design's houses), and the open pieces (the
// stable, the market canopy, the yard lamps) stand down with no box at all. Rows with no
// `replaces` are pieces only the client adds (a cottage on the main street, the watchtower, the
// windmill, a market stall, the gate arches).
//
// The table is data: it is written from the client's town plan (the Unreal repo's
// Scripts/pilot/town_plan.py through town_export.py), where a test pins the two copies against
// each other. Positions are world yards; `rot` is the building-collider yaw (rotY); `h` is the
// height above its own ground (the camera's top).
//
// Consumers: authored_town_buildings.ts (a town building record at its layout anchor),
// decor_prop_colliders.ts (a town kit row stands down), built_structure_colliders.ts (the kit
// replacements and the new pieces, the built-in world only). Pure leaf: no rng, no clock.

import type { Collider } from './collider_shapes';
import { EASTBROOK_LAYOUT } from './eastbrook_layout';

export interface TownFootprint {
  readonly id: string;
  /** `building:<record id>` or `kit:<town kit id>` this box stands in for, or null (new). */
  readonly replaces: string | null;
  readonly x: number;
  readonly z: number;
  readonly hw: number;
  readonly hd: number;
  readonly rot: number;
  readonly h: number;
}

export const EASTBROOK_TOWN_FOOTPRINTS: readonly TownFootprint[] = [
  {
    id: 'inn:0',
    replaces: 'building:eastbrook_inn',
    x: -33.54,
    z: -64.13,
    hw: 9.1,
    hd: 1.6,
    rot: 0.4193,
    h: 12.4,
  },
  {
    id: 'inn:1',
    replaces: 'building:eastbrook_inn',
    x: -27.56,
    z: -61.76,
    hw: 4.6,
    hd: 3,
    rot: 0.4193,
    h: 12.4,
  },
  {
    id: 'inn:2',
    replaces: 'building:eastbrook_inn',
    x: -22.03,
    z: -64.33,
    hw: 1.5,
    hd: 3.1,
    rot: 0.4193,
    h: 12.4,
  },
  {
    id: 'inn:3',
    replaces: 'building:eastbrook_inn',
    x: -27.1,
    z: -57.04,
    hw: 3.1,
    hd: 1.5,
    rot: 0.4193,
    h: 12.4,
  },
  {
    id: 'bank:0',
    replaces: 'building:eastbrook_bank',
    x: -57.75,
    z: -116.21,
    hw: 9.1,
    hd: 3.1,
    rot: -2.3562,
    h: 12.4,
  },
  {
    id: 'bank:1',
    replaces: 'building:eastbrook_bank',
    x: -65.24,
    z: -117.34,
    hw: 4.6,
    hd: 3,
    rot: -2.3562,
    h: 12.4,
  },
  {
    id: 'bank:2',
    replaces: 'building:eastbrook_bank',
    x: -69.48,
    z: -112.96,
    hw: 1.5,
    hd: 3.1,
    rot: -2.3562,
    h: 12.4,
  },
  {
    id: 'bank:3',
    replaces: 'building:eastbrook_bank',
    x: -67.36,
    z: -121.58,
    hw: 3.1,
    hd: 1.5,
    rot: -2.3562,
    h: 12.4,
  },
  {
    id: 'smithy:0',
    replaces: 'building:eastbrook_smithy',
    x: -2.62,
    z: -73.32,
    hw: 6.1,
    hd: 3.1,
    rot: 3.6908,
    h: 6.4,
  },
  {
    id: 'smithy:1',
    replaces: 'building:eastbrook_smithy',
    x: -7.58,
    z: -75.68,
    hw: 3.1,
    hd: 1.5,
    rot: 3.6908,
    h: 6.4,
  },
  {
    id: 'chapel:0',
    replaces: 'building:eastbrook_chapel',
    x: 33.1,
    z: -123.1,
    hw: 9.1,
    hd: 3.2,
    rot: -2.5311,
    h: 9.4,
  },
  {
    id: 'apothecary:0',
    replaces: 'building:eastbrook_apothecary',
    x: -30.4,
    z: -126.92,
    hw: 6.1,
    hd: 2.6,
    rot: 0.1915,
    h: 9.4,
  },
  {
    id: 'apothecary:1',
    replaces: 'building:eastbrook_apothecary',
    x: -29.71,
    z: -131.23,
    hw: 4.6,
    hd: 1.5,
    rot: 0.1915,
    h: 9.4,
  },
  {
    id: 'apothecary:2',
    replaces: 'building:eastbrook_apothecary',
    x: -34.33,
    z: -123,
    hw: 1.5,
    hd: 0.5,
    rot: 0.1915,
    h: 9.4,
  },
  {
    id: 'apothecary:3',
    replaces: 'building:eastbrook_apothecary',
    x: -25.29,
    z: -124.75,
    hw: 1.5,
    hd: 0.5,
    rot: 0.1915,
    h: 9.4,
  },
  {
    id: 'quay_cottage:0',
    replaces: 'building:eastbrook_quay_cottage',
    x: -64.72,
    z: -52.6,
    hw: 4.6,
    hd: 1.55,
    rot: 0.8027,
    h: 6.4,
  },
  {
    id: 'quay_cottage:1',
    replaces: 'building:eastbrook_quay_cottage',
    x: -61.45,
    z: -51.52,
    hw: 3.1,
    hd: 1.55,
    rot: 0.8027,
    h: 6.4,
  },
  {
    id: 'vault:0',
    replaces: 'building:eastbrook_weekly_vault',
    x: -69.56,
    z: -103.47,
    hw: 3.1,
    hd: 4.6,
    rot: -0.7854,
    h: 6.4,
  },
  {
    id: 'vault:1',
    replaces: 'building:eastbrook_weekly_vault',
    x: -73.87,
    z: -105.67,
    hw: 1.5,
    hd: 3.1,
    rot: -0.7854,
    h: 6.4,
  },
  {
    id: 'counting_house:0',
    replaces: 'kit:kit_storage_shed',
    x: -40.1,
    z: -108.8,
    hw: 3.1,
    hd: 3.1,
    rot: 0,
    h: 7.4,
  },
  {
    id: 'street_cottage:0',
    replaces: null,
    x: -57.6,
    z: -99.2,
    hw: 3.1,
    hd: 3.1,
    rot: 2.2643,
    h: 7.4,
  },
  { id: 'watchtower', replaces: null, x: 10.4, z: -56.6, hw: 1.75, hd: 1.75, rot: -0.2967, h: 8.5 },
  { id: 'windmill', replaces: null, x: 36.4, z: -63.6, hw: 3.1, hd: 3.1, rot: -3.4907, h: 10.8 },
  { id: 'yard_lamp_north', replaces: null, x: -5.5, z: -106.5, hw: 0.3, hd: 0.3, rot: 0, h: 2.6 },
  {
    id: 'market_row_stall_east',
    replaces: null,
    x: -23.6,
    z: -108,
    hw: 1.4,
    hd: 1.1,
    rot: 0,
    h: 2.7,
  },
  {
    id: 'north_gate:leg0',
    replaces: null,
    x: -2.78,
    z: -53.93,
    hw: 0.7,
    hd: 0.72,
    rot: 0.3006,
    h: 4.2,
  },
  {
    id: 'north_gate:leg1',
    replaces: null,
    x: 2.18,
    z: -55.47,
    hw: 0.7,
    hd: 0.72,
    rot: 0.3006,
    h: 4.2,
  },
  {
    id: 'harbour_gate:leg0',
    replaces: null,
    x: -87.24,
    z: -63.22,
    hw: 0.7,
    hd: 0.72,
    rot: -0.8895,
    h: 4.2,
  },
  {
    id: 'harbour_gate:leg1',
    replaces: null,
    x: -83.96,
    z: -59.18,
    hw: 0.7,
    hd: 0.72,
    rot: -0.8895,
    h: 4.2,
  },
];

/** Server collider owners the town retires with no box of its own (open, walk-through pieces). */
export const EASTBROOK_TOWN_RETIRED: readonly string[] = [
  'kit:kit_stable',
  'kit:kit_trading_post',
  'kit:kit_yard_lamp_north',
  'kit:kit_yard_lamp_south',
];

const EPSILON = 1e-6;
const BUILDING = 'building:';
const KIT = 'kit:';

const BY_OWNER: ReadonlyMap<string, readonly TownFootprint[]> = (() => {
  const map = new Map<string, TownFootprint[]>();
  for (const owner of EASTBROOK_TOWN_RETIRED) map.set(owner, []);
  for (const box of EASTBROOK_TOWN_FOOTPRINTS) {
    if (box.replaces === null) continue;
    const list = map.get(box.replaces);
    if (list) list.push(box);
    else map.set(box.replaces, [box]);
  }
  return map;
})();

/** Where each replaced building record stands in the layout: a record a custom world moved or
 *  turned keeps its own collider (the boxes are authored round the layout anchor). */
const RECORD_ANCHORS: ReadonlyMap<string, { x: number; z: number; rot: number }> = new Map([
  ...EASTBROOK_LAYOUT.buildings.map(
    (building) =>
      [
        building.id,
        { x: building.position.x, z: building.position.z, rot: building.rotation },
      ] as const,
  ),
  [
    EASTBROOK_LAYOUT.weeklyVault.id,
    {
      x: EASTBROOK_LAYOUT.weeklyVault.x,
      z: EASTBROOK_LAYOUT.weeklyVault.z,
      rot: EASTBROOK_LAYOUT.weeklyVault.rot,
    },
  ] as const,
]);

function rowKey(propKey: string, x: number, z: number): string {
  return `${propKey}|${x}|${z}`;
}

const RETIRED_KIT_ROWS: ReadonlySet<string> = new Set(
  EASTBROOK_LAYOUT.townKit
    .filter((kit) => BY_OWNER.has(`${KIT}${kit.id}`))
    .map((kit) => rowKey(kit.propKey, kit.position.x, kit.position.z)),
);

/**
 * The boxes a town building record collides on in place of its own footprint, or null when the
 * record is not one the town redraws (or no longer stands at its layout anchor).
 */
export function eastbrookTownRecordBoxes(record: {
  id?: string;
  x: number;
  z: number;
  rot: number;
}): readonly TownFootprint[] | null {
  if (record.id === undefined) return null;
  const boxes = BY_OWNER.get(`${BUILDING}${record.id}`);
  const anchor = RECORD_ANCHORS.get(record.id);
  if (!boxes || !anchor) return null;
  const moved =
    Math.abs(anchor.x - record.x) > EPSILON ||
    Math.abs(anchor.z - record.z) > EPSILON ||
    Math.abs(anchor.rot - record.rot) > EPSILON;
  return moved ? null : boxes;
}

/** True when a decor row is a town kit piece the town redraws or retires: its own box stands
 *  down (the replacement, if any, is in eastbrookTownExtraColliders). */
export function eastbrookTownRetiresDecorRow(propKey: string, x: number, z: number): boolean {
  return RETIRED_KIT_ROWS.has(rowKey(propKey, x, z));
}

/** One full-height box on its own ground. */
export function townFootprintCollider(
  box: TownFootprint,
  groundAt: (x: number, z: number) => number,
): Collider {
  const ground = groundAt(box.x, box.z);
  return {
    type: 'obb',
    x: box.x,
    z: box.z,
    hw: box.hw,
    hd: box.hd,
    rot: box.rot,
    cameraTopY: ground + box.h,
    underY: ground,
  };
}

/** The boxes no building record carries: the town kit replacements and the new pieces. */
export function eastbrookTownExtraColliders(
  groundAt: (x: number, z: number) => number,
): Collider[] {
  return EASTBROOK_TOWN_FOOTPRINTS.filter(
    (box) => box.replaces === null || box.replaces.startsWith(KIT),
  ).map((box) => townFootprintCollider(box, groundAt));
}
