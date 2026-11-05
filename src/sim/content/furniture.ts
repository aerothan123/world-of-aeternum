// Player housing (Project H), phase 2: the furniture catalog. Data-as-code:
// the furniture ItemDefs (merged into ITEMS by data.ts) plus the side table
// that says what each piece IS to the housing system: the anchor KIND it fits
// (src/sim/housing/cottage_layout.ts HOUSE_COTTAGE_ANCHORS) and the render
// key the owner's private interior draws it with (src/render/house_furniture.ts
// clones the matching KayKit castle GLB the Dawnhold dressing already ships, or
// a painted Wyndlewood kit model; 'rug' is the procedural rug plane).
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
// quality: a decoration, never counted combat power. The trophy plaque is
// authored now for phase 4 and carries NO function yet: it places like any
// other piece. Phase 3 gives two families a FUNCTION beyond decoration, both
// resolved by the housing system from the def, never from the item: the
// storage chest (every placed chest adds HOUSE_CHEST_SLOTS to the pooled
// house storage, src/sim/housing/house_storage.ts) and the six crafting
// stations (`stationType`: standing near a placed one inside your own house
// satisfies the recipe station gate exactly as the town station of that type
// does, src/sim/housing/house_stations.ts).
//
// Item icons: public/ui/items/<id>.webp, rendered from the very model each
// piece places (scripts/render_furniture_icons.mjs). A new piece parks in
// FURNITURE_ART_PENDING_ITEM_IDS until its icon lands (tests/item_icons.test.ts).

import type { ItemDef, StationType } from '../types';

/** The anchor kinds a furniture piece can stand on. Persisted indirectly
 *  (an anchor id names its kind in content), so append-only. */
export type FurnitureAnchorKind = 'floor' | 'wall' | 'rug' | 'table';

/** The render keys the house renderer resolves: the kcas furniture set the
 *  Dawnhold dressing preloads (src/render/dawnhold_dressing.ts
 *  DAWNHOLD_DRESSING_KEYS), the two qprops station props (the anvil and the
 *  weapon stand the market stalls already place, src/render/props.ts
 *  PROP_ASSET_DEFS), plus the procedural rug. */
export type FurnitureRenderKey =
  | 'kcasChair'
  | 'kcasStool'
  | 'kcasBench'
  | 'kcasTableRoundSmall'
  | 'kcasTableRoundMedium'
  | 'kcasTableLong'
  | 'kcasTableCloth'
  | 'kcasBookcase'
  | 'kcasKeg'
  | 'kcasBarrel'
  | 'kcasChest'
  | 'kcasShelfSmall'
  | 'kcasShelfCandles'
  | 'kcasBartopMedium'
  | 'kcasCandleTriple'
  | 'anvil'
  | 'weaponStand'
  | 'rug'
  // The Wyndlewood painted furniture (content/wyndlewood_props.ts WYN_PROP_MODELS
  // furniture rows, registered by render/wyndlewood_props.ts).
  | 'wynCottageBed'
  | 'wynCottageTable'
  | 'wynCottageChair'
  | 'wynCottageShelf'
  | 'wynBraidedRug'
  | 'wynTableLantern'
  | 'wynSmallStorageChest'
  | 'wynFoldingWorktable';

