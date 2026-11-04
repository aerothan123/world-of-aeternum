// Painted ground textures: the pure image math behind
// scripts/assets/build_painted_ground.mjs. No I/O, no sharp, no randomness:
// every function maps typed arrays to typed arrays, so the same source bytes
// always yield the same shipped maps (pinned by tests/painted_ground_core.test.ts).
//
// Images are planar-free interleaved RGB Float32Arrays in 0..1 (sRGB-encoded
// values, the way the JPGs store them) with an explicit width and height.
// Single-channel fields (luminance, height) are Float32Arrays of w * h.

const LUMA = [0.2126, 0.7152, 0.0722];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** Index into a dimension, wrapped (tileable) or clamped (edge). */
function at(i, n, wrap) {
  if (wrap) return ((i % n) + n) % n;
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

/** One separable box-blur pass over a single-channel field. */
function boxPass(src, w, h, r, horizontal, wrap) {
  const out = new Float32Array(w * h);
  const n = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const inv = 1 / (2 * r + 1);
  for (let line = 0; line < lines; line++) {
    const idx = (k) => (horizontal ? line * w + k : k * w + line);
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[idx(at(k, n, wrap))];
    for (let k = 0; k < n; k++) {
      out[idx(k)] = sum * inv;
      sum += src[idx(at(k + r + 1, n, wrap))] - src[idx(at(k - r, n, wrap))];
    }
  }
  return out;
}

/** Near-Gaussian blur: three box passes per axis (radius r each). */
export function blurField(field, w, h, r, wrap) {
  if (r < 1) return Float32Array.from(field);
  let f = field;
  for (let i = 0; i < 3; i++) {
    f = boxPass(f, w, h, r, true, wrap);
    f = boxPass(f, w, h, r, false, wrap);
  }
  return f;
}

export function luminance(rgb, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = rgb[i * 3] * LUMA[0] + rgb[i * 3 + 1] * LUMA[1] + rgb[i * 3 + 2] * LUMA[2];
  }
  return out;
}

function mean(field) {
  let s = 0;
  for (let i = 0; i < field.length; i++) s += field[i];
  return s / field.length;
}

/**
 * Low-frequency shading range: max over min of the heavily blurred
 * luminance (1 is perfectly flat lighting). A generated texture with a dark
 * vignette or a lit corner reads well above 1; the flatten pass brings it
 * close to 1 without touching the brush detail.
 */
export function lowFrequencyRange(rgb, w, h, radius) {
  const b = blurField(luminance(rgb, w, h), w, h, radius, false);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < b.length; i++) {
    if (b[i] < lo) lo = b[i];
    if (b[i] > hi) hi = b[i];
  }
  return hi / Math.max(lo, 1e-4);
}

/**
 * Flatten large-scale shading: divide every channel by its own blurred
 * neighbourhood (relative to that channel's image mean), so baked-in
 * vignettes, shaded corners and slow hue drifts vanish while detail finer
 * than `radius` stays. Per channel on purpose: a generated image's darker
 * corners also shift saturation, and a luminance-only gain leaves that hue
 * step for the tiling blend to expose. `strength` 1 removes the low
 * frequencies fully; the gain is clamped so a near-black patch is never
 * blown up into noise.
 */
export function flattenLowFrequency(rgb, w, h, { radius, strength = 1 }) {
  const out = new Float32Array(rgb.length);
  const ch = new Float32Array(w * h);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < w * h; i++) ch[i] = rgb[i * 3 + c];
    const blur = blurField(ch, w, h, radius, false);
    const m = mean(ch);
    for (let i = 0; i < w * h; i++) {
      const gain = Math.min(2.2, Math.max(0.45, (m / Math.max(blur[i], 1e-4)) ** strength));
      out[i * 3 + c] = clamp01(ch[i] * gain);
    }
  }
  return out;
}

/** Deterministic lattice value noise in 0..1 (integer hash, smooth lerp). */
export function valueNoise(x, y, seed) {
  const hash = (ix, iy) => {
    let n = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * fx;
  const b = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}

/**
 * Blend mask for one axis of the offset-and-blend tiling: 1 across the
 * middle, falling to 0 at the two borders of `axis` ('x' the left and right
 * edges, 'y' the top and bottom) over `band` (share of the size), its edge
 * wandered by `wobble` along the other axis (0 a straight ramp; kept under 1
 * so the ramp always completes inside the image).
 */
export function tileMask(w, h, band, wobble = 0, axis = 'x') {
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const along = axis === 'x' ? x : y;
      const n0 = axis === 'x' ? w : h;
      const across = axis === 'x' ? y / h : x / w;
      const e = Math.min(along + 0.5, n0 - along - 0.5) / n0;
      // Two octaves of value noise push the switch line in and out, so the
      // band never reads as a straight frame. Scaled, never offset: the
      // border stays exactly 0 (wrap-continuous) and the middle exactly 1.
      const side = along < n0 / 2 ? 0 : 50;
      const n = wobble
        ? (valueNoise(across * 7, side, 11) * 0.65 +
            valueNoise(across * 19, side, 23) * 0.35 -
            0.5) *
          wobble
        : 0;
      m[y * w + x] = smooth((e / band) * (1 + n));
    }
  }
  return m;
}

