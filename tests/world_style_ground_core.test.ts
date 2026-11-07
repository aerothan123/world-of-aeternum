// World Style Refined painted ground (src/render/world_style_ground_core.ts):
// which painted set each surface role draws, which file every packed layer
// loads per style (Classic untouched), the painted-term weights, and the
// shader arm generated from them (world_style_glsl.ts).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { terrainTexturePath, terrainTextureSet } from '../src/render/terrain_texture_sets';
import { REFINED_ALBEDO_LAYER_FILES, refinedTerrainProfile } from '../src/render/world_style_core';
import {
  CLASSIC_CLIFF_AXIS,
  CLASSIC_CLIFF_CHALK,
  CLASSIC_CLIFF_WALL,
  CLASSIC_MUD_TAP,
  CLASSIC_SNOW_TAP,
  patchRefinedCliffGlsl,
  patchRefinedDetailGlsl,
  refinedSplatGlsl,
} from '../src/render/world_style_glsl';
import {
  isPaintedGroundFile,
  PAINTED_GROUND_SETS,
  REFINED_BASE_LAYER_ROLES,
  REFINED_CLIFF,
  REFINED_DETAIL,
  REFINED_EXTRA_LAYER_FILES,
  REFINED_GROUND,
  REFINED_LAYER_COBBLE,
  REFINED_LAYER_FOREST,
  REFINED_LAYER_MOSS,
  refinedCliffAxisWeight,
  refinedCliffWallWeight,
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
      [
        'beach',
        'cliff',
        'dryGrass',
        'forest',
        'meadow',
        'mud',
        'path',
        'paving',
        'snow',
        'wet',
      ].sort(),
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
    // the marsh mud and the snow paint their colour (they have no detail
    // normal layer), on the built-in snow and an authored map's snow alike
    expect(splatLayerFile('mudC', 'Ground071_Color.jpg', 'refined')).toBe('PaintedMud_Color.jpg');
    expect(splatLayerFile('snowC', 'Snow010A_Color.jpg', 'refined')).toBe('PaintedSnow_Color.jpg');
    expect(splatLayerFile('snowC', 'Snow004_Color.jpg', 'refined')).toBe('PaintedSnow_Color.jpg');
    expect(splatLayerFile('snowC', 'Snow004_Color.jpg', 'classic')).toBe('Snow004_Color.jpg');
    expect(Object.keys(REFINED_BASE_LAYER_ROLES).sort()).toEqual([
      'dirtC',
      'dirtN',
      'grassC',
      'grassN',
      'mudC',
      'rockC',
      'rockN',
      'sandC',
      'sandN',
      'snowC',
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
    expect(w).toEqual({ forest: 0, paving: 0, moss: 0, shoreSand: 0 });
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

describe('refined cliffs', () => {
  it('narrows the wall-plane crossfade so a diagonal face shows one plane', () => {
    expect(refinedCliffAxisWeight(0)).toBe(0);
    expect(refinedCliffAxisWeight(REFINED_CLIFF.axisLo)).toBe(0);
    expect(refinedCliffAxisWeight(0.5)).toBeCloseTo(0.5, 6);
    expect(refinedCliffAxisWeight(REFINED_CLIFF.axisHi)).toBe(1);
    // a near-axis face reads from one plane only (Classic would mix 25/75)
    expect(refinedCliffAxisWeight(0.25)).toBe(0);
    expect(refinedCliffAxisWeight(0.75)).toBe(1);
    expect(REFINED_CLIFF.chalk).toBeLessThan(0.38);
    expect(REFINED_CLIFF.turfTint).toBeGreaterThan(0);
    expect(REFINED_CLIFF.turfTint).toBeLessThan(1);
  });

  it('starts the wall projection before a face is steep enough to stretch', () => {
    expect(refinedCliffWallWeight(1)).toBe(0);
    expect(refinedCliffWallWeight(REFINED_CLIFF.wallFlat)).toBe(0);
    expect(refinedCliffWallWeight(REFINED_CLIFF.wallFull)).toBe(1);
    expect(refinedCliffWallWeight(0)).toBe(1);
    // a 60 degree face (normal y 0.5) is fully wall-projected; Classic gave it 0.275
    expect(refinedCliffWallWeight(0.5)).toBe(1);
    expect(Math.min(1, Math.max(0, 1 - 0.5 * 1.45))).toBeCloseTo(0.275, 6);
  });

  it('patches the three Classic cliff lines the shipped splat shader carries', () => {
    const terrain = readFileSync(path.join(ROOT, 'src/render/terrain.ts'), 'utf8');
    // both tiers' wall rock (rich and simple splat) carry the chalk soften
    expect(terrain.split(CLASSIC_CLIFF_WALL).length - 1).toBe(1);
    expect(terrain.split(CLASSIC_CLIFF_AXIS).length - 1).toBe(1);
    expect(terrain.split(CLASSIC_CLIFF_CHALK).length - 1).toBe(2);
    const frag = `w\n${CLASSIC_CLIFF_WALL}\nx\n${CLASSIC_CLIFF_AXIS}\ny\n${CLASSIC_CLIFF_CHALK}\nz`;
    const out = patchRefinedCliffGlsl(frag);
    expect(out).not.toContain(CLASSIC_CLIFF_WALL);
    expect(out).not.toContain(CLASSIC_CLIFF_AXIS);
    expect(out).not.toContain(CLASSIC_CLIFF_CHALK);
    expect(out).toContain('float wallW = 1.0 - smoothstep(0.55000, 0.85000, an.y);');
    expect(out).toContain(
      'float axisW = smoothstep(0.30000, 0.70000, an.x / max(1e-4, an.x + an.z));',
    );
    expect(out).toContain('rockAlb = mix(rockAlb, vec3(0.68, 0.70, 0.67), 0.12000);');
    expect(() => patchRefinedCliffGlsl('no cliff here')).toThrow(/cliff wall anchor missing/);
  });

  it('keeps only part of the turf tint on a steep face', () => {
    const src = refinedSplatGlsl(refinedTerrainProfile('high'));
    expect(src).toContain('rockAlb * mix(vec3(1.0), wocWsTint, 0.30000)');
  });
});

describe('refined shore stone and ground detail', () => {
  const flatRock = { ...base, grass: 0, rock: 1, normalY: 1 };
  it('turns flat rock just above the waterline to sand, not cobbles', () => {
    const shore = refinedGroundWeights({ ...flatRock, heightAboveWater: 0.3 });
    expect(shore.paving).toBe(0);
    expect(shore.shoreSand).toBeCloseTo(REFINED_GROUND.shoreSandMax, 6);
    const town = refinedGroundWeights({ ...flatRock, heightAboveWater: 10 });
    expect(town.shoreSand).toBe(0);
    expect(town.paving).toBeCloseTo(REFINED_GROUND.pavingMax, 6);
    // a cliff is never flat: no shore sand on a wall at the waterline
    const wall = refinedGroundWeights({ ...flatRock, normalY: 0.3, heightAboveWater: 0.3 });
    expect(wall.shoreSand).toBe(0);
  });

  it('carries the shore fade and the sand tone in the shader', () => {
    const src = refinedSplatGlsl(refinedTerrainProfile('high'));
    expect(src).toContain('float wocWsPvShore = 1.0 - smoothstep(');
    expect(src).toContain('* (1.0 - wocWsPvShore)');
    expect(src).toContain('uWsSandMean * mix(vec3(1.0), wocWsTint, 0.3)');
    expect(src).toContain(`wallW * ${REFINED_CLIFF.neutral.toFixed(5)}`);
  });

  it('doubles the mud and snow taps once each, Classic anchors present', () => {
    const terrain = readFileSync(path.join(ROOT, 'src/render/terrain.ts'), 'utf8');
    expect(terrain.split(CLASSIC_MUD_TAP).length - 1).toBe(1);
    expect(terrain.split(CLASSIC_SNOW_TAP).length - 1).toBe(1);
    const out = patchRefinedDetailGlsl(`a\n${CLASSIC_MUD_TAP}\nb ${CLASSIC_SNOW_TAP} c`);
    expect(out).not.toContain(CLASSIC_MUD_TAP);
    expect(out.split('WOC_L_MUD').length - 1).toBe(2);
    expect(out.split('WOC_L_SNOW').length - 1).toBe(2);
    expect(out).toContain(`${REFINED_DETAIL.mudScale2.toFixed(5)}`);
    expect(() => patchRefinedDetailGlsl('none')).toThrow(/mud tap anchor missing/);
  });

  it('compresses the cliff crack highlights', () => {
    const out = patchRefinedCliffGlsl(
      `${CLASSIC_CLIFF_WALL}\n${CLASSIC_CLIFF_AXIS}\n${CLASSIC_CLIFF_CHALK}`,
    );
    expect(out).toContain(`min(rockAlb, vec3(${REFINED_CLIFF.highlightCap.toFixed(5)}))`);
  });
});
