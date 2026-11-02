// Player housing (Project H), phase 1: the house lots. A lot is the front door
// of an existing town house that was never a walk-in building. Walking into the
// door takes that lot's OWNER into their own private copy of the cottage
// interior (src/sim/housing/cottage_layout.ts); anyone else is offered the house
// for sale instead. Every owner of the same lot gets a separate copy, so a lot
// is never contested (the New World model).
//
// Each lot is carried by its own zero-combat walk-in DungeonDef (the Last Keep /
// Dawnhold precedent), generated below and merged into DUNGEONS by data.ts, so
// the existing instance machinery (slots, collision, the renderer, logout
// inside an instance) serves houses unchanged. The owner gate and the instance
// key live in src/sim/housing/ownership.ts.
//
// LOT IDS ARE PERSISTED SAVE KEYS (CharacterState.house.lot) and never rename or
// renumber: retiring a lot means dropping it from sale, never reusing its id.
// The dungeon `index` is the lot's instance x-band and must stay unique across
// DUNGEONS (the overflow band has room up to the battleground band).
//
// Door positions are the building record's frontStandingPoint
// (src/sim/authored_town_registry.ts), and leaveOffset steps 3yd further out
// along the building-to-door direction so leaving clears the 2yd door trigger;
// tests/housing.test.ts pins both against the live records.
//
// PRICES ARE PLACEHOLDERS (copper), scaled by the town's place on the leveling
// road, pending a balance pass. They are not classic-era figures.

import type { DungeonDef } from '../types';

export interface HouseLotDef {
  /** Stable persisted id. */
  readonly id: string;
  /** Player-visible name of the house. */
  readonly name: string;
  /** The authored town building whose front door this lot is. */
  readonly buildingId: string;
  /** Zone the lot stands in (for the purchase prompt and the map). */
  readonly zoneId: string;
  /** The generated walk-in DungeonDef carrying this lot's interior. */
  readonly dungeonId: string;
  /** Instance x-band index, unique across DUNGEONS. */
  readonly index: number;
  readonly doorPos: { readonly x: number; readonly z: number };
  readonly leaveOffset: { readonly x: number; readonly z: number };
  /** Purchase price in copper (placeholder, see the header). */
  readonly priceCopper: number;
}

export const HOUSE_LOTS: readonly HouseLotDef[] = Object.freeze([
  Object.freeze({
    id: 'eastbrook_quay_cottage',
    name: 'Quay Cottage',
    buildingId: 'eastbrook_quay_cottage',
    zoneId: 'eastbrook_vale',
    dungeonId: 'house_eastbrook_quay_cottage',
    index: 15,
    doorPos: Object.freeze({ x: -64.4, z: -56.46 }),
    leaveOffset: Object.freeze({ x: -2.16, z: -2.09 }),
    priceCopper: 10_00_00,
  }),
  Object.freeze({
    id: 'fenbridge_warden_gatehouse',
    name: "Warden's Gatehouse",
    buildingId: 'fenbridge_warden_gatehouse',
    zoneId: 'mirefen_marsh',
    dungeonId: 'house_fenbridge_warden_gatehouse',
    index: 16,
    doorPos: Object.freeze({ x: 3.51, z: 276.56 }),
    leaveOffset: Object.freeze({ x: -2.92, z: 0.71 }),
    priceCopper: 25_00_00,
  }),
  Object.freeze({
    id: 'highwatch_watch_house',
    name: 'Watch House',
    buildingId: 'highwatch_watch_house',
    zoneId: 'thornpeak_heights',
    dungeonId: 'house_highwatch_watch_house',
    index: 17,
    doorPos: Object.freeze({ x: 4.11, z: 636.24 }),
    leaveOffset: Object.freeze({ x: -2.94, z: 0.6 }),
    priceCopper: 50_00_00,
  }),
]);

/** Every persisted lot id (the load sanitizer's allowlist). */
export const HOUSE_LOT_IDS: ReadonlySet<string> = new Set(HOUSE_LOTS.map((lot) => lot.id));

const LOT_BY_ID = new Map(HOUSE_LOTS.map((lot) => [lot.id, lot]));
const LOT_BY_DUNGEON = new Map(HOUSE_LOTS.map((lot) => [lot.dungeonId, lot]));

export function houseLotById(id: string): HouseLotDef | undefined {
  return LOT_BY_ID.get(id);
}

/** The lot a walk-in DungeonDef id carries, or undefined for every real dungeon. */
export function houseLotForDungeon(dungeonId: string): HouseLotDef | undefined {
  return LOT_BY_DUNGEON.get(dungeonId);
}

// The interior's arrival and exit points (src/sim/housing/cottage_layout.ts
// HOUSE_ENTRY / HOUSE_EXIT), repeated as plain numbers so this content module
// stays free of the layout's import graph; tests/housing.test.ts pins them equal.
const ENTRY = { x: 0, z: -6 };
const EXIT = { x: 0, z: -10 };

/** The walk-in DungeonDef per lot, keyed by dungeon id (merged into DUNGEONS). */
export const HOUSE_LOT_DUNGEON_DEFS: Record<string, DungeonDef> = Object.fromEntries(
  HOUSE_LOTS.map((lot): [string, DungeonDef] => [
    lot.dungeonId,
    {
      id: lot.dungeonId,
      name: lot.name,
      index: lot.index,
      doorPos: { x: lot.doorPos.x, z: lot.doorPos.z },
      leaveOffset: { x: lot.leaveOffset.x, z: lot.leaveOffset.z },
      // The house's own front door is the entrance: no portal membrane.
      staticDoor: true,
      // A private home, never a Guide page or a finder activity.
      guideVisible: false,
      entry: { ...ENTRY },
      exitOffset: { ...EXIT },
      // Zero combat, zero loot: a home, not a fight.
      spawns: [],
      interior: 'house',
      suggestedPlayers: 1,
      enterText: 'You step inside your house.',
      leaveText: 'You close your front door behind you.',
    },
  ]),
);
