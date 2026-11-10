// Wyndlewood Chapter One, "The Shore That Remembers" (levels 1 to 4): the
// owner's quest set (docs/narrative/chapter_one_quests.txt), data only. Ids are
// c1_<nn>_<slug> after the owner's numbering. The shipped Gravecaller chain
// (zone1.ts q_bones onward, ids frozen) is the Pale Accord's work reframed in
// prose; this chapter is its prologue and ends at the Hollow Crypt's sealed
// door without opening it (c1_28_door_left_shut).
//
// Placement: every object, camp and NPC position below was picked with the
// worktree's own terrain and collider queries (dry ground, unblocked) and is
// pinned by tests/chapter_one_content.test.ts. Eastbrook spots sit on the
// town's edges and outskirts, outside the hub buildings the town relayout
// owns; docs/narrative/chapter_one_placements.md lists them for reconciling.
//
// Ground objects use reserved high entity ids (2_147_200_xxx) and camps spawn
// offStream, so nothing here shifts the sequential allocator or the world-gen
// rng stream of any shipped content.

import type { QuestCatchSpot } from '../quests/quest_fishing_catch';
import { BOARD_DAILY_STANDING, questStandingReward } from '../quests/quest_standing_reward';
import type { TownBoardDef } from '../town_board/town_board_rotation';
import type {
  CampDef,
  EscortDef,
  GroundObjectDef,
  ItemDef,
  MobTemplate,
  NpcDef,
  QuestDef,
  QuestObjective,
} from '../types';
import { XP_TABLE } from '../types';
import { HOUSE_STORAGE_CHEST_ITEM_ID } from './furniture';
import { OATHLESS_KING_TITLE } from './wyndlewood_lore';
import { ZONE1_MOBS } from './zone1';

/** Wenna's worktable (quest 23) is a real piece of house furniture: the
 *  housing system's Long Table (content/furniture.ts, a floor piece), so the
 *  player keeps it and can place it in their own house later
 *  (housing/furnishing.ts). The quest's storage chest is likewise the real
 *  housing storage chest. */
export const C1_WORKTABLE_ITEM_ID = 'furn_long_table';

/** Fishing spots that land a quest's own catch (quests/quest_fishing_catch.ts).
 *  Both face open sea, which ordinary fishing keeps unfishable by design: the
 *  spot accepts the cast only while its quest still wants the catch
 *  (questCatchWaterAhead). Stand points from the worktree's own terrain query
 *  (dry ground with deep sea within 12 yards). */
export const QUEST_CATCH_SPOTS: readonly QuestCatchSpot[] = Object.freeze([
  // Tobbin's jetty on the Proving Shore (quest 03).
  { itemId: 'c1_shore_minnow', x: -273.5, z: 5.5, radius: 6 },
  // Eastbrook's town fishing steps on the riverside walk (quest 27).
  { itemId: 'c1_brook_trout', x: -94, z: -60, radius: 6 },
]);

// ---------------------------------------------------------------------------
// Rewards (the vale's own story-quest curve, zone1.ts q_wolves 250 XP at level
// 1 to q_mine 620 at level 4; copper on the same ladder) and board dailies (the
// shared world-quest schedule: 12 percent of the posting level's XP bar,
// content/world_quests.ts WORLD_QUEST_XP_RATE, and 50 copper a level).
// ---------------------------------------------------------------------------

const STORY_XP: Readonly<Record<number, number>> = { 1: 200, 2: 400, 3: 520, 4: 650 };
const STORY_COPPER: Readonly<Record<number, number>> = { 1: 60, 2: 120, 3: 180, 4: 220 };
export const BOARD_DAILY_XP_RATE = 0.12;
export const BOARD_DAILY_COPPER_PER_LEVEL = 50;

export function boardDailyXp(level: number): number {
  return Math.round(XP_TABLE[level - 1] * BOARD_DAILY_XP_RATE);
}

type Faction = 'lanternwardens' | 'hearthwright_compact' | 'bracken_circle' | 'gilt_measure';

// ---------------------------------------------------------------------------
// New townsfolk (template ids are new; display names IP-checked, see the
// naming notes in docs/narrative/wyndlewood_decisions.md).
// ---------------------------------------------------------------------------

export const C1_NERIS = 'scout_neris';
export const C1_HOLVEN = 'gravekeeper_holven';
export const C1_JORREN = 'innkeeper_jorren';
export const C1_OLVESSA = 'herbalist_olvessa';
export const C1_DELLA = 'gardener_della';
export const C1_PELLA = 'carpenter_pella';
export const C1_TOBBIN = 'fisherman_tobbin';
// Existing townsfolk the chapter uses (display names renamed, ids frozen).
const FENLOW = 'ferryman_odo';
const ALDRIC = 'brother_aldric';
const IVARA = 'apothecary_lin';
const CORREN = 'marshal_redbrook';
const SILVEN = 'trader_wilkes';
const BRUNNA = 'forgemistress_darva';

function npc(
  id: string,
  name: string,
  title: string,
  pos: { x: number; z: number },
  facing: number,
  color: number,
  greeting: string,
): NpcDef {
  return { id, name, title, pos, facing, color, questIds: [], greeting };
}

export const CHAPTER_ONE_NPCS: Record<string, NpcDef> = {
  [C1_NERIS]: npc(
    C1_NERIS,
    'Neris Snowmantle',
    'Lanternwarden Scout',
    { x: 75, z: -40 },
    Math.PI,
    0x6f8fa8,
    'If the snow speaks, do not answer. Down here it is mostly the hedges, and they talk a great deal.',
  ),
  [C1_HOLVEN]: npc(
    C1_HOLVEN,
    'Bertram Ashcombe',
    'Gravekeeper',
    { x: 25, z: -106 },
    -Math.PI / 2,
    0x5d5348,
    'Mind the paths between the stones. The ones beneath them have earned their quiet.',
  ),
  [C1_JORREN]: npc(
    C1_JORREN,
    'Jorren',
    'Innkeeper',
    { x: 12, z: -84 },
    Math.PI,
    0xa0522d,
    'It could be worse. Usually is. Sit, eat, and tell me which way the trouble is walking today.',
  ),
  [C1_OLVESSA]: npc(
    C1_OLVESSA,
    'Olvessa',
    'Herb Terrace Keeper',
    { x: -38, z: -77 },
    0,
    0x6b8e23,
    'Mud remembers every footprint, and so do the herbs. Tread kindly here.',
  ),
  [C1_DELLA]: npc(
    C1_DELLA,
    'Della Brindlepot',
    'Gardener',
    { x: -13.2, z: -72.8 },
    Math.PI / 2,
    0xc49a6c,
    'If it grows, I have argued with it. If it grows well, I won.',
  ),
  [C1_PELLA]: npc(
    C1_PELLA,
    'Wenna Nookwright',
    'Carpenter',
    { x: -45, z: -87 },
    Math.PI / 2,
    0x8b6b4a,
    'Measure twice, panic once. Then measure again, just to be safe.',
  ),
  [C1_TOBBIN]: npc(
    C1_TOBBIN,
    'Tobbin Wickerby',
    'Fisherman',
    { x: -278, z: -4 },
    Math.PI,
    0x4f7f8f,
    'Never trust a fish with good manners. The polite ones are planning something.',
  ),
};

// ---------------------------------------------------------------------------
// New creatures and the Pale Accord's local cell.
// ---------------------------------------------------------------------------

const base = ZONE1_MOBS;

export const CHAPTER_ONE_MOBS: Record<string, MobTemplate> = {
  bristlejaw_shore_rat: {
    ...base.tunnel_rat,
    id: 'bristlejaw_shore_rat',
    name: 'Bristlejaw Shore Rat',
    minLevel: 1,
    maxLevel: 1,
    aggroRadius: 7,
    loot: [{ copper: 3, chance: 1 }],
  },
  gravestirred_fieldhand: {
    ...base.restless_bones,
    id: 'gravestirred_fieldhand',
    name: 'Gravestirred Fieldhand',
    minLevel: 3,
    maxLevel: 3,
    aggroRadius: 9,
    loot: [
      { copper: 12, chance: 1 },
      { itemId: 'bone_fragments', chance: 0.4 },
    ],
  },
  briarbitten_fox: {
    ...base.forest_wolf,
    id: 'briarbitten_fox',
    name: 'Briarbitten Fox',
    minLevel: 3,
    maxLevel: 4,
    // Draws on the wolf body in a tan tint that already has a committed guide
    // still, until the creature crew's fox model lands under this stable id.
    color: 0x8c8270,
    loot: [{ copper: 8, chance: 1 }],
  },
  orchard_boar: {
    ...base.wild_boar,
    id: 'orchard_boar',
    name: 'Orchard Boar',
    minLevel: 4,
    maxLevel: 4,
    loot: [
      { copper: 10, chance: 1 },
      { itemId: 'c1_stolen_lunch_basket', chance: 0.6, questId: 'c1_24_sandwich_emergency' },
    ],
  },
  veiled_rite_tender: {
    ...base.vale_bandit,
    id: 'veiled_rite_tender',
    name: 'Veiled Rite Tender',
    minLevel: 4,
    maxLevel: 4,
    color: 0xcfcfd8,
    loot: [
      { copper: 20, chance: 1 },
      { itemId: 'c1_instruction_sheet', chance: 1, questId: 'c1_25_someone_teaching' },
    ],
  },
  culvert_rat: {
    ...base.tunnel_rat,
    id: 'culvert_rat',
    name: 'Culvert Rat',
    minLevel: 2,
    maxLevel: 2,
    loot: [{ copper: 5, chance: 1 }],
  },
  quarry_burrower: {
    ...base.tunnel_rat,
    id: 'quarry_burrower',
    name: 'Quarry Burrower',
    minLevel: 3,
    maxLevel: 3,
    loot: [{ copper: 8, chance: 1 }],
  },
};

