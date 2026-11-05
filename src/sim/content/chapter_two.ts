// Wyndlewood Chapter Two, "The Bells Beneath the Tide" (levels 5 to 13): the
// design crew's outline (docs/design/wyndlewood-chapter-two-outline.md),
// data only. Ids are c2_<nn>_<slug> after the outline's numbering, so a quest
// keeps its id when the rest of the chapter lands around it.
//
// Two bundles:
// - The CORE bundle (Eastbrook and Mirefen, zones every build ships) is merged
//   by data.ts like any content table and is playable today.
// - The REACHES bundle (the Applewold hubs, Pressford and Causeway Watch)
//   lives in zones the world crew is still shipping
//   (src/sim/content/frontier/southern_reaches.ts on feature/world-expansion).
//   data.ts merges it ONLY when the zone table already carries every zone
//   CHAPTER_TWO_REACHES_ZONE_IDS names (applyChapterTwoReaches): on a build
//   without them nothing of it exists, no Eastbrook or Mirefen quest requires
//   one of its quests, and its two Eastbrook-given quests simply never post.
//
// Positions in the core bundle were picked beside shipped dry-ground content
// (the quay, the causeway road, Fenbridge's edges) and are pinned by
// tests/chapter_two_content.test.ts; Reaches positions are taken from the
// world crew's FRONTIER_ANCHORS and are checked by the same test once the
// zones are live. Ground objects use reserved high entity ids from
// 2_147_210_000 (core) and 2_147_220_000 (Reaches), and camps spawn
// offStream, so nothing here shifts a shipped id or rng stream.
//
// Rewards follow the outline's XP sizes (a share of the quest level's bar:
// small 7, medium 10, large 20 percent) and every quest carries its faction's
// story standing (quests/quest_standing_reward.ts).

import type { QuestCatchSpot } from '../quests/quest_fishing_catch';
import { questStandingReward } from '../quests/quest_standing_reward';
import type {
  CampDef,
  GroundObjectDef,
  ItemDef,
  MobTemplate,
  NpcDef,
  QuestDef,
  QuestObjective,
} from '../types';
import { XP_TABLE } from '../types';
import { CHAPTER_ONE_MOBS } from './chapter_one';
import { ZONE1_MOBS } from './zone1';

type Faction = 'lanternwardens' | 'hearthwright_compact' | 'bracken_circle' | 'gilt_measure';
type Size = 'small' | 'medium' | 'large';

const XP_SHARE: Readonly<Record<Size, number>> = { small: 0.07, medium: 0.1, large: 0.2 };
/** Copper on the same ladder as the shipped Mirefen chain (about 25 copper a
 *  level for a medium quest), scaled by size. */
const COPPER_PER_LEVEL: Readonly<Record<Size, number>> = { small: 18, medium: 25, large: 40 };

export function chapterTwoXp(level: number, size: Size): number {
  return Math.round((XP_TABLE[level - 1] * XP_SHARE[size]) / 10) * 10;
}

// Shipped NPCs the chapter speaks through (ids frozen; display names as shipped
// or as Chapter One renamed them).
const SILVEN = 'trader_wilkes';
const ALDRIC = 'brother_aldric';
const JORREN = 'innkeeper_jorren';
const BERTRAM = 'gravekeeper_holven';
const NERIS = 'scout_neris';
const CORREN = 'marshal_redbrook';
const OSRIC = 'chronicler_osric_fenn';
const HALE = 'provisioner_hale';
const TEASEL = 'farmer_teasel';

// ---------------------------------------------------------------------------
// Builders (the Chapter One shapes; kept local, two uses do not earn a module).
// ---------------------------------------------------------------------------

