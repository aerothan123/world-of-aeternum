// The Southern Reaches: the first frontier row of the world expansion, three
// zone cells south of the Proving Shore, Eastbrook Vale and the Farshore
// (z -540..-180), shaped by src/sim/frontier/ (terrain + layout) and walked
// into across the Applewold causeway off the Farshore's south point. No
// loading screen, no portal: the row is ordinary streamed overworld.
//
//   The Applewold (6 to 9): orchard downs and cider country, the Hearthwright
//     Compact's press-town of Pressford and a Lanternwarden post at the
//     causeway head.
//   The Kindlemoor (8 to 11): open heath over Age of First Hearths stones,
//     kept by the Bracken Circle from the camp at Ferncross.
//   The Chalkbarrow Coast (10 to 13): chalk downs and white cliffs, where the
//     Gilt Measure's prospectors at Coinwell Camp dig beside something far
//     worse: a Pale Accord cell working the Unlit Dig.
//
// The row fills the 6 to 13 band beside Mirefen Marsh, so a player leaving
// Eastbrook can take the north road or the south one. Its creatures reuse
// shipped rigs and templates at camp-level ranges (CampDef.levelMin/Max); the
// quests that will live here belong to the story crew.
//
// Append-only rule: these zones, camps and props are merged LAST in data.ts
// (rng-stream stability, and positional poi locale rows), so add new entries
// at the end of each list, never in the middle.