/** One axis of the tiling: keep `rgb` in the middle, its copy shifted by
 *  half the size along `axis` toward that axis' borders. */
function tileAxis(rgb, w, h, band, edgeBias, wobble, axis, means) {
  const mask = tileMask(w, h, band, wobble, axis);
  const lum = luminance(rgb, w, h);
  const out = new Float32Array(rgb.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const s = axis === 'x' ? y * w + ((x + (w >> 1)) % w) : ((y + (h >> 1)) % h) * w + x;
      // luminance-biased switch: where the mask is undecided, the image whose
      // texel is brighter (a stone top, a lit blade) wins.
      const m0 = mask[i];
      const t =
        m0 >= 1 ? 1 : m0 <= 0 ? 0 : smooth((m0 - 0.5 + (lum[i] - lum[s]) * edgeBias) * 2.2 + 0.5);
      const norm = 1 / Math.sqrt(t * t + (1 - t) * (1 - t));
      for (let c = 0; c < 3; c++) {
        const a = rgb[i * 3 + c] - means[c];
        const b = rgb[s * 3 + c] - means[c];
        out[i * 3 + c] = clamp01(means[c] + (a * t + b * (1 - t)) * norm);
      }
    }
  }
  return out;
}

/**
 * One axis of the tiling by a minimum-error seam cut instead of a blend:
 * inside each border band a dynamic-programming path runs top to bottom
 * (for the 'x' axis) through the texels where the image and its shifted
 * copy agree best, and the switch from copy to image happens on that path
 * with a short feather. Structured paintings (slabs, cobbles, leaves) then
 * show whole features from one source or the other, never a double image.
 */
function seamAxis(rgb, w, h, band, axis) {
  // Work in 'x' layout; the 'y' axis transposes in and out.
  const T = axis === 'y';
  const W = T ? h : w;
  const H = T ? w : h;
  const get = (img, x, y, c) => (T ? img[(x * w + y) * 3 + c] : img[(y * w + x) * 3 + c]);
  const half = W >> 1;
  const bw = Math.max(6, Math.round(band * W));
  const feather = 1.5;
  const cost = (x, y) => {
    const sx = (x + half) % W;
    let d = 0;
    for (let c = 0; c < 3; c++) d += Math.abs(get(rgb, x, y, c) - get(rgb, sx, y, c));
    return d;
  };
  // Minimum-cost top-to-bottom path over columns [lo, hi], steps of at most
  // one column per row; ties prefer the band's middle (deterministic).
  const path = (lo, hi) => {
    const n = hi - lo + 1;
    const E = new Float32Array(n * H);
    const mid = (lo + hi) / 2;
    const bias = (x) => Math.abs(x - mid) * 1e-4;
    for (let x = 0; x < n; x++) E[x] = cost(lo + x, 0) + bias(lo + x);
    for (let y = 1; y < H; y++) {
      for (let x = 0; x < n; x++) {
        let m = E[(y - 1) * n + x];
        if (x > 0 && E[(y - 1) * n + x - 1] < m) m = E[(y - 1) * n + x - 1];
        if (x < n - 1 && E[(y - 1) * n + x + 1] < m) m = E[(y - 1) * n + x + 1];
        E[y * n + x] = m + cost(lo + x, y) + bias(lo + x);
      }
    }
    const out = new Int32Array(H);
    let bx = 0;
    for (let x = 1; x < n; x++) if (E[(H - 1) * n + x] < E[(H - 1) * n + bx]) bx = x;
    out[H - 1] = bx;
    for (let y = H - 2; y >= 0; y--) {
      const px = out[y + 1];
      let best = px;
      if (px > 0 && E[y * n + px - 1] < E[y * n + best]) best = px - 1;
      if (px < n - 1 && E[y * n + px + 1] < E[y * n + best]) best = px + 1;
      out[y] = best;
    }
    for (let y = 0; y < H; y++) out[y] += lo;
    return out;
  };
  const left = path(3, bw - 4);
  const right = path(W - bw + 3, W - 4);
  const out = new Float32Array(rgb.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let t = 1;
      if (x < bw) t = smooth((x - left[y]) / (2 * feather) + 0.5);
      else if (x >= W - bw) t = smooth((right[y] - x) / (2 * feather) + 0.5);
      const sx = (x + half) % W;
      const o = T ? (x * w + y) * 3 : (y * w + x) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = get(rgb, x, y, c) * t + get(rgb, sx, y, c) * (1 - t);
    }
  }
  return out;
}