function quest(
  id: string,
  name: string,
  level: number,
  size: Size,
  giver: string,
  turnIn: string,
  faction: Faction,
  text: string,
  completionText: string,
  objectives: QuestObjective[],
  extra: Partial<QuestDef> = {},
): QuestDef {
  return {
    id,
    name,
    giverNpcId: giver,
    turnInNpcId: turnIn,
    text,
    completionText,
    objectives,
    xpReward: chapterTwoXp(level, size),
    copperReward: COPPER_PER_LEVEL[size] * level,
    itemRewards: {},
    standingReward: questStandingReward(faction),
    minLevel: level,
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
const useOn = (
  targetObjectItemId: string,
  count: number,
  label: string,
  usesItemId: string,
  more: Partial<QuestObjective> = {},
): QuestObjective =>
  ({ type: 'interact', targetObjectItemId, count, label, usesItemId, ...more }) as QuestObjective;
const talk = (targetNpcId: string, label: string, usesItemId?: string): QuestObjective => ({
  type: 'interact',
  targetNpcId,
  count: 1,
  label,
  ...(usesItemId ? { usesItemId } : {}),
});
const kill = (targetMobId: string, count: number, label: string): QuestObjective => ({
  type: 'kill',
  targetMobId,
  count,
  label,
});

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

function objects(
  firstId: number,
  defs: [itemId: string, name: string, positions: { x: number; z: number }[]][],
): GroundObjectDef[] {
  let next = firstId;
  return defs.map(([itemId, name, positions]) => ({
    itemId,
    name,
    positions,
    entityIds: positions.map(() => next++),
  }));
}

// ===========================================================================
// CORE BUNDLE: Eastbrook and Mirefen
// ===========================================================================

export const CHAPTER_TWO_ITEMS: Record<string, ItemDef> = {
  c2_dry_cargo_crate: qi(
    'c2_dry_cargo_crate',
    'Suspiciously Dry Cargo Crate',
    'c2_01_ship_sank_twice',
    3,
  ),
  c2_harbor_fish: qi('c2_harbor_fish', 'Skittish Harbor Fish', 'c2_03_bells_from_steps', 5),
  // A loaned listening horn: the giver hands it over on accept and takes it back.
  c2_listening_horn: qi('c2_listening_horn', 'Borrowed Listening Horn', 'c2_03_bells_from_steps'),
  c2_crypt_key: qi('c2_crypt_key', "Sexton's Crypt Key", 'c2_12_door_we_left_shut'),
  c2_memory_wet_keepsake: qi(
    'c2_memory_wet_keepsake',
    'Memory-Wet Keepsake',
    'c2_28_remembered_roofs',
    3,
  ),
  c2_loan_hatchet: qi('c2_loan_hatchet', 'Borrowed Bog Hatchet', 'c2_32_bridge_fenbridge_trusts'),
  c2_bog_alder_log: qi('c2_bog_alder_log', 'Bog Alder Log', 'c2_32_bridge_fenbridge_trusts', 4),
  c2_boardwalk_plank: qi(
    'c2_boardwalk_plank',
    'Boardwalk Plank',
    'c2_32_bridge_fenbridge_trusts',
    2,
  ),
  c2_paddy_crop_bundle: qi('c2_paddy_crop_bundle', 'Paddy Crop Bundle', 'c2_33_paddy_work_fog', 5),
  c2_paddy_eel: qi('c2_paddy_eel', 'Paddy Eel', 'c2_33_paddy_work_fog', 3),
  // Teasel's spare rod: a working fishing implement, like Tobbin's in Chapter One.
  c2_loan_fishing_rod: {
    id: 'c2_loan_fishing_rod',
    name: "Teasel's Spare Rod",
    kind: 'tool',
    quality: 'common',
    use: { type: 'fishing' },
    sellValue: 0,
    questId: 'c2_33_paddy_work_fog',
  },
};

/** Interact-only world objects (inspected or used, never picked up). */
const CORE_FIXTURES: Record<string, string> = {
  c2_cargo_mark: 'Stenciled Cargo Mark',
  c2_jetty_post: 'Old Jetty Post',
  c2_overnight_house: 'House That Was Not Here Yesterday',
  c2_marked_bog_alder: 'Marked Bog Alder',
  c2_fen_workbench: "Fenbridge Boardwright's Bench",
  c2_rotten_span: 'Rotten Boardwalk Span',
};
for (const [id, name] of Object.entries(CORE_FIXTURES)) {
  CHAPTER_TWO_ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

export const CHAPTER_TWO_OBJECTS: GroundObjectDef[] = objects(2_147_210_000, [
  // The Eastbrook quay, below the ferry bell landing.
  [
    'c2_dry_cargo_crate',
    'Suspiciously Dry Cargo Crate',
    [
      { x: -90, z: -53 },
      { x: -96.5, z: -54.5 },
      { x: -88.5, z: -62 },
      { x: -99, z: -61 },
    ],
  ],
  ['c2_cargo_mark', 'Stenciled Cargo Mark', [{ x: -91.5, z: -50 }]],
  ['c2_jetty_post', 'Old Jetty Post', [{ x: -92, z: -63 }]],
  // The sexton's lodge on the Crypt Road, between the boundary warnings and
  // the Outer Wicket Chapter One left shut.
  ['c2_crypt_key', "Sexton's Crypt Key", [{ x: 51, z: 47 }]],
  // Fenbridge: the houses that appeared overnight beside the causeway road.
  [
    'c2_overnight_house',
    'House That Was Not Here Yesterday',
    [
      { x: 9, z: 247 },
      { x: -11, z: 259 },
      { x: 1, z: 265 },
    ],
  ],
  [
    'c2_memory_wet_keepsake',
    'Memory-Wet Keepsake',
    [
      { x: 10.5, z: 249 },
      { x: -9.5, z: 261 },
      { x: 2.5, z: 263 },
    ],
  ],
  // Provisioner Hale's boardwalk work: alders west of the road, the bench by
  // his stores, and the two rotten spans where the causeway meets the town.
  [
    'c2_marked_bog_alder',
    'Marked Bog Alder',
    [
      { x: -19, z: 278 },
      { x: -23, z: 284 },
      { x: -21, z: 279.5 },
      { x: -25, z: 274 },
    ],
  ],
  ['c2_fen_workbench', "Fenbridge Boardwright's Bench", [{ x: -7, z: 312 }]],
  [
    'c2_rotten_span',
    'Rotten Boardwalk Span',
    [
      { x: 4, z: 286 },
      { x: -3, z: 290 },
    ],
  ],
  // Farmer Teasel's harvest, bundled where his west paddy meets the causeway
  // road south of Fenbridge, and his spare rod beside it.
  [
    'c2_paddy_crop_bundle',
    'Paddy Crop Bundle',
    [
      { x: -9, z: 224 },
      { x: -10, z: 233 },
      { x: -11, z: 240 },
      { x: -9, z: 247 },
      { x: -10, z: 255 },
    ],
  ],
  ['c2_loan_fishing_rod', "Teasel's Spare Rod", [{ x: -8, z: 229 }]],
]);

/** Quest catches (quests/quest_fishing_catch.ts): the harbor fish off the
 *  Eastbrook town steps, the eels at the Deepfen Shallows' paddy edge. */
export const CHAPTER_TWO_CATCH_SPOTS: readonly QuestCatchSpot[] = Object.freeze([
  { itemId: 'c2_harbor_fish', x: -94, z: -60, radius: 6 },
  { itemId: 'c2_paddy_eel', x: -72, z: 310, radius: 7 },
]);

export const CHAPTER_TWO_QUESTS: Record<string, QuestDef> = {
  c2_01_ship_sank_twice: quest(
    'c2_01_ship_sank_twice',
    'Cargo From a Ship That Sank Twice',
    5,
    'large',
    SILVEN,
    SILVEN,
    'lanternwardens',
    'Crates have been washing up on the quay all morning, and they are dry inside. Wood that has been under the sea for years does not stay dry, $N, and neither do I when I think about it too long. Bring me three of them and read the mark stenciled on the one the tide left by the bell.',
    'Gilt Measure seal, an old one, on a ship the harbor rolls say went down twice: once in a storm, and once again when someone tried to raise her. Either the sea is returning things, or someone wants us to think it is.',
    [
      collect('c2_dry_cargo_crate', 3, 'Suspiciously Dry Cargo Crate'),
      inspect('c2_cargo_mark', 1, 'Stenciled Cargo Mark read'),
    ],
    { requiresQuest: 'c1_28_door_left_shut', shareable: false },
  ),
  c2_03_bells_from_steps: quest(
    'c2_03_bells_from_steps',
    'Bells You Can Hear From the Steps',
    5,
    'small',
    JORREN,
    JORREN,
    'bracken_circle',
    'The fish below the town steps have gone nervous. Not shy, nervous, the way a cat goes nervous before a storm. Catch a few for my kitchen, then hold this old horn to the jetty post and tell me I am imagining the ringing.',
    'You heard it too. Bells, under the water, slow as a funeral. Well. The fish are excellent, and I intend to serve them before they hear anything else.',
    [
      collect('c2_harbor_fish', 5, 'Skittish Harbor Fish caught off the town steps'),
      useOn('c2_jetty_post', 1, 'Listened at the old jetty post', 'c2_listening_horn', {
        keepsUsedItem: true,
      }),
    ],
    { requiredItems: ['c2_listening_horn'], shareable: false },
  ),
  c2_12_door_we_left_shut: quest(
    'c2_12_door_we_left_shut',
    'The Door We Left Shut',
    7,
    'large',
    BERTRAM,
    ALDRIC,
    'lanternwardens',
    "We were right to leave the crypt shut. I would like that on record before I say the next part: it has to be opened now. Look at the Outer Wicket for me, then fetch the key from the sexton's lodge. Bring both your eyes and the key to Brother Aldric, in that order of importance.",
    "The wicket's ward has gone cold, and the key is warm. That is backwards in every way that matters. Very well. The crypt opens, and I will pray for whoever goes in first. That will be you.",
    [
      inspect('c1_outer_wicket', 1, 'Outer Wicket examined'),
      collect('c2_crypt_key', 1, "Sexton's Crypt Key"),
    ],
    { requiresQuest: 'c1_28_door_left_shut' },
  ),
  c2_28_remembered_roofs: quest(
    'c2_28_remembered_roofs',
    'Remembered Roofs',
    9,
    'medium',
    OSRIC,
    OSRIC,
    'bracken_circle',
    'Three houses stand along the causeway road this morning. I have walked that road every day for eleven years, and I would have noticed houses. Knock, look inside, and bring me anything left on the sills. Handle it gently; I suspect it remembers more than we do.',
    "A child's shoe, a wedding spoon, a letter to nobody. Each one is wet, and none of them has been near water. Someone is building homes out of what people have forgotten. I will write this down before I forget it as well.",
    [
      inspect('c2_overnight_house', 3, 'Overnight house examined'),
      collect('c2_memory_wet_keepsake', 3, 'Memory-Wet Keepsake'),
    ],
    { requiresQuest: 'q_drowned' },
  ),
  c2_32_bridge_fenbridge_trusts: quest(
    'c2_32_bridge_fenbridge_trusts',
    'A Bridge Fenbridge Can Trust',
    10,
    'medium',
    HALE,
    HALE,
    'hearthwright_compact',
    "The boardwalk is sinking a hand's width a week, and the fog is not helping. Take my hatchet, fell the alders I have marked, and turn them into planks at the bench. Then replace the two spans that have started making noises a bridge should not make.",
    'Solid as a promise, and quieter than most. Fenbridge walks dry tonight because you spent your afternoon on planks instead of glory. I will not forget it, which these days is saying something.',
    [
      collect('c2_loan_hatchet', 1, 'Borrowed Bog Hatchet'),
      useOn('c2_marked_bog_alder', 4, 'Marked Bog Alder felled', 'c2_loan_hatchet', {
        keepsUsedItem: true,
        yieldsItemId: 'c2_bog_alder_log',
      }),
      useOn('c2_fen_workbench', 1, 'Boardwalk Planks cut at the bench', 'c2_bog_alder_log', {
        usesCount: 4,
        yieldsItemId: 'c2_boardwalk_plank',
        yieldsCount: 2,
        station: true,
      }),
      useOn('c2_rotten_span', 2, 'Rotten span replaced', 'c2_boardwalk_plank'),
    ],
    { requiredItems: ['c2_loan_hatchet'], shareable: false },
  ),
  c2_33_paddy_work_fog: quest(
    'c2_33_paddy_work_fog',
    'Paddy Work in the Fog',
    10,
    'small',
    TEASEL,
    TEASEL,
    'hearthwright_compact',
    'There is a harvest standing in my west paddy, and I do not remember sowing it. My hands do, apparently. Bundle what is ripe, borrow my spare rod, and pull a few eels out of the shallows before they eat the rest.',
    'Good rice, fat eels, and not one memory of planting either. I have decided to be grateful rather than frightened. It is easier on the knees.',
    [
      collect('c2_paddy_crop_bundle', 5, 'Paddy Crop Bundle'),
      collect('c2_loan_fishing_rod', 1, "Teasel's Spare Rod"),
      collect('c2_paddy_eel', 3, 'Paddy Eel caught at the shallows'),
    ],
    { shareable: false },
  ),
};

/** Which NPCs list which core chapter quests (giver, turn-in and talk targets),
 *  merged onto NpcDef.questIds by data.ts. */
export function chapterTwoNpcQuestIds(
  quests: Readonly<Record<string, QuestDef>> = CHAPTER_TWO_QUESTS,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (npcId: string, questId: string) => {
    const list = out[npcId] ?? [];
    if (!list.includes(questId)) list.push(questId);
    out[npcId] = list;
  };
  for (const q of Object.values(quests)) {
    add(q.giverNpcId, q.id);
    add(q.turnInNpcId, q.id);
    for (const o of q.objectives)
      if (o.type === 'interact' && o.targetNpcId) add(o.targetNpcId, q.id);
  }
  return out;
}

// ===========================================================================
// REACHES BUNDLE: the Applewold (merged only when the zones are live)
// ===========================================================================

/** Every zone the Reaches bundle stands in; applyChapterTwoReaches merges it
 *  only when the zone table carries all of them. */
export const CHAPTER_TWO_REACHES_ZONE_IDS: readonly string[] = Object.freeze(['applewold']);

/** The world crew's Applewold anchors (frontier/layout.ts FRONTIER_ANCHORS),
 *  restated here so this bundle reads no module that may not exist yet. */
const PRESSFORD = { x: 332, z: -318 };
const CAUSEWAY_WATCH = { x: 372, z: -262 };
const BLOSSOM_RISE = { x: 468, z: -292 };
const OLD_PRESS = { x: 268, z: -402 };

export const C2_CIDER_MASTER = 'cider_master_mabel';
export const C2_WATCH_SERGEANT = 'sergeant_ivo_bramwell';

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

const REACHES_NPCS: Record<string, NpcDef> = {
  [C2_CIDER_MASTER]: npc(
    C2_CIDER_MASTER,
    'Mabel Cotterill',
    'Pressford Cider-Master',
    { x: PRESSFORD.x + 4, z: PRESSFORD.z + 4 },
    Math.PI,
    0xa86f3a,
    'Pressford makes the best cider in the Reaches, and the second best, and most of the third.',
  ),
  [C2_WATCH_SERGEANT]: npc(
    C2_WATCH_SERGEANT,
    'Ivo Bramwell',
    'Causeway Watch Sergeant',
    { x: CAUSEWAY_WATCH.x - 2, z: CAUSEWAY_WATCH.z + 4 },
    Math.PI / 2,
    0x5f6f86,
    'The causeway is one road with the sea on both sides. I like it that way. Fewer directions to be ambushed from.',
  ),
};

const REACHES_MOBS: Record<string, MobTemplate> = {
  waybill_cutpurse: {
    ...ZONE1_MOBS.vale_bandit,
    id: 'waybill_cutpurse',
    name: 'Waybill Cutpurse',
    minLevel: 6,
    maxLevel: 7,
    loot: [
      { copper: 14, chance: 1 },
      { itemId: 'c2_stolen_waybill', chance: 0.5, questId: 'c2_06_watch_holds_road' },
    ],
  },
  windfall_boar: {
    ...CHAPTER_ONE_MOBS.orchard_boar,
    id: 'windfall_boar',
    name: 'Windfall Boar',
    minLevel: 6,
    maxLevel: 7,
    loot: [{ copper: 12, chance: 1 }],
  },
};

const REACHES_CAMPS: CampDef[] = [
  {
    mobId: 'waybill_cutpurse',
    center: { x: OLD_PRESS.x + 22, z: OLD_PRESS.z + 30 },
    radius: 7,
    count: 5,
    offStream: true,
  },
  {
    mobId: 'windfall_boar',
    center: { x: BLOSSOM_RISE.x - 24, z: BLOSSOM_RISE.z - 26 },
    radius: 8,
    count: 5,
    offStream: true,
  },
];

const REACHES_ITEMS: Record<string, ItemDef> = {
  c2_ledger_copy: qi('c2_ledger_copy', "Silven's Ledger Copy", 'c2_02_whose_seal'),
  c2_lantern_oil_flask: qi(
    'c2_lantern_oil_flask',
    'Flask of Causeway Lamp Oil',
    'c2_04_lantern_causeway',
  ),
  c2_proving_shore_cord: qi(
    'c2_proving_shore_cord',
    'Bundle of Proving Shore Cord',
    'c2_05_causeway_watch',
  ),
  c2_stolen_waybill: qi('c2_stolen_waybill', 'Stolen Waybill', 'c2_06_watch_holds_road', 3),
  c2_tally_stick: qi('c2_tally_stick', 'Misremembered Tally Stick', 'c2_07_pressford_remembers', 4),
  c2_windfall_apple: qi('c2_windfall_apple', 'Windfall Apple', 'c2_08_pests_windfalls', 6),
};
const REACHES_FIXTURES: Record<string, string> = {
  c2_shipping_roll: 'Pressford Shipping Roll',
  c2_causeway_lantern: 'Causeway Lantern',
  c2_pressford_door: 'Pressford Cottage Door',
};
for (const [id, name] of Object.entries(REACHES_FIXTURES)) {
  REACHES_ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

const REACHES_OBJECTS: GroundObjectDef[] = objects(2_147_220_000, [
  ['c2_shipping_roll', 'Pressford Shipping Roll', [{ x: PRESSFORD.x + 7, z: PRESSFORD.z + 1 }]],
  [
    'c2_causeway_lantern',
    'Causeway Lantern',
    [
      { x: CAUSEWAY_WATCH.x + 22, z: CAUSEWAY_WATCH.z + 46 },
      { x: CAUSEWAY_WATCH.x + 13, z: CAUSEWAY_WATCH.z + 28 },
      { x: CAUSEWAY_WATCH.x + 5, z: CAUSEWAY_WATCH.z + 12 },
    ],
  ],
  [
    'c2_pressford_door',
    'Pressford Cottage Door',
    [
      { x: PRESSFORD.x - 9, z: PRESSFORD.z + 6 },
      { x: PRESSFORD.x + 11, z: PRESSFORD.z - 7 },
      { x: PRESSFORD.x - 4, z: PRESSFORD.z - 12 },
    ],
  ],
  [
    'c2_tally_stick',
    'Misremembered Tally Stick',
    [
      { x: PRESSFORD.x - 6, z: PRESSFORD.z - 4 },
      { x: PRESSFORD.x + 8, z: PRESSFORD.z + 6 },
      { x: PRESSFORD.x - 2, z: PRESSFORD.z - 8 },
      { x: PRESSFORD.x + 6, z: PRESSFORD.z - 4 },
    ],
  ],
  [
    'c2_windfall_apple',
    'Windfall Apple',
    [
      { x: BLOSSOM_RISE.x - 20, z: BLOSSOM_RISE.z - 8 },
      { x: BLOSSOM_RISE.x - 16, z: BLOSSOM_RISE.z - 14 },
      { x: BLOSSOM_RISE.x - 10, z: BLOSSOM_RISE.z - 6 },
      { x: BLOSSOM_RISE.x - 24, z: BLOSSOM_RISE.z - 16 },
      { x: BLOSSOM_RISE.x - 6, z: BLOSSOM_RISE.z - 12 },
      { x: BLOSSOM_RISE.x - 13, z: BLOSSOM_RISE.z - 20 },
    ],
  ],
]);

const REACHES_QUESTS: Record<string, QuestDef> = {
  c2_02_whose_seal: quest(
    'c2_02_whose_seal',
    'Whose Seal Is This',
    5,
    'medium',
    SILVEN,
    C2_CIDER_MASTER,
    'gilt_measure',
    "The seal is a Pressford cider consignment, booked, paid and blessed, that never left the press. Carry my ledger copy south across the causeway to the cider-master and read the town's shipping roll. If the cider sailed, someone drank a ghost.",
    'That is my booking, my seal and my signature, for a harvest this town never pressed. I have a cellar full of empty barrels and a head full of a summer I cannot remember. Sit down. I will pour you something that definitely exists.',
    [
      talk(C2_CIDER_MASTER, "Ledger copy delivered to Pressford's cider-master", 'c2_ledger_copy'),
      inspect('c2_shipping_roll', 1, 'Pressford shipping roll read'),
    ],
    { requiresQuest: 'c2_01_ship_sank_twice', requiredItems: ['c2_ledger_copy'] },
  ),
  c2_04_lantern_causeway: quest(
    'c2_04_lantern_causeway',
    'A Lantern for the Causeway',
    6,
    'medium',
    NERIS,
    C2_WATCH_SERGEANT,
    'lanternwardens',
    "The lanterns on the southern causeway keep going out, and a lantern that goes out on a sea road is a trap with good manners. Take this oil off the Farshore's south point, fill the three lamps on the way down, and report to the watch sergeant at the far end.",
    'Three lights where there were none, and you still have your boots. The sea breathed on those lamps all week. We will see whether it likes the taste of fresh oil.',
    [
      useOn('c2_causeway_lantern', 3, 'Causeway lantern refilled', 'c2_lantern_oil_flask', {
        keepsUsedItem: true,
      }),
    ],
    { requiresQuest: 'c2_01_ship_sank_twice', requiredItems: ['c2_lantern_oil_flask'] },
  ),
  c2_05_causeway_watch: quest(
    'c2_05_causeway_watch',
    'Causeway Watch',
    6,
    'medium',
    CORREN,
    C2_WATCH_SERGEANT,
    'lanternwardens',
    "The cold cord from the Proving Shore beacon, the dry cargo, the bells Jorren swears he hears: every thread I pull runs south. Take this bundle of cord to the Causeway Watch and put it in a sergeant's hands. Tell him Eastbrook is listening.",
    'This is the same cord we cut off the waybill thieves last week. So Eastbrook has the head of the snake and we have the tail. I would very much like to meet the middle.',
    [talk(C2_WATCH_SERGEANT, 'Proving Shore cord handed to the watch', 'c2_proving_shore_cord')],
    { requiresQuest: 'c2_04_lantern_causeway', requiredItems: ['c2_proving_shore_cord'] },
  ),
  c2_06_watch_holds_road: quest(
    'c2_06_watch_holds_road',
    'The Watch Holds the Road',
    7,
    'medium',
    C2_WATCH_SERGEANT,
    C2_WATCH_SERGEANT,
    'lanternwardens',
    'Somebody is paying cutpurses to stop every cart heading inland, and paying them well enough that they have started wearing clean boots. Thin them out near the old press and bring back the waybills they lifted. I want to know whose cargo frightens somebody.',
    'Cider barrels, empty. Cider barrels, empty. Cider barrels, full of nothing anyone can name. Whoever wants this road shut is guarding a harvest that never happened.',
    [
      kill('waybill_cutpurse', 8, 'Waybill Cutpurse slain'),
      collect('c2_stolen_waybill', 3, 'Stolen Waybill'),
    ],
    { requiresQuest: 'c2_05_causeway_watch' },
  ),
  c2_07_pressford_remembers: quest(
    'c2_07_pressford_remembers',
    'Pressford Remembers a Harvest',
    6,
    'large',
    C2_CIDER_MASTER,
    C2_CIDER_MASTER,
    'hearthwright_compact',
    'Half the town swears we pressed a harvest this summer, and the other half swears we did not, and both halves are carrying the same tally sticks. Knock on three doors, ask what they remember, and collect any tally stick that disagrees with itself.',
    'Every stick counts a barrel, and every barrel is in a cellar that is empty. We remember the work but not the fruit. Someone harvested us, $N, and I would like to know with what kind of basket.',
    [
      inspect('c2_pressford_door', 3, 'Pressford villager asked'),
      collect('c2_tally_stick', 4, 'Misremembered Tally Stick'),
    ],
    { requiresQuest: 'c2_02_whose_seal' },
  ),
  c2_08_pests_windfalls: quest(
    'c2_08_pests_windfalls',
    'Pests in the Windfalls',
    6,
    'medium',
    C2_CIDER_MASTER,
    C2_CIDER_MASTER,
    'bracken_circle',
    'The boars have found the windfalls under Blossom Rise, and they have gone bold about it, which boars should never be. Drive them off and gather the good apples before they finish the hill. Bruised is fine. Bitten is a conversation.',
    'Six good apples, and a hillside that smells of cider instead of pig. The trees have been dropping fruit out of season. I would call it generosity if trees did that sort of thing.',
    [
      kill('windfall_boar', 6, 'Windfall Boar driven off'),
      collect('c2_windfall_apple', 6, 'Windfall Apple'),
    ],
  ),
};

/** The Reaches bundle as one value: what applyChapterTwoReaches merges. */
export const CHAPTER_TWO_REACHES = Object.freeze({
  zoneIds: CHAPTER_TWO_REACHES_ZONE_IDS,
  items: REACHES_ITEMS,
  mobs: REACHES_MOBS,
  npcs: REACHES_NPCS,
  quests: REACHES_QUESTS,
  camps: REACHES_CAMPS,
  objects: REACHES_OBJECTS,
});

export interface ChapterTwoReachesTables {
  readonly zoneIds: readonly string[];
  readonly items: Record<string, ItemDef>;
  readonly mobs: Record<string, MobTemplate>;
  readonly npcs: Record<string, NpcDef>;
  readonly quests: Record<string, QuestDef>;
  readonly questOrder: string[];
  readonly camps: CampDef[];
  readonly objects: GroundObjectDef[];
}

/**
 * Merge the Reaches bundle into the live tables when, and only when, every
 * zone it stands in is present. Appends only (no shipped entry moves), and is
 * idempotent. Returns whether the bundle was merged.
 */
export function applyChapterTwoReaches(tables: ChapterTwoReachesTables): boolean {
  const live = CHAPTER_TWO_REACHES_ZONE_IDS.every((id) => tables.zoneIds.includes(id));
  if (!live) return false;
  if (Object.hasOwn(tables.quests, 'c2_02_whose_seal')) return true;
  Object.assign(tables.items, REACHES_ITEMS);
  Object.assign(tables.mobs, REACHES_MOBS);
  Object.assign(tables.npcs, REACHES_NPCS);
  Object.assign(tables.quests, REACHES_QUESTS);
  tables.questOrder.push(...Object.keys(REACHES_QUESTS));
  tables.camps.push(...REACHES_CAMPS);
  tables.objects.push(...REACHES_OBJECTS);
  for (const [npcId, questIds] of Object.entries(chapterTwoNpcQuestIds(REACHES_QUESTS))) {
    const def = tables.npcs[npcId];
    if (!def) continue;
    for (const questId of questIds) if (!def.questIds.includes(questId)) def.questIds.push(questId);
  }
  return true;
}

/** Item art debt (src/ui/icons.ts ITEM_ART_PENDING): every Chapter Two item
 *  and object id draws its procedural quest icon until its painted wave lands. */
export const CHAPTER_TWO_ART_PENDING_ITEM_IDS: readonly string[] = Object.freeze([
  ...Object.keys(CHAPTER_TWO_ITEMS),
  ...Object.keys(REACHES_ITEMS),
]);
