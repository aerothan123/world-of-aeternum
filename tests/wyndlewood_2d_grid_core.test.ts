import { describe, expect, it } from 'vitest';
import {
  cellRects,
  findRules,
  profile,
  refineRect,
} from '../scripts/assets/wyndlewood_2d/grid_core.mjs';
import { alphaStats, keyAlpha, ringMedian } from '../scripts/assets/wyndlewood_2d/key_core.mjs';
import { planSheets, sheetPrompt } from '../scripts/assets/wyndlewood_2d/plan_core.mjs';

// A synthetic 4x4 sheet: mid-grey cells split by 6px black rules placed off the even split.
function sheet(size: number, rules: number[]) {
  const g = new Uint8Array(size * size).fill(150);
  for (const r of rules) {
    for (let d = -3; d < 3; d++) {
      const p = Math.min(size - 1, Math.max(0, r + d));
      for (let i = 0; i < size; i++) {
        g[i * size + p] = 0;
        g[p * size + i] = 0;
      }
    }
  }
  return g;
}

describe('wyndlewood 2d grid core', () => {
  it('finds interior rules near, not exactly on, the even split', () => {
    const size = 400;
    const g = sheet(size, [104, 196, 306]);
    const xr = findRules(profile(g, size, size, 'x'), 4);
    expect(xr[0]).toBe(0);
    expect(xr[4]).toBe(size - 1);
    expect(Math.abs(xr[1] - 104)).toBeLessThanOrEqual(3);
    expect(Math.abs(xr[2] - 196)).toBeLessThanOrEqual(3);
    expect(Math.abs(xr[3] - 306)).toBeLessThanOrEqual(3);
  });

  it('cuts square, rule-free cells in row-major order', () => {
    const rects = cellRects([0, 100, 200], [0, 100, 200]);
    expect(rects).toHaveLength(4);
    for (const r of rects) expect(r.width).toBe(r.height);
    expect(rects[1].left).toBeGreaterThan(100);
    expect(rects[2].top).toBeGreaterThan(100);
  });

  it('pulls a cell edge in past an inner frame line', () => {
    const size = 200;
    const g = new Uint8Array(size * size).fill(160);
    for (let i = 0; i < size; i++) for (let d = 10; d < 14; d++) g[i * size + d] = 0;
    const r = refineRect(g, size, { left: 0, top: 0, width: size, height: size });
    expect(r.left).toBeGreaterThan(12);
  });

  it('keys the backdrop to transparent and keeps the subject', () => {
    const size = 64;
    const rgb = new Uint8Array(size * size * 3).fill(40);
    for (let y = 20; y < 44; y++) for (let x = 20; x < 44; x++) rgb.set([220, 180, 60], (y * size + x) * 3);
    expect(ringMedian(rgb, size)).toEqual([40, 40, 40]);
    const rgba = keyAlpha(rgb, size);
    expect(rgba[3]).toBe(0);
    const st = alphaStats(rgba, size, size);
    expect(st.bbox).toEqual({ left: 20, top: 20, width: 24, height: 24 });
    expect(st.coverage).toBeCloseTo((24 * 24) / (size * size), 5);
  });

  it('plans full sheets and pads a short final sheet without losing cells', () => {
    const recs = Array.from({ length: 18 }, (_, i) => ({
      family: 'items',
      group: 'armor',
      file: `public/ui/items/x${i}.webp`,
      id: `x${i}`,
      subject: `thing ${i}`,
    }));
    const sheets = planSheets(recs, { grid: 4 });
    expect(sheets).toHaveLength(2);
    expect(sheets[1].cells).toHaveLength(2);
    expect(sheets.flatMap((s) => s.cells).map((c) => c.id)).toEqual(recs.map((r) => r.id));
    expect(sheets[1].prompt).toContain('16)');
    expect(sheetPrompt('items', ['a rope'], 4)).not.toMatch(/\bicon\b/i);
  });
});
