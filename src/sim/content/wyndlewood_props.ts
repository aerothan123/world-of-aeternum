// The Wyndlewood props kit: every generated painted model the props crew
// ships (assets_src/wyndlewood_props/kit.json), by STABLE MODEL ID. The file
// is public/models/props/wyn_<id>.glb and its props registry key is `propKey`
// (src/render/wyndlewood_props.ts joins them into PROP_ASSET_DEFS), so a
// zone's decorProps, an interaction record or a furniture def names a model
// by key and never by path.
//
// The numbers are MEASURED off the shipped files (tests/wyndlewood_props_
// assets.test.ts pins them): `propHeight` is the normalized model height in
// yards and `w`/`d` its ground extents at that height, so a placement that
// stands a model at height h scales it by h / propHeight and sizes a collider
// from w and d times that scale. Every model is floor-seated (min y 0),
// centred on x/z, with the concept's front turned to +z.
//
// Categories: `quest` (Chapter One quest objects and landmarks), `furniture`
// (drawn inside a player house through content/furniture.ts FurnitureDef
// renderKey), and the world dressing families: `ruin` and `shrine` (the Age of
// First Hearths), `bridge`, `accord` (unnamed Pale Accord traces) and
// `outpost` (faction outpost dressing). Everything but furniture is placed by
// the story, town and world crews through their own content records, never
// here.
//
// Data only: no placement, no collider, no player-visible text. Ids and keys
// are append-only once shipped, because placements and furniture records
// name them.

export type WynPropCategory =
  | 'quest'
  | 'furniture'
  | 'ruin'
  | 'shrine'
  | 'bridge'
  | 'accord'
  | 'outpost';

export interface WynPropModel {
  /** The shipped file (public/ relative URL). */
  readonly url: string;
  /** The props registry key (PROP_ASSET_DEFS). */
  readonly propKey: string;
  readonly category: WynPropCategory;
  /** Normalized model height (yards). */
  readonly propHeight: number;
  /** Ground extents at propHeight (yards). */
  readonly w: number;
  readonly d: number;
}

function wynModel(
  id: string,
  propKey: string,
  category: WynPropCategory,
  propHeight: number,
  w: number,
  d: number,
): WynPropModel {
  return { url: `/models/props/wyn_${id}.glb`, propKey, category, propHeight, w, d };
}

