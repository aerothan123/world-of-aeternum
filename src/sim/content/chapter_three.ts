// Wyndlewood Chapter Three, "The Marsh That Remembers" (levels 13 to 16): the
// plan in docs/narrative/chapters_3_to_7_plan.md, data only. Ids are
// c3_<nn>_<slug> after the plan's numbering.
//
// The chapter bends to the shipped dungeon bands (wyndlewood_decisions.md
// section 2): it opens in Mirefen after the Sunken Bastion closes Chapter Two,
// follows the Pale Accord's memory harvest north to the Glimmermere shore on
// Thornpeak, and ends in the Drowned Temple (16 to 18). Mistress Veska Noll
// is fought in the open beside the tarn; the temple's own avatar is the
// chapter's group finale.
//
// It ships as one bundle on the Chapter Two seam (chapter_two.ts
// applyChapterTwoBundle, merged by story_chapters.ts): it merges only while
// both of its zones are live, appends after every shipped record, places its
// ground objects on reserved entity ids from 2_147_250_000, and its one camp
// spawns offStream, so no shipped id or rng stream moves. Positions are
// pinned to dry open ground by tests/story_chapters_content.test.ts.

import type { CampDef, ItemDef, MobTemplate, NpcDef, QuestDef } from '../types';
import {
  type ChapterTwoBundle,
  collect,
  inspect,
  kill,
  objects,
  qi,
  quest,
  talk,
  useOn,
} from './chapter_two';
import { PALE_ACCORD_NAME } from './wyndlewood_lore';
import { ZONE3_MOBS } from './zone3';

// Shipped NPCs the chapter speaks through (ids frozen).
const OSRIC = 'chronicler_osric_fenn';
const YARA = 'herbalist_yara';
const MAREN = 'scout_maren';
const ALDRIC_FEN = 'brother_aldric_fen';
const ONDREL = 'tidewatcher_ondrel';
const CADDIS = 'loremaster_caddis';

/** The chapter's Pale Accord lieutenant (the bible's Mistress Veska Noll),
 *  IP-checked in the plan file. */
export const C3_VESKA = 'c3_veska_noll';

/** The quest that closes Chapter Three; Chapter Four opens from it. */
export const C3_CLOSING_QUEST = 'c3_08_records_in_the_mountain';

export const CHAPTER_THREE_ZONE_IDS: readonly string[] = Object.freeze([
  'mirefen_marsh',
  'thornpeak_heights',
]);

const MOBS: Record<string, MobTemplate> = {
  // A named Accord caster on the shipped named-capstone body (Threnos the
  // First Voice): the same per-level coefficients, at the chapter's level.
  [C3_VESKA]: {
    ...ZONE3_MOBS.threnos_first_voice,
    id: C3_VESKA,
    name: 'Mistress Veska Noll',
    minLevel: 16,
    maxLevel: 16,
    loot: [{ copper: 260, chance: 1 }],
    color: 0x8fa3b8,
  },
};

const CAMPS: CampDef[] = [
  { mobId: C3_VESKA, center: { x: -30, z: 770 }, radius: 2, count: 1, offStream: true },
];

