// World Style Refined grass: the pure half of the chunkier painted meadow.
// Three/DOM-free, deterministic, registered in RENDER_PURE_CORES
// (tests/architecture.test.ts).
//
// Refined grass reads as chunky painted clumps rather than fine photo-real
// blades: fewer, much wider ribbons that taper late into soft rounded tips
// (the cluster SHAPE, consumed by blade_grass.ts clusterGeometry for the
// near carpet and the mid band, which must stay one look), clumps a little
// wider at the clump-field cores, a soft per-blade warm/cool value wash, and
// small flower clusters: whole patches of neighbouring clumps that bloom in
// one colour, like a planted drift, instead of lone specks.
//
// Classic never reaches anything here: the shape and the width factor are
// exactly the shipped values under Classic, and world_style_grass.ts chains
// its shader arm only under Refined.
//
// Budget: the painted shape draws 7 ribbons a cluster where Classic draws 9,
// so the carpet and band shed vertices under Refined, never add them; the
// per-tier density and radius knobs (gfx.ts) are untouched. Cosmetic only
// (docs/design/graphics-settings-fairness.md): grass carries no gameplay read.

import type { WorldStyle } from './world_style_core';
import { paintedClumpField } from './world_style_foliage_core';

type Rgb = readonly [number, number, number];

/** The blade cluster recipe clusterGeometry builds. */
export interface BladeClusterShape {
  /** Ribbons per cluster. */
  readonly blades: number;
  /** Multiplier on every ribbon's root width. */
  readonly widthMul: number;
  /** Width at the mid and upper rings as shares of the root width. */
  readonly midTaper: number;
  readonly tipTaper: number;
  /** Multiplier on every ribbon's length. */
  readonly lenMul: number;
  /** Width of the mid-band (two-segment) ribbon's middle ring. */
  readonly bandMidTaper: number;
  /** Half-width of a blunt tip as a share of the root width (0 a point). */
  readonly tipWidth: number;
}

/** The shipped cluster, byte for byte (clusterGeometry's literals). */
export const CLASSIC_BLADE_SHAPE: BladeClusterShape = {
  blades: 9,
  widthMul: 1,
  midTaper: 0.74,
  tipTaper: 0.42,
  lenMul: 1,
  bandMidTaper: 0.62,
  tipWidth: 0,
};

/** The painted cluster: five broad leaf-like ribbons that keep their width
 *  and end in a soft blunt tip, so a clump reads as one rounded painted mass. */
export const PAINTED_BLADE_SHAPE: BladeClusterShape = {
  blades: 5,
  widthMul: 2.7,
  midTaper: 0.96,
  tipTaper: 0.8,
  lenMul: 0.78,
  bandMidTaper: 0.9,
  tipWidth: 0.42,
};

export function bladeClusterShape(style: WorldStyle): BladeClusterShape {
  return style === 'refined' ? PAINTED_BLADE_SHAPE : CLASSIC_BLADE_SHAPE;
}

/** Horizontal clump scale between clumps (field 0) and at a core (1). */
export const PAINTED_CLUMP_WIDTH: readonly [number, number] = [1.05, 1.3];

/** Placement coverage multiplier: broad clumps cover the ground with fewer
 *  of them, so Refined places fewer clusters (the painted ground shows
 *  between them, the storybook look) and the blade fill stays near Classic's. */
export const PAINTED_GRASS_COVERAGE = 0.45;

/** Coverage multiplier for the carpet and band placement. Exactly 1 under Classic. */
export function paintedGrassCoverageScale(style: WorldStyle): number {
  return style === 'refined' ? PAINTED_GRASS_COVERAGE : 1;
}

/** Horizontal scale multiplier for a cluster at (x, z). Exactly 1 under
 *  Classic, so the shipped placement is untouched. */
export function paintedClumpWidth(style: WorldStyle, x: number, z: number): number {
  if (style !== 'refined') return 1;
  const f = paintedClumpField(x, z);
  return PAINTED_CLUMP_WIDTH[0] + (PAINTED_CLUMP_WIDTH[1] - PAINTED_CLUMP_WIDTH[0]) * f;
}

/** The largest paintedClumpWidth can return (the sector cull pad scales by it). */
export function paintedClumpWidthMax(style: WorldStyle): number {
  return style === 'refined' ? PAINTED_CLUMP_WIDTH[1] : 1;
}

// ---------------------------------------------------------------------------
// Flower clusters and the per-blade wash (shader; JS mirrors below)
// ---------------------------------------------------------------------------

export const PAINTED_BLOOM = {
  /** Patch field frequencies (per yard): drifts a few yards across. */
  patchFreq: [0.41, 0.37, 0.13, 0.11] as const,
  /** Patch field value above which a drift blooms. */
  patchCut: 0.66,
  /** Share of clumps inside a drift that carry heads. */
  clumpShare: 0.9,
  /** Blade height (0 root, 1 tip) where a head starts. */
  headLo: 0.5,
  /** Pale heart at the very tip of a head. */
  heartLo: 0.93,
  heartColor: [0.98, 0.9, 0.55] as Rgb,
  /** One colour per drift (linear albedo): daisy white, buttercup, rose,
   *  bluebell. */
  colors: [
    [0.88, 0.86, 0.8],
    [0.94, 0.7, 0.14],
    [0.86, 0.44, 0.52],
    [0.46, 0.5, 0.9],
  ] as readonly Rgb[],
  /** Per-blade soft value wash: warm lift and cool dip around 1. */
  washWarm: [1.07, 1.05, 0.94] as Rgb,
  washCool: [0.93, 0.97, 1.0] as Rgb,
  /** Extra painted value ramp along the blade, root to tip (on top of the
   *  painted-grass arm's colour gradient): a shaded base, a lit tip. */
  rampRoot: 0.72,
  rampTip: 1.12,
} as const;

