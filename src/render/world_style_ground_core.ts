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
  | 'wet'
  | 'mud'
  | 'snow';

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
  mud: 'PaintedMud',
  snow: 'PaintedSnow',
};

const colorFile = (role: PaintedGroundRole): string => `${PAINTED_GROUND_SETS[role]}_Color.jpg`;

/** The Classic splat layers whose photo Refined replaces IN PLACE: same layer
 *  index, so every WOC_L_* / WOC_N_* constant, the Classic shader text and
 *  the packed arrays' Classic layers stay exactly where they were. Colour
 *  keys (`*C`) take the painted Color map, normal keys (`*N`) its NormalGL
 *  map. Mud (the marsh path swap) and snow have no detail-normal layer, so
 *  only their colour is painted. */
export const REFINED_BASE_LAYER_ROLES: Readonly<Record<string, PaintedGroundRole>> = {
  grassC: 'meadow',
  dirtC: 'path',
  rockC: 'cliff',
  sandC: 'beach',
  mudC: 'mud',
  snowC: 'snow',
  grassN: 'meadow',
  dirtN: 'path',
  rockN: 'cliff',
  sandN: 'beach',
};

/** The file a packed albedo or detail-normal layer loads under a style. */
export function splatLayerFile(layerKey: string, classicFile: string, style: WorldStyle): string {
  if (style !== 'refined') return classicFile;
  const role = REFINED_BASE_LAYER_ROLES[layerKey];
  if (!role) return classicFile;
  return layerKey.endsWith('N') ? `${PAINTED_GROUND_SETS[role]}_NormalGL.jpg` : colorFile(role);
}

/** True for a painted-set file: these ship as plain JPGs with no KTX2
 *  sibling (no encoder in this build's toolchain; the desktop build accepts
 *  them), so the terrain loads them as images and packs their normals into
 *  an uncompressed array instead of the compressed Classic one. */
export function isPaintedGroundFile(file: string): boolean {
  return /^Painted[A-Za-z]+_[A-Za-z]+\.jpg$/.test(file);
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
  meadowReplace: 0.9,
  meadowRatioLo: 0.55,
  meadowRatioHi: 1.6,
  /** Painted meadow tiling, in splat UV (tuv, 4.5 yd a repeat): one read
   *  at an 8 yd period (the Classic octaves already break the bake's tiling). */
  meadowScale: 0.55,
  /** Share of the meadow detail that keeps its own hue (the rest is a
   *  luminance ratio), so painted tufts vary the turf without saturating it. */
  meadowChroma: 0.45,
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
  /** Flat rock in this band above the waterline (yards) is not paving but
   *  surf-worn shore stone: the cobbles fade out and the painted sand tone
   *  takes up to shoreSandMax of it (the starter beach drew a dark cobble
   *  patch where its rock weight met the sand). */
  pavingShoreLo: 0.6,
  pavingShoreHi: 3,
  shoreSandMax: 0.85,
  /** Wet moss on turf: the marsh weight, and the band just above the
   *  waterline, broken by the low end of the variant noise. */
  mossMarsh: 0.72,
  mossShore: 0.5,
  mossNoiseLo: 0.25,
  mossNoiseHi: 0.62,
  mossScale: 0.75,
  mossGain: 0.9,
  /** Painted dune ripples over the palette sand: LUMINANCE detail ratio
   *  strength (the palette keeps the sand's hue, so a beach stays cream). */
  sandRipple: 0.55,
  sandScale: 0.5,
} as const;

/** Refined cliffs: the wall-projected rock the Classic splat composes,
 *  retuned so the painted cliff set reads as painted stone. */