const ITEMS: Record<string, ItemDef> = {
  c3_memory_silt: qi('c3_memory_silt', 'Memory Silt', 'c3_02_mud_remembers', 5),
  c3_engine_cog: qi('c3_engine_cog', 'Brass Memory Cog', 'c3_03_machine_in_the_reeds', 3),
  c3_harvest_ledger: qi('c3_harvest_ledger', 'Accord Harvest Ledger', 'c3_04_letters_for_the_tarn'),
  c3_calming_reed_bundle: qi(
    'c3_calming_reed_bundle',
    'Bundle of Calming Reeds',
    'c3_05_frightened_or_dangerous',
  ),
  c3_harvested_memory_jar: qi(
    'c3_harvested_memory_jar',
    'Harvested Memory Jar',
    'c3_06_mistress_of_the_harvest',
    4,
  ),
  c3_first_age_rubbing: qi(
    'c3_first_age_rubbing',
    'First Age Temple Rubbing',
    'c3_08_records_in_the_mountain',
  ),
};
/** Interact-only world objects (inspected or used, never picked up). */
const FIXTURES: Record<string, string> = {
  c3_fogbound_doorstep: 'Fogbound Doorstep',
  c3_harvest_engine: 'Accord Memory Engine',
  c3_wader_nest: 'Frightened Wader Nest',
};
for (const [id, name] of Object.entries(FIXTURES)) {
  ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

const OBJECTS = objects(2_147_250_000, [
  // Fenbridge's north edge, east of the causeway road: the doorsteps left
  // standing when their houses walked into the fog.
  [
    'c3_fogbound_doorstep',
    'Fogbound Doorstep',
    [
      { x: 33, z: 249.5 },
      { x: 29, z: 253 },
      { x: 24, z: 250 },
    ],
  ],
  // The bog between the drowned fields and the Accord camp.
  [
    'c3_memory_silt',
    'Memory Silt',
    [
      { x: 45, z: 445 },
      { x: 51, z: 443.5 },
      { x: 49.5, z: 449 },
      { x: 44.5, z: 451 },
      { x: 40, z: 448 },
    ],
  ],
  // East of the Accord camp: the engines and the cogs they shed.
  [
    'c3_harvest_engine',
    'Accord Memory Engine',
    [
      { x: 55, z: 480 },
      { x: 61, z: 478.5 },
      { x: 59.5, z: 484 },
    ],
  ],
  [
    'c3_engine_cog',
    'Brass Memory Cog',
    [
      { x: 54.5, z: 486 },
      { x: 50, z: 483 },
      { x: 49.5, z: 477.5 },
    ],
  ],
  // The Glimmermere's east shore, clear of the temple's moongate.
  [
    'c3_wader_nest',
    'Frightened Wader Nest',
    [
      { x: -45, z: 790 },
      { x: -39, z: 791 },
      { x: -42.5, z: 795.5 },
    ],
  ],
  // Veska's harvest, stacked around her shore camp.
  [
    'c3_harvested_memory_jar',
    'Harvested Memory Jar',
    [
      { x: -24, z: 768.5 },
      { x: -25.5, z: 774 },
      { x: -30.5, z: 776 },
      { x: -35, z: 773 },
    ],
  ],
]);

const QUESTS: Record<string, QuestDef> = {
  c3_01_fog_takes_a_village: quest(
    'c3_01_fog_takes_a_village',
    'The Fog Takes a Village',
    13,
    'medium',
    OSRIC,
    OSRIC,
    'bracken_circle',
    'The bells are quiet, and I was ready to write a tidy ending. Then the fog came up the causeway last night and took three houses with it. Not burned, not fallen: gone, and their doorsteps left behind like shoes outside a door. Walk the north edge of Fenbridge, $N, and look at what is left. I need to know whether I am recording a theft or a disappearance.',
    'Each step is worn by feet that are not there, and each one is warm. The fog did not swallow those families. Something took the memory of the houses and let the wood follow. I would call it impossible, but my pen has stopped believing me.',
    [inspect('c3_fogbound_doorstep', 3, 'Fogbound doorstep examined')],
    { requiresQuest: 'q_mistcaller' },
  ),
  c3_02_mud_remembers: quest(
    'c3_02_mud_remembers',
    'Mud Remembers Every Footprint',
    13,
    'medium',
    YARA,
    YARA,
    'bracken_circle',
    "Osric's doorsteps are not the only thing that has gone strange. The bog south of the drowned fields has started to shine, a little, the way a pond shines with a face in it. Scoop me some of that silt, and burst the bog bloats that keep wallowing in it before they swallow the rest. Gloves, $N. Whatever is in that mud wants to be held.",
    'Look closely. The silt is full of little pictures: a kitchen, a wedding, a boy with a kite. These are memories, sunk out of somebody and left to settle. The mud remembers every footprint, the old healers said. I always thought that was a saying.',
    [collect('c3_memory_silt', 5, 'Memory Silt'), kill('bog_bloat', 6, 'Bog Bloat burst')],
    { requiresQuest: 'c3_01_fog_takes_a_village' },
  ),
  c3_03_machine_in_the_reeds: quest(
    'c3_03_machine_in_the_reeds',
    'The Machine in the Reeds',
    14,
    'large',
    MAREN,
    MAREN,
    'lanternwardens',
    `Yara's silt runs downhill to the robed camp in the south reeds, and so do the cart tracks. The robes of ${PALE_ACCORD_NAME} have dragged machines out there, brass things that hum when you stand near them, and summoners feed them with something they pull out of the air. Kill the summoners, wreck three of the engines and bring me the cogs they shed. I want to show the Warden what we are fighting.`,
    'Brass, old brass, older than Fenbridge. These cogs were cut for a kingdom nobody remembers, and the Accord has been turning them to draw the marsh dry of its past. The engines are quiet now. The fog is not, but it is thinner.',
    [
      kill('gravecaller_summoner', 6, 'Accord summoner slain'),
      inspect('c3_harvest_engine', 3, 'Memory engine broken'),
      collect('c3_engine_cog', 3, 'Brass Memory Cog'),
    ],
    { requiresQuest: 'c3_02_mud_remembers' },
  ),
  c3_04_letters_for_the_tarn: quest(
    'c3_04_letters_for_the_tarn',
    'A Ledger for the Tarn',
    14,
    'small',
    ALDRIC_FEN,
    ONDREL,
    'lanternwardens',
    'Maren found a ledger in the wreckage, and it is not a list of names. It is a list of places, and the last of them is the Glimmermere, a tarn high on Thornpeak where a tidewatcher named Ondrel Vane keeps a lonely vigil. Whoever signed this ledger has gone ahead of us. Carry it north, $N, and put it in his hands before she reaches whatever she is looking for.',
    'Veska Noll. I have seen that signature on the tide charts, written in a hand that is not mine, in my own tower. She has been here for weeks, and I have been forgetting her every morning. Thank you for bringing me the reminder.',
    [talk(ONDREL, 'Harvest ledger handed to Ondrel Vane', 'c3_harvest_ledger')],
    { requiresQuest: 'c3_03_machine_in_the_reeds', requiredItems: ['c3_harvest_ledger'] },
  ),
  c3_05_frightened_or_dangerous: quest(
    'c3_05_frightened_or_dangerous',
    'Frightened or Dangerous',
    15,
    'medium',
    ONDREL,
    ONDREL,
    'bracken_circle',
    'The waders on the east shore have started attacking anyone who comes near their nests, and the votaries in the shallows are using the noise to cover their work. I do not think the waders are wicked. I think they are frightened, and frightened things bite. Lay these reeds across three of their nests to quiet them, then put down the votaries who keep stirring the water.',
    'The shore is quiet, and nothing had to die for it that was only scared. The votaries are another matter. They were not frightened at all. They were busy, and their work points across the tarn to the drowned stair.',
    [
      useOn('c3_wader_nest', 3, 'Wader nest calmed', 'c3_calming_reed_bundle', {
        keepsUsedItem: true,
      }),
      kill('drowned_votary', 6, 'Drowned Votary put down'),
    ],
    {
      requiresQuest: 'c3_04_letters_for_the_tarn',
      requiredItems: ['c3_calming_reed_bundle'],
    },
  ),
  c3_06_mistress_of_the_harvest: quest(
    'c3_06_mistress_of_the_harvest',
    'Mistress of the Harvest',
    16,
    'large',
    ONDREL,
    ONDREL,
    'lanternwardens',
    'She is camped on the east shore, in plain sight, and I keep forgetting to look at her. Veska Noll has filled jars with everything Mirefen lost: the houses, the faces, the boy with the kite. Stop her, $N. Then bring the jars back to me, unopened. If there is a way to pour a memory home, the temple below the tarn will know it.',
    'Four jars, still warm, and the woman who filled them gone quiet. She said the Hearthpins were a cage, and that she was only opening the door. Perhaps she believed it. The memories in these jars did not ask to be let out.',
    [
      kill(C3_VESKA, 1, 'Mistress Veska Noll defeated'),
      collect('c3_harvested_memory_jar', 4, 'Harvested Memory Jar'),
    ],
    { requiresQuest: 'c3_05_frightened_or_dangerous' },
  ),
  c3_07_what_the_temple_keeps: quest(
    'c3_07_what_the_temple_keeps',
    'What the Temple Keeps',
    16,
    'large',
    ONDREL,
    ONDREL,
    'bracken_circle',
    "Veska was only the hand. The Drowned Temple is where the memory she wanted lies, the oldest one the marsh ever held: the morning the first hearths were bound. Something wearing the moon's face sits on it now and drinks. Gather friends, go down the drowned stair, and end the thing that feeds there. Nobody should go into that water alone.",
    "You saw it, didn't you? The first hearths lit in a ring, and the people who lit them giving something of themselves to make it hold. The temple will keep that memory now, for anyone who needs it. You may have just saved the most important thing nobody remembers.",
    [kill('ysolei', 1, 'Ysolei, Avatar of the Drowned Moon defeated in the Drowned Temple')],
    { requiresQuest: 'c3_06_mistress_of_the_harvest' },
  ),
  [C3_CLOSING_QUEST]: quest(
    C3_CLOSING_QUEST,
    'Records in the Mountain',
    16,
    'medium',
    ONDREL,
    CADDIS,
    'hearthwright_compact',
    "The temple showed you how the Hearthpins were made, but not how to make one again. Nobody can repair them with ordinary magic. The old records say the first smiths worked in the mountain forges above Highwatch. Take this rubbing of the temple wall up the road to Loremaster Caddis. If anyone can read a smith's hand, it is him.",
    'This is forge script, and older than any I have read. It names a fortress where the first smiths kept their records, and a forge that has started burning again without anyone to feed it. I have waited my whole life to be this worried. Sit down, $N. We have work.',
    [talk(CADDIS, 'Temple rubbing brought to Loremaster Caddis', 'c3_first_age_rubbing')],
    { requiresQuest: 'c3_07_what_the_temple_keeps', requiredItems: ['c3_first_age_rubbing'] },
  ),
};

export const CHAPTER_THREE: ChapterTwoBundle = Object.freeze({
  zoneIds: CHAPTER_THREE_ZONE_IDS,
  items: ITEMS,
  mobs: MOBS,
  npcs: {} as Record<string, NpcDef>,
  quests: QUESTS,
  camps: CAMPS,
  objects: OBJECTS,
});
