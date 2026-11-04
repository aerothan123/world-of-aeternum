// World Style Refined foliage: the pure half of the painted meadow grass and
// the painterly tree canopies. Three/DOM-free, deterministic, registered in
// RENDER_PURE_CORES (tests/architecture.test.ts).
//
// Classic never reaches anything here: world_style_foliage.ts only chains its
// shader patch onto a material when the Refined style is active, and the
// placement factors below return exactly 1 under Classic, so a Classic meadow
// places, sizes and shades every cluster as it shipped.
//
// What Refined paints (toward the storybook-countryside concepts):
// - grass reads as a soft, dense painted meadow: a low-frequency clump field
//   lets clump centres stand fuller and a little taller, each blade runs a
//   base-to-tip gradient (a cool soft olive at the root, a warm sunlit
//   yellow-green at a softened tip) with per-clump hue drift (olive, golden,
//   cool sage) instead of one uniform bright green, and a few clumps carry
//   wildflower colour specks at their tips;
// - canopies shade as chunky painted volumes: a warm top light and a soft
//   cool under-shadow along the bent canopy normal, a per-tree hue drift, a
//   softened leaf-texture contrast so a crown reads as painted masses rather
//   than a thousand cards, and a faint warm rim by day. The paint needs no
//   per-model knowledge: a material the foliage extraction does not know as a
//   leaf takes it only on its green texels (`canopyLeafWeight`), so a
//   regenerated tree GLB paints its leaves and leaves its bark alone.
// Cosmetic only (docs/design/graphics-settings-fairness.md): grass and leaves
// carry no gameplay read, and nothing here touches entities, decals, fog or
// any readability floor. The rim is zero at night, so no leaf glows there.

import type { WorldStyle } from './world_style_core';

type Rgb = readonly [number, number, number];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const luma = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function mixRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function satRgb(c: Rgb, s: number): [number, number, number] {
  const l = luma(c);
  return [l + (c[0] - l) * s, l + (c[1] - l) * s, l + (c[2] - l) * s];
}

// ---------------------------------------------------------------------------
// Clump field (CPU placement: blade carpet and mid band)
// ---------------------------------------------------------------------------

/** Clump field cell size in yards (one painted clump plus its gap). */
export const PAINTED_CLUMP_CELL_YD = 2.6;
/** Coverage multiplier between clumps (field 0) and at a clump core (1).
 *  Both ends sit near or above 1: the painted meadow is DENSER than Classic,
 *  only gently clumped, never thinned into bald patches. */
export const PAINTED_CLUMP_COVER: readonly [number, number] = [0.92, 1.34];
/** Height multiplier between clumps and at a clump core. */
export const PAINTED_CLUMP_HEIGHT: readonly [number, number] = [0.9, 1.14];

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
  // sharpen a little so clumps have soft edges rather than a uniform wash
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
  /** Multiplier at the blade root: a soft, cool olive (lighter than a hard
   *  black root, so the meadow keeps its low painted contrast). */
  base: [0.6, 0.74, 0.6] as Rgb,
  /** Multiplier at the blade tip: warm sunlit yellow-green. */
  tip: [1.3, 1.12, 0.58] as Rgb,
  /** Where along the blade (0 root, 1 tip) the gradient runs. */
  gradLo: 0.0,
  gradHi: 0.95,
  /** Per-clump hue drift multipliers: olive, golden, cool sage. */
  olive: [1.0, 0.98, 0.76] as Rgb,
  golden: [1.16, 1.0, 0.6] as Rgb,
  sage: [0.9, 1.0, 0.86] as Rgb,
  /** How far a clump drifts toward its hue (0 none). */
  hueAmt: 0.7,
  /** Saturation of the painted result (below 1 pulls the neon out). */
  saturation: 0.78,
  /** Tip softening: share of the top of the blade lifted toward a warm pale
   *  highlight (painted grass has light, soft tips, not hard spikes). */
  tipSoft: 0.28,
  tipSoftColor: [1.02, 0.97, 0.72] as Rgb,
  /** Share of clumps that carry wildflower specks at their tips. */
  flowerShare: 0.075,
  /** Tip window (blade height) the speck covers. */
  flowerLo: 0.8,
  /** Wildflower speck colours (linear albedo): white, buttercup, rose,
   *  lavender. */
  flowers: [
    [0.86, 0.84, 0.76],
    [0.92, 0.66, 0.12],
    [0.82, 0.4, 0.46],
    [0.56, 0.48, 0.82],
  ] as readonly Rgb[],
} as const;

