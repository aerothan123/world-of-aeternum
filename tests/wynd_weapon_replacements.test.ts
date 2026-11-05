// Rights pin for the retired inherited weapon models (src/render/characters/wynd_weapon_replacements.ts).
// The owner's rights decision retires every restricted inherited weapon model; each path keeps its
// name and now holds a byte copy of a WYNDLEWOOD tier look. This suite is the provenance guard the
// retired shape pins handed over to: every retired file is its tier look byte for byte, sits the
// way that look sits, and nothing else inherited and restricted is left in the weapons folder.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KAYKIT_WEAPON_ACCESSORY } from '../src/render/characters/assets';
import { KAYKIT_SHIELD_ACCESSORIES } from '../src/render/characters/held_item_grips';
import { WEAPON_GRIP_OVERRIDES } from '../src/render/characters/weapon_grip';
import {
  WYND_MODEL_KEYS,
  WYND_SHIELD_ACCESSORIES,
} from '../src/render/characters/wynd_weapon_models';
import {
  WYND_HERO_MODELS,
  WYND_REPLACED_MODELS,
  WYND_SEAT_DONORS,
} from '../src/render/characters/wynd_weapon_replacements';

const DIR = 'public/models/weapons';
const sha = (key: string): string =>
  createHash('sha256')
    .update(readFileSync(`${DIR}/${key}.glb`))
    .digest('hex');

/** KayKit CC0 kit files (CREDITS.md, KayKit rows): fine to ship. */
const KAYKIT_CC0 = [
  'axe_1handed',
  'axe_2handed',
  'axe_b',
  'crossbow_1handed',
  'crossbow_2handed',
  'dagger',
  'quiver',
  'shield_badge',
  'shield_round',
  'shield_square',
  'skeleton_axe',
  'skeleton_blade',
  'skeleton_crossbow',
  'skeleton_shield_large_a',
  'skeleton_staff',
  'spellbook_open',
  'staff',
  'staff_c',
  'sword_1handed',
  'sword_2handed',
  'sword_a',
  'wand',
];
/** Fork-made gathering tools (Wyndlewood originals): fine to ship. */
const GATHERING_TOOLS = [
  'arcanite_mining_pick',
  'ashwood_axe',
  'brasscap_hatchet',
  'bronze_hoe',
  'bronze_sickle',
  'clockreel_fishing_rod',
  'copper_mining_pick',
  'elderwood_axe',
  'evergarden_hoe',
  'felling_axe',
  'garden_hoe',
  'gathering_sickle',
  'goldleaf_sickle',
  'handaxe',
  'iron_mining_pick',
  'ironbark_axe',
  'ironreel_fishing_rod',
  'mithril_mining_pick',
  'notched_woodaxe',
  'osmium_hoe',
  'silverleaf_sickle',
  'silverstream_fishing_rod',
  'skysilver_hoe',
  'stormreel_fishing_rod',
  'sunpetal_sickle',
  'thorium_mining_pick',
  'tidewrought_fishing_rod',
  'whittler_s_knife',
];
/** Claudium prototype models: they leave the build with the Claudium store (core-systems crew). */
const CLAUDIUM_PENDING_REMOVAL = [
  'adv_dagger',
  'adv_sword_2handed_color',
  'emberfang_sword',
  'purple_axe',
  'purple_dagger',
  'purple_staff',
  'purple_sword',
  'purple_wand',
  'redskull_dagger',
  'redskull_hammer',
  'redskull_staff',
  'redskull_sword',
  'redskull_wand',
];

const RETIRED = Object.entries(WYND_REPLACED_MODELS);

describe('retired inherited weapon models', () => {
  it('each holds its tier look byte for byte', () => {
    expect(RETIRED.length + Object.keys(WYND_HERO_MODELS).length).toBeGreaterThan(150);
    for (const [key, source] of RETIRED) {
      expect(WYND_MODEL_KEYS, key).toContain(source);
      expect(sha(key), key).toBe(sha(source));
    }
  });

  it('leaves nothing inherited and restricted in the weapons folder', () => {
    const allowed = new Set([
      ...WYND_MODEL_KEYS,
      ...Object.keys(WYND_SEAT_DONORS),
      ...KAYKIT_CC0,
      ...GATHERING_TOOLS,
      ...CLAUDIUM_PENDING_REMOVAL,
    ]);
    const shipped = readdirSync(DIR)
      .filter((f) => f.endsWith('.glb'))
      .map((f) => f.slice(0, -4));
    expect(shipped.filter((key) => !allowed.has(key))).toEqual([]);
  });

  it('seat each one the way its tier look sits: grip fit, family and shield seat', () => {
    for (const [key, source] of Object.entries(WYND_SEAT_DONORS)) {
      expect(WEAPON_GRIP_OVERRIDES[key], key).toEqual(WEAPON_GRIP_OVERRIDES[source]);
      const own = KAYKIT_WEAPON_ACCESSORY[key];
      if (own && own !== 'VAR_CROSSBOW' && KAYKIT_WEAPON_ACCESSORY[source]) {
        expect(own, key).toBe(KAYKIT_WEAPON_ACCESSORY[source]);
      }
      const seat = (KAYKIT_SHIELD_ACCESSORIES as Record<string, string>)[key];
      if (seat && Object.hasOwn(WYND_SHIELD_ACCESSORIES, source)) {
        expect(seat, key).toBe(WYND_SHIELD_ACCESSORIES[source]);
      }
    }
  });

  it('gives each hero key its own model, one material inside the held-model budget', () => {
    for (const [key, source] of Object.entries(WYND_HERO_MODELS)) {
      expect(sha(key), key).not.toBe(sha(source));
      const buf = readFileSync(`${DIR}/${key}.glb`);
      const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
      expect(json.materials.length, key).toBe(1);
      let tris = 0;
      for (const mesh of json.meshes) {
        for (const prim of mesh.primitives)
          tris += json.accessors[prim.indices ?? prim.attributes.POSITION].count / 3;
      }
      expect(tris, key).toBeLessThanOrEqual(1500);
      expect(buf.length, key).toBeLessThan(150_000);
    }
  });
});
