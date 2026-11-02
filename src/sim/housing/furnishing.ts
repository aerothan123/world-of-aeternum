// Player housing (Project H), phase 2: placing furniture on the anchors of
// your own house and taking it back. A system module behind the SimContext
// seam (functions only; state on PlayerMeta.house.furniture,
// housing/house_state.ts). Draws NO rng and reads no clock.
//
// Server-authoritative rules, in deny order: the caller owns a house, stands
// INSIDE their own copy of it (the claimed instance keyed on them,
// ownership.ts houseInstanceKey), names a live anchor, the anchor is free (or,
// for a removal, occupied), the bag slot holds a furniture item whose kind
// fits the anchor, and a removal has bag room for the piece. The spend takes
// EXACTLY the named bag copy (item_copy_ref.ts: a locked copy refuses even
// when a spare exists), the feast placement's rule. Phase 3: taking back a
// storage chest is refused while the storage would no longer fit
// (house_storage_state.ts storageRemovalBlocked), and every placement change
// bumps the storage wire revision, since the chest count is the capacity.
//
// Every outcome is a personal, text-free SimEvent (houseDenied with an
// appended reason, or houseFurniture); the client localizes from the ids.
// Each successful change re-projects the claim's furniture entities
// (furniture_objects.ts) so the owner sees it at once.

import { furnitureDefFor } from '../content/furniture';
import { houseLotForDungeon } from '../content/house_lots';
import { instanceAt, instanceOriginOf } from '../instances/dungeons';
import { consumeSelectedInventorySlot, selectedInventorySlot } from '../item_copy_ref';
import { isItemLocked } from '../item_lock_flag';
import type { InstanceSlot, PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { SimEvent } from '../types';
import { houseAnchorById } from './cottage_layout';
import { spawnHouseFurniture } from './furniture_objects';
import { bumpHouseStorageRev, storageRemovalBlocked } from './house_storage_state';
import { houseInstanceKey } from './ownership';

type FurnitureDenyReason = Extract<SimEvent, { type: 'houseDenied' }>['reason'];

function deny(
  ctx: SimContext,
  meta: PlayerMeta,
  reason: FurnitureDenyReason,
  anchorId: string,
): false {
  ctx.emit({
    type: 'houseDenied',
    pid: meta.entityId,
    lotId: meta.house?.lot ?? '',
    reason,
    anchorId,
  });
  return false;
}

/** The claimed instance slot that is `meta`'s own house copy and holds `pos`,
 *  or null when the player stands anywhere else (outside, in a real dungeon,
 *  in another owner's copy through the dev bypass). */
export function ownHouseInstanceAt(
  ctx: SimContext,
  meta: PlayerMeta,
  pos: { x: number; y: number; z: number },
): InstanceSlot | null {
  if (!meta.house) return null;
  const inst = instanceAt(ctx, pos);
  if (!inst || inst.partyKey !== houseInstanceKey(meta)) return null;
  if (houseLotForDungeon(inst.dungeonId)?.id !== meta.house.lot) return null;
  return inst;
}

/**
 * Place the furniture copy in bag slot `slot` on anchor `anchorId` of the
 * caller's own house. Returns whether the placement went through.
 */
export function placeFurniture(
  ctx: SimContext,
  anchorId: string,
  slot: number,
  pid?: number,
): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  const { meta } = r;
  if (!meta.house) return deny(ctx, meta, 'no_house', anchorId);
  if (r.e.dead || r.e.ghost) return deny(ctx, meta, 'dead', anchorId);
  const inst = ownHouseInstanceAt(ctx, meta, r.e.pos);
  if (!inst) return deny(ctx, meta, 'not_inside', anchorId);
  const anchor = houseAnchorById(anchorId);
  if (!anchor) return deny(ctx, meta, 'bad_anchor', anchorId);
  if (meta.house.furniture[anchor.id] !== undefined) {
    return deny(ctx, meta, 'anchor_taken', anchorId);
  }
  const held =
    Number.isInteger(slot) && slot >= 0 && slot < meta.inventory.length
      ? meta.inventory[slot]
      : undefined;
  const def = furnitureDefFor(held?.itemId);
  if (!held || !def) return deny(ctx, meta, 'no_item', anchorId);
  if (def.kind !== anchor.kind) return deny(ctx, meta, 'anchor_kind', anchorId);
  // The named-copy resolve: the exact clicked copy, refused when locked.
  const selected = selectedInventorySlot(meta.inventory, def.itemId, slot);
  if (selected === null || selected === undefined || isItemLocked(selected.instance)) {
    return deny(ctx, meta, 'no_item', anchorId);
  }
  if (!consumeSelectedInventorySlot(meta.inventory, def.itemId, slot)) {
    return deny(ctx, meta, 'no_item', anchorId);
  }
  ctx.onInventoryChangedForQuests?.(meta);
  meta.house.furniture[anchor.id] = def.itemId;
  bumpHouseStorageRev(meta);
  spawnHouseFurniture(ctx, inst, instanceOriginOf(inst), meta.house);
  ctx.emit({
    type: 'houseFurniture',
    pid: meta.entityId,
    action: 'placed',
    anchorId: anchor.id,
    itemId: def.itemId,
  });
  return true;
}

/**
 * Take the furniture standing on anchor `anchorId` of the caller's own house
 * back into the bags. Refuses when the bags cannot take it (the piece stays
 * placed; nothing is ever destroyed). Returns whether the removal went through.
 */
export function removeFurniture(ctx: SimContext, anchorId: string, pid?: number): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  const { meta } = r;
  if (!meta.house) return deny(ctx, meta, 'no_house', anchorId);
  if (r.e.dead || r.e.ghost) return deny(ctx, meta, 'dead', anchorId);
  const inst = ownHouseInstanceAt(ctx, meta, r.e.pos);
  if (!inst) return deny(ctx, meta, 'not_inside', anchorId);
  const anchor = houseAnchorById(anchorId);
  if (!anchor) return deny(ctx, meta, 'bad_anchor', anchorId);
  const itemId = meta.house.furniture[anchor.id];
  if (itemId === undefined) return deny(ctx, meta, 'anchor_empty', anchorId);
  if (storageRemovalBlocked(meta.house, anchor.id)) {
    return deny(ctx, meta, 'storage_in_use', anchorId);
  }
  if (!ctx.canAddItem(itemId, 1, meta.entityId)) return deny(ctx, meta, 'bags_full', anchorId);
  delete meta.house.furniture[anchor.id];
  bumpHouseStorageRev(meta);
  spawnHouseFurniture(ctx, inst, instanceOriginOf(inst), meta.house);
  // A movement grant: the piece is the owner's own copy coming back, never a
  // world-sourced acquisition (no Reliquary tally, no fresh-quality roll).
  ctx.addItem(itemId, 1, meta.entityId, { silent: true, movement: true });
  ctx.emit({
    type: 'houseFurniture',
    pid: meta.entityId,
    action: 'removed',
    anchorId: anchor.id,
    itemId,
  });
  return true;
}
