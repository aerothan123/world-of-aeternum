// The region ambience readout: which long environment beds (the island surf, Eastbrook's
// streets by day or by night, the open meadow, the deep forest, the marsh) play where the
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
//     variants instead of switching them.
// It also names the reverb space a dense wood implies (null: keep the biome's own), and how
// much of the older biome beds (the short wind and birdsong loops) still plays under the
// new ones.
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
] as const;
export type RegionBedKey = (typeof REGION_BED_KEYS)[number];

const SHORE = 0;
const TOWN_DAY = 1;
const TOWN_NIGHT = 2;
const MEADOW = 3;
const FOREST = 4;
const MARSH = 5;

/** Each bed's loop gain at full weight. The masters land between -20 and -24 LUFS
 *  (scripts/sfx/ambience_beds_sfx.mjs); these put every bed near -30 LUFS effective, a
 *  little over the old 8 s biome loops, which they replace. */
export const REGION_BED_GAINS: Readonly<Record<RegionBedKey, number>> = Object.freeze({
  amb_bed_shore: 0.34,
  amb_bed_town_day: 0.46,
  amb_bed_town_night: 0.3,
  amb_bed_meadow: 0.3,
  amb_bed_forest: 0.44,
  amb_bed_marsh: 0.38,
});

/** How far each way the zone bed's taps reach (yards). */
export const ZONE_BLEND_YARDS = 32;
/** A town soundscape fades out over this many yards outside its hub radius. */
export const TOWN_FADE_YARDS = 46;
/** ...and is whole this many yards inside it (the gate is already the street). */
export const TOWN_INNER_YARDS = 6;
/** How much of the zone bed a town at full weight takes away. */
export const TOWN_DUCK = 0.75;
/** At night the meadow's larks and bees thin out to this share. */
export const MEADOW_NIGHT_SHARE = 0.45;
/** Forest density (0..1) at which the wood's reverb space replaces the biome's. */
export const FOREST_REVERB_AT = 0.5;
/** Share of the older biome loops that plays where the new beds cover fully. */
export const LEGACY_FLOOR = 0.2;
/** Below this a bed is silent (the sink stops its loop). */
export const REGION_BED_SILENT = 2e-3;

/** A zone as the readout needs it (the shape of ZoneDef's fields it reads). */
export interface RegionZone {
  readonly id: string;
  readonly biome: BiomeId;
  readonly hub?: { readonly x: number; readonly z: number; readonly radius: number };
}

/** A town soundscape: the zone whose hub it plays around, and its day and night beds. */
export interface TownSoundscape {
  readonly zoneId: string;
  readonly day: number;
  readonly night: number;
}

/** The towns with a soundscape of their own. */
export const TOWN_SOUNDSCAPES: readonly TownSoundscape[] = Object.freeze([
  { zoneId: 'eastbrook_vale', day: TOWN_DAY, night: TOWN_NIGHT },
]);

/** The zone bed a zone carries (its id first, then its biome), or -1 for none yet. */
export function zoneBedIndex(zone: RegionZone): number {
  if (zone.id === 'proving_shore') return SHORE;
  switch (zone.biome) {
    case 'beach':
      return SHORE;
    case 'marsh':
    case 'fen':
      return MARSH;
    case 'jungle':
    case 'haunt':
      return FOREST;
    case 'vale':
    case 'garden':
    case 'amber':
    case 'night':
      return MEADOW;
    default:
      return -1;
  }
}

export interface RegionAmbience {
  /** The bed keys, REGION_BED_KEYS. */
  readonly keys: readonly RegionBedKey[];
  /** Weight 0..1 per bed, in `keys` order. */
  readonly weights: Float32Array;
  /** Loop gain per bed (weight times REGION_BED_GAINS), in `keys` order. */
  readonly gains: Float32Array;
  /** Share of the older biome loops (amb_wind_vale, amb_birds, amb_wind_marsh) to keep. */
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
  /** 1 by day, 0 by night, between at dawn and dusk. */
  dayWeight: number;
  /** Nearby tree density 0..1 (1 = a closed wood). */
  forestDensity: number;
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
    out.legacyScale = 1;
    return out;
  }
  const day = Math.min(1, Math.max(0, input.dayWeight));
  // the zone bed, blended across borders
  for (const [tx, tz, tw] of TAPS) {
    const bed = zoneBedIndex(
      zoneAt(input.x + tx * ZONE_BLEND_YARDS, input.z + tz * ZONE_BLEND_YARDS),
    );
    if (bed >= 0) w[bed] += tw;
  }
  // a wood inside a meadow zone sounds like a wood
  const forest = Math.min(1, Math.max(0, input.forestDensity));
  const toForest = w[MEADOW] * forest;
  w[MEADOW] -= toForest;
  w[FOREST] += toForest;
  w[MEADOW] *= MEADOW_NIGHT_SHARE + (1 - MEADOW_NIGHT_SHARE) * day;
  // town soundscapes over the zone bed
  let town = 0;
  for (const t of TOWN_SOUNDSCAPES) {
    const hub = zoneById(t.zoneId)?.hub;
    if (!hub) continue;
    const d = Math.hypot(input.x - hub.x, input.z - hub.z);
    const tw = 1 - smoothstep(hub.radius - TOWN_INNER_YARDS, hub.radius + TOWN_FADE_YARDS, d);
    if (tw <= 0) continue;
    w[t.day] += tw * day;
    w[t.night] += tw * (1 - day);
    if (tw > town) town = tw;
  }
  if (town > 0) {
    const keep = 1 - TOWN_DUCK * town;
    w[SHORE] *= keep;
    w[MEADOW] *= keep;
    w[FOREST] *= keep;
    w[MARSH] *= keep;
  }
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

/** 1 by day, 0 by night, for a day/night cycle phase (0 midnight, 0.5 noon): the sun's
 *  height through dawn and dusk, so the town's two variants crossfade over about 3 minutes
 *  of the 45-minute cycle, centred on sunrise and on sunset. */
export function dayWeightForPhase(phase: number): number {
  const elevation = -Math.cos(2 * Math.PI * phase);
  return smoothstep(-0.2, 0.2, elevation);
}
