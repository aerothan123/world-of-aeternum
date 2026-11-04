// The painted ground texture pass (scripts/assets/lib/painted_ground_core.mjs):
// flattening removes baked low-frequency shading, tiling makes the wrap
// border as smooth as the interior, the derived maps follow the conventions
// the terrain sets use, and the whole pass is deterministic.
import { describe, expect, it } from 'vitest';
import {
  aoFromHeight,
  flattenLowFrequency,
  gradeColor,
  heightFromColor,
  lowFrequencyRange,
  makeTileable,
  normalFromHeight,
  paintedGroundMaps,
  roughnessFromHeight,
  seamRatio,
  tileMask,
  valueNoise,
} from '../scripts/assets/lib/painted_ground_core.mjs';

const W = 128;

/** A deterministic "generated" texture: brush-scale detail, a dark corner
 *  vignette (the dirt_path defect) and no wrap continuity. */
function synthetic(): Float32Array {
  const rgb = new Float32Array(W * W * 3);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const detail = valueNoise(x / 4, y / 4, 5) * 0.3 + valueNoise(x / 11, y / 11, 9) * 0.2;
      const cx = x / W - 0.5;
      const cy = y / W - 0.5;
      const vignette = 1 - 1.2 * (cx * cx + cy * cy);
      const ramp = 0.75 + 0.35 * (x / W); // a lit side: no wrap continuity
      const v = (0.35 + detail) * vignette * ramp;
      const i = (y * W + x) * 3;
      rgb[i] = v * 1.1;
      rgb[i + 1] = v * 0.8;
      rgb[i + 2] = v * 0.45;
    }
  }
  return rgb;
}

describe('painted ground: flatten', () => {
  it('removes baked corner shading but keeps brush detail', () => {
    const src = synthetic();
    const before = lowFrequencyRange(src, W, W, 24);
    const flat = flattenLowFrequency(src, W, W, { radius: 12 });
    const after = lowFrequencyRange(flat, W, W, 24);
    expect(before).toBeGreaterThan(1.4);
    expect(after).toBeLessThan(1.16);
    expect(after - 1).toBeLessThan((before - 1) * 0.3);
    // detail survives: the per-pixel spread stays well above zero
    let sd = 0;
    let m = 0;
    for (let i = 0; i < flat.length; i += 3) m += flat[i];
    m /= flat.length / 3;
    for (let i = 0; i < flat.length; i += 3) sd += (flat[i] - m) ** 2;
    expect(Math.sqrt(sd / (flat.length / 3))).toBeGreaterThan(0.03);
  });
});

describe('painted ground: tiling', () => {
  it('keeps each axis mask 0 on its borders and 1 on the shifted copy seam', () => {
    const mx = tileMask(W, W, 0.24, 0.8, 'x');
    const my = tileMask(W, W, 0.24, 0.8, 'y');
    for (let k = 0; k < W; k++) {
      // borders: the shifted copy alone, wrap-continuous
      expect(mx[k * W]).toBeLessThan(0.02);
      expect(mx[k * W + W - 1]).toBeLessThan(0.02);
      expect(my[k]).toBeLessThan(0.02);
      expect(my[(W - 1) * W + k]).toBeLessThan(0.02);
      // the shifted copy's own seam (the middle line) is never shown
      expect(mx[k * W + W / 2]).toBe(1);
      expect(my[(W / 2) * W + k]).toBe(1);
    }
  });

  it('turns a raw image into one whose wrap border reads like its interior', () => {
    const flat = flattenLowFrequency(synthetic(), W, W, { radius: 12 });
    const raw = seamRatio(synthetic(), W, W);
    const tiled = makeTileable(flat, W, W);
    expect(raw).toBeGreaterThan(2);
    expect(seamRatio(tiled, W, W)).toBeLessThan(1.35);
    // and no new seam opens inside: the steps across the middle row and
    // column (where the shifted copies keep their own seams) stay ordinary
    const mid = new Float32Array(W * W * 3);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++)
        for (let c = 0; c < 3; c++)
          mid[(y * W + x) * 3 + c] = tiled[(((y + W / 2) % W) * W + ((x + W / 2) % W)) * 3 + c];
    expect(seamRatio(mid, W, W)).toBeLessThan(1.35);
  });

  it('preserves the source contrast through the blend band', () => {
    const flat = flattenLowFrequency(synthetic(), W, W, { radius: 12 });
    const tiled = makeTileable(flat, W, W);
    const sd = (img: Float32Array) => {
      let m = 0;
      for (let i = 0; i < img.length; i++) m += img[i];
      m /= img.length;
      let v = 0;
      for (let i = 0; i < img.length; i++) v += (img[i] - m) ** 2;
      return Math.sqrt(v / img.length);
    };
    expect(sd(tiled) / sd(flat)).toBeGreaterThan(0.85);
  });
});

describe('painted ground: derived maps', () => {
  it('writes an OpenGL normal map: flat ground faces +Z, a rise to the right tilts -X', () => {
    const flat = new Float32Array(16 * 16).fill(0.5);
    const n = normalFromHeight(flat, 16, 16, 6);
    expect([n[0], n[1], n[2]]).toEqual([128, 128, 255]);
    const ramp = new Float32Array(16 * 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) ramp[y * 16 + x] = 0.3 + x * 0.02;
    const r = normalFromHeight(ramp, 16, 16, 6);
    const mid = (8 * 16 + 8) * 3;
    expect(r[mid]).toBeLessThan(128);
    expect(r[mid + 1]).toBe(128);
    // a rise toward the image TOP (lower row index) tilts +V (green up)
    const up = new Float32Array(16 * 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) up[y * 16 + x] = 0.6 - y * 0.02;
    expect(normalFromHeight(up, 16, 16, 6)[mid + 1]).toBeLessThan(128);
  });

  it('keeps the painted surfaces matte and the AO a gentle cavity term', () => {
    const tiled = makeTileable(flattenLowFrequency(synthetic(), W, W, { radius: 12 }), W, W);
    const h = heightFromColor(tiled, W, W, { highPass: 16 });
    const rough = roughnessFromHeight(h);
    const ao = aoFromHeight(h, W, W);
    expect(Math.min(...rough)).toBeGreaterThanOrEqual(Math.round(0.82 * 255) - 1);
    expect(Math.min(...ao)).toBeGreaterThanOrEqual(Math.round(0.55 * 255));
    expect(Math.max(...ao)).toBe(255);
  });

  it('grades chroma toward grey without moving luminance', () => {
    const px = new Float32Array([0.8, 0.5, 0.2]);
    const g = gradeColor(px, { saturation: 0.5 });
    const l = (c: Float32Array) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(l(g)).toBeCloseTo(l(px), 5);
    expect(g[0] - g[2]).toBeCloseTo((px[0] - px[2]) * 0.5, 5);
    expect(Array.from(gradeColor(px))).toEqual(Array.from(px));
  });

  it('is deterministic end to end', () => {
    const a = paintedGroundMaps(synthetic(), W, W, { flattenRadius: 12, heightHighPass: 16 });
    const b = paintedGroundMaps(synthetic(), W, W, { flattenRadius: 12, heightHighPass: 16 });
    expect(Buffer.from(a.color.buffer).equals(Buffer.from(b.color.buffer))).toBe(true);
    expect(Buffer.from(a.normal).equals(Buffer.from(b.normal))).toBe(true);
    expect(Buffer.from(a.ao).equals(Buffer.from(b.ao))).toBe(true);
  });
});
