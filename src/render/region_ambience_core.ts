// The region ambience readout: which long environment beds (the island surf, a town's
// streets by day or by night, the open meadow and the country at night, the deep forest,
// the marsh, each realm's own air, and the cave, crypt and hall interiors) play where the
// local player stands, and how loud. The audio sink (src/game/sfx.ts regionBeds) loops each
// bed at its weight times its mix gain on the Ambience bus.
//
// Every weight moves continuously with position, so nothing steps at a line on the map:
//   * the zone bed is a 9-tap average of the bed each nearby zone carries (taps out to
//     ZONE_BLEND_YARDS each way), so a zone border is a crossfade about 64 yards wide;
//   * a town soundscape swells over TOWN_FADE_YARDS outside its hub's radius and, while it
//     plays, ducks the zone bed under it (the meadow is still there at the gate, faintly);
//   * inside a meadow zone the forest bed takes over in proportion to the nearby tree
//     density (the caller's forest sampler), so a wood in the vale sounds like a wood;
//   * day and night are one weight (the caller's dayWeight), so dusk blends the town's two
//     variants, and the meadow's larks into the country's crickets, instead of switching.
// Inside an instance the bed follows the dungeon's interior (cave, mine, crypt, stone hall,
// keep, palace, flooded bastion, forge, the raid cavern, the jungle caldera, and the player
// house's hearth); an unmapped interior plays none (the older dungeon air alone). It also names the reverb space a dense wood implies (null: keep the biome's own),
// and how much of the older beds (the short wind, birdsong and dungeon loops) still plays
// under the new ones.
//
// Pure, deterministic and allocation-free (RENDER_PURE_CORES): the zone lookup and every
// input are injected; the caller owns the readout and refills it per frame.

import type { BiomeId } from '../sim/types';

/** The region beds, in readout order. */
export const REGION_BED_KEYS = [
  'amb_bed_shore',
  'amb_bed_town_day',
  'amb_bed_town_night',
  'amb_bed_meadow',
  'amb_bed_forest',
  'amb_bed_marsh',
  'amb_bed_night_wild',
  'amb_bed_peaks',
  'amb_bed_harbor',
  'amb_bed_cave',
  'amb_bed_crypt',
  'amb_bed_temple',
  'amb_bed_jungle',
  'amb_bed_frost',
  'amb_bed_ember',
  'amb_bed_haunt',
  'amb_bed_garden',
  'amb_bed_amber',
  'amb_bed_gale',
  'amb_bed_dusk',
  'amb_bed_wildheart',
  'amb_bed_castle',
  'amb_bed_palace',
  'amb_bed_bastion',
  'amb_bed_forge',
  'amb_bed_lair',
  'amb_bed_mine',
  'amb_bed_house',
] as const;
export type RegionBedKey = (typeof REGION_BED_KEYS)[number];

const bed = (key: RegionBedKey): number => REGION_BED_KEYS.indexOf(key);
const TOWN_DAY = bed('amb_bed_town_day');
const TOWN_NIGHT = bed('amb_bed_town_night');
const MEADOW = bed('amb_bed_meadow');
const FOREST = bed('amb_bed_forest');
const NIGHT_WILD = bed('amb_bed_night_wild');
const HARBOR = bed('amb_bed_harbor');
const CAVE = bed('amb_bed_cave');
const CRYPT = bed('amb_bed_crypt');
const TEMPLE = bed('amb_bed_temple');
const WILDHEART = bed('amb_bed_wildheart');
const CASTLE = bed('amb_bed_castle');
const PALACE = bed('amb_bed_palace');
const BASTION = bed('amb_bed_bastion');
const FORGE = bed('amb_bed_forge');
const LAIR = bed('amb_bed_lair');
const MINE = bed('amb_bed_mine');
const HOUSE = bed('amb_bed_house');

/** Each bed's loop gain at full weight: every master's measured loudness (the build log of
 *  scripts/sfx/ambience_beds_sfx.mjs) brought to about -30 LUFS effective, a little over
 *  the old 8 s biome loops these replace; interiors sit a touch lower, the house lower
 *  still. */