/** The per-clump hue multiplier from a clump value 0..1. */
export function paintedGrassHueMix(h: number): [number, number, number] {
  const g = PAINTED_GRASS;
  const t = clamp01(h);
  const o = t < 0.5 ? mixRgb(g.olive, g.golden, t * 2) : mixRgb(g.golden, g.sage, (t - 0.5) * 2);
  return mixRgb([1, 1, 1], o, g.hueAmt);
}

/** Which wildflower (0 none, 1..4 a colour) a clump with selector `s` (0..1)
 *  carries. JS mirror of the shader's pick. */
export function paintedGrassFlower(s: number): number {
  const g = PAINTED_GRASS;
  if (s <= 1 - g.flowerShare) return 0;
  const k = (s - (1 - g.flowerShare)) / g.flowerShare;
  return 1 + Math.min(g.flowers.length - 1, Math.floor(k * g.flowers.length));
}

/** JS mirror of the grass paint applied to the lit-before albedo `c` at blade
 *  height `t` (0 root, 1 tip) for clump hue `h` and flower selector `s`. */
export function paintedGrassColor(c: Rgb, t: number, h: number, s = 0): [number, number, number] {
  const g = PAINTED_GRASS;
  const k = smooth(g.gradLo, g.gradHi, t);
  const grad = mixRgb(g.base, g.tip, k);
  const hue = paintedGrassHueMix(h);
  let r: [number, number, number] = satRgb(
    [c[0] * grad[0] * hue[0], c[1] * grad[1] * hue[1], c[2] * grad[2] * hue[2]],
    g.saturation,
  );
  const l = luma(r);
  const soft: Rgb = [
    l * g.tipSoftColor[0] * 1.25,
    l * g.tipSoftColor[1] * 1.25,
    l * g.tipSoftColor[2] * 1.25,
  ];
  r = mixRgb(r, soft, g.tipSoft * smooth(0.6, 1.0, t));
  const fl = paintedGrassFlower(s);
  if (fl > 0) r = mixRgb(r, g.flowers[fl - 1], smooth(g.flowerLo, g.flowerLo + 0.08, t));
  return r;
}

// ---------------------------------------------------------------------------
// Painterly canopy (shader; JS mirror below)
// ---------------------------------------------------------------------------

export const PAINTED_CANOPY = {
  /** Multiplier on the underside of the crown (canopy normal pointing down):
   *  a soft cool blue-green shade, never a black hole. */
  under: [0.68, 0.74, 0.9] as Rgb,
  /** Multiplier on the crown top (normal up): warm sunlit gold-green. */
  top: [1.24, 1.13, 0.74] as Rgb,
  /** Canopy-normal y window the gradient runs across. */
  upLo: -0.35,
  upHi: 0.95,
  /** Per-tree hue drift: cool teal-green to warm olive-gold. */
  cool: [0.86, 1.0, 0.96] as Rgb,
  warm: [1.14, 1.02, 0.68] as Rgb,
  hueAmt: 0.65,
  /** Saturation of the painted crown. */
  saturation: 1.0,
  /** Leaf-texture contrast kept (1 the texture as authored): below 1 the
   *  crown reads as soft painted masses instead of busy leaf cards. */
  contrast: 0.52,
  /** The luminance the contrast pull converges on (linear albedo). */
  contrastPivot: 0.2,
  /** Warm fresnel rim colour (times the per-frame rim strength). */
  rim: [1.0, 0.8, 0.46] as Rgb,
  rimPower: 2.6,
  /** Green-dominance window for a material that is not a known leaf. */
  leafLo: 0.0,
  leafHi: 0.05,
} as const;

/** Share of the canopy paint a texel takes on a material that is not a
 *  known leaf: 1 on green foliage texels, 0 on brown bark, grey stone or a
 *  red mushroom cap. Model-agnostic by construction (reads only the albedo). */
