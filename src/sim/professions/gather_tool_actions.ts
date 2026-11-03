// The tool belt's COMMAND BODIES behind the SimContext seam: equip a tool from
// the bags into its gathering slot, unequip it back, the grant-time auto-fill,
// and the load (new-character starter belt, pre-belt migration, saved belt).
// Every decision about WHICH slot and WHICH tool lives in the pure leaf
// gather_tool_slots.ts; this module only applies it. Draws no rng anywhere.
//
// A tool swap is refused while a gather, chop or fishing cast is running
// ("You are busy."), so the tier a cast started with is the tier it finishes
// with: the belt cannot be swapped mid-swing to dodge a gate or the R47 price
// capture.

import { bagsFullError } from '../bags';
import type { CharacterState } from '../character_state';
import type { GatheringProfessionId } from '../content/professions';
import { ITEMS } from '../data';
import { selectedInventorySlot } from '../item_copy_ref';
import { sanitizeSlotInstanceOnLoad, warnDroppedInstanceKeys } from '../item_instance_load';
import { canReturnEquippedItemToBags, returnEquippedItemToBags } from '../items';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import {
  type Entity,
  FISHING_CAST_ID,
  GATHER_CAST_ID,
  type InvSlot,
  type ItemInstancePayload,
  TREE_CHOP_CAST_ID,
} from '../types';
import {
  gatherToolSlotFor,
  grantTakesToolSlot,
  loadGatherToolSlots,
  migrateLegacyGatherTools,
  starterGatherToolSlots,
  toolSlotCopyOf,
} from './gather_tool_slots';

/** Whether a belt change must wait: a gather, chop or fishing cast is live. */
export function gatherToolSwapBusy(p: Entity): boolean {
  const cast = p.castingAbility;
  return cast === GATHER_CAST_ID || cast === TREE_CHOP_CAST_ID || cast === FISHING_CAST_ID;
}

/** The payload a slotted copy returns to the bags with (its instance plus a
 *  plain-crafted recipe marker), in the shape items.ts's bag-return reads. */
function returnPayloadOf(slot: InvSlot): ItemInstancePayload | undefined {
  if (!slot.instance && slot.craftedRecipeId === undefined) return undefined;
  return {
    ...(slot.instance ?? {}),
    ...(slot.craftedRecipeId === undefined ? {} : { craftedRecipeId: slot.craftedRecipeId }),
  };
}

/**
 * Seat one copy of the bag stack at `index` in `slotId`. A tool already in
 * the slot trades places with it: into the same bag cell (cell hint
 * included) when the stack was a single copy, else back to the bags through
 * the ordinary fit gate. False, with nothing changed, when that fit fails.
 */
function seatToolFromBags(meta: PlayerMeta, index: number, slotId: GatheringProfessionId): boolean {
  const slots = meta.gatherTools ?? {};
  const stack = meta.inventory[index];
  const old = slots[slotId];
  const oldPayload = old ? returnPayloadOf(old) : undefined;
  if (old && stack.count > 1 && !canReturnEquippedItemToBags(meta, old.itemId, oldPayload))
    return false;
  slots[slotId] = toolSlotCopyOf(stack);
  if (stack.count > 1) {
    stack.count -= 1;
    if (old) returnEquippedItemToBags(meta, old.itemId, oldPayload);
  } else if (old) {
    meta.inventory[index] = { ...old, ...(stack.slot === undefined ? {} : { slot: stack.slot }) };
  } else {
    meta.inventory.splice(index, 1);
  }
  meta.gatherTools = slots;
  return true;
}

/**
 * Move one copy of `itemId` from the bags into its tool slot (the named bag
 * cell when `slotIndex` is given, else the first copy), swapping out any
 * tool already there (seatToolFromBags). Returns false when the item is not a
 * gathering tool, so the caller's own arm runs.
 */
export function equipGatherTool(
  ctx: SimContext,
  meta: PlayerMeta,
  p: Entity,
  itemId: string,
  slotIndex?: number,
): boolean {
  const def = ITEMS[itemId];
  const slotId = gatherToolSlotFor(def);
  if (!def || !slotId) return false;
  const named = selectedInventorySlot(meta.inventory, itemId, slotIndex);
  const index =
    named === null
      ? -1
      : named === undefined
        ? meta.inventory.findIndex((s) => s.itemId === itemId && s.count > 0)
        : (slotIndex as number);
  if (index < 0) {
    ctx.error(meta.entityId, "You don't have that item.");
    return true;
  }
  if (gatherToolSwapBusy(p)) {
    ctx.error(meta.entityId, 'You are busy.');
    return true;
  }
  if (!seatToolFromBags(meta, index, slotId)) {
    bagsFullError(ctx, meta.entityId);
    return true;
  }
  ctx.onInventoryChangedForQuests(meta);
  ctx.emit({ type: 'log', text: `Equipped ${def.name}.`, color: '#8f8', pid: meta.entityId });
  return true;
}

