// Wyndlewood Chapter Two, Act E: the Chalkbarrow Coast, Coinwell Camp and the
// Unlit Dig (outline quests 34 to 42, levels 10 to 12). Data only.
//
// A GATED bundle like the Applewold one in chapter_two.ts: the Chalkbarrow
// Coast is a world crew zone still on feature/world-expansion
// (src/sim/content/frontier/southern_reaches.ts CHALKBARROW_ZONE), so
// chapter_two_bundles.ts merges this bundle ONLY when the zone table carries
// 'chalkbarrow_coast'. On a build without it nothing here exists, and no core
// quest requires one of these. Positions come from the world crew's
// FRONTIER_ANCHORS (frontier/layout.ts), restated here, and
// tests/chapter_two_content.test.ts holds them to dry open ground once the zone
// is live. The Unlit Dig is a hostile Pale Accord cell, not a hub: Coinwell
// posts its work. Ground objects use reserved entity ids from 2_147_240_000
// and the camps spawn offStream, so nothing shifts a shipped id or rng stream.

import type { QuestCatchSpot } from '../quests/quest_fishing_catch';
import type { CampDef, ItemDef, MobTemplate, NpcDef, QuestDef } from '../types';
import {
  type ChapterTwoBundle,
  collect,
  inspect,
  kill,
  npc,
  objects,
  qi,
  quest,
  talk,
  useOn,
} from './chapter_two';
import { ZONE1_MOBS } from './zone1';
import { ZONE2_MOBS } from './zone2';

/** Every zone this bundle stands in. */
export const CHAPTER_TWO_CHALKBARROW_ZONE_IDS: readonly string[] = Object.freeze([
  'chalkbarrow_coast',
]);

// The world crew's Chalkbarrow anchors (frontier/layout.ts FRONTIER_ANCHORS).
const COINWELL = { x: -318, z: -336 };
const COINWELL_YARD = { x: -344, z: -318 };
const UNLIT_DIG = { x: -418, z: -436 };
const WHITE_HEAD = { x: -470, z: -300 };
const WRECKERS_COVE = { x: -276, z: -440 };

// Shipped NPCs (ids frozen).
const SILVEN = 'trader_wilkes';

export const C2_CLAIM_MASTER = 'claim_master_ambrose';
export const C2_COINWELL_COOK = 'cook_nettie_saltmarsh';
/** Shipped townsfolk who travel to Coinwell (outline Act E): second records,
 *  display names unchanged (the brother_aldric_fen precedent). The carpenter is
 *  Pressford's Bryony Cooperwick (chapter_two.ts), not a Chapter One name. */
export const C2_BRUNNA_COINWELL = 'forgemistress_darva_coinwell';
export const C2_CORREN_COINWELL = 'marshal_redbrook_coinwell';
export const C2_FENLOW_COINWELL = 'ferryman_odo_coinwell';
export const C2_BRYONY_COINWELL = 'carpenter_bryony_coinwell';

const NPCS: Record<string, NpcDef> = {
  [C2_CLAIM_MASTER]: npc(
    C2_CLAIM_MASTER,
    'Ambrose Pennick',
    'Coinwell Claim-Master',
    { x: COINWELL.x + 4, z: COINWELL.z + 3 },
    Math.PI,
    0xb08d3c,
    'Every stone on this coast belongs to somebody. My job is knowing who, and my headache is everyone else knowing better.',
  ),
  [C2_COINWELL_COOK]: npc(
    C2_COINWELL_COOK,
    'Nettie Saltmarsh',
    'Coinwell Camp Cook',
    { x: COINWELL.x - 5, z: COINWELL.z + 6 },
    0,
    0xa35d3f,
    'Stew is ready when it is ready, and it is never ready when the gulls are watching.',
  ),
  [C2_BRUNNA_COINWELL]: npc(
    C2_BRUNNA_COINWELL,
    'Brunna Flintmorrow',
    'Master of the Forge',
    { x: COINWELL_YARD.x + 4, z: COINWELL_YARD.z + 2 },
    Math.PI / 2,
    0x8b4a2b,
    'Metal tells the truth. People rarely bother. This ore is telling me something, and I do not like its tone.',
  ),
  [C2_CORREN_COINWELL]: npc(
    C2_CORREN_COINWELL,
    'Warden Corren Stoutvale',
    'Lanternwarden Commander',
    { x: COINWELL.x + 8, z: COINWELL.z - 6 },
    -Math.PI / 2,
    0xb7950b,
    'Eastbrook can spare me for a week. The Dig cannot be spared another day.',
  ),
  [C2_FENLOW_COINWELL]: npc(
    C2_FENLOW_COINWELL,
    'Captain Fenlow Tippet',
    'Ferry Captain',
    { x: COINWELL.x + 12, z: COINWELL.z + 10 },
    Math.PI * 0.75,
    0x3f5f7f,
    'I came round the coast by boat. The sea kept changing its mind about where the shore was.',
  ),
  [C2_BRYONY_COINWELL]: npc(
    C2_BRYONY_COINWELL,
    'Bryony Cooperwick',
    'Carpenter',
    { x: COINWELL_YARD.x + 8, z: COINWELL_YARD.z + 6 },
    Math.PI,
    0x8e6b46,
    'Chalk is only stone that has not made up its mind. I can work with that.',
  ),
};

