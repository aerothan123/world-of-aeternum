// World Style Refined foliage: the pure half of the painted grass and the
// painterly tree canopies. Three/DOM-free, deterministic, registered in
// RENDER_PURE_CORES (tests/architecture.test.ts).
//
// Classic never reaches anything here: world_style_foliage.ts only chains its
// shader patch onto a material when the Refined style is active, and the
// placement factors below return exactly 1 under Classic, so a Classic meadow
// places, sizes and shades every cluster as it shipped.
//
// What Refined paints (toward the approved hand-painted concept):
// - grass reads as painted CLUMPS: a low-frequency clump field thins the
//   carpet between clumps and lets clump centres stand a little taller, and
//   each blade runs a base-to-tip gradient (cool olive at the root, warm
//   straw-gold at a softened tip) with per-clump hue drift (olive, ochre,
//   teal) instead of one uniform bright green;
// - canopies shade as sculpted volumes: a warm top-light and a cool
//   blue-violet under-shadow along the bent canopy normal, a per-tree hue
//   drift, and a faint warm fresnel rim by day.
// Cosmetic only (docs/design/graphics-settings-fairness.md): grass and leaves
// carry no gameplay read, and nothing here touches entities, decals, fog or
// any readability floor.

import type { WorldStyle } from './world_style_core';

type Rgb = readonly [number, number, number];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Clump field (CPU placement: blade carpet and mid band)
// ---------------------------------------------------------------------------

/** Clump field cell size in yards (one painted clump plus its gap). */
export const PAINTED_CLUMP_CELL_YD = 2.6;
/** Coverage multiplier between clumps (field 0) and at a clump core (1). */
export const PAINTED_CLUMP_COVER: readonly [number, number] = [0.5, 1.3];
/** Height multiplier between clumps and at a clump core. */
export const PAINTED_CLUMP_HEIGHT: readonly [number, number] = [0.78, 1.16];

function cellHash(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263 + 0x5bd1e995) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1] over the clump cell grid: deterministic, no
 *  RNG stream, the same field for the carpet and the band so their seam
 *  shows one clump pattern. */
export function paintedClumpField(x: number, z: number): number {
  const fx = x / PAINTED_CLUMP_CELL_YD;
  const fz = z / PAINTED_CLUMP_CELL_YD;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = cellHash(i, j);
  const b = cellHash(i + 1, j);
  const c = cellHash(i, j + 1);
  const d = cellHash(i + 1, j + 1);
  const v = a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  // sharpen a little so clumps have edges rather than a soft wash
  return smooth(0.18, 0.82, v);
}

/** Placement coverage multiplier for a cluster at (x, z). Exactly 1 under
 *  Classic, so the shipped coverage gate is untouched. */
export function paintedClumpCoverage(style: WorldStyle, x: number, z: number): number {
  if (style !== 'refined') return 1;
  const f = paintedClumpField(x, z);
  return PAINTED_CLUMP_COVER[0] + (PAINTED_CLUMP_COVER[1] - PAINTED_CLUMP_COVER[0]) * f;
}

/** Vertical scale multiplier for a cluster at (x, z). Exactly 1 under Classic. */
export function paintedClumpHeight(style: WorldStyle, x: number, z: number): number {
  if (style !== 'refined') return 1;
  const f = paintedClumpField(x, z);
  return PAINTED_CLUMP_HEIGHT[0] + (PAINTED_CLUMP_HEIGHT[1] - PAINTED_CLUMP_HEIGHT[0]) * f;
}

// ---------------------------------------------------------------------------
// Painted grass colour (shader; JS mirror below)
// ---------------------------------------------------------------------------

export const PAINTED_GRASS = {
  /** Multiplier at the blade root: a cool, darker olive. */
  base: [0.6, 0.7, 0.62] as Rgb,
  /** Multiplier at the blade tip: warm straw-gold light. */
  tip: [1.2, 1.1, 0.68] as Rgb,
  /** Where along the blade (0 root, 1 tip) the gradient runs. */
  gradLo: 0.05,
  gradHi: 0.95,
  /** Per-clump hue drift multipliers. */
  olive: [1.02, 0.98, 0.72] as Rgb,
  ochre: [1.18, 0.96, 0.6] as Rgb,
  teal: [0.82, 1.0, 0.94] as Rgb,
  /** How far a clump drifts toward its hue (0 none). */
  hueAmt: 0.75,
  /** Saturation of the painted result (below 1 pulls the neon out). */
  saturation: 0.82,
  /** Tip softening: share of the top of the blade lifted toward a warm
   *  pale highlight (painted grass has light, soft tips, not hard spikes). */
  tipSoft: 0.3,
  tipSoftColor: [1.0, 0.95, 0.72] as Rgb,
} as const;

