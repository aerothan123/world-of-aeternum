// Player housing (Project H), phase 2: the furniture catalog. Data-as-code:
// the furniture ItemDefs (merged into ITEMS by data.ts) plus the side table
// that says what each piece IS to the housing system: the anchor KIND it fits
// (src/sim/housing/cottage_layout.ts HOUSE_COTTAGE_ANCHORS) and the render
// key the owner's private interior draws it with (src/render/house_furniture.ts
// clones the matching KayKit castle GLB the Dawnhold dressing already ships;
// 'rug' is the procedural rug plane).
//
// Furniture is crafted by the Furnishing profession (content/recipes.ts
// FURNISHING_RECIPES), carried in the bags like any other item, and placed
// on an anchor of the matching kind inside the owner's house
// (src/sim/housing/furnishing.ts). ITEM IDS ARE PERSISTED KEYS (bags, bank
// and CharacterState.house.furniture values): never rename or renumber.
//
// Typing: kind 'tool' with no `use` arm (the Maker's Charm shape): never
// equippable, never a kind the junk sweep vendors, and useItem's fall-through
// refuses it (placement is the bag menu's Place row, never a click). Common
// quality: a decoration, never counted combat power. The storage chest and
// the trophy plaque are authored now for phases 3 and 4 and carry NO function
// yet: they place like any other piece.
//
// Item icons: every id below rides ITEM_ART_PENDING (src/ui/icons.ts) through
// FURNITURE_ART_PENDING_ITEM_IDS until the paintings land, so the icon falls
// back to the procedural recipe (tests/item_icons.test.ts).

import type { ItemDef } from '../types';

/** The anchor kinds a furniture piece can stand on. Persisted indirectly
 *  (an anchor id names its kind in content), so append-only. */
export type FurnitureAnchorKind = 'floor' | 'wall' | 'rug' | 'table';

/** The render keys the house renderer resolves: the kcas furniture set the
 *  Dawnhold dressing preloads (src/render/dawnhold_dressing.ts
 *  DAWNHOLD_DRESSING_KEYS) plus the procedural rug. */
export type FurnitureRenderKey =
  | 'kcasChair'
  | 'kcasStool'
  | 'kcasBench'
  | 'kcasTableRoundSmall'
  | 'kcasTableLong'
  | 'kcasBookcase'
  | 'kcasKeg'
  | 'kcasBarrel'
  | 'kcasChest'
  | 'kcasShelfSmall'
  | 'kcasCandleTriple'
  | 'rug';

export interface FurnitureDef {
  /** The item id (the ItemDef key and the persisted placement value). */
  readonly itemId: string;
  readonly kind: FurnitureAnchorKind;
  readonly renderKey: FurnitureRenderKey;
  /** Uniform scale over the normalized render template (height in yards for
   *  a kcas model; the rug's half extents are fixed in the renderer). */
  readonly scale: number;
}

/** The catalog, in authoring order. The two reserved rows are last. */
export const FURNITURE_DEFS: readonly FurnitureDef[] = Object.freeze([
  { itemId: 'furn_wooden_chair', kind: 'floor', renderKey: 'kcasChair', scale: 1.3 },
  { itemId: 'furn_wooden_stool', kind: 'floor', renderKey: 'kcasStool', scale: 1.2 },
  { itemId: 'furn_oak_bench', kind: 'floor', renderKey: 'kcasBench', scale: 1.4 },
  { itemId: 'furn_round_table', kind: 'floor', renderKey: 'kcasTableRoundSmall', scale: 1.25 },
  { itemId: 'furn_long_table', kind: 'floor', renderKey: 'kcasTableLong', scale: 1.5 },
  { itemId: 'furn_bookcase', kind: 'wall', renderKey: 'kcasBookcase', scale: 1.5 },
  { itemId: 'furn_keg', kind: 'floor', renderKey: 'kcasKeg', scale: 1.2 },
  { itemId: 'furn_barrel', kind: 'floor', renderKey: 'kcasBarrel', scale: 1.2 },
  { itemId: 'furn_woven_rug', kind: 'rug', renderKey: 'rug', scale: 1 },
  { itemId: 'furn_candlestick', kind: 'table', renderKey: 'kcasCandleTriple', scale: 1.2 },
  // Reserved for phase 3 (storage chests) and phase 4 (trophies): placeable
  // decoration today, no chest slots and no buff until those phases land.
  { itemId: 'furn_storage_chest', kind: 'floor', renderKey: 'kcasChest', scale: 1.3 },
  { itemId: 'furn_trophy_plaque', kind: 'wall', renderKey: 'kcasShelfSmall', scale: 1.2 },
]);

const DEF_BY_ITEM: ReadonlyMap<string, FurnitureDef> = new Map(
  FURNITURE_DEFS.map((def) => [def.itemId, def]),
);

/** The furniture descriptor for an item id, or undefined for every other item. */
export function furnitureDefFor(itemId: string | null | undefined): FurnitureDef | undefined {
  return itemId ? DEF_BY_ITEM.get(itemId) : undefined;
}

export function isFurnitureItemId(itemId: string | null | undefined): boolean {
  return itemId !== null && itemId !== undefined && DEF_BY_ITEM.has(itemId);
}

/** Every furniture item id (the load sanitizer's allowlist, the icon debt
 *  ledger, and the i18n catalog pin). */
export const FURNITURE_ITEM_IDS: readonly string[] = FURNITURE_DEFS.map((def) => def.itemId);

/** Item art debt (src/ui/icons.ts ITEM_ART_PENDING): every furniture id ships
 *  on the procedural recipe until its painting lands. */
export const FURNITURE_ART_PENDING_ITEM_IDS: readonly string[] = FURNITURE_ITEM_IDS;

function furnitureItem(id: string, name: string, sellValue: number): ItemDef {
  return { id, name, kind: 'tool', quality: 'common', sellValue };
}

/** The furniture ItemDefs (merged into ITEMS by data.ts). sellValue sits
 *  below each recipe's input value (tests/recipe_economy.test.ts). */
export const FURNITURE_ITEMS: Record<string, ItemDef> = {
  furn_wooden_chair: furnitureItem('furn_wooden_chair', 'Wooden Chair', 12),
  furn_wooden_stool: furnitureItem('furn_wooden_stool', 'Wooden Stool', 8),
  furn_oak_bench: furnitureItem('furn_oak_bench', 'Oak Bench', 15),
  furn_round_table: furnitureItem('furn_round_table', 'Round Table', 15),
  furn_long_table: furnitureItem('furn_long_table', 'Long Table', 20),
  furn_bookcase: furnitureItem('furn_bookcase', 'Bookcase', 60),
  furn_keg: furnitureItem('furn_keg', 'Keg', 15),
  furn_barrel: furnitureItem('furn_barrel', 'Barrel', 18),
  furn_woven_rug: furnitureItem('furn_woven_rug', 'Woven Rug', 18),
  furn_candlestick: furnitureItem('furn_candlestick', 'Candlestick', 10),
  furn_storage_chest: furnitureItem('furn_storage_chest', 'Storage Chest', 60),
  furn_trophy_plaque: furnitureItem('furn_trophy_plaque', 'Trophy Plaque', 40),
};
