// The WYNDLEWOOD held-model tier set (src/render/characters/wynd_weapon_models.ts): one
// generated base per weapon type, three tier looks repainted from it by
// scripts/assets/wynd_weapons. Pins the tier recolour rules (pure, tier_core.mjs), the
// registry wiring every tier rides (grip family, shield seat, authored surface, rim,
// preload), and the shape and budget each shipped file keeps.
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyTexel,
  inGripZone,
  inTrimZone,
  repaintTexel,
  rgbToHsv,
  WYND_TIERS,
  WYND_TYPES,
  wyndTierKey,
} from '../scripts/assets/wynd_weapons/tier_core.mjs';
import { KAYKIT_WEAPON_ACCESSORY, VARIANT_GRIPS } from '../src/render/characters/assets';
import { BACK_GRIP_FAMILIES } from '../src/render/characters/back_grips';
import {
  KAYKIT_SHIELD_ACCESSORIES,
  KAYKIT_SHIELD_GRIPS,
} from '../src/render/characters/held_item_grips';
import {
  isAuthoredHeldModelUrl,
  isRimlessHeldModelUrl,
  manifestUrls,
} from '../src/render/characters/manifest';
import { WEAPON_GRIP_OVERRIDES } from '../src/render/characters/weapon_grip';
import {
  WYND_MODEL_KEYS,
  WYND_RIMLESS_MODEL_KEYS,
  WYND_SHIELD_ACCESSORIES,
  WYND_WEAPON_ACCESSORY,
  WYND_WEAPON_BASES,
  WYND_WEAPON_TIERS,
  type WyndWeaponType,
  wyndModelKey,
} from '../src/render/characters/wynd_weapon_models';

const model = (key: string): string => `models/weapons/${key}.glb`;

interface GlbJson {
  meshes: {
    primitives: { attributes: Record<string, number>; indices?: number; material?: number }[];
  }[];
  materials: unknown[];
  textures?: unknown[];
  images?: { mimeType?: string }[];
  accessors: { count: number }[];
}

function readGlb(key: string): GlbJson {
  const buf = readFileSync(`public/${model(key)}`);
  expect(buf.readUInt32LE(0), `${key} magic`).toBe(0x46546c67);
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as GlbJson;
}

const TYPES = Object.keys(WYND_WEAPON_BASES) as WyndWeaponType[];

describe('wynd tier recolour rules', () => {
  it('names the same types and tiers as the runtime registry', () => {
    expect([...WYND_TIERS]).toEqual([...WYND_WEAPON_TIERS]);
    expect(Object.keys(WYND_TYPES).sort()).toEqual([...TYPES].sort());
    for (const type of TYPES) {
      for (const tier of WYND_WEAPON_TIERS) {
        expect(wyndTierKey(type, tier)).toBe(wyndModelKey(type, tier));
      }
    }
  });

  it('classifies a texel by its paint, and by its metalness where the model carries one', () => {
    expect(classifyTexel(8, 8, 8)).toBe('shadow');
    expect(classifyTexel(150, 150, 155)).toBe('metal');
    expect(classifyTexel(140, 90, 50)).toBe('warm');
    expect(classifyTexel(200, 160, 60)).toBe('brass');
    expect(classifyTexel(80, 140, 200)).toBe('accent');
    // grimy warm steel stays steel when the map says metal
    expect(classifyTexel(120, 95, 70, 0.9)).toBe('metal');
    // cream pages are not metal when the map says they are not
    expect(classifyTexel(225, 215, 195, 0.05)).toBe('pale');
  });

  it('gilds the fittings and dyes the wrap on the fine tier only', () => {
    const steel = [150, 150, 155];
    const hilt = { t: 0.25, r: 0.3, z: 1 };
    const blade = { t: 0.7, r: 0.1, z: 1 };
    const [hGold] = rgbToHsv(
      ...(repaintTexel('fine', 'sword', steel, hilt, 1) as [number, number, number]),
    );
    expect(hGold).toBeGreaterThan(30);
    expect(hGold).toBeLessThan(55);
    const [, sBlade] = rgbToHsv(
      ...(repaintTexel('fine', 'sword', steel, blade, 1) as [number, number, number]),
    );
    expect(sBlade).toBeLessThan(0.15);
    const [hMid, sMid] = rgbToHsv(
      ...(repaintTexel('mid', 'sword', steel, hilt, 1) as [number, number, number]),
    );
    expect(sMid < 0.15 || hMid > 180).toBe(true);
    const leather = [140, 90, 50];
    const grip = { t: 0.12, r: 0.2, z: 1 };
    const [hWrap] = rgbToHsv(
      ...(repaintTexel('fine', 'sword', leather, grip, 0) as [number, number, number]),
    );
    expect(hWrap > 340 || hWrap < 8).toBe(true);
  });

  it('weathers the starter tier: duller and paler than the mid tier', () => {
    const leather = [140, 90, 50];
    const [, sStart] = rgbToHsv(
      ...(repaintTexel('starter', 'axe2h', leather, { t: 0.4, r: 0.1, z: 1 }, 0) as [
        number,
        number,
        number,
      ]),
    );
    const [, sMid] = rgbToHsv(
      ...(repaintTexel('mid', 'axe2h', leather, { t: 0.4, r: 0.1, z: 1 }, 0) as [
        number,
        number,
        number,
      ]),
    );
    expect(sStart).toBeLessThan(sMid * 0.7);
  });

  it('is deterministic', () => {
    const a = repaintTexel('fine', 'mace', [120, 100, 90], { t: 0.8, r: 0.95, z: 1 }, 0.8);
    const b = repaintTexel('fine', 'mace', [120, 100, 90], { t: 0.8, r: 0.95, z: 1 }, 0.8);
    expect(a).toEqual(b);
  });

  it('keeps every type a trim zone and, where it has a wrap, a grip zone', () => {
    for (const type of TYPES) {
      const trimmed = [0.02, 0.25, 0.5, 0.75, 0.98].some((t) =>
        [0.1, 0.5, 0.95].some((r) => inTrimZone(type, t, r)),
      );
      expect(trimmed, type).toBe(true);
    }
    for (const type of TYPES.filter((t) => t !== 'shield')) {
      expect(
        [0.1, 0.3, 0.5, 0.7].some((t) => inGripZone(type, t)),
        type,
      ).toBe(true);
    }
  });
});

