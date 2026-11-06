// Wyndlewood Chapter Six, "Ash, Ice, and the Sleeping Crown" (levels 19 to
// 20): the plan in docs/narrative/chapters_3_to_7_plan.md, data only. Ids are
// c6_<nn>_<slug>.
//
// The Drakelands nests with Raska Emberhollow first (she arrives in
// chapter_five.ts, whose closing quest names her), then north to the
// Frostveil Reach's barrows, and the Gravewyrm Sanctum (19 to 20, on
// Thornpeak) as the chapter's dungeon: its corrupted guardian is the shipped
// final boss, and the keeper of the pact wakes when it falls. Skarveth the
// Cinderbound, the dragon who would seize the damaged Hearthpins, is fought
// in the open above the Drakemaw nests.
//
// One bundle on the Chapter Two seam (merged by story_chapters.ts): reserved
// ground-object entity ids from 2_147_280_000, one offStream camp, appended
// after every shipped record.

import type { CampDef, ItemDef, MobTemplate, NpcDef, QuestDef } from '../types';
import { C5_CLOSING_QUEST, C5_RASKA } from './chapter_five';
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
import { DRAKELANDS_MOBS } from './drakelands';
import { OATHLESS_KING_TITLE } from './wyndlewood_lore';

const RASKA = C5_RASKA;
const KALDRA = 'warden_kaldra';
const ALDRIC_HIGHWATCH = 'brother_aldric_highwatch';
const OTTOLINE = 'reeve_ottoline';

/** The dragon who would seize the Hearthpins (the bible's Skarveth the
 *  Cinderbound). */
export const C6_SKARVETH = 'c6_skarveth_the_cinderbound';
export const C6_CLOSING_QUEST = 'c6_07_renewal_not_repair';

export const CHAPTER_SIX_ZONE_IDS: readonly string[] = Object.freeze([
  'drakelands',
  'frostveil',
  'thornpeak_heights',
  'amberfall',
]);

const MOBS: Record<string, MobTemplate> = {
  // On the shipped Drakemaw Broodlord body (same level, same coefficients),
  // without the broodlord's rare respawn window, nest roar or quest drop, so
  // a quest target comes back on the ordinary elite cadence.
  [C6_SKARVETH]: {
    ...DRAKELANDS_MOBS.drakemaw_broodlord,
    id: C6_SKARVETH,
    name: 'Skarveth the Cinderbound',
    rare: false,
    engageShout: undefined,
    yells: undefined,
    loot: [{ copper: 320, chance: 1 }],
    color: 0x3a2a24,
  },
};

const CAMPS: CampDef[] = [
  { mobId: C6_SKARVETH, center: { x: 300, z: 2330 }, radius: 2, count: 1, offStream: true },
];