export const REGION_BED_GAINS: Readonly<Record<RegionBedKey, number>> = Object.freeze({
  amb_bed_shore: 0.3,
  amb_bed_town_day: 0.29,
  amb_bed_town_night: 0.3,
  amb_bed_meadow: 0.31,
  amb_bed_forest: 0.32,
  amb_bed_marsh: 0.3,
  amb_bed_night_wild: 0.33,
  amb_bed_peaks: 0.53,
  amb_bed_harbor: 0.32,
  amb_bed_cave: 0.55,
  amb_bed_crypt: 0.28,
  amb_bed_temple: 0.28,
  amb_bed_jungle: 0.31,
  amb_bed_frost: 0.33,
  amb_bed_ember: 0.32,
  amb_bed_haunt: 0.33,
  amb_bed_garden: 0.31,
  amb_bed_amber: 0.75,
  amb_bed_gale: 0.32,
  amb_bed_dusk: 0.32,
  amb_bed_wildheart: 0.28,
  amb_bed_castle: 0.48,
  amb_bed_palace: 0.41,
  amb_bed_bastion: 0.61,
  amb_bed_forge: 0.28,
  amb_bed_lair: 0.27,
  amb_bed_mine: 1,
  amb_bed_house: 1,
});

/** How far each way the zone bed's taps reach (yards). */
export const ZONE_BLEND_YARDS = 32;
/** A town soundscape fades out over this many yards outside its hub radius. */
export const TOWN_FADE_YARDS = 46;
/** ...and is whole this many yards inside it (the gate is already the street). */
export const TOWN_INNER_YARDS = 6;
/** How much of the zone bed a town at full weight takes away. */
export const TOWN_DUCK = 0.75;
/** Share of a forest's bed the night crickets add under it after dark. */
export const FOREST_NIGHT_CRICKETS = 0.35;
/** Forest density (0..1) at which the wood's reverb space replaces the biome's. */
export const FOREST_REVERB_AT = 0.5;
/** Share of the older loops that plays where the new beds cover fully. */
export const LEGACY_FLOOR = 0.2;
/** Below this a bed is silent (the sink stops its loop). */
export const REGION_BED_SILENT = 2e-3;

/** A zone as the readout needs it (the shape of ZoneDef's fields it reads). */
export interface RegionZone {
  readonly id: string;
  readonly biome: BiomeId;
  readonly hub?: { readonly x: number; readonly z: number; readonly radius: number };
}

/** A town soundscape: the zone whose hub it plays around, its day and night beds, and how
 *  much of them (a mountain hold is quieter than the vale's market town). */
export interface TownSoundscape {
  readonly zoneId: string;
  readonly day: number;
  readonly night: number;
  readonly level: number;
}

/** The towns with a soundscape. */
export const TOWN_SOUNDSCAPES: readonly TownSoundscape[] = Object.freeze([
  { zoneId: 'eastbrook_vale', day: TOWN_DAY, night: TOWN_NIGHT, level: 1 },
  // Fenbridge: the same river-town life, a little thinner over the marsh
  { zoneId: 'mirefen_marsh', day: TOWN_DAY, night: TOWN_NIGHT, level: 0.75 },
  // Highwatch: a hold on the heights, its street life half heard under the wind
  { zoneId: 'thornpeak_heights', day: TOWN_DAY, night: TOWN_NIGHT, level: 0.5 },
  // Goldcrest's quays: the harbour by day, the town's quiet night by its water
  { zoneId: 'goldcrest_harbor', day: HARBOR, night: TOWN_NIGHT, level: 1 },
]);

/** Zones whose bed their id decides, over their biome's. */
const ZONE_BED_BY_ID: Readonly<Record<string, RegionBedKey>> = Object.freeze({
  proving_shore: 'amb_bed_shore',
  farshore_isle: 'amb_bed_shore',
  goldcrest_harbor: 'amb_bed_shore',
});

