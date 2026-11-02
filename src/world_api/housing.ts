import type { HouseLotDef } from '../sim/content/house_lots';
import type { HouseView } from '../sim/housing/ownership';

export type { HouseLotDef, HouseView };

// Player housing (Project H), phase 1: the static house lots plus the caller's
// own house, and the purchase command. Entering is the walk-in door
// (IWorldDungeons machinery: a lot is a zero-combat walk-in def), so there is
// no enter verb here.
export interface IWorldHousing {
  // Static content read: both worlds serve src/sim/content/house_lots.ts
  // directly (content ships with the client bundle), so no wire round-trip.
  houseLots: readonly HouseLotDef[];
  // The caller's own house, or null. Server-derived: online it mirrors the
  // `hse` self delta, offline the Sim projects PlayerMeta.house.
  myHouse: HouseView | null;
  // Buy the house on a lot. The sim re-validates everything (the lot, being
  // alive, owning no house yet, standing near its door, the price) and answers
  // with a personal housePurchased or houseDenied event.
  buyHouse(lotId: string): void;
}
