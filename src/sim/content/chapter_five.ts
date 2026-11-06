// Wyndlewood Chapter Five, "The Kingdom Behind the Mist" (levels 18 to 19):
// the plan in docs/narrative/chapters_3_to_7_plan.md, data only. Ids are
// c5_<nn>_<slug>.
//
// The Veiled Hollow's keepers first (the shipped hub at the Hollow), then the
// lawn before Dawnhold Castle, where Lady Eshmara Veilthorn keeps the last of
// the old kingdom. Dawnhold is a walk-in palace with no fight by design
// (content/dungeons.ts), so the chapter's dungeon step is walking its halls
// and bringing out the garden posy waiting in the entrance hall (an ownership
// objective), and the barrier is broken without a duel: the bible's Eshmara
// is a grieving ruler, not a boss, and she chooses to let her people go.
//
// One bundle on the Chapter Two seam (merged by story_chapters.ts): reserved
// ground-object entity ids from 2_147_270_000, appended after every shipped
// record. No camps: the chapter's fights use the shipped populations.

import type { CampDef, ItemDef, MobTemplate, NpcDef, QuestDef } from '../types';
import { C4_CLOSING_QUEST } from './chapter_four';
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

const SAELWYN = 'keeper_saelwyn';
const BRYN = 'loremother_bryn';
const TULLO = 'archivist_tullo';

/** The ruler of the Veiled Hollow (the bible's Lady Eshmara Veilthorn). */
export const C5_ESHMARA = 'lady_eshmara_veilthorn';
/** The dragon researcher (the bible's Raska Emberhollow): Chapter Five's
 *  ending hands the player to her, and Chapter Six is hers. */
export const C5_RASKA = 'researcher_raska_emberhollow';
export const C5_CLOSING_QUEST = 'c5_08_dragons_stir';

export const CHAPTER_FIVE_ZONE_IDS: readonly string[] = Object.freeze([
  'veiled_hollow',
  'evergarden',
  'drakelands',
]);

const NPCS: Record<string, NpcDef> = {
  [C5_ESHMARA]: npc(
    C5_ESHMARA,
    'Eshmara Veilthorn',
    'Lady of Dawnhold',
    { x: 268, z: 898.5 },
    Math.PI,
    0xc9b3e0,
    'The roses bloomed yesterday, and the day before, and the day before that. You will forgive me if I do not ask what year it is outside.',
  ),
  // Placed here, not in chapter_six.ts, because this chapter's closing quest
  // is the first to name her: a bundle posts quests only on NPCs already in
  // the tables when it merges.
  [C5_RASKA]: npc(
    C5_RASKA,
    'Raska Emberhollow',
    'Dragon Researcher',
    { x: 420, z: 1906.5 },
    -Math.PI / 2,
    0xb5522e,
    'Stand behind the line. No, the other line. The one that is not on fire.',
  ),
};

