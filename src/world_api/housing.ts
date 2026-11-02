import type { HouseLotDef } from '../sim/content/house_lots';
import type { HouseAnchorDef } from '../sim/housing/cottage_layout';
import type { HouseStorageView } from '../sim/housing/house_storage';
import type { HouseView } from '../sim/housing/ownership';

export type { HouseAnchorDef, HouseLotDef, HouseStorageView, HouseView };

// Player housing (Project H): the static house lots plus the caller's own
// house, the purchase command, (phase 2) the furniture anchors with the
// place and remove commands, and (phase 3) the pooled house storage behind
// the placed chests with its deposit and withdraw commands. Entering is the
// walk-in door (IWorldDungeons machinery: a lot is a zero-combat walk-in
// def), so there is no enter verb here. Home crafting stations (phase 3) add
// no member: a placed station's crafts ride IWorldProfessions
// activeMobileStationCrafts (src/sim/housing/house_stations.ts).
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
  // Take the piece on an anchor back into the bags (refused when full, and
  // for a storage chest, while the storage would no longer fit).
  removeFurniture(anchorId: string): void;
  // The pooled house storage (phase 3): null unless the caller stands inside
  // their own house within reach of a placed storage chest (the bank's
  // proximity shape). Server-derived: online it mirrors the `hst` self
  // delta, offline the Sim projects PlayerMeta.house.storage.
  houseStorage: HouseStorageView | null;
  // Move the whole carried stack in bag slot `slot` into the house storage,
  // and a storage slot back into the bags. The sim re-validates everything
  // (reach, the copy, the fit) and answers with houseDenied or the shared
  // bags-full line.
  houseStorageDeposit(slot: number): void;
  houseStorageWithdraw(slot: number): void;
}
