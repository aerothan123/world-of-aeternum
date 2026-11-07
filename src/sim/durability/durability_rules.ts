// Classic-era gear durability: the pure rules (no SimContext, no rng, no clock).
// The live system (wear on death and in combat, repair) is ./durability.ts.
//
// Sources, stated once (docs/design/wyndlewood-game-plan.md section 5 asks for
// classic-style durability and repair; the repo docs carry no numbers, so these
// follow the well-known classic behavior):
// - A death costs 10% of every equipped item's maximum durability, and only a
//   death to the world (a mob or the environment): dying to a player, in a duel,
//   a battleground or an arena costs nothing (classic rule).
// - Combat wears gear a little: taking hits wears a worn armor piece, landing
//   weapon (physical) hits wears the weapon. Classic rolled a small chance per
//   hit; this sim draws NO rng for it (adding draws would shift every combat
//   roll after it), so the same average is reached deterministically: one point
//   per HITS_TAKEN_PER_POINT hits taken (round-robin over the worn pieces) and
//   one per HITS_DEALT_PER_POINT physical hits landed.
// - A piece at 0 durability is broken: it stays equipped but grants nothing
//   (no stats, armor or weapon damage) until repaired.
// - Maximum durability by slot (the uncommon baseline) follows classic values,
//   scaled by quality; cloaks, jewelry and trinkets have none.
// - Repair costs copper per missing point, scaled by item level and quality.
//   The per-point rate (REPAIR_COPPER_PER_POINT_PER_ITEM_LEVEL and the quality
//   multipliers) is a DESIGN TARGET, calibrated so a level 20 death in rare gear
//   costs about a third of one level 13 to 19 quest's copper on the shipped
//   content; retune it here, never inline.

import { isShieldItem } from '../equipment_rules';
import { itemLevel } from '../item_level';
import type { EquipSlot, ItemDef } from '../types';

/** Fraction of maximum durability a death to the world costs every worn piece. */
export const DEATH_DURABILITY_LOSS = 0.1;
/** Hits taken per point of armor wear (round-robin over the worn pieces). */
export const HITS_TAKEN_PER_POINT = 20;
/** Physical hits landed per point of weapon wear. */
export const HITS_DEALT_PER_POINT = 25;

/** Classic maximum durability by slot at uncommon quality (0 = no durability). */
const SLOT_BASE_DURABILITY: Readonly<Partial<Record<EquipSlot, number>>> = {
  helmet: 60,
  shoulder: 60,
  chest: 100,
  waist: 35,
  legs: 75,
  gloves: 35,
  feet: 50,
};
const ONE_HAND_DURABILITY = 75;
const TWO_HAND_DURABILITY = 100;
const SHIELD_DURABILITY = 100;

type Quality = NonNullable<ItemDef['quality']>;
const QUALITY_DURABILITY_MULT: Readonly<Record<Quality, number>> = {
  poor: 0.6,
  common: 0.8,
  uncommon: 1,
  rare: 1.2,
  epic: 1.4,
  legendary: 1.6,
};

/** Copper per missing point per item level, at uncommon quality (design target). */
export const REPAIR_COPPER_PER_POINT_PER_ITEM_LEVEL = 1;
const QUALITY_REPAIR_MULT: Readonly<Record<Quality, number>> = {
  poor: 0.5,
  common: 0.75,
  uncommon: 1,
  rare: 1.5,
  epic: 2,
  legendary: 3,
};

/** The slots whose worn piece can carry durability. */
export const DURABILITY_SLOTS: readonly EquipSlot[] = [
  'mainhand',
  'offhand',
  'helmet',
  'shoulder',
  'chest',
  'waist',
  'legs',
  'gloves',
  'feet',
];

/** The item's maximum durability (0 when it has none). */
export function maxDurabilityFor(item: ItemDef | undefined): number {
  if (!item?.slot) return 0;
  const shape = item as { hand?: string; weapon?: unknown };
  let base = 0;
  if (item.slot === 'mainhand') {
    base = shape.hand === 'twohand' ? TWO_HAND_DURABILITY : ONE_HAND_DURABILITY;
  } else if (item.slot === 'offhand') {
    // An off-hand weapon or a shield wears; a held off-hand (lantern, tome) does not.
    if (shape.weapon) base = ONE_HAND_DURABILITY;
    else if (isShieldItem(item)) base = SHIELD_DURABILITY;
  } else {
    base = SLOT_BASE_DURABILITY[item.slot as EquipSlot] ?? 0;
  }
  if (base === 0) return 0;
  return Math.max(1, Math.round(base * QUALITY_DURABILITY_MULT[item.quality ?? 'common']));
}

/** Points lost from a payload's wear, clamped to the item's maximum. */
export function wearOf(item: ItemDef | undefined, wear: number | undefined): number {
  const max = maxDurabilityFor(item);
  if (max === 0 || !wear || wear < 0) return 0;
  return Math.min(max, Math.floor(wear));
}

/** Current durability (max minus wear). */
export function currentDurability(item: ItemDef | undefined, wear: number | undefined): number {
  return maxDurabilityFor(item) - wearOf(item, wear);
}

/** A broken piece grants nothing until repaired. */
export function isBroken(item: ItemDef | undefined, wear: number | undefined): boolean {
  const max = maxDurabilityFor(item);
  return max > 0 && wearOf(item, wear) >= max;
}

/** Points a death to the world costs this item (10% of max, at least 1). */
export function deathWearFor(item: ItemDef | undefined): number {
  const max = maxDurabilityFor(item);
  return max === 0 ? 0 : Math.max(1, Math.round(max * DEATH_DURABILITY_LOSS));
}

/** Copper per missing point for this item. */
export function repairCopperPerPoint(item: ItemDef): number {
  const level = itemLevel(item) ?? (item as { requiredLevel?: number }).requiredLevel ?? 1;
  return Math.max(
    1,
    Math.ceil(
      Math.max(1, level) *
        REPAIR_COPPER_PER_POINT_PER_ITEM_LEVEL *
        QUALITY_REPAIR_MULT[item.quality ?? 'common'],
    ),
  );
}

/** The copper to restore `wear` lost points on this item. */
export function repairCost(item: ItemDef | undefined, wear: number | undefined): number {
  if (!item) return 0;
  const lost = wearOf(item, wear);
  return lost === 0 ? 0 : lost * repairCopperPerPoint(item);
}

/** Durability below this fraction of max shows the HUD warning tint. */
export const DURABILITY_LOW_FRACTION = 0.25;

export type DurabilityState = 'ok' | 'low' | 'broken';

export function durabilityState(
  item: ItemDef | undefined,
  wear: number | undefined,
): DurabilityState {
  const max = maxDurabilityFor(item);
  if (max === 0) return 'ok';
  const cur = currentDurability(item, wear);
  if (cur <= 0) return 'broken';
  return cur / max < DURABILITY_LOW_FRACTION ? 'low' : 'ok';
}
