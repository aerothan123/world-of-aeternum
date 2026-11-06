// World Style Refined water: the painted storybook look of every realm's
// water, as DATA only. Pure and Three-free (registered in RENDER_PURE_CORES,
// tests/architecture.test.ts; pinned by tests/water_style_core.test.ts).
//
// Refined changes no shader. It maps each realm's water character (the table
// in water_character_core.ts) onto a softer painted palette before the field
// bakes it, and picks the surface's look knobs (OCEAN_LOOK, ocean_material.ts):
// the same programs draw it, so there is nothing new to link, prewarm or gate.
// Classic returns every character and the shipped look exactly.
//
// What the painted look is:
//   colour   each deep and shallow tone eases toward a painted anchor (a soft
//            jade shallow, a slate-teal deep) and loses a little saturation,
//            so no realm reads as a neon pool, yet every realm keeps its own
//            hue family (the fen stays tea-dark, the dusk sea stays violet)
//   foam     shore surf, contact foam and whitecaps are the painted strokes:
//            a touch more of them
//   chop     gentler wave slopes, so the surface reads as soft painted swell
//   sun      a softer glitter (a broad painted highlight, not a mirror's
//            spark field), less refraction wobble and fainter caustics
// Clarity (absorb) is untouched: what shows through shallow water is the same
// on both styles.

import type { WorldStyle } from '../world_style_core';
import type { WaterCharacter } from './water_character_core';

export const REFINED_WATER = {
  /** The painted anchors each realm's deep / shallow tone eases toward (sRGB). */
  deepAnchor: 0x1f5866,
  shallowAnchor: 0x68ad9c,
  /** Share of the way toward the anchor. */
  anchorMix: 0.45,
  /** Saturation kept around each tone's own luma. */
  saturation: 0.74,
  foamGain: 1.7,
  chopGain: 0.75,
} as const;

/** OCEAN_LOOK per style: x sun brightness on the water, y refraction
 *  strength, z caustic strength, w whitecap strength. */
export const CLASSIC_OCEAN_LOOK = [5.5, 0.07, 0.8, 1] as const;
export const REFINED_OCEAN_LOOK = [3, 0.05, 0.5, 1.35] as const;

export function oceanLookFor(style: WorldStyle): readonly [number, number, number, number] {
  return style === 'refined' ? REFINED_OCEAN_LOOK : CLASSIC_OCEAN_LOOK;
}

const ch = (hex: number, shift: number): number => (hex >> shift) & 255;

/** One sRGB hex tone eased toward `anchor` by `mix`, then desaturated to
 *  `saturation` around its Rec. 709 luma. Returns an sRGB hex. */
export function paintedWaterTone(
  hex: number,
  anchor: number,
  mix: number,
  saturation: number,
): number {
  const rgb = [16, 8, 0].map((s) => ch(hex, s) + (ch(anchor, s) - ch(hex, s)) * mix);
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const out = rgb.map((v) =>
    Math.max(0, Math.min(255, Math.round(luma + (v - luma) * saturation))),
  );
  return (out[0] << 16) | (out[1] << 8) | out[2];
}

/** A realm's water character under the Refined painted look. */
export function refinedWaterCharacter(c: WaterCharacter): WaterCharacter {
  const w = REFINED_WATER;
  return {
    deep: paintedWaterTone(c.deep, w.deepAnchor, w.anchorMix, w.saturation),
    shallow: paintedWaterTone(c.shallow, w.shallowAnchor, w.anchorMix, w.saturation),
    absorb: c.absorb,
    chop: c.chop * w.chopGain,
    foam: c.foam * w.foamGain,
  };
}

/** The character a style draws (Classic: the same object). */
export function styledWaterCharacter(c: WaterCharacter, style: WorldStyle): WaterCharacter {
  return style === 'refined' ? refinedWaterCharacter(c) : c;
}
