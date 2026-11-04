// World Style pure core (src/render/world_style_core.ts): setting resolution,
// the Refined terrain blend weights, the per-time-of-day atmosphere curves and
// the fairness bounds every Refined consumer relies on.
import { describe, expect, it } from 'vitest';
import {
  blueHourAmount,
  goldenAmount,
  noonAmount,
  REFINED_AERIAL_CLEAR_YD,
  REFINED_AERIAL_MAX,
  REFINED_GRADE_MIN_SAT,
  REFINED_LAYER_GRASS_B,
  REFINED_LAYER_GRAVEL,
  refinedAerialAmount,
  refinedAtmosphere,
  refinedBlendWeights,
  refinedPalette,
  refinedTerrainProfile,
  refinedTerrainProfileKey,
  worldStyleFromSetting,
  worldStyleSettingValue,
  worldStyleShadowRadius,
} from '../src/render/world_style_core';

const flatMeadow = {
  grass: 1,
  dirt: 0,
  rock: 0,
  sand: 0,
  pathEdge: 0,
  normalY: 1,
  heightAboveWater: 20,
  variantNoise: 0.5,
  gravelNoise: 0.5,
};

describe('world style setting resolution', () => {
  it('defaults to Refined for anyone who never set it', () => {
    expect(worldStyleFromSetting(undefined)).toBe('refined');
    expect(worldStyleFromSetting(Number.NaN)).toBe('refined');
  });
  it('reads the stored value', () => {
    expect(worldStyleFromSetting(0)).toBe('classic');
    expect(worldStyleFromSetting(1)).toBe('refined');
    expect(worldStyleSettingValue('classic')).toBe(0);
    expect(worldStyleSettingValue('refined')).toBe(1);
  });
  it('lets a URL pin win over the stored value', () => {
    expect(worldStyleFromSetting(1, '?gfx=high&worldstyle=classic')).toBe('classic');
    expect(worldStyleFromSetting(0, '?worldstyle=Refined')).toBe('refined');
    expect(worldStyleFromSetting(0, '?worldstyle=bogus')).toBe('classic');
  });
});

describe('Refined terrain profile per tier', () => {
  it('keeps the medium splat on reused noise (no extra macro taps)', () => {
    const m = refinedTerrainProfile('medium');
    expect(m.noiseTaps).toBe(false);
    expect(m.shoreMud).toBe(false);
    expect(m.aerialHeight).toBe(false);
    const h = refinedTerrainProfile('high');
    expect(h.noiseTaps && h.shoreMud && h.aerialHeight).toBe(true);
    expect(refinedTerrainProfileKey(m)).not.toBe(refinedTerrainProfileKey(h));
  });
  it('appends its layers after the Classic six', () => {
    expect(REFINED_LAYER_GRASS_B).toBe(6);
    expect(REFINED_LAYER_GRAVEL).toBe(7);
  });
});

describe('Refined terrain blend weights', () => {
  it('breaks a meadow into two grass variants by noise', () => {
    const a = refinedBlendWeights({ ...flatMeadow, variantNoise: 0.2 });
    const b = refinedBlendWeights({ ...flatMeadow, variantNoise: 0.9 });
    expect(a.grassVariant).toBe(0);
    expect(b.grassVariant).toBeGreaterThan(0.5);
    expect(b.grassVariant).toBeLessThan(0.7);
  });
  it('puts gravel on path shoulders more than in the trail core', () => {
    const path = { ...flatMeadow, grass: 0, dirt: 1 };
    const edge = refinedBlendWeights({ ...path, pathEdge: 1 });
    const core = refinedBlendWeights({ ...path, pathEdge: 0 });
    expect(edge.gravel).toBeGreaterThan(core.gravel * 3);
    expect(edge.gravel).toBeLessThanOrEqual(0.8);
    expect(refinedBlendWeights(flatMeadow).gravel).toBe(0);
  });
  it('turns steep turf to rock and leaves flat turf alone', () => {
    expect(refinedBlendWeights(flatMeadow).steepRock).toBe(0);
    const cliff = refinedBlendWeights({ ...flatMeadow, normalY: 0.4 });
    expect(cliff.steepRock).toBeCloseTo(0.7, 5);
    const bank = refinedBlendWeights({ ...flatMeadow, normalY: 0.62 });
    expect(bank.steepRock).toBeGreaterThan(0);
    expect(bank.steepRock).toBeLessThan(cliff.steepRock);
  });
  it('wets the ground only just above the waterline', () => {
    expect(refinedBlendWeights(flatMeadow).shoreMud).toBe(0);
    const shore = refinedBlendWeights({ ...flatMeadow, heightAboveWater: 0.2 });
    expect(shore.shoreMud).toBeCloseTo(0.55, 5);
    const mid = refinedBlendWeights({ ...flatMeadow, heightAboveWater: 1.4 });
    expect(mid.shoreMud).toBeGreaterThan(0);
    expect(mid.shoreMud).toBeLessThan(shore.shoreMud);
  });
  it('never touches sand or rock layers themselves', () => {
    const beach = refinedBlendWeights({ ...flatMeadow, grass: 0, sand: 1, normalY: 0.3 });
    expect(beach).toEqual({ grassVariant: 0, gravel: 0, steepRock: 0, shoreMud: 0 });
  });
});