const ITEMS: Record<string, ItemDef> = {
  c5_court_chronicle_page: qi(
    'c5_court_chronicle_page',
    'Court Chronicle Page',
    'c5_03_two_histories',
    4,
  ),
  c5_hearthpin_fragment: qi(
    'c5_hearthpin_fragment',
    'Borrowed Hearthpin Fragment',
    'c5_07_the_barrier_breaks',
  ),
};
const FIXTURES: Record<string, string> = {
  c5_veil_tear: 'Thinning Veil',
  c5_festival_lantern: 'Thrice-Lit Festival Lantern',
  c5_barrier_stone: 'Dawnhold Barrier Stone',
};
for (const [id, name] of Object.entries(FIXTURES)) {
  ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

const OBJECTS = objects(2_147_270_000, [
  // West of the keepers' hub: where the mist has started to fray.
  [
    'c5_veil_tear',
    'Thinning Veil',
    [
      { x: -51.5, z: 1049.5 },
      { x: -46, z: 1048.5 },
      { x: -47.5, z: 1054 },
    ],
  ],
  // The festival green below the archive, lit for the same feast again.
  [
    'c5_festival_lantern',
    'Thrice-Lit Festival Lantern',
    [
      { x: -20, z: 1030 },
      { x: -14, z: 1028.5 },
      { x: -15.5, z: 1034 },
      { x: -20.5, z: 1036 },
    ],
  ],
  // Pages blown out of the archive into the meadow.
  [
    'c5_court_chronicle_page',
    'Court Chronicle Page',
    [
      { x: 10, z: 1070 },
      { x: 16, z: 1068.5 },
      { x: 14.5, z: 1074 },
      { x: 9.5, z: 1076 },
    ],
  ],
  // The garden lawn before Dawnhold's door: the stones that hold the barrier.
  [
    'c5_barrier_stone',
    'Dawnhold Barrier Stone',
    [
      { x: 266.5, z: 904 },
      { x: 261.5, z: 906 },
      { x: 256.5, z: 897.5 },
    ],
  ],
]);

const QUESTS: Record<string, QuestDef> = {
  c5_01_the_mist_opens: quest(
    'c5_01_the_mist_opens',
    'The Mist Opens',
    18,
    'medium',
    SAELWYN,
    SAELWYN,
    'bracken_circle',
    'That signet has done something to the Hollow. The veil we keep has worn thin in three places west of here, and through each one I can hear a festival that ended centuries ago. Look through them for me, $N. Do not step through. Just look, and tell me whether the music is getting closer.',
    'Closer, and happier, and exactly the same tune each time. There is a kingdom on the other side of our mist that never noticed it was lost. I have kept this veil all my life and never once wondered what it was keeping in.',
    [inspect('c5_veil_tear', 3, 'Looked through a thinning veil')],
    { requiresQuest: C4_CLOSING_QUEST },
  ),
  c5_02_the_feast_that_repeats: quest(
    'c5_02_the_feast_that_repeats',
    'The Feast That Repeats',
    18,
    'medium',
    BRYN,
    BRYN,
    'hearthwright_compact',
    'The festival lanterns on the green relight themselves every evening, for a feast nobody here has held. And the sporelings have come up out of the ring to dance around them, which would be charming if they were not trying to eat the dancers. Clear the sporelings, then look at each lantern. I want to know whose feast it is.',
    'Every lantern is painted with the same date, the last midsummer of the old kingdom. They have been keeping it ever since. Imagine a party that never ends, $N. Now imagine never being allowed to leave it.',
    [
      kill('corrupted_sporeling', 8, 'Corrupted Sporeling cleared'),
      inspect('c5_festival_lantern', 4, 'Festival lantern read'),
    ],
    { requiresQuest: 'c5_01_the_mist_opens' },
  ),
  c5_03_two_histories: quest(
    'c5_03_two_histories',
    'Two Histories',
    18,
    'medium',
    TULLO,
    TULLO,
    'gilt_measure',
    'Pages have been blowing out of the archive all week, and they are not ours. They are court chronicles from the old kingdom, written in two hands that disagree about everything. One says the guardians betrayed a great scholar. The other says the scholar betrayed the world. Gather the pages from the meadow, please. History is worth more in one pile.',
    'Both hands are honest, I think, and both are wrong in the same place: neither will say what the first Hearthpins cost. The kings wrote that part out. Someone in that castle still remembers it, and she will not thank us for asking.',
    [collect('c5_court_chronicle_page', 4, 'Court Chronicle Page')],
    { requiresQuest: 'c5_02_the_feast_that_repeats' },
  ),
  c5_04_lady_of_dawnhold: quest(
    'c5_04_lady_of_dawnhold',
    'The Lady of Dawnhold',
    19,
    'small',
    TULLO,
    C5_ESHMARA,
    'lanternwardens',
    'The pages name the last ruler of the old kingdom, Lady Eshmara Veilthorn, and they say she sealed her people away to keep them safe. Her castle stands on the garden lawn beyond the Evergarden gate. Go and speak with her, $N. Be courteous. She has been a queen for a very long time, and she has not had a visitor in all of it.',
    'A Hearthbearer, at my door. They told me your kind would come to finish what the old guardians began. I sealed this realm so that nobody could finish anything. Sit, if you like. The tea is always fresh. It is always the same tea.',
    [talk(C5_ESHMARA, 'Spoke with Lady Eshmara Veilthorn')],
    { requiresQuest: 'c5_03_two_histories' },
  ),
  c5_05_a_garden_out_of_season: quest(
    'c5_05_a_garden_out_of_season',
    'A Garden Out of Season',
    19,
    'medium',
    C5_ESHMARA,
    C5_ESHMARA,
    'bracken_circle',
    'My hedges were planted to keep the world out. Lately they have decided to keep my people in, and they have grown knights to do it. I do not like what my garden has become, $N. Cut back the hedge knights on the lawns. If they are only doing what I asked of them, then I would like to stop asking.',
    'The lawns are quiet, and two of my gardeners walked to the gate this morning just to look through it. They came back, but they went. You do not know what that means to me. I am not sure I do either.',
    [kill('hedge_knight', 6, 'Hedge Knight cut back')],
    { requiresQuest: 'c5_04_lady_of_dawnhold' },
  ),
  c5_06_the_palace_that_remembers: quest(
    'c5_06_the_palace_that_remembers',
    'The Palace That Remembers',
    19,
    'medium',
    C5_ESHMARA,
    C5_ESHMARA,
    'gilt_measure',
    "You have read the guardians' history and the scholar's. Read mine. Walk the halls of Dawnhold, and in the entrance hall you will find a posy from my conservatory, pressed the summer we sealed the gate. Bring it out into the daylight and keep it. I would like one thing from this place to leave it.",
    'Out in the sun, and it has not crumbled. Then perhaps none of us would. I kept them here because I was afraid the world would break them. I never asked whether they would rather be broken than kept.',
    [collect('dawnhold_posy', 1, 'Dawnhold Garden Posy carried out of the castle')],
    { requiresQuest: 'c5_05_a_garden_out_of_season', keepsCollectedItems: true },
  ),
  c5_07_the_barrier_breaks: quest(
    'c5_07_the_barrier_breaks',
    'The Barrier Breaks',
    19,
    'large',
    C5_ESHMARA,
    C5_ESHMARA,
    'lanternwardens',
    'Three stones on this lawn hold the barrier, and I set them with a fragment of a Hearthpin, which I suspect is how all of this started. Take the fragment, touch it to each stone, and let the barrier go. I cannot do it myself. I have tried every morning for a very long time, and every morning I put the fragment down again.',
    'There. Do you hear it? Wind from outside, for the first time in my life as a queen. Some of my people will stay, and some will go, and every one of them will choose. Thank you, $N. Now, before you go: something old woke in the south when the barrier fell.',
    [
      useOn('c5_barrier_stone', 3, 'Barrier stone released', 'c5_hearthpin_fragment', {
        keepsUsedItem: true,
      }),
    ],
    {
      requiresQuest: 'c5_06_the_palace_that_remembers',
      requiredItems: ['c5_hearthpin_fragment'],
    },
  ),
  [C5_CLOSING_QUEST]: quest(
    C5_CLOSING_QUEST,
    'Dragons Stir',
    19,
    'small',
    C5_ESHMARA,
    C5_RASKA,
    'gilt_measure',
    'The old court records say the first Hearthpins were not made by smiths alone. The dragons of the south stood at the forge, and gave something too. If they are waking now, someone who understands dragons should hear about it. My scholars say there is a researcher in Wyrmwatch who has been blown up by more dragons than anyone alive. Go to her.',
    'Eshmara Veilthorn sent you? THE Eshmara? Wonderful. Terrible. Wonderful. Every nest in the Drakelands woke at once last night, and I have three pages of notes and one eyebrow left. Technically, that was a successful observation.',
    [talk(C5_RASKA, 'Found Raska Emberhollow in Wyrmwatch')],
    { requiresQuest: 'c5_07_the_barrier_breaks' },
  ),
};

export const CHAPTER_FIVE: ChapterTwoBundle = Object.freeze({
  zoneIds: CHAPTER_FIVE_ZONE_IDS,
  items: ITEMS,
  mobs: {} as Record<string, MobTemplate>,
  npcs: NPCS,
  quests: QUESTS,
  camps: [] as CampDef[],
  objects: OBJECTS,
});
