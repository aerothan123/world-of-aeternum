// The visual's two hooks into the stylized kit review (dev-only): the face and hair a
// stylized body shows, and the kit it wears in place of its equipment. Both answer null for
// every other body and whenever the review is off, so the WOC dressing path (visual.ts
// dressWoc, setWocEquipment) runs exactly as before. A stylized body always wears a kit: its
// equipment mapped onto stylized pieces (stylized_kit_core.ts stylizedGearWorn: each worn
// item's display row or armor weight picks its set) unless the review asks for a kit
// (`?stylizedkit=class|mixed|bare|<set>`).
import { ITEMS } from '../../sim/data';
import type { EquipSlot } from '../../sim/types';
import { stylizedReviewParam } from './stylized_char_test_flag';
import {
  isStylizedKit,
  type StylizedItemLookup,
  stylizedAppearance,
  stylizedClassSetOf,
  stylizedGearWorn,
  stylizedKitWorn,
} from './stylized_kit_core';
import type { WocCharacterManifest } from './woc_character_manifest';
import { WOC_ITEM_DISPLAY } from './woc_item_display';
import type { WocAppearance, WocWorn } from './woc_parts_core';

// the visual's third and fourth hooks: what a stylized body can draw while a set file still
// streams, and the body regions that fill a seam between two sets
export { stylizedDrawableWorn, stylizedSeamFill } from './stylized_kit_core';

/** The live item table, as the gear mapping reads it. */
const ITEM_LOOKUP: StylizedItemLookup = {
  armorType(itemId) {
    const def = ITEMS[itemId];
    return def && def.kind === 'armor' ? (def.armorType ?? null) : null;
  },
  displaySet(itemId) {
    return WOC_ITEM_DISPLAY[itemId]?.set ?? null;
  },
};

/** The appearance a stylized body draws (its review face/hair), null for any other body. */
export function stylizedAppearanceFor(manifest: WocCharacterManifest): WocAppearance | null {
  if (!manifest.ownHead) return null;
  return stylizedAppearance(manifest, stylizedReviewParam('face'), stylizedReviewParam('hair'));
}

/** What a stylized body wears, null for any other body: its equipment's pieces, or the
 *  review kit when one is asked for. `stylizedhelm=on|off` overrides the body's own
 *  hide-helm choice for the review. */
export function stylizedKitFor(
  manifest: WocCharacterManifest,
  helmHidden: boolean,
  equipped?: Readonly<Partial<Record<EquipSlot, string>>> | null,
): WocWorn | null {
  if (!manifest.ownHead) return null;
  const asked = stylizedReviewParam('kit');
  const helm = stylizedReviewParam('helm');
  const hide = helm === 'on' ? false : helm === 'off' ? true : helmHidden;
  const classSet = stylizedClassSetOf(manifest);
  if (asked && isStylizedKit(asked)) return stylizedKitWorn(manifest.fit, asked, hide, classSet);
  return stylizedGearWorn(manifest.fit, equipped, hide, classSet, ITEM_LOOKUP);
}
