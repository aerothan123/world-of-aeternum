// Gathering tool slots: the per-character tool belt (one slot per gathering
// profession), separate from combat gear and carrying no combat stats. Pure
// leaf: no SimContext, no rng, items table as a parameter, so the sim, the
// server and the client mirrors resolve the same answers (the tools.ts /
// wield_gate.ts shape).
//
// The rule this module exists for: a tool works only while it sits in its
// slot. Every ACCESS, GRADE, SPEED and fishing-band read (the node gate, the
// tree chop, the corpse harvest arm, the rod band and reel window, the hoe
// gate) scans `toolBelt(...)` instead of the bags, so a pick left in the
// bags gathers nothing. The PRICE family (the R47 ratchet, the R30 recharge
// and the slot mint, see tools.ts) stays ownership-based and scans
// `ownedGatherTools(...)`, the bags plus the belt, exactly as it scanned the
// bags before the belt existed.
//
// The slot ids ARE the gathering profession ids, so the existing
// per-profession scans (bestWieldableGatherToolTierOrNone and friends) run
// over the belt unchanged: the belt is handed to them as a tiny InvSlot list.

import { GATHERING_PROFESSION_IDS, type GatheringProfessionId } from '../content/professions';
import { cloneInvSlot, type InvSlot, type ItemDef } from '../types';
import { isGatherToolUse } from './tools';

/** The tool belt: one equipped copy per gathering profession slot. */
export type GatherToolSlots = Partial<Record<GatheringProfessionId, InvSlot>>;

/** What any belt reader needs: the optional belt on a player meta or mirror. */
export interface GatherToolBeltHolder {
  gatherTools?: GatherToolSlots;
}

/** The shared frozen empty belt (a missing belt reads as no tools at all). */
export const EMPTY_GATHER_TOOL_SLOTS: Readonly<GatherToolSlots> = Object.freeze({});

/**
 * The basic tool every NEW character starts with in each slot that has one,
 * and the one a pre-belt character with no tool of that profession is
 * granted on first load (so no existing player is locked out of gathering).
 * These are the shipped tier-1 tools the starter quests already hand over.
 * Fishing and farming start empty: their implements come from Wilkes' pole
 * and the farming intro quest exactly as before.
 */
export const STARTER_GATHER_TOOL_IDS: Readonly<Partial<Record<GatheringProfessionId, string>>> =
  Object.freeze({
    mining: 'copper_mining_pick',
    logging: 'handaxe',
    herbalism: 'gathering_sickle',
  });

/**
 * The slot an item equips into, or null when it is not a gathering tool. A
 * `gatherTool` use names its profession; the simple fishing pole (use type
 * 'fishing', the tier-1 rod) goes in the fishing slot.
 */
export function gatherToolSlotFor(def: ItemDef | undefined): GatheringProfessionId | null {
  const use = def?.use;
  if (!use) return null;
  if (isGatherToolUse(use)) return use.professionId;
  return use.type === 'fishing' ? 'fishing' : null;
}

/** The tier a slotted tool ranks at: its gatherTool tier, 1 for the simple
 *  pole, 0 for anything that is not a tool. Used to order auto-fill and the
 *  legacy migration; access itself always goes through the wield scans. */
export function gatherToolRank(def: ItemDef | undefined): number {
  const use = def?.use;
  if (!use) return 0;
  if (isGatherToolUse(use)) return use.tier;
  return use.type === 'fishing' ? 1 : 0;
}

/** The equipped tools as an InvSlot list in fixed profession order, the
 *  shape every per-profession tool scan takes. Allocates at most five refs. */
export function toolBelt(holder: GatherToolBeltHolder | undefined): readonly InvSlot[] {
  return toolBeltOf(holder?.gatherTools);
}

/** `toolBelt` over a bare slot record (the IWorld `gatherToolSlots` read). */
export function toolBeltOf(slots: Readonly<GatherToolSlots> | undefined): readonly InvSlot[] {
  if (!slots) return [];
  const out: InvSlot[] = [];
  for (const id of GATHERING_PROFESSION_IDS) {
    const slot = slots[id];
    if (slot) out.push(slot);
  }
  return out;
}

/** Bags plus belt: the OWNERSHIP read the price family keeps (R47/R30). */
export function ownedGatherTools(
  holder: GatherToolBeltHolder & { inventory: readonly InvSlot[] },
): readonly InvSlot[] {
  const belt = toolBelt(holder);
  return belt.length === 0 ? holder.inventory : [...holder.inventory, ...belt];
}

/** One copy of a bag stack, ready for a slot: count 1, no bag cell hint. */
export function toolSlotCopyOf(slot: InvSlot): InvSlot {
  const copy = cloneInvSlot(slot);
  copy.count = 1;
  delete copy.slot;
  return copy;
}

