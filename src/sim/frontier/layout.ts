// The frontier's authored shape: the data ./terrain.ts turns into ground.
// Every entry is plain numbers in world yards (x east, z north). The content
// records that stand on this ground (zones, camps, roads, props) live in
// src/sim/content/frontier/ and read their anchors from here, so a hub and the
// pad it stands on can never drift apart.
//
// The first frontier row is the Southern Reaches, three zone cells south of
// the Proving Shore, Eastbrook Vale and the Farshore (z -540..-180):
//   the Applewold (x 180..540)       orchard downs, levels 6 to 9
//   the Kindlemoor (x -180..180)     heath and old hearth stones, 8 to 11
//   the Chalkbarrow Coast (x -540..-180) chalk cliffs and the dig, 10 to 13
// walked into across the Applewold causeway off the Farshore's south point,
// and joined to each other by land. Every coast keeps a 25yd+ margin inside its
// zone rect and the row's land stays well clear of the Proving Shore island.
//
// The second frontier row is the Low Reaches (z -900..-540), levels 11 to 15,
// run east to west: the Saltmeads (x 180..540, 11 to 13, entered over the
// Applewold's south downs), the Wychwold (x -180..180, 12 to 14) and the
// Tinmarch (x -540..-180, 13 to 15, also reached over the Chalkbarrow pass).
// The West March is the column past it (x -900..-540), levels 14 to 20, run
// south to north: the Rookcliffs (z -900..-540), the Sedgemarch (-540..-180),
// the Harrowfells (-180..180) and the Wardmere (180..540). The March's east
// coasts stay 80yd+ west of the Willowfen ferry lane (x ~ -550), and the
// Southway joins the Kindlemoor to Eastbrook's south shore (a tie-in).

/** A land mass: an ellipse with a noise-wobbled coast. */
export interface FrontierBlob {
  x: number;
  z: number;
  rx: number;
  rz: number;
  rot?: number;
  /** Coast wobble scale (1 default; 0 a clean ellipse, 1.6 very ragged). */
  ragged?: number;
}

/** A causeway or land bridge: a capsule of land whose crown ramps ha -> hb. */
export interface FrontierNeck {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
  ha: number;
  hb: number;
}

/** A hill range: a crest lift falling off across halfWidth. */
export interface FrontierRidge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
  height: number;
}

/** A level pad (hub, graveyard, camp). h absent = the natural ground at its center. */
export interface FrontierFlat {
  x: number;
  z: number;
  r: number;
  h?: number;
}

export interface FrontierLake {
  x: number;
  z: number;
  radius: number;
}