/** The per-clump hue weights (olive, ochre, teal) from a clump value 0..1. */
export function paintedGrassHueMix(h: number): Rgb {
  const g = PAINTED_GRASS;
  const t = clamp01(h);
  const o = t < 0.5 ? mixRgb(g.olive, g.ochre, t * 2) : mixRgb(g.ochre, g.teal, (t - 0.5) * 2);
  return mixRgb([1, 1, 1], o, g.hueAmt);
}

function mixRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** JS mirror of the grass paint applied to the lit-before albedo `c` at blade
 *  height `t` (0 root, 1 tip) for clump value `h`. */
export function paintedGrassColor(c: Rgb, t: number, h: number): [number, number, number] {
  const g = PAINTED_GRASS;
  const k = smooth(g.gradLo, g.gradHi, t);
  const grad = mixRgb(g.base, g.tip, k);
  const hue = paintedGrassHueMix(h);
  let r: [number, number, number] = [
    c[0] * grad[0] * hue[0],
    c[1] * grad[1] * hue[1],
    c[2] * grad[2] * hue[2],
  ];
  const l = 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2];
  r = [l + (r[0] - l) * g.saturation, l + (r[1] - l) * g.saturation, l + (r[2] - l) * g.saturation];
  const s = g.tipSoft * smooth(0.6, 1.0, t);
  const soft: Rgb = [l * g.tipSoftColor[0] * 1.25, l * g.tipSoftColor[1] * 1.25, l * g.tipSoftColor[2] * 1.25];
  return mixRgb(r, soft, s);
}

// ---------------------------------------------------------------------------
// Painterly canopy (shader; JS mirror below)
// ---------------------------------------------------------------------------

export const PAINTED_CANOPY = {
  /** Multiplier on the underside of the crown (canopy normal pointing down):
   *  a cool blue-violet shade. */
  under: [0.6, 0.64, 0.8] as Rgb,
  /** Multiplier on the crown top (normal up): warm sunlit gold. */
  top: [1.16, 1.08, 0.82] as Rgb,
  /** Canopy-normal y window the gradient runs across. */
  upLo: -0.55,
  upHi: 0.85,
  /** Per-tree hue drift: cool teal-green to warm ochre. */
  cool: [0.88, 1.02, 0.94] as Rgb,
  warm: [1.12, 1.0, 0.7] as Rgb,
  hueAmt: 0.6,
  /** Saturation of the painted crown. */
  saturation: 1.08,
  /** Warm fresnel rim colour (times the per-frame rim strength). */
  rim: [1.0, 0.78, 0.42] as Rgb,
  rimPower: 3.0,
} as const;

/** JS mirror of the canopy paint on albedo `c` for canopy-normal y `up`
 *  (-1 underside, 1 top) and per-tree value `h`. */
export function paintedCanopyColor(c: Rgb, up: number, h: number): [number, number, number] {
  const p = PAINTED_CANOPY;
  const k = smooth(p.upLo, p.upHi, up);
  const g = mixRgb(p.under, p.top, k);
  const hue = mixRgb([1, 1, 1], mixRgb(p.cool, p.warm, clamp01(h)), p.hueAmt);
  const r: Rgb = [c[0] * g[0] * hue[0], c[1] * g[1] * hue[1], c[2] * g[2] * hue[2]];
  const l = 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2];
  return [l + (r[0] - l) * p.saturation, l + (r[1] - l) * p.saturation, l + (r[2] - l) * p.saturation];
}

/** Per-frame canopy rim strength: warm rim by day, strongest at golden hour,
 *  zero at night (so no leaf ever glows in the dark). */
export function paintedCanopyRim(golden: number, nightAmt: number): number {
  return (0.12 + 0.22 * clamp01(golden)) * (1 - clamp01(nightAmt));
}

// ---------------------------------------------------------------------------
// GLSL (generated from the constants above, so mirror and shader agree)
// ---------------------------------------------------------------------------

const f = (n: number): string => {
  const s = n.toFixed(5);
  return s.includes('.') ? s : `${s}.0`;
};
const v3 = (c: Rgb): string => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;

/** Vertex declarations for the grass paint. */
export const PAINTED_GRASS_VERT_DECL = `
        varying vec2 vWsGrass; // x blade height 0..1, y clump hue 0..1`;

/** Vertex body for the grass paint. `heightExpr` is the blade's 0..1 height
 *  along the card or blade (local), computed BEFORE wind and instancing. */