describe('wynd tier set wiring', () => {
  it('ships the three tier looks of every base', () => {
    expect(WYND_MODEL_KEYS.length).toBe(TYPES.length * WYND_WEAPON_TIERS.length);
    expect(new Set(WYND_MODEL_KEYS).size).toBe(WYND_MODEL_KEYS.length);
  });

  it('every weapon tier rides its base grip family, in the hand and on the back', () => {
    for (const [key, family] of Object.entries(WYND_WEAPON_ACCESSORY)) {
      expect(KAYKIT_WEAPON_ACCESSORY[key], key).toBe(family);
      expect(VARIANT_GRIPS[family], key).toBeDefined();
      expect(BACK_GRIP_FAMILIES.has(family), key).toBe(true);
    }
  });

  it('every shield tier takes a seat in both hands', () => {
    for (const [key, seat] of Object.entries(WYND_SHIELD_ACCESSORIES)) {
      expect((KAYKIT_SHIELD_ACCESSORIES as Record<string, string>)[key], key).toBe(seat);
      expect(KAYKIT_SHIELD_GRIPS[seat]?.r, key).toBeDefined();
      expect(KAYKIT_SHIELD_GRIPS[seat]?.l, key).toBeDefined();
    }
  });

  it('every tier is an authored surface, the flat plates draw rimless, and all preload', () => {
    const preload = new Set(manifestUrls());
    for (const key of WYND_MODEL_KEYS) {
      expect(isAuthoredHeldModelUrl(model(key)), key).toBe(true);
      expect(isRimlessHeldModelUrl(model(key)), key).toBe(WYND_RIMLESS_MODEL_KEYS.includes(key));
      expect(preload.has(model(key)), key).toBe(true);
    }
  });

  it('turns the head-up staff files back in the hand and gives the two-hand axe its length', () => {
    for (const tier of WYND_WEAPON_TIERS) {
      expect(WEAPON_GRIP_OVERRIDES[wyndModelKey('staff', tier)]?.rot).toEqual([180, 0, 0]);
      expect(WEAPON_GRIP_OVERRIDES[wyndModelKey('axe2h', tier)]?.scale).toBe(1.25);
      // both single-bit axes face the cut; the greatsword outgrows the arming sword
      expect(WEAPON_GRIP_OVERRIDES[wyndModelKey('axe2h', tier)]?.rot).toEqual([0, 180, 0]);
      expect(WEAPON_GRIP_OVERRIDES[wyndModelKey('axe1h', tier)]?.rot).toEqual([0, 180, 0]);
      expect(WEAPON_GRIP_OVERRIDES[wyndModelKey('greatsword', tier)]?.scale).toBeGreaterThan(1);
    }
  });

  it('every tier file is one material, one atlas set, inside the held-model budget', () => {
    let total = 0;
    for (const key of WYND_MODEL_KEYS) {
      const json = readGlb(key);
      expect(json.materials.length, `${key} materials`).toBe(1);
      for (const mesh of json.meshes) {
        for (const prim of mesh.primitives) expect(prim.material ?? 0, key).toBe(0);
      }
      expect(json.images?.length ?? 0, `${key} images`).toBeLessThanOrEqual(3);
      for (const img of json.images ?? []) expect(img.mimeType, key).toBe('image/webp');
      let tris = 0;
      for (const mesh of json.meshes) {
        for (const prim of mesh.primitives) {
          tris += (json.accessors[prim.indices ?? prim.attributes.POSITION].count ?? 0) / 3;
        }
      }
      expect(tris, `${key} tris`).toBeLessThanOrEqual(1500);
      const bytes = statSync(`public/${model(key)}`).size;
      expect(bytes, `${key} bytes`).toBeLessThan(150_000);
      total += bytes;
    }
    // the average look stays well under the per-file cap
    expect(total / WYND_MODEL_KEYS.length).toBeLessThan(125_000);
  });

  it('registers the tier resolver as a pure render core', () => {
    const arch = readFileSync('tests/architecture.test.ts', 'utf8');
    expect(arch).toContain("'src/render/characters/wynd_weapon_tier_core.ts'");
  });

  it('credits every base', () => {
    const credits = readFileSync('CREDITS.md', 'utf8');
    for (const type of TYPES) expect(credits, type).toContain(WYND_WEAPON_BASES[type].stem);
  });
});