const MOBS: Record<string, MobTemplate> = {
  dig_crawler: {
    ...ZONE1_MOBS.webwood_spider,
    id: 'dig_crawler',
    name: 'Dig Crawler',
    minLevel: 11,
    maxLevel: 12,
    loot: [{ copper: 40, chance: 1 }],
    color: 0x5b5048,
  },
  veiled_digger: {
    ...ZONE2_MOBS.gravecaller_cultist,
    id: 'veiled_digger',
    name: 'Veiled Digger',
    minLevel: 11,
    maxLevel: 12,
    loot: [{ copper: 55, chance: 1 }],
    color: 0x8a8a92,
  },
  chalk_cliff_gull: {
    ...ZONE2_MOBS.mire_prowler,
    id: 'chalk_cliff_gull',
    name: 'Chalk Cliff Gull',
    minLevel: 11,
    maxLevel: 12,
    loot: [
      { copper: 30, chance: 1 },
      { itemId: 'c2_nest_button', chance: 0.5, questId: 'c2_39_chalk_cliff_nests' },
    ],
    scale: 0.6,
    color: 0xe8e4da,
  },
};

const CAMPS: CampDef[] = [
  {
    mobId: 'dig_crawler',
    center: { x: UNLIT_DIG.x + 16, z: UNLIT_DIG.z - 16 },
    radius: 7,
    count: 5,
    offStream: true,
  },
  {
    mobId: 'veiled_digger',
    center: { x: UNLIT_DIG.x - 4, z: UNLIT_DIG.z + 4 },
    radius: 8,
    count: 6,
    offStream: true,
  },
  {
    mobId: 'chalk_cliff_gull',
    center: { x: WHITE_HEAD.x + 10, z: WHITE_HEAD.z + 4 },
    radius: 9,
    count: 6,
    offStream: true,
  },
];

