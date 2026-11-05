// Pure helpers for the realm sky painter (scripts/assets/paint_realm_skies.mjs): the
// PNG-to-Radiance step that turns one painted equirect panorama into an HDR master
// under public/env/, which compress_sky_hdr.mjs then encodes to KTX2.
//
// Pipeline, in order: decode the painting (sRGB 8-bit) to linear light, wrap the
// u=0/u=1 seam so the dome has no visible join, soften the zenith so the pole does
// not pinch, settle the lower hemisphere into a horizon haze (terrain hides it, but
// the IBL integrates it), scale the open sky so its measured irradiance lands on a
// target, then re-inject a true HDR sun the LDR painting cannot carry. A painting
// tops out at 1.0, so without that last step the sun is a white smudge and the IBL
// has no directional energy.
//
// No fs and no child_process here: tests/sky_rgbe_core.test.ts imports this module
// directly, so it stays pure and light. Images are { width, height, data } with
// data a Float32Array of linear RGB triples, row 0 at the zenith.

/** sRGB transfer to linear, for one 0..1 channel. */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear RGB from 8-bit sRGB pixels (RGB or RGBA, `channels` per pixel). */
export function linearFromSrgb8(pixels, width, height, channels) {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i / 255);
  const data = new Float32Array(width * height * 3);
  for (let i = 0, n = width * height; i < n; i++) {
    data[i * 3] = lut[pixels[i * channels]];
    data[i * 3 + 1] = lut[pixels[i * channels + 1]];
    data[i * 3 + 2] = lut[pixels[i * channels + 2]];
  }
  return { width, height, data };
}

/** Rec. 709 luminance of one linear RGB triple. */
export function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Bilinear sample with the u axis wrapping and v clamped. */
export function sampleEquirect(img, u, v) {
  const { width: w, height: h, data } = img;
  const x = (((u % 1) + 1) % 1) * w - 0.5;
  const y = Math.min(h - 1, Math.max(0, v * h - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const y1 = Math.min(h - 1, y0 + 1);
  const xa = ((x0 % w) + w) % w;
  const xb = (xa + 1) % w;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = data[(y0 * w + xa) * 3 + c] * (1 - fx) + data[(y0 * w + xb) * 3 + c] * fx;
    const b = data[(y1 * w + xa) * 3 + c] * (1 - fx) + data[(y1 * w + xb) * 3 + c] * fx;
    out[c] = a * (1 - fy) + b * fy;
  }
  return out;
}

/** Area-averaging resample (box filter when shrinking, bilinear when not). */
export function resampleEquirect(img, width, height) {
  const data = new Float32Array(width * height * 3);
  const sx = img.width / width;
  const sy = img.height / height;
  if (sx <= 1 && sy <= 1) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = sampleEquirect(img, (x + 0.5) / width, (y + 0.5) / height);
        data.set(s, (y * width + x) * 3);
      }
    }
    return { width, height, data };
  }
  for (let y = 0; y < height; y++) {
    const ya = Math.floor(y * sy);
    const yb = Math.max(ya + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const xa = Math.floor(x * sx);
      const xb = Math.max(xa + 1, Math.floor((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = ya; yy < yb; yy++) {
        for (let xx = xa; xx < xb; xx++) {
          const o = (yy * img.width + xx) * 3;
          r += img.data[o];
          g += img.data[o + 1];
          b += img.data[o + 2];
          n++;
        }
      }
      const o = (y * width + x) * 3;
      data[o] = r / n;
      data[o + 1] = g / n;
      data[o + 2] = b / n;
    }
  }
  return { width, height, data };
}

/**
 * Make the u=0 and u=1 columns meet. The painting's last `frac` of columns is
 * cross-faded over its first ones (a linear blend from the right edge's content into
 * the left edge's), the blended tail is dropped, and the result is resampled back to
 * the original width. Unlike a mirror blend this leaves no V-shaped echo at the seam:
 * the join is simply the painting continuing into its own beginning.
 */
export function wrapSeam(img, frac = 0.04) {
  const { width: w, height: h, data } = img;
  const band = Math.max(1, Math.round(w * frac));
  const cw = w - band;
  const cut = new Float32Array(cw * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 3;
      const src = (y * w + x) * 3;
      if (x < band) {
        // t is 0 at the first column, so it IS the column after the dropped tail's last one
        const t = x / band;
        const tail = (y * w + (cw + x)) * 3;
        for (let c = 0; c < 3; c++) cut[o + c] = data[tail + c] * (1 - t) + data[src + c] * t;
      } else {
        cut[o] = data[src];
        cut[o + 1] = data[src + 1];
        cut[o + 2] = data[src + 2];
      }
    }
  }
  return resampleEquirect({ width: cw, height: h, data: cut }, w, h);
}