/** Named anchors the content records stand on. */
export const FRONTIER_ANCHORS = Object.freeze({
  // the Applewold
  pressford: { x: 332, z: -318 },
  pressfordYard: { x: 306, z: -300 },
  ciderMere: { x: 420, z: -405 },
  causewayFoot: { x: 374, z: -238 },
  wardenPost: { x: 372, z: -262 },
  blossomRise: { x: 468, z: -292 },
  oldPressRuin: { x: 268, z: -402 },
  southDowns: { x: 360, z: -470 },
  // the Kindlemoor
  ferncross: { x: 32, z: -318 },
  ferncrossYard: { x: 58, z: -300 },
  firstHearthRing: { x: -48, z: -405 },
  moorTarn: { x: -96, z: -326 },
  greyTor: { x: 88, z: -450 },
  heathWay: { x: 176, z: -372 },
  // the Chalkbarrow Coast
  coinwell: { x: -318, z: -336 },
  coinwellYard: { x: -344, z: -318 },
  unlitDig: { x: -418, z: -436 },
  chalkMere: { x: -396, z: -356 },
  whiteHead: { x: -470, z: -300 },
  wreckersCove: { x: -276, z: -440 },
  westHeath: { x: -190, z: -398 },
  // the Southway: Eastbrook's south shore to the Kindlemoor
  southwayLanding: { x: 74, z: -118 },
  southwayFoot: { x: 64, z: -268 },
  // the Saltmeads
  panwick: { x: 362, z: -652 },
  panwickYard: { x: 338, z: -636 },
  saltmeadsGate: { x: 332, z: -560 },
  brinePans: { x: 440, z: -704 },
  gannetStack: { x: 472, z: -806 },
  wrackShallows: { x: 276, z: -764 },
  // the Wychwold
  elmhallow: { x: 34, z: -690 },
  elmhallowYard: { x: 58, z: -672 },
  knottedElm: { x: -56, z: -764 },
  charcoalHollow: { x: 96, z: -800 },
  sunkLane: { x: -116, z: -682 },
  saltWay: { x: 184, z: -726 },
  // the Tinmarch
  whealPatience: { x: -330, z: -668 },
  whealYard: { x: -354, z: -652 },
  stannaryStones: { x: -430, z: -768 },
  blackadit: { x: -262, z: -806 },
  tinnersFord: { x: -184, z: -720 },
  chalkPass: { x: -236, z: -540 },
  // the Rookcliffs
  kestrelPoint: { x: -704, z: -664 },
  kestrelYard: { x: -726, z: -648 },
  seaStacks: { x: -820, z: -816 },
  rookHollow: { x: -640, z: -790 },
  hushmistLight: { x: -846, z: -690 },
  rookFord: { x: -548, z: -738 },
  // the Sedgemarch
  withyholt: { x: -692, z: -336 },
  withyholtYard: { x: -716, z: -320 },
  withyBeds: { x: -786, z: -420 },
  heronMere: { x: -640, z: -420 },
  drownedCausey: { x: -780, z: -290 },
  sedgeNeck: { x: -722, z: -542 },
  // the Harrowfells
  fellgate: { x: -734, z: -34 },
  fellgateYard: { x: -756, z: -18 },
  cairnField: { x: -790, z: 82 },
  harrowTarn: { x: -676, z: 52 },
  ironRing: { x: -770, z: -62 },
  fellNeck: { x: -740, z: -182 },
  // the Wardmere
  lanternfold: { x: -742, z: 326 },
  lanternfoldYard: { x: -764, z: 342 },
  wardMere: { x: -704, z: 420 },
  lastBeacon: { x: -768, z: 456 },
  westeringPier: { x: -676, z: 300 },
  wardNeck: { x: -748, z: 178 },
  // the spread's new waypoints (frontier/spread.ts), one per long gap the
  // spread opened on the main road: a watchtower, a ruin, a pool and a camp
  heathwardTower: { x: -130, z: -380 },
  oldTollHouse: { x: -236, z: -490 },
  hazelPool: { x: -52, z: -640 },
  droversRest: { x: -736, z: -228 },
});

const A = FRONTIER_ANCHORS;

export const FRONTIER_BLOBS: readonly FrontierBlob[] = [
  // the Applewold: the main downs, the blossom lobe east, the south downs
  { x: 365, z: -350, rx: 150, rz: 138, ragged: 1 },
  { x: 470, z: -292, rx: 58, rz: 66, ragged: 1.3 },
  { x: 330, z: -458, rx: 112, rz: 58, ragged: 0.9 },
  // the heath way west into the Kindlemoor, straddling x 180
  { x: 196, z: -372, rx: 74, rz: 54, ragged: 0.8 },
  // the Kindlemoor
  { x: 10, z: -376, rx: 165, rz: 138, ragged: 1.1 },
  // the west heath into the Chalkbarrow Coast, straddling x -180
  { x: -188, z: -398, rx: 62, rz: 50, ragged: 0.8 },
  // the Chalkbarrow Coast: the downs and the White Head
  { x: -360, z: -386, rx: 150, rz: 124, ragged: 1.2 },
  { x: -470, z: -302, rx: 54, rz: 48, ragged: 1.4 },
  // the Saltmeads: the salt downs and the gannet head
  { x: 366, z: -712, rx: 150, rz: 128, ragged: 1.1 },
  { x: 468, z: -800, rx: 52, rz: 48, ragged: 1.4 },
  // the salt way west into the Wychwold, straddling x 180
  { x: 182, z: -728, rx: 72, rz: 52, ragged: 0.8 },
  // the Wychwold
  { x: 2, z: -718, rx: 160, rz: 134, ragged: 1 },
  // the tinners' ford into the Tinmarch, straddling x -180
  { x: -182, z: -724, rx: 64, rz: 50, ragged: 0.8 },
  // the Tinmarch
  { x: -362, z: -724, rx: 150, rz: 130, ragged: 0.9 },
  // the rook ford into the Rookcliffs, straddling x -540
  { x: -544, z: -736, rx: 82, rz: 50, ragged: 0.7 },
  // the Rookcliffs and the sea stacks
  { x: -722, z: -724, rx: 146, rz: 128, ragged: 1.3 },
  { x: -826, z: -818, rx: 44, rz: 40, ragged: 1.6 },
  // the sedge neck north into the Sedgemarch, straddling z -540
  { x: -724, z: -542, rx: 52, rz: 62, ragged: 0.8 },
  // the Sedgemarch
  { x: -716, z: -362, rx: 138, rz: 134, ragged: 1.1 },
  // the fell neck north into the Harrowfells, straddling z -180
  { x: -740, z: -176, rx: 52, rz: 74, ragged: 0.8 },
  // the Harrowfells
  { x: -740, z: 0, rx: 118, rz: 140, ragged: 1.2 },
  // the ward neck north into the Wardmere, straddling z 180
  { x: -748, z: 180, rx: 48, rz: 58, ragged: 0.8 },
  // the Wardmere
  { x: -748, z: 362, rx: 106, rz: 140, ragged: 1.1 },
];