/**
 * Make an image tileable by offset-and-blend, one axis at a time. A copy
 * shifted by half the width is wrap-continuous left to right (its own seam
 * is the middle column), so the original is kept in the middle and the copy
 * takes over toward the left and right borders; the result is then treated
 * the same way top to bottom. Shifting an x-tileable image in y keeps it
 * x-tileable, so the second pass never reopens the first seam, and neither
 * copy's own seam is ever shown (each sits where its mask is exactly 1).
 * Two refinements keep the blend band from reading as a soft ghost: the
 * switch follows a luminance-biased threshold (the cut follows brush strokes
 * and stone edges instead of a straight ramp), and what is still blended is
 * variance-preserving (re-scaled about the image mean so the band keeps the
 * source contrast). `seam` swaps the blend for a minimum-error seam cut
 * (seamAxis), the right choice for structured paintings.
 */
export function makeTileable(
  rgb,
  w,
  h,
  { band = 0.24, edgeBias = 0.35, wobble = 0.8, seam = false } = {},
) {
  if (seam) return seamAxis(seamAxis(rgb, w, h, band, 'x'), w, h, band, 'y');
  const means = [0, 0, 0];
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) means[c] += rgb[i * 3 + c];
  for (let c = 0; c < 3; c++) means[c] /= w * h;
  const xTiled = tileAxis(rgb, w, h, band, edgeBias, wobble, 'x', means);
  return tileAxis(xTiled, w, h, band, edgeBias, wobble, 'y', means);
}

/**
 * Seam ratio: the mean colour step across the wrap border (last column to
 * first, last row to first) over the mean step between interior neighbours.
 * A tileable image sits near 1; a raw generated image is several times that.
 */
export function seamRatio(rgb, w, h) {
  const diff = (i, j) =>
    Math.abs(rgb[i * 3] - rgb[j * 3]) +
    Math.abs(rgb[i * 3 + 1] - rgb[j * 3 + 1]) +
    Math.abs(rgb[i * 3 + 2] - rgb[j * 3 + 2]);
  let seam = 0;
  for (let y = 0; y < h; y++) seam += diff(y * w + w - 1, y * w);
  for (let x = 0; x < w; x++) seam += diff((h - 1) * w + x, x);
  seam /= w + h;
  let inner = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 3) {
    for (let x = 1; x < w - 1; x += 3) {
      inner += diff(y * w + x, y * w + x + 1) + diff(y * w + x, (y + 1) * w + x);
      n += 2;
    }
  }
  return seam / Math.max(inner / n, 1e-6);
}

/**
 * Height field from the colour: the luminance high-passed against a wide
 * wrap blur (so broad tone never reads as slope), lightly smoothed (paint
 * grain is not relief), normalised to mean 0.5 and +-3 standard deviations.
 */
export function heightFromColor(rgb, w, h, { highPass = 40, smoothR = 1 } = {}) {
  const lum = luminance(rgb, w, h);
  const base = blurField(lum, w, h, highPass, true);
  let f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = lum[i] - base[i];
  f = blurField(f, w, h, smoothR, true);
  const m = mean(f);
  let v = 0;
  for (let i = 0; i < f.length; i++) v += (f[i] - m) * (f[i] - m);
  const sd = Math.sqrt(v / f.length) || 1;
  const out = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = clamp01(0.5 + (f[i] - m) / sd / 6);
  return out;
}

/**
 * OpenGL-convention tangent normal map (green = +V, image up) from a height
 * field, wrap-sampled so the map tiles exactly like the colour. Returns
 * interleaved RGB bytes.
 */
