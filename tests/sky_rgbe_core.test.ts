import { describe, expect, it } from 'vitest';
import {
  brightestUv,
  calibrateExposure,
  decodeRadiance,
  encodeRadiance,
  findPaintedSun,
  injectSun,
  linearFromSrgb8,
  rollU,
  scaleImage,
  settlePoles,
  skyIrradiance,
  srgbToLinear,
  wrapSeam,
} from '../scripts/assets/lib/sky_rgbe_core.mjs';

type Img = { width: number; height: number; data: Float32Array };

const flat = (w: number, h: number, rgb: [number, number, number]): Img => {
  const data = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) data.set(rgb, i * 3);
  return { width: w, height: h, data };
};

const gradient = (w: number, h: number): Img => {
  const img = flat(w, h, [0, 0, 0]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      img.data[o] = 0.2 + x / w;
      img.data[o + 1] = 0.4 + (0.5 * y) / h;
      img.data[o + 2] = 0.9;
    }
  }
  return img;
};

describe('the realm sky RGBE core', () => {
  it('round-trips through Radiance RLE within the shared-exponent precision', () => {
    const img = gradient(64, 32);
    img.data[5 * 3] = 3000; // a sun texel far above 1
    const back = decodeRadiance(encodeRadiance(img));
    expect(back.width).toBe(64);
    expect(back.height).toBe(32);
    for (let i = 0; i < img.data.length; i++) {
      // RGBE shares one exponent per texel, so precision is relative to that texel's
      // brightest channel (the sun texel's other channels round to zero, by design).
      const p = i - (i % 3);
      const peak = Math.max(img.data[p], img.data[p + 1], img.data[p + 2]);
      expect(Math.abs(back.data[i] - img.data[i])).toBeLessThanOrEqual(peak / 64 + 1e-6);
    }
  });

  it('linearizes sRGB the standard way', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
    const img = linearFromSrgb8(new Uint8Array([255, 0, 128, 255]), 1, 1, 4);
    expect(img.data[0]).toBeCloseTo(1, 6);
    expect(img.data[1]).toBe(0);
  });

  it('wraps the seam so the first and last columns meet', () => {
    const img = wrapSeam(gradient(128, 8), 0.05);
    for (let y = 0; y < 8; y++) {
      const a = img.data[y * 128 * 3];
      const b = img.data[(y * 128 + 127) * 3];
      expect(Math.abs(a - b)).toBeLessThan(0.02);
    }
    // the width is kept and the painting runs on in order across the middle (no mirror)
    expect(img.width).toBe(128);
    expect(img.data[(4 * 128 + 80) * 3]).toBeGreaterThan(img.data[(4 * 128 + 40) * 3]);
  });

  it('settles the zenith to one colour and the lower hemisphere toward a darker haze', () => {
    const img = settlePoles(gradient(64, 64), {
      zenithV: 0.1,
      horizonV: 0.5,
      hazeV: 0.8,
      groundGain: 0.5,
    });
    const top = [0, 10, 40, 63].map((x) => img.data[x * 3]);
    for (const v of top) expect(v).toBeCloseTo(top[0], 5);
    const bottom = img.data[(63 * 64 + 10) * 3 + 2];
    expect(bottom).toBeCloseTo(0.9 * 0.5, 2);
  });

  it('injects a round HDR sun at the requested azimuth, which the brightest texel reports', () => {
    const img = injectSun(flat(512, 256, [0.5, 0.5, 0.5]), { u: 0.745, v: 0.47, radiance: 30 });
    const b = brightestUv(img);
    expect(b.u).toBeCloseTo(0.745, 2);
    expect(b.v).toBeCloseTo(0.47, 2);
    expect(b.luminance).toBeGreaterThan(20);
  });

  it('finds a painted sun and rolls it onto the target azimuth, and finds none in an even sky', () => {
    const base = flat(256, 128, [0.3, 0.3, 0.35]);
    const painted = injectSun(base, {
      u: 0.2,
      v: 0.4,
      radiance: 1,
      radiusDeg: 3,
      haloDeg: 6,
      haloGain: 0.4,
    });
    const found = findPaintedSun(painted);
    expect(found).not.toBeNull();
    expect(found?.u).toBeCloseTo(0.2, 1);
    const rolled = rollU(painted, 0.7 - (found?.u ?? 0));
    expect(findPaintedSun(rolled)?.u).toBeCloseTo(0.7, 1);
    expect(findPaintedSun(base)).toBeNull();
  });

  it('calibrates the open sky onto a target irradiance through the clamp', () => {
    const sky = gradient(128, 64);
    const sun = { u: 0.5, v: 0.3, radiance: 40 };
    const build = (k: number) => injectSun(scaleImage(sky, k), sun);
    const k = calibrateExposure(build, 0.3977, 0.5, 2.0);
    expect(skyIrradiance(build(k), 0.5, 2.0)).toBeCloseTo(0.3977, 3);
  });
});
