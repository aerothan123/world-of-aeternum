// The weapons a new character starts with: which model each class's starting kit draws,
// and the shape those model files must keep for the attach path to seat them.
//
// The five starting weapon items and the starting shield resolve through the item tables;
// the hunter's crossbow is the class body's own fixed attach (a hunter's equipped hatchet
// never shows: the body has no weapon swap slot), and so is the open spellbook in the
// warlock's off hand. Every other item keeps the model it had.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KAYKIT_WEAPON_ACCESSORY, VARIANT_GRIPS } from '../src/render/characters/assets';
import { BACK_GRIP_FAMILIES } from '../src/render/characters/back_grips';
import {
  KAYKIT_SHIELD_ACCESSORIES,
  KAYKIT_SHIELD_GRIPS,
} from '../src/render/characters/held_item_grips';
import {
  ITEM_OFFHAND_MODELS,
  isAuthoredHeldModelUrl,
  isRimlessHeldModelUrl,
  itemOffhandModelUrl,
  itemWeaponModelUrl,
  manifestUrls,
  NPC_PROP_ATTACH,
  VISUALS,
} from '../src/render/characters/manifest';
import { variantGripTransform, WEAPON_GRIP_OVERRIDES } from '../src/render/characters/weapon_grip';
import { CLASSES } from '../src/sim/data';
import { ITEM_WEAPON_VARIANTS } from '../src/ui/weapon_variants';

const model = (key: string): string => `models/weapons/${key}.glb`;

/** What each class holds the moment it is created: [mainhand model, offhand model]. */
const STARTING_KIT: Record<string, [string, string | null]> = {
  warrior: ['sword_starter', 'shield_starter'],
  paladin: ['hammer_starter', 'shield_starter'],
  rogue: ['dagger_starter', 'dagger_starter'],
  shaman: ['hammer_starter', null],
  mage: ['staff_starter', null],
  priest: ['staff_starter', null],
  warlock: ['staff_starter', null],
  druid: ['staff_starter', null],
  // the hatchet is what the hunter CARRIES; what it holds is pinned separately below
  hunter: ['axe_starter', null],
};

const STARTER_MODELS = [
  'sword_starter',
  'dagger_starter',
  'hammer_starter',
  'axe_starter',
  'staff_starter',
  'shield_starter',
  'crossbow_starter',
  'spellbook_starter',
] as const;

interface GlbNode {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}
interface GlbJson {
  extensionsRequired?: string[];
  scenes: { nodes: number[] }[];
  nodes: GlbNode[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  materials: unknown[];
  textures?: { extensions?: Record<string, unknown> }[];
  accessors: { min?: number[]; max?: number[]; normalized?: boolean; componentType: number }[];
}

function readGlb(key: string): GlbJson {
  const buf = readFileSync(`public/${model(key)}`);
  expect(buf.readUInt32LE(0), `${key} magic`).toBe(0x46546c67);
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as GlbJson;
}

type Vec3 = [number, number, number];

function rotate(q: [number, number, number, number], v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  // v + 2w(q x v) + 2 q x (q x v)
  const cx = y * vz - z * vy;
  const cy = z * vx - x * vz;
  const cz = x * vy - y * vx;
  return [
    vx + 2 * (w * cx + (y * cz - z * cy)),
    vy + 2 * (w * cy + (z * cx - x * cz)),
    vz + 2 * (w * cz + (x * cy - y * cx)),
  ];
}

/** The model's bounds in the frame the attach path keeps (under the wrapper node). */
function authoredBounds(key: string): { min: Vec3; max: Vec3 } {
  const json = readGlb(key);
  const inner = json.nodes[json.nodes[json.scenes[0].nodes[0]].children?.[0] ?? -1];
  const accessor = json.accessors[json.meshes[inner.mesh ?? -1].primitives[0].attributes.POSITION];
  // int16, normalized: a stored 32767 is 1.0
  expect(accessor.normalized, `${key} positions`).toBe(true);
  expect(accessor.componentType).toBe(5122);
  const lo = (accessor.min ?? []).map((n) => n / 32767);
  const hi = (accessor.max ?? []).map((n) => n / 32767);
  const s = inner.scale ?? [1, 1, 1];
  const t = inner.translation ?? [0, 0, 0];
  const q = inner.rotation ?? [0, 0, 0, 1];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const cx of [lo[0], hi[0]]) {
    for (const cy of [lo[1], hi[1]]) {
      for (const cz of [lo[2], hi[2]]) {
        const p = rotate(q, [cx * s[0], cy * s[1], cz * s[2]]);
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], p[i] + t[i]);
          max[i] = Math.max(max[i], p[i] + t[i]);
        }
      }
    }
  }
  return { min, max };
}