export function paintedGrassVertGlsl(heightExpr: string): string {
  return `
        {
          vec3 wsOrigin = vec3(0.0);
          #ifdef USE_INSTANCING
            wsOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #endif
          wsOrigin = (modelMatrix * vec4(wsOrigin, 1.0)).xyz;
          float wsLow = 0.5 + 0.25 * sin(wsOrigin.x * 0.23 + 1.3) * sin(wsOrigin.z * 0.19 + 0.4)
            + 0.25 * sin(wsOrigin.x * 0.061 - wsOrigin.z * 0.047);
          float wsCell = fract(sin(dot(floor(wsOrigin.xz * 0.9), vec2(12.9898, 78.233))) * 43758.5453);
          vWsGrass = vec2(clamp(${heightExpr}, 0.0, 1.0), clamp(mix(wsLow, wsCell, 0.3), 0.0, 1.0));
        }`;
}

export const PAINTED_GRASS_FRAG_DECL = `
        varying vec2 vWsGrass;`;

/** Fragment body for the grass paint (after <color_fragment>). Mirrors
 *  paintedGrassColor. */
export function paintedGrassFragGlsl(): string {
  const g = PAINTED_GRASS;
  return `
        {
          float wsT = vWsGrass.x;
          float wsH = vWsGrass.y;
          vec3 wsGrad = mix(${v3(g.base)}, ${v3(g.tip)}, smoothstep(${f(g.gradLo)}, ${f(g.gradHi)}, wsT));
          vec3 wsHue = wsH < 0.5
            ? mix(${v3(g.olive)}, ${v3(g.ochre)}, wsH * 2.0)
            : mix(${v3(g.ochre)}, ${v3(g.teal)}, (wsH - 0.5) * 2.0);
          wsHue = mix(vec3(1.0), wsHue, ${f(g.hueAmt)});
          vec3 wsC = diffuseColor.rgb * wsGrad * wsHue;
          float wsL = dot(wsC, vec3(0.2126, 0.7152, 0.0722));
          wsC = mix(vec3(wsL), wsC, ${f(g.saturation)});
          wsC = mix(wsC, wsL * ${v3(g.tipSoftColor)} * 1.25, ${f(g.tipSoft)} * smoothstep(0.6, 1.0, wsT));
          diffuseColor.rgb = wsC;
        }`;
}

export const PAINTED_CANOPY_VERT_DECL = `
        varying vec2 vWsCanopy; // x canopy normal y, y per-tree hue 0..1`;

/** Vertex body for the canopy paint (after <defaultnormal_vertex>, so the
 *  bent canopy normal is final). */
export const PAINTED_CANOPY_VERT_GLSL = `
        {
          vec3 wsN = objectNormal;
          vec4 wsO = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            wsN = mat3(instanceMatrix) * wsN;
            wsO = instanceMatrix * wsO;
          #endif
          wsO = modelMatrix * wsO;
          float wsTree = fract(sin(dot(floor(wsO.xz * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
          vWsCanopy = vec2(normalize(mat3(modelMatrix) * wsN).y, wsTree);
        }`;

export const PAINTED_CANOPY_FRAG_DECL = `
        varying vec2 vWsCanopy;
        uniform vec4 uWsFoliage; // x canopy rim strength`;

/** Fragment body for the canopy paint (after <color_fragment>). Mirrors
 *  paintedCanopyColor. */
export function paintedCanopyFragGlsl(): string {
  const p = PAINTED_CANOPY;
  return `
        {
          vec3 wsG = mix(${v3(p.under)}, ${v3(p.top)}, smoothstep(${f(p.upLo)}, ${f(p.upHi)}, vWsCanopy.x));
          vec3 wsHue = mix(vec3(1.0), mix(${v3(p.cool)}, ${v3(p.warm)}, vWsCanopy.y), ${f(p.hueAmt)});
          vec3 wsC = diffuseColor.rgb * wsG * wsHue;
          float wsL = dot(wsC, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(wsL), wsC, ${f(p.saturation)});
        }`;
}

/** Emissive body for the canopy rim (after <emissivemap_fragment>, where the
 *  shading normal exists). Daylight-scaled by uWsFoliage.x (0 at night). */
export function paintedCanopyRimGlsl(): string {
  const p = PAINTED_CANOPY;
  return `
        {
          float wsFr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
          totalEmissiveRadiance += diffuseColor.rgb * ${v3(p.rim)}
            * pow(wsFr, ${f(p.rimPower)}) * uWsFoliage.x * smoothstep(-0.4, 0.6, vWsCanopy.x);
        }`;
}
