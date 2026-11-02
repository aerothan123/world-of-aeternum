// Player housing (Project H), phase 2: the pure decisions behind furnishing a
// house from the bags. DOM-free (UI_PURE_CORES): WHICH anchors a furniture
// item can go on, WHICH placed pieces can be taken back, whether the viewer
// stands inside their own house, and the short localized label an anchor
// wears ("Hearth room, floor 1"). bag_item_action_menu.ts is the thin DOM
// consumer; house_event_feedback.ts reuses the label for its lines.
//
// Anchor labels are derived, never authored per anchor: the room name and the
// kind are t() keys, the index is the anchor's ordinal among its room's
// anchors of that kind, in HOUSE_COTTAGE_ANCHORS order (stable, since anchor
// ids are persisted keys that are never renumbered).

import { furnitureDefFor } from '../../../sim/content/furniture';
import { houseLotForDungeon } from '../../../sim/content/house_lots';
import { dungeonAt } from '../../../sim/data';
import { HOUSE_COTTAGE_ANCHORS, type HouseAnchorDef } from '../../../sim/housing/cottage_layout';
import type { HouseView } from '../../../world_api';
import type { TranslationKey } from '../../i18n';
import { t } from '../../i18n';

const ROOM_KEY: Record<string, TranslationKey> = {
  hearth_room: 'hudChrome.housing.room.hearthRoom',
  bedroom: 'hudChrome.housing.room.bedroom',
  workshop: 'hudChrome.housing.room.workshop',
};

const KIND_KEY: Record<HouseAnchorDef['kind'], TranslationKey> = {
  floor: 'hudChrome.housing.anchorKind.floor',
  wall: 'hudChrome.housing.anchorKind.wall',
  rug: 'hudChrome.housing.anchorKind.rug',
  table: 'hudChrome.housing.anchorKind.table',
};

/** The anchor's ordinal (1-based) among its room's anchors of its kind. */
export function houseAnchorOrdinal(
  anchor: HouseAnchorDef,
  anchors: readonly HouseAnchorDef[] = HOUSE_COTTAGE_ANCHORS,
): number {
  let ordinal = 0;
  for (const other of anchors) {
    if (other.room !== anchor.room || other.kind !== anchor.kind) continue;
    ordinal++;
    if (other.id === anchor.id) return ordinal;
  }
  return ordinal;
}

/** The short localized label for an anchor id, or '' for an unknown id (a
 *  version-skewed frame). */
export function houseAnchorLabel(
  anchorId: string,
  anchors: readonly HouseAnchorDef[] = HOUSE_COTTAGE_ANCHORS,
): string {
  const anchor = anchors.find((a) => a.id === anchorId);
  if (!anchor) return '';
  const roomKey = ROOM_KEY[anchor.room];
  if (!roomKey) return '';
  return t('hudChrome.housing.anchorLabel', {
    room: t(roomKey),
    kind: t(KIND_KEY[anchor.kind]),
    index: String(houseAnchorOrdinal(anchor, anchors)),
  });
}

/** Whether a body at `x` stands inside the viewer's own house: the position's
 *  walk-in def is the owned lot's. Both worlds answer the same way (the
 *  dungeon band is pure data); the sim re-checks the exact claim. */
export function insideOwnHouse(x: number, myHouse: HouseView | null): boolean {
  if (!myHouse) return false;
  const def = dungeonAt(x);
  return def !== null && houseLotForDungeon(def.id)?.id === myHouse.lotId;
}

/** One row of the furnish picker. */
export interface FurnishOption {
  action: 'place' | 'remove';
  anchorId: string;
  /** For a remove row, the item standing on the anchor. */
  itemId?: string;
}

/** The furnish rows for a held furniture item: every FREE anchor of the
 *  item's kind (place), then every OCCUPIED anchor (take back), so the one
 *  picker both furnishes and clears a room. Empty for a non-furniture item or
 *  a viewer with no house. */
export function furnishOptions(
  itemId: string,
  myHouse: HouseView | null,
  anchors: readonly HouseAnchorDef[] = HOUSE_COTTAGE_ANCHORS,
): FurnishOption[] {
  const def = furnitureDefFor(itemId);
  if (!def || !myHouse) return [];
  const out: FurnishOption[] = [];
  for (const anchor of anchors) {
    if (anchor.kind === def.kind && myHouse.furniture[anchor.id] === undefined) {
      out.push({ action: 'place', anchorId: anchor.id });
    }
  }
  for (const anchor of anchors) {
    const placed = myHouse.furniture[anchor.id];
    if (placed !== undefined) out.push({ action: 'remove', anchorId: anchor.id, itemId: placed });
  }
  return out;
}
