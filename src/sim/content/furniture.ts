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
  | 'wynFoldingWorktable'
  | 'wynRusticChair'
  | 'wynRusticStool'
  | 'wynRusticBench'
  | 'wynRusticBarrel'
  | 'wynCottageRoundTable'
  | 'wynNobleBookcase'
  | 'wynWovenRugPainted'
  | 'wynHomeForge'
  | 'wynHomeKitchen'
  | 'wynHomeApothecary'
  | 'wynRusticWardrobe'
  | 'wynRusticCupboard'
  | 'wynStrawCot'
  | 'wynWashStand'
  | 'wynLogBasket'
  | 'wynPegRail'
  | 'wynWaterJug'
  | 'wynBreadBoard'
  | 'wynCottageArmchair'
  | 'wynRockingChair'
  | 'wynCottageDresser'
  | 'wynPaintedWardrobe'
  | 'wynQuiltChest'
  | 'wynSideTable'
  | 'wynFlowerStand'
  | 'wynWallClock'
  | 'wynLandscapePainting'
  | 'wynPottedFlowers'
  | 'wynTeaSet'
  | 'wynRagRunner'
  | 'wynCanopyBed'
  | 'wynHighbackChair'
  | 'wynBanquetTable'
  | 'wynWritingDesk'
  | 'wynVelvetSettee'
  | 'wynDisplayCabinet'
  | 'wynWallTapestry'
  | 'wynGlobeStand'
  | 'wynNobleCarpet'
  | 'wynToolRack'
  | 'wynSawhorse'
  | 'wynPottingBench'
  | 'wynSpoolRack'
  | 'wynHerbDryingRack'
  | 'wynHomeTannery'
  | 'wynHomeLoom'
  | 'wynHomeToolworks'
  | 'wynNobleWardrobe'
  | 'wynCandelabra'
  | 'wynCrateStack';

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
  { itemId: 'furn_wooden_chair', kind: 'floor', renderKey: 'wynRusticChair', scale: 1.1 },
  { itemId: 'furn_wooden_stool', kind: 'floor', renderKey: 'wynRusticStool', scale: 0.55 },
  { itemId: 'furn_oak_bench', kind: 'floor', renderKey: 'wynRusticBench', scale: 0.6 },
  { itemId: 'furn_round_table', kind: 'floor', renderKey: 'wynCottageRoundTable', scale: 0.8 },
  { itemId: 'furn_long_table', kind: 'floor', renderKey: 'kcasTableLong', scale: 1.5 },
  { itemId: 'furn_bookcase', kind: 'wall', renderKey: 'wynNobleBookcase', scale: 2.2 },
  { itemId: 'furn_keg', kind: 'floor', renderKey: 'kcasKeg', scale: 1.2 },
  { itemId: 'furn_barrel', kind: 'floor', renderKey: 'wynRusticBarrel', scale: 1 },
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
    renderKey: 'wynHomeForge',
    scale: 1.2,
    stationType: 'forge',
  },
  {
    itemId: 'furn_station_kitchens',
    kind: 'floor',
    renderKey: 'wynHomeKitchen',
    scale: 1.3,
    stationType: 'kitchens',
  },
  {
    itemId: 'furn_station_apothecary',
    kind: 'floor',
    renderKey: 'wynHomeApothecary',
    scale: 1.4,
    stationType: 'apothecary',
  },
  {
    itemId: 'furn_station_tannery',
    kind: 'floor',
    renderKey: 'wynHomeTannery',
    scale: 1.4,
    stationType: 'tannery',
  },
  {
    itemId: 'furn_station_loom',
    kind: 'floor',
    renderKey: 'wynHomeLoom',
    scale: 1.3,
    stationType: 'loom',
  },
  {
    itemId: 'furn_station_toolworks',
    kind: 'floor',
    renderKey: 'wynHomeToolworks',
    scale: 1.2,
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
  // The Wyndlewood rustic family (assets_src/wyndlewood_props/furniture_catalog.json).
  { itemId: 'furn_rustic_wardrobe', kind: 'floor', renderKey: 'wynRusticWardrobe', scale: 2 },
  { itemId: 'furn_rustic_cupboard', kind: 'floor', renderKey: 'wynRusticCupboard', scale: 1.1 },
  { itemId: 'furn_straw_cot', kind: 'floor', renderKey: 'wynStrawCot', scale: 0.7 },
  { itemId: 'furn_wash_stand', kind: 'floor', renderKey: 'wynWashStand', scale: 1.05 },
  { itemId: 'furn_log_basket', kind: 'floor', renderKey: 'wynLogBasket', scale: 0.6 },
  { itemId: 'furn_peg_rail', kind: 'wall', renderKey: 'wynPegRail', scale: 0.9 },
  { itemId: 'furn_water_jug', kind: 'table', renderKey: 'wynWaterJug', scale: 0.32 },
  { itemId: 'furn_bread_board', kind: 'table', renderKey: 'wynBreadBoard', scale: 0.2 },
  // The Wyndlewood cottage family (assets_src/wyndlewood_props/furniture_catalog.json).
  { itemId: 'furn_cottage_armchair', kind: 'floor', renderKey: 'wynCottageArmchair', scale: 1.1 },
  { itemId: 'furn_rocking_chair', kind: 'floor', renderKey: 'wynRockingChair', scale: 1.15 },
  { itemId: 'furn_cottage_dresser', kind: 'floor', renderKey: 'wynCottageDresser', scale: 2 },
  { itemId: 'furn_painted_wardrobe', kind: 'floor', renderKey: 'wynPaintedWardrobe', scale: 2 },
  { itemId: 'furn_quilt_chest', kind: 'floor', renderKey: 'wynQuiltChest', scale: 0.7 },
  { itemId: 'furn_side_table', kind: 'floor', renderKey: 'wynSideTable', scale: 0.7 },
  { itemId: 'furn_flower_stand', kind: 'floor', renderKey: 'wynFlowerStand', scale: 1.1 },
  { itemId: 'furn_wall_clock', kind: 'wall', renderKey: 'wynWallClock', scale: 0.55 },
  {
    itemId: 'furn_landscape_painting',
    kind: 'wall',
    renderKey: 'wynLandscapePainting',
    scale: 0.8,
  },
  { itemId: 'furn_potted_flowers', kind: 'table', renderKey: 'wynPottedFlowers', scale: 0.45 },
  { itemId: 'furn_tea_set', kind: 'table', renderKey: 'wynTeaSet', scale: 0.25 },
  { itemId: 'furn_rag_runner', kind: 'rug', renderKey: 'wynRagRunner', scale: 0.04 },
  // The Wyndlewood noble family (assets_src/wyndlewood_props/furniture_catalog.json).
  { itemId: 'furn_canopy_bed', kind: 'floor', renderKey: 'wynCanopyBed', scale: 2.3 },
  { itemId: 'furn_highback_chair', kind: 'floor', renderKey: 'wynHighbackChair', scale: 1.5 },
  { itemId: 'furn_banquet_table', kind: 'floor', renderKey: 'wynBanquetTable', scale: 0.85 },
  { itemId: 'furn_writing_desk', kind: 'floor', renderKey: 'wynWritingDesk', scale: 1.1 },
  { itemId: 'furn_velvet_settee', kind: 'floor', renderKey: 'wynVelvetSettee', scale: 1 },
  { itemId: 'furn_display_cabinet', kind: 'floor', renderKey: 'wynDisplayCabinet', scale: 2 },
  { itemId: 'furn_wall_tapestry', kind: 'wall', renderKey: 'wynWallTapestry', scale: 1.6 },
  { itemId: 'furn_globe_stand', kind: 'floor', renderKey: 'wynGlobeStand', scale: 1.2 },
  { itemId: 'furn_noble_carpet', kind: 'rug', renderKey: 'wynNobleCarpet', scale: 0.04 },
  // The Wyndlewood crafter family (assets_src/wyndlewood_props/furniture_catalog.json).
  { itemId: 'furn_tool_rack', kind: 'wall', renderKey: 'wynToolRack', scale: 1.2 },
  { itemId: 'furn_sawhorse', kind: 'floor', renderKey: 'wynSawhorse', scale: 0.75 },
  { itemId: 'furn_potting_bench', kind: 'floor', renderKey: 'wynPottingBench', scale: 1.2 },
  { itemId: 'furn_spool_rack', kind: 'floor', renderKey: 'wynSpoolRack', scale: 1.4 },
  { itemId: 'furn_herb_drying_rack', kind: 'floor', renderKey: 'wynHerbDryingRack', scale: 1.6 },
  // The Wyndlewood rustic family (assets_src/wyndlewood_props/furniture_catalog.json).
  { itemId: 'furn_woven_rug_painted', kind: 'rug', renderKey: 'wynWovenRugPainted', scale: 0.05 },
  // The Wyndlewood noble family (assets_src/wyndlewood_props/furniture_catalog.json).
  { itemId: 'furn_noble_wardrobe', kind: 'floor', renderKey: 'wynNobleWardrobe', scale: 2.2 },
  { itemId: 'furn_candelabra', kind: 'table', renderKey: 'wynCandelabra', scale: 0.6 },
  // The Wyndlewood crafter family (assets_src/wyndlewood_props/furniture_catalog.json).
  { itemId: 'furn_crate_stack', kind: 'floor', renderKey: 'wynCrateStack', scale: 1.3 },
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
  furn_rustic_wardrobe: furnitureItem('furn_rustic_wardrobe', 'Plank Wardrobe', 24),
  furn_rustic_cupboard: furnitureItem('furn_rustic_cupboard', 'Kitchen Cupboard', 16),
  furn_straw_cot: furnitureItem('furn_straw_cot', 'Straw Cot', 12),
  furn_wash_stand: furnitureItem('furn_wash_stand', 'Wash Stand', 12),
  furn_log_basket: furnitureItem('furn_log_basket', 'Log Basket', 9),
  furn_peg_rail: furnitureItem('furn_peg_rail', 'Peg Rail', 8),
  furn_water_jug: furnitureItem('furn_water_jug', 'Water Jug', 7),
  furn_bread_board: furnitureItem('furn_bread_board', 'Bread Board', 4),
  furn_cottage_armchair: furnitureItem('furn_cottage_armchair', 'Cottage Armchair', 19),
  furn_rocking_chair: furnitureItem('furn_rocking_chair', 'Rocking Chair', 16),
  furn_cottage_dresser: furnitureItem('furn_cottage_dresser', 'Cottage Dresser', 24),
  furn_painted_wardrobe: furnitureItem('furn_painted_wardrobe', 'Painted Wardrobe', 25),
  furn_quilt_chest: furnitureItem('furn_quilt_chest', 'Quilt Chest', 16),
  furn_side_table: furnitureItem('furn_side_table', 'Side Table', 9),
  furn_flower_stand: furnitureItem('furn_flower_stand', 'Flower Stand', 9),
  furn_wall_clock: furnitureItem('furn_wall_clock', 'Wall Clock', 12),
  furn_landscape_painting: furnitureItem('furn_landscape_painting', 'Landscape Painting', 10),
  furn_potted_flowers: furnitureItem('furn_potted_flowers', 'Potted Flowers', 6),
  furn_tea_set: furnitureItem('furn_tea_set', 'Tea Set', 7),
  furn_rag_runner: furnitureItem('furn_rag_runner', 'Rag Runner', 9),
  furn_canopy_bed: furnitureItem('furn_canopy_bed', 'Canopy Bed', 154),
  furn_highback_chair: furnitureItem('furn_highback_chair', 'High-Backed Chair', 39),
  furn_banquet_table: furnitureItem('furn_banquet_table', 'Banquet Table', 45),
  furn_writing_desk: furnitureItem('furn_writing_desk', 'Writing Desk', 74),
  furn_velvet_settee: furnitureItem('furn_velvet_settee', 'Velvet Settee', 79),
  furn_display_cabinet: furnitureItem('furn_display_cabinet', 'Display Cabinet', 112),
  furn_wall_tapestry: furnitureItem('furn_wall_tapestry', 'Stag Tapestry', 50),
  furn_globe_stand: furnitureItem('furn_globe_stand', 'Globe Stand', 43),
  furn_noble_carpet: furnitureItem('furn_noble_carpet', 'Manor Carpet', 24),
  furn_tool_rack: furnitureItem('furn_tool_rack', 'Tool Rack', 12),
  furn_sawhorse: furnitureItem('furn_sawhorse', 'Sawhorse', 7),
  furn_potting_bench: furnitureItem('furn_potting_bench', 'Potting Bench', 12),
  furn_spool_rack: furnitureItem('furn_spool_rack', 'Spool Rack', 12),
  furn_herb_drying_rack: furnitureItem('furn_herb_drying_rack', 'Herb Drying Rack', 11),
  furn_woven_rug_painted: furnitureItem('furn_woven_rug_painted', 'Oval Wool Rug', 16),
  furn_noble_wardrobe: furnitureItem('furn_noble_wardrobe', 'Carved Wardrobe', 146),
  furn_candelabra: furnitureItem('furn_candelabra', 'Candelabra', 12),
  furn_crate_stack: furnitureItem('furn_crate_stack', 'Crate Stack', 14),
};