const ITEMS: Record<string, ItemDef> = {
  c2_sealed_payment: qi('c2_sealed_payment', 'Sealed Gilt Payment', 'c2_34_coin_quiet_road'),
  c2_forged_claim_paper: qi(
    'c2_forged_claim_paper',
    'Forged Claim Paper',
    'c2_35_claim_nobody_filed',
    3,
  ),
  // Loaned tools: handed over on accept and taken back on turn-in.
  c2_loan_assay_pick: qi('c2_loan_assay_pick', 'Borrowed Assay Pick', 'c2_36_ore_with_a_will'),
  c2_kindle_ore: qi('c2_kindle_ore', 'Kindle Ore', 'c2_36_ore_with_a_will', 6),
  c2_test_ingot: qi('c2_test_ingot', 'Kindle Test Ingot', 'c2_36_ore_with_a_will'),
  c2_dig_lamp_taper: qi('c2_dig_lamp_taper', 'Lit Lamp Taper', 'c2_37_lanterns_will_not_light'),
  c2_bell_casting_pattern: qi(
    'c2_bell_casting_pattern',
    'Bell-Casting Pattern',
    'c2_38_what_dig_was_for',
  ),
  c2_nest_button: qi('c2_nest_button', 'Nest-Stolen Button', 'c2_39_chalk_cliff_nests', 5),
  c2_tide_mallet: qi('c2_tide_mallet', 'Tide Gauge Mallet', 'c2_40_bells_low_tide'),
  c2_bell_struck_fish: qi('c2_bell_struck_fish', 'Bell-Struck Fish', 'c2_40_bells_low_tide', 3),
  c2_loan_chalk_chisel: qi(
    'c2_loan_chalk_chisel',
    'Borrowed Chalk Chisel',
    'c2_41_tide_road_fortress',
  ),
  c2_chalk_block: qi('c2_chalk_block', 'Chalk Block', 'c2_41_tide_road_fortress', 4),
  c2_tide_road_brace: qi('c2_tide_road_brace', 'Tide-Road Brace', 'c2_41_tide_road_fortress', 2),
  c2_wreck_strongbox: qi(
    'c2_wreck_strongbox',
    'Sealed Wreck Strongbox',
    'c2_42_strongboxes_shoals',
    4,
  ),
};
const FIXTURES: Record<string, string> = {
  c2_claim_post: 'Coinwell Claim Post',
  c2_marked_kindle_vein: 'Marked Kindle Ore Vein',
  c2_coinwell_forge: 'Coinwell Camp Forge',
  c2_dig_lamp: 'Unlit Dig Lamp',
  c2_tide_gauge: 'Tide Gauge',
  c2_chalk_face: 'Cut Chalk Face',
  c2_coinwell_workbench: 'Coinwell Camp Workbench',
  c2_tide_road_footing: 'Tide-Road Footing',
};
for (const [id, name] of Object.entries(FIXTURES)) {
  ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

const OBJECTS = objects(2_147_240_000, [
  // Quest 34: the camp's claim posts on the coast road.
  [
    'c2_claim_post',
    'Coinwell Claim Post',
    [
      { x: COINWELL.x + 18, z: COINWELL.z - 14 },
      { x: COINWELL.x - 14, z: COINWELL.z - 20 },
    ],
  ],
  // Quest 35: the papers left in the wagons on the coast road.
  [
    'c2_forged_claim_paper',
    'Forged Claim Paper',
    [
      { x: COINWELL.x + 28, z: COINWELL.z - 36 },
      { x: COINWELL.x + 22, z: COINWELL.z - 44 },
      { x: COINWELL.x + 32, z: COINWELL.z - 50 },
    ],
  ],
  // Quest 36: the warm veins short of the Dig, and the camp forge.
  [
    'c2_marked_kindle_vein',
    'Marked Kindle Ore Vein',
    [
      { x: UNLIT_DIG.x + 38, z: UNLIT_DIG.z + 26 },
      { x: UNLIT_DIG.x + 32, z: UNLIT_DIG.z + 32 },
      { x: UNLIT_DIG.x + 44, z: UNLIT_DIG.z + 20 },
      { x: UNLIT_DIG.x + 26, z: UNLIT_DIG.z + 22 },
      { x: UNLIT_DIG.x + 36, z: UNLIT_DIG.z + 16 },
      { x: UNLIT_DIG.x + 48, z: UNLIT_DIG.z + 28 },
    ],
  ],
  [
    'c2_coinwell_forge',
    'Coinwell Camp Forge',
    [{ x: COINWELL_YARD.x - 3, z: COINWELL_YARD.z + 4 }],
  ],
  // Quest 37: the lamps at the Dig's mouth, on its camp-facing side.
  [
    'c2_dig_lamp',
    'Unlit Dig Lamp',
    [
      { x: UNLIT_DIG.x + 16, z: UNLIT_DIG.z + 6 },
      { x: UNLIT_DIG.x + 18, z: UNLIT_DIG.z - 2 },
      { x: UNLIT_DIG.x + 12, z: UNLIT_DIG.z + 12 },
      { x: UNLIT_DIG.x + 20, z: UNLIT_DIG.z + 10 },
    ],
  ],
  // Quest 38: the pattern on the casting floor inside the cell's ring.
  ['c2_bell_casting_pattern', 'Bell-Casting Pattern', [{ x: UNLIT_DIG.x - 2, z: UNLIT_DIG.z + 2 }]],
  // Quest 40: the gauges on the White Head shore.
  [
    'c2_tide_gauge',
    'Tide Gauge',
    [
      { x: WHITE_HEAD.x - 8, z: WHITE_HEAD.z - 10 },
      { x: WHITE_HEAD.x - 12, z: WHITE_HEAD.z + 2 },
      { x: WHITE_HEAD.x - 4, z: WHITE_HEAD.z + 10 },
    ],
  ],
  // Quest 41: the chalk faces under the head, the camp bench and the footings
  // where the tide road leaves the cove.
  [
    'c2_chalk_face',
    'Cut Chalk Face',
    [
      { x: WHITE_HEAD.x + 14, z: WHITE_HEAD.z - 16 },
      { x: WHITE_HEAD.x + 8, z: WHITE_HEAD.z - 20 },
      { x: WHITE_HEAD.x + 20, z: WHITE_HEAD.z - 22 },
      { x: WHITE_HEAD.x + 12, z: WHITE_HEAD.z - 26 },
    ],
  ],
  [
    'c2_coinwell_workbench',
    'Coinwell Camp Workbench',
    [{ x: COINWELL_YARD.x + 6, z: COINWELL_YARD.z - 2 }],
  ],
  [
    'c2_tide_road_footing',
    'Tide-Road Footing',
    [
      { x: WRECKERS_COVE.x + 4, z: WRECKERS_COVE.z - 6 },
      { x: WRECKERS_COVE.x + 10, z: WRECKERS_COVE.z - 2 },
    ],
  ],
  // Quest 42: the strongboxes the shoals keep giving back.
  [
    'c2_wreck_strongbox',
    'Sealed Wreck Strongbox',
    [
      { x: WRECKERS_COVE.x - 6, z: WRECKERS_COVE.z - 6 },
      { x: WRECKERS_COVE.x + 6, z: WRECKERS_COVE.z - 6 },
      { x: WRECKERS_COVE.x - 4, z: WRECKERS_COVE.z - 10 },
      { x: WRECKERS_COVE.x - 10, z: WRECKERS_COVE.z + 2 },
    ],
  ],
]);

/** Quest 40's fish, struck dumb by the bells at low water off the White Head. */
const CATCH_SPOTS: readonly QuestCatchSpot[] = Object.freeze([
  { itemId: 'c2_bell_struck_fish', x: WHITE_HEAD.x - 6, z: WHITE_HEAD.z - 4, radius: 6 },
]);

const QUESTS: Record<string, QuestDef> = {
  c2_34_coin_quiet_road: quest(
    'c2_34_coin_quiet_road',
    'Coin for a Quiet Road',
    10,
    'medium',
    SILVEN,
    C2_CLAIM_MASTER,
    'gilt_measure',
    "I have found where the bright coin goes. Coinwell Camp, out on the Chalkbarrow Coast, pays a 'road fee' every month, and that fee buys exactly the bandits the Causeway Watch keeps fighting. Carry this sealed payment to their claim-master and look at his claim posts while you are there. I want to see his face, and I want you to see his posts.",
    "This is Silven's seal, and that is my fee, and those are my posts, and not one of them marks the claim I paid for. Somebody has been taking my money to keep a road quiet that I never asked to have quiet. Sit down, $N. I need to be angry at someone who is not you.",
    [
      talk(C2_CLAIM_MASTER, 'Sealed payment handed to the claim-master', 'c2_sealed_payment'),
      inspect('c2_claim_post', 2, 'Coinwell claim post examined'),
    ],
    { requiredItems: ['c2_sealed_payment'] },
  ),
  c2_35_claim_nobody_filed: quest(
    'c2_35_claim_nobody_filed',
    'The Claim Nobody Filed',
    10,
    'medium',
    C2_CLAIM_MASTER,
    C2_CLAIM_MASTER,
    'gilt_measure',
    'Somebody is filing claims on this coast, in my hand, under my seal, on land that is not there yet. Not sold, not surveyed: not there. The papers travel in the wagons on the coast road. Bring me three of them, and do not read them aloud. I have a superstition about land that does not exist, and I would like to keep it.',
    'Low-water lines, $N. Every claim is drawn on ground that only shows when the tide goes out further than it ever has. Somebody expects the sea to step back, and means to own what it leaves.',
    [collect('c2_forged_claim_paper', 3, 'Forged Claim Paper')],
    { requiresQuest: 'c2_34_coin_quiet_road' },
  ),
  c2_36_ore_with_a_will: quest(
    'c2_36_ore_with_a_will',
    'Ore With a Will',
    10,
    'medium',
    C2_BRUNNA_COINWELL,
    C2_BRUNNA_COINWELL,
    'hearthwright_compact',
    'The prospectors bring me ore from the veins short of the Dig, and it is warm in the hand. Ore is not warm. Ore is honest and cold and does what it is told. Take my assay pick, cut a good load from the veins I marked, and smelt it into one test ingot at the camp forge. Then we will see what it has to say for itself.',
    'Feel it. It holds heat like a hearthstone and leans toward the sea when you set it down. Metal tells the truth, $N, and this metal says it would very much like to be a bell. I do not intend to let it.',
    [
      collect('c2_loan_assay_pick', 1, 'Borrowed Assay Pick'),
      useOn('c2_marked_kindle_vein', 6, 'Kindle Ore cut from a marked vein', 'c2_loan_assay_pick', {
        keepsUsedItem: true,
        yieldsItemId: 'c2_kindle_ore',
      }),
      useOn(
        'c2_coinwell_forge',
        1,
        'Kindle Test Ingot smelted at the camp forge',
        'c2_kindle_ore',
        {
          usesCount: 6,
          yieldsItemId: 'c2_test_ingot',
          station: true,
        },
      ),
    ],
    { requiredItems: ['c2_loan_assay_pick'], shareable: false },
  ),
  c2_37_lanterns_will_not_light: quest(
    'c2_37_lanterns_will_not_light',
    'Lanterns That Will Not Light',
    11,
    'large',
    C2_CLAIM_MASTER,
    C2_CLAIM_MASTER,
    'lanternwardens',
    'The Unlit Dig was a Coinwell claim until the veiled diggers walked in and took it. No flame stays lit at its mouth: not a candle, not a forge, not a pipe. Take this taper, it was lit at the camp hearth and it is stubborn, and light the four lamps at the mouth. Kill whatever crawls out while you work. I want light on that hole before I want anything else.',
    'Four lamps, still burning, and the crawlers backing off from them like the light is hot to the touch. The Lanternwardens have a saying about that, I am told. I never listened. I am listening now, $N.',
    [
      useOn('c2_dig_lamp', 4, 'Unlit Dig lamp lit', 'c2_dig_lamp_taper', { keepsUsedItem: true }),
      kill('dig_crawler', 8, 'Dig Crawler slain'),
    ],
    {
      requiresQuest: 'c2_35_claim_nobody_filed',
      requiredItems: ['c2_dig_lamp_taper'],
      shareable: false,
    },
  ),
  c2_38_what_dig_was_for: quest(
    'c2_38_what_dig_was_for',
    'What the Dig Was For',
    11,
    'large',
    C2_CORREN_COINWELL,
    C2_CORREN_COINWELL,
    'lanternwardens',
    'With the lamps lit we can see inside the Dig, and I do not like what we can see. The veiled diggers are not mining. They are casting. Go in, $N, put ten of them down, and bring me whatever they are casting from. I need to know what is worth this much warm ore, this much stolen coin and this many lies.',
    'A clapper. A bell clapper, cast from ore that wants to be a bell. Somebody is giving the drowned bells new tongues, and every one they hang rings the tide a little further out. The cord, the coin, the claims: it is all one plan, and the plan is to drown the harbor.',
    [
      kill('veiled_digger', 10, 'Veiled Digger slain'),
      collect('c2_bell_casting_pattern', 1, 'Bell-Casting Pattern'),
    ],
    { requiresQuest: 'c2_37_lanterns_will_not_light' },
  ),
  c2_39_chalk_cliff_nests: quest(
    'c2_39_chalk_cliff_nests',
    'Chalk Cliff Nests',
    11,
    'small',
    C2_COINWELL_COOK,
    C2_COINWELL_COOK,
    'lanternwardens',
    'The gulls off the White Head have been lining their nests with buttons. Brass buttons. Coat buttons, the sort sailors wear, and no sailor has stood on that cliff in years. I would like the gulls to stop, and I would like the buttons back, and I would like somebody else to climb up there. That somebody is you, $N.',
    "Every one of these is stamped with a ship and a harbor. Drowned men's buttons, brought up out of the sea. Gulls steal from the living all the time. When they start stealing from the drowned, it means the sea is giving things back. I will light a candle tonight.",
    [
      kill('chalk_cliff_gull', 10, 'Chalk Cliff Gull slain'),
      collect('c2_nest_button', 5, 'Nest-Stolen Button'),
    ],
  ),
  c2_40_bells_low_tide: quest(
    'c2_40_bells_low_tide',
    'Bells at Low Tide',
    11,
    'large',
    C2_FENLOW_COINWELL,
    C2_FENLOW_COINWELL,
    'lanternwardens',
    'I have sailed this coast for thirty years, $N, and the tide has never once lied to me. It is lying now. The water goes out too far and comes in too fast, and every time it turns, I hear bells. Strike the three gauges on the White Head shore at low water, and catch me a few of the fish that float up stunned after the ringing. I need proof before the next flood.',
    'The gauges dropped a hand past any mark I have ever cut, and the fish are struck dumb, every one, as if a great bell rang beside them. The bells are pulling the tide. When they pull hard enough to let go, Eastbrook harbor drowns.',
    [
      useOn('c2_tide_gauge', 3, 'Tide gauge struck at low water', 'c2_tide_mallet', {
        keepsUsedItem: true,
      }),
      collect('c2_bell_struck_fish', 3, 'Bell-Struck Fish caught off the White Head'),
    ],
    { requiredItems: ['c2_tide_mallet'], shareable: false },
  ),
  c2_41_tide_road_fortress: quest(
    'c2_41_tide_road_fortress',
    'A Tide Road to the Fortress',
    12,
    'medium',
    C2_BRYONY_COINWELL,
    C2_BRYONY_COINWELL,
    'hearthwright_compact',
    "There is a road under the sea. The old builders laid it from Wreckers' Cove to the drowned fortress, and at the lowest tide its first stones show. It needs braces before anyone sets foot on it. Take my chisel, cut chalk blocks from the faces under the White Head, shape two braces at the camp bench, and set them on the footings in the cove. Measure twice. The sea will not let you measure a third time.",
    'They hold. I stood on the first brace and the sea pushed at it and the brace pushed back. Somebody built this road a very long time ago because they meant to come home along it, $N. Now somebody can.',
    [
      collect('c2_loan_chalk_chisel', 1, 'Borrowed Chalk Chisel'),
      useOn('c2_chalk_face', 4, 'Chalk Block cut from the cliff face', 'c2_loan_chalk_chisel', {
        keepsUsedItem: true,
        yieldsItemId: 'c2_chalk_block',
      }),
      useOn(
        'c2_coinwell_workbench',
        2,
        'Tide-Road Brace shaped at the camp bench',
        'c2_chalk_block',
        {
          usesCount: 2,
          yieldsItemId: 'c2_tide_road_brace',
          station: true,
        },
      ),
      useOn('c2_tide_road_footing', 2, 'Tide-road brace set on its footing', 'c2_tide_road_brace'),
    ],
    {
      requiresQuest: 'c2_40_bells_low_tide',
      requiredItems: ['c2_loan_chalk_chisel'],
      shareable: false,
    },
  ),
  c2_42_strongboxes_shoals: quest(
    'c2_42_strongboxes_shoals',
    'Strongboxes on the Shoals',
    12,
    'medium',
    SILVEN,
    SILVEN,
    'gilt_measure',
    "That ship that sank twice: her strongboxes are washing up in Wreckers' Cove on the Chalkbarrow Coast, sealed with Gilt Measure wax. Our own wax, $N, on a cargo we never insured. The Gilt Measure would like its lost goods back, and I would like to know who has been sealing things in our name. Bring me four boxes, unopened. I mean that. Unopened.",
    'Unopened, as promised. You are a credit to honest commerce, which is a small club. Inside are ledgers, and the ledgers are paid in memories: so much a summer, so much a wedding. I think I am going to need a stronger drink than this.',
    [collect('c2_wreck_strongbox', 4, 'Sealed Wreck Strongbox')],
    { requiresQuest: 'c2_01_ship_sank_twice' },
  ),
};

/** The Chalkbarrow bundle (chapter_two_bundles.ts merges it when the zone is live). */
export const CHAPTER_TWO_CHALKBARROW: ChapterTwoBundle = Object.freeze({
  zoneIds: CHAPTER_TWO_CHALKBARROW_ZONE_IDS,
  items: ITEMS,
  mobs: MOBS,
  npcs: NPCS,
  quests: QUESTS,
  camps: CAMPS,
  objects: OBJECTS,
  catchSpots: CATCH_SPOTS,
});