/** Mean linear RGB of one row. */
export function rowMean(img, y) {
  const { width: w, data } = img;
  const m = [0, 0, 0];
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) m[c] += data[(y * w + x) * 3 + c];
  }
  return m.map((v) => v / w);
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Settle the two poles. Near the zenith every column converges on one point, so any
 * horizontal detail pinches into a star: rows above `zenithV` fade to the mean of the
 * row at `zenithV`. Below the horizon (`horizonV`, 0.5 for a level painting) the dome
 * fades into a haze built from the horizon row (or the row at `groundV`), scaled by `groundGain`, so the IBL
 * sees a plausible lower hemisphere instead of whatever the painting put there.
 */
export function settlePoles(
  img,
  { zenithV = 0.12, horizonV = 0.5, hazeV = 0.62, groundGain = 0.35, groundV = null } = {},
) {
  const { width: w, height: h } = img;
  const data = new Float32Array(img.data);
  const zRow = Math.max(0, Math.min(h - 1, Math.round(zenithV * h)));
  const zenith = rowMean(img, zRow);
  // The haze colour comes from the painted sea at groundV when given (the horizon row is
  // the brightest band, the sun's lane), else from the horizon row itself.
  const gv = groundV ?? horizonV;
  const hRow = Math.max(0, Math.min(h - 1, Math.round(gv * h) - 1));
  const horizon = rowMean(img, hRow);
  const ground = horizon.map((v) => v * groundGain);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const tz = v < zenithV ? 1 - smooth(zenithV * 0.4, zenithV, v) : 0;
    const tg = v > horizonV ? smooth(horizonV, hazeV, v) : 0;
    if (tz === 0 && tg === 0) continue;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        let val = data[o + c];
        if (tz > 0) val = val * (1 - tz) + zenith[c] * tz;
        if (tg > 0) val = val * (1 - tg) + ground[c] * tg;
        data[o + c] = val;
      }
    }
  }
  return { width: w, height: h, data };
}

/** Multiply every texel by `k`. */
export function scaleImage(img, k) {
  const data = new Float32Array(img.data.length);
  for (let i = 0; i < data.length; i++) data[i] = img.data[i] * k;
  return { width: img.width, height: img.height, data };
}

/**
 * Re-inject a real HDR sun at (u, v): a hard disc of `radiance` (linear, per channel
 * scaled by `color`) of angular radius `radiusDeg`, plus a soft additive halo of
 * `haloGain` that falls off over `haloDeg`. Distances are true great-circle angles,
 * so the disc stays round at any elevation instead of stretching with the latlong.
 */
