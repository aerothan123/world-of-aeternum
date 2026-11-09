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

// Slots, like frontier/layout.ts, are in the AUTHORED frame: the frontier
// spread (./spread.ts) maps every frontier slot outward with its zone, so the
// lattice still tiles cleanly in the authored frame.
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
  // chapter 1, the launch frontier (live in this build). The Southern Reaches
  // row (6 to 13), the Low Reaches row (11 to 15, run east to west) and the
  // West March column (14 to 20, run south to north): the second road
  // through the top band beside Thornpeak and the Veiled Hollow.
  lattice('applewold', 'open', 1, 1, -1, [6, 9]),
  lattice('kindlemoor', 'open', 1, 0, -1, [8, 11]),
  lattice('chalkbarrow_coast', 'open', 1, -1, -1, [10, 13]),
  lattice('saltmeads', 'open', 1, 1, -2, [11, 13]),
  lattice('wychwold', 'open', 1, 0, -2, [12, 14]),
  lattice('tinmarch', 'open', 1, -1, -2, [13, 15]),
  lattice('rookcliffs', 'open', 1, -2, -2, [14, 16]),
  lattice('sedgemarch', 'open', 1, -2, -1, [16, 18]),
  lattice('harrowfells', 'open', 1, -2, 0, [17, 19]),
  lattice('wardmere', 'open', 1, -2, 1, [18, 20]),
  // reserved: the Hushmist rings, one per post-launch chapter
  // (docs/design/wyndlewood-chapter-roadmap.md section 6). Levels follow the
  // cap raise of 5 per chapter. Every ring sits on the lattice past the launch
  // edge, so opening one is a gate flip plus its zone content, never a
  // re-layout of the launch map.
  // Chapter Eight: past the Galecrest (the forge complex's far side)
  lattice('hushmist_galecrest', 'reserved', 8, 2, 1, [20, 25], { rows: 2 }),
  // Chapter Nine: past the Palmreach and past the Wraithwood
  lattice('hushmist_palmreach', 'reserved', 9, -2, 2, [25, 30], { rows: 2 }),
  lattice('hushmist_wraithwood', 'reserved', 9, 2, 4, [25, 30], { rows: 2 }),
  // Chapter Ten: past the Evergarden and past the Nightbloom, with the first
  // guild town sites on the far west shore
  lattice('hushmist_evergarden', 'reserved', 10, 2, 3, [30, 35]),
  lattice('hushmist_nightbloom', 'reserved', 10, -2, 4, [30, 35], { rows: 2 }),
  lattice('guild_sites_west', 'reserved', 10, -3, 0, [30, 35], { rows: 2 }),
  // unassigned ground held behind the mist for later chapters: the east reach
  // past the Farshore and the Saltmeads (open since the save-position epoch,
  // data.ts SAVE_POS_EPOCH, made east-of-600 saves literal), and the deep
  // south row past the Low Reaches
  lattice('east_reach', 'reserved', 11, 2, -2, [35, 40], { rows: 3 }),
  lattice('deep_south_row', 'reserved', 11, -2, -3, [35, 40], { cols: 4 }),
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
  // the Southway off Eastbrook's south shore to the Kindlemoor (the road link
  // that lets the Mirefen road reach the Southern Reaches without the ferry)
  { id: 'southway', slots: ['eastbrook_vale', 'kindlemoor'], kind: 'causeway', x: 72, z: -190 },
  // the Low Reaches: in from the Applewold and down from the Chalkbarrow Coast
  { id: 'saltmeads_gate', slots: ['applewold', 'saltmeads'], kind: 'causeway', x: 332, z: -560 },
  { id: 'chalk_pass', slots: ['chalkbarrow_coast', 'tinmarch'], kind: 'pass', x: -236, z: -545 },
  { id: 'salt_way', slots: ['saltmeads', 'wychwold'], kind: 'road', x: 184, z: -726 },
  { id: 'tinners_ford', slots: ['wychwold', 'tinmarch'], kind: 'road', x: -184, z: -720 },
  // the West March, south to north
  { id: 'rook_ford', slots: ['tinmarch', 'rookcliffs'], kind: 'road', x: -548, z: -738 },
  { id: 'sedge_neck', slots: ['rookcliffs', 'sedgemarch'], kind: 'road', x: -722, z: -542 },
  { id: 'fell_neck', slots: ['sedgemarch', 'harrowfells'], kind: 'road', x: -740, z: -182 },
  { id: 'ward_neck', slots: ['harrowfells', 'wardmere'], kind: 'road', x: -748, z: 178 },
  // planned: a stop for the Willowfen ferry lane at the Westering Pier (the
  // March's link to the west realms; sim piece for the systems crew)
  { id: 'westering_pier', slots: ['wardmere', 'willowfen'], kind: 'ferry', x: -676, z: 300 },
];

/** The slot holding a point, or undefined (open sea past every slot). */
export function slotAt(x: number, z: number): WorldSlot | undefined {
  return WORLD_SLOTS.find((s) => x >= s.xMin && x < s.xMax && z >= s.zMin && z < s.zMax);
}
