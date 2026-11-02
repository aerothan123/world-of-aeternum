// Player housing (Project H): the per-character house ownership record and its
// save/load pair. A pure leaf (no SimContext, no rng, no clock): the purchase
// and entry rules live in ./ownership.ts, the furniture rules in
// ./furnishing.ts.
//
// Ownership is PER CHARACTER and lives inside the character's own save blob,
// exactly like the bank vault (the anti-dupe rule: one blob, one owner, one
// write path). One house per character in phase 1.
//
// Persisted shape (CharacterState.house): absent for every character who has
// never bought a house, so their saves stay byte-equal (zero-default omission).
// The lot id is a persisted key (src/sim/content/house_lots.ts HOUSE_LOT_IDS).
// Phase 2 adds `furniture`: anchor id (src/sim/housing/cottage_layout.ts
// HOUSE_COTTAGE_ANCHORS) to the furniture item id standing on it
// (src/sim/content/furniture.ts), sparse and OMITTED when empty, so a phase-1
// save stays byte-equal. Beside the house, `furnishingSkill` is the Furnishing
// craft's own skill counter (content/professions.ts SECONDARY_CRAFTS: off the
// ring, so off the ten-key craftSkills record), omitted at zero. Phase 3 adds
// `storage`: the pooled house storage's slot list (./house_storage_state.ts
// owns its load path; ./house_storage.ts the rules), sparse and OMITTED when
// empty, so a phase-2 save stays byte-equal too.

import { furnitureDefFor } from '../content/furniture';
import { HOUSE_LOT_IDS } from '../content/house_lots';
import { craftMaxSkillFor, FURNISHING_CRAFT_ID } from '../content/professions';
import type { InvSlot } from '../types';
import { houseAnchorById } from './cottage_layout';
import { sanitizeHouseStorage, savedHouseStorage } from './house_storage_state';

/** Live ownership on PlayerMeta.house. */
export interface HouseOwnership {
  /** The owned lot's stable id. */
  lot: string;
  /** The realm reset-day key when the house was bought ('' on a clockless
   *  host). Recorded for the weekly-upkeep phase; never read as a clock here. */
  boughtDay: string;
  /** Placed furniture: anchor id to furniture item id. Sparse; every key is a
   *  live anchor and every value a live furniture item (the load sanitizer
   *  guarantees it). */
  furniture: Record<string, string>;
  /** The pooled house storage (phase 3): one slot list fed by every placed
   *  storage chest (HOUSE_CHEST_SLOTS each). Over-capacity is tolerated on
   *  load; a chest removal that would strand a slot is refused instead. */
  storage: InvSlot[];
}

/** The housing fields PlayerMeta carries (joined through the storage
 *  boundary's CharacterVaultStorageState, character_storage.ts). */
export interface HousingPlayerState {
  /** The owned house, persisted; absent = no house. */
  house?: HouseOwnership;
  /** The Furnishing skill counter (0 to the craft's maxSkill), persisted. */
  furnishingSkill: number;
  /** Runtime-only: the change signal for the owner-only `hst` wire key
   *  (bank.ts bankWireRev's twin): bumped by every write a houseStorageFor
   *  projection can observe (a deposit, a withdrawal, a chest placed or taken
   *  back). Never persisted. */
  houseStorageRev: number;
  /** Runtime-only: sim time of the last door prompt (the walk-in trigger
   *  fires at 20 Hz, so the offer is throttled). Never persisted. */
  houseOfferAt?: number;
}

/** The persisted form (CharacterState.house). */
export interface SavedHouseState {
  lot: string;
  /** Omitted when empty (a clockless host's purchase). */
  boughtDay?: string;
  /** Omitted when nothing is placed. */
  furniture?: Record<string, string>;
  /** Omitted when nothing is stored. */
  storage?: InvSlot[];
}

export function savedHouseState(house: HouseOwnership): SavedHouseState {
  const saved: SavedHouseState = { lot: house.lot };
  if (house.boughtDay) saved.boughtDay = house.boughtDay;
  const anchorIds = Object.keys(house.furniture);
  if (anchorIds.length > 0) {
    const furniture: Record<string, string> = {};
    for (const anchorId of anchorIds) furniture[anchorId] = house.furniture[anchorId];
    saved.furniture = furniture;
  }
  if (house.storage.length > 0) saved.storage = savedHouseStorage(house.storage);
  return saved;
}

/** A dropped placement row (the load sanitizer's dev-channel report). */
export interface DroppedFurnitureRow {
  anchorId: string;
  itemId: unknown;
}

/**
 * The one load path. Anything that is not a record naming a live lot loads as
 * "no house": lot ids are never retired by reuse (see house_lots.ts), so an
 * unknown id can only be a corrupt or hand-edited blob. A non-string boughtDay
 * loads as ''. A furniture row naming an unknown anchor, an unknown or
 * non-furniture item, or an item whose kind does not fit the anchor is
 * DROPPED (reported through `dropped`, which the caller logs on the dev
 * channel): the item is not returned to the bags in this phase. Anchor ids and
 * furniture ids are never reused, so such a row is a corrupt blob, not a
 * retired piece. The storage list loads through house_storage_state.ts
 * sanitizeHouseStorage (items never destroyed; dropped payload KEYS are
 * reported through `droppedStorageKeys`).
 */
export function sanitizeHouseState(
  raw: unknown,
  dropped?: DroppedFurnitureRow[],
  droppedStorageKeys?: string[],
): HouseOwnership | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const lot = record.lot;
  if (typeof lot !== 'string' || !HOUSE_LOT_IDS.has(lot)) return undefined;
  const boughtDay = typeof record.boughtDay === 'string' ? record.boughtDay : '';
  const furniture: Record<string, string> = {};
  const rawFurniture = record.furniture;
  if (rawFurniture !== null && typeof rawFurniture === 'object') {
    for (const [anchorId, itemId] of Object.entries(rawFurniture as Record<string, unknown>)) {
      const anchor = houseAnchorById(anchorId);
      const def = typeof itemId === 'string' ? furnitureDefFor(itemId) : undefined;
      if (anchor && def && def.kind === anchor.kind) furniture[anchorId] = def.itemId;
      else dropped?.push({ anchorId, itemId });
    }
  }
  const storage = sanitizeHouseStorage(record.storage, droppedStorageKeys);
  return { lot, boughtDay, furniture, storage };
}

/** The Furnishing skill load clamp: a finite non-negative number capped at
 *  the craft's content cap (the wheel.ts normalizeCraftSkills rule); anything
 *  else loads as 0. */
export function sanitizeFurnishingSkill(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(craftMaxSkillFor(FURNISHING_CRAFT_ID), raw);
}
