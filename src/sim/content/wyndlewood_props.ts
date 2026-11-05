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
  quest_northern_beacon: wynModel('quest_northern_beacon', 'wynNorthernBeacon', 'quest', 7, 4.86, 6.75),
  quest_broken_lifeboat: wynModel('quest_broken_lifeboat', 'wynBrokenLifeboat', 'quest', 1.3, 1.83, 2.43),
  quest_supply_bundle: wynModel('quest_supply_bundle', 'wynSupplyBundle', 'quest', 0.55, 0.68, 0.7),
  quest_wreck_crate: wynModel('quest_wreck_crate', 'wynWreckCrate', 'quest', 0.7, 0.99, 0.96),
  quest_crab_pot: wynModel('quest_crab_pot', 'wynCrabPot', 'quest', 0.6, 0.82, 0.83),
  quest_beached_skiff: wynModel('quest_beached_skiff', 'wynBeachedSkiff', 'quest', 1.5, 3.15, 3.74),
  quest_walkway_gap: wynModel('quest_walkway_gap', 'wynWalkwayGap', 'quest', 0.8, 1.54, 1.31),
  quest_walkway_panel: wynModel('quest_walkway_panel', 'wynWalkwayPanel', 'quest', 0.25, 0.55, 0.66),
  quest_grave_lamp_unlit: wynModel('quest_grave_lamp_unlit', 'wynGraveLampUnlit', 'quest', 0.95, 0.34, 0.34),
  quest_grave_lamp_bound: wynModel('quest_grave_lamp_bound', 'wynGraveLampBound', 'quest', 1.15, 0.29, 0.3),
  quest_name_stone: wynModel('quest_name_stone', 'wynNameStone', 'quest', 0.8, 0.45, 0.33),
  quest_bone_pit: wynModel('quest_bone_pit', 'wynBonePit', 'quest', 1, 2.36, 2.35),
  quest_eastbrook_quest_board: wynModel('quest_eastbrook_quest_board', 'wynEastbrookQuestBoard', 'quest', 3.4, 2.36, 1.44),
  quest_housing_noticeboard: wynModel('quest_housing_noticeboard', 'wynHousingNoticeboard', 'quest', 2.4, 1.31, 1.07),
  quest_pantry_saucer: wynModel('quest_pantry_saucer', 'wynPantrySaucer', 'quest', 0.12, 0.18, 0.18),
  quest_speaking_pipe: wynModel('quest_speaking_pipe', 'wynSpeakingPipe', 'quest', 0.9, 0.99, 0.36),
  quest_hollow_crypt_entrance: wynModel('quest_hollow_crypt_entrance', 'wynHollowCryptEntrance', 'quest', 6, 8.35, 8.35),
  quest_crypt_outer_wicket: wynModel('quest_crypt_outer_wicket', 'wynCryptOuterWicket', 'quest', 2.2, 4.09, 0.95),
  quest_boundary_stone: wynModel('quest_boundary_stone', 'wynBoundaryStone', 'quest', 1.3, 0.38, 0.29),
  // Housing furniture (content/furniture.ts names these keys as renderKeys).
  furn_cottage_bed: wynModel('furn_cottage_bed', 'wynCottageBed', 'furniture', 1.3, 1.59, 1.49),
  furn_cottage_table: wynModel('furn_cottage_table', 'wynCottageTable', 'furniture', 0.85, 1.26, 1.54),
  furn_cottage_chair: wynModel('furn_cottage_chair', 'wynCottageChair', 'furniture', 1.1, 0.83, 0.86),
  furn_cottage_shelf: wynModel('furn_cottage_shelf', 'wynCottageShelf', 'furniture', 1.8, 1.07, 1.74),
  furn_small_storage_chest: wynModel('furn_small_storage_chest', 'wynSmallStorageChest', 'furniture', 0.75, 0.7, 0.52),
  furn_folding_worktable: wynModel('furn_folding_worktable', 'wynFoldingWorktable', 'furniture', 1, 1.4, 0.69),
  furn_braided_rug: wynModel('furn_braided_rug', 'wynBraidedRug', 'furniture', 0.05, 1.8, 2.6),
  furn_table_lantern: wynModel('furn_table_lantern', 'wynTableLantern', 'furniture', 0.45, 0.32, 0.4),
  // fill_rows: new rows land above this line (scripts/assets/wyndlewood_props/fill_rows.mjs).
} as const satisfies Record<string, WynPropModel>;

export type WynPropModelId = keyof typeof WYN_PROP_MODELS;

/** Every shipped model id, in authoring order. */
export const WYN_PROP_MODEL_IDS = Object.keys(WYN_PROP_MODELS) as WynPropModelId[];