/** The drift field 0..1 at a cluster origin. JS mirror of the shader's. */
export function paintedBloomPatch(x: number, z: number): number {
  const f = PAINTED_BLOOM.patchFreq;
  const v =
    0.5 +
    0.32 * Math.sin(x * f[0] + 0.7) * Math.sin(z * f[1] + 2.1) +
    0.18 * Math.sin(x * f[2] - z * f[3] + 0.3);
  return Math.min(1, Math.max(0, v));
}

/** Which drift colour (0 none, 1..n) a clump carries, from its drift field
 *  value, its own selector (0..1) and the drift's colour selector (0..1). */
export function paintedBloomPick(patch: number, pick: number, hue: number): number {
  const b = PAINTED_BLOOM;
  if (patch <= b.patchCut || pick > b.clumpShare) return 0;
  return 1 + Math.min(b.colors.length - 1, Math.floor(hue * b.colors.length));
}

const f = (n: number): string => {
  const s = n.toFixed(5);
  return s.includes('.') ? s : `${s}.0`;
};
const v3 = (c: Rgb): string => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;

export const PAINTED_BLOOM_VERT_DECL = `
        varying vec4 vWsBloom; // x blade height, y drift colour (0 none), z blade wash 0..1`;

/** Vertex body: the drift pick per cluster origin and the per-blade wash
 *  from the LOCAL vertex position (each ribbon roots apart, so neighbouring
 *  ribbons of one clump wash differently). */
export function paintedBloomVertGlsl(heightExpr: string): string {
  const b = PAINTED_BLOOM;
  const p = b.patchFreq;
  const n = b.colors.length;
  return `
        {
          vec3 wbO = vec3(0.0);
          #ifdef USE_INSTANCING
            wbO = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #endif
          wbO = (modelMatrix * vec4(wbO, 1.0)).xyz;
          float wbPatch = clamp(0.5 + 0.32 * sin(wbO.x * ${f(p[0])} + 0.7) * sin(wbO.z * ${f(p[1])} + 2.1)
            + 0.18 * sin(wbO.x * ${f(p[2])} - wbO.z * ${f(p[3])} + 0.3), 0.0, 1.0);
          float wbPick = fract(sin(dot(wbO.xz, vec2(27.619, 57.583))) * 31415.927);
          float wbHue = fract(sin(dot(floor(wbO.xz * 0.12), vec2(12.9898, 78.233))) * 43758.5453);
          float wbCol = (wbPatch > ${f(b.patchCut)} && wbPick <= ${f(b.clumpShare)})
            ? 1.0 + min(floor(wbHue * ${f(n)}), ${f(n - 1)}) : 0.0;
          float wbWash = fract(sin(dot(floor(position.xz * 9.0) + wbO.xz, vec2(19.19, 47.77))) * 9137.31);
          vWsBloom = vec4(clamp(${heightExpr}, 0.0, 1.0), wbCol, wbWash, 0.0);
        }`;
}

export const PAINTED_BLOOM_FRAG_DECL = `
        varying vec4 vWsBloom;`;

/** Fragment body (after <color_fragment>, after the painted-grass arm). */
export function paintedBloomFragGlsl(): string {
  const b = PAINTED_BLOOM;
  const pick = b.colors
    .slice(1)
    .map((c, i) => `vWsBloom.y > ${f(i + 1.5)} ? ${v3(c)} : `)
    .reverse()
    .join('');
  return `
        {
          diffuseColor.rgb *= mix(${v3(b.washCool)}, ${v3(b.washWarm)}, vWsBloom.z)
            * mix(${f(b.rampRoot)}, ${f(b.rampTip)}, smoothstep(0.0, 0.9, vWsBloom.x));
          if (vWsBloom.y > 0.5) {
            vec3 wbHead = ${pick}${v3(b.colors[0])};
            wbHead = mix(wbHead, ${v3(b.heartColor)}, smoothstep(${f(b.heartLo)}, 1.0, vWsBloom.x));
            diffuseColor.rgb = mix(diffuseColor.rgb, wbHead,
              smoothstep(${f(b.headLo)}, ${f(b.headLo + 0.06)}, vWsBloom.x));
          }
        }`;
}

/** JS mirror of the fragment arm on a lit-before albedo `c` at blade height
 *  `t`, drift colour `col` (0 none) and wash `w`. */
export function paintedBloomColor(
  c: Rgb,
  t: number,
  col: number,
  w: number,
): [number, number, number] {
  const b = PAINTED_BLOOM;
  const mix = (a: Rgb, d: Rgb, k: number): [number, number, number] => [
    a[0] + (d[0] - a[0]) * k,
    a[1] + (d[1] - a[1]) * k,
    a[2] + (d[2] - a[2]) * k,
  ];
  const ss = (e0: number, e1: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return k * k * (3 - 2 * k);
  };
  const wash = mix(b.washCool, b.washWarm, w);
  const ramp = b.rampRoot + (b.rampTip - b.rampRoot) * ss(0, 0.9, t);
  let r: [number, number, number] = [
    c[0] * wash[0] * ramp,
    c[1] * wash[1] * ramp,
    c[2] * wash[2] * ramp,
  ];
  if (col > 0) {
    const head = mix(b.colors[col - 1], b.heartColor, ss(b.heartLo, 1, t));
    r = mix(r, head, ss(b.headLo, b.headLo + 0.06, t));
  }
  return r;
}