import { FRONTIER_ANCHORS as A, FRONTIER_LAKES } from '../../frontier/layout';
import type { CampDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';

const lake = (i: number) => ({ ...FRONTIER_LAKES[i] });

export const APPLEWOLD_ZONE: ZoneDef = {
  id: 'applewold',
  name: 'The Applewold',
  openBorders: true,
  zMin: -540,
  zMax: -180,
  xMin: 180,
  xMax: 540,
  levelRange: [6, 9],
  biome: 'vale',
  hub: { x: A.pressford.x, z: A.pressford.z, radius: 16, name: 'Pressford' },
  graveyard: { x: A.pressfordYard.x, z: A.pressfordYard.z },
  lakes: [lake(0)],
  pois: [
    { x: A.pressford.x, z: A.pressford.z, label: 'Pressford', id: 'pressford' },
    { x: A.wardenPost.x, z: A.wardenPost.z, label: 'Causeway Watch', id: 'causeway_watch' },
    { x: A.ciderMere.x, z: A.ciderMere.z, label: 'The Cider Mere', id: 'the_cider_mere' },
    { x: A.blossomRise.x, z: A.blossomRise.z, label: 'Blossom Rise', id: 'blossom_rise' },
    { x: A.oldPressRuin.x, z: A.oldPressRuin.z, label: 'The Old Press', id: 'the_old_press' },
    { x: A.southDowns.x, z: A.southDowns.z, label: 'The South Downs', id: 'the_south_downs' },
  ],
  welcome:
    'The causeway ends in apple country. Pressford keeps the presses turning and the Lanternwardens keep the road, but the orchards have gone strange, and the boars have stopped fearing the dogs.',
};

export const KINDLEMOOR_ZONE: ZoneDef = {
  id: 'kindlemoor',
  name: 'The Kindlemoor',
  openBorders: true,
  zMin: -540,
  zMax: -180,
  xMin: -180,
  xMax: 180,
  levelRange: [8, 11],
  biome: 'gale',
  hub: { x: A.ferncross.x, z: A.ferncross.z, radius: 14, name: 'Ferncross' },
  graveyard: { x: A.ferncrossYard.x, z: A.ferncrossYard.z },
  lakes: [lake(1)],
  pois: [
    { x: A.ferncross.x, z: A.ferncross.z, label: 'Ferncross', id: 'ferncross' },
    {
      x: A.firstHearthRing.x,
      z: A.firstHearthRing.z,
      label: 'The First Hearth Ring',
      id: 'the_first_hearth_ring',
    },
    { x: A.moorTarn.x, z: A.moorTarn.z, label: 'The Moor Tarn', id: 'the_moor_tarn' },
    { x: A.greyTor.x, z: A.greyTor.z, label: 'The Grey Tor', id: 'the_grey_tor' },
    { x: A.heathWay.x, z: A.heathWay.z, label: 'The Heath Way', id: 'the_heath_way' },
  ],
  welcome:
    'Nothing grows tall on the Kindlemoor, and nothing here is new. The Bracken Circle keeps watch over stones that were old when the first kingdom was young, and lately the stones have been warm to the touch.',
};

export const CHALKBARROW_ZONE: ZoneDef = {
  id: 'chalkbarrow_coast',
  name: 'The Chalkbarrow Coast',
  openBorders: true,
  zMin: -540,
  zMax: -180,
  xMin: -540,
  xMax: -180,
  levelRange: [10, 13],
  biome: 'gale',
  hub: { x: A.coinwell.x, z: A.coinwell.z, radius: 14, name: 'Coinwell Camp' },
  graveyard: { x: A.coinwellYard.x, z: A.coinwellYard.z },
  lakes: [lake(2)],
  pois: [
    { x: A.coinwell.x, z: A.coinwell.z, label: 'Coinwell Camp', id: 'coinwell_camp' },
    { x: A.unlitDig.x, z: A.unlitDig.z, label: 'The Unlit Dig', id: 'the_unlit_dig' },
    { x: A.chalkMere.x, z: A.chalkMere.z, label: 'Chalk Mere', id: 'chalk_mere' },
    { x: A.whiteHead.x, z: A.whiteHead.z, label: 'The White Head', id: 'the_white_head' },
    { x: A.wreckersCove.x, z: A.wreckersCove.z, label: "Wreckers' Cove", id: 'wreckers_cove' },
  ],
  welcome:
    'The Gilt Measure came to the white cliffs for chalk and stayed for what was under it. Someone else is digging further down, by lantern-less dark, and the prospectors at Coinwell would very much like to know who.',
};

export const SOUTHERN_REACHES_ZONES: ZoneDef[] = [
  APPLEWOLD_ZONE,
  KINDLEMOOR_ZONE,
  CHALKBARROW_ZONE,
];

export const SOUTHERN_REACHES_ROADS: { x: number; z: number }[][] = [
  [
    { x: 382, z: -118 },
    { x: 380, z: -160 },
    { x: 378, z: -200 },
    { x: A.causewayFoot.x, z: A.causewayFoot.z },
    { x: A.wardenPost.x, z: A.wardenPost.z },
    { x: 352, z: -292 },
    { x: A.pressford.x + 6, z: A.pressford.z + 6 },
  ], // the Applewold causeway: the Farshore's south point -> Causeway Watch -> Pressford
  [
    { x: A.pressford.x + 10, z: A.pressford.z - 6 },
    { x: 382, z: -360 },
    { x: 410, z: -388 },
  ], // Pressford -> the Cider Mere
  [
    { x: 350, z: -306 },
    { x: 410, z: -300 },
    { x: 434, z: -297 },
  ], // Pressford -> Blossom Rise
  [
    { x: A.pressford.x - 12, z: A.pressford.z - 6 },
    { x: 290, z: -350 },
    { x: 272, z: -392 },
  ], // Pressford -> the Old Press
  [
    { x: A.pressford.x - 14, z: A.pressford.z + 2 },
    { x: 262, z: -340 },
    { x: 214, z: -368 },
    { x: A.heathWay.x, z: A.heathWay.z },
    { x: 120, z: -350 },
    { x: 72, z: -330 },
    { x: A.ferncross.x + 12, z: A.ferncross.z },
  ], // the Heath Way: Pressford -> west over the heath -> Ferncross
  [
    { x: A.ferncross.x - 10, z: A.ferncross.z - 8 },
    { x: -10, z: -360 },
    { x: -40, z: -392 },
  ], // Ferncross -> the First Hearth Ring
  [
    { x: A.ferncross.x - 12, z: A.ferncross.z },
    { x: -40, z: -322 },
    { x: -82, z: -326 },
  ], // Ferncross -> the Moor Tarn
  [
    { x: A.ferncross.x + 8, z: A.ferncross.z - 12 },
    { x: 66, z: -392 },
    { x: 84, z: -436 },
  ], // Ferncross -> the Grey Tor
  [
    { x: -80, z: -342 },
    { x: -140, z: -372 },
    { x: A.westHeath.x, z: A.westHeath.z },
    { x: -240, z: -380 },
    { x: -290, z: -350 },
    { x: A.coinwell.x + 12, z: A.coinwell.z + 2 },
  ], // the west heath: the Moor Tarn -> Coinwell Camp
  [
    { x: A.coinwell.x - 10, z: A.coinwell.z - 10 },
    { x: -364, z: -390 },
    { x: -404, z: -424 },
  ], // Coinwell Camp -> the Unlit Dig
  [
    { x: A.coinwell.x - 14, z: A.coinwell.z + 4 },
    { x: -400, z: -320 },
    { x: -438, z: -308 },
  ], // Coinwell Camp -> the White Head
  [
    { x: A.coinwell.x + 8, z: A.coinwell.z - 14 },
    { x: -292, z: -400 },
    { x: -268, z: -440 },
  ], // Coinwell Camp -> Wreckers' Cove
  [
    { x: A.southwayLanding.x, z: A.southwayLanding.z },
    { x: 74, z: -150 },
    { x: 72, z: -190 },
    { x: 68, z: -230 },
    { x: A.southwayFoot.x, z: A.southwayFoot.z },
    { x: 56, z: -296 },
    { x: A.ferncross.x + 10, z: A.ferncross.z + 8 },
  ], // the Southway: Eastbrook's south shore (east of the town) -> the causeway -> Ferncross
];

// Camps reuse shipped templates at camp-level ranges. Orchard boars and down
// wolves in the Applewold; heath widows, moor wolves and the restless dead of
// the hearth ring on the Kindlemoor; on the Chalkbarrow Coast the Pale
// Accord's Gravecaller cell at the dig, its hired diggers, the cove's
// drowned and the trolls of the White Head.
export const SOUTHERN_REACHES_CAMPS: CampDef[] = [
  // the Applewold
  {
    mobId: 'wild_boar',
    center: { x: 418, z: -338 },
    radius: 13,
    count: 4,
    levelMin: 6,
    levelMax: 7,
    offStream: true,
  },
  {
    mobId: 'wild_boar',
    center: { x: 292, z: -372 },
    radius: 12,
    count: 3,
    levelMin: 6,
    levelMax: 7,
    offStream: true,
  },
  {
    mobId: 'forest_wolf',
    center: { x: 352, z: -462 },
    radius: 14,
    count: 4,
    levelMin: 7,
    levelMax: 8,
    offStream: true,
  },
  {
    mobId: 'vale_bandit',
    center: { x: 262, z: -410 },
    radius: 11,
    count: 4,
    levelMin: 7,
    levelMax: 9,
    offStream: true,
  },
  {
    mobId: 'deepfen_murloc',
    center: { x: 446, z: -418 },
    radius: 11,
    count: 3,
    levelMin: 8,
    levelMax: 9,
    offStream: true,
  },
  {
    mobId: 'forest_wolf',
    center: { x: 474, z: -272 },
    radius: 11,
    count: 3,
    levelMin: 8,
    levelMax: 9,
    offStream: true,
  },
  // the Kindlemoor
  {
    mobId: 'mire_widow',
    center: { x: 104, z: -364 },
    radius: 13,
    count: 3,
    levelMin: 8,
    levelMax: 9,
    offStream: true,
  },
  {
    mobId: 'forest_wolf',
    center: { x: -118, z: -384 },
    radius: 14,
    count: 4,
    levelMin: 9,
    levelMax: 10,
    offStream: true,
  },
  {
    mobId: 'restless_bones',
    center: { x: -48, z: -410 },
    radius: 13,
    count: 4,
    levelMin: 9,
    levelMax: 10,
    offStream: true,
  },
  {
    mobId: 'mire_prowler',
    center: { x: 92, z: -452 },
    radius: 13,
    count: 3,
    levelMin: 10,
    levelMax: 11,
    offStream: true,
  },
  {
    mobId: 'mire_widow',
    center: { x: -26, z: -472 },
    radius: 13,
    count: 3,
    levelMin: 10,
    levelMax: 11,
    offStream: true,
  },
  // the Chalkbarrow Coast
  {
    mobId: 'tunnel_rat',
    center: { x: -386, z: -458 },
    radius: 11,
    count: 3,
    levelMin: 10,
    levelMax: 11,
    offStream: true,
  },
  {
    mobId: 'gravecaller_cultist',
    center: { x: -420, z: -438 },
    radius: 12,
    count: 4,
    levelMin: 11,
    levelMax: 12,
    offStream: true,
  },
  {
    mobId: 'gravecaller_summoner',
    center: { x: -440, z: -420 },
    radius: 9,
    count: 2,
    levelMin: 12,
    levelMax: 13,
    offStream: true,
  },
  {
    mobId: 'bog_bloat',
    center: { x: -376, z: -372 },
    radius: 11,
    count: 3,
    levelMin: 10,
    levelMax: 11,
    offStream: true,
  },
  {
    mobId: 'drowned_dead',
    center: { x: -280, z: -432 },
    radius: 12,
    count: 4,
    levelMin: 11,
    levelMax: 12,
    offStream: true,
  },
  {
    mobId: 'fen_troll',
    center: { x: -468, z: -312 },
    radius: 12,
    count: 2,
    levelMin: 12,
    levelMax: 13,
    offStream: true,
  },
];

// Dressing from the shipped prop families only (tents, fires, crates, fences,
// ruin rings, wells, docks, decor GLBs); new landmark models wait for the
// environment crew's style pass.
export const SOUTHERN_REACHES_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  tents: [
    // Causeway Watch: the Lanternwardens' road post
    { x: 366, z: -258, rot: 0.4, scale: 1 },
    { x: 380, z: -266, rot: -0.6, scale: 0.9 },
    // Pressford's pickers' camp
    { x: 318, z: -332, rot: 1.2, scale: 1 },
    { x: 346, z: -334, rot: -1.1, scale: 1 },
    // Ferncross, the Bracken Circle's camp
    { x: 22, z: -328, rot: 0.8, scale: 1 },
    { x: 44, z: -330, rot: -0.7, scale: 0.9 },
    { x: 34, z: -306, rot: 3.0, scale: 1 },
    // Coinwell Camp, the Gilt Measure's prospectors
    { x: -328, z: -346, rot: 0.5, scale: 1.1 },
    { x: -306, z: -346, rot: -0.5, scale: 1 },
    { x: -318, z: -324, rot: 3.1, scale: 1 },
    // the Pale Accord's tents at the dig rim
    { x: -432, z: -424, rot: 0.9, scale: 0.9 },
    { x: -404, z: -448, rot: -2.1, scale: 0.9 },
  ],
  campfires: [
    [372, -262],
    [332, -318],
    [32, -318],
    [-318, -336],
    [-418, -434],
    [-48, -405],
  ],
  crates: [
    [324, -310, 0.3],
    [340, -312, 1.1],
    [327, -305, 2.0],
    [-308, -330, 0.7],
    [-330, -326, 1.9],
    [-314, -352, 0.2],
    [-410, -430, 0.5],
  ],
  wells: [{ x: 338, z: -322, r: 1.4 }],
  ruinRings: [
    // the First Hearth Ring: the oldest standing stones in Wyndlewood
    { x: A.firstHearthRing.x, z: A.firstHearthRing.z, ringR: 9, columns: 9, omit: [2, 6] },
    // the Old Press: a fallen Bright Foundations pressing-house
    { x: A.oldPressRuin.x, z: A.oldPressRuin.z, ringR: 6, columns: 6, omit: [1, 4], bare: true },
    // the Grey Tor's broken crown
    { x: A.greyTor.x, z: A.greyTor.z + 6, ringR: 5, columns: 5, omit: [3], bare: true },
  ],
  fences: [
    // Pressford's orchard rails
    { x1: 352, z1: -300, x2: 380, z2: -300 },
    { x1: 380, z1: -300, x2: 380, z2: -326 },
    // Causeway Watch's palisade
    { x1: 356, z1: -250, x2: 362, z2: -270, kind: 'palisade' },
    // the dig's rim
    { x1: -436, z1: -448, x2: -424, z2: -462, kind: 'palisade' },
  ],
  graveyards: [
    { x: A.pressfordYard.x, z: A.pressfordYard.z },
    { x: A.ferncrossYard.x, z: A.ferncrossYard.z },
    { x: A.coinwellYard.x, z: A.coinwellYard.z },
  ],
  decorProps: [
    // the Pale Accord's work at the Unlit Dig
    { key: 'hanging_cage', x: -426, z: -446, rot: 0.4 },
    { key: 'bone_pile', x: -412, z: -444, rot: 1.2 },
    { key: 'wq_damaged_crate', x: -398, z: -436, rot: 2.2 },
    // Wreckers' Cove
    { key: 'rowboat', x: -256, z: -470, rot: 2.6 },
    { key: 'wq_broken_planks', x: -270, z: -462, rot: 0.8 },
    { key: 'wq_waterlogged_barrel', x: -250, z: -458, rot: 1.6 },
    // the Cider Mere's landing
    { key: 'rowboat', x: 432, z: -398, rot: -0.9 },
    // the mill on Blossom Rise, over the orchards
    { key: 'hexWindmill', x: 467, z: -293, rot: -0.5, scale: 8, r: 4.5, h: 12 },
    // the old watch below the Grey Tor
    { key: 'hexWatchtower', x: 67.5, z: -453.5, rot: 1.1, scale: 6.5, r: 3, h: 8 },
    // the coast watch on the White Head
    { key: 'hexWatchtower', x: -475, z: -286, rot: -2.4, scale: 6.5, r: 3, h: 8 },
  ],
};
