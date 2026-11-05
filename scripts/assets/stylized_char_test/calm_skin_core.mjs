// The skin-blotch gate of fit_woc_rig.mjs --calm-skin (pure, per texel).
// A texel is a blotch when it is red-orange (hue at most HUE_MAX degrees), strongly saturated
// (above SAT_MIN) and bright (value above VAL_MIN): Tripo's painted rosy cheeks and nose.
// Its saturation is pulled to SAT_TO plus a little of what it had, hue and value kept.
export const HUE_MAX = 26;
export const SAT_MIN = 0.52;
export const VAL_MIN = 0.55;
export const SAT_TO = 0.4;

export function calmSkinTexel(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const v = mx / 255;
  const s = mx > 0 ? (mx - mn) / mx : 0;
  if (v < VAL_MIN || s < SAT_MIN || mx !== r) return [r, g, b];
  // hue of a red-max texel: 60 * (g - b) / (max - min), wrapped
  let h = (60 * (g - b)) / Math.max(1, mx - mn);
  if (h < 0) h += 360;
  if (h > HUE_MAX && h < 340) return [r, g, b];
  const s2 = SAT_TO + (s - SAT_MIN) * 0.25;
  // rebuild from hue, s2, v (red-max sector: r = max, b or g = min)
  const max = mx;
  const min = max * (1 - s2);
  const scale = (min - max) / (mn - mx || -1);
  const remap = (c) => Math.round(max + (c - mx) * scale);
  return [r, remap(g), remap(b)];
}
