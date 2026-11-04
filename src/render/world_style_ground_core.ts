// World Style Refined: the painted storybook ground. Three/DOM-free,
// deterministic, registered in RENDER_PURE_CORES (tests/architecture.test.ts).
//
// Decides WHICH painted set (public/textures/terrain/Painted*, built by
// scripts/assets/build_painted_ground.mjs) feeds each terrain surface role
// under Refined, which file every packed albedo layer loads per style, and
// the blend weights of the painted-only terms (forest floor, town paving,
// wet moss, the painted meadow over the baked blade layer). The shader text
// is world_style_glsl.ts, generated from the constants here; the JS mirrors
// below are what tests/world_style_ground_core.test.ts pins.
//
// The swap is a RELOAD-time style choice: terrain.ts resolves the files when
// it prepares the profile's assets and the layer list when it builds the
// splat material, so a live session never relinks the ground. Classic loads
// the shipped photo files into the shipped six layers, untouched.

import type { WorldStyle } from './world_style_core';

/** The surface roles the Refined ground paints. */
export type PaintedGroundRole =
  | 'meadow'
  | 'dryGrass'
  | 'path'
  | 'paving'
  | 'beach'
  | 'cliff'
  | 'forest'
  | 'wet';

/** The painted set (TerrainTextureSet key) each role draws. */
export const PAINTED_GROUND_SETS: Readonly<Record<PaintedGroundRole, string>> = {
  meadow: 'PaintedMeadow',
  dryGrass: 'PaintedDryGrass',
  path: 'PaintedDirt',
  paving: 'PaintedCobble',
  beach: 'PaintedSand',
  cliff: 'PaintedCliff',
  forest: 'PaintedForestFloor',
  wet: 'PaintedMoss',
};

const colorFile = (role: PaintedGroundRole): string => `${PAINTED_GROUND_SETS[role]}_Color.jpg`;

/** The Classic splat layers whose photo Refined replaces IN PLACE: same layer
 *  index, so every WOC_L_* constant, the Classic shader text and the packed
 *  array's Classic six stay exactly where they were. Mud (the marsh path
 *  swap) and snow keep their photos: a marsh road is still a road. */
export const REFINED_BASE_LAYER_ROLES: Readonly<Record<string, PaintedGroundRole>> = {
  grassC: 'meadow',
  dirtC: 'path',
  rockC: 'cliff',
  sandC: 'beach',
};

/** The file a packed albedo layer loads under a style. */
export function splatLayerFile(layerKey: string, classicFile: string, style: WorldStyle): string {
  if (style !== 'refined') return classicFile;
  const role = REFINED_BASE_LAYER_ROLES[layerKey];
  return role ? colorFile(role) : classicFile;
}

/** The layers Refined APPENDS after the Classic six, in packed order. The
 *  dry meadow variant and the shoulder gravel predate the painted sets (the
 *  variant now draws the painted dry grass; the gravel keeps its photo, at a
 *  lighter weight); forest floor, paving and moss are painted-only. */
export const REFINED_EXTRA_LAYER_FILES = {
  grassVariantC: colorFile('dryGrass'),
  gravelC: 'Gravel024_Color.jpg',
  forestC: colorFile('forest'),
  cobbleC: colorFile('paving'),
  mossC: colorFile('wet'),
} as const;
export const REFINED_LAYER_FOREST = 8;
export const REFINED_LAYER_COBBLE = 9;
export const REFINED_LAYER_MOSS = 10;