export const FRONTIER_NECKS: readonly FrontierNeck[] = [
  // the Applewold causeway's frontier half: the tie-in's south end up onto the downs
  { ax: 378, az: -192, bx: 374, bz: -240, halfWidth: 13, ha: -1.2, hb: -0.4 },
  // the Southway's frontier half: the tie-in's south end over to the Kindlemoor
  { ax: 72, az: -178, bx: 64, bz: -272, halfWidth: 12, ha: -2.4, hb: -2.2 },
  // the Saltmeads gate: the Applewold's south downs over the strait to the Saltmeads
  { ax: 330, az: -496, bx: 332, bz: -596, halfWidth: 13, ha: -1.4, hb: -1.2 },
  // the Chalkbarrow pass: down from Wreckers' Cove's east headland to the Tinmarch
  { ax: -232, az: -462, bx: -258, bz: -652, halfWidth: 12, ha: -1.6, hb: -1.4 },
  // the land links between the new zones, so every road crossing stays dry
  // however the coasts wobble: the salt way, the tinners' ford, the rook
  // ford, the sedge neck, the fell neck and the ward neck
  { ax: 110, az: -718, bx: 250, bz: -726, halfWidth: 14, ha: -2.2, hb: -2.2 },
  { ax: -120, az: -700, bx: -256, bz: -712, halfWidth: 14, ha: -2.2, hb: -2.2 },
  { ax: -456, az: -722, bx: -640, bz: -716, halfWidth: 14, ha: -2.2, hb: -2.2 },
  { ax: -716, az: -620, bx: -712, bz: -456, halfWidth: 14, ha: -2.2, hb: -2.2 },
  { ax: -730, az: -260, bx: -738, bz: -80, halfWidth: 14, ha: -2.2, hb: -2.2 },
  { ax: -738, az: 100, bx: -748, bz: 270, halfWidth: 14, ha: -2.2, hb: -2.2 },
];

/** Necks that reach INTO the core rect to meet an old coast (raise-only). Each
 *  one's footprint is exempted in tests/world_core_terrain_parity.test.ts. */
export const FRONTIER_TIE_INS: readonly FrontierNeck[] = [
  // the Applewold causeway off the Farshore's south point (the Sundered
  // Cliffs' foot, where the island's shore reaches z ~ -120)
  { ax: 382, az: -114, bx: 378, bz: -196, halfWidth: 14, ha: -1.0, hb: -1.2 },
  // the Southway off Eastbrook's south shore, east of the town (the shore
  // there sits at about -3; the crown never drops below the tide line)
  { ax: 74, az: -122, bx: 71, bz: -232, halfWidth: 12, ha: -2.6, hb: -2.4 },
];

