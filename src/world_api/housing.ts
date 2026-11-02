import type { HouseLotDef } from '../sim/content/house_lots';
import type { HouseAnchorDef } from '../sim/housing/cottage_layout';
import type { HouseView } from '../sim/housing/ownership';

export type { HouseAnchorDef, HouseLotDef, HouseView };

// Player housing (Project H): the static house lots plus the caller's own
// house, the purchase command, and (phase 2) the furniture anchors with the
// place and remove commands. Entering is the walk-in door (IWorldDungeons
// machinery: a lot is a zero-combat walk-in def), so there is no enter verb here.
export interface IWorldHousing {
  // Static content read: both worlds serve src/sim/content/house_lots.ts
  // directly (content ships with the client bundle), so no wire round-trip.
  houseLots: readonly HouseLotDef[];
  // Static content read: the cottage's furniture anchors
  // (src/sim/housing/cottage_layout.ts HOUSE_COTTAGE_ANCHORS), same rule.
  houseAnchors: readonly HouseAnchorDef[];
  // The caller's own house, or null. Server-derived: online it mirrors the
  // `hse` self delta, offline the Sim projects PlayerMeta.house. Carries the
  // placed furniture (anchor id to item id).
  myHouse: HouseView | null;
  // Buy the house on a lot. The sim re-validates everything (the lot, being
  // alive, owning no house yet, standing near its door, the price) and answers
  // with a personal housePurchased or houseDenied event.
  buyHouse(lotId: string): void;
  // Place the furniture copy in bag slot `slot` on an anchor of the caller's
  // own house; the sim re-validates everything (ownership, standing inside the
  // own copy, the anchor, its kind, the copy) and answers with houseFurniture
  // or houseDenied.
  placeFurniture(anchorId: string, slot: number): void;
  // Take the piece on an anchor back into the bags (refused when full).
  removeFurniture(anchorId: string): void;
}