export interface FurnitureDef {
  /** The item id (the ItemDef key and the persisted placement value). */
  readonly itemId: string;
  readonly kind: FurnitureAnchorKind;
  readonly renderKey: FurnitureRenderKey;
  /** Uniform scale over the normalized render template (height in yards for
   *  a kcas model; the rug's half extents are fixed in the renderer). */
  readonly scale: number;
  /** Phase 3: the crafting station type a placed copy serves inside the
   *  owner's house (src/sim/housing/house_stations.ts). Absent on every
   *  non-station piece. */
  readonly stationType?: StationType;
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
  // Phase 3: every placed chest adds HOUSE_CHEST_SLOTS of pooled house storage.
  // Drawn with the painted small chest (the Wyndlewood kit) since the props
  // crew's style pass; the item and its storage function are unchanged.
  { itemId: 'furn_storage_chest', kind: 'floor', renderKey: 'wynSmallStorageChest', scale: 0.85 },
  // Reserved for phase 4 (trophies): placeable decoration today, no buff.
  { itemId: 'furn_trophy_plaque', kind: 'wall', renderKey: 'kcasShelfSmall', scale: 1.2 },
  // Phase 3: the six home crafting stations, one per StationType
  // (content/professions.ts STATIONS). Floor pieces, so they stand on the
  // workshop's floor anchors (or any floor anchor the owner prefers).
  {
    itemId: 'furn_station_forge',
    kind: 'floor',
    renderKey: 'anvil',
    scale: 1.1,
    stationType: 'forge',
  },
  {
    itemId: 'furn_station_kitchens',
    kind: 'floor',
    renderKey: 'kcasBartopMedium',
    scale: 1.2,
    stationType: 'kitchens',
  },
  {
    itemId: 'furn_station_apothecary',
    kind: 'floor',
    renderKey: 'kcasShelfCandles',
    scale: 1.4,
    stationType: 'apothecary',
  },
  {
    itemId: 'furn_station_tannery',
    kind: 'floor',
    renderKey: 'kcasTableRoundMedium',
    scale: 1.1,
    stationType: 'tannery',
  },
  {
    itemId: 'furn_station_loom',
    kind: 'floor',
    renderKey: 'kcasTableCloth',
    scale: 1.2,
    stationType: 'loom',
  },
  {
    itemId: 'furn_station_toolworks',
    kind: 'floor',
    renderKey: 'weaponStand',
    scale: 1.5,
    stationType: 'toolworks',
  },
  // The Wyndlewood cottage style test (props crew, assets_src/wyndlewood_props):
  // painted pieces in the cottage, rustic and crafter families. Decoration
  // only. `scale` is the standing height in yards.
  { itemId: 'furn_cottage_bed', kind: 'floor', renderKey: 'wynCottageBed', scale: 1.3 },
  { itemId: 'furn_cottage_table', kind: 'floor', renderKey: 'wynCottageTable', scale: 0.9 },
  { itemId: 'furn_cottage_chair', kind: 'floor', renderKey: 'wynCottageChair', scale: 1.15 },
  { itemId: 'furn_cottage_shelf', kind: 'wall', renderKey: 'wynCottageShelf', scale: 1.8 },
  { itemId: 'furn_braided_rug', kind: 'rug', renderKey: 'wynBraidedRug', scale: 0.05 },
  { itemId: 'furn_table_lantern', kind: 'table', renderKey: 'wynTableLantern', scale: 0.5 },
  { itemId: 'furn_folding_worktable', kind: 'floor', renderKey: 'wynFoldingWorktable', scale: 1 },
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

/** The storage chest's item id (phase 3): the one piece that adds house
 *  storage capacity (src/sim/housing/house_storage.ts). */
export const HOUSE_STORAGE_CHEST_ITEM_ID = 'furn_storage_chest';

/** The station type a furniture item serves at home, or undefined for every
 *  other item (phase 3, src/sim/housing/house_stations.ts). */
export function furnitureStationType(itemId: string | null | undefined): StationType | undefined {
  return furnitureDefFor(itemId)?.stationType;
}

/** Every station furniture def, in StationType authoring order. */
export const HOUSE_STATION_FURNITURE_DEFS: readonly FurnitureDef[] = FURNITURE_DEFS.filter(
  (def) => def.stationType !== undefined,
);

/** Every furniture item id (the load sanitizer's allowlist, the icon debt
 *  ledger, and the i18n catalog pin). */
export const FURNITURE_ITEM_IDS: readonly string[] = FURNITURE_DEFS.map((def) => def.itemId);

/** Item art debt (src/ui/icons.ts ITEM_ART_PENDING): EMPTY since every piece
 *  got its icon (scripts/render_furniture_icons.mjs); the seam stays for the
 *  next furniture batch, which parks here until its art lands. */
export const FURNITURE_ART_PENDING_ITEM_IDS: readonly string[] = [];

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
  furn_station_forge: furnitureItem('furn_station_forge', 'Home Forge', 40),
  furn_station_kitchens: furnitureItem('furn_station_kitchens', 'Home Kitchen', 40),
  furn_station_apothecary: furnitureItem('furn_station_apothecary', 'Home Apothecary Bench', 40),
  furn_station_tannery: furnitureItem('furn_station_tannery', 'Home Tanning Table', 40),
  furn_station_loom: furnitureItem('furn_station_loom', 'Home Loom', 40),
  furn_station_toolworks: furnitureItem('furn_station_toolworks', 'Home Toolworks', 40),
  furn_cottage_bed: furnitureItem('furn_cottage_bed', 'Cottage Bed', 28),
  furn_cottage_table: furnitureItem('furn_cottage_table', 'Cottage Table', 15),
  furn_cottage_chair: furnitureItem('furn_cottage_chair', 'Cottage Chair', 12),
  furn_cottage_shelf: furnitureItem('furn_cottage_shelf', 'Cottage Shelf', 17),
  furn_braided_rug: furnitureItem('furn_braided_rug', 'Braided Rug', 11),
  furn_table_lantern: furnitureItem('furn_table_lantern', 'Table Lantern', 8),
  furn_folding_worktable: furnitureItem('furn_folding_worktable', 'Folding Worktable', 17),
};
