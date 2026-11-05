// The West March: the frontier column west of the Low Reaches and the old
// west realms (x -900..-540), shaped by src/sim/frontier/ (terrain + layout).
// Run south to north by level, it is the second road through 16 to 20: a
// player at 15 picks the north road (Thornpeak, the Veiled Hollow, the
// Drakelands and the Frostveil) or this one, in either order.
//
//   The Rookcliffs (14 to 16): sea stacks and rookeries at the south-west
//     corner, entered over the Rook Ford from the Tinmarch. Kestrel Point is a
//     Lanternwarden lookout, and the Hushmist Light burns over the mist edge.
//   The Sedgemarch (16 to 18): reed fen and withy beds, worked by the basket
//     village of Withyholt and stalked by what the fen keeps.
//   The Harrowfells (17 to 19): high fells over an old battlefield, held from
//     Fellgate; the dead under the Cairn Field are not resting.
//   The Wardmere (18 to 20): the Lanternwardens' last shore before the
//     Hushmist, kept from Lanternfold. The Westering Pier faces the Willowfen
//     ferry lane, the planned stop that links the March to the west realms.
//
// The March's east coasts keep 80yd+ of open water to the Willowfen ferry lane
// (x ~ -550) and the Proving Shore island; nothing here touches shipped
// ground. Creatures reuse shipped rigs and templates at camp-level ranges; the
// quests belong to the story crew, and every hub keeps room for a quest board
// and five givers (frontier/hub_plots.ts).
//
// Append-only rule: merged LAST in data.ts after the Low Reaches.

