// Player housing (Project H), phase 3: the pooled house storage's persisted
// slot list and its ONE load path. A pure leaf (no SimContext, no rng, no
// clock), the bank's sanitizeBankState inventory arm applied to the sparse
// `storage` row of CharacterState.house (housing/house_state.ts). The storage
// lives INSIDE the character save blob like the bank (one blob, one owner, one
// write path: the anti-dupe rule), and is OMITTED when empty, so every phase-2
// save stays byte-equal.
//
// Load doctrine (the bank's, restated): items are NEVER destroyed. An
// unknown-but-string item id stays as dormant recoverable data; a row that is
// not a record, or carries no string id, is skipped; every row's instance
// payload takes the shared load bound (item_instance_load.ts: junk KEYS drop,
// the row never does), and the count is clamped by the shared tamper ceiling
// (bags.ts instancedCountCap). Over-capacity lists are tolerated (a chest taken
// back while the list was fuller is refused, never truncated; see
// house_storage.ts storageRemovalBlocked).

import { type PoolCapacity, poolCapacityOf } from '../bag_pools';
import { instancedCountCap } from '../bags';
import { HOUSE_STORAGE_CHEST_ITEM_ID } from '../content/furniture';
import { ITEMS } from '../data';
import {
  boundCraftedRecipeIdOnLoad,
  sanitizeItemInstancePayloadOnLoad,
} from '../item_instance_load';
import {
  normalizeLoadedMaterialSlot,
  preservesMaterialCountOnLoad,
  savedMaterialSlot,
  validateMaterialSlotSourcesOnLoad,
} from '../material_slot_load';
import { cloneInvSlot, type InvSlot } from '../types';

/** The slots one placed storage chest adds to the pooled house storage. */
export const HOUSE_CHEST_SLOTS = 12;

/** The two fields of the live house record the capacity math reads
 *  (housing/house_state.ts HouseOwnership, named structurally so this leaf
 *  never imports the record module). */
export interface HouseStorageShape {
  furniture: Record<string, string>;
  storage: InvSlot[];
}

/** How many storage chests stand on the house's anchors. */
export function houseChestCount(house: Pick<HouseStorageShape, 'furniture'>): number {
  let chests = 0;
  for (const itemId of Object.values(house.furniture)) {
    if (itemId === HOUSE_STORAGE_CHEST_ITEM_ID) chests++;
  }
  return chests;
}

export function houseStorageCapacity(house: Pick<HouseStorageShape, 'furniture'>): number {
  return houseChestCount(house) * HOUSE_CHEST_SLOTS;
}

/** The storage's pool split: one general pool (no sockets), so every item
 *  kind the bags allow fits, materials included. */
export function houseStoragePools(house: Pick<HouseStorageShape, 'furniture'>): PoolCapacity {
  return poolCapacityOf(houseStorageCapacity(house), []);
}

/** True when taking back the piece on `anchorId` would leave fewer slots than
 *  the storage holds: the removal is refused (nothing stored is spilled). A
 *  non-chest anchor never blocks. */
export function storageRemovalBlocked(house: HouseStorageShape, anchorId: string): boolean {
  if (house.furniture[anchorId] !== HOUSE_STORAGE_CHEST_ITEM_ID) return false;
  return houseStorageCapacity(house) - HOUSE_CHEST_SLOTS < house.storage.length;
}

/** Bump the runtime-only change signal for the owner-only `hst` wire key
 *  (bank.ts bumpBankWireRev's twin). */
export function bumpHouseStorageRev(meta: { houseStorageRev: number }): void {
  meta.houseStorageRev++;
}

/**
 * The one load path for the house storage list. `dropped` collects the
 * dev-channel names of every payload key the load bound removed (the caller
 * logs them beside the furniture drops; never player text).
 */
export function sanitizeHouseStorage(raw: unknown, dropped?: string[]): InvSlot[] {
  const storage: InvSlot[] = [];
  if (!Array.isArray(raw)) return storage;
  const drops: string[] = dropped ?? [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as {
      itemId?: unknown;
      count?: unknown;
      instance?: unknown;
      craftedRecipeId?: unknown;
      materialSources?: InvSlot['materialSources'];
      materialSeparated?: true;
    };
    if (typeof e.itemId !== 'string' || e.itemId === '') continue;
    validateMaterialSlotSourcesOnLoad(e);
    const hasInstance = !!e.instance && typeof e.instance === 'object';
    const rawMarker: { itemId: string; craftedRecipeId?: unknown } = {
      itemId: e.itemId,
      craftedRecipeId: e.craftedRecipeId,
    };
    boundCraftedRecipeIdOnLoad(rawMarker, drops, 'house');
    const craftedRecipeId = rawMarker.craftedRecipeId as string | undefined;
    const instance = hasInstance ? (e.instance as InvSlot['instance']) : undefined;
    const cap = preservesMaterialCountOnLoad({
      itemId: e.itemId,
      materialSources: e.materialSources,
      instance,
    })
      ? Number.MAX_SAFE_INTEGER
      : instancedCountCap(ITEMS[e.itemId], instance);
    const count = Math.min(cap, Math.max(1, Math.floor(Number(e.count)) || 1));
    const slot: InvSlot = instance
      ? { itemId: e.itemId, count, instance }
      : { itemId: e.itemId, count };
    if (craftedRecipeId !== undefined) slot.craftedRecipeId = craftedRecipeId;
    if (e.materialSources !== undefined) slot.materialSources = e.materialSources;
    if (e.materialSeparated === true) slot.materialSeparated = true;
    const cleaned = cloneInvSlot(slot);
    if (cleaned.instance) {
      const bound = sanitizeItemInstancePayloadOnLoad(cleaned.instance);
      for (const d of bound.dropped) drops.push(`house.${cleaned.itemId}.${d}`);
      if (bound.payload) cleaned.instance = bound.payload;
      else delete cleaned.instance;
    }
    storage.push(normalizeLoadedMaterialSlot(cleaned));
  }
  return storage;
}

/** The persisted form of the storage list (boundary copies, the bank's
 *  savedBankState inventory arm). */
export function savedHouseStorage(storage: readonly InvSlot[]): InvSlot[] {
  return storage.map(savedMaterialSlot);
}
