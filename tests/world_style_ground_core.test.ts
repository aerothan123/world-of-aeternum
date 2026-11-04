// World Style Refined painted ground (src/render/world_style_ground_core.ts):
// which painted set each surface role draws, which file every packed layer
// loads per style (Classic untouched), the painted-term weights, and the
// shader arm generated from them (world_style_glsl.ts).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { terrainTexturePath, terrainTextureSet } from '../src/render/terrain_texture_sets';
import { REFINED_ALBEDO_LAYER_FILES, refinedTerrainProfile } from '../src/render/world_style_core';
import { refinedSplatGlsl } from '../src/render/world_style_glsl';
import {
  isPaintedGroundFile,
  PAINTED_GROUND_SETS,
  REFINED_BASE_LAYER_ROLES,
  REFINED_EXTRA_LAYER_FILES,
  REFINED_LAYER_COBBLE,
  REFINED_LAYER_FOREST,
  REFINED_LAYER_MOSS,
  refinedGroundWeights,
  refinedMeadowTexel,
  splatLayerFile,
} from '../src/render/world_style_ground_core';

const ROOT = path.resolve(__dirname, '..');

const base = {
  grass: 1,
  rock: 0,
  tintLuma: 0.36,
  normalY: 1,
  marsh: 0,
  heightAboveWater: 10,
  variantNoise: 0.5,
  snow: 0,
};

describe('painted ground roster', () => {
  it('maps every surface role to a shipped painted set with all four maps', () => {
    expect(Object.keys(PAINTED_GROUND_SETS).sort()).toEqual(
      ['beach', 'cliff', 'dryGrass', 'forest', 'meadow', 'path', 'paving', 'wet'].sort(),
    );
    for (const key of Object.values(PAINTED_GROUND_SETS)) {
      expect(terrainTextureSet(key), key).not.toBeNull();
      for (const map of ['color', 'normal', 'rough', 'ao'] as const) {
        const rel = terrainTexturePath(key, map);
        expect(rel, `${key} ${map}`).not.toBeNull();
        expect(existsSync(path.join(ROOT, 'public', rel as string)), rel as string).toBe(true);
      }
    }
  });

  it('leaves every Classic layer file exactly as shipped', () => {
    for (const [key, file] of [
      ['grassC', 'Grass001_Color.jpg'],
      ['dirtC', 'Ground023_Color.jpg'],
      ['rockC', 'Rock026_Color.jpg'],
      ['sandC', 'Ground080_Color.jpg'],
      ['mudC', 'Ground071_Color.jpg'],
      ['snowC', 'Snow010A_Color.jpg'],
    ]) {
      expect(splatLayerFile(key, file, 'classic')).toBe(file);
    }
  });

  it('paints meadow, path, cliff and beach into the Classic slots under Refined', () => {
    expect(splatLayerFile('grassC', 'Grass001_Color.jpg', 'refined')).toBe(
      'PaintedMeadow_Color.jpg',
    );
    expect(splatLayerFile('dirtC', 'Ground023_Color.jpg', 'refined')).toBe('PaintedDirt_Color.jpg');
    expect(splatLayerFile('rockC', 'Rock026_Color.jpg', 'refined')).toBe('PaintedCliff_Color.jpg');
    expect(splatLayerFile('sandC', 'Ground080_Color.jpg', 'refined')).toBe('PaintedSand_Color.jpg');
    // the marsh mud and the snow keep their photos
    expect(splatLayerFile('mudC', 'Ground071_Color.jpg', 'refined')).toBe('Ground071_Color.jpg');
    expect(splatLayerFile('snowC', 'Snow010A_Color.jpg', 'refined')).toBe('Snow010A_Color.jpg');
    expect(Object.keys(REFINED_BASE_LAYER_ROLES).sort()).toEqual([
      'dirtC',
      'dirtN',
      'grassC',
      'grassN',
      'rockC',
      'rockN',
      'sandC',
      'sandN',
    ]);
    // the detail normals take the painted sets' own NormalGL maps, as plain JPGs
    expect(splatLayerFile('rockN', 'Rock026_NormalGL.jpg', 'refined')).toBe(
      'PaintedCliff_NormalGL.jpg',
    );
    expect(splatLayerFile('rockN', 'Rock026_NormalGL.jpg', 'classic')).toBe('Rock026_NormalGL.jpg');
    expect(isPaintedGroundFile('PaintedCliff_NormalGL.jpg')).toBe(true);
    expect(isPaintedGroundFile('Rock026_NormalGL.jpg')).toBe(false);
  });

  it('appends the painted-only layers after the two older Refined layers', () => {
    expect(REFINED_ALBEDO_LAYER_FILES).toBe(REFINED_EXTRA_LAYER_FILES);
    const keys = Object.keys(REFINED_EXTRA_LAYER_FILES);
    expect(keys).toEqual(['grassVariantC', 'gravelC', 'forestC', 'cobbleC', 'mossC']);
    expect(6 + keys.indexOf('forestC')).toBe(REFINED_LAYER_FOREST);
    expect(6 + keys.indexOf('cobbleC')).toBe(REFINED_LAYER_COBBLE);
    expect(6 + keys.indexOf('mossC')).toBe(REFINED_LAYER_MOSS);
    for (const file of Object.values(REFINED_EXTRA_LAYER_FILES)) {
      expect(existsSync(path.join(ROOT, 'public/textures/terrain', file)), file).toBe(true);
    }
  });
});

