// World Style Refined water (src/render/ocean/water_style_core.ts): data only,
// Classic exact, every realm keeps its hue family and its clarity.
import { describe, expect, it } from 'vitest';
import { WATER_CHARACTERS } from '../src/render/ocean/water_character_core';
import {
  CLASSIC_OCEAN_LOOK,
  oceanLookFor,
  paintedWaterTone,
  REFINED_OCEAN_LOOK,
  REFINED_WATER,
  refinedWaterCharacter,
  styledWaterCharacter,
} from '../src/render/ocean/water_style_core';

const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const sat = (hex: number) => {
  const c = rgb(hex);
  return Math.max(...c) - Math.min(...c);
};

describe('refined water', () => {
  it('leaves Classic untouched: same character object, the shipped look', () => {
    const c = WATER_CHARACTERS.vale;
    expect(styledWaterCharacter(c, 'classic')).toBe(c);
    expect(oceanLookFor('classic')).toEqual([5.5, 0.07, 0.8, 1]);
    expect(oceanLookFor('classic')).toBe(CLASSIC_OCEAN_LOOK);
    expect(oceanLookFor('refined')).toBe(REFINED_OCEAN_LOOK);
  });

  it('softens the sun glitter and lifts the whitecaps under Refined', () => {
    expect(REFINED_OCEAN_LOOK[0]).toBeLessThan(CLASSIC_OCEAN_LOOK[0]);
    expect(REFINED_OCEAN_LOOK[2]).toBeLessThan(CLASSIC_OCEAN_LOOK[2]);
    expect(REFINED_OCEAN_LOOK[3]).toBeGreaterThan(CLASSIC_OCEAN_LOOK[3]);
  });

  it('eases a tone toward its anchor and keeps it in gamut', () => {
    expect(paintedWaterTone(0x2d8a86, 0x2d8a86, 0.5, 1)).toBe(0x2d8a86);
    expect(paintedWaterTone(0x000000, 0xffffff, 1, 1)).toBe(0xffffff);
    expect(paintedWaterTone(0xff0000, 0xff0000, 0, 0)).toBe(
      (54 << 16) | (54 << 8) | 54, // pure luma of red
    );
  });

  it('keeps every realm its clarity and hue family, a touch calmer and foamier', () => {
    for (const [biome, c] of Object.entries(WATER_CHARACTERS)) {
      const r = refinedWaterCharacter(c);
      expect(r.absorb, biome).toBe(c.absorb);
      expect(r.foam, biome).toBeCloseTo(c.foam * REFINED_WATER.foamGain, 9);
      expect(r.chop, biome).toBeCloseTo(c.chop * REFINED_WATER.chopGain, 9);
      // never more saturated than the shipped tone plus the anchor's pull
      expect(sat(r.shallow), biome).toBeLessThanOrEqual(
        Math.max(sat(c.shallow), sat(REFINED_WATER.shallowAnchor)),
      );
      // each channel moved at most the anchor share of the way (before desaturation)
      const [a, b] = [rgb(c.deep), rgb(r.deep)];
      for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k]), biome).toBeLessThan(80);
    }
    // the tea-dark fen stays darker than the open sea's shallows
    const lum = (hex: number) => rgb(hex).reduce((s, v) => s + v, 0);
    expect(lum(refinedWaterCharacter(WATER_CHARACTERS.fen).shallow)).toBeLessThan(
      lum(refinedWaterCharacter(WATER_CHARACTERS.vale).shallow),
    );
  });
});
