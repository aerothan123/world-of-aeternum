// The visual's two hooks into the stylized kit review (dev-only): the face and hair a
// stylized body shows, and the kit it wears in place of its equipment. Both answer null for
// every other body and whenever the review is off, so the WOC dressing path (visual.ts
// dressWoc, setWocEquipment) runs exactly as before. A stylized body always wears a kit: its
// class set unless the review asks for another (`?stylizedkit=`); its equipment's own display
// rows are not mapped onto stylized pieces yet.
import { stylizedReviewParam } from './stylized_char_test_flag';
import {
  isStylizedKit,
  stylizedAppearance,
  stylizedClassSetOf,
  stylizedKitWorn,
} from './stylized_kit_core';
import type { WocCharacterManifest } from './woc_character_manifest';
import type { WocAppearance, WocWorn } from './woc_parts_core';

// the visual's third hook: what a stylized body can draw while a set file still streams
export { stylizedDrawableWorn } from './stylized_kit_core';

/** The appearance a stylized body draws (its review face/hair), null for any other body. */
export function stylizedAppearanceFor(manifest: WocCharacterManifest): WocAppearance | null {
  if (!manifest.ownHead) return null;
  return stylizedAppearance(manifest, stylizedReviewParam('face'), stylizedReviewParam('hair'));
}

/** The kit a stylized body wears, null for any other body. `stylizedhelm=on|off` overrides
 *  the body's own hide-helm choice for the review. */
export function stylizedKitFor(
  manifest: WocCharacterManifest,
  helmHidden: boolean,
): WocWorn | null {
  if (!manifest.ownHead) return null;
  const asked = stylizedReviewParam('kit');
  const kit = asked && isStylizedKit(asked) ? asked : 'class';
  const helm = stylizedReviewParam('helm');
  const hide = helm === 'on' ? false : helm === 'off' ? true : helmHidden;
  return stylizedKitWorn(manifest.fit, kit, hide, stylizedClassSetOf(manifest));
}
