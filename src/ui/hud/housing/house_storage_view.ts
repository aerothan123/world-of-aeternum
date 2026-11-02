// Player housing (Project H), phase 3: the pure view behind the house storage
// window. DOM-free (UI_PURE_CORES): maps the proximity-gated
// IWorldHousing.houseStorage mirror plus the carried bags to the render model
// the thin painter (house_storage_window.ts) draws with the bank family's item
// cell. Slot order and indices are preserved verbatim: `slotIndex` is the
// exact wire argument for houseStorageDeposit (a bag index) and
// houseStorageWithdraw (a storage index).

import { ITEMS } from '../../../sim/data';
import { isItemLocked } from '../../../sim/item_lock_flag';
import type { InvSlot } from '../../../sim/types';
import type { HouseStorageView } from '../../../world_api';
import { bagQualityKey } from '../../bags_view';
import type { BankSlotModel } from '../../bank_view';
import { knownItemDef } from '../../known_item';

/** One carried cell of the deposit grid: the bank cell plus whether the sim
 *  would take it (the deposit rule in src/sim/housing/house_storage.ts: a
 *  quest item, borrowed gear or a locked copy is refused). */
export interface HouseStorageCarriedModel extends BankSlotModel {
  allowed: boolean;
}

export type HouseStorageModel =
  | { kind: 'away' }
  | {
      kind: 'storage';
      /** Stored stacks, withdrawable by click. */
      stored: BankSlotModel[];
      /** Carried stacks, depositable by click. */
      carried: HouseStorageCarriedModel[];
      used: number;
      total: number;
      chests: number;
      emptyCells: number;
      full: boolean;
    };

function cell(slot: InvSlot, slotIndex: number): BankSlotModel {
  return {
    slotIndex,
    itemId: slot.itemId,
    count: slot.count,
    showCount: slot.count > 1,
    qualityKey: bagQualityKey(knownItemDef(ITEMS, slot.itemId) ?? {}, slot.instance),
    instance: slot.instance,
    ...(slot.materialSources === undefined ? {} : { materialSources: slot.materialSources }),
  };
}

/** The sim's deposit admission, mirrored for the affordance (the server
 *  re-validates on the command). */
export function houseStorageDepositAllowed(slot: InvSlot): boolean {
  const def = ITEMS[slot.itemId];
  return def?.kind !== 'quest' && !def?.lentGear && !isItemLocked(slot.instance);
}

export function buildHouseStorageView(
  storage: HouseStorageView | null,
  inventory: readonly InvSlot[],
): HouseStorageModel {
  if (!storage) return { kind: 'away' };
  const used = storage.slots.length;
  return {
    kind: 'storage',
    stored: storage.slots.map(cell),
    carried: inventory.map((slot, slotIndex) => ({
      ...cell(slot, slotIndex),
      allowed: houseStorageDepositAllowed(slot),
    })),
    used,
    total: storage.capacity,
    chests: storage.chests,
    emptyCells: Math.max(0, storage.capacity - used),
    full: used >= storage.capacity,
  };
}

/** The cheap change signature the cold window repaints on (slot ids, counts
 *  and payload identity on both grids, plus the capacity). */
export function houseStorageSignature(
  storage: HouseStorageView | null,
  inventory: readonly InvSlot[],
): string {
  if (!storage) return 'away';
  return JSON.stringify([storage.capacity, storage.slots, inventory]);
}
