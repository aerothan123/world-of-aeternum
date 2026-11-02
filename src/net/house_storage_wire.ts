// Player housing (Project H), phase 3: the `hst` self-delta decoder (the pooled
// house storage, IWorldHousing.houseStorage). DOM-free and ClientWorld-free,
// the wire-decode sibling idiom: every field is re-validated and a malformed
// frame RETAINS the last valid mirror (the `bank` key's policy, since both
// render owned stacks and a half record would put undefined in a cell).
//
// Delta contract: the key is omitted when unchanged; the CALLER keeps the prior
// mirror on omission and only calls this for a present key. An explicit null is
// "out of reach" (the proximity gate closed).

import { HOUSE_COTTAGE_ANCHORS } from '../sim/housing/cottage_layout';
import { HOUSE_CHEST_SLOTS } from '../sim/housing/house_storage_state';
import type { HouseStorageView } from '../world_api';
import { isRecord, isWireBankSlot } from './vault_snapshot_wire';

const KEYS: ReadonlySet<string> = new Set(['slots', 'capacity', 'chests']);

/** Every anchor can hold a chest, so the chest count is bounded by content. */
const MAX_CHESTS = HOUSE_COTTAGE_ANCHORS.length;

/** `undefined` for a malformed frame (retain), null for the explicit gate
 *  closure, else the adopted view. */
export function decodeHouseStorageWire(raw: unknown): HouseStorageView | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw) || Object.keys(raw).some((key) => !KEYS.has(key))) return undefined;
  const { slots, capacity, chests } = raw;
  if (!Array.isArray(slots) || !slots.every(isWireBankSlot)) return undefined;
  if (
    typeof chests !== 'number' ||
    !Number.isSafeInteger(chests) ||
    chests < 0 ||
    chests > MAX_CHESTS ||
    capacity !== chests * HOUSE_CHEST_SLOTS
  ) {
    return undefined;
  }
  return { slots, capacity, chests };
}

/** Apply one present `hst` key onto the mirror: malformed RETAINS the last
 *  valid view, explicit null closes it (the caller skips an omitted key). */
export function applyHouseStorageWire(
  target: { houseStorage: HouseStorageView | null },
  raw: unknown,
): void {
  const decoded = decodeHouseStorageWire(raw);
  if (decoded !== undefined) target.houseStorage = decoded;
}