import { FRONTIER_ANCHORS as A, FRONTIER_LAKES } from '../../frontier/layout';
import type { CampDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';
import { frontierCamp as camp } from './low_reaches';

const lake = (i: number) => ({ ...FRONTIER_LAKES[i] });

export const ROOKCLIFFS_ZONE: ZoneDef = {
  id: 'rookcliffs',
  name: 'The Rookcliffs',
  openBorders: true,
  zMin: -900,
  zMax: -540,
  xMin: -900,
  xMax: -540,
  levelRange: [14, 16],
  biome: 'gale',
  hub: { x: A.kestrelPoint.x, z: A.kestrelPoint.z, radius: 15, name: 'Kestrel Point' },
  graveyard: { x: A.kestrelYard.x, z: A.kestrelYard.z },
  lakes: [],
  pois: [
    { x: A.kestrelPoint.x, z: A.kestrelPoint.z, label: 'Kestrel Point', id: 'kestrel_point' },
    { x: A.seaStacks.x, z: A.seaStacks.z, label: 'The Sea Stacks', id: 'the_sea_stacks' },
    { x: A.rookHollow.x, z: A.rookHollow.z, label: 'Rook Hollow', id: 'rook_hollow' },
    {
      x: A.hushmistLight.x,
      z: A.hushmistLight.z,
      label: 'The Hushmist Light',
      id: 'the_hushmist_light',
    },
    { x: A.rookFord.x, z: A.rookFord.z, label: 'The Rook Ford', id: 'the_rook_ford' },
  ],
  welcome:
    'The world ends here, or seems to. West of the cliffs the grey mist sits on the sea and swallows every sound, and the Lanternwardens at Kestrel Point keep a light burning at its edge.',
};

export const SEDGEMARCH_ZONE: ZoneDef = {
  id: 'sedgemarch',
  name: 'The Sedgemarch',
  openBorders: true,
  zMin: -540,
  zMax: -180,
  xMin: -900,
  xMax: -540,
  levelRange: [16, 18],
  biome: 'marsh',
  hub: { x: A.withyholt.x, z: A.withyholt.z, radius: 15, name: 'Withyholt' },
  graveyard: { x: A.withyholtYard.x, z: A.withyholtYard.z },
  lakes: [lake(4)],
  pois: [
    { x: A.withyholt.x, z: A.withyholt.z, label: 'Withyholt', id: 'withyholt' },
    { x: A.withyBeds.x, z: A.withyBeds.z, label: 'The Withy Beds', id: 'the_withy_beds' },
    { x: A.heronMere.x, z: A.heronMere.z, label: 'Heron Mere', id: 'heron_mere' },
    {
      x: A.drownedCausey.x,
      z: A.drownedCausey.z,
      label: 'The Drowned Causey',
      id: 'the_drowned_causey',
    },
    { x: A.sedgeNeck.x, z: A.sedgeNeck.z, label: 'The Sedge Neck', id: 'the_sedge_neck' },
  ],
  welcome:
    'Reed and sedge as far as the mist. Withyholt weaves the baskets half the west carries, and its people know which paths the fen keeps and which it gives back.',
};

export const HARROWFELLS_ZONE: ZoneDef = {
  id: 'harrowfells',
  name: 'The Harrowfells',
  openBorders: true,
  zMin: -180,
  zMax: 180,
  xMin: -900,
  xMax: -540,
  levelRange: [17, 19],
  biome: 'peaks',
  hub: { x: A.fellgate.x, z: A.fellgate.z, radius: 15, name: 'Fellgate' },
  graveyard: { x: A.fellgateYard.x, z: A.fellgateYard.z },
  lakes: [lake(5)],
  pois: [
    { x: A.fellgate.x, z: A.fellgate.z, label: 'Fellgate', id: 'fellgate' },
    { x: A.cairnField.x, z: A.cairnField.z, label: 'The Cairn Field', id: 'the_cairn_field' },
    { x: A.harrowTarn.x, z: A.harrowTarn.z, label: 'Harrow Tarn', id: 'harrow_tarn' },
    { x: A.ironRing.x, z: A.ironRing.z, label: 'The Iron Ring', id: 'the_iron_ring' },
    { x: A.fellNeck.x, z: A.fellNeck.z, label: 'The Fell Neck', id: 'the_fell_neck' },
  ],
  welcome:
    'A war was ended on these fells long ago, and the cairns were raised to keep it ended. Fellgate stands watch over the field, and every night the watch counts the cairns again.',
};

export const WARDMERE_ZONE: ZoneDef = {
  id: 'wardmere',
  name: 'The Wardmere',
  openBorders: true,
  zMin: 180,
  zMax: 540,
  xMin: -900,
  xMax: -540,
  levelRange: [18, 20],
  biome: 'fen',
  hub: { x: A.lanternfold.x, z: A.lanternfold.z, radius: 15, name: 'Lanternfold' },
  graveyard: { x: A.lanternfoldYard.x, z: A.lanternfoldYard.z },
  lakes: [lake(6)],
  pois: [
    { x: A.lanternfold.x, z: A.lanternfold.z, label: 'Lanternfold', id: 'lanternfold' },
    { x: A.wardMere.x, z: A.wardMere.z, label: 'The Ward Mere', id: 'the_ward_mere' },
    { x: A.lastBeacon.x, z: A.lastBeacon.z, label: 'The Last Beacon', id: 'the_last_beacon' },
    {
      x: A.westeringPier.x,
      z: A.westeringPier.z,
      label: 'The Westering Pier',
      id: 'the_westering_pier',
    },
    { x: A.wardNeck.x, z: A.wardNeck.z, label: 'The Ward Neck', id: 'the_ward_neck' },
  ],
  welcome:
    'The last shore the Lanternwardens hold. Past the Ward Mere the mist comes in like a tide, and Lanternfold keeps its lamps lit all day so that no one walks into it by mistake.',
};

export const WEST_MARCH_ZONES: ZoneDef[] = [
  ROOKCLIFFS_ZONE,
  SEDGEMARCH_ZONE,
  HARROWFELLS_ZONE,
  WARDMERE_ZONE,
];

export const WEST_MARCH_ROADS: { x: number; z: number }[][] = [
  [
    { x: A.rookFord.x, z: A.rookFord.z },
    { x: -590, z: -730 },
    { x: -650, z: -700 },
    { x: A.kestrelPoint.x + 14, z: A.kestrelPoint.z - 2 },
  ], // the Rook Way's west half: the Rook Ford -> Kestrel Point
  [
    { x: A.kestrelPoint.x - 14, z: A.kestrelPoint.z - 2 },
    { x: -790, z: -680 },
    { x: A.hushmistLight.x + 12, z: A.hushmistLight.z },
  ], // Kestrel Point -> the Hushmist Light
  [
    { x: A.kestrelPoint.x - 8, z: A.kestrelPoint.z - 12 },
    { x: -760, z: -760 },
    { x: -806, z: -800 },
  ], // Kestrel Point -> the Sea Stacks
  [
    { x: A.kestrelPoint.x + 8, z: A.kestrelPoint.z - 12 },
    { x: -660, z: -740 },
    { x: -646, z: -778 },
  ], // Kestrel Point -> Rook Hollow
  [
    { x: A.kestrelPoint.x - 4, z: A.kestrelPoint.z + 14 },
    { x: -716, z: -610 },
    { x: A.sedgeNeck.x, z: A.sedgeNeck.z },
    { x: -720, z: -480 },
    { x: -704, z: -400 },
    { x: A.withyholt.x - 2, z: A.withyholt.z - 14 },
  ], // the Sedge Neck: Kestrel Point -> north -> Withyholt
  [
    { x: A.withyholt.x - 12, z: A.withyholt.z - 8 },
    { x: -740, z: -380 },
    { x: -776, z: -410 },
  ], // Withyholt -> the Withy Beds
  [
    { x: A.withyholt.x + 12, z: A.withyholt.z - 8 },
    { x: -664, z: -380 },
    { x: -650, z: -404 },
  ], // Withyholt -> Heron Mere
  [
    { x: A.withyholt.x - 12, z: A.withyholt.z + 6 },
    { x: -744, z: -310 },
    { x: -772, z: -294 },
  ], // Withyholt -> the Drowned Causey
  [
    { x: A.withyholt.x - 2, z: A.withyholt.z + 14 },
    { x: -706, z: -280 },
    { x: -728, z: -230 },
    { x: A.fellNeck.x, z: A.fellNeck.z },
    { x: -742, z: -120 },
    { x: -736, z: -70 },
    { x: A.fellgate.x, z: A.fellgate.z - 14 },
  ], // the Fell Neck: Withyholt -> north -> Fellgate
  [
    { x: A.fellgate.x - 12, z: A.fellgate.z - 6 },
    { x: -760, z: -50 },
  ], // Fellgate -> the Iron Ring
  [
    { x: A.fellgate.x + 12, z: A.fellgate.z + 6 },
    { x: -700, z: 10 },
    { x: -684, z: 40 },
  ], // Fellgate -> Harrow Tarn
  [
    { x: A.fellgate.x - 8, z: A.fellgate.z + 12 },
    { x: -760, z: 30 },
    { x: -784, z: 70 },
  ], // Fellgate -> the Cairn Field
  [
    { x: A.fellgate.x + 2, z: A.fellgate.z + 14 },
    { x: -730, z: 60 },
    { x: -740, z: 120 },
    { x: A.wardNeck.x, z: A.wardNeck.z },
    { x: -750, z: 240 },
    { x: -746, z: 290 },
    { x: A.lanternfold.x, z: A.lanternfold.z - 14 },
  ], // the Ward Neck: Fellgate -> north -> Lanternfold
  [
    { x: A.lanternfold.x + 14, z: A.lanternfold.z - 4 },
    { x: -704, z: 312 },
    { x: A.westeringPier.x - 6, z: A.westeringPier.z },
  ], // Lanternfold -> the Westering Pier
  [
    { x: A.lanternfold.x + 10, z: A.lanternfold.z + 10 },
    { x: -720, z: 380 },
    { x: -712, z: 404 },
  ], // Lanternfold -> the Ward Mere
  [
    { x: A.lanternfold.x - 8, z: A.lanternfold.z + 12 },
    { x: -762, z: 400 },
    { x: -766, z: 444 },
  ], // Lanternfold -> the Last Beacon
];

// Shoal scuttlers, wreck thieves, gale wisps and the drowned along the
// Rookcliffs; toads, lurkers, fen trolls and the votaries of the drowned in the
// Sedgemarch; the risen dead, wights, ogres and wyrmcult zealots on the
// Harrowfells; wisps, strange stags of the mist and the old guardians at the
// Wardmere.
export const WEST_MARCH_CAMPS: CampDef[] = [
  // the Rookcliffs
  camp('shoal_scuttler', -800, -796, 12, 4, 14, 15),
  camp('wreck_thief', -612, -760, 11, 4, 14, 15),
  camp('gale_wisp', -820, -720, 12, 3, 15, 16),
  camp('drowned_dead', -662, -800, 12, 4, 15, 16),
  camp('downs_bandit', -770, -640, 12, 3, 15, 16),
  // the Sedgemarch
  camp('bogtoad', -760, -440, 13, 4, 16, 17),
  camp('mere_lurker', -660, -446, 11, 3, 16, 17),
  camp('fen_troll', -786, -312, 12, 3, 17, 18),
  camp('drowned_votary', -656, -290, 12, 3, 17, 18),
  camp('mire_prowler', -760, -240, 12, 3, 17, 18),
  // the Harrowfells
  camp('boneclad_revenant', -790, 70, 13, 4, 17, 18),
  camp('barrow_wight', -770, 96, 11, 2, 18, 19),
  camp('thornpeak_ogre', -700, -62, 12, 3, 18, 19),
  camp('ridge_stalker', -820, -40, 13, 3, 18, 19),
  camp('wyrmcult_zealot', -690, 92, 11, 4, 18, 19),
  // the Wardmere
  camp('duskwisp', -690, 450, 12, 3, 18, 19),
  camp('gloam_strider', -786, 390, 13, 3, 19, 20),
  camp('ancient_guardian', -752, 476, 11, 2, 19, 20),
  camp('glimmerwisp', -720, 250, 12, 3, 19, 20),
];

export const WEST_MARCH_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  tents: [
    // Kestrel Point, the Lanternwardens' lookout
    { x: -716, z: -678, rot: 0.5, scale: 1 },
    { x: -692, z: -678, rot: -0.5, scale: 1 },
    // Withyholt, the basket village
    { x: -704, z: -350, rot: 0.6, scale: 1 },
    { x: -680, z: -350, rot: -0.6, scale: 1 },
    { x: -692, z: -322, rot: 3.1, scale: 1.1 },
    // Fellgate, the cairn watch
    { x: -746, z: -48, rot: 0.6, scale: 1.1 },
    { x: -722, z: -48, rot: -0.6, scale: 1 },
    // Lanternfold
    { x: -754, z: 312, rot: 0.5, scale: 1 },
    { x: -730, z: 312, rot: -0.5, scale: 1 },
    { x: -742, z: 340, rot: 3.1, scale: 1 },
  ],
  campfires: [
    [-704, -664],
    [-692, -336],
    [-734, -34],
    [-742, 326],
    [-846, -690],
    [-806, 478],
  ],
  crates: [
    [-694, -654, 0.4],
    [-682, -326, 1.1],
    [-702, -326, 2.0],
    [-724, -24, 0.6],
    [-732, 336, 1.3],
  ],
  wells: [{ x: -686, z: -342, r: 1.4 }],
  ruinRings: [
    // the Iron Ring: the war's last standing circle on the fells
    { x: A.ironRing.x, z: A.ironRing.z, ringR: 8, columns: 8, omit: [2, 5] },
    // the Last Beacon's broken crown
    { x: A.lastBeacon.x, z: A.lastBeacon.z + 6, ringR: 6, columns: 6, omit: [4], bare: true },
    // the Hushmist Light's footing
    { x: A.hushmistLight.x - 6, z: A.hushmistLight.z, ringR: 5, columns: 5, omit: [1], bare: true },
  ],
  fences: [
    // Fellgate's cairn palisade
    { x1: -712, z1: -20, x2: -712, z2: -48, kind: 'palisade' },
    // Withyholt's withy rails
    { x1: -672, z1: -320, x2: -672, z2: -344 },
  ],
  graveyards: [
    { x: A.kestrelYard.x, z: A.kestrelYard.z },
    { x: A.withyholtYard.x, z: A.withyholtYard.z },
    { x: A.fellgateYard.x, z: A.fellgateYard.z },
    { x: A.lanternfoldYard.x, z: A.lanternfoldYard.z },
  ],
  decorProps: [
    // the Sea Stacks' wreckage
    { key: 'rowboat', x: -812, z: -808, rot: 2.1 },
    { key: 'wq_broken_planks', x: -798, z: -812, rot: 0.4 },
    // the Cairn Field
    { key: 'bone_pile', x: -796, z: 86, rot: 0.7 },
    { key: 'bone_pile', x: -782, z: 92, rot: 2.3 },
    // the Westering Pier's landing (the planned ferry stop)
    { key: 'rowboat', x: -656, z: 290, rot: -1.2 },
    { key: 'wq_waterlogged_barrel', x: -660, z: 304, rot: 0.9 },
    // Kestrel Point's lookout over the Rook Way
    { key: 'hexWatchtower', x: -683, z: -652, rot: -0.6, scale: 6.5, r: 3, h: 8 },
    // the Hushmist Light, the Lanternwardens' tower at the mist's edge
    { key: 'hexTower', x: -839.5, z: -686, rot: 1.6, scale: 8, r: 4, h: 17 },
    // the drainage mill over the Withy Beds
    { key: 'hexWindmill', x: -786, z: -420, rot: 2.2, scale: 8, r: 4.5, h: 12 },
    // a siege engine left by the Iron Ring, never fired again
    { key: 'hexTowerCatapult', x: -756, z: -62, rot: 2.0, scale: 7, r: 3.5, h: 10 },
    // the old march wall across the Fell Neck, broken through for the road
    { key: 'hexWall', x: -731.5, z: -179, rot: 1.2, scale: 7, r: 4, h: 8 },
    // the Last Beacon's keeper's tower
    { key: 'hexWatchtower', x: -761.5, z: 448.5, rot: 0.7, scale: 6.5, r: 3, h: 8 },
    // Lanternfold's chapel, where the lanterns are lit for the lost
    { key: 'hexChurch', x: -716.5, z: 330.5, rot: -1.6, scale: 7, r: 5, h: 12 },
  ],
  // the Westering Pier: a real landing facing the Willowfen, the planned
  // ferry stop (enlarged like the Proving Shore pier so it reads from the sea)
  docks: [
    {
      x: -671.5,
      z: 292,
      rot: -Math.PI / 2,
      scale: 1.5,
      hutLocal: { x: 2.8, z: 2.4, hw: 1.7, hd: 1.5 },
    },
  ],
  // reeds along the Heron Mere's east shallows
  marshReeds: [
    [-618, -407],
    [-622, -401],
    [-614, -413],
    [-626, -409],
    [-619, -396],
  ],
};
