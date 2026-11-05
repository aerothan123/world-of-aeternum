// The world rock material's pure half: the baked moss / snow top tint and the
// World Style Refined sky-fill correction. Three/DOM-free, deterministic,
// registered in RENDER_PURE_CORES (tests/architecture.test.ts); pinned by
// tests/rock_material_core.test.ts. rock_material.ts is the Three half.
//
// Why Refined corrects the fill: a rock is a matte grey surface, so its
// shadowed side shows nothing but the indirect light, and the noon indirect
// light is the blue sky probe plus the sky hemisphere. On a near-neutral
// albedo that reads as a saturated blue patch on every boulder. Refined keeps
// the fill's brightness and pulls its hue toward a warm grey, so shade on a
// rock reads as stone in shadow. Classic draws the shipped shader.

/** Refined sky fill on rocks: share of the fill's own hue kept, and the warm
 *  grey the remainder is tinted toward (linear multipliers). */
export const REFINED_ROCK_FILL = {
  saturation: 0.25,
  warm: [1.06, 1.0, 0.9],
} as const;

const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** JS mirror of the shader's indirect-light correction (linear rgb). */
export function refinedRockIndirect(
  rgb: readonly [number, number, number],
): [number, number, number] {
  const f = REFINED_ROCK_FILL;
  const y = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
  return [0, 1, 2].map((k) => (y + (rgb[k] - y) * f.saturation) * f.warm[k]) as [
    number,
    number,
    number,
  ];
}

const g = (n: number): string => {
  const s = n.toFixed(4);
  return s.includes('.') ? s : `${s}.0`;
};

/** The standard-material chunk after which the indirect light is complete. */
export const ROCK_FILL_ANCHOR = '#include <lights_fragment_end>';

/** The Refined rock fragment: the indirect diffuse and specular keep their
 *  brightness and lose most of the sky's hue. Throws when the anchor moved. */
export function patchRefinedRockFragment(frag: string): string {
  const at = frag.indexOf(ROCK_FILL_ANCHOR);
  if (at < 0) throw new Error('rock material: lights_fragment_end anchor missing');
  const f = REFINED_ROCK_FILL;
  const luma = `vec3( ${g(LUMA[0])}, ${g(LUMA[1])}, ${g(LUMA[2])} )`;
  const warm = `vec3( ${g(f.warm[0])}, ${g(f.warm[1])}, ${g(f.warm[2])} )`;
  const fix = (term: string) =>
    `${term} = mix( vec3( dot( ${term}, ${luma} ) ), ${term}, ${g(f.saturation)} ) * ${warm};`;
  const block = `${ROCK_FILL_ANCHOR}
	// World Style Refined: warm grey stone in shade (rock_material_core.ts)
	${fix('reflectedLight.indirectDiffuse')}
	${fix('reflectedLight.indirectSpecular')}`;
  return frag.slice(0, at) + block + frag.slice(at + ROCK_FILL_ANCHOR.length);
}

/** The baked per-vertex rock colour at a normal's up component: upward faces
 *  blend toward `tint` (moss or snow dust), the underside takes a little AO. */
export function rockTopTint(
  upness: number,
  tint: readonly [number, number, number],
): [number, number, number] {
  const x = Math.min(1, Math.max(0, (upness - 0.25) / (0.85 - 0.25)));
  const t = x * x * (3 - 2 * x);
  const ao = 1 + Math.min(0, upness) * 0.25;
  return [0, 1, 2].map((k) => (1 + (tint[k] - 1) * t) * ao) as [number, number, number];
}
