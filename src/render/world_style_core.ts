// World Style (Classic / Refined): the pure half. Three/DOM-free, deterministic,
// registered in RENDER_PURE_CORES (tests/architecture.test.ts).
//
// The style is a PRESENTATION choice orthogonal to the quality preset: Classic
// is the world exactly as it shipped (every consumer compiles the stock shader
// byte for byte and every per-frame curve returns its input untouched), Refined
// is the grounded medieval-fantasy look (textured ground variants, a warm
// painterly palette, aerial perspective, a graded sky with a drifting cloud
// layer, a per-time-of-day output grade). Everything here decides WHAT the
// Refined look is; `world_style.ts` is the thin painter that writes it into the
// shared uniform block, and `world_style_glsl.ts` holds the shader text.
//
// Fairness (docs/design/graphics-settings-fairness.md): nothing here may hide
// or delay what a player acts on. The aerial haze never touches the first
// REFINED_AERIAL_CLEAR_YD yards (where every telegraph, ground marker and
// melee read lives), is capped at REFINED_AERIAL_MAX so far ground still
// reads, applies only to terrain and sky (never entities, nameplates or floor
// decals), and the style never shortens the fog range. The output grade never
// lowers exposure and never drops saturation below REFINED_GRADE_MIN_SAT.

import type { GfxTier } from './gfx';

export type WorldStyle = 'classic' | 'refined';

/** Persisted setting values (src/game/settings.ts `worldStyle`). */
export const WORLD_STYLE_CLASSIC = 0;
export const WORLD_STYLE_REFINED = 1;

/** The style a session runs: a `?worldstyle=classic|refined` pin wins, then
 *  the stored setting; anyone who never set it (undefined, or a value that is
 *  not a finite number) gets Refined, the default for new players. */
export function worldStyleFromSetting(stored: number | undefined, search = ''): WorldStyle {
  const pin = /[?&]worldstyle=(classic|refined)\b/i.exec(search);
  if (pin) return pin[1].toLowerCase() as WorldStyle;
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return 'refined';
  return stored < 0.5 ? 'classic' : 'refined';
}

export function worldStyleSettingValue(style: WorldStyle): number {
  return style === 'classic' ? WORLD_STYLE_CLASSIC : WORLD_STYLE_REFINED;
}

// ---------------------------------------------------------------------------
// Terrain: what each tier's Refined ground compiles in.
// ---------------------------------------------------------------------------

export interface RefinedTerrainProfile {
  /** Second grass variant (a dry meadow photo layer) broken up by noise. */
  readonly grassVariant: boolean;
  /** Gravel photo layer on path shoulders and trail grit. */
  readonly gravel: boolean;
  /** Rock pushed onto steep faces the splat weights left as grass/dirt. */
  readonly steepRock: boolean;
  /** Damp mud band on grass and dirt just above the waterline. */
  readonly shoreMud: boolean;
  /** Dedicated low-frequency noise taps (else the shader reuses the macro
   *  sample it already took, so the variant and breakup cost no extra tap). */
  readonly noiseTaps: boolean;
  /** Distance-scaled macro value and hue breakup against visible tiling. */
  readonly macroBreakup: boolean;
  /** Height-and-distance aerial perspective (false: distance only). */
  readonly aerialHeight: boolean;
}

/** Splat tiers (medium and up). The Lambert ground on Low takes only the
 *  zero-tap palette and distance-only aerial arm (`refinedLowGround`). */
export function refinedTerrainProfile(tier: GfxTier): RefinedTerrainProfile {
  const rich = tier !== 'low' && tier !== 'medium';
  return {
    grassVariant: true,
    gravel: true,
    steepRock: true,
    shoreMud: rich,
    noiseTaps: rich,
    macroBreakup: true,
    aerialHeight: rich,
  };
}

