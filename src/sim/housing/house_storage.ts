// Player housing (Project H), phase 3: the pooled house storage behind the
// placed storage chests. A system module behind the SimContext seam (functions
// only; state on PlayerMeta.house.storage, housing/house_state.ts, loaded by
// housing/house_storage_state.ts). Draws NO rng and reads no clock.
//
// The model is the personal bank's (src/sim/bank.ts) with the chest count as
// its only capacity input: every placed `furn_storage_chest` adds
// HOUSE_CHEST_SLOTS to ONE pooled slot list (never one list per chest, so a
// chest can be moved between anchors without emptying it), and the owner
// reaches it while standing INSIDE their own house copy within
// HOUSE_STORAGE_RANGE of any placed chest entity (the bank's nearBanker gate,
// applied to the chest objects furniture_objects.ts stands). Deposit and
// withdraw reuse the bank's container-agnostic moveBetweenContainers, so
// stacking, instanced copies and the crafted-provenance marker behave exactly
// as they do at the bank. Taking a chest back is REFUSED while the remaining
// capacity would fall below the occupied slot count (storageRemovalBlocked,
// consulted by furnishing.ts removeFurniture): nothing stored is ever
// destroyed or spilled.
//
// Every outcome is a personal, text-free SimEvent (houseDenied with an
// appended reason; the client localizes from the ids). The owner snapshot is
// revision-gated like the bank's: houseStorageWireRevFor is null away from a
// chest and PlayerMeta.houseStorageRev beside one, bumped by every write a
// houseStorageFor projection can observe (bumpHouseStorageRev).

import { bagPools, bagsFullError } from '../bags';
import { moveBetweenContainers } from '../bank';
import { HOUSE_STORAGE_CHEST_ITEM_ID } from '../content/furniture';
import { ITEMS } from '../data';
import { isItemLocked } from '../item_lock_flag';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import {
  cloneInvSlot,
  dist2d,
  type Entity,
  INTERACT_RANGE,
  type InvSlot,
  type SimEvent,
} from '../types';
import { ownHouseInstanceAt } from './furnishing';
import { furnitureTemplateId } from './furniture_template';
import {
  bumpHouseStorageRev,
  houseChestCount,
  houseStorageCapacity,
  houseStoragePools,
} from './house_storage_state';

export {
  bumpHouseStorageRev,
  HOUSE_CHEST_SLOTS,
  houseChestCount,
  houseStorageCapacity,
  houseStoragePools,
  storageRemovalBlocked,
} from './house_storage_state';

/** How close to a placed chest the owner must stand to use the storage
 *  (yards): the banker's reach (bank.ts BANKER_RANGE), inclusive. */
export const HOUSE_STORAGE_RANGE = INTERACT_RANGE + 2;

/** The client-facing view of the house storage (IWorldHousing.houseStorage):
 *  null while unreachable; boundary clones, never live sim slots. */
export interface HouseStorageView {
  slots: InvSlot[];
  /** chests placed x HOUSE_CHEST_SLOTS (a display total AND the fit budget:
   *  one general pool, no sockets). */
  capacity: number;
  chests: number;
}

type StorageDenyReason = Extract<SimEvent, { type: 'houseDenied' }>['reason'];

function deny(ctx: SimContext, meta: PlayerMeta, reason: StorageDenyReason): false {
  ctx.emit({ type: 'houseDenied', pid: meta.entityId, lotId: meta.house?.lot ?? '', reason });
  return false;
}

const CHEST_TEMPLATE_ID = furnitureTemplateId(HOUSE_STORAGE_CHEST_ITEM_ID);

/** True for a placed storage chest entity. */
export function isHouseChestEntity(e: Entity): boolean {
  return e.kind === 'object' && e.templateId === CHEST_TEMPLATE_ID;
}

/** True while the player stands inside their own house copy within
 *  HOUSE_STORAGE_RANGE of a placed chest entity (the nearBanker gate). Walks
 *  the claim's object ledger, bounded by the cottage's anchor count. */
export function nearHouseChest(ctx: SimContext, meta: PlayerMeta, e: Entity): boolean {
  const inst = ownHouseInstanceAt(ctx, meta, e.pos);
  if (!inst) return false;
  for (const id of inst.objectIds) {
    const obj = ctx.entities.get(id);
    if (obj && isHouseChestEntity(obj) && dist2d(e.pos, obj.pos) <= HOUSE_STORAGE_RANGE)
      return true;
  }
  return false;
}

