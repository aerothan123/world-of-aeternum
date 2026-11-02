// The skill counter of a SECONDARY craft (content/professions.ts
// SECONDARY_CRAFTS): a craft that reuses the recipe machinery off the ring,
// so its skill cannot live in the ten-key ring craftSkills record. Today that
// is Furnishing alone (Project H housing, phase 2), on
// PlayerMeta.furnishingSkill (housing/house_state.ts owns its persistence).
// A pure leaf: crafting.ts routes the one gain site here for a secondary
// craft id and keeps gainCraftSkill for every ring craft.

import { craftMaxSkillFor, FURNISHING_CRAFT_ID, isSecondaryCraft } from '../content/professions';

/** The host state a secondary craft's skill lives on. */
export interface SecondarySkillHost {
  furnishingSkill: number;
}

/** The player's skill in secondary craft `craftId` (0 for an unknown one). */
export function secondaryCraftSkill(host: SecondarySkillHost, craftId: string): number {
  return craftId === FURNISHING_CRAFT_ID ? host.furnishingSkill : 0;
}

/** Additive-only gain for one secondary craft, clamped at its content cap
 *  (the wheel.ts gainCraftSkill rule). Returns the APPLIED delta, 0 for a
 *  non-positive amount, an unknown craft, or a craft at cap. */
export function gainSecondaryCraftSkill(
  host: SecondarySkillHost,
  craftId: string,
  amount: number,
): number {
  if (!isSecondaryCraft(craftId) || !(amount > 0)) return 0;
  if (craftId !== FURNISHING_CRAFT_ID) return 0;
  const before = host.furnishingSkill;
  host.furnishingSkill = Math.min(craftMaxSkillFor(craftId), before + amount);
  return host.furnishingSkill - before;
}