export const CHAPTER_ONE_CAMPS: CampDef[] = [
  {
    mobId: 'bristlejaw_shore_rat',
    center: { x: -312.4, z: 64.6 },
    radius: 5,
    count: 3,
    offStream: true,
  },
  // Hub safe zone pass (owner, 2026-11): the five camps below spawned inside
  // or against Eastbrook itself. Each now keeps its disc 60 yd beyond the town
  // edge and 25 yd clear of every house-lot door and quest or service NPC
  // (tests/hub_safe_zone.test.ts); the quest props they guard stay in town,
  // so every objective is still reachable, and only the hostiles moved out.
  {
    mobId: 'gravestirred_fieldhand',
    center: { x: 77, z: -125 },
    radius: 7,
    count: 4,
    offStream: true,
  },
  { mobId: 'briarbitten_fox', center: { x: -30, z: 82 }, radius: 7, count: 4, offStream: true },
  { mobId: 'orchard_boar', center: { x: 71, z: -143 }, radius: 8, count: 4, offStream: true },
  { mobId: 'veiled_rite_tender', center: { x: 107, z: -41 }, radius: 5, count: 3, offStream: true },
  { mobId: 'culvert_rat', center: { x: -109, z: -98 }, radius: 7, count: 5, offStream: true },
  { mobId: 'quarry_burrower', center: { x: 5, z: 175 }, radius: 7, count: 4, offStream: true },
];

// ---------------------------------------------------------------------------
// Quest items and the world objects that hold or answer them.
// ---------------------------------------------------------------------------

function qi(id: string, name: string, questId: string, stackSize?: number): ItemDef {
  return {
    id,
    name,
    kind: 'quest',
    sellValue: 0,
    questId,
    ...(stackSize ? { stackSize } : {}),
  };
}

export const CHAPTER_ONE_ITEMS: Record<string, ItemDef> = {
  c1_dry_supply_bundle: qi('c1_dry_supply_bundle', 'Dry Supply Bundle', 'c1_01_arrival', 3),
  c1_black_wick_knot: qi('c1_black_wick_knot', 'Black Wick Knot', 'c1_02_beacon_lied', 2),
  c1_wrapped_beacon_sample: qi('c1_wrapped_beacon_sample', 'Wrapped Beacon Sample', 'c1_07_across'),
  c1_beacon_thread_sample: qi('c1_beacon_thread_sample', 'Beacon Thread Sample', 'c1_08_vouch'),
  c1_bait_herring: qi('c1_bait_herring', 'Bait Herring', 'c1_06_admiral_crabs'),
  c1_salt_crumpled_hat: qi('c1_salt_crumpled_hat', 'Salt-Crumpled Hat', 'c1_06_admiral_crabs'),
  c1_heavy_parcel: qi('c1_heavy_parcel', 'Heavy Parcel', 'c1_10_handle_doubt'),
  c1_soft_parcel: qi('c1_soft_parcel', 'Soft Parcel', 'c1_10_handle_doubt'),
  c1_healthy_turnip: qi('c1_healthy_turnip', 'Healthy Turnip', 'c1_11_cold_garden', 4),
  c1_blackened_root_sample: qi(
    'c1_blackened_root_sample',
    'Blackened Root Sample',
    'c1_11_cold_garden',
    3,
  ),
  c1_waxed_root_tie: qi('c1_waxed_root_tie', 'Waxed Root Tie', 'c1_12_tied_to_root', 2),
  c1_meadow_balm_leaf: qi('c1_meadow_balm_leaf', 'Meadow Balm Leaf', 'c1_12_tied_to_root', 3),
  c1_black_cloth_snag: qi('c1_black_cloth_snag', 'Black Cloth Snag', 'c1_13_flowers_down'),
  c1_unlit_grave_lamp: qi('c1_unlit_grave_lamp', 'Unlit Grave Lamp', 'c1_14_buried_tuesday'),
  c1_cold_silvermint_sprig: qi(
    'c1_cold_silvermint_sprig',
    'Cold Silvermint Sprig',
    'c1_15_warmth_missing',
    3,
  ),
  c1_waxed_binding: qi('c1_waxed_binding', 'Waxed Binding', 'c1_15_warmth_missing', 2),
  c1_dew_damp_cloth: qi('c1_dew_damp_cloth', 'Dew-Damp Cloth', 'c1_16_pick_the_choir', 3),
  c1_windwhistle_leaf: qi('c1_windwhistle_leaf', 'Windwhistle Leaf', 'c1_16_pick_the_choir', 3),
  c1_nibbled_rent_notice: qi('c1_nibbled_rent_notice', 'Nibbled Rent Notice', 'c1_18_three_knocks'),
  c1_bread_heel: qi('c1_bread_heel', 'Bread Heel', 'c1_19_guest_shelves'),
  c1_missing_pantry_key: qi('c1_missing_pantry_key', 'Missing Pantry Key', 'c1_19_guest_shelves'),
  c1_supplied_binding: qi('c1_supplied_binding', 'Waxed Binding Sample', 'c1_20_order_unsigned'),
  c1_amended_cart_tag: qi('c1_amended_cart_tag', 'Amended Cart Tag', 'c1_20_order_unsigned'),
  c1_discarded_face_veil: qi(
    'c1_discarded_face_veil',
    'Discarded Face Veil',
    'c1_21_watch_cannot_see',
    2,
  ),
  c1_stolen_lunch_basket: qi(
    'c1_stolen_lunch_basket',
    'Stolen Lunch Basket',
    'c1_24_sandwich_emergency',
    3,
  ),
  c1_instruction_sheet: qi(
    'c1_instruction_sheet',
    'Soot-Folded Instruction Sheet',
    'c1_25_someone_teaching',
  ),
  c1_founders_prayer_board: qi(
    'c1_founders_prayer_board',
    "Founders' Prayer Board",
    'c1_26_promise_paint',
    2,
  ),
  c1_sealed_watch_warning: qi(
    'c1_sealed_watch_warning',
    'Sealed Watch Warning',
    'c1_28_door_left_shut',
  ),
  // Board dailies' carried goods (one id per paired order).
  c1_rivet_packet: qi('c1_rivet_packet', 'Rivet Packet', 'c1_d07_receipt_rivets', 4),
  c1_hinge_bundle: qi('c1_hinge_bundle', 'Hinge Bundle', 'c1_d07_receipt_hinges', 4),
  c1_covered_stew_bowl: qi('c1_covered_stew_bowl', 'Covered Stew Bowl', 'c1_d08_lunch_stew', 4),
  c1_bread_bundle: qi('c1_bread_bundle', 'Bread Bundle', 'c1_d08_lunch_bread', 4),
  c1_dried_herb_packet: qi('c1_dried_herb_packet', 'Dried Herb Packet', 'c1_d09_parcels_herbs', 4),
  c1_reed_mulch_bundle: qi('c1_reed_mulch_bundle', 'Reed Mulch Bundle', 'c1_d09_parcels_mulch', 4),
  c1_lantern_oil_cup: qi('c1_lantern_oil_cup', 'Lantern Oil Cup', 'c1_d11_light_behind', 4),
  // Loaned tools: quest items the turn-in takes back (a plain collect
  // objective). The rod is a working fishing implement (use type 'fishing',
  // professions/tools.ts hasFishingImplement), so a new arrival can cast.
  c1_loan_fishing_rod: {
    id: 'c1_loan_fishing_rod',
    name: 'Loan Fishing Rod',
    kind: 'tool',
    quality: 'common',
    use: { type: 'fishing' },
    sellValue: 0,
    questId: 'c1_03_fish_consulted',
  },
  c1_shore_minnow: qi('c1_shore_minnow', 'Shore Minnow', 'c1_03_fish_consulted', 4),
  c1_loan_woodcutting_axe: qi(
    'c1_loan_woodcutting_axe',
    'Loan Woodcutting Axe',
    'c1_04_every_board',
  ),
  c1_shore_pine_log: qi('c1_shore_pine_log', 'Shore Pine Log', 'c1_04_every_board', 4),
  c1_deck_nails: qi('c1_deck_nails', 'Packet of Deck Nails', 'c1_05_solid_underfoot'),
  c1_walkway_panel: qi('c1_walkway_panel', 'Walkway Panel', 'c1_05_solid_underfoot', 2),
  c1_copper_ingot: qi('c1_copper_ingot', 'Copper Ingot', 'c1_09_buckles_glory', 2),
  c1_hinge_packet: qi('c1_hinge_packet', 'Hinge Packet', 'c1_22_place_you_keep'),
  c1_brook_trout: qi('c1_brook_trout', 'Brook Trout', 'c1_27_supper_despite', 2),
  c1_garden_carrot: qi('c1_garden_carrot', 'Garden Carrot', 'c1_27_supper_despite', 3),
  c1_supper_stew_bowl: qi('c1_supper_stew_bowl', 'Covered Stew Bowl', 'c1_27_supper_despite', 3),
};

/** Interact-only world objects (inspected or used, never picked up): sentinel
 *  item ids that name the object, with no bag presence. */
