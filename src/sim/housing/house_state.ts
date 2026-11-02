// Player housing (Project H): the per-character house ownership record and its
// save/load pair. A pure leaf (no SimContext, no rng, no clock): the purchase
// and entry rules live in ./ownership.ts.
//
// Ownership is PER CHARACTER and lives inside the character's own save blob,
// exactly like the bank vault (the anti-dupe rule: one blob, one owner, one
// write path). One house per character in phase 1.
//
// Persisted shape (CharacterState.house): absent for every character who has
// never bought a house, so their saves stay byte-equal (zero-default omission).
// The lot id is a persisted key (src/sim/content/house_lots.ts HOUSE_LOT_IDS).

import { HOUSE_LOT_IDS } from '../content/house_lots';

/** Live ownership on PlayerMeta.house. */
export interface HouseOwnership {
  /** The owned lot's stable id. */
  lot: string;
  /** The realm reset-day key when the house was bought ('' on a clockless
   *  host). Recorded for the weekly-upkeep phase; never read as a clock here. */
  boughtDay: string;
}

/** The housing fields PlayerMeta carries (joined through the storage
 *  boundary's CharacterVaultStorageState, character_storage.ts). */
export interface HousingPlayerState {
  /** The owned house, persisted; absent = no house. */
  house?: HouseOwnership;
  /** Runtime-only: sim time of the last door prompt (the walk-in trigger
   *  fires at 20 Hz, so the offer is throttled). Never persisted. */
  houseOfferAt?: number;
}

/** The persisted form (CharacterState.house). */
export interface SavedHouseState {
  lot: string;
  /** Omitted when empty (a clockless host's purchase). */
  boughtDay?: string;
}

export function savedHouseState(house: HouseOwnership): SavedHouseState {
  return house.boughtDay ? { lot: house.lot, boughtDay: house.boughtDay } : { lot: house.lot };
}

/**
 * The one load path. Anything that is not a record naming a live lot loads as
 * "no house": lot ids are never retired by reuse (see house_lots.ts), so an
 * unknown id can only be a corrupt or hand-edited blob. A non-string boughtDay
 * loads as ''.
 */
export function sanitizeHouseState(raw: unknown): HouseOwnership | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const lot = record.lot;
  if (typeof lot !== 'string' || !HOUSE_LOT_IDS.has(lot)) return undefined;
  const boughtDay = typeof record.boughtDay === 'string' ? record.boughtDay : '';
  return { lot, boughtDay };
}