export const REFINED_CLIFF = {
  /** The XY / ZY wall-plane crossfade (Classic: linear over the whole
   *  x/z normal share) narrowed to this window, so a diagonal face shows one
   *  plane's strokes instead of two half-strength ghosted copies. */
  axisLo: 0.3,
  axisHi: 0.7,
  /** The wall projection's onset by normal y: none at wallFlat, full at
   *  wallFull (Classic ramps linearly from 0.69 to 0, so a 60 degree face
   *  still drew a third of its rock from the flat projection, stretched
   *  down the slope into vertical streaks). */
  wallFlat: 0.85,
  wallFull: 0.55,
  /** Share the wall rock is pulled toward flat chalk (Classic 0.38, which
   *  washes the painted plates and cracks out to a smooth grey sheet). */
  chalk: 0.12,
  /** Share of the turf tint a steep face's rock keeps (the rest of the face
   *  is neutral stone, so a grassy hillside's cliff stops reading green). */
  turfTint: 0.3,
  /** Share of a wall's final albedo pulled to a warm neutral of its own
   *  value (the hillside's green vertex tint still cast the stone green). */
  neutral: 0.45,
  /** The painted slate's crack highlights compressed toward this linear
   *  value (keep: share of the uncompressed highlight that survives). */
  highlightCap: 0.5,
  highlightKeep: 0.35,
} as const;

/** Refined ground detail: a second, rotated sample of the mud and snow
 *  layers at another scale, blended by the hill-scale macro noise (mud) or
 *  evenly (snow), so marsh roads stop showing one tile of clumps and the
 *  snow's directional strokes stop lining up into streaks. */
export const REFINED_DETAIL = {
  mudScale2: 0.37,
  snowScale2: 0.31,
  snowMix: 0.5,
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** JS mirror of the Refined wall-plane weight: `axisRaw` is the Classic
 *  an.x / (an.x + an.z) share of the ZY plane. */
export function refinedCliffAxisWeight(axisRaw: number): number {
  return smoothstep(REFINED_CLIFF.axisLo, REFINED_CLIFF.axisHi, axisRaw);
}

/** JS mirror of the Refined wall-projection weight at a normal y. */
export function refinedCliffWallWeight(normalY: number): number {
  return smoothstep(REFINED_CLIFF.wallFlat, REFINED_CLIFF.wallFull, Math.abs(normalY));
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
  /** Flat shore rock drawn as the painted sand tone. */
  readonly shoreSand: number;
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
  const flat = smoothstep(g.pavingFlatLo, g.pavingFlatHi, i.normalY);
  const shoreStone = 1 - smoothstep(g.pavingShoreLo, g.pavingShoreHi, i.heightAboveWater);
  const paving = i.rock * flat * g.pavingMax * open * (1 - shoreStone);
  const shoreSand = i.rock * flat * shoreStone * g.shoreSandMax * open;
  const shore = 1 - smoothstep(0.25, 2.6, i.heightAboveWater);
  const moss =
    i.grass *
    Math.max(clamp01(i.marsh) * g.mossMarsh, shore * g.mossShore) *
    smoothstep(g.mossNoiseHi, g.mossNoiseLo, i.variantNoise) *
    open;
  return { forest, paving, moss, shoreSand };
}

/** JS mirror of the painted meadow's detail over the biome tone: the painted
 *  texel's ratio to the painted layer's mean (mostly luminance, part hue),
 *  clamped, scales the Classic grass tone. Its mean over the tile IS the tone (up to the
 *  clamp), which is what keeps the far handoff seamless. */
export function refinedMeadowTexel(
  painted: readonly [number, number, number],
  paintedMean: readonly [number, number, number],
  tone: readonly [number, number, number],
): [number, number, number] {
  const g = REFINED_GROUND;
  const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const lr = luma(painted) / Math.max(luma(paintedMean), 1e-3);
  const r = (c: number) => {
    const ratio = lr + (painted[c] / Math.max(paintedMean[c], 1e-3) - lr) * g.meadowChroma;
    return Math.min(g.meadowRatioHi, Math.max(g.meadowRatioLo, ratio));
  };
  return [tone[0] * r(0), tone[1] * r(1), tone[2] * r(2)];
}