export const WYN_PROP_MODELS = {
  // Chapter One quest objects and landmarks (story crew places them).
  quest_northern_beacon: wynModel(
    'quest_northern_beacon',
    'wynNorthernBeacon',
    'quest',
    7,
    4.86,
    6.75,
  ),
  quest_broken_lifeboat: wynModel(
    'quest_broken_lifeboat',
    'wynBrokenLifeboat',
    'quest',
    1.3,
    1.83,
    2.43,
  ),
  quest_supply_bundle: wynModel('quest_supply_bundle', 'wynSupplyBundle', 'quest', 0.55, 0.68, 0.7),
  quest_wreck_crate: wynModel('quest_wreck_crate', 'wynWreckCrate', 'quest', 0.7, 0.99, 0.96),
  quest_crab_pot: wynModel('quest_crab_pot', 'wynCrabPot', 'quest', 0.6, 0.82, 0.83),
  quest_beached_skiff: wynModel('quest_beached_skiff', 'wynBeachedSkiff', 'quest', 1.5, 3.15, 3.74),
  quest_walkway_gap: wynModel('quest_walkway_gap', 'wynWalkwayGap', 'quest', 0.8, 1.54, 1.31),
  quest_walkway_panel: wynModel(
    'quest_walkway_panel',
    'wynWalkwayPanel',
    'quest',
    0.25,
    0.55,
    0.66,
  ),
  quest_grave_lamp_unlit: wynModel(
    'quest_grave_lamp_unlit',
    'wynGraveLampUnlit',
    'quest',
    0.95,
    0.34,
    0.34,
  ),
  quest_grave_lamp_bound: wynModel(
    'quest_grave_lamp_bound',
    'wynGraveLampBound',
    'quest',
    1.15,
    0.29,
    0.3,
  ),
  quest_name_stone: wynModel('quest_name_stone', 'wynNameStone', 'quest', 0.8, 0.45, 0.33),
  quest_bone_pit: wynModel('quest_bone_pit', 'wynBonePit', 'quest', 1, 2.36, 2.35),
  quest_eastbrook_quest_board: wynModel(
    'quest_eastbrook_quest_board',
    'wynEastbrookQuestBoard',
    'quest',
    3.4,
    2.36,
    1.44,
  ),
  quest_housing_noticeboard: wynModel(
    'quest_housing_noticeboard',
    'wynHousingNoticeboard',
    'quest',
    2.4,
    1.31,
    1.07,
  ),
  quest_pantry_saucer: wynModel(
    'quest_pantry_saucer',
    'wynPantrySaucer',
    'quest',
    0.12,
    0.18,
    0.18,
  ),
  quest_speaking_pipe: wynModel('quest_speaking_pipe', 'wynSpeakingPipe', 'quest', 0.9, 0.99, 0.36),
  quest_hollow_crypt_entrance: wynModel(
    'quest_hollow_crypt_entrance',
    'wynHollowCryptEntrance',
    'quest',
    6,
    8.35,
    8.35,
  ),
  quest_crypt_outer_wicket: wynModel(
    'quest_crypt_outer_wicket',
    'wynCryptOuterWicket',
    'quest',
    2.2,
    4.09,
    0.95,
  ),
  quest_boundary_stone: wynModel(
    'quest_boundary_stone',
    'wynBoundaryStone',
    'quest',
    1.3,
    0.38,
    0.29,
  ),
  // Housing furniture (content/furniture.ts names these keys as renderKeys).
  furn_cottage_bed: wynModel('furn_cottage_bed', 'wynCottageBed', 'furniture', 1.3, 1.59, 1.49),
  furn_cottage_table: wynModel(
    'furn_cottage_table',
    'wynCottageTable',
    'furniture',
    0.85,
    1.26,
    1.54,
  ),
  furn_cottage_chair: wynModel(
    'furn_cottage_chair',
    'wynCottageChair',
    'furniture',
    1.1,
    0.83,
    0.86,
  ),
  furn_small_storage_chest: wynModel(
    'furn_small_storage_chest',
    'wynSmallStorageChest',
    'furniture',
    0.75,
    0.7,
    0.52,
  ),
  furn_folding_worktable: wynModel(
    'furn_folding_worktable',
    'wynFoldingWorktable',
    'furniture',
    1,
    1.4,
    0.69,
  ),
  furn_braided_rug: wynModel('furn_braided_rug', 'wynBraidedRug', 'furniture', 0.05, 1.8, 2.6),
  furn_table_lantern: wynModel(
    'furn_table_lantern',
    'wynTableLantern',
    'furniture',
    0.45,
    0.32,
    0.4,
  ),
  accord_bound_stakes: wynModel('accord_bound_stakes', 'wynBoundStakes', 'accord', 0.8, 0.33, 0.36),
  accord_chalk_ring: wynModel('accord_chalk_ring', 'wynChalkRing', 'accord', 0.3, 3.42, 3.38),
  accord_cord_crate: wynModel('accord_cord_crate', 'wynCordCrate', 'accord', 0.6, 0.63, 0.63),
  accord_hidden_cache: wynModel(
    'accord_hidden_cache',
    'wynHiddenCache',
    'accord',
    0.45,
    1.06,
    1.26,
  ),
  accord_lamp_hook: wynModel('accord_lamp_hook', 'wynLampHook', 'accord', 1.6, 0.43, 0.88),
  accord_veil_thorn: wynModel('accord_veil_thorn', 'wynVeilThorn', 'accord', 1, 0.35, 0.48),
  accord_wax_blocks: wynModel('accord_wax_blocks', 'wynWaxBlocks', 'accord', 0.45, 0.4, 0.41),
  accord_wax_stone: wynModel('accord_wax_stone', 'wynWaxStone', 'accord', 0.4, 0.51, 0.36),
  bridge_plank_footbridge: wynModel(
    'bridge_plank_footbridge',
    'wynPlankFootbridge',
    'bridge',
    2,
    2.62,
    3.77,
  ),
  bridge_willow_footbridge: wynModel(
    'bridge_willow_footbridge',
    'wynWillowFootbridge',
    'bridge',
    1.8,
    1.87,
    3.66,
  ),
  furn_banquet_table: wynModel(
    'furn_banquet_table',
    'wynBanquetTable',
    'furniture',
    0.85,
    2.75,
    1.17,
  ),
  furn_bread_board: wynModel('furn_bread_board', 'wynBreadBoard', 'furniture', 0.2, 0.38, 0.26),
  furn_canopy_bed: wynModel('furn_canopy_bed', 'wynCanopyBed', 'furniture', 2.3, 1.53, 1.24),
  furn_cottage_armchair: wynModel(
    'furn_cottage_armchair',
    'wynCottageArmchair',
    'furniture',
    1.1,
    1.1,
    1.1,
  ),
  furn_cottage_dresser: wynModel(
    'furn_cottage_dresser',
    'wynCottageDresser',
    'furniture',
    2,
    1.38,
    0.93,
  ),
  furn_cottage_round_table: wynModel(
    'furn_cottage_round_table',
    'wynCottageRoundTable',
    'furniture',
    0.8,
    1.02,
    1.02,
  ),
  furn_cottage_shelf: wynModel(
    'furn_cottage_shelf',
    'wynCottageShelf',
    'furniture',
    1.8,
    1.74,
    1.07,
  ),
  furn_display_cabinet: wynModel(
    'furn_display_cabinet',
    'wynDisplayCabinet',
    'furniture',
    2,
    1.19,
    0.71,
  ),
  furn_flower_stand: wynModel('furn_flower_stand', 'wynFlowerStand', 'furniture', 1.1, 0.71, 0.7),
  furn_globe_stand: wynModel('furn_globe_stand', 'wynGlobeStand', 'furniture', 1.2, 0.93, 1.01),
  furn_herb_drying_rack: wynModel(
    'furn_herb_drying_rack',
    'wynHerbDryingRack',
    'furniture',
    1.6,
    0.31,
    1.31,
  ),
  furn_highback_chair: wynModel(
    'furn_highback_chair',
    'wynHighbackChair',
    'furniture',
    1.5,
    0.64,
    0.53,
  ),
  furn_home_apothecary: wynModel(
    'furn_home_apothecary',
    'wynHomeApothecary',
    'furniture',
    1.4,
    1.2,
    0.28,
  ),
  furn_home_forge: wynModel('furn_home_forge', 'wynHomeForge', 'furniture', 1.2, 0.49, 0.45),
  furn_home_kitchen: wynModel('furn_home_kitchen', 'wynHomeKitchen', 'furniture', 1.3, 1.25, 1.1),
  furn_landscape_painting: wynModel(
    'furn_landscape_painting',
    'wynLandscapePainting',
    'furniture',
    0.8,
    0.69,
    0.1,
  ),
  furn_log_basket: wynModel('furn_log_basket', 'wynLogBasket', 'furniture', 0.6, 0.56, 0.56),
  furn_noble_bookcase: wynModel(
    'furn_noble_bookcase',
    'wynNobleBookcase',
    'furniture',
    2.2,
    0.98,
    0.7,
  ),
  furn_noble_carpet: wynModel('furn_noble_carpet', 'wynNobleCarpet', 'furniture', 0.04, 2.2, 3.2),
  furn_painted_wardrobe: wynModel(
    'furn_painted_wardrobe',
    'wynPaintedWardrobe',
    'furniture',
    2,
    1.5,
    1.06,
  ),
  furn_peg_rail: wynModel('furn_peg_rail', 'wynPegRail', 'furniture', 0.9, 0.9, 0.44),
  furn_potted_flowers: wynModel(
    'furn_potted_flowers',
    'wynPottedFlowers',
    'furniture',
    0.45,
    0.4,
    0.37,
  ),
  furn_potting_bench: wynModel(
    'furn_potting_bench',
    'wynPottingBench',
    'furniture',
    1.2,
    0.9,
    0.83,
  ),
  furn_quilt_chest: wynModel('furn_quilt_chest', 'wynQuiltChest', 'furniture', 0.7, 1.26, 1.45),
  furn_rag_runner: wynModel('furn_rag_runner', 'wynRagRunner', 'furniture', 0.04, 1, 2.8),
  furn_rocking_chair: wynModel(
    'furn_rocking_chair',
    'wynRockingChair',
    'furniture',
    1.15,
    1.14,
    0.95,
  ),
  furn_rustic_barrel: wynModel('furn_rustic_barrel', 'wynRusticBarrel', 'furniture', 1, 0.8, 0.81),
  furn_rustic_bench: wynModel('furn_rustic_bench', 'wynRusticBench', 'furniture', 0.6, 0.93, 1.65),
  furn_rustic_chair: wynModel('furn_rustic_chair', 'wynRusticChair', 'furniture', 1.1, 0.72, 0.86),
  furn_rustic_cupboard: wynModel(
    'furn_rustic_cupboard',
    'wynRusticCupboard',
    'furniture',
    1.1,
    1.17,
    0.96,
  ),
  furn_rustic_stool: wynModel('furn_rustic_stool', 'wynRusticStool', 'furniture', 0.55, 0.32, 0.41),
  furn_rustic_wardrobe: wynModel(
    'furn_rustic_wardrobe',
    'wynRusticWardrobe',
    'furniture',
    2,
    1.66,
    1.66,
  ),
  furn_sawhorse: wynModel('furn_sawhorse', 'wynSawhorse', 'furniture', 0.75, 0.52, 0.34),
  furn_side_table: wynModel('furn_side_table', 'wynSideTable', 'furniture', 0.7, 0.62, 0.67),
  furn_spool_rack: wynModel('furn_spool_rack', 'wynSpoolRack', 'furniture', 1.4, 0.32, 0.32),
  furn_straw_cot: wynModel('furn_straw_cot', 'wynStrawCot', 'furniture', 0.7, 1.28, 1.4),
  furn_tea_set: wynModel('furn_tea_set', 'wynTeaSet', 'furniture', 0.25, 0.27, 0.27),
  furn_tool_rack: wynModel('furn_tool_rack', 'wynToolRack', 'furniture', 1.2, 0.55, 0.72),
  furn_velvet_settee: wynModel('furn_velvet_settee', 'wynVelvetSettee', 'furniture', 1, 0.66, 0.44),
  furn_wall_clock: wynModel('furn_wall_clock', 'wynWallClock', 'furniture', 0.55, 0.45, 0.07),
  furn_wall_tapestry: wynModel(
    'furn_wall_tapestry',
    'wynWallTapestry',
    'furniture',
    1.6,
    1.79,
    0.11,
  ),
  furn_wash_stand: wynModel('furn_wash_stand', 'wynWashStand', 'furniture', 1.05, 0.89, 0.87),
  furn_water_jug: wynModel('furn_water_jug', 'wynWaterJug', 'furniture', 0.32, 0.21, 0.25),
  furn_woven_rug_painted: wynModel(
    'furn_woven_rug_painted',
    'wynWovenRugPainted',
    'furniture',
    0.05,
    2.2,
    3,
  ),
  furn_writing_desk: wynModel('furn_writing_desk', 'wynWritingDesk', 'furniture', 1.1, 0.43, 0.57),
  outpost_bracken_banner: wynModel(
    'outpost_bracken_banner',
    'wynBrackenBanner',
    'outpost',
    3,
    2.05,
    1.66,
  ),
  outpost_bracken_planters: wynModel(
    'outpost_bracken_planters',
    'wynBrackenPlanters',
    'outpost',
    0.7,
    1.13,
    0.72,
  ),
  outpost_bracken_seed_shrine: wynModel(
    'outpost_bracken_seed_shrine',
    'wynBrackenSeedShrine',
    'outpost',
    1,
    0.55,
    0.57,
  ),
  outpost_bracken_totem: wynModel(
    'outpost_bracken_totem',
    'wynBrackenTotem',
    'outpost',
    2.6,
    0.7,
    0.5,
  ),
  outpost_gilt_banner: wynModel('outpost_gilt_banner', 'wynGiltBanner', 'outpost', 3, 0.69, 1.29),
  outpost_gilt_ledger: wynModel('outpost_gilt_ledger', 'wynGiltLedger', 'outpost', 1.3, 0.5, 1.12),
  outpost_hearthwright_banner: wynModel(
    'outpost_hearthwright_banner',
    'wynHearthwrightBanner',
    'outpost',
    3,
    1.34,
    0.59,
  ),
  outpost_hearthwright_cart: wynModel(
    'outpost_hearthwright_cart',
    'wynHearthwrightCart',
    'outpost',
    1.4,
    2.22,
    1.31,
  ),
  outpost_hearthwright_scaffold: wynModel(
    'outpost_hearthwright_scaffold',
    'wynHearthwrightScaffold',
    'outpost',
    3,
    2.38,
    2.31,
  ),
  outpost_hearthwright_stones: wynModel(
    'outpost_hearthwright_stones',
    'wynHearthwrightStones',
    'outpost',
    0.9,
    1.28,
    1.1,
  ),
  outpost_warden_brazier: wynModel(
    'outpost_warden_brazier',
    'wynWardenBrazier',
    'outpost',
    1.4,
    1.38,
    1.63,
  ),
  outpost_warden_rack: wynModel('outpost_warden_rack', 'wynWardenRack', 'outpost', 1.8, 0.94, 0.68),
  ruin_foundation_stones: wynModel(
    'ruin_foundation_stones',
    'wynFoundationStones',
    'ruin',
    0.6,
    1.49,
    1.32,
  ),
  ruin_hall_wall: wynModel('ruin_hall_wall', 'wynHallWall', 'ruin', 4, 1.85, 7.33),
  ruin_hearth_arch: wynModel('ruin_hearth_arch', 'wynHearthArch', 'ruin', 5, 5.31, 3),
  ruin_hearth_ring: wynModel('ruin_hearth_ring', 'wynHearthRing', 'ruin', 0.45, 1.31, 1.31),
  ruin_hearthstone: wynModel('ruin_hearthstone', 'wynHearthstone', 'ruin', 1.2, 0.6, 0.63),
  ruin_toppled_pillar: wynModel('ruin_toppled_pillar', 'wynToppledPillar', 'ruin', 0.9, 7.24, 7.28),
  shrine_cairn: wynModel('shrine_cairn', 'wynCairn', 'shrine', 1, 0.68, 0.53),
  shrine_first_hearth: wynModel('shrine_first_hearth', 'wynFirstHearth', 'shrine', 2.2, 2.2, 1.81),
  shrine_offering_bowl: wynModel(
    'shrine_offering_bowl',
    'wynOfferingBowl',
    'shrine',
    1,
    0.46,
    0.46,
  ),
  shrine_standing_stone: wynModel(
    'shrine_standing_stone',
    'wynStandingStone',
    'shrine',
    2.2,
    0.52,
    0.67,
  ),
  bridge_stone_arch: wynModel('bridge_stone_arch', 'wynStoneArch', 'bridge', 4, 3.34, 6.25),
  // fill_rows: new rows land above this line (scripts/assets/wyndlewood_props/fill_rows.mjs).
} as const satisfies Record<string, WynPropModel>;

export type WynPropModelId = keyof typeof WYN_PROP_MODELS;

/** Every shipped model id, in authoring order. */
export const WYN_PROP_MODEL_IDS = Object.keys(WYN_PROP_MODELS) as WynPropModelId[];