export function injectSun(
  img,
  { u, v, radiance = 4000, radiusDeg = 0.6, haloDeg = 9, haloGain = 2.5, color = [1, 0.95, 0.85] },
) {
  const { width: w, height: h } = img;
  const data = new Float32Array(img.data);
  const dir = (uu, vv) => {
    const phi = uu * 2 * Math.PI;
    const theta = vv * Math.PI;
    return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
  };
  const s = dir(u, v);
  const rad = (radiusDeg * Math.PI) / 180;
  const halo = (haloDeg * Math.PI) / 180;
  // Only rows that can reach the halo are visited.
  const reach = halo * 3;
  const y0 = Math.max(0, Math.floor(((v * Math.PI - reach) / Math.PI) * h));
  const y1 = Math.min(h - 1, Math.ceil(((v * Math.PI + reach) / Math.PI) * h));
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < w; x++) {
      const d = dir((x + 0.5) / w, (y + 0.5) / h);
      const cos = Math.min(1, Math.max(-1, d[0] * s[0] + d[1] * s[1] + d[2] * s[2]));
      const ang = Math.acos(cos);
      if (ang > reach) continue;
      const o = (y * w + x) * 3;
      // anti-aliased disc edge over a quarter of the radius
      const disc = 1 - smooth(rad * 0.75, rad * 1.25, ang);
      const glow = haloGain * Math.exp(-((ang / halo) ** 2));
      for (let c = 0; c < 3; c++) {
        data[o + c] = data[o + c] * (1 - disc) + radiance * color[c] * disc + glow * color[c];
      }
    }
  }
  return { width: w, height: h, data };
}

/** Brightest texel's (u, v), the convention sky.ts's HDRI_SUN_U is measured in. */
export function brightestUv(img) {
  let best = -1;
  let bi = 0;
  for (let i = 0, n = img.width * img.height; i < n; i++) {
    const l = luminance(img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]);
    if (l > best) {
      best = l;
      bi = i;
    }
  }
  const x = bi % img.width;
  const y = Math.floor(bi / img.width);
  return { u: (x + 0.5) / img.width, v: (y + 0.5) / img.height, luminance: best };
}

/**
 * Solid-angle-weighted mean luminance with sky.ts's gain and clamp applied: the
 * identical measure scripts/hdri_irradiance.mjs reports, so a target taken from
 * REALM_SKY_IRRADIANCE is reproduced by that script after the repaint.
 */
export function skyIrradiance(img, gain, clamp) {
  let sum = 0;
  let weight = 0;
  for (let y = 0; y < img.height; y++) {
    const wgt = Math.sin(((y + 0.5) / img.height) * Math.PI);
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 3;
      const r = Math.min(img.data[o] * gain, clamp);
      const g = Math.min(img.data[o + 1] * gain, clamp);
      const b = Math.min(img.data[o + 2] * gain, clamp);
      sum += luminance(r, g, b) * wgt;
      weight += wgt;
    }
  }
  return sum / weight;
}

/**
 * The open-sky multiplier that lands `build(k)` on `target` irradiance. `build` maps a
 * multiplier to the finished image (sun included), so the clamp's nonlinearity is
 * accounted for exactly; irradiance is monotonic in k, so a bisection converges.
 */
export function calibrateExposure(
  build,
  target,
  gain,
  clamp,
  { lo = 1e-3, hi = 64, iters = 40 } = {},
) {
  let a = lo;
  let b = hi;
  if (skyIrradiance(build(b), gain, clamp) < target) return b;
  for (let i = 0; i < iters; i++) {
    const m = Math.sqrt(a * b);
    if (skyIrradiance(build(m), gain, clamp) < target) a = m;
    else b = m;
  }
  return Math.sqrt(a * b);
}

/** One linear RGB triple to a shared-exponent RGBE quad (Ward's encoding). */
export function toRgbe(r, g, b) {
  const m = Math.max(r, g, b);
  if (!(m > 1e-32)) return [0, 0, 0, 0];
  const e = Math.ceil(Math.log2(m) + 1e-9);
  const f = 2 ** -e * 256;
  const q = (x) => Math.min(255, Math.max(0, Math.floor(x * f)));
  return [q(r), q(g), q(b), e + 128];
}