/** The house storage view for `pid`, or null away from a chest (both worlds
 *  read it through IWorldHousing.houseStorage). */
export function houseStorageFor(ctx: SimContext, pid: number): HouseStorageView | null {
  const r = ctx.resolve(pid);
  if (!r || !r.meta.house || r.e.dead || !nearHouseChest(ctx, r.meta, r.e)) return null;
  const house = r.meta.house;
  return {
    slots: house.storage.map(cloneInvSlot),
    capacity: houseStorageCapacity(house),
    chests: houseChestCount(house),
  };
}

/** Cheap proximity plus revision signature for the owner-only `hst` wire key
 *  (bank.ts bankInfoWireRevFor's twin): null unless the view would be non-null,
 *  so a null-vs-number flip re-emits on reach gained or lost and the rev covers
 *  every mutation between. */
export function houseStorageWireRevFor(ctx: SimContext, pid: number): number | null {
  const r = ctx.resolve(pid);
  if (!r || !r.meta.house || r.e.dead || !nearHouseChest(ctx, r.meta, r.e)) return null;
  return r.meta.houseStorageRev;
}

/**
 * The interact arm (interaction.ts): a press on a placed chest entity, or with
 * one in reach, opens the owner's house storage window through the text-free
 * houseStorage event. Returns whether the press was consumed.
 */
export function tryOpenHouseStorage(
  ctx: SimContext,
  meta: PlayerMeta,
  e: Entity,
  target: Entity | null,
): boolean {
  if (target !== null && !isHouseChestEntity(target)) return false;
  if (!nearHouseChest(ctx, meta, e)) return false;
  ctx.emit({ type: 'houseStorage', pid: meta.entityId });
  return true;
}

/**
 * Deposit the carried slot `slotIndex` (the whole stack) into the house
 * storage. Refused away from a chest, for a quest item, borrowed gear or a
 * locked copy, and when the pooled capacity cannot take it. Returns whether
 * anything moved.
 */
export function houseStorageDeposit(ctx: SimContext, slotIndex: number, pid?: number): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  const { meta, e } = r;
  if (!meta.house) return deny(ctx, meta, 'no_house');
  if (e.dead || e.ghost) return deny(ctx, meta, 'dead');
  if (!nearHouseChest(ctx, meta, e)) return deny(ctx, meta, 'storage_far');
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= meta.inventory.length) {
    return false;
  }
  const slot = meta.inventory[slotIndex];
  const def = ITEMS[slot.itemId];
  if (def?.kind === 'quest' || def?.lentGear || isItemLocked(slot.instance)) {
    return deny(ctx, meta, 'storage_item');
  }
  const result = moveBetweenContainers(
    meta.inventory,
    slotIndex,
    undefined,
    meta.house.storage,
    houseStoragePools(meta.house),
  );
  if (result.refusal === 'no_fit') return deny(ctx, meta, 'storage_full');
  if (result.refusal) return false; // 'invalid': malformed input, no player line
  bumpHouseStorageRev(meta);
  ctx.onInventoryChangedForQuests(meta);
  return true;
}

/**
 * Withdraw storage slot `slotIndex` (the whole stack) back into the bags: the
 * mirror of the deposit, gated by the bag capacity (the bags-full line is the
 * shared bank one, re-localized by the client matcher).
 */
export function houseStorageWithdraw(ctx: SimContext, slotIndex: number, pid?: number): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  const { meta, e } = r;
  if (!meta.house) return deny(ctx, meta, 'no_house');
  if (e.dead || e.ghost) return deny(ctx, meta, 'dead');
  if (!nearHouseChest(ctx, meta, e)) return deny(ctx, meta, 'storage_far');
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= meta.house.storage.length) {
    return false;
  }
  const result = moveBetweenContainers(
    meta.house.storage,
    slotIndex,
    undefined,
    meta.inventory,
    bagPools(meta.bags),
  );
  if (result.refusal === 'no_fit') {
    bagsFullError(ctx, meta.entityId);
    return false;
  }
  if (result.refusal) return false;
  bumpHouseStorageRev(meta);
  ctx.onInventoryChangedForQuests(meta);
  return true;
}