/** A stable key of the profile for the program cache key. */
export function refinedTerrainProfileKey(p: RefinedTerrainProfile): string {
  return [
    p.grassVariant,
    p.gravel,
    p.steepRock,
    p.shoreMud,
    p.noiseTaps,
    p.macroBreakup,
    p.aerialHeight,
  ]
    .map(Number)
    .join('');
}

/** The extra albedo layers Refined appends to the packed splat array (after
 *  the six Classic layers, so every Classic WOC_L_* index is unchanged). */
export const REFINED_ALBEDO_LAYER_FILES = {
  grassVariantC: 'Grass004_Color.jpg',
  gravelC: 'Gravel024_Color.jpg',
} as const;
export const REFINED_LAYER_GRASS_B = 6;
export const REFINED_LAYER_GRAVEL = 7;

// Blend constants: the GLSL in world_style_glsl.ts is generated from these, so
// the tested JS mirror below and the shader cannot drift.
export const REFINED_BLEND = {
  /** Variant noise window: below lo all grass is A, above hi B reaches max. */
  variantLo: 0.4,
  variantHi: 0.66,
  /** Most of a meadow the dry variant may own. */
  variantMax: 0.62,
  /** Gravel weight on the dirt layer: path shoulders take most of it. */
  gravelEdge: 0.85,
  gravelCore: 0.22,
  gravelNoise: 0.3,
  gravelMax: 0.8,
  /** Steep faces (normal y under hi, full at lo) turn to rock. */
  steepHi: 0.74,
  steepLo: 0.5,
  steepMax: 0.7,
  /** Damp band above the waterline, in yards. */
  shoreNear: 0.25,
  shoreFar: 2.6,
  shoreMax: 0.55,
} as const;

export interface RefinedBlendInput {
  /** Baked splat weights after the Classic blend (grass, dirt, rock, sand). */
  readonly grass: number;
  readonly dirt: number;
  readonly rock: number;
  readonly sand: number;
  /** 0 trail core, 1 trail shoulder (the shader's pathEdge share of dirt). */
  readonly pathEdge: number;
  /** World-space surface normal y (1 flat, 0 vertical). */
  readonly normalY: number;
  /** Height above the waterline in yards. */
  readonly heightAboveWater: number;
  /** Low-frequency noise 0..1 that breaks the grass into variant patches. */
  readonly variantNoise: number;
  /** Mid-frequency noise 0..1 that scatters gravel off the shoulder. */
  readonly gravelNoise: number;
}