/** Each biome's bed (none: the older loops alone). */
const ZONE_BED_BY_BIOME: Readonly<Partial<Record<BiomeId, RegionBedKey>>> = Object.freeze({
  vale: 'amb_bed_meadow',
  beach: 'amb_bed_shore',
  marsh: 'amb_bed_marsh',
  fen: 'amb_bed_marsh',
  peaks: 'amb_bed_peaks',
  desert: 'amb_bed_gale',
  volcano: 'amb_bed_ember',
  cave: 'amb_bed_cave',
  dusk: 'amb_bed_dusk',
  ember: 'amb_bed_ember',
  frost: 'amb_bed_frost',
  amber: 'amb_bed_amber',
  night: 'amb_bed_night_wild',
  haunt: 'amb_bed_haunt',
  jungle: 'amb_bed_jungle',
  garden: 'amb_bed_garden',
  gale: 'amb_bed_gale',
});

/** Each dungeon interior's bed. Anything unmapped plays none. */
const INTERIOR_BED: Readonly<Record<string, number>> = Object.freeze({
  cave: CAVE,
  mine: MINE,
  nythraxis: LAIR,
  crypt: CRYPT,
  hollow_crypt: CRYPT,
  gravewyrm_sanctum: CRYPT,
  sanctum: TEMPLE,
  temple: TEMPLE,
  drowned_temple: TEMPLE,
  sunken_bastion: BASTION,
  lastkeep: CASTLE,
  dawnhold: PALACE,
  ignivar: FORGE,
  ignivar_approach: FORGE,
  ignivar_lift: FORGE,
  ignivar_depths: FORGE,
  wildheart: WILDHEART,
  house: HOUSE,
});

/** The bed index a dungeon interior plays, or -1 for none. */
export function interiorBedIndex(interior: string | null): number {
  if (interior === null) return -1;
  return Object.hasOwn(INTERIOR_BED, interior) ? INTERIOR_BED[interior] : -1;
}

/** The zone bed a zone carries (its id first, then its biome), or -1 for none. */
export function zoneBedIndex(zone: RegionZone): number {
  const key = Object.hasOwn(ZONE_BED_BY_ID, zone.id)
    ? ZONE_BED_BY_ID[zone.id]
    : ZONE_BED_BY_BIOME[zone.biome];
  return key ? bed(key) : -1;
}

export interface RegionAmbience {
  /** The bed keys, REGION_BED_KEYS. */
  readonly keys: readonly RegionBedKey[];
  /** Weight 0..1 per bed, in `keys` order. */
  readonly weights: Float32Array;
  /** Loop gain per bed (weight times REGION_BED_GAINS), in `keys` order. */
  readonly gains: Float32Array;
  /** Share of the older loops (amb_wind_vale, amb_birds, amb_wind_marsh, amb_dungeon) to
   *  keep. */
  legacyScale: number;
  /** The reverb space the surroundings imply over the biome's own (an outdoor_reverb_ir
   *  ReverbEnv), or null to keep the biome's. */
  reverbEnv: 'forest' | null;
}

export function createRegionAmbience(): RegionAmbience {
  return {
    keys: REGION_BED_KEYS,
    weights: new Float32Array(REGION_BED_KEYS.length),
    gains: new Float32Array(REGION_BED_KEYS.length),
    legacyScale: 1,
    reverbEnv: null,
  };
}

function smoothstep(e0: number, e1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** The 9 taps (x and z in reach units, weight): the centre, then eight scattered round it
 *  so that no two share an x offset or a z offset. A straight border (the zones are
 *  rectangles) therefore passes one tap at a time, a step of a tenth (the centre's fifth at
 *  most), and the loop gain ramp smooths each. */
const TAPS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0.2],
  [-1, 0.5, 0.1],
  [-0.75, -1, 0.1],
  [-0.5, 0.25, 0.1],
  [-0.25, -0.5, 0.1],
  [0.25, 0.75, 0.1],
  [0.5, -0.25, 0.1],
  [0.75, 1, 0.1],
  [1, -0.75, 0.1],
];