/** Radiance .hdr bytes with new-style RLE scanlines (the format three's loaders read). */
export function encodeRadiance(img) {
  const { width: w, height: h, data } = img;
  const head = Buffer.from(
    `#?RADIANCE\n# realm sky painter\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`,
    'ascii',
  );
  const chunks = [head];
  const rgbe = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      rgbe.set(toRgbe(data[o], data[o + 1], data[o + 2]), x * 4);
    }
    const line = [2, 2, (w >> 8) & 0xff, w & 0xff];
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < w) {
        // run of identical bytes?
        let run = 1;
        while (x + run < w && run < 127 && rgbe[(x + run) * 4 + c] === rgbe[x * 4 + c]) run++;
        if (run >= 3) {
          line.push(128 + run, rgbe[x * 4 + c]);
          x += run;
          continue;
        }
        // literal span up to the next run of three
        let lit = 0;
        while (x + lit < w && lit < 128) {
          const p = x + lit;
          if (
            p + 2 < w &&
            rgbe[p * 4 + c] === rgbe[(p + 1) * 4 + c] &&
            rgbe[p * 4 + c] === rgbe[(p + 2) * 4 + c]
          )
            break;
          lit++;
        }
        line.push(lit);
        for (let i = 0; i < lit; i++) line.push(rgbe[(x + i) * 4 + c]);
        x += lit;
      }
    }
    chunks.push(Buffer.from(line));
  }
  return Buffer.concat(chunks);
}

/** Radiance .hdr decoder (flat or new-style RLE), the inverse of encodeRadiance. */
export function decodeRadiance(buf) {
  let pos = 0;
  const line = () => {
    let s = '';
    while (pos < buf.length && buf[pos] !== 0x0a) s += String.fromCharCode(buf[pos++]);
    pos++;
    return s;
  };
  if (!line().startsWith('#?')) throw new Error('not a Radiance file');
  while (line() !== '') {
    // header rows
  }
  const dims = line().trim().split(/\s+/);
  const height = Number(dims[1]);
  const width = Number(dims[3]);
  const data = new Float32Array(width * height * 3);
  const rgbe = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    if (width >= 8 && width < 32768 && buf[pos] === 2 && buf[pos + 1] === 2) {
      pos += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < width) {
          let count = buf[pos++];
          if (count > 128) {
            const value = buf[pos++];
            count -= 128;
            for (let i = 0; i < count; i++) rgbe[x++ * 4 + c] = value;
          } else {
            for (let i = 0; i < count; i++) rgbe[x++ * 4 + c] = buf[pos++];
          }
        }
      }
    } else {
      for (let i = 0; i < width * 4; i++) rgbe[i] = buf[pos++];
    }
    for (let x = 0; x < width; x++) {
      const e = rgbe[x * 4 + 3];
      const f = e === 0 ? 0 : 2 ** (e - 136);
      const o = (y * width + x) * 3;
      data[o] = rgbe[x * 4] * f;
      data[o + 1] = rgbe[x * 4 + 1] * f;
      data[o + 2] = rgbe[x * 4 + 2] * f;
    }
  }
  return { width, height, data };
}