export const FRONTIER_RIDGES: readonly FrontierRidge[] = [
  // the Applewold: low south downs and the blossom rise
  { ax: 236, az: -470, bx: 480, bz: -478, halfWidth: 44, height: 9 },
  { ax: 446, az: -306, bx: 494, bz: -262, halfWidth: 34, height: 11 },
  // the Kindlemoor: the moor spine and the grey tor
  { ax: -122, az: -468, bx: 122, bz: -490, halfWidth: 56, height: 16 },
  { ax: 70, az: -440, bx: 108, bz: -462, halfWidth: 26, height: 12 },
  // the Chalkbarrow Coast: the chalk cliffs along the south shore and the
  // White Head's crown
  { ax: -492, az: -478, bx: -262, bz: -492, halfWidth: 40, height: 20 },
  { ax: -490, az: -306, bx: -452, bz: -296, halfWidth: 30, height: 14 },
  // the Saltmeads: low salt downs and the Gannet Stack
  { ax: 250, az: -830, bx: 430, bz: -846, halfWidth: 40, height: 8 },
  { ax: 452, az: -812, bx: 488, bz: -790, halfWidth: 26, height: 16 },
  // the Wychwold: the old wold's crown and the charcoal hollow's rim
  { ax: -120, az: -820, bx: 60, bz: -840, halfWidth: 50, height: 14 },
  { ax: 70, az: -780, bx: 124, bz: -812, halfWidth: 22, height: 7 },
  // the Tinmarch: the tin ridge and the adit's spoil heap
  { ax: -480, az: -800, bx: -380, bz: -820, halfWidth: 44, height: 18 },
  { ax: -286, az: -826, bx: -240, bz: -818, halfWidth: 22, height: 10 },
  // the Rookcliffs: the cliff wall along the south shore
  { ax: -830, az: -830, bx: -600, bz: -838, halfWidth: 40, height: 22 },
  // the Sedgemarch: a low wold rib on the west shore
  { ax: -830, az: -460, bx: -820, bz: -300, halfWidth: 34, height: 9 },
  // the Harrowfells: the high fell and the cairn rise
  { ax: -830, az: -60, bx: -812, bz: 90, halfWidth: 46, height: 24 },
  { ax: -720, az: 100, bx: -660, bz: 120, halfWidth: 26, height: 12 },
  // the Wardmere: the beacon crag
  { ax: -800, az: 430, bx: -776, bz: 472, halfWidth: 26, height: 14 },
];

export const FRONTIER_LAKES: readonly FrontierLake[] = [
  { x: A.ciderMere.x, z: A.ciderMere.z, radius: 11 },
  { x: A.moorTarn.x, z: A.moorTarn.z, radius: 10 },
  { x: A.chalkMere.x, z: A.chalkMere.z, radius: 10 },
  { x: A.brinePans.x, z: A.brinePans.z, radius: 9 },
  { x: A.heronMere.x, z: A.heronMere.z, radius: 12 },
  { x: A.harrowTarn.x, z: A.harrowTarn.z, radius: 10 },
  { x: A.wardMere.x, z: A.wardMere.z, radius: 13 },
  { x: A.hazelPool.x, z: A.hazelPool.z, radius: 9 },
];

export const FRONTIER_FLATS: readonly FrontierFlat[] = [
  { x: A.pressford.x, z: A.pressford.z, r: 17 },
  { x: A.pressfordYard.x, z: A.pressfordYard.z, r: 7 },
  { x: A.wardenPost.x, z: A.wardenPost.z, r: 9 },
  { x: A.ferncross.x, z: A.ferncross.z, r: 15 },
  { x: A.ferncrossYard.x, z: A.ferncrossYard.z, r: 7 },
  { x: A.firstHearthRing.x, z: A.firstHearthRing.z, r: 13 },
  { x: A.coinwell.x, z: A.coinwell.z, r: 15 },
  { x: A.coinwellYard.x, z: A.coinwellYard.z, r: 7 },
  { x: A.unlitDig.x, z: A.unlitDig.z, r: 14 },
  { x: A.panwick.x, z: A.panwick.z, r: 16 },
  { x: A.panwickYard.x, z: A.panwickYard.z, r: 7 },
  { x: A.elmhallow.x, z: A.elmhallow.z, r: 16 },
  { x: A.elmhallowYard.x, z: A.elmhallowYard.z, r: 7 },
  { x: A.whealPatience.x, z: A.whealPatience.z, r: 16 },
  { x: A.whealYard.x, z: A.whealYard.z, r: 7 },
  { x: A.kestrelPoint.x, z: A.kestrelPoint.z, r: 16 },
  { x: A.kestrelYard.x, z: A.kestrelYard.z, r: 7 },
  { x: A.withyholt.x, z: A.withyholt.z, r: 16 },
  { x: A.withyholtYard.x, z: A.withyholtYard.z, r: 7 },
  { x: A.fellgate.x, z: A.fellgate.z, r: 16 },
  { x: A.fellgateYard.x, z: A.fellgateYard.z, r: 7 },
  { x: A.lanternfold.x, z: A.lanternfold.z, r: 16 },
  { x: A.lanternfoldYard.x, z: A.lanternfoldYard.z, r: 7 },
  { x: A.stannaryStones.x, z: A.stannaryStones.z, r: 11 },
  { x: A.heathwardTower.x, z: A.heathwardTower.z, r: 8 },
  { x: A.oldTollHouse.x, z: A.oldTollHouse.z, r: 8 },
  { x: A.droversRest.x, z: A.droversRest.z, r: 10 },
];