const ITEMS: Record<string, ItemDef> = {
  c6_pact_tablet_shard: qi(
    'c6_pact_tablet_shard',
    'Scorched Pact Tablet Shard',
    'c6_01_technically_a_success',
    3,
  ),
  c6_ember_lantern: qi('c6_ember_lantern', "Raska's Ember Lantern", 'c6_02_eggs_gone_cold'),
  c6_pact_rubbing: qi('c6_pact_rubbing', 'Rubbing of the Dragon Pact', 'c6_04_north_to_the_frost'),
  c6_keeper_testament: qi('c6_keeper_testament', "The Pact Keeper's Testament", C6_CLOSING_QUEST),
};
const FIXTURES: Record<string, string> = {
  c6_cold_nest: 'Cold Dragon Nest',
  c6_barrow_stone: 'Dragon Barrow Stone',
};
for (const [id, name] of Object.entries(FIXTURES)) {
  ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

const OBJECTS = objects(2_147_280_000, [
  // Below the broodguard line: the tablets the nests were built on.
  [
    'c6_pact_tablet_shard',
    'Scorched Pact Tablet Shard',
    [
      { x: 370, z: 2225 },
      { x: 376, z: 2223.5 },
      { x: 374.5, z: 2229 },
    ],
  ],
  // The western nests, gone cold since the wake.
  [
    'c6_cold_nest',
    'Cold Dragon Nest',
    [
      { x: 330, z: 2250 },
      { x: 336, z: 2248.5 },
      { x: 334.5, z: 2254 },
      { x: 329.5, z: 2256 },
    ],
  ],
  // The Frostveil barrows above the lodge, among the rime.
  [
    'c6_barrow_stone',
    'Dragon Barrow Stone',
    [
      { x: 31.5, z: 1652.5 },
      { x: 32, z: 1646.5 },
      { x: 33.5, z: 1660 },
    ],
  ],
]);

const QUESTS: Record<string, QuestDef> = {
  c6_01_technically_a_success: quest(
    'c6_01_technically_a_success',
    'Technically a Success',
    19,
    'small',
    RASKA,
    RASKA,
    'bracken_circle',
    'The nests were built on tablets. Old ones, carved by people, not dragons, and I need them before the broodguard finish grinding them into gravel. I tried to fetch them myself and set fire to my notes, my boots and, briefly, a broodguard. Thin the broodguard and bring me three shards. Technically my first attempt was a success. It just was not a success for me.',
    'Look at this script: half forge-mark, half claw-mark, written together. Dragons and smiths stood at the same table once and made a promise. Somebody broke it, and the dragons have a very long memory for that sort of thing.',
    [
      kill('dragonkin_broodguard', 6, 'Dragonkin Broodguard slain'),
      collect('c6_pact_tablet_shard', 3, 'Scorched Pact Tablet Shard'),
    ],
    { requiresQuest: C5_CLOSING_QUEST },
  ),
  c6_02_eggs_gone_cold: quest(
    'c6_02_eggs_gone_cold',
    'Eggs Gone Cold',
    19,
    'medium',
    RASKA,
    RASKA,
    'bracken_circle',
    'Not every dragon wants us gone. The mothers of the western nests left when the wake began, to go and argue with the rest, and their eggs have gone cold. Take my ember lantern and warm four nests. If we are going to ask dragons for help, it would be polite to have kept their children alive first.',
    'Four nests humming again. A mother came back while you were up there, did you see her? She watched you the whole time and did not move. I am going to write that down as a conversation.',
    [useOn('c6_cold_nest', 4, 'Cold nest warmed', 'c6_ember_lantern', { keepsUsedItem: true })],
    { requiresQuest: 'c6_01_technically_a_success', requiredItems: ['c6_ember_lantern'] },
  ),
  c6_03_the_cinderbound: quest(
    'c6_03_the_cinderbound',
    'The Cinderbound',
    20,
    'large',
    RASKA,
    RASKA,
    'lanternwardens',
    'Skarveth the Cinderbound has decided that if the Hearthpins are broken, he may as well own the pieces. He is perched above the Drakemaw nests, and every dragon that would listen to us is waiting to see what we do about him. Take friends. Take more friends than that. Bring him down.',
    'He is down, and the whole valley saw it. The old ones are not our friends yet, $N, but they have stopped calling us thieves, which in dragon is practically a hug.',
    [kill(C6_SKARVETH, 1, 'Skarveth the Cinderbound brought down')],
    { requiresQuest: 'c6_02_eggs_gone_cold' },
  ),
  c6_04_north_to_the_frost: quest(
    'c6_04_north_to_the_frost',
    'North to the Frost',
    19,
    'small',
    RASKA,
    KALDRA,
    'gilt_measure',
    'The tablets end in a list of burial places, and every one of them is in the Frostveil Reach. The dragons who signed the pact went north to die. Take my rubbing to Warden Kaldra at the snowline lodge. Neris Snowmantle says Kaldra is the only warden up there who listens before arguing.',
    'A rubbing from Raska Emberhollow, and still attached to its paper. She is improving. Yes, I know the barrows. If the snow speaks while you are up there, do not answer it.',
    [talk(KALDRA, 'Pact rubbing brought to Warden Kaldra', 'c6_pact_rubbing')],
    { requiresQuest: 'c6_03_the_cinderbound', requiredItems: ['c6_pact_rubbing'] },
  ),
  c6_05_if_the_snow_speaks: quest(
    'c6_05_if_the_snow_speaks',
    'If the Snow Speaks',
    19,
    'medium',
    KALDRA,
    KALDRA,
    'lanternwardens',
    'The rime has risen around the old dragon barrows, and the elementals walking out of it are not the weather. Break them up, then read the three barrow stones above the lodge. Read them quickly. Whatever is carved there has been waiting a long time for a reader, and it will try to keep you.',
    'Three stones, three names, and one line under all of them: the pact was to be renewed each age, by both peoples, at the sanctum under the peaks. Nobody came. Nobody remembered. The thing guarding the sanctum has been waiting for us ever since.',
    [
      kill('rime_elemental', 8, 'Rime Elemental broken'),
      inspect('c6_barrow_stone', 3, 'Dragon barrow stone read'),
    ],
    { requiresQuest: 'c6_04_north_to_the_frost' },
  ),
  c6_06_the_sleeping_crown: quest(
    'c6_06_the_sleeping_crown',
    'The Sleeping Crown',
    20,
    'large',
    KALDRA,
    ALDRIC_HIGHWATCH,
    'lanternwardens',
    'The sanctum the stones name is the Gravewyrm Sanctum on Thornpeak, and its guardian is the thing the Highwatch brothers have been fighting for a year. It was set there to guard the pact, and it rotted while it waited. Go down with a full party and end it. Then tell Brother Aldric at Highwatch what you find beneath it.',
    'A keeper, beneath the wyrm, still breathing? Then the old stories were right about one thing. Sit, $N, and tell me every word it said. I will write them down while my hands still believe me.',
    [kill('korzul_the_gravewyrm', 1, 'Korzul the Gravewyrm laid to rest in the Gravewyrm Sanctum')],
    { requiresQuest: 'c6_05_if_the_snow_speaks' },
  ),
  [C6_CLOSING_QUEST]: quest(
    C6_CLOSING_QUEST,
    'Renewal, Not Repair',
    20,
    'medium',
    ALDRIC_HIGHWATCH,
    OTTOLINE,
    'hearthwright_compact',
    `The keeper's testament is plain: the Hearthpins were never meant to last forever. They were meant to be renewed, each age, by everyone who lives under them. Defeating the heirs of ${OATHLESS_KING_TITLE} will not be enough; the bonds have to be made again, together. The testament names the last Hearthpin's resting place beyond the Amberfall. Take it to the Reeve there.`,
    'Renewal, not repair. My grandmother used to say that about the harvest. I thought it was about apples. Come in, $N. If the end of the world is passing through my woods, it can at least wipe its feet.',
    [talk(OTTOLINE, "Pact Keeper's testament brought to Reeve Ottoline", 'c6_keeper_testament')],
    { requiresQuest: 'c6_06_the_sleeping_crown', requiredItems: ['c6_keeper_testament'] },
  ),
};

export const CHAPTER_SIX: ChapterTwoBundle = Object.freeze({
  zoneIds: CHAPTER_SIX_ZONE_IDS,
  items: ITEMS,
  mobs: MOBS,
  npcs: {} as Record<string, NpcDef>,
  quests: QUESTS,
  camps: CAMPS,
  objects: OBJECTS,
});