/** Reinhard-tonemapped sRGB 8-bit preview of a linear image, for contact sheets. */
export function previewSrgb8(img, exposure = 1) {
  const out = new Uint8Array(img.width * img.height * 3);
  for (let i = 0; i < out.length; i++) {
    const x = img.data[i] * exposure;
    const t = x / (1 + x);
    const s = t <= 0.0031308 ? t * 12.92 : 1.055 * t ** (1 / 2.4) - 0.055;
    out[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
  }
  return out;
}

/** Rotate the panorama in azimuth: texel at u moves to u + du (wrapping). */
export function rollU(img, du) {
  const { width: w, height: h, data } = img;
  const shift = ((Math.round(du * w) % w) + w) % w;
  const out = new Float32Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 3;
      const dst = (y * w + ((x + shift) % w)) * 3;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Where the painting put its sun, if it painted one: the brightest cell of a coarse
 * luminance grid inside the sky band [vMin, vMax], accepted only when it stands out
 * from the median of its own row by `minContrast`. Returns null for an evenly lit
 * (overcast, sunless) painting, so the caller keeps the painting's azimuth as is.
 */
export function findPaintedSun(
  img,
  { vMin = 0.05, vMax = 0.5, cols = 128, rows = 64, minContrast = 1.35 } = {},
) {
  const small = resampleEquirect(img, cols, rows);
  let best = null;
  for (let y = Math.floor(vMin * rows); y < Math.ceil(vMax * rows); y++) {
    const lums = [];
    for (let x = 0; x < cols; x++) {
      const o = (y * cols + x) * 3;
      lums.push(luminance(small.data[o], small.data[o + 1], small.data[o + 2]));
    }
    const median = lums.slice().sort((a, b) => a - b)[cols >> 1];
    for (let x = 0; x < cols; x++) {
      const contrast = lums[x] / Math.max(1e-6, median);
      if (contrast >= minContrast && (!best || lums[x] > best.luminance)) {
        best = { u: (x + 0.5) / cols, v: (y + 0.5) / rows, luminance: lums[x], contrast };
      }
    }
  }
  return best;
}

/**
 * The painting's horizon as a fraction of its height: the row where the row-mean
 * luminance changes fastest, searched in [vMin, vMax]. A painted panorama is a
 * perspective view, not a true latlong, so its sea line rarely sits at the middle.
 */
export function findHorizon(img, { vMin = 0.3, vMax = 0.9 } = {}) {
  const means = [];
  for (let y = 0; y < img.height; y++) means.push(luminance(...rowMean(img, y)));
  const band = Math.max(2, Math.round(img.height / 128));
  let best = -1;
  let at = Math.round(img.height / 2);
  for (
    let y = Math.max(band, Math.floor(vMin * img.height));
    y < Math.min(img.height - band, Math.ceil(vMax * img.height));
    y++
  ) {
    let above = 0;
    let below = 0;
    for (let i = 1; i <= band; i++) {
      above += means[y - i];
      below += means[y + i - 1];
    }
    const step = Math.abs(above - below) / band;
    if (step > best) {
      best = step;
      at = y;
    }
  }
  return at / img.height;
}

/**
 * Re-map a painted panorama's rows onto the latlong: the painted sky [0, horizon]
 * lands on v in [skyTop, 0.5] and the painted sea [horizon, 1] on [0.5, seaBottom],
 * with the first and last painted rows held beyond those bands (settlePoles then
 * fades them into the zenith and the ground haze). The horizon ends up exactly on
 * the dome's equator, where the renderer's fog and terrain meet it.
 */
export function placeHorizon(img, horizon, { skyTop = 0.12, seaBottom = 0.85 } = {}) {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(data.length);
  const topRows = Math.max(1, Math.round(h * 0.02));
  const top = [0, 0, 0];
  for (let y = 0; y < topRows; y++) {
    const m = rowMean(img, y);
    for (let c = 0; c < 3; c++) top[c] += m[c] / topRows;
  }
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    let src;
    if (v <= skyTop) {
      // Above the painting: its top rows' mean, flat, so nothing stretches into streaks.
      for (let x = 0; x < w; x++) out.set(top, (y * w + x) * 3);
      continue;
    } else if (v <= 0.5) src = ((v - skyTop) / (0.5 - skyTop)) * horizon;
    else if (v <= seaBottom) src = horizon + ((v - 0.5) / (seaBottom - 0.5)) * (1 - horizon);
    else src = 1;
    const sy = Math.min(h - 1, Math.max(0, src * h - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const f = sy - y0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const a = (y0 * w + x) * 3;
      const b = (y1 * w + x) * 3;
      out[o] = data[a] * (1 - f) + data[b] * f;
      out[o + 1] = data[a + 1] * (1 - f) + data[b + 1] * f;
      out[o + 2] = data[a + 2] * (1 - f) + data[b + 2] * f;
    }
  }
  return { width: w, height: h, data: out };
}