export interface RegionAmbienceInput {
  x: number;
  z: number;
  inDungeon: boolean;
  /** The instance's interior (DungeonDef.interior) while inDungeon, else null. */
  dungeonInterior: string | null;
  /** 1 by day, 0 by night, between at dawn and dusk. */
  dayWeight: number;
  /** Nearby tree density 0..1 (1 = a closed wood). */
  forestDensity: number;
}

function finish(out: RegionAmbience, forest: number): RegionAmbience {
  const w = out.weights;
  let cover = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] < REGION_BED_SILENT) w[i] = 0;
    cover += w[i];
    out.gains[i] = w[i] * REGION_BED_GAINS[REGION_BED_KEYS[i]];
  }
  out.legacyScale = 1 - (1 - LEGACY_FLOOR) * Math.min(1, cover);
  if (forest >= FOREST_REVERB_AT && w[FOREST] > w[MEADOW]) out.reverbEnv = 'forest';
  return out;
}

/**
 * Refill `out` for the listener described by `input`. `zoneAt` resolves the zone at a
 * point (src/sim/data.ts zoneAt on every shipped host); `zoneById` finds a town's zone.
 */
export function sampleRegionAmbienceInto(
  out: RegionAmbience,
  input: RegionAmbienceInput,
  zoneAt: (x: number, z: number) => RegionZone,
  zoneById: (id: string) => RegionZone | undefined,
): RegionAmbience {
  const w = out.weights;
  w.fill(0);
  out.gains.fill(0);
  out.reverbEnv = null;
  if (input.inDungeon) {
    const inside = interiorBedIndex(input.dungeonInterior);
    if (inside >= 0) w[inside] = 1;
    return finish(out, 0);
  }
  const day = Math.min(1, Math.max(0, input.dayWeight));
  // the zone bed, blended across borders
  for (const [tx, tz, tw] of TAPS) {
    const b = zoneBedIndex(
      zoneAt(input.x + tx * ZONE_BLEND_YARDS, input.z + tz * ZONE_BLEND_YARDS),
    );
    if (b >= 0) w[b] += tw;
  }
  // a wood inside a meadow zone sounds like a wood
  const forest = Math.min(1, Math.max(0, input.forestDensity));
  const toForest = w[MEADOW] * forest;
  w[MEADOW] -= toForest;
  w[FOREST] += toForest;
  // after dark the meadow's larks give way to the crickets, which creep under the wood too
  w[NIGHT_WILD] += w[MEADOW] * (1 - day) + w[FOREST] * FOREST_NIGHT_CRICKETS * (1 - day);
  w[MEADOW] *= day;
  // town soundscapes over the zone bed
  let town = 0;
  for (const t of TOWN_SOUNDSCAPES) {
    const hub = zoneById(t.zoneId)?.hub;
    if (!hub) continue;
    const d = Math.hypot(input.x - hub.x, input.z - hub.z);
    const tw = 1 - smoothstep(hub.radius - TOWN_INNER_YARDS, hub.radius + TOWN_FADE_YARDS, d);
    if (tw <= 0) continue;
    w[t.day] += tw * t.level * day;
    w[t.night] += tw * t.level * (1 - day);
    if (tw * t.level > town) town = tw * t.level;
  }
  if (town > 0) {
    const keep = 1 - TOWN_DUCK * town;
    for (let i = 0; i < w.length; i++) {
      if (i !== TOWN_DAY && i !== TOWN_NIGHT && i !== HARBOR) w[i] *= keep;
    }
  }
  return finish(out, forest);
}

/** 1 by day, 0 by night, for a day/night cycle phase (0 midnight, 0.5 noon): the sun's
 *  height through dawn and dusk, so the town's two variants crossfade over about 3 minutes
 *  of the 45-minute cycle, centred on sunrise and on sunset. */
export function dayWeightForPhase(phase: number): number {
  const elevation = -Math.cos(2 * Math.PI * phase);
  return smoothstep(-0.2, 0.2, elevation);
}
