// Wyndlewood Chapter Seven, "The Last Hearthlight" (level 20): the plan in
// docs/narrative/chapters_3_to_7_plan.md, data only. Ids are c7_<nn>_<slug>.
//
// The Amberfall's remembering woods and wandering waters first, then the
// Willowfen, where Mother Sedge keeps the last Hearthpin's resting place.
// The player carries word to the four allied factions' quartermasters (the
// dragons of Chapter Six are the ring's fifth people), builds the rite's lantern
// at a Willowfen bench, and defends the rite in the Wildheart Basin, the
// shipped level 20 instance reframed as the ritual ground (decisions section
// 2): its final boss is the voice through which Vauldren Sere's power
// manifests (his folklore title is read from wyndlewood_lore.ts). The
// campaign ends at home, at the Eastbrook inn.
//
// One bundle on the Chapter Two seam (merged by story_chapters.ts): reserved
// ground-object entity ids from 2_147_290_000, appended after every shipped
// record. No camps: the fights use the shipped populations.

import type { CampDef, ItemDef, MobTemplate, NpcDef, QuestDef } from '../types';
import { C6_CLOSING_QUEST } from './chapter_six';
import {
  type ChapterTwoBundle,
  inspect,
  kill,
  objects,
  pick,
  qi,
  quest,
  talk,
  useOn,
} from './chapter_two';
import { OATHLESS_KING_TITLE } from './wyndlewood_lore';

const OTTOLINE = 'reeve_ottoline';
const CADDOW = 'ferrymaster_caddow';
const SEDGE = 'mother_sedge';
const JORREN = 'innkeeper_jorren';
// The four allied quartermasters (factions.ts): one banner each.
const ALTHEA = 'npc_church_order_quartermaster';
const TOBRIN = 'npc_automaton_quartermaster';
const YARA = 'herbalist_yara';
const VAELEN = 'npc_rift_watch_quartermaster';

export const C7_CLOSING_QUEST = 'c7_07_supper_is_getting_cold';

export const CHAPTER_SEVEN_ZONE_IDS: readonly string[] = Object.freeze([
  'amberfall',
  'willowfen',
  'eastbrook_vale',
]);

