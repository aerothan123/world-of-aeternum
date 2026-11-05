// The stylized kit's gear mapping and seam fill (dev-only `?stylizedchars=1` review): worn
// equipment shows stylized pieces of its own weight, and two sets meeting never open a gap.
import { describe, expect, it } from 'vitest';
import {
  STYLIZED_SET_ARMOR,
  STYLIZED_SETS,
  type StylizedItemLookup,
  stylizedFitCatalog,
  stylizedGearWorn,
  stylizedItemId,
  stylizedKitWorn,
  stylizedManifest,
  stylizedSeamFill,
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

describe('stylized seam fill', () => {
  const m = stylizedManifest('male', WOC_WARRIOR_MANIFEST, 'plate', ['leather']);
  const region = (slot: string) => m.appearance[`body_${slot}`].variants.default.nodes[0];

  it('adds nothing for a kit that is one set throughout', () => {
    const worn = stylizedKitWorn('male', 'plate', false);
    const wanted = wocVisibleParts(m, m.defaultAppearance, worn);
    const before = [...wanted];
    expect([...stylizedSeamFill(m, worn, wanted)]).toEqual(before);
  });

  it('shows the body under both sides of a seam where two sets meet', () => {
    const worn = stylizedKitWorn('male', 'mixed', false);
    const wanted = stylizedSeamFill(m, worn, wocVisibleParts(m, m.defaultAppearance, worn));
    // plate chest and arms over leather waist and hands: chest/waist and arms/hands seams
    for (const slot of ['chest', 'waist', 'arms', 'hands'])
      expect(wanted.has(region(slot))).toBe(true);
    // leather waist, legs and feet meet each other only: those stay covered
    expect(wanted.has(region('legs'))).toBe(false);
    expect(wanted.has(region('feet'))).toBe(false);
  });

  it('leaves a WOC body alone', () => {
    const wanted = new Set(['x']);
    expect(stylizedSeamFill(WOC_WARRIOR_MANIFEST, { chest: null }, wanted)).toBe(wanted);
    expect([...wanted]).toEqual(['x']);
  });
});