/** Blend constants of the painted terms (the GLSL is generated from these). */
export const REFINED_GROUND = {
  /** Painted meadow over the baked blade layer: share replaced, and the
   *  per-channel detail ratio's clamp (the meadow keeps the biome's own
   *  tone, so the far field still equals the blades' average). */
  meadowReplace: 0.88,
  meadowRatioLo: 0.5,
  meadowRatioHi: 1.75,
  /** Painted meadow tiling, in splat UV (tuv, 4.5 yd a repeat): a 6 yd
   *  octave and a rotated 15 yd octave so the tufts never line up. */
  meadowScale: 0.75,
  meadowScaleCoarse: 0.3,
  /** Forest floor on turf whose per-vertex grass tint is dark (the woodland
   *  realms and the deepest lush patches): linear tint luma window. */
  forestLumaHi: 0.2,
  forestLumaLo: 0.1,
  forestMax: 0.85,
  /** Share of the forest weight that survives on the patch noise's low end. */
  forestFloorNoise: 0.55,
  forestScale: 0.9,
  forestGain: 1.05,
  /** Town paving: rock-layer weight on near-flat ground is laid stone (the
   *  Amberfall's roads and plaza; a cliff is never flat). Normal y window. */
  pavingFlatLo: 0.86,
  pavingFlatHi: 0.96,
  pavingMax: 0.92,
  pavingScale: 0.8,
  pavingGain: 0.95,
  /** Wet moss on turf: the marsh weight, and the band just above the
   *  waterline, broken by the low end of the variant noise. */
  mossMarsh: 0.72,
  mossShore: 0.5,
  mossNoiseLo: 0.25,
  mossNoiseHi: 0.62,
  mossScale: 0.75,
  mossGain: 0.9,
  /** Painted dune ripples over the palette sand: detail ratio strength. */
  sandRipple: 0.55,
  sandScale: 0.5,
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export interface RefinedGroundInput {
  /** Splat weights after the Classic blend (grass, dirt, rock, sand). */
  readonly grass: number;
  readonly rock: number;
  /** Linear luma of the per-vertex ground tint (vColor). */
  readonly tintLuma: number;
  /** World-space surface normal y (1 flat). */
  readonly normalY: number;
  /** The marsh weight (vExtra.x). */
  readonly marsh: number;
  /** Height above the waterline in yards. */
  readonly heightAboveWater: number;
  /** The shared variant noise 0..1 (the dry meadow patches ride its HIGH
   *  end, moss its low end, so the two never stack). */
  readonly variantNoise: number;
  /** The snow weight (vExtra.y): painted terms stay off snowfields. */
  readonly snow: number;
}

export interface RefinedGroundWeights {
  readonly forest: number;
  readonly paving: number;
  readonly moss: number;
}

/** JS mirror of the shader's painted-term weights at one ground point. */
export function refinedGroundWeights(i: RefinedGroundInput): RefinedGroundWeights {
  const g = REFINED_GROUND;
  const open = 1 - clamp01(i.snow);
  const forest =
    i.grass *
    smoothstep(g.forestLumaHi, g.forestLumaLo, i.tintLuma) *
    g.forestMax *
    (g.forestFloorNoise + (1 - g.forestFloorNoise) * i.variantNoise) *
    open;
  const paving =
    i.rock * smoothstep(g.pavingFlatLo, g.pavingFlatHi, i.normalY) * g.pavingMax * open;
  const shore = 1 - smoothstep(0.25, 2.6, i.heightAboveWater);
  const moss =
    i.grass *
    Math.max(clamp01(i.marsh) * g.mossMarsh, shore * g.mossShore) *
    smoothstep(g.mossNoiseHi, g.mossNoiseLo, i.variantNoise) *
    open;
  return { forest, paving, moss };
}

/** JS mirror of the painted meadow's per-channel detail over the biome tone:
 *  the painted texel's ratio to the painted layer's mean, clamped, scales
 *  the Classic grass tone. Its mean over the tile IS the tone (up to the
 *  clamp), which is what keeps the far handoff seamless. */
export function refinedMeadowTexel(
  painted: readonly [number, number, number],
  paintedMean: readonly [number, number, number],
  tone: readonly [number, number, number],
): [number, number, number] {
  const g = REFINED_GROUND;
  const r = (c: number) =>
    Math.min(
      g.meadowRatioHi,
      Math.max(g.meadowRatioLo, painted[c] / Math.max(paintedMean[c], 1e-3)),
    );
  return [tone[0] * r(0), tone[1] * r(1), tone[2] * r(2)];
}