/**
 * The bag index of the best tool for `professionId` (highest rank, earliest
 * index on a tie, so the answer never depends on anything but the bags), or
 * -1 when the bags hold none. The legacy migration's picker.
 */
export function bestBagToolIndex(
  inventory: readonly InvSlot[],
  professionId: GatheringProfessionId,
  items: Readonly<Record<string, ItemDef>>,
): number {
  let best = -1;
  let bestRank = 0;
  for (let i = 0; i < inventory.length; i++) {
    const def = items[inventory[i].itemId];
    if (gatherToolSlotFor(def) !== professionId) continue;
    const rank = gatherToolRank(def);
    if (rank > bestRank) {
      best = i;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Whether a freshly granted tool should take its slot on its own: the slot
 * is empty, or the new tool ranks strictly above the one equipped. The
 * displaced tool goes back to the bags. This keeps the convenience the bag
 * scan used to give (a better pick works the moment you get it) without
 * letting a bagged tool gather: an unequipped tool stays unequipped.
 */
export function grantTakesToolSlot(
  slots: GatherToolSlots | undefined,
  def: ItemDef | undefined,
  items: Readonly<Record<string, ItemDef>>,
): GatheringProfessionId | null {
  const slotId = gatherToolSlotFor(def);
  if (!slotId) return null;
  const current = slots?.[slotId];
  if (!current) return slotId;
  return gatherToolRank(def) > gatherToolRank(items[current.itemId]) ? slotId : null;
}

/**
 * Load a saved belt: keep each row whose item still exists and still equips
 * into that slot, as a count-1 copy with its payload bounded by the caller's
 * `sanitize` (the bags' own load bound). A row that fails is RETURNED in
 * `strays` rather than dropped, so the caller can put the copy back in the
 * bags instead of destroying an item. Non-object input loads as an empty belt.
 */
export function loadGatherToolSlots(
  raw: unknown,
  items: Readonly<Record<string, ItemDef>>,
  sanitize: (slot: InvSlot) => void,
): { slots: GatherToolSlots; strays: InvSlot[] } {
  const slots: GatherToolSlots = {};
  const strays: InvSlot[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { slots, strays };
  const rows = raw as Record<string, unknown>;
  for (const key of Object.keys(rows)) {
    const row = rows[key];
    if (!row || typeof row !== 'object' || typeof (row as InvSlot).itemId !== 'string') continue;
    const copy = toolSlotCopyOf(row as InvSlot);
    sanitize(copy);
    const def = items[copy.itemId];
    if (!def) continue;
    const slotId = gatherToolSlotFor(def);
    if (slotId && slotId === key && !slots[slotId]) slots[slotId] = copy;
    else strays.push(copy);
  }
  return { slots, strays };
}

/** The save form: a fresh clone per slot in fixed profession order. Always
 *  written (an empty belt saves as `{}`), because ABSENT is how a load tells
 *  a pre-belt save that still needs the migration below. */
export function savedGatherToolSlots(slots: GatherToolSlots | undefined): GatherToolSlots {
  const out: GatherToolSlots = {};
  if (!slots) return out;
  for (const id of GATHERING_PROFESSION_IDS) {
    const slot = slots[id];
    if (slot) out[id] = cloneInvSlot(slot);
  }
  return out;
}

/**
 * The one-time migration for a character saved before the belt existed:
 * for every slot, the best tool of that profession moves OUT of the bags
 * into the slot; a starter slot (STARTER_GATHER_TOOL_IDS) with no tool in
 * the bags is granted the basic one. Mutates `inventory` (one unit leaves a
 * stack) and returns the belt. Deterministic: bag order only, no rng.
 */
export function migrateLegacyGatherTools(
  inventory: InvSlot[],
  items: Readonly<Record<string, ItemDef>>,
): GatherToolSlots {
  const slots: GatherToolSlots = {};
  for (const id of GATHERING_PROFESSION_IDS) {
    const index = bestBagToolIndex(inventory, id, items);
    if (index >= 0) {
      slots[id] = toolSlotCopyOf(inventory[index]);
      if (inventory[index].count > 1) inventory[index].count -= 1;
      else inventory.splice(index, 1);
      continue;
    }
    const starter = STARTER_GATHER_TOOL_IDS[id];
    if (starter && items[starter]) slots[id] = { itemId: starter, count: 1 };
  }
  return slots;
}

/** A new character's belt: the basic tool in every starter slot. */
export function starterGatherToolSlots(items: Readonly<Record<string, ItemDef>>): GatherToolSlots {
  const slots: GatherToolSlots = {};
  for (const id of GATHERING_PROFESSION_IDS) {
    const starter = STARTER_GATHER_TOOL_IDS[id];
    if (starter && items[starter]) slots[id] = { itemId: starter, count: 1 };
  }
  return slots;
}