describe('the starting kit', () => {
  it('draws each class its starter models', () => {
    expect(Object.keys(STARTING_KIT).sort()).toEqual(Object.keys(CLASSES).sort());
    for (const [cls, [mainhand, offhand]] of Object.entries(STARTING_KIT)) {
      const def = CLASSES[cls as keyof typeof CLASSES];
      expect(itemWeaponModelUrl(def.startWeapon), `${cls} mainhand`).toBe(model(mainhand));
      expect(
        def.startOffhand ? itemOffhandModelUrl(def.startOffhand) : null,
        `${cls} offhand`,
      ).toBe(offhand ? model(offhand) : null);
    }
  });

  it("holds the starter crossbow on the hunter's body, whatever it has equipped", () => {
    for (const key of ['player_hunter', 'player_hunter_female']) {
      const def = VISUALS[key];
      expect(
        def.attach?.map((a) => a.url),
        key,
      ).toEqual([model('crossbow_starter')]);
      // no swap slot: the equipped hatchet never replaces the crossbow
      expect(def.weaponSlots, key).toBeUndefined();
    }
  });

  it("holds the starter spellbook in the warlock's off hand, open toward the warlock", () => {
    for (const key of ['player_warlock', 'player_warlock_female']) {
      const book = VISUALS[key].attach?.[1];
      expect(book?.url, key).toBe(model('spellbook_starter'));
      expect(book?.bone, key).toBe('handslot.l');
      // Half a turn about the spine: the pages (the model's +Z) face the body, where the
      // left slot's +Z points away from it. With a turn set, the attach path seats the
      // book on the slot itself and reads no rig accessory node (this rig has none).
      expect(book?.rotationY, key).toBe(Math.PI);
      expect(book?.position, key).toBeUndefined();
      expect(book?.gripRef, key).toBeUndefined();
      // a fixed prop: it shows whatever the warlock has equipped
      expect(book?.swapOnly, key).toBeUndefined();
      expect(VISUALS[key].offhandSlot, key).toBeUndefined();
    }
    // the casters whose book slot is a swap-only base keep the kit file there: it never
    // draws, and their class defs feed the mob portrait ledger (a changed file would stale it)
    expect(VISUALS.player_mage.attach?.[1]).toEqual({
      url: model('spellbook_open'),
      bone: 'handslot.l',
      swapOnly: true,
    });
    // an NPC with a tome holds the starter book too, turned the same way, beside a rare staff
    expect(NPC_PROP_ATTACH.tome).toEqual([
      { url: model('staff_rare_b_violet'), bone: 'handslot.r' },
      { url: model('spellbook_starter'), bone: 'handslot.l', rotationY: Math.PI },
    ]);
  });

  it('moves ONLY the starting items: every other item keeps its model', () => {
    const starterItems = Object.entries(ITEM_WEAPON_VARIANTS)
      .filter(([, variant]) => variant.endsWith('_starter'))
      .map(([id]) => id)
      .sort();
    expect(starterItems).toEqual([
      'gnarled_staff',
      'rusty_dagger',
      'rusty_hatchet',
      'training_mace',
      'worn_sword',
    ]);
    const starterShields = Object.entries(ITEM_OFFHAND_MODELS)
      .filter(([, key]) => key === 'shield_starter')
      .map(([id]) => id);
    // ...and the one rare buckler: a rare item draws a common shape (the set one rarity
    // down), and the starting buckler is the only round common shield
    expect(starterShields.sort()).toEqual(['eastbrook_buckler', 'rare_storm_tuned_buckler']);
    // the common knives and staves that once shared the old starter models draw the
    // field set (tests/field_weapon_models.test.ts), never a starter model
    expect(itemWeaponModelUrl('vale_carving_knife')).toBe(model('dagger_field_steel'));
    expect(itemWeaponModelUrl('hickory_shortstaff')).toBe(model('staff_field_steel'));
    expect(itemWeaponModelUrl('bronzework_mace')).toBe(model('hammer_field_bronze'));
    expect(itemWeaponModelUrl('copper_bearded_axe')).toBe(model('axe_field_bronze'));
    // the epic buckler draws the rare set's round shield, never the starter one
    expect(itemOffhandModelUrl('storm_tuned_buckler')).toBe(model('shield_rare_b_teal'));
    // and an NPC with a crossbow holds the starter one (there is no rare crossbow)
    expect(NPC_PROP_ATTACH.crossbow.map((a) => a.url)).toEqual([model('crossbow_starter')]);
  });

  // A flat plate takes the character rim over its whole face when it turns edge-on to the
  // camera (the purple-grey film the owner saw on the shield's inner face), so the two plate
  // models draw without it. The rounded and narrow ones keep their silhouette rim.
  it('draws the two flat plates, the shield and the open book, without the rim', () => {
    const rimless = STARTER_MODELS.filter((key) => isRimlessHeldModelUrl(model(key)));
    expect(rimless).toEqual(['shield_starter', 'spellbook_starter']);
    // the kit shield and book are not part of the rule, nor is anything outside the folder
    expect(isRimlessHeldModelUrl(model('shield_round'))).toBe(false);
    expect(isRimlessHeldModelUrl(model('spellbook_open'))).toBe(false);
    expect(isRimlessHeldModelUrl('models/chars/npc_gear/shield_starter.glb')).toBe(false);
  });

  it('is in the preload set and keeps its own painted surface', () => {
    const preloaded = new Set(manifestUrls());
    for (const key of STARTER_MODELS) {
      expect(preloaded.has(model(key)), `${key} preloaded`).toBe(true);
      expect(isAuthoredHeldModelUrl(model(key)), `${key} authored surface`).toBe(true);
    }
  });
});