export function canopyLeafWeight(c: Rgb): number {
  const p = PAINTED_CANOPY;
  return smooth(p.leafLo, p.leafHi, c[1] - Math.max(c[0] * 0.82, c[2]));
}

/** JS mirror of the canopy paint on albedo `c` for canopy-normal y `up`
 *  (-1 underside, 1 top), per-tree value `h` and leaf weight `w`. */
export function paintedCanopyColor(c: Rgb, up: number, h: number, w = 1): [number, number, number] {
  const p = PAINTED_CANOPY;
  const l0 = luma(c);
  const soft = (p.contrastPivot + (l0 - p.contrastPivot) * p.contrast) / Math.max(l0, 1e-3);
  const k = smooth(p.upLo, p.upHi, up);
  const g = mixRgb(p.under, p.top, k);
  const hue = mixRgb([1, 1, 1], mixRgb(p.cool, p.warm, clamp01(h)), p.hueAmt);
  const r = satRgb(
    [c[0] * soft * g[0] * hue[0], c[1] * soft * g[1] * hue[1], c[2] * soft * g[2] * hue[2]],
    p.saturation,
  );
  return mixRgb(c, r, clamp01(w));
}

/** Per-frame canopy rim strength: a gentle warm rim by day, strongest at
 *  golden hour, zero at night (so no leaf ever glows in the dark). */
export function paintedCanopyRim(golden: number, nightAmt: number): number {
  return (0.1 + 0.2 * clamp01(golden)) * (1 - clamp01(nightAmt));
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
        varying vec3 vWsGrass; // x blade height 0..1, y clump hue 0..1, z flower selector 0..1`;

/** Vertex body for the grass paint. `heightExpr` is the blade's 0..1 height
 *  along the card or blade, read from the LOCAL vertex attributes. */
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
          float wsPick = fract(sin(dot(wsOrigin.xz, vec2(39.3468, 11.1353))) * 24634.6345);
          vWsGrass = vec3(clamp(${heightExpr}, 0.0, 1.0), clamp(mix(wsLow, wsCell, 0.3), 0.0, 1.0), wsPick);
        }`;
}

export const PAINTED_GRASS_FRAG_DECL = `
        varying vec3 vWsGrass;`;

/** Fragment body for the grass paint (after <color_fragment>). Mirrors
 *  paintedGrassColor. */
export function paintedGrassFragGlsl(): string {
  const g = PAINTED_GRASS;
  const n = g.flowers.length;
  const cut = 1 - g.flowerShare;
  const flowerPick = g.flowers
    .slice(1)
    .map((c, i) => `wsK >= ${f(i + 1)} ? ${v3(c)} : `)
    .reverse()
    .join('');
  return `
        {
          float wsT = vWsGrass.x;
          float wsH = vWsGrass.y;
          vec3 wsGrad = mix(${v3(g.base)}, ${v3(g.tip)}, smoothstep(${f(g.gradLo)}, ${f(g.gradHi)}, wsT));
          vec3 wsHue = wsH < 0.5
            ? mix(${v3(g.olive)}, ${v3(g.golden)}, wsH * 2.0)
            : mix(${v3(g.golden)}, ${v3(g.sage)}, (wsH - 0.5) * 2.0);
          wsHue = mix(vec3(1.0), wsHue, ${f(g.hueAmt)});
          vec3 wsC = diffuseColor.rgb * wsGrad * wsHue;
          float wsL = dot(wsC, vec3(0.2126, 0.7152, 0.0722));
          wsC = mix(vec3(wsL), wsC, ${f(g.saturation)});
          wsL = dot(wsC, vec3(0.2126, 0.7152, 0.0722));
          wsC = mix(wsC, wsL * ${v3(g.tipSoftColor)} * 1.25, ${f(g.tipSoft)} * smoothstep(0.6, 1.0, wsT));
          if (vWsGrass.z > ${f(cut)}) {
            float wsK = min(floor((vWsGrass.z - ${f(cut)}) / ${f(g.flowerShare)} * ${f(n)}), ${f(n - 1)});
            vec3 wsFl = ${flowerPick}${v3(g.flowers[0])};
            wsC = mix(wsC, wsFl, smoothstep(${f(g.flowerLo)}, ${f(g.flowerLo + 0.08)}, wsT));
          }
          diffuseColor.rgb = wsC;
        }`;
}

export const PAINTED_CANOPY_VERT_DECL = `
        varying vec2 vWsCanopy; // x canopy normal y, y per-tree hue 0..1`;