const INSPECT: Record<string, string> = {
  c1_broken_lifeboat: 'Broken Lifeboat',
  c1_northern_beacon: 'Northern Beacon',
  c1_empty_crab_pot: 'Empty Crab Pot',
  c1_frosted_fence_stake: 'Frosted Fence Stake',
  c1_disturbed_grave: 'Freshly Disturbed Grave',
  c1_name_stone: 'Overturned Name Stone',
  c1_windwhistle_patch: 'Windwhistle Flower Patch',
  c1_tapping_wall_panel: 'Tapping Wall Panel',
  c1_speaking_pipe: 'Disused Speaking Pipe',
  c1_pantry_saucer: 'Empty Pantry Saucer',
  c1_delivery_slip: 'Lamp-Supply Delivery Slip',
  c1_bound_grave_lamp: 'Bound Grave Lamp',
  c1_founding_map: 'Faded Founding Map',
  c1_reading_desk: 'Reading Desk',
  c1_boundary_warning: 'Boundary Warning',
  c1_outer_wicket: 'Outer Wicket',
  c1_road_checkpost: 'Road Checkpost',
  c1_quay_inspection_post: 'Quay Inspection Post',
  c1_watch_lantern: 'Watch Lantern',
  c1_water_level_gauge: 'Water-Level Gauge',
  // Stations and fixtures of the crafting and tool quests (the loaned tools,
  // nails and carrots are ordinary pickups, named by their own item ids).
  c1_keep_net: 'Floating Keep-Net',
  c1_marked_shore_pine: 'Marked Shore Pine',
  c1_timber_rack: 'Ferry Timber Rack',
  c1_ferry_workbench: 'Ferry Workbench',
  c1_walkway_gap: 'Walkway Gap',
  c1_public_furnace: "Brunna's Public Furnace",
  c1_pella_workbench: "Wenna's Public Workbench",
  c1_housing_noticeboard: 'Housing Noticeboard',
  c1_practice_marker: 'Furnishing Practice Marker',
  c1_inn_hearth: "The Inn's Public Hearth",
};
for (const [id, name] of Object.entries(INSPECT)) {
  CHAPTER_ONE_ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

/** Item art debt (src/ui/icons.ts ITEM_ART_PENDING): EMPTY since the painted
 *  wave chapter-one-painted-icons-2026-11-04 gave every chapter item and object
 *  id its WebP icon; the seam stays for the next chapter's park. */
export const CHAPTER_ONE_ART_PENDING_ITEM_IDS: readonly string[] = Object.freeze([]);

let nextObjectId = 2_147_200_000;
function obj(itemId: string, positions: { x: number; z: number }[]): GroundObjectDef {
  const ids = positions.map(() => nextObjectId++);
  return { itemId, name: CHAPTER_ONE_ITEMS[itemId].name, positions, entityIds: ids };
}

export const CHAPTER_ONE_OBJECTS: GroundObjectDef[] = [
  // The Proving Shore: the southern-beach wreck and the north headland beacon.
  obj('c1_dry_supply_bundle', [
    { x: -288, z: -34 },
    { x: -300, z: -36 },
    { x: -307.4, z: -28.6 },
    { x: -281.1, z: -36.9 },
    { x: -294, z: -42 },
  ]),
  obj('c1_broken_lifeboat', [{ x: -296, z: -30 }]),
  obj('c1_northern_beacon', [{ x: -320.7, z: 68.3 }]),
  obj('c1_black_wick_knot', [
    { x: -319.5, z: 67.2 },
    { x: -321.9, z: 69.6 },
  ]),
  obj('c1_bait_herring', [{ x: -281, z: -6 }]),
  obj('c1_empty_crab_pot', [{ x: -272.6, z: -12.6 }]),
  // Eastbrook.
  obj('c1_heavy_parcel', [{ x: -29.5, z: -95.5 }]),
  obj('c1_soft_parcel', [{ x: -27.5, z: -96.5 }]),
  obj('c1_healthy_turnip', [
    { x: -13.2, z: -70.8 },
    { x: -12, z: -69.2 },
    { x: -15.5, z: -70 },
    { x: -13, z: -73 },
  ]),
  obj('c1_blackened_root_sample', [
    { x: -12, z: -68 },
    { x: -10.5, z: -66.8 },
    { x: -13.8, z: -66.5 },
  ]),
  obj('c1_frosted_fence_stake', [{ x: -11.5, z: -65.5 }]),
  obj('c1_waxed_root_tie', [
    { x: -12.8, z: -65 },
    { x: -10, z: -65.2 },
  ]),
  obj('c1_meadow_balm_leaf', [
    { x: -35.5, z: -72.5 },
    { x: -33.5, z: -74 },
    { x: -37, z: -74.5 },
  ]),
  obj('c1_disturbed_grave', [
    { x: 24, z: -116 },
    { x: 25.9, z: -113.1 },
    { x: 21, z: -120 },
  ]),
  obj('c1_black_cloth_snag', [{ x: 26, z: -104.5 }]),
  obj('c1_name_stone', [
    { x: 43, z: -119 },
    { x: 48, z: -115 },
  ]),
  obj('c1_unlit_grave_lamp', [{ x: 46, z: -119 }]),
  obj('c1_cold_silvermint_sprig', [
    { x: 10, z: -60 },
    { x: 0, z: -52 },
    { x: 6, z: -61 },
  ]),
  obj('c1_waxed_binding', [
    { x: 8, z: -52 },
    { x: -2, z: -60 },
  ]),
  obj('c1_dew_damp_cloth', [{ x: -33.5, z: -78.5 }]),
  obj('c1_windwhistle_patch', [
    { x: -35.5, z: -70 },
    { x: -38.2, z: -69.2 },
    { x: -34.3, z: -70.3 },
  ]),
  obj('c1_tapping_wall_panel', [
    { x: 14, z: -82 },
    { x: 15.5, z: -83.5 },
    { x: 14, z: -86 },
  ]),
  obj('c1_nibbled_rent_notice', [{ x: 13.5, z: -87.5 }]),
  obj('c1_speaking_pipe', [{ x: 16, z: -86 }]),
  obj('c1_bread_heel', [{ x: 12, z: -85.5 }]),
  obj('c1_pantry_saucer', [{ x: 15.5, z: -87.5 }]),
  obj('c1_delivery_slip', [
    { x: -26.5, z: -95.5 },
    { x: -24.5, z: -96 },
    { x: -23, z: -97 },
  ]),
  obj('c1_amended_cart_tag', [{ x: -27, z: -97 }]),
  obj('c1_discarded_face_veil', [
    { x: 70.4, z: -49.6 },
    { x: 74.5, z: -47 },
  ]),
  obj('c1_bound_grave_lamp', [
    { x: 96, z: -43 },
    { x: 88, z: -50 },
    { x: 96, z: -50 },
  ]),
  obj('c1_founders_prayer_board', [
    { x: 17.6, z: -113.6 },
    { x: 13.5, z: -112.5 },
  ]),
  obj('c1_founding_map', [{ x: 17, z: -109 }]),
  obj('c1_reading_desk', [{ x: 13, z: -108.5 }]),
  obj('c1_boundary_warning', [
    { x: 40, z: 25 },
    { x: 48, z: 40 },
  ]),
  obj('c1_outer_wicket', [{ x: 55, z: 55 }]),
  // Board dailies.
  obj('c1_rivet_packet', [
    { x: -31.5, z: -94.7 },
    { x: -31.5, z: -95.9 },
    { x: -31.5, z: -93.5 },
  ]),
  obj('c1_hinge_bundle', [
    { x: -33.5, z: -94.7 },
    { x: -33.5, z: -95.9 },
    { x: -33.5, z: -93.5 },
  ]),
  obj('c1_covered_stew_bowl', [
    { x: 10.5, z: -82.5 },
    { x: 11, z: -83.7 },
    { x: 9.4, z: -80.2 },
  ]),
  obj('c1_bread_bundle', [
    { x: 9, z: -82 },
    { x: 10.8, z: -85.5 },
    { x: 8.4, z: -80.9 },
  ]),
  obj('c1_dried_herb_packet', [
    { x: -40.5, z: -77.5 },
    { x: -40.5, z: -78.7 },
    { x: -40.5, z: -76.3 },
  ]),
  obj('c1_reed_mulch_bundle', [
    { x: -40.5, z: -74.5 },
    { x: -40.5, z: -75.7 },
    { x: -40.5, z: -73.3 },
  ]),
  obj('c1_lantern_oil_cup', [
    { x: 73.5, z: -39 },
    { x: 73.1, z: -40.6 },
    { x: 72.8, z: -42.1 },
  ]),
  obj('c1_road_checkpost', [
    { x: -14, z: -135 },
    { x: -25, z: -141 },
    { x: -20, z: -125 },
  ]),
  obj('c1_quay_inspection_post', [
    { x: -80, z: -60 },
    { x: -86, z: -54 },
    { x: -74, z: -66 },
  ]),
  obj('c1_watch_lantern', [
    { x: -10, z: -67 },
    { x: 5, z: -66 },
    { x: 14, z: -63.5 },
  ]),
  obj('c1_water_level_gauge', [
    { x: -40, z: -70 },
    { x: -46, z: -66 },
    { x: -45.5, z: -58.5 },
  ]),
  // Appended last so every earlier object keeps its reserved id. The tool
  // and crafting quests: Tobbin's jetty, Fenlow's ferry walkway, Brunna's
  // furnace, Wenna's yard and the inn's hearth.
  obj('c1_keep_net', [{ x: -271.5, z: 4 }]),
  obj('c1_loan_woodcutting_axe', [{ x: -286, z: -11 }]),
  obj('c1_marked_shore_pine', [
    { x: -302, z: -8 },
    { x: -305, z: -3 },
    { x: -305.4, z: -10.6 },
    { x: -301, z: 1 },
  ]),
  obj('c1_timber_rack', [{ x: -288, z: -7 }]),
  obj('c1_deck_nails', [{ x: -285.2, z: -12.2 }]),
  obj('c1_ferry_workbench', [{ x: -282, z: -12.5 }]),
  obj('c1_walkway_gap', [
    { x: -276, z: 0 },
    { x: -274.5, z: 2.5 },
  ]),
  obj('c1_public_furnace', [{ x: -4.6, z: -116.8 }]),
  // Wenna's carpenter's yard on the north side of the main street, the spot
  // the town layout keeps free for it (clear of the row terrace and the
  // housing streets; tests/chapter_one_content.test.ts town-lot clearance).
  obj('c1_pella_workbench', [{ x: -46.5, z: -84 }]),
  obj('c1_housing_noticeboard', [{ x: -43, z: -83 }]),
  obj('c1_practice_marker', [{ x: -44, z: -80.5 }]),
  obj('c1_garden_carrot', [
    { x: -16.5, z: -72 },
    { x: -17.5, z: -70.5 },
    { x: -15.8, z: -74 },
  ]),
  obj('c1_inn_hearth', [{ x: 10.3, z: -86.5 }]),
];

// ---------------------------------------------------------------------------
// Escorts (src/sim/escort.ts): the escortee is a friendly mob the run walks.
// ---------------------------------------------------------------------------

export const C1_NERIS_ESCORT_MOB = 'escort_neris';
export const C1_DELLA_ESCORT_MOB = 'escort_della';

const escortee = (id: string, name: string, color: number): MobTemplate => ({
  id,
  name,
  minLevel: 4,
  maxLevel: 4,
  family: 'humanoid',
  hpBase: 260,
  hpPerLevel: 30,
  dmgBase: 1,
  dmgPerLevel: 0,
  attackSpeed: 2,
  armorPerLevel: 20,
  moveSpeed: 0,
  aggroRadius: 0,
  loot: [],
  scale: 1,
  color,
});
CHAPTER_ONE_MOBS[C1_NERIS_ESCORT_MOB] = escortee(C1_NERIS_ESCORT_MOB, 'Neris Snowmantle', 0x6f8fa8);
CHAPTER_ONE_MOBS[C1_DELLA_ESCORT_MOB] = escortee(C1_DELLA_ESCORT_MOB, 'Della Brindlepot', 0xc49a6c);

export const CHAPTER_ONE_ESCORTS: Record<string, EscortDef> = {
  esc_c1_neris: {
    id: 'esc_c1_neris',
    npcMobId: C1_NERIS_ESCORT_MOB,
    questId: 'c1_21_watch_cannot_see',
    start: { x: 70, z: -56 },
    waypoints: [
      { x: 71, z: -51 },
      { x: 73, z: -46 },
      { x: 75, z: -42.5 },
    ],
    moveSpeed: 3,
    // "Watch the hedges": a pair of briar-mad foxes breaks cover mid-track
    // and goes for Neris (the run pauses until they fall, and fails if she does).
    ambushes: [{ atWaypoint: 1, mobId: 'briarbitten_fox', count: 2 }],
    creditRadius: 30,
    respawnSeconds: 30,
    startText: 'The cart left the road here. Watch the hedges while I watch the ground.',
    successText: 'From here we can see the pit. Stay low.',
    failText: 'Neris has fallen back to the milepost.',
  },
  esc_c1_della: {
    id: 'esc_c1_della',
    npcMobId: C1_DELLA_ESCORT_MOB,
    questId: 'c1_17_della_long_way',
    // The willow footbridge end of the brook path; kept 45 yards clear of the
    // Eastbrook freight yard world quest (tests/world_quests.test.ts clearance).
    start: { x: -14.1, z: -58.4 },
    waypoints: [
      { x: -10, z: -48 },
      // Behind the Meadow Lane houses' back gardens (the lane runs along
      // z -24), clear of the fox den at (5, -55).
      { x: 8, z: -36 },
      { x: 30, z: -45 },
      { x: 55, z: -45 },
      { x: 75, z: -42.5 },
    ],
    moveSpeed: 3,
    ambushes: [],
    creditRadius: 30,
    respawnSeconds: 30,
    startText: 'Mind the sacks. And mind the river, it has opinions today.',
    successText: 'There. Home, more or less. Thank you for not letting me fix the river.',
    failText: 'Della has gone back for her cart.',
  },
};

// ---------------------------------------------------------------------------
// The quests.
// ---------------------------------------------------------------------------

function quest(
  id: string,
  name: string,
  level: number,
  kind: 'main' | 'side',
  giver: string,
  turnIn: string,
  faction: Faction,
  text: string,
  completionText: string,
  objectives: QuestObjective[],
  extra: Partial<QuestDef> = {},
): QuestDef {
  const bonus = kind === 'main' ? 1 : 0.85;
  return {
    id,
    name,
    giverNpcId: giver,
    turnInNpcId: turnIn,
    text,
    completionText,
    objectives,
    xpReward: Math.round(STORY_XP[level] * bonus),
    copperReward: Math.round(STORY_COPPER[level] * bonus),
    itemRewards: {},
    standingReward: questStandingReward(faction),
    ...(level > 1 ? { minLevel: level } : {}),
    ...extra,
  };
}

const collect = (itemId: string, count: number, label: string): QuestObjective => ({
  type: 'collect',
  itemId,
  count,
  label,
});
const inspect = (targetObjectItemId: string, count: number, label: string): QuestObjective => ({
  type: 'interact',
  targetObjectItemId,
  count,
  label,
});
const talk = (targetNpcId: string, label: string, usesItemId?: string): QuestObjective => ({
  type: 'interact',
  targetNpcId,
  count: 1,
  label,
  ...(usesItemId ? { usesItemId } : {}),
});
/** A counted hand-over: the objective counts the units (3 Bread Bundles reads
 *  0/3), and one talk hands over everything carried (questDeliveryUnits). */
const deliver = (
  targetNpcId: string,
  label: string,
  usesItemId: string,
  count: number,
): QuestObjective => ({ type: 'interact', targetNpcId, count, label, usesItemId });
const kill = (targetMobId: string, count: number, label: string): QuestObjective => ({
  type: 'kill',
  targetMobId,
  count,
  label,
});
const event = (eventId: string, label: string): QuestObjective => ({
  type: 'event',
  eventId,
  count: 1,
  label,
});

/** The event the island's ferry bell credits on a sail to Eastbrook. */
export const C1_FERRY_CROSSED_EVENT = 'c1_ferry_crossed';
/** The event the Eastbrook noticeboard credits when read. */
export const C1_BOARD_READ_EVENT = 'c1_board_read';

export const CHAPTER_ONE_QUESTS: Record<string, QuestDef> = {
  c1_01_arrival: quest(
    'c1_01_arrival',
    'An Arrival Without a Ticket',
    1,
    'main',
    FENLOW,
    FENLOW,
    'lanternwardens',
    "You're breathing, which puts you ahead of your luggage. Gather anything dry from that wreckage while I fetch a blanket. We can discuss your unusual choice of landing place once your teeth stop chattering.",
    "There's bread in that bundle and a blanket without too many holes. Sit a moment, then we'll work out what brought your boat onto the rocks.",
    [
      collect('c1_dry_supply_bundle', 3, 'Dry Supply Bundle'),
      inspect('c1_broken_lifeboat', 1, 'Broken Lifeboat inspected'),
    ],
  ),
  c1_02_beacon_lied: quest(
    'c1_02_beacon_lied',
    'The Beacon That Lied',
    1,
    'main',
    FENLOW,
    FENLOW,
    'lanternwardens',
    "That beacon should have guided your boat clear of the rocks, not invited it onto them. Someone's been up there, and the rats along the path have started biting anything with a shadow. Have a look inside the lantern, but don't touch anything still burning.",
    "That cord is cold enough to numb my fingers, yet the lantern was lit. I'll wrap it up for Eastbrook's priest, because I prefer my mysteries somewhere other than aboard my boat.",
    [
      kill('bristlejaw_shore_rat', 4, 'Bristlejaw Shore Rat slain'),
      inspect('c1_northern_beacon', 1, 'Northern Beacon inspected'),
      collect('c1_black_wick_knot', 2, 'Black Wick Knot'),
    ],
    { requiresQuest: 'c1_01_arrival' },
  ),
  c1_06_admiral_crabs: quest(
    'c1_06_admiral_crabs',
    'An Admiral Among Crabs',
    1,
    'side',
    C1_TOBBIN,
    C1_TOBBIN,
    'hearthwright_compact',
    'A crab has stolen my hat and now refuses to recognize my authority. Bait the pot beneath the jetty and retrieve it without hurting the little scoundrel. I want my hat back, not a diplomatic incident.',
    'That is my hat, though the crab has improved its ventilation. Let him out once you are finished, because he has already suffered the indignity of being caught by breakfast.',
    [
      {
        type: 'interact',
        targetObjectItemId: 'c1_empty_crab_pot',
        count: 1,
        label: 'Crab Pot baited with a Bait Herring',
        usesItemId: 'c1_bait_herring',
        yieldsItemId: 'c1_salt_crumpled_hat',
      },
      collect('c1_salt_crumpled_hat', 1, 'Salt-Crumpled Hat'),
    ],
    { requiresQuest: 'c1_01_arrival', shareable: false },
  ),
  c1_07_across: quest(
    'c1_07_across',
    'Across Before the Kettle Boils',
    2,
    'main',
    FENLOW,
    ALDRIC,
    'gilt_measure',
    "Eastbrook lies upriver, where people generally arrive through doors rather than shipwrecks. Take this wrapped cord to Brother Aldric at the chapel. Tell him I want an explanation, preferably one that doesn't involve buying a new ferry.",
    'Welcome to Eastbrook, and thank you for bringing this safely. Jorren will find you a warm meal while I examine the cord, but I would like you to return afterward.',
    [
      collect('c1_wrapped_beacon_sample', 1, 'Wrapped Beacon Sample delivered'),
      event(C1_FERRY_CROSSED_EVENT, 'Mainland ferry boarded'),
    ],
    {
      requiresQuest: 'c1_02_beacon_lied',
      requiredItems: ['c1_wrapped_beacon_sample'],
      minLevel: undefined,
    },
  ),
  c1_08_vouch: quest(
    'c1_08_vouch',
    'Someone to Vouch for You',
    2,
    'main',
    ALDRIC,
    ALDRIC,
    'hearthwright_compact',
    "A stranger needn't remain one for long here. Take a sample to Ivara, introduce yourself to Corren and Silven, and look at the work posted outside the inn. Eastbrook has room for another pair of willing hands.",
    'Then you have somewhere to begin, and people who know your name. Ivara has already sent word that the thread troubles her, though she cannot yet say why.',
    [
      talk(IVARA, 'Beacon Thread Sample delivered to Ivara', 'c1_beacon_thread_sample'),
      talk(CORREN, 'Spoke with Corren'),
      talk(SILVEN, 'Spoke with Silven'),
      event(C1_BOARD_READ_EVENT, 'Eastbrook quest board inspected'),
    ],
    {
      requiresQuest: 'c1_07_across',
      requiredItems: ['c1_beacon_thread_sample'],
      minLevel: undefined,
    },
  ),
  c1_10_handle_doubt: quest(
    'c1_10_handle_doubt',
    'Handle With Considerable Doubt',
    2,
    'side',
    SILVEN,
    SILVEN,
    'gilt_measure',
    "Two labels were exchanged in a minor outbreak of administrative enthusiasm. Ivara needs her mortar, and Brunna needs her padded gloves. Please correct matters before either discovers an exciting new use for the other's order.",
    'Both deliveries are accounted for, and neither customer has demanded my head. That is what I call a successful trading day.',
    [
      talk(IVARA, 'Heavy Parcel delivered to Ivara', 'c1_heavy_parcel'),
      talk(BRUNNA, 'Soft Parcel delivered to Brunna', 'c1_soft_parcel'),
    ],
    { requiresQuest: 'c1_08_vouch', shareable: false },
  ),
  c1_11_cold_garden: quest(
    'c1_11_cold_garden',
    'The Cold End of the Garden',
    2,
    'side',
    C1_DELLA,
    C1_DELLA,
    'hearthwright_compact',
    "The south bed grows turnips, while the north bed appears to be growing disappointment. Its soil is cold enough to keep butter, even at noon. Bring me good vegetables and a few bad roots before the whole patch decides it's winter.",
    "At least we'll have something for supper. That cord around the fence stake wasn't there when I planted, and I'd like to know who put it there.",
    [
      collect('c1_healthy_turnip', 4, 'Healthy Turnip'),
      collect('c1_blackened_root_sample', 3, 'Blackened Root Sample'),
      inspect('c1_frosted_fence_stake', 1, 'Frosted Fence Stake inspected'),
    ],
    { requiresQuest: 'c1_08_vouch' },
  ),
  c1_12_tied_to_root: quest(
    'c1_12_tied_to_root',
    'Nothing Good Tied to a Root',
    2,
    'side',
    C1_DELLA,
    IVARA,
    'bracken_circle',
    "I've dug down beside that stake, and someone has tied knots around my roots. Knots, in a vegetable garden, as though the turnips might escape. Take the bindings to Ivara, along with balm for the plants we've had to disturb.",
    "The wax draws warmth from whatever touches it, which explains Della's damaged crop. Removing it should help the bed recover, but please tell her to report anyone digging near her fence.",
    [
      collect('c1_waxed_root_tie', 2, 'Waxed Root Tie'),
      collect('c1_meadow_balm_leaf', 3, 'Meadow Balm Leaf'),
    ],
    { requiresQuest: 'c1_11_cold_garden' },
  ),
  c1_13_flowers_down: quest(
    'c1_13_flowers_down',
    'Flowers Facing Down',
    2,
    'main',
    ALDRIC,
    ALDRIC,
    'lanternwardens',
    "Bertram found the flowers on three graves pushed into the soil, blossoms first. That is not one of our customs, nor a child's joke I recognize. Ask him what he saw and examine the graves without disturbing their occupants.",
    'He heard someone counting after midnight, and this cloth matches the thread Fenlow sent. I would rather have found a thoughtless vandal than someone so careful.',
    [
      inspect('c1_disturbed_grave', 3, 'Freshly Disturbed Grave inspected'),
      talk(C1_HOLVEN, 'Spoke with Bertram Ashcombe'),
      collect('c1_black_cloth_snag', 1, 'Black Cloth Snag'),
    ],
    { requiresQuest: 'c1_08_vouch' },
  ),
  c1_14_buried_tuesday: quest(
    'c1_14_buried_tuesday',
    'The Man Buried on Tuesday',
    3,
    'main',
    ALDRIC,
    ALDRIC,
    'lanternwardens',
    'Bertram saw a man walking whom we buried together on Tuesday. I have checked the grave, and I fear there is no gentle explanation. Put the Gravestirred to rest and restore their name stones, because whatever moves them now must not take their names as well.',
    'Thank you for treating them as people rather than obstacles. This lamp was never part of their burial, and I will find out who placed it there.',
    [
      kill('gravestirred_fieldhand', 4, 'Gravestirred Fieldhand laid to rest'),
      inspect('c1_name_stone', 2, 'Overturned Name Stone restored'),
      collect('c1_unlit_grave_lamp', 1, 'Unlit Grave Lamp'),
    ],
    { requiresQuest: 'c1_13_flowers_down' },
  ),
  c1_15_warmth_missing: quest(
    'c1_15_warmth_missing',
    'The Warmth Gone Missing',
    3,
    'main',
    ALDRIC,
    IVARA,
    'bracken_circle',
    'The roots beside the burial ground have blackened, and even the foxes there have turned savage. Ivara believes the damage may tell us more than the graves alone. Take her herbs from the cold patches and anything tied among the roots.',
    'The soil has been drained of warmth, not poisoned. These bindings match the beacon thread, which means the trouble has been carried here by someone with hands.',
    [
      kill('briarbitten_fox', 3, 'Briarbitten Fox slain'),
      collect('c1_cold_silvermint_sprig', 3, 'Cold Silvermint Sprig'),
      collect('c1_waxed_binding', 2, 'Waxed Binding'),
    ],
    { requiresQuest: 'c1_14_buried_tuesday' },
  ),
  c1_16_pick_the_choir: quest(
    'c1_16_pick_the_choir',
    'Please Do Not Pick the Choir',
    3,
    'side',
    C1_OLVESSA,
    C1_OLVESSA,
    'bracken_circle',
    "Those flowers beneath the bridge have been singing since dawn, and even a happy song becomes tiresome by the seventeenth verse. Lay a damp cloth over each patch before taking a leaf. You needn't pluck the whole choir to borrow a little music.",
    "These leaves still carry a lovely little hum. I'll use them gently, and perhaps the bridge will enjoy a quiet afternoon.",
    [
      {
        type: 'interact',
        targetObjectItemId: 'c1_windwhistle_patch',
        count: 3,
        label: 'Windwhistle Flower Patch soothed',
        usesItemId: 'c1_dew_damp_cloth',
        keepsUsedItem: true,
        yieldsItemId: 'c1_windwhistle_leaf',
      },
      collect('c1_windwhistle_leaf', 3, 'Windwhistle Leaf'),
    ],
    { requiresQuest: 'c1_08_vouch', requiredItems: ['c1_dew_damp_cloth'], shareable: false },
  ),
  c1_17_della_long_way: quest(
    'c1_17_della_long_way',
    'Della Takes the Long Way',
    3,
    'side',
    C1_NERIS,
    C1_NERIS,
    'lanternwardens',
    "Della took her handcart over the willow path after I warned her about the washout. I've found a wheel, but she shouted back when I called, so there's hope. Bring her and those seed sacks home before she attempts to repair the river.",
    'She came back arguing, which is usually a good sign. Thank you for taking the sacks as well, because she would have gone straight back for them.',
    [{ type: 'escort', escortId: 'esc_c1_della', count: 1, label: 'Della escorted home' }],
    { requiresQuest: 'c1_15_warmth_missing', shareable: false },
  ),
  c1_18_three_knocks: quest(
    'c1_18_three_knocks',
    'Three Knocks for Supper',
    3,
    'side',
    C1_JORREN,
    C1_JORREN,
    'hearthwright_compact',
    "Something in my pantry knocks three times whenever I serve supper. The guests say it's a ghost, but ghosts have never previously shown such an interest in dumplings. Find the cause before somebody starts selling tickets.",
    "Those flour prints are smaller than a mouse's, and something has eaten the word 'rent.' Whatever lives in that wall has already understood the expensive part of lodging.",
    [
      inspect('c1_tapping_wall_panel', 3, 'Tapping Wall Panel inspected'),
      collect('c1_nibbled_rent_notice', 1, 'Nibbled Rent Notice'),
      inspect('c1_speaking_pipe', 1, 'Disused Speaking Pipe examined'),
    ],
    { requiresQuest: 'c1_08_vouch' },
  ),
  c1_19_guest_shelves: quest(
    'c1_19_guest_shelves',
    'A Guest Between the Shelves',
    3,
    'side',
    C1_JORREN,
    C1_JORREN,
    'hearthwright_compact',
    "My pantry key has vanished, and the knocking has become rather impatient. Ask Olvessa what leaves tiny flour prints, then offer our visitor something from the kitchen. I'd prefer a negotiated settlement to dismantling my inn.",
    "A cupboard spirit was tapping through the old speaking pipe to ask for food. It returned my key and offered three buttons for its room, so I believe we're making progress.",
    [
      talk(C1_OLVESSA, 'Asked Olvessa about the flour prints'),
      {
        type: 'interact',
        targetObjectItemId: 'c1_pantry_saucer',
        count: 1,
        label: 'Bread set on the Pantry Saucer',
        usesItemId: 'c1_bread_heel',
        yieldsItemId: 'c1_missing_pantry_key',
      },
      collect('c1_missing_pantry_key', 1, 'Missing Pantry Key'),
    ],
    { requiresQuest: 'c1_18_three_knocks', shareable: false },
  ),
  c1_20_order_unsigned: quest(
    'c1_20_order_unsigned',
    'The Order Nobody Signed',
    3,
    'main',
    ALDRIC,
    SILVEN,
    'gilt_measure',
    'Someone needed wax, cord, and lamps for these workings, and those things pass through ordinary hands before reaching wicked ones. Silven may recognize the supplies. Ask what he sold, not what he believes, and let the records answer.',
    'Three buyers used three different names, but all their orders went on the same cart. The destination was Old Kiln Lane, and I dislike being made useful without knowing to whom.',
    [
      inspect('c1_delivery_slip', 3, 'Lamp-Supply Delivery Slip checked'),
      collect('c1_amended_cart_tag', 1, 'Amended Cart Tag'),
      collect('c1_supplied_binding', 1, 'Waxed Binding delivered to Silven'),
    ],
    { requiresQuest: 'c1_15_warmth_missing', requiredItems: ['c1_supplied_binding'] },
  ),
  c1_21_watch_cannot_see: quest(
    'c1_21_watch_cannot_see',
    'Where the Watch Cannot See',
    4,
    'main',
    ALDRIC,
    C1_NERIS,
    'lanternwardens',
    'Neris has found where the supply cart left the road. Go with her while she follows the tracks, and watch the hedges when her eyes are on the ground. We need to know who is there before anyone attempts heroics.',
    "There are people below us tending lamps around an open pit, and something in that pit keeps trying to stand. I'll send word to Aldric while you keep those veils.",
    [
      {
        type: 'escort',
        escortId: 'esc_c1_neris',
        count: 1,
        label: 'Neris escorted to the lookout',
      },
      collect('c1_discarded_face_veil', 2, 'Discarded Face Veil'),
    ],
    { requiresQuest: 'c1_20_order_unsigned', shareable: false },
  ),
  c1_24_sandwich_emergency: quest(
    'c1_24_sandwich_emergency',
    'The Sandwich Emergency',
    4,
    'side',
    CORREN,
    CORREN,
    'lanternwardens',
    'The patrol lunches have been stolen twice, and I will not have hungry recruits making decisions with spears. Clear the boars from the shelter and recover the baskets. For the record, I have withdrawn my earlier accusation of organized sabotage.',
    "The watch will eat, and I shall amend my report to say 'persistent livestock.' Nobody needs to know how long I spent questioning the baker.",
    [
      kill('orchard_boar', 4, 'Orchard Boar driven off'),
      collect('c1_stolen_lunch_basket', 3, 'Stolen Lunch Basket'),
    ],
    { requiresQuest: 'c1_08_vouch' },
  ),
  c1_25_someone_teaching: quest(
    'c1_25_someone_teaching',
    'Someone Has Been Teaching Them',
    4,
    'main',
    ALDRIC,
    ALDRIC,
    'lanternwardens',
    'Neris saw the dead rise when those lamps were lit and collapse when one went out. The people tending them attacked our messenger, so there can be no mistaking their intent. Stop the workings and bring back any instructions you find, because someone taught them this.',
    'The pit is quiet, and those remains can finally be buried properly. These instructions look copied rather than composed, which means the people you stopped may not be the ones who began this.',
    [
      kill('veiled_rite_tender', 3, 'Veiled Rite Tender stopped'),
      inspect('c1_bound_grave_lamp', 3, 'Bound Grave Lamp extinguished'),
      collect('c1_instruction_sheet', 1, 'Soot-Folded Instruction Sheet'),
    ],
    { requiresQuest: 'c1_21_watch_cannot_see' },
  ),
  c1_26_promise_paint: quest(
    'c1_26_promise_paint',
    'The Promise Under the Paint',
    4,
    'main',
    ALDRIC,
    ALDRIC,
    'hearthwright_compact',
    'This copied verse resembles a promise recorded in the Age of First Hearths, though someone has twisted its meaning. Fetch the old prayer boards from the loft and examine the map behind the painted panel. Our founders may have left us a warning worth hearing.',
    `The original promise forbids keeping the dead in service to a crown, while this copy demands their obedience. An old cautionary verse calls such a ruler ${OATHLESS_KING_TITLE}. The map places the promised resting ground beneath the Hollow Crypt.`,
    [
      collect('c1_founders_prayer_board', 2, "Founders' Prayer Board"),
      inspect('c1_founding_map', 1, 'Faded Founding Map examined'),
      inspect('c1_reading_desk', 1, 'Verse compared at the reading desk'),
    ],
    { requiresQuest: 'c1_25_someone_teaching' },
  ),
  c1_28_door_left_shut: quest(
    'c1_28_door_left_shut',
    'A Door We Leave Shut',
    4,
    'main',
    ALDRIC,
    ALDRIC,
    'lanternwardens',
    'The map leads to the Hollow Crypt, but finding a door does not oblige us to open it. Read the boundary stones and give Neris this warning. Stay outside the wicket, whatever you hear beyond it, and come back to me.',
    'Fresh wax beneath the sealed doors is warning enough, and you were right to leave them shut. We will need experienced company before going farther. For tonight, Eastbrook has a watch on the road and one more reason to sleep.',
    [
      inspect('c1_boundary_warning', 2, 'Boundary Warning read'),
      inspect('c1_outer_wicket', 1, 'Outer Wicket inspected'),
      talk(C1_NERIS, 'Sealed Watch Warning delivered to Neris', 'c1_sealed_watch_warning'),
    ],
    { requiresQuest: 'c1_26_promise_paint', requiredItems: ['c1_sealed_watch_warning'] },
  ),
  // The tool and crafting quests. Loaned tools are collect objectives, so the
  // turn-in takes them back; a station objective (quests/quest_station_craft.ts)
  // spends its inputs and hands over its output at the bench, furnace or hearth.
  c1_03_fish_consulted: quest(
    'c1_03_fish_consulted',
    'The Fish Must Be Consulted',
    1,
    'side',
    C1_TOBBIN,
    C1_TOBBIN,
    'bracken_circle',
    "Before we discuss fishing, you should understand that the fish consider themselves the injured party. Borrow my spare rod and catch a few minnows for the keep-net. Gently, please, because we're studying them rather than inviting them to supper.",
    "Four healthy minnows, and not one signed complaint. We'll release them after I've checked their scales, which is more courtesy than they showed my last sandwich.",
    [
      collect('c1_loan_fishing_rod', 1, 'Loan Fishing Rod from the tackle rack'),
      collect('c1_shore_minnow', 4, 'Shore Minnow caught at the jetty'),
      {
        type: 'interact',
        targetObjectItemId: 'c1_keep_net',
        count: 1,
        label: 'Minnows placed in the keep-net',
        usesItemId: 'c1_shore_minnow',
        usesCount: 4,
        keepsUsedItem: true,
      },
    ],
    // Tobbin hands over his spare rod on accept (the turn-in takes it back).
    {
      requiresQuest: 'c1_01_arrival',
      shareable: false,
      requiredItems: ['c1_loan_fishing_rod'],
    },
  ),
  c1_04_every_board: quest(
    'c1_04_every_board',
    'Every Board Counts',
    1,
    'side',
    FENLOW,
    FENLOW,
    'hearthwright_compact',
    "The cargo walkway has developed an interest in dropping people into the sea. Bring me four sound pine logs from the marked trees behind the hut. Leave the old nesting tree alone, unless you'd like to negotiate with thirty furious gulls.",
    'Those will do nicely, and the gulls appear to have spared you. Now we can turn this pile into something people may confidently stand upon.',
    [
      collect('c1_loan_woodcutting_axe', 1, 'Loan Woodcutting Axe'),
      {
        type: 'interact',
        targetObjectItemId: 'c1_marked_shore_pine',
        count: 4,
        label: 'Marked Shore Pine felled',
        usesItemId: 'c1_loan_woodcutting_axe',
        keepsUsedItem: true,
        yieldsItemId: 'c1_shore_pine_log',
      },
      {
        type: 'interact',
        targetObjectItemId: 'c1_timber_rack',
        count: 1,
        label: 'Shore Pine Logs placed on the timber rack',
        usesItemId: 'c1_shore_pine_log',
        usesCount: 4,
      },
    ],
    { requiresQuest: 'c1_01_arrival', shareable: false },
  ),
  c1_05_solid_underfoot: quest(
    'c1_05_solid_underfoot',
    'Something Solid Underfoot',
    1,
    'side',
    FENLOW,
    FENLOW,
    'hearthwright_compact',
    "You've provided the wood, so now comes the business of convincing it to become a walkway. Use my bench and the nails in that chest. I've marked the gaps, although the sea showing through them is also a useful clue.",
    "That feels solid enough for a loaded handcart. It's a small repair, but someone will get home dry because you bothered.",
    [
      {
        type: 'interact',
        targetObjectItemId: 'c1_ferry_workbench',
        count: 1,
        label: 'Walkway Panels built at the ferry workbench',
        usesItemId: 'c1_deck_nails',
        yieldsItemId: 'c1_walkway_panel',
        yieldsCount: 2,
        station: true,
      },
      {
        type: 'interact',
        targetObjectItemId: 'c1_walkway_gap',
        count: 2,
        label: 'Walkway gap repaired',
        usesItemId: 'c1_walkway_panel',
      },
    ],
    { requiresQuest: 'c1_04_every_board', shareable: false },
  ),
  c1_09_buckles_glory: quest(
    'c1_09_buckles_glory',
    'Buckles Before Glory',
    2,
    'side',
    BRUNNA,
    BRUNNA,
    'hearthwright_compact',
    "The watch wants new breastplates, but half their existing straps won't hold a buckle. Bring me copper and smelt it cleanly. We can discuss glorious weapons after everyone can keep their armor on.",
    "That's clean metal, and I can work with it. A buckle won't earn a ballad, but it might keep the person wearing it alive.",
    [
      {
        type: 'gather',
        nodeType: 'ore',
        area: { x: -27, z: 152, radius: 20 },
        count: 6,
        label: 'Copper Ore mined in the eastern quarry',
      },
      {
        type: 'interact',
        targetObjectItemId: 'c1_public_furnace',
        count: 2,
        label: 'Copper Ingot smelted at the public furnace',
        usesItemId: 'copper_ore',
        usesCount: 3,
        yieldsItemId: 'c1_copper_ingot',
        station: true,
      },
      deliver(BRUNNA, 'Copper Ingots delivered to Brunna', 'c1_copper_ingot', 2),
    ],
    { requiresQuest: 'c1_08_vouch', shareable: false },
  ),
  c1_22_place_you_keep: quest(
    'c1_22_place_you_keep',
    'A Place for What You Keep',
    4,
    'side',
    C1_PELLA,
    C1_PELLA,
    'hearthwright_compact',
    "You keep bringing useful things back to town, and pockets have limits. Build yourself a chest while you consider where you'd like to live. You needn't own a house to begin making a home.",
    "That chest is yours, including everything you eventually manage to squeeze into it. Keep it safe until you've chosen a place, and don't let Silven convince you that hinges count as luxury fittings.",
    [
      {
        type: 'gather',
        nodeType: 'wood',
        area: { x: 60, z: -100, radius: 30 },
        count: 4,
        label: 'Vale Oak felled in the western coppice',
      },
      {
        type: 'interact',
        targetNpcId: BRUNNA,
        count: 1,
        label: 'Hinge Packet collected from Brunna',
        yieldsItemId: 'c1_hinge_packet',
      },
      {
        type: 'interact',
        targetObjectItemId: 'c1_pella_workbench',
        count: 1,
        label: "Storage Chest built at Wenna's workbench",
        usesItemId: 'c1_hinge_packet',
        yieldsItemId: HOUSE_STORAGE_CHEST_ITEM_ID,
        station: true,
      },
      inspect('c1_housing_noticeboard', 1, 'Housing Noticeboard inspected'),
    ],
    { requiresQuest: 'c1_08_vouch', shareable: false },
  ),
  c1_23_working_life: quest(
    'c1_23_working_life',
    'Room for a Working Life',
    4,
    'side',
    C1_PELLA,
    C1_PELLA,
    'hearthwright_compact',
    'A home ought to hold something you made, and somewhere to make the next thing. Build a worktable, then try arranging it in my demonstration cottage. No purchase required, and please resist testing the walls with an axe.',
    'There you are, with room to work and enough floor left to walk across. Keep the table alongside your chest, because a useful home can begin with very little.',
    [
      {
        type: 'gather',
        nodeType: 'wood',
        area: { x: 60, z: -100, radius: 30 },
        count: 3,
        label: 'Vale Oak felled in the western coppice',
      },
      {
        type: 'interact',
        targetObjectItemId: 'c1_pella_workbench',
        count: 1,
        label: "Worktable built at Wenna's workbench",
        yieldsItemId: C1_WORKTABLE_ITEM_ID,
        station: true,
      },
      {
        type: 'interact',
        targetObjectItemId: 'c1_practice_marker',
        count: 1,
        label: 'Worktable tried on the Furnishing Practice Marker',
        usesItemId: C1_WORKTABLE_ITEM_ID,
        keepsUsedItem: true,
      },
    ],
    { requiresQuest: 'c1_22_place_you_keep', shareable: false },
  ),
  c1_27_supper_despite: quest(
    'c1_27_supper_despite',
    'Supper, Despite Everything',
    4,
    'side',
    C1_JORREN,
    C1_JORREN,
    'hearthwright_compact',
    "Everyone's been working late and pretending they aren't hungry. Help me make a few proper meals, then take them to the people too stubborn to stop. Terrible news can wait while somebody eats a carrot.",
    "Good, because they'll look after the rest of us better with something warm inside them. I've kept a bowl for you, and that wasn't an invitation to argue.",
    [
      {
        type: 'interact',
        targetObjectItemId: 'c1_inn_hearth',
        count: 1,
        label: 'Stew cooked at the inn hearth (2 Brook Trout, 3 Garden Carrots)',
        usesItemId: 'c1_brook_trout',
        usesCount: 2,
        alsoUses: [{ itemId: 'c1_garden_carrot', count: 3 }],
        yieldsItemId: 'c1_supper_stew_bowl',
        yieldsCount: 3,
        station: true,
      },
      deliver(CORREN, 'Stew delivered to Corren', 'c1_supper_stew_bowl', 1),
      deliver(BRUNNA, 'Stew delivered to Brunna', 'c1_supper_stew_bowl', 1),
      deliver(C1_OLVESSA, 'Stew delivered to Olvessa', 'c1_supper_stew_bowl', 1),
    ],
    { requiresQuest: 'c1_26_promise_paint', shareable: false },
  ),
};

// Quest 07 is offered on the island at level 1 (the owner's level 2 is its
// story band; the island tops out at 2 and the ferry is the way off it).
delete CHAPTER_ONE_QUESTS.c1_07_across.minLevel;
delete CHAPTER_ONE_QUESTS.c1_08_vouch.minLevel;

// ---------------------------------------------------------------------------
// The Eastbrook quest board's daily postings (src/sim/town_board/). Counts sit
// at the middle of the owner's range; one QuestDef per target and location pair.
// ---------------------------------------------------------------------------

export const EASTBROOK_BOARD_ID = 'eastbrook_noticeboard';

function daily(
  id: string,
  name: string,
  level: number,
  poster: string,
  faction: Faction,
  text: string,
  completionText: string,
  objectives: QuestObjective[],
): QuestDef {
  return {
    id,
    name,
    giverNpcId: poster,
    turnInNpcId: poster,
    text,
    completionText,
    objectives,
    xpReward: boardDailyXp(level),
    copperReward: level * BOARD_DAILY_COPPER_PER_LEVEL,
    itemRewards: {},
    minLevel: level,
    requiresQuest: 'c1_08_vouch',
    repeatable: true,
    dailyReset: true,
    shareable: false,
    townBoard: EASTBROOK_BOARD_ID,
    standingReward: questStandingReward(faction, BOARD_DAILY_STANDING),
  };
}

const gather = (
  nodeType: 'ore' | 'wood' | 'herb',
  area: { x: number; z: number; radius: number },
  count: number,
  label: string,
): QuestObjective => ({ type: 'gather', nodeType, area, count, label });

export const TOWN_BOARD_QUESTS: Record<string, QuestDef> = {
  c1_d01_bounty_culvert: daily(
    'c1_d01_bounty_culvert',
    'Board Bounty: Culvert Rats',
    2,
    CORREN,
    'lanternwardens',
    "We've had reports of Culvert Rats troubling people at the town drainage ditch. Remove 5 of them and check your footing while you're there. I don't want a rescue operation attached to a routine patrol.",
    'That should make the route safer for ordinary traffic. Good work, and thank you for returning without requiring a stretcher.',
    [kill('culvert_rat', 5, 'Culvert Rat removed')],
  ),
  c1_d02_clear_quarry: daily(
    'c1_d02_clear_quarry',
    'Clear Space for Honest Work',
    3,
    BRUNNA,
    'hearthwright_compact',
    "The workers at the eastern quarry need their hands for tools, not for beating off Quarry Burrowers. Clear 4 from the worksite. I'll pay for a safe shift rather than another tale about why the ore hasn't arrived.",
    "Then we can get something useful made today. You've earned your pay without needing to swing a hammer.",
    [kill('quarry_burrower', 4, 'Quarry Burrower cleared')],
  ),
  c1_d03_teeth_verge: daily(
    'c1_d03_teeth_verge',
    'Teeth Along the Verge',
    4,
    C1_NERIS,
    'lanternwardens',
    "I've marked where Briarbitten Foxes are approaching the road at the northern root hedge. Deal with 4, but leave the healthy wildlife alone. We're protecting a path, not emptying the countryside.",
    "I'll check the verge again on my next round. For now, the travelers behind you have a safer walk.",
    [kill('briarbitten_fox', 4, 'Briarbitten Fox dealt with')],
  ),
  c1_d04_metal_copper: daily(
    'c1_d04_metal_copper',
    'Metal for the Morning Shift',
    2,
    BRUNNA,
    'hearthwright_compact',
    'I need 6 pieces of Copper Ore from the eastern quarry. Bring sound ore rather than a sack of interesting gravel. The furnace has enough opinions without being fed rubbish.',
    "That's a proper load, and the forge can use all of it. Come back another day when you need honest work.",
    [gather('ore', { x: -27, z: 152, radius: 20 }, 6, 'Copper Ore gathered at the eastern quarry')],
  ),
  c1_d05_wood_oak: daily(
    'c1_d05_wood_oak',
    'Wood That Has a Future',
    2,
    C1_PELLA,
    'hearthwright_compact',
    "I've orders waiting for 4 Vale Oak Logs, and the western coppice has trees marked for cutting. Leave the unmarked ones standing. Good carpentry begins before the wood reaches the bench.",
    "These will become something useful instead of remaining a sketch on my wall. I'll put the offcuts aside as well, because waste makes expensive furniture.",
    [gather('wood', { x: 60, z: -100, radius: 30 }, 4, 'Vale Oak felled in the western coppice')],
  ),
  c1_d05_wood_alder: daily(
    'c1_d05_wood_alder',
    'Wood That Has a Future',
    2,
    C1_PELLA,
    'hearthwright_compact',
    "I've orders waiting for 4 Riverside Alder Logs, and the managed brook grove has trees marked for cutting. Leave the unmarked ones standing. Good carpentry begins before the wood reaches the bench.",
    "These will become something useful instead of remaining a sketch on my wall. I'll put the offcuts aside as well, because waste makes expensive furniture.",
    [gather('wood', { x: -50, z: -60, radius: 30 }, 4, 'Alder felled in the brook grove')],
  ),
  c1_d06_leaves_silvermint: daily(
    'c1_d06_leaves_silvermint',
    'Fresh Leaves, Clean Hands',
    2,
    IVARA,
    'bracken_circle',
    'I need 3 fresh Silvermint Sprigs from the eastern meadow. Take the healthy growth and leave enough for each plant to recover. A treatment gathered carelessly begins with an injury of its own.',
    'These are exactly what I needed. Thank you for bringing them promptly rather than letting them wilt beneath a collection of wolf teeth.',
    [gather('herb', { x: -58, z: 91, radius: 16 }, 3, 'Silvermint gathered in the eastern meadow')],
  ),
  c1_d07_receipt_rivets: daily(
    'c1_d07_receipt_rivets',
    'A Receipt Is a Beautiful Thing',
    2,
    SILVEN,
    'gilt_measure',
    'Please take 3 Rivet Packets to Brunna at the forge. The goods are paid for, properly labeled, and not yours to inspect for personal inspiration. Bring confirmation back, and we shall both enjoy the rare pleasure of an uncomplicated transaction.',
    'Everything is signed for, so everybody knows whom to blame if it goes missing later. Your payment, happily, is considerably less complicated.',
    [deliver(BRUNNA, 'Rivet Packets delivered to Brunna', 'c1_rivet_packet', 3)],
  ),
  c1_d07_receipt_hinges: daily(
    'c1_d07_receipt_hinges',
    'A Receipt Is a Beautiful Thing',
    2,
    SILVEN,
    'gilt_measure',
    "Please take 3 Hinge Bundles to Wenna at the carpenter's yard. The goods are paid for, properly labeled, and not yours to inspect for personal inspiration. Bring confirmation back, and we shall both enjoy the rare pleasure of an uncomplicated transaction.",
    'Everything is signed for, so everybody knows whom to blame if it goes missing later. Your payment, happily, is considerably less complicated.',
    [deliver(C1_PELLA, 'Hinge Bundles delivered to Wenna', 'c1_hinge_bundle', 3)],
  ),
  c1_d08_lunch_stew: daily(
    'c1_d08_lunch_stew',
    'Lunch Before Complaints',
    2,
    C1_JORREN,
    'hearthwright_compact',
    "I've prepared 3 Covered Stew Bowls for Corren. Take them straight to the training yard, because hungry people can turn a short delay into a lifelong grievance. Anything you smell along the way remains part of the delivery.",
    "Good, because the kitchen was already receiving complaints from imaginary future customers. There's something small for you on the counter, and this time you're permitted to eat it.",
    [deliver(CORREN, 'Covered Stew Bowls delivered to Corren', 'c1_covered_stew_bowl', 3)],
  ),
  c1_d08_lunch_bread: daily(
    'c1_d08_lunch_bread',
    'Lunch Before Complaints',
    2,
    C1_JORREN,
    'hearthwright_compact',
    "I've prepared 3 Bread Bundles for Neris. Take them straight to the northern lookout, because hungry people can turn a short delay into a lifelong grievance. Anything you smell along the way remains part of the delivery.",
    "Good, because the kitchen was already receiving complaints from imaginary future customers. There's something small for you on the counter, and this time you're permitted to eat it.",
    [deliver(C1_NERIS, 'Bread Bundles delivered to Neris', 'c1_bread_bundle', 3)],
  ),
  c1_d09_parcels_herbs: daily(
    'c1_d09_parcels_herbs',
    'Small Parcels, Growing Things',
    3,
    C1_OLVESSA,
    'bracken_circle',
    "I've set aside 3 Dried Herb Packets for Ivara at the apothecary. Carry them gently and keep them dry. Things that grow deserve a little care even when they're wrapped in string.",
    'Then something will be tended that might otherwise have been neglected. Small journeys can do a surprising amount of good.',
    [deliver(IVARA, 'Dried Herb Packets delivered to Ivara', 'c1_dried_herb_packet', 3)],
  ),
  c1_d09_parcels_mulch: daily(
    'c1_d09_parcels_mulch',
    'Small Parcels, Growing Things',
    3,
    C1_OLVESSA,
    'bracken_circle',
    "I've set aside 3 Reed Mulch Bundles for Della at the riverside garden. Carry them gently and keep them dry. Things that grow deserve a little care even when they're wrapped in string.",
    'Then something will be tended that might otherwise have been neglected. Small journeys can do a surprising amount of good.',
    [deliver(C1_DELLA, 'Reed Mulch Bundles delivered to Della', 'c1_reed_mulch_bundle', 3)],
  ),
  c1_d10_road_checkposts: daily(
    'c1_d10_road_checkposts',
    'A Road Checked Properly',
    2,
    CORREN,
    'lanternwardens',
    'Check 3 Road Checkposts along the south road and report what you actually find. Do not substitute what a passing merchant claims his cousin saw. We have an entire council for that.',
    "That's a useful report, with places and observations rather than adjectives. I'll pass it to the next watch before they set out.",
    [inspect('c1_road_checkpost', 3, 'Road Checkpost checked')],
  ),
  c1_d10_quay_posts: daily(
    'c1_d10_quay_posts',
    'A Road Checked Properly',
    2,
    CORREN,
    'lanternwardens',
    'Check 3 Quay Inspection Posts along the riverside walk and report what you actually find. Do not substitute what a passing merchant claims his cousin saw. We have an entire council for that.',
    "That's a useful report, with places and observations rather than adjectives. I'll pass it to the next watch before they set out.",
    [inspect('c1_quay_inspection_post', 3, 'Quay Inspection Post checked')],
  ),
  c1_d11_light_behind: daily(
    'c1_d11_light_behind',
    'Leave a Light Behind You',
    3,
    C1_NERIS,
    'lanternwardens',
    'Several lamps along the Briar Gate circuit are running low. Take oil for 3 Watch Lanterns and check their shutters while you are there. Someone coming home late should be able to see the next safe place.',
    "I'll be able to follow that line of lights on tonight's round. So will everyone else who needs to reach home.",
    [
      {
        type: 'interact',
        targetObjectItemId: 'c1_watch_lantern',
        count: 3,
        label: 'Watch Lantern serviced',
        usesItemId: 'c1_lantern_oil_cup',
      },
    ],
  ),
  c1_d12_road_not_rumor: daily(
    'c1_d12_road_not_rumor',
    'The Road, Not the Rumor',
    3,
    SILVEN,
    'gilt_measure',
    "I've heard three alarming accounts of the town's brook crossings, none from anyone who's visited them today. Inspect 3 Water-Level Gauges and bring me facts. Rumors are remarkably expensive when attached to a delivery schedule.",
    'Excellent, because now I can arrange deliveries around the conditions rather than the gossip. Reliable information is a commodity I am occasionally willing to pay for.',
    [inspect('c1_water_level_gauge', 3, 'Water-Level Gauge inspected')],
  ),
};

export const TOWN_BOARD_DEFS: readonly TownBoardDef[] = Object.freeze([
  {
    boardId: EASTBROOK_BOARD_ID,
    postingsPerDay: 4,
    templates: [
      { id: 'D01', variants: ['c1_d01_bounty_culvert'] },
      { id: 'D02', variants: ['c1_d02_clear_quarry'] },
      { id: 'D03', variants: ['c1_d03_teeth_verge'] },
      { id: 'D04', variants: ['c1_d04_metal_copper'] },
      { id: 'D05', variants: ['c1_d05_wood_oak', 'c1_d05_wood_alder'] },
      { id: 'D06', variants: ['c1_d06_leaves_silvermint'] },
      { id: 'D07', variants: ['c1_d07_receipt_rivets', 'c1_d07_receipt_hinges'] },
      { id: 'D08', variants: ['c1_d08_lunch_stew', 'c1_d08_lunch_bread'] },
      { id: 'D09', variants: ['c1_d09_parcels_herbs', 'c1_d09_parcels_mulch'] },
      { id: 'D10', variants: ['c1_d10_road_checkposts', 'c1_d10_quay_posts'] },
      { id: 'D11', variants: ['c1_d11_light_behind'] },
      { id: 'D12', variants: ['c1_d12_road_not_rumor'] },
    ],
  },
]);

/** Which existing and new NPCs list which chapter quests (giver, turn-in and
 *  talk targets), merged onto NpcDef.questIds by data.ts. A board posting is
 *  listed on its poster for the turn-in row only (quest_marker_kind.ts). */
export function chapterOneNpcQuestIds(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (npcId: string, questId: string) => {
    const list = out[npcId] ?? [];
    if (!list.includes(questId)) list.push(questId);
    out[npcId] = list;
  };
  for (const q of [...Object.values(CHAPTER_ONE_QUESTS), ...Object.values(TOWN_BOARD_QUESTS)]) {
    add(q.giverNpcId, q.id);
    add(q.turnInNpcId, q.id);
    for (const o of q.objectives)
      if (o.type === 'interact' && o.targetNpcId) add(o.targetNpcId, q.id);
  }
  return out;
}