describe('Refined atmosphere curves by time of day', () => {
  const noon = refinedAtmosphere(0.66, 0);
  const golden = refinedAtmosphere(0.1, 0.2);
  const blue = refinedAtmosphere(-0.07, 0.6);
  const night = refinedAtmosphere(-0.6, 1);

  it('separates the phases', () => {
    expect(noonAmount(0.66)).toBe(1);
    expect(goldenAmount(0.66)).toBe(0);
    expect(goldenAmount(0.1)).toBeGreaterThan(0.9);
    expect(blueHourAmount(-0.07)).toBeGreaterThan(0.9);
    expect(blueHourAmount(0.3)).toBe(0);
  });
  it('is neutral at noon, golden in the morning and evening, cool blue at dusk', () => {
    expect(noon.gradeGain[0]).toBeCloseTo(1, 2);
    expect(Math.abs(noon.gradeGain[0] - noon.gradeGain[2])).toBeLessThan(0.03);
    expect(golden.gradeGain[0]).toBeGreaterThan(golden.gradeGain[2] + 0.08);
    expect(golden.sunTint[0]).toBeGreaterThan(golden.sunTint[2]);
    expect(golden.skyHorizon[0]).toBeGreaterThan(golden.skyHorizon[2]);
    expect(blue.gradeGain[2]).toBeGreaterThan(blue.gradeGain[0] + 0.06);
    expect(blue.aerialColor[2]).toBeGreaterThan(blue.aerialColor[0]);
    expect(noon.aerialColor[2]).toBeGreaterThan(noon.aerialColor[0]);
  });
  it('keeps every curve inside its fairness bounds at every phase', () => {
    for (let e = -1; e <= 1; e += 0.02) {
      for (const n of [0, 0.3, 0.6, 1]) {
        const a = refinedAtmosphere(e, n);
        expect(a.exposure).toBeGreaterThanOrEqual(1);
        expect(a.gradeSaturation).toBeGreaterThanOrEqual(REFINED_GRADE_MIN_SAT);
        expect(a.aerialStrength).toBeLessThanOrEqual(REFINED_AERIAL_MAX);
        expect(a.lightScaleMul).toBeGreaterThanOrEqual(1);
        expect(a.ambientScaleMul).toBeGreaterThanOrEqual(0.94);
        for (const c of a.gradeGain) expect(c).toBeGreaterThan(0.85);
      }
    }
  });
  it('darkens the sky and clouds at night', () => {
    expect(night.skyZenith[2]).toBeLessThan(noon.skyZenith[2] * 0.2);
    expect(night.cloudLit[0]).toBeLessThan(0.2);
    expect(night.sunGlow).toEqual([0, 0, 0]);
  });
});

describe('Refined aerial perspective', () => {
  it('is exactly zero inside the clear radius, where every ground read lives', () => {
    for (let d = 0; d <= REFINED_AERIAL_CLEAR_YD; d += 5) {
      expect(refinedAerialAmount(d, 0, 0.55, true)).toBe(0);
    }
  });
  it('rises with distance, thickens low down and stays capped', () => {
    const near = refinedAerialAmount(120, 10, 0.46, true);
    const far = refinedAerialAmount(600, 10, 0.46, true);
    expect(far).toBeGreaterThan(near);
    expect(refinedAerialAmount(600, 0, 0.46, true)).toBeGreaterThan(
      refinedAerialAmount(600, 80, 0.46, true),
    );
    expect(refinedAerialAmount(1e6, 0, 5, true)).toBeLessThanOrEqual(REFINED_AERIAL_MAX);
  });
});

describe('Refined palette and shadows', () => {
  it('warms and slightly desaturates the ground', () => {
    const [r, g, b] = refinedPalette([0.3, 0.45, 0.2]);
    expect(r / g).toBeGreaterThan(0.3 / 0.45);
    expect(r / b).toBeGreaterThan(0.3 / 0.2);
    const spread = (c: number[]) => Math.max(...c) - Math.min(...c);
    expect(spread([r, g, b])).toBeLessThan(spread([0.3, 0.45, 0.2]));
  });
  it('widens the PCF penumbra only under Refined', () => {
    expect(worldStyleShadowRadius('classic', 2.25)).toBe(2.25);
    expect(worldStyleShadowRadius('refined', 2.25)).toBeGreaterThan(2.25);
    expect(worldStyleShadowRadius('refined', 2.25)).toBeLessThan(4);
  });
});
