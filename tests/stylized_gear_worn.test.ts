// The stylized kit's gear mapping and seam fill (dev-only `?stylizedchars=1` review): worn
// equipment shows stylized pieces of its own weight, and two sets meeting never open a gap.
import { describe, expect, it } from 'vitest';
import {
  STYLIZED_SET_ARMOR,
  STYLIZED_SETS,
  type StylizedItemLookup,
  stylizedCloseSeams,
  stylizedFitCatalog,
  stylizedGearWorn,
  stylizedItemId,
  stylizedKitWorn,
  stylizedManifest,
  stylizedSetForItem,
  stylizedSetOfDisplay,
} from '../src/render/characters/stylized_kit_core';
import { wocItemRecord } from '../src/render/characters/woc_armor_catalog';
import { WOC_WARRIOR_MANIFEST } from '../src/render/characters/woc_character_manifest';
import {
  wocAllPartNames,
  wocVisibleParts,
  wocWornSets,
} from '../src/render/characters/woc_parts_core';
import type { ArmorType } from '../src/sim/types';

const lookup = (types: Record<string, ArmorType>, rows: Record<string, string> = {}) =>
  ({
    armorType: (id: string) => types[id] ?? null,
    displaySet: (id: string) => rows[id] ?? null,
  }) satisfies StylizedItemLookup;

describe('stylized gear mapping', () => {
  it('shows an item in its own class set when the weight matches, else the weight stand-in', () => {
    expect(stylizedSetForItem('mage', 'cloth', null)).toBe('mage');
    expect(stylizedSetForItem('warlock', 'cloth', null)).toBe('warlock');
    expect(stylizedSetForItem('plate', 'cloth', null)).toBe('mage');
    expect(stylizedSetForItem('mage', 'mail', null)).toBe('plate');
    expect(stylizedSetForItem('rogue', 'leather', null)).toBe('rogue');
    expect(stylizedSetForItem('priest', 'leather', null)).toBe('leather');
    expect(stylizedSetForItem('druid', null, null)).toBe('druid');
  });

  it('honours a display row when the kit has that set (the warrior set is the plate one)', () => {
    expect(stylizedSetOfDisplay('warrior')).toBe('plate');
    expect(stylizedSetOfDisplay('shaman')).toBe('shaman');
    expect(stylizedSetOfDisplay('iron_crown')).toBeNull();
    expect(stylizedSetForItem('mage', 'cloth', 'warrior')).toBe('plate');
    expect(stylizedSetForItem('mage', 'cloth', 'iron_crown')).toBe('mage');
  });

  it('gives every set a weight', () => {
    for (const s of STYLIZED_SETS) expect(STYLIZED_SET_ARMOR[s]).toBeTruthy();
  });

  it('dresses the worn slots only, legs included, and a non-plate head leaves the hair', () => {
    const items = lookup({ robe: 'cloth', pants: 'leather', hood: 'cloth', coif: 'mail' });
    const worn = stylizedGearWorn(
      'male',
      { chest: 'robe', legs: 'pants', helmet: 'hood' },
      false,
      'mage',
      items,
    );
    expect(worn.chest).toBe(stylizedItemId('male', 'mage', 'chest'));
    expect(worn.legs).toBe(stylizedItemId('male', 'leather', 'legs'));
    expect(worn.head).toBeNull();
    for (const slot of ['arms', 'hands', 'waist', 'feet']) expect(worn[slot]).toBeNull();
    const helmed = stylizedGearWorn('female', { helmet: 'coif' }, false, 'mage', items);
    expect(helmed.head).toBe(stylizedItemId('female', 'plate', 'head'));
    expect(stylizedGearWorn('female', { helmet: 'coif' }, true, 'mage', items).head).toBeNull();
    expect(stylizedGearWorn('male', null, false, 'mage', items).chest).toBeNull();
  });

  it('resolves a borrowed piece through the stylized catalog, so its set file is asked for', () => {
    const m = stylizedManifest('male', WOC_WARRIOR_MANIFEST, 'mage');
    const worn = stylizedGearWorn(
      'male',
      { chest: 'robe', legs: 'pants' },
      false,
      'mage',
      lookup({ robe: 'cloth', pants: 'leather' }),
    );
    expect(wocItemRecord(m, worn.legs as string)?.set).toBe('stylized_leather');
    expect(wocWornSets(m, worn)).toEqual(['stylized_mage', 'stylized_leather']);
    expect(wocAllPartNames(m)).toContain('Armor_Stylized_Leather_Legs');
    expect(wocVisibleParts(m, m.defaultAppearance, worn).has('Armor_Stylized_Leather_Legs')).toBe(
      true,
    );
    expect(stylizedFitCatalog('female').get(stylizedItemId('female', 'druid', 'chest'))?.set).toBe(
      'stylized_druid',
    );
  });
});

describe('stylized seam closing', () => {
  it('leaves a kit that is one set throughout untouched', () => {
    const worn = stylizedKitWorn('male', 'plate', false);
    expect(stylizedCloseSeams('male', worn)).toBe(worn);
  });

  it('puts the belt with the chest and the gloves with the shoulders across two sets', () => {
    const worn = stylizedKitWorn('female', 'mixed', false);
    expect(worn.chest).toBe(stylizedItemId('female', 'plate', 'chest'));
    expect(worn.waist).toBe(stylizedItemId('female', 'plate', 'waist'));
    expect(worn.hands).toBe(stylizedItemId('female', 'plate', 'hands'));
    expect(worn.legs).toBe(stylizedItemId('female', 'leather', 'legs'));
    const gear = stylizedGearWorn(
      'male',
      { chest: 'robe', waist: 'belt', gloves: 'mitts' },
      false,
      'mage',
      lookup({ robe: 'cloth', belt: 'leather', mitts: 'leather' }),
    );
    expect(gear.waist).toBe(stylizedItemId('male', 'mage', 'waist'));
    // no shoulders worn: the gloves keep their own set
    expect(gear.hands).toBe(stylizedItemId('male', 'leather', 'hands'));
  });
});