describe('painted ground weights', () => {
  it('lays forest floor on dark woodland turf, never on a bright meadow', () => {
    expect(refinedGroundWeights({ ...base, tintLuma: 0.36 }).forest).toBe(0);
    const wood = refinedGroundWeights({ ...base, tintLuma: 0.08 }).forest;
    expect(wood).toBeGreaterThan(0.5);
    // the patch noise thins it but never removes it
    expect(
      refinedGroundWeights({ ...base, tintLuma: 0.08, variantNoise: 0 }).forest,
    ).toBeGreaterThan(0.3);
  });

  it('paves flat rock (town roads) and leaves cliff faces to the slab rock', () => {
    expect(refinedGroundWeights({ ...base, grass: 0, rock: 1, normalY: 1 }).paving).toBeGreaterThan(
      0.85,
    );
    expect(refinedGroundWeights({ ...base, grass: 0, rock: 1, normalY: 0.7 }).paving).toBe(0);
  });

  it('grows moss in the marsh and on the shore band, on the low end of the noise only', () => {
    const marsh = refinedGroundWeights({ ...base, marsh: 1, variantNoise: 0.1 }).moss;
    expect(marsh).toBeGreaterThan(0.6);
    expect(refinedGroundWeights({ ...base, marsh: 1, variantNoise: 0.9 }).moss).toBe(0);
    expect(
      refinedGroundWeights({ ...base, heightAboveWater: 0.2, variantNoise: 0.1 }).moss,
    ).toBeGreaterThan(0.4);
    expect(refinedGroundWeights({ ...base, variantNoise: 0.1 }).moss).toBe(0);
  });

  it('keeps every painted term off snowfields', () => {
    const w = refinedGroundWeights({
      ...base,
      tintLuma: 0.05,
      marsh: 1,
      rock: 1,
      variantNoise: 0,
      snow: 1,
    });
    expect(w).toEqual({ forest: 0, paving: 0, moss: 0 });
  });

  it('keeps the painted meadow on the biome tone (its mean is the tone)', () => {
    const tone: [number, number, number] = [0.05, 0.12, 0.02];
    const mean: [number, number, number] = [0.3, 0.33, 0.06];
    expect(refinedMeadowTexel(mean, mean, tone)).toEqual(tone);
    // a brighter, yellower tuft lifts the tone mostly by value, a little by hue
    const tuft = refinedMeadowTexel([0.4, 0.4, 0.06], mean, tone);
    const lr =
      (0.2126 * 0.4 + 0.7152 * 0.4 + 0.0722 * 0.06) /
      (0.2126 * 0.3 + 0.7152 * 0.33 + 0.0722 * 0.06);
    expect(tuft[1] / tone[1]).toBeCloseTo(lr + (0.4 / 0.33 - lr) * 0.45, 5);
    expect(tuft[0] / tone[0]).toBeLessThanOrEqual(1.6); // clamped
    expect(Math.abs(tuft[0] / tone[0] - tuft[1] / tone[1])).toBeLessThan(0.15);
  });
});

describe('painted ground shader arm', () => {
  const p = refinedTerrainProfile('high');
  it('samples the painted-only layers and gates every term on its weight', () => {
    const src = refinedSplatGlsl(p);
    expect(src).toContain(`${REFINED_LAYER_FOREST}.0`);
    expect(src).toContain(`${REFINED_LAYER_COBBLE}.0`);
    expect(src).toContain(`${REFINED_LAYER_MOSS}.0`);
    for (const w of ['wocWsFoW > 0.002', 'wocWsMoW > 0.002', 'wocWsPvW > 0.002'])
      expect(src).toContain(w);
    // no painted meadow replacement on the photo arm (the photo IS the meadow)
    expect(src).not.toContain('wocWsMeadow');
  });

  it('replaces exactly the baked grass share on the bake arm', () => {
    const src = refinedSplatGlsl(p, { bakedGrassTerm: 'grassAlb * vtint * 0.4720' });
    expect(src).toContain('alb += wocHW.x * (wocWsMeadow - (grassAlb * vtint * 0.4720))');
    expect(src).toContain('uWsMeadowMean');
    expect(src).toContain('uWsGrassTone * vtint');
    // one painted read on the meadow, luminance-only dune ripples
    expect(src.match(/WOC_L_GRASS\)/g)?.length).toBe(1);
  });

  it('keeps the beach on the palette hue (luminance-only ripples)', () => {
    const src = refinedSplatGlsl(p);
    expect(src).toMatch(/float wocWsSr = clamp\(dot\(WOC_ALB/);
  });
});
