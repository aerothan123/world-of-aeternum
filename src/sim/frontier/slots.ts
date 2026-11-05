// The region slot grid: the world as a set of named rectangles, each either
// SHIPPED (a zone that is live and frozen), OPEN (a frontier zone live in this
// build) or RESERVED (named ground held for a later chapter, still behind the
// Hushmist edge). A new zone is a data record dropped into a reserved slot:
// its ZoneDef rect must equal the slot rect, its ground comes from
// frontier/layout.ts shapes inside the slot, and nothing outside the slot
// moves (tests/world_slots.test.ts pins the tiling, and
// tests/world_core_terrain_parity.test.ts pins the shipped ground).
//
// Shipped slots are the bible's fifteen regions as they stand; their rects are
// irregular (the old strip grew row by row), so the shipped slots are listed
// rect for rect. Frontier slots sit on a regular 360yd lattice around them
// (SLOT_SIZE), so every later chapter tiles cleanly.
//
// The chapter column is the planned opening order, not a promise: owner and
// story decide when a reserved slot opens. Connectors are the named points a
// new slot's road network attaches to (a road end, a causeway foot, a pass);
// a later slot links to an earlier one only through a declared connector.

export const SLOT_SIZE = 360;

/** The edge phenomenon past the open slots (owner decision). Dev reference
 *  only: player-facing text must ship as an English t() key, never this
 *  literal. See docs/design/world-expansion-framework.md. */
export const FRONTIER_EDGE_NAME = 'the Hushmist';

export type SlotStatus = 'shipped' | 'open' | 'reserved';

export interface WorldSlot {
  id: string;
  /** The zone id living in the slot (shipped/open), or the planned id. */
  zoneId: string;
  status: SlotStatus;
  /** 0 = the shipped world; 1+ = the chapter that opens it. */
  chapter: number;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  /** The level band the slot is designed for. */
  levels: readonly [number, number];
}

export interface SlotConnector {
  id: string;
  /** The slots this connector joins (road, causeway, pass or ferry). */
  slots: readonly [string, string];
  kind: 'road' | 'causeway' | 'pass' | 'ferry' | 'portal';
  x: number;
  z: number;
}

const shipped = (
  zoneId: string,
  xMin: number,
  xMax: number,
  zMin: number,
  zMax: number,
  levels: readonly [number, number],
): WorldSlot => ({
  id: zoneId,
  zoneId,
  status: 'shipped',
  chapter: 0,
  xMin,
  xMax,
  zMin,
  zMax,
  levels,
});

const lattice = (
  id: string,
  status: SlotStatus,
  chapter: number,
  col: number,
  row: number,
  levels: readonly [number, number],
  span: { cols?: number; rows?: number } = {},
): WorldSlot => ({
  id,
  zoneId: id,
  status,
  chapter,
  // col 0 is x -180..180 (the old strip); row 0 is z -180..180 (Eastbrook's row)
  xMin: -180 + col * SLOT_SIZE,
  xMax: -180 + (col + (span.cols ?? 1)) * SLOT_SIZE,
  zMin: -180 + row * SLOT_SIZE,
  zMax: -180 + (row + (span.rows ?? 1)) * SLOT_SIZE,
  levels,
});

export const WORLD_SLOTS: readonly WorldSlot[] = [
  // chapter 0: the shipped world (frozen)
  shipped('eastbrook_vale', -180, 180, -180, 180, [1, 7]),
  shipped('mirefen_marsh', -180, 180, 180, 540, [6, 13]),
  shipped('thornpeak_heights', -180, 180, 540, 900, [13, 20]),
  shipped('veiled_hollow', -180, 180, 900, 1440, [15, 20]),
  shipped('frostveil', -180, 180, 1440, 1960, [17, 20]),
  shipped('farshore_isle', 180, 540, -180, 180, [3, 7]),
  shipped('galecrest', 180, 540, 180, 700, [20, 20]),
  shipped('evergarden', 180, 540, 700, 1260, [20, 20]),
  shipped('wraithwood', 180, 540, 1260, 1820, [20, 20]),
  shipped('drakelands', 180, 540, 1820, 2420, [16, 20]),
  shipped('proving_shore', -540, -180, -180, 180, [1, 2]),
  shipped('willowfen', -540, -180, 180, 700, [19, 20]),
  shipped('palmreach', -540, -180, 700, 1260, [20, 20]),
  shipped('nightbloom', -540, -180, 1260, 1820, [20, 20]),
  shipped('amberfall', -540, -180, 1820, 2380, [18, 20]),
  // chapter 1 (this build): the Southern Reaches, the first frontier row
  lattice('applewold', 'open', 1, 1, -1, [6, 9]),
  lattice('kindlemoor', 'open', 1, 0, -1, [8, 11]),
  lattice('chalkbarrow_coast', 'open', 1, -1, -1, [10, 13]),
  // reserved: the deep south row (an alternative 11 to 15 road)
  lattice('south_row_east', 'reserved', 2, 1, -2, [11, 13]),
  lattice('south_row_mid', 'reserved', 2, 0, -2, [12, 14]),
  lattice('south_row_west', 'reserved', 2, -1, -2, [13, 15]),
  // reserved: the west march, two lattice columns wide, branching 15 to 20
  lattice('west_march_south', 'reserved', 3, -3, -2, [14, 16], { cols: 2, rows: 2 }),
  lattice('west_march_downs', 'reserved', 3, -3, 0, [16, 18], { cols: 2, rows: 2 }),
  lattice('west_march_fens', 'reserved', 4, -3, 2, [17, 19], { cols: 2, rows: 2 }),
  lattice('west_march_heights', 'reserved', 4, -3, 4, [18, 20], { cols: 2, rows: 2 }),
  lattice('west_march_rime', 'reserved', 5, -3, 6, [20, 20], { cols: 2, rows: 2 }),
  // reserved: the east march past x 540. Blocked until the save rule changes:
  // data.ts migrateLegacyInstancePos reads ANY saved x in 600..99400 as a
  // pre-move instance position and sends it to a dungeon door, so a character
  // saved out here would be teleported away on login. The fix is a save epoch
  // stamp (docs/design/world-expansion-framework.md, "Save positions").
  lattice('east_march_south', 'reserved', 5, 2, -2, [15, 17], { cols: 2, rows: 2 }),
  lattice('east_march_isles', 'reserved', 6, 2, 0, [20, 20], { cols: 2, rows: 2 }),
];

export const SLOT_CONNECTORS: readonly SlotConnector[] = [
  // the Applewold causeway off the Farshore's south point
  {
    id: 'applewold_causeway',
    slots: ['farshore_isle', 'applewold'],
    kind: 'causeway',
    x: 380,
    z: -160,
  },
  // the heath ways joining the Southern Reaches by land
  { id: 'heath_way_east', slots: ['applewold', 'kindlemoor'], kind: 'road', x: 180, z: -372 },
  {
    id: 'heath_way_west',
    slots: ['kindlemoor', 'chalkbarrow_coast'],
    kind: 'road',
    x: -180,
    z: -395,
  },
];

/** The slot holding a point, or undefined (open sea past every slot). */
export function slotAt(x: number, z: number): WorldSlot | undefined {
  return WORLD_SLOTS.find((s) => x >= s.xMin && x < s.xMax && z >= s.zMin && z < s.zMax);
}