const ITEMS: Record<string, ItemDef> = {
  c7_willow_withy: qi('c7_willow_withy', 'Pale Willow Withy', 'c7_05_lanterns_for_the_rite', 5),
  c7_hearthlight_lantern: qi(
    'c7_hearthlight_lantern',
    'Hearthlight Lantern',
    'c7_05_lanterns_for_the_rite',
  ),
};
const FIXTURES: Record<string, string> = {
  c7_remembering_oak: 'Remembering Oak',
  c7_wandering_mooring_stone: 'Wandering Mooring Stone',
  c7_withy_willow: 'Pale Withy Willow',
  c7_rite_bench: "Mother Sedge's Rite Bench",
};
for (const [id, name] of Object.entries(FIXTURES)) {
  ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

const OBJECTS = objects(2_147_290_000, [
  // The orchard woods west of the Reeve's hall.
  [
    'c7_remembering_oak',
    'Remembering Oak',
    [
      { x: -400, z: 2010 },
      { x: -394, z: 2008.5 },
      { x: -395.5, z: 2014 },
    ],
  ],
  // The mere shore, where the stones keep walking toward the water.
  [
    'c7_wandering_mooring_stone',
    'Wandering Mooring Stone',
    [
      { x: -310, z: 2133.5 },
      { x: -308, z: 2139 },
      { x: -314, z: 2129.5 },
    ],
  ],
  // Mother Sedge's withy bed and her bench at Willowweep.
  [
    'c7_withy_willow',
    'Pale Withy Willow',
    [
      { x: -400, z: 430 },
      { x: -394, z: 428.5 },
      { x: -395.5, z: 434 },
      { x: -400.5, z: 436 },
      { x: -405, z: 433 },
    ],
  ],
  ['c7_rite_bench', "Mother Sedge's Rite Bench", [{ x: -404.5, z: 447 }]],
]);

const QUESTS: Record<string, QuestDef> = {
  c7_01_trees_that_remember: quest(
    'c7_01_trees_that_remember',
    'Trees That Remember',
    20,
    'medium',
    OTTOLINE,
    OTTOLINE,
    'bracken_circle',
    'Three of the old oaks west of the hall have started speaking in their sleep, and the foxes have gone wild listening to them. The oaks remember the first people who walked these woods, $N. If the last Hearthpin is anywhere, they will have watched it pass. Calm the foxes, then put your hand on each oak and listen.',
    'They remember the rite. Five peoples in a ring around a pin of living light, and every one of them bringing something they had made. Not gold. Bread, rope, a hinge, a song. The woods have been waiting a long time for somebody to ask.',
    [
      kill('gloam_fox', 8, 'Gloam Fox calmed for good'),
      inspect('c7_remembering_oak', 3, 'Listened to a remembering oak'),
    ],
    { requiresQuest: C6_CLOSING_QUEST },
  ),
  c7_02_rivers_change_course: quest(
    'c7_02_rivers_change_course',
    'Rivers Change Their Course',
    20,
    'medium',
    CADDOW,
    CADDOW,
    'lanternwardens',
    "The mere has moved. Not flooded: moved, a hand's width west every night, and it is taking my mooring stones with it. The lurkers love it. Thin them out, and read the marks on three of the stones that walked. If the water is going somewhere on purpose, I want to know where.",
    'Every stone points the same way: north, to the Willowfen. The water is going home to something. Go after it. Mother Sedge at Willowweep will either know what it is, or make you a very good cup of something while she pretends to.',
    [
      kill('mere_lurker', 6, 'Mere Lurker driven off'),
      inspect('c7_wandering_mooring_stone', 3, 'Wandering mooring stone read'),
    ],
    { requiresQuest: 'c7_01_trees_that_remember' },
  ),
  c7_03_the_last_hearthpin: quest(
    'c7_03_the_last_hearthpin',
    'The Last Hearthpin',
    20,
    'small',
    CADDOW,
    SEDGE,
    'bracken_circle',
    'The water knows the way, and so does the old witch of Willowweep. Take the fen road north and ask Mother Sedge about the last Hearthpin. Tell her the Amberfall sent you, and that the oaks remember. She likes to be told things she already knows. It saves her the trouble of saying them first.',
    'The oaks remember, do they? So do I. The last Hearthpin sleeps under the Wildheart Basin, where every river in this country finally runs. It has been waiting for a ring of five. Pull up a stool, $N. This part takes some planning.',
    [talk(SEDGE, 'Asked Mother Sedge about the last Hearthpin')],
    { requiresQuest: 'c7_02_rivers_change_course' },
  ),
  c7_04_five_banners: quest(
    'c7_04_five_banners',
    'Five Banners',
    20,
    'large',
    SEDGE,
    SEDGE,
    'lanternwardens',
    "A ring of five, the old rite says, and we are four banners and a handful of dragons. The dragons have already answered. Now you carry word to the rest: the Lanternwardens' captain in Eastbrook, the Hearthwright artificer in Wyrmwatch, the Bracken Circle's herbalist in Fenbridge, and the Gilt Measure's quartermaster in Drifthaven. Tell each one where and when. Do not let any of them make a speech.",
    'Swords from the Lanternwardens, tools from the Compact, rites from the Circle, and from the Gilt Measure, rare oils and a very detailed invoice. You are the knot that holds the ring together, $N. Not the chosen one. Just the one who went and asked.',
    [
      talk(ALTHEA, 'The Lanternwardens answered'),
      talk(TOBRIN, 'The Hearthwright Compact answered'),
      talk(YARA, 'The Bracken Circle answered'),
      talk(VAELEN, 'The Gilt Measure answered'),
    ],
    { requiresQuest: 'c7_03_the_last_hearthpin' },
  ),
  c7_05_lanterns_for_the_rite: quest(
    'c7_05_lanterns_for_the_rite',
    'Lanterns for the Rite',
    20,
    'medium',
    SEDGE,
    SEDGE,
    'hearthwright_compact',
    'The ring needs a light every banner can see, and the old rite says it must be made by hand, not bought. Cut withies from the pale willows in my bed, five good ones, and bend them into a lantern at my bench. It will not be pretty. The first ones never were. That is rather the point.',
    'Lopsided, and it leans to the left, and it is the finest thing I have seen made in fifty years. Everything that ever held this world together looked like that the first time. Keep it close. You will want it in the Basin.',
    [
      pick('c7_withy_willow', 5, 'Pale Willow Withy cut', 'c7_willow_withy'),
      useOn('c7_rite_bench', 1, 'Hearthlight Lantern bent at the bench', 'c7_willow_withy', {
        usesCount: 5,
        yieldsItemId: 'c7_hearthlight_lantern',
        station: true,
      }),
    ],
    { requiresQuest: 'c7_04_five_banners', shareable: false },
  ),
  c7_06_the_wildheart_rite: quest(
    'c7_06_the_wildheart_rite',
    'The Wildheart Rite',
    20,
    'large',
    SEDGE,
    SEDGE,
    'lanternwardens',
    `The banners are gathering at the Wildheart Basin, and so is everything ${OATHLESS_KING_TITLE} still commands. His power will come through the Basin's own voice, the old priest who sits on the last Hearthpin and calls himself its master. Go in with a full party, hold the ring, and silence that voice. Then let the pin wake.`,
    'I felt it from here. Every hearth in the country flared at once, and the old bells rang in towers that lost their bells a hundred years ago. He is sealed away, $N. Not destroyed. Nothing that old is ever destroyed. But sealed, and the ring will hold if we keep tending it.',
    [kill('wildheart_high_priest', 1, 'The Voice of the Basin silenced in the Wildheart Basin')],
    { requiresQuest: 'c7_05_lanterns_for_the_rite' },
  ),
  [C7_CLOSING_QUEST]: quest(
    C7_CLOSING_QUEST,
    'Supper Is Getting Cold',
    20,
    'large',
    SEDGE,
    JORREN,
    'hearthwright_compact',
    'Go home, $N. I mean it. The world will want you again soon enough; it always does. But tonight there is an inn in Eastbrook with a fire in it, and an innkeeper who has kept a stool by the hearth for you since the day you left. The rest of us can mind the ring for one evening.',
    "Well, look who's back. Saved the world, have you? Splendid. Now come inside. Your supper's getting cold. And look out the back window on your way in: the old oak on the hill is blooming. The world is still here, $N. Make something of it.",
    [talk(JORREN, 'Came home to Eastbrook')],
    { requiresQuest: 'c7_06_the_wildheart_rite' },
  ),
};

export const CHAPTER_SEVEN: ChapterTwoBundle = Object.freeze({
  zoneIds: CHAPTER_SEVEN_ZONE_IDS,
  items: ITEMS,
  mobs: {} as Record<string, MobTemplate>,
  npcs: {} as Record<string, NpcDef>,
  quests: QUESTS,
  camps: [] as CampDef[],
  objects: OBJECTS,
});
