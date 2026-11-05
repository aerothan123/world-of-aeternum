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
  wreckersCove: { x: -262, z: -452 },
  westHeath: { x: -190, z: -398 },
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
];

export const FRONTIER_NECKS: readonly FrontierNeck[] = [
  // the Applewold causeway's frontier half: the tie-in's south end up onto the downs
  { ax: 378, az: -192, bx: 374, bz: -240, halfWidth: 13, ha: -1.2, hb: -0.4 },
];

/** Necks that reach INTO the core rect to meet an old coast (raise-only). Each
 *  one's footprint is exempted in tests/world_core_terrain_parity.test.ts. */
export const FRONTIER_TIE_INS: readonly FrontierNeck[] = [
  // the Applewold causeway off the Farshore's south point (the Sundered
  // Cliffs' foot, where the island's shore reaches z ~ -120)
  { ax: 382, az: -114, bx: 378, bz: -196, halfWidth: 14, ha: -1.0, hb: -1.2 },
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
];

export const FRONTIER_LAKES: readonly FrontierLake[] = [
  { x: A.ciderMere.x, z: A.ciderMere.z, radius: 11 },
  { x: A.moorTarn.x, z: A.moorTarn.z, radius: 10 },
  { x: A.chalkMere.x, z: A.chalkMere.z, radius: 10 },
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
];