/** Vertex body for the canopy paint (after <defaultnormal_vertex>, so the
 *  bent canopy normal is final). `upExpr`, when given, replaces the normal's
 *  world y as the top-to-underside coordinate (-1..1): a far sprite whose
 *  shading normal leans to the camera reads its crown height instead. */
export function paintedCanopyVertGlsl(upExpr?: string): string {
  const up = upExpr ? `clamp(${upExpr}, -1.0, 1.0)` : 'normalize(mat3(modelMatrix) * wsN).y';
  return `
        {
          vec3 wsN = objectNormal;
          vec4 wsO = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            wsN = mat3(instanceMatrix) * wsN;
            wsO = instanceMatrix * wsO;
          #endif
          wsO = modelMatrix * wsO;
          float wsTree = fract(sin(dot(floor(wsO.xz * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
          vWsCanopy = vec2(${up}, wsTree);
        }`;
}

/** The impostor card's crown coordinate: its quad runs 0 (ground) to 1
 *  (crown top) in position.y, and a tree's crown starts around a third up. */
export const IMPOSTOR_CANOPY_UP_GLSL = 'position.y * 2.2 - 0.9';

/** The canopy vertex body on the bent canopy normal (the 3D trees). */
export const PAINTED_CANOPY_VERT_GLSL = paintedCanopyVertGlsl();

export const PAINTED_CANOPY_FRAG_DECL = `
        varying vec2 vWsCanopy;
        uniform vec4 uWsFoliage; // x canopy rim strength`;

/** Fragment body for the canopy paint (after <color_fragment>). Mirrors
 *  paintedCanopyColor; `knownLeaf` false takes the paint only on green
 *  texels (canopyLeafWeight). */
export function paintedCanopyFragGlsl(knownLeaf: boolean): string {
  const p = PAINTED_CANOPY;
  const weight = knownLeaf
    ? '1.0'
    : `smoothstep(${f(p.leafLo)}, ${f(p.leafHi)}, diffuseColor.g - max(diffuseColor.r * 0.82, diffuseColor.b))`;
  return `
        float wsLeafW = ${weight};
        {
          vec3 wsIn = diffuseColor.rgb;
          float wsL0 = dot(wsIn, vec3(0.2126, 0.7152, 0.0722));
          float wsSoft = (${f(p.contrastPivot)} + (wsL0 - ${f(p.contrastPivot)}) * ${f(p.contrast)}) / max(wsL0, 1e-3);
          vec3 wsG = mix(${v3(p.under)}, ${v3(p.top)}, smoothstep(${f(p.upLo)}, ${f(p.upHi)}, vWsCanopy.x));
          vec3 wsHue = mix(vec3(1.0), mix(${v3(p.cool)}, ${v3(p.warm)}, vWsCanopy.y), ${f(p.hueAmt)});
          vec3 wsC = wsIn * wsSoft * wsG * wsHue;
          float wsL = dot(wsC, vec3(0.2126, 0.7152, 0.0722));
          wsC = mix(vec3(wsL), wsC, ${f(p.saturation)});
          diffuseColor.rgb = mix(wsIn, wsC, wsLeafW);
        }`;
}

/** Emissive body for the canopy rim (before <aomap_fragment>, where the
 *  shading normal exists). Daylight-scaled by uWsFoliage.x (0 at night). */
export function paintedCanopyRimGlsl(): string {
  const p = PAINTED_CANOPY;
  return `
        {
          float wsFr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
          totalEmissiveRadiance += diffuseColor.rgb * ${v3(p.rim)}
            * pow(wsFr, ${f(p.rimPower)}) * uWsFoliage.x * wsLeafW
            * smoothstep(-0.4, 0.6, vWsCanopy.x);
        }`;
}
