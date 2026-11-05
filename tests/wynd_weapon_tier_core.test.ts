// Which WYNDLEWOOD tier look an equipped item draws (wynd_weapon_tier_core.ts), and that the
// render attach path reads it (manifest.ts heldMainhandModelUrl / heldOffhandModelUrl) while
// the classic tables keep answering for everything the tier set does not cover.
import { describe, expect, it } from 'vitest';
import {
  heldMainhandModelUrl,
  heldOffhandItemModelUrl,
  heldOffhandModelUrl,
  ITEM_OFFHAND_MODELS,
  itemOffhandModelUrl,
  itemWeaponModelUrl,
} from '../src/render/characters/manifest';
import { WYND_WEAPON_BASES, wyndModelKey } from '../src/render/characters/wynd_weapon_models';
import {
  isSupersededPackKey,
  wyndHeldModelKey,
  wyndTierForItem,
  wyndTypeForItem,
} from '../src/render/characters/wynd_weapon_tier_core';
import { CLASSES, ITEMS } from '../src/sim/data';
import { isShieldItem } from '../src/sim/equipment_rules';
import { ITEM_WEAPON_VARIANTS } from '../src/ui/weapon_variants';

const keyOf = (url: string | null): string | null => /([^/]+)\.glb$/.exec(url ?? '')?.[1] ?? null;
const classicMain = (id: string): string | null => keyOf(itemWeaponModelUrl(id));
const classicOff = (id: string): string | null => keyOf(itemOffhandModelUrl(id));

describe('wynd tier resolution', () => {
  it('supersedes the plain packs and the inscription tomes, never a model made for its item', () => {
    for (const key of [
      'sword_starter',
      'hammer_field_2h_iron',
      'staff_rare_a_obsidian',
      'shield_field_steel',
      'tome_goldleaf',
    ]) {
      expect(isSupersededPackKey(key), key).toBe(true);
    }
    for (const key of [
      'sword_epic_deathless_crucible_heart',
      'hammer_varkhul',
      'craterglass_stave',
      'shardpike_spear',
      'shield_round',
      null,
    ]) {
      expect(isSupersededPackKey(key), String(key)).toBe(false);
    }
  });

  it('reads the tier off the item: the starting kit and plain gear starter, uncommon and rare mid, epic fine', () => {
    expect(wyndTierForItem('worn_sword', ITEMS.worn_sword)).toBe('starter');
    expect(wyndTierForItem('x', { quality: 'common' })).toBe('starter');
    expect(wyndTierForItem('x', { quality: undefined })).toBe('starter');
    expect(wyndTierForItem('x', { quality: 'uncommon' })).toBe('mid');
    expect(wyndTierForItem('x', { quality: 'rare' })).toBe('mid');
    expect(wyndTierForItem('x', { quality: 'epic' })).toBe('fine');
    expect(wyndTierForItem('x', { quality: 'legendary' })).toBeNull();
  });

  it('draws every class its starting gear in the starter look, where its type has a base', () => {
    for (const def of Object.values(CLASSES)) {
      const key = wyndHeldModelKey(def.startWeapon, classicMain(def.startWeapon));
      if (key) expect(key, def.startWeapon).toMatch(/_starter$/);
    }
    expect(heldMainhandModelUrl('worn_sword')).toBe(
      `models/weapons/${wyndModelKey('sword', 'starter')}.glb`,
    );
    expect(heldOffhandItemModelUrl('eastbrook_buckler')).toBe(
      `models/weapons/${wyndModelKey('shield', 'starter')}.glb`,
    );
  });

  it('gives every pack-drawn weapon and shield of a covered type its tier look, by quality', () => {
    let covered = 0;
    for (const [id, item] of Object.entries(ITEMS)) {
      if (item.heroicOf) continue;
      const shield = isShieldItem(item);
      if (item.kind !== 'weapon' && !shield) continue;
      const classic = shield ? classicOff(id) : classicMain(id);
      const type = wyndTypeForItem(id, classic);
      const tier = wyndTierForItem(id, item);
      const got = shield ? keyOf(heldOffhandItemModelUrl(id)) : keyOf(heldMainhandModelUrl(id));
      if (isSupersededPackKey(classic) && type && tier) {
        expect(got, id).toBe(wyndModelKey(type, tier));
        covered++;
      } else {
        expect(got, id).toBe(classic);
      }
    }
    expect(covered).toBeGreaterThan(40);
  });

  it('keeps legendary and bespoke models, and every type without a base, on the classic table', () => {
    expect(heldMainhandModelUrl('kingsbane_last_oath')).toBe(
      itemWeaponModelUrl('kingsbane_last_oath'),
    );
    expect(heldMainhandModelUrl('varkhul_forgebreaker')).toBe(
      itemWeaponModelUrl('varkhul_forgebreaker'),
    );
    for (const [id, key] of Object.entries(ITEM_WEAPON_VARIANTS)) {
      const type = wyndTypeForItem(id, key);
      if (type === null) expect(heldMainhandModelUrl(id), id).toBe(itemWeaponModelUrl(id));
    }
    expect(heldMainhandModelUrl(null)).toBeNull();
    expect(heldMainhandModelUrl('stale_server_weapon_id')).toBeNull();
  });

  it('draws a Heroic copy in its base item look', () => {
    for (const [id, item] of Object.entries(ITEMS)) {
      if (!item.heroicOf || !ITEMS[item.heroicOf]) continue;
      expect(heldMainhandModelUrl(id), id).toBe(heldMainhandModelUrl(item.heroicOf));
    }
  });

  it('gives the inscription tomes the tier tome, and keeps a mirrored skin first', () => {
    for (const [id, key] of Object.entries(ITEM_OFFHAND_MODELS)) {
      if (!key.startsWith('tome_')) continue;
      expect(keyOf(heldOffhandItemModelUrl(id)), id).toMatch(/^tome_wynd_(starter|mid|fine)$/);
    }
    expect(heldOffhandModelUrl('eastbrook_buckler', null)).toBe(
      heldOffhandItemModelUrl('eastbrook_buckler'),
    );
  });

  it('names only bases the registry ships', () => {
    for (const id of Object.keys(ITEMS)) {
      const t = wyndTypeForItem(id, classicMain(id) ?? classicOff(id));
      if (t) expect(Object.hasOwn(WYND_WEAPON_BASES, t), id).toBe(true);
    }
  });
});