/** Return the tool in `professionId`'s slot to the bags (refused when the
 *  bags have no room, or mid gather cast). True when the slot emptied. */
export function unequipGatherTool(
  ctx: SimContext,
  professionId: GatheringProfessionId,
  pid?: number,
): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  const { meta, e: p } = r;
  const slot = meta.gatherTools?.[professionId];
  if (!slot) return false;
  if (gatherToolSwapBusy(p)) {
    ctx.error(meta.entityId, 'You are busy.');
    return false;
  }
  const payload = returnPayloadOf(slot);
  if (!canReturnEquippedItemToBags(meta, slot.itemId, payload)) {
    bagsFullError(ctx, meta.entityId);
    return false;
  }
  delete meta.gatherTools?.[professionId];
  returnEquippedItemToBags(meta, slot.itemId, payload);
  ctx.onInventoryChangedForQuests(meta);
  const name = ITEMS[slot.itemId]?.name ?? slot.itemId;
  ctx.emit({ type: 'log', text: `Unequipped ${name}.`, color: '#8f8', pid: meta.entityId });
  return true;
}

/**
 * The grant hook (Sim.addItem / addItemInstance): a tool that just landed in
 * the bags takes its slot when the slot is empty or the new tool ranks above
 * the equipped one (gather_tool_slots.ts grantTakesToolSlot). Silent: the
 * grant already logged its receipt. The newest copy is the one granted.
 */
export function autoFillGatherToolSlot(ctx: SimContext, meta: PlayerMeta, itemId: string): void {
  if (!grantTakesToolSlot(meta.gatherTools, ITEMS[itemId], ITEMS)) return;
  const e = ctx.entities.get(meta.entityId);
  if (!e || gatherToolSwapBusy(e)) return;
  let index = -1;
  for (let i = meta.inventory.length - 1; i >= 0; i--) {
    if (meta.inventory[i].itemId === itemId) {
      index = i;
      break;
    }
  }
  if (index < 0) return;
  const slotId = gatherToolSlotFor(ITEMS[itemId]);
  if (!slotId) return;
  seatToolFromBags(meta, index, slotId);
}

/**
 * The belt at join (Sim.addPlayer, after the bags have loaded): a NEW
 * character gets the starter belt; a save from before the belt existed (no
 * `gatherTools` key) migrates its best bagged tool per profession into the
 * slots and is granted the basic tool where it has none; a belt save loads
 * through the bags' payload bound, and any row that no longer fits its slot
 * goes back to the bags rather than vanishing.
 */
export function loadGatherToolBelt(meta: PlayerMeta, saved: CharacterState | undefined): void {
  if (!saved) {
    meta.gatherTools = starterGatherToolSlots(ITEMS);
    return;
  }
  if (saved.gatherTools === undefined) {
    meta.gatherTools = migrateLegacyGatherTools(meta.inventory, ITEMS);
    return;
  }
  const dropped: string[] = [];
  const { slots, strays } = loadGatherToolSlots(saved.gatherTools, ITEMS, (slot) =>
    sanitizeSlotInstanceOnLoad(slot, dropped, 'tool'),
  );
  meta.gatherTools = slots;
  for (const stray of strays) meta.inventory.push(stray);
  warnDroppedInstanceKeys(meta.name, dropped);
}

/**
 * A tool-upgrade recipe consumes the previous tool (the hoe, pick, axe,
 * sickle and rod ladders), and that tool is usually the one EQUIPPED. When a
 * craft's admission refuses, the craft start lends each such reagent from the
 * belt back to the bags (only where the bags hold too few of it and have room)
 * and asks again; `undo` puts the lent tools back if the second ask refuses
 * too, so a denied craft leaves the belt exactly as it was. Draw-free.
 */
export function lendBeltToolsForReagents(
  ctx: SimContext,
  meta: PlayerMeta,
  reagents: readonly { itemId: string; count: number }[],
): { undo(): void } | null {
  const lent: GatheringProfessionId[] = [];
  for (const reagent of reagents) {
    const slotId = gatherToolSlotFor(ITEMS[reagent.itemId]);
    const slot = slotId ? meta.gatherTools?.[slotId] : undefined;
    if (!slotId || !slot || slot.itemId !== reagent.itemId) continue;
    if (ctx.countItem(reagent.itemId, meta.entityId) >= reagent.count) continue;
    const payload = returnPayloadOf(slot);
    if (!canReturnEquippedItemToBags(meta, slot.itemId, payload)) continue;
    delete meta.gatherTools?.[slotId];
    returnEquippedItemToBags(meta, slot.itemId, payload);
    lent.push(slotId);
  }
  if (lent.length === 0) return null;
  return {
    undo() {
      for (const slotId of lent) {
        const itemId = reagents.find((r) => gatherToolSlotFor(ITEMS[r.itemId]) === slotId)?.itemId;
        if (!itemId) continue;
        const index = meta.inventory.map((s) => s.itemId).lastIndexOf(itemId);
        if (index >= 0) seatToolFromBags(meta, index, slotId);
      }
    },
  };
}