export interface RefinedBlendWeights {
  /** Share of the final albedo each Refined layer takes, applied in order
   *  (variant, gravel, steep rock, shore mud) as mixes over the Classic sum. */
  readonly grassVariant: number;
  readonly gravel: number;
  readonly steepRock: number;
  readonly shoreMud: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** GLSL smoothstep, including the reversed-edge form the shader relies on. */
export function smoothstepGlsl(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** The Refined layer weights at one ground point: the JS mirror of the
 *  shader's blend (refinedSplatGlsl). Pure and deterministic. */
export function refinedBlendWeights(i: RefinedBlendInput): RefinedBlendWeights {
  const b = REFINED_BLEND;
  const grassVariant =
    i.grass * smoothstepGlsl(b.variantLo, b.variantHi, i.variantNoise) * b.variantMax;
  const gravel =
    i.dirt *
    Math.min(
      b.gravelMax,
      i.pathEdge * b.gravelEdge +
        (1 - i.pathEdge) * b.gravelCore +
        smoothstepGlsl(0.55, 0.85, i.gravelNoise) * b.gravelNoise,
    );
  const steepRock =
    (i.grass + i.dirt) * smoothstepGlsl(b.steepHi, b.steepLo, i.normalY) * b.steepMax;
  const shoreMud =
    (i.grass + i.dirt) *
    (1 - smoothstepGlsl(b.shoreNear, b.shoreFar, i.heightAboveWater)) *
    b.shoreMax;
  return { grassVariant, gravel, steepRock, shoreMud };
}

/** The warm painterly ground palette: a per-channel balance and a mild
 *  saturation pull, applied to the composed albedo (both GLSL arms read it). */
export const REFINED_PALETTE = {
  balance: [1.045, 1.0, 0.9] as const,
  saturation: 0.9,
  /** Dry meadow tint the grass variant carries (straw gold over green). */
  dryGrass: [1.1, 1.0, 0.72] as const,
  /** Damp shore multiply (darker, a touch warm). */
  dampShore: [0.66, 0.6, 0.52] as const,
} as const;

/** JS mirror of the shader's palette step, for the decal-contrast pin. */
export function refinedPalette(rgb: readonly [number, number, number]): [number, number, number] {
  const p = REFINED_PALETTE;
  const c = [rgb[0] * p.balance[0], rgb[1] * p.balance[1], rgb[2] * p.balance[2]];
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return [
    l + (c[0] - l) * p.saturation,
    l + (c[1] - l) * p.saturation,
    l + (c[2] - l) * p.saturation,
  ];
}

// ---------------------------------------------------------------------------
// Atmosphere: the per-time-of-day curves (light, fog, aerial, sky, grade).
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number];

/** Golden hour: the sun low but up (peaks near elevation 0.1). */
export function goldenAmount(sunElev: number): number {
  return smoothstepGlsl(-0.08, 0.05, sunElev) * (1 - smoothstepGlsl(0.16, 0.38, sunElev));
}

/** Blue hour: the sun just under the horizon. */
export function blueHourAmount(sunElev: number): number {
  return smoothstepGlsl(0.03, -0.07, sunElev) * (1 - smoothstepGlsl(-0.14, -0.32, sunElev));
}

/** Full day: the sun well up. */
export function noonAmount(sunElev: number): number {
  return smoothstepGlsl(0.3, 0.55, sunElev);
}

export interface RefinedAtmosphere {
  /** Output grade per-channel gain and saturation (display space). */
  readonly gradeGain: Rgb;
  readonly gradeSaturation: number;
  readonly gradeLift: Rgb;
  /** Pre-tone-map exposure multiplier, never below 1. */
  readonly exposure: number;
  /** Aerial perspective colour and strength (cap REFINED_AERIAL_MAX). */
  readonly aerialColor: Rgb;
  readonly aerialStrength: number;
  /** Sky gradient the Refined dome blends toward (linear HDR radiance). */
  readonly skyZenith: Rgb;
  readonly skyHorizon: Rgb;
  /** Sun glow lobe colour times strength. */
  readonly sunGlow: Rgb;
  /** Cloud layer: lit colour, shade colour, coverage 0..1, opacity 0..1. */
  readonly cloudLit: Rgb;
  readonly cloudShade: Rgb;
  readonly cloudCoverage: number;
  readonly cloudOpacity: number;
  /** Key-light colour multiplier (applied to the light's target colour). */
  readonly sunTint: Rgb;
  /** Multipliers on the grade's light scales and fog tint. */
  readonly lightScaleMul: number;
  readonly ambientScaleMul: number;
  readonly fogTint: Rgb;
}

/** Inside this many yards the aerial haze is exactly zero. */
export const REFINED_AERIAL_CLEAR_YD = 55;
/** The haze never owns more than this share of a pixel. */
export const REFINED_AERIAL_MAX = 0.55;
/** Haze density per yard past the clear radius, and height falloff. */
export const REFINED_AERIAL_DENSITY = 1 / 380;
export const REFINED_AERIAL_HEIGHT_FALLOFF = 1 / 55;
/** Saturation floor of the output grade. */
export const REFINED_GRADE_MIN_SAT = 0.88;

interface Phase {
  gain: Rgb;
  sat: number;
  lift: Rgb;
  exposure: number;
  aerial: Rgb;
  aerialAmt: number;
  zenith: Rgb;
  horizon: Rgb;
  glow: Rgb;
  cloudLit: Rgb;
  cloudShade: Rgb;
  cover: number;
  cloudOp: number;
  sun: Rgb;
  light: number;
  ambient: number;
  fog: Rgb;
}

// Four anchor looks; the live atmosphere is their blend by the phase weights.
const NOON: Phase = {
  gain: [1.0, 1.0, 0.985],
  sat: 1.04,
  lift: [0.0, 0.0, 0.004],
  exposure: 1.0,
  aerial: [0.64, 0.72, 0.82],
  aerialAmt: 0.46,
  zenith: [0.24, 0.42, 0.78],
  horizon: [0.7, 0.78, 0.86],
  glow: [0.32, 0.28, 0.2],
  cloudLit: [1.02, 1.0, 0.96],
  cloudShade: [0.62, 0.68, 0.78],
  cover: 0.44,
  cloudOp: 0.62,
  sun: [1.0, 0.975, 0.93],
  light: 1.05,
  ambient: 0.95,
  fog: [0.96, 0.99, 1.05],
};
const GOLDEN: Phase = {
  gain: [1.04, 1.0, 0.93],
  sat: 1.08,
  lift: [0.006, 0.003, 0.0],
  exposure: 1.02,
  aerial: [0.86, 0.74, 0.62],
  aerialAmt: 0.42,
  zenith: [0.3, 0.38, 0.64],
  horizon: [1.05, 0.7, 0.44],
  glow: [0.95, 0.6, 0.3],
  cloudLit: [1.08, 0.74, 0.52],
  cloudShade: [0.46, 0.42, 0.52],
  cover: 0.4,
  cloudOp: 0.66,
  sun: [1.04, 0.97, 0.88],
  light: 1.0,
  ambient: 0.97,
  fog: [1.02, 0.99, 0.95],
};
const BLUE: Phase = {
  gain: [0.96, 0.98, 1.05],
  sat: 1.02,
  lift: [0.004, 0.006, 0.012],
  exposure: 1.05,
  aerial: [0.36, 0.42, 0.58],
  aerialAmt: 0.38,
  zenith: [0.08, 0.12, 0.3],
  horizon: [0.42, 0.4, 0.58],
  glow: [0.22, 0.12, 0.12],
  cloudLit: [0.5, 0.46, 0.6],
  cloudShade: [0.2, 0.22, 0.32],
  cover: 0.4,
  cloudOp: 0.5,
  sun: [1.0, 1.0, 1.0],
  light: 1.0,
  ambient: 1.0,
  fog: [0.93, 0.96, 1.07],
};
const NIGHT: Phase = {
  gain: [0.98, 0.99, 1.03],
  sat: 1.0,
  lift: [0.003, 0.004, 0.009],
  exposure: 1.0,
  aerial: [0.1, 0.12, 0.2],
  aerialAmt: 0.3,
  zenith: [0.018, 0.026, 0.07],
  horizon: [0.07, 0.09, 0.16],
  glow: [0.0, 0.0, 0.0],
  cloudLit: [0.09, 0.1, 0.14],
  cloudShade: [0.035, 0.04, 0.06],
  cover: 0.36,
  cloudOp: 0.42,
  sun: [1.0, 1.0, 1.0],
  light: 1.0,
  ambient: 1.0,
  fog: [0.96, 0.98, 1.04],
};

function mixRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const mixN = (a: number, b: number, t: number): number => a + (b - a) * t;

function blendPhase(a: Phase, b: Phase, t: number): Phase {
  return {
    gain: mixRgb(a.gain, b.gain, t),
    sat: mixN(a.sat, b.sat, t),
    lift: mixRgb(a.lift, b.lift, t),
    exposure: mixN(a.exposure, b.exposure, t),
    aerial: mixRgb(a.aerial, b.aerial, t),
    aerialAmt: mixN(a.aerialAmt, b.aerialAmt, t),
    zenith: mixRgb(a.zenith, b.zenith, t),
    horizon: mixRgb(a.horizon, b.horizon, t),
    glow: mixRgb(a.glow, b.glow, t),
    cloudLit: mixRgb(a.cloudLit, b.cloudLit, t),
    cloudShade: mixRgb(a.cloudShade, b.cloudShade, t),
    cover: mixN(a.cover, b.cover, t),
    cloudOp: mixN(a.cloudOp, b.cloudOp, t),
    sun: mixRgb(a.sun, b.sun, t),
    light: mixN(a.light, b.light, t),
    ambient: mixN(a.ambient, b.ambient, t),
    fog: mixRgb(a.fog, b.fog, t),
  };
}

/**
 * The Refined atmosphere at a sun elevation (the live sun direction's y) and a
 * night amount (the day/night grade's nightAmt). Day runs NOON, golden hour
 * pulls toward GOLDEN, the blue hour toward BLUE, deep night toward NIGHT, so
 * noon reads neutral, morning and evening golden, and dusk a cool blue.
 */
export function refinedAtmosphere(sunElev: number, nightAmt: number): RefinedAtmosphere {
  const night = clamp01(nightAmt);
  let p = NOON;
  p = blendPhase(p, GOLDEN, goldenAmount(sunElev) * (1 - noonAmount(sunElev)));
  p = blendPhase(p, BLUE, blueHourAmount(sunElev));
  // Deep night: past the blue hour, by the grade's own night amount.
  p = blendPhase(p, NIGHT, smoothstepGlsl(0.45, 0.95, night) * (1 - blueHourAmount(sunElev) * 0.5));
  return {
    gradeGain: p.gain,
    gradeSaturation: Math.max(REFINED_GRADE_MIN_SAT, p.sat),
    gradeLift: p.lift,
    exposure: Math.max(1, p.exposure),
    aerialColor: p.aerial,
    aerialStrength: Math.min(REFINED_AERIAL_MAX, p.aerialAmt),
    skyZenith: p.zenith,
    skyHorizon: p.horizon,
    sunGlow: p.glow,
    cloudLit: p.cloudLit,
    cloudShade: p.cloudShade,
    cloudCoverage: p.cover,
    cloudOpacity: p.cloudOp,
    sunTint: p.sun,
    lightScaleMul: p.light,
    ambientScaleMul: p.ambient,
    fogTint: p.fog,
  };
}

/** The share of a terrain pixel the aerial haze takes: zero inside the clear
 *  radius, rising with distance past it, stronger low down (valley air),
 *  capped. `heightAware` false is the Low/Medium distance-only arm. JS mirror
 *  of the shader's aerial term. */
export function refinedAerialAmount(
  distance: number,
  heightAboveBase: number,
  strength: number,
  heightAware: boolean,
): number {
  const d = Math.max(0, distance - REFINED_AERIAL_CLEAR_YD);
  const dist = 1 - Math.exp(-d * REFINED_AERIAL_DENSITY);
  const h = heightAware
    ? Math.exp(-Math.max(heightAboveBase, 0) * REFINED_AERIAL_HEIGHT_FALLOFF)
    : 1;
  const amt = dist * (0.55 + 0.45 * h) * Math.min(REFINED_AERIAL_MAX, strength);
  return Math.min(REFINED_AERIAL_MAX, amt);
}

/** The PCF shadow radius the Refined style runs (a slightly wider penumbra on
 *  the same kernel: radius is a uniform, so no program key changes). */
export const REFINED_SHADOW_RADIUS = 3.1;
export function worldStyleShadowRadius(style: WorldStyle, classicRadius: number): number {
  return style === 'refined' ? REFINED_SHADOW_RADIUS : classicRadius;
}

/** The drift of the cloud layer in dome-plane units per second. */
export const REFINED_CLOUD_DRIFT: readonly [number, number] = [0.0042, 0.0016];