export function normalFromHeight(height, w, h, strength) {
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hx0 = height[y * w + at(x - 1, w, true)];
      const hx1 = height[y * w + at(x + 1, w, true)];
      const hy0 = height[at(y - 1, h, true) * w + x];
      const hy1 = height[at(y + 1, h, true) * w + x];
      // rows run down the image, V runs up: dh/dv = -(dh/drow)
      const nx = -(hx1 - hx0) * strength;
      const ny = (hy1 - hy0) * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const o = (y * w + x) * 3;
      out[o] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

/** Matte painted roughness: high everywhere, a touch lower on raised tops. */
export function roughnessFromHeight(height, { base = 0.9, swing = 0.08 } = {}) {
  const out = new Uint8Array(height.length);
  for (let i = 0; i < height.length; i++) {
    out[i] = Math.round(clamp01(base - (height[i] - 0.5) * 2 * swing) * 255);
  }
  return out;
}

/** Ambient occlusion from local cavities (height under its neighbourhood). */
export function aoFromHeight(height, w, h, { radius = 6, gain = 2.4, floor = 0.55 } = {}) {
  const b = blurField(height, w, h, radius, true);
  const out = new Uint8Array(height.length);
  for (let i = 0; i < height.length; i++) {
    const ao = Math.max(floor, Math.min(1, 1 + (height[i] - b[i]) * gain));
    out[i] = Math.round(ao * 255);
  }
  return out;
}

/**
 * A gentle colour grade about each pixel's own luminance: `saturation` 1
 * keeps the chroma, under 1 pulls it toward grey; `gain` scales the value.
 * Used to sit an over-saturated generated set (the path's neon orange) into
 * the same earthy range as the rest of the ground.
 */
export function gradeColor(rgb, { saturation = 1, gain = 1 } = {}) {
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const l = rgb[i] * LUMA[0] + rgb[i + 1] * LUMA[1] + rgb[i + 2] * LUMA[2];
    for (let c = 0; c < 3; c++) out[i + c] = clamp01((l + (rgb[i + c] - l) * saturation) * gain);
  }
  return out;
}

/**
 * Sit a set on a target mean colour (sRGB 0..1) with per-channel gains, so
 * the shader's biome tints (authored against the shipped photos' tones)
 * colour the painting the way they coloured the photo, then raise the
 * brush-stroke detail by `contrast` on LUMINANCE only (each texel's value
 * against the mean value), so a stronger stroke never turns into a hue
 * speckle.
 */
export function matchMean(rgb, target, contrast = 1) {
  const n = rgb.length / 3;
  const m = [0, 0, 0];
  for (let i = 0; i < rgb.length; i += 3) for (let c = 0; c < 3; c++) m[c] += rgb[i + c];
  const k = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const mc = m[c] / n;
    k[c] = (target ? target[c] : mc) / Math.max(mc, 1e-4);
  }
  const lm = (target ?? m.map((v) => v / n)).reduce((acc, v, c) => acc + v * LUMA[c], 0);
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i] * k[0];
    const g = rgb[i + 1] * k[1];
    const b = rgb[i + 2] * k[2];
    const l = r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
    const f = Math.max(0, 1 + ((l - lm) / Math.max(lm, 1e-4)) * (contrast - 1));
    out[i] = clamp01(r * f);
    out[i + 1] = clamp01(g * f);
    out[i + 2] = clamp01(b * f);
  }
  return out;
}

/** The full pass for one set: flatten, tile, grade, then derive the maps. */
export function paintedGroundMaps(rgb, w, h, opts = {}) {
  const flat = flattenLowFrequency(rgb, w, h, {
    radius: opts.flattenRadius ?? Math.round(w / 12),
    strength: opts.flattenStrength ?? 1,
  });
  const tiled = makeTileable(flat, w, h, {
    band: opts.tileBand,
    edgeBias: opts.tileEdgeBias,
    wobble: opts.tileWobble,
    seam: opts.tileSeam,
  });
  const graded = gradeColor(tiled, { saturation: opts.saturation, gain: opts.gain });
  const color =
    opts.targetMean || opts.contrast
      ? matchMean(
          graded,
          opts.targetMean ? opts.targetMean.map((v) => v / 255) : null,
          opts.contrast ?? 1,
        )
      : graded;
  const height = heightFromColor(color, w, h, { highPass: opts.heightHighPass });
  return {
    color,
    normal: normalFromHeight(height, w, h, opts.normalStrength ?? 6),
    roughness: roughnessFromHeight(height, { base: opts.roughness }),
    ao: aoFromHeight(height, w, h, { gain: opts.aoGain }),
  };
}

/** Float RGB to interleaved bytes. */
export function toBytes(rgb) {
  const out = new Uint8Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) out[i] = Math.round(clamp01(rgb[i]) * 255);
  return out;
}

/** Interleaved RGB bytes to floats in 0..1. */
export function fromBytes(bytes) {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] / 255;
  return out;
}
