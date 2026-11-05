// Player housing (Project H): the pure resolution behind the housing
// SimEvents (houseOffer / housePurchased / houseDenied / houseFurniture). DOM-free: it decides
// WHICH line key and params each event resolves to; house_event_feedback.ts is
// the thin consumer that localizes and pushes through the HUD host. The house
// name resolves through the lot's walk-in dungeon entity name (tEntity), so it
// localizes with every other dungeon name.

import { houseLotById } from '../../../sim/content/house_lots';
import { ITEMS } from '../../../sim/data';
import type { SimEvent } from '../../../sim/types';
import { itemDisplayName, tEntity } from '../../entity_i18n';
import type { TranslationKey } from '../../i18n';
import { houseAnchorLabel } from './house_furnish_view';

/** The housing events, narrowed from the shared SimEvent union. */
export type HouseEvent = Extract<
  SimEvent,
  { type: 'houseOffer' | 'housePurchased' | 'houseDenied' | 'houseFurniture' }
>;

export type HouseDenyReason = Extract<SimEvent, { type: 'houseDenied' }>['reason'];

/** The localized house name for a lot id, or null for an unknown lot. */
export function houseName(lotId: string): string | null {
  const lot = houseLotById(lotId);
  return lot ? tEntity({ kind: 'dungeon', id: lot.dungeonId, field: 'name' }) : null;
}

const DENY_KEYS: Record<HouseDenyReason, TranslationKey> = {
  bad_lot: 'hudChrome.housing.denied.badLot',
  owned: 'hudChrome.housing.denied.owned',
  account_owned: 'hudChrome.housing.denied.accountOwned',
  range: 'hudChrome.housing.denied.range',
  money: 'hudChrome.housing.denied.money',
  dead: 'hudChrome.housing.denied.dead',
  // Phase 2, the furniture refusals (src/sim/housing/furnishing.ts).
  no_house: 'hudChrome.housing.denied.noHouse',
  not_inside: 'hudChrome.housing.denied.notInside',
  bad_anchor: 'hudChrome.housing.denied.badAnchor',
  anchor_taken: 'hudChrome.housing.denied.anchorTaken',
  anchor_empty: 'hudChrome.housing.denied.anchorEmpty',
  anchor_kind: 'hudChrome.housing.denied.anchorKind',
  no_item: 'hudChrome.housing.denied.noItem',
  bags_full: 'hudChrome.housing.denied.bagsFull',
  // Phase 3, the storage refusals (src/sim/housing/house_storage.ts).
  storage_in_use: 'hudChrome.housing.denied.storageInUse',
  storage_far: 'hudChrome.housing.denied.storageFar',
  storage_full: 'hudChrome.housing.denied.storageFull',
  storage_item: 'hudChrome.housing.denied.storageItem',
};

/** What one housing event asks the HUD to do. */
export type HouseFeedbackPlan =
  /** Ask whether to buy (a living non-owner walked into a lot's door). */
  | { kind: 'offer'; lotId: string; house: string; priceCopper: number }
  /** A plain refusal toast. */
  | { kind: 'error'; key: TranslationKey; house: string }
  /** The purchase went through: a banner plus a log line. */
  | { kind: 'purchased'; house: string }
  /** A piece was placed or taken back: a log line naming it and its anchor. */
  | { kind: 'furniture'; key: TranslationKey; item: string; anchor: string }
  /** Nothing to say (an unknown lot from a version-skewed frame). */
  | { kind: 'none' };

export function houseFeedbackPlan(ev: HouseEvent): HouseFeedbackPlan {
  switch (ev.type) {
    case 'houseOffer': {
      const house = houseName(ev.lotId);
      if (house === null) return { kind: 'none' };
      if (ev.ownedLotId !== undefined) {
        const owned = houseName(ev.ownedLotId);
        if (owned === null) return { kind: 'none' };
        return { kind: 'error', key: 'hudChrome.housing.alreadyOwn', house: owned };
      }
      return { kind: 'offer', lotId: ev.lotId, house, priceCopper: ev.priceCopper };
    }
    case 'housePurchased': {
      const house = houseName(ev.lotId);
      return house === null ? { kind: 'none' } : { kind: 'purchased', house };
    }
    case 'houseDenied': {
      const key = DENY_KEYS[ev.reason];
      if (!key) return { kind: 'none' };
      // bad_lot names no real house; the others name the lot the command did.
      return { kind: 'error', key, house: houseName(ev.lotId) ?? '' };
    }
    case 'houseFurniture': {
      const def = ITEMS[ev.itemId];
      const anchor = houseAnchorLabel(ev.anchorId);
      if (!def || anchor === '') return { kind: 'none' };
      return {
        kind: 'furniture',
        key:
          ev.action === 'placed'
            ? 'hudChrome.housing.furniturePlaced'
            : 'hudChrome.housing.furnitureRemoved',
        item: itemDisplayName(def),
        anchor,
      };
    }
  }
}
