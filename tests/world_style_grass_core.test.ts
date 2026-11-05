// World Style Refined chunky painted grass (src/render/world_style_grass_core.ts):
// Classic keeps the shipped cluster and placement exactly; Refined draws
// fewer, wider ribbons (never more vertices), wider clump cores, and flower
// heads that gather in single-colour drifts.
import { describe, expect, it } from 'vitest';
import { clusterGeometry, mulberry32 } from '../src/render/blade_grass';
import {
  bladeClusterShape,
  CLASSIC_BLADE_SHAPE,
  PAINTED_BLADE_SHAPE,
  PAINTED_BLOOM,
  paintedBloomColor,
  paintedBloomFragGlsl,
  paintedBloomPatch,
  paintedBloomPick,
  paintedBloomVertGlsl,
  paintedClumpWidth,
  paintedClumpWidthMax,
  paintedGrassCoverageScale,
} from '../src/render/world_style_grass_core';

const bytes = (a: ArrayLike<number>) => Buffer.from(new Float32Array(a).buffer);

describe('painted cluster shape', () => {
  it('builds the shipped cluster byte for byte under Classic', () => {
    expect(bladeClusterShape('classic')).toBe(CLASSIC_BLADE_SHAPE);
    for (const seg of [2, 3] as const) {
      const shipped = clusterGeometry(mulberry32(42 ^ 0x6b1a), seg);
      const classic = clusterGeometry(mulberry32(42 ^ 0x6b1a), seg, bladeClusterShape('classic'));
      expect(
        bytes(classic.getAttribute('position').array).equals(
          bytes(shipped.getAttribute('position').array),
        ),
      ).toBe(true);
      expect(Array.from(classic.getIndex()?.array ?? [])).toEqual(
        Array.from(shipped.getIndex()?.array ?? []),
      );
    }
  });

  it('draws fewer, narrow pointed blades under Refined (never more vertices)', () => {
    const classic = clusterGeometry(mulberry32(7), 3);
    const painted = clusterGeometry(mulberry32(7), 3, bladeClusterShape('refined'));
    expect(painted.getAttribute('position').count).toBeLessThan(
      classic.getAttribute('position').count,
    );
    // a soft rounded tip: a narrow two-vertex end (never the old broad blunt
    // edge, never a needle point), still fewer vertices than Classic's 9 x 7
    expect(PAINTED_BLADE_SHAPE.tipWidth).toBeGreaterThan(0);
    expect(PAINTED_BLADE_SHAPE.tipWidth).toBeLessThan(0.25);
    expect(painted.getAttribute('position').count).toBe(PAINTED_BLADE_SHAPE.blades * 8);
    expect(PAINTED_BLADE_SHAPE.blades * 8).toBeLessThan(CLASSIC_BLADE_SHAPE.blades * 7);
    // the root ribbon width: vertices 0 and 1 of the first blade, a little
    // fuller than Classic's hair-fine blades but nowhere near a broad ribbon
    const rootWidth = (g: ReturnType<typeof clusterGeometry>) => {
      const p = g.getAttribute('position');
      return Math.hypot(p.getX(1) - p.getX(0), p.getZ(1) - p.getZ(0));
    };
    const ratio = rootWidth(painted) / rootWidth(classic);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.8);
  });

  it('places fewer clumps under Refined so the blade fill stays under Classic', () => {
    expect(paintedGrassCoverageScale('classic')).toBe(1);
    const area = (g: ReturnType<typeof clusterGeometry>) => {
      const p = g.getAttribute('position');
      const idx = g.getIndex()?.array ?? [];
      let a = 0;
      for (let i = 0; i < idx.length; i += 3) {
        const [A, B, C] = [idx[i], idx[i + 1], idx[i + 2]];
        const ux = p.getX(B) - p.getX(A);
        const uy = p.getY(B) - p.getY(A);
        const uz = p.getZ(B) - p.getZ(A);
        const vx = p.getX(C) - p.getX(A);
        const vy = p.getY(C) - p.getY(A);
        const vz = p.getZ(C) - p.getZ(A);
        a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      }
      return a;
    };
    const classic = area(clusterGeometry(mulberry32(11), 3));
    const painted = area(clusterGeometry(mulberry32(11), 3, bladeClusterShape('refined')));
    // the meadow's total blade area (clumps placed times area, at the widest
    // clump core) stays within 40 percent of Classic's either way
    const w = paintedClumpWidthMax('refined');
    const fill = (painted * w * w * paintedGrassCoverageScale('refined')) / classic;
    expect(fill).toBeLessThan(1.4);
    expect(fill).toBeGreaterThan(0.6);
  });

  it('widens clump cores only under Refined, and bounds the widening', () => {
    expect(paintedClumpWidth('classic', 3, 9)).toBe(1);
    expect(paintedClumpWidthMax('classic')).toBe(1);
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = 0; x < 40; x += 0.7)
      for (let z = 0; z < 40; z += 0.7) {
        const w = paintedClumpWidth('refined', x, z);
        lo = Math.min(lo, w);
        hi = Math.max(hi, w);
      }
    expect(lo).toBeGreaterThanOrEqual(1);
    expect(hi).toBeLessThanOrEqual(paintedClumpWidthMax('refined'));
    expect(hi - lo).toBeGreaterThan(0.1);
  });
});

describe('painted flower drifts', () => {
  it('blooms in drifts, not lone specks: only inside the high end of the patch field', () => {
    let blooming = 0;
    let n = 0;
    for (let x = 0; x < 120; x += 0.5)
      for (let z = 0; z < 120; z += 0.5) {
        n++;
        if (paintedBloomPatch(x, z) > PAINTED_BLOOM.patchCut) blooming++;
      }
    const share = blooming / n;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.3);
    expect(paintedBloomPick(PAINTED_BLOOM.patchCut - 0.01, 0, 0.5)).toBe(0);
    expect(paintedBloomPick(0.95, PAINTED_BLOOM.clumpShare + 0.01, 0.5)).toBe(0);
    expect(paintedBloomPick(0.95, 0.1, 0)).toBe(1);
    expect(paintedBloomPick(0.95, 0.1, 0.99)).toBe(PAINTED_BLOOM.colors.length);
  });

  it('paints a head only at the tips and keeps the wash gentle', () => {
    const c: [number, number, number] = [0.1, 0.2, 0.05];
    // the root: no head, just the shaded base of the value ramp
    const root = paintedBloomColor(c, 0.1, 2, 0.5);
    for (let k = 0; k < 3; k++) {
      expect(root[k] / c[k]).toBeLessThan(0.85);
      expect(root[k] / c[k]).toBeGreaterThan(PAINTED_BLOOM.rampRoot * 0.9);
    }
    const tip = paintedBloomColor(c, 0.85, 2, 0.5);
    expect(tip[0]).toBeGreaterThan(0.6); // buttercup head
    const none = paintedBloomColor(c, 0.9, 0, 1);
    expect(none[1] / c[1]).toBeCloseTo(PAINTED_BLOOM.washWarm[1] * PAINTED_BLOOM.rampTip, 5);
  });

  it('generates the shader arm from the same constants', () => {
    const v = paintedBloomVertGlsl('uv.y');
    expect(v).toContain('vWsBloom = vec4(clamp(uv.y, 0.0, 1.0)');
    expect(v).toContain(PAINTED_BLOOM.patchCut.toFixed(5));
    const f = paintedBloomFragGlsl();
    expect(f).toContain('vWsBloom.y > 0.5');
    expect(f).not.toMatch(/Math\.random|uTime/);
  });
});
