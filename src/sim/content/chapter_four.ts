// Wyndlewood Chapter Four, "Iron Hearts and Empty Crowns" (levels 16 to 18):
// the plan in docs/narrative/chapters_3_to_7_plan.md, data only. Ids are
// c4_<nn>_<slug>.
//
// Thornpeak's mines and forges first (the shipped kobold tunnels and the
// storm-touched heights above Highwatch), then the keep road in the
// Drakelands. The Last Keep is a walk-in instance with no fight by design
// (content/dungeons.ts), so the forgemaster who would burn its records is met
// at its gate, and the chapter's dungeon step is walking the keep's halls and
// bringing out the garrison signet that waits inside (an ownership objective:
// the signet stays with the player).
//
// One bundle on the Chapter Two seam (merged by story_chapters.ts): reserved
// ground-object entity ids from 2_147_260_000, offStream camps, appended
// after every shipped record.

import type { CampDef, ItemDef, MobTemplate, NpcDef, QuestDef } from '../types';
import { C3_CLOSING_QUEST } from './chapter_three';
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
} from './chapter_two';
import { ZONE3_MOBS } from './zone3';

const CADDIS = 'loremaster_caddis';
const BRUNNA = 'forgemistress_darva';
const YERRIN = 'scout_yerrin';
const SAELWYN = 'keeper_saelwyn';

/** The mining foreman (the bible's Odrik Caskwell), a new Thornpeak NPC. */
export const C4_ODRIK = 'foreman_odrik_caskwell';
/** The royal forgemaster who would burn the records (the bible's Garrick
 *  Vellthorn, renamed Hamlin so he never reads as the shipped Garrick Holt). */
export const C4_HAMLIN = 'c4_hamlin_vellthorn';
export const C4_CLOSING_QUEST = 'c4_07_last_keep_remembers';

export const CHAPTER_FOUR_ZONE_IDS: readonly string[] = Object.freeze([
  'thornpeak_heights',
  'drakelands',
  'eastbrook_vale',
]);

const NPCS: Record<string, NpcDef> = {
  [C4_ODRIK]: npc(
    C4_ODRIK,
    'Odrik Caskwell',
    'Mine Foreman',
    { x: 40, z: 632 },
    Math.PI / 2,
    0x7a5c3e,
    'I said dig down, not into tomorrow! Sorry. Habit. The tunnels have been answering back lately.',
  ),
};

const MOBS: Record<string, MobTemplate> = {
  // The forgemaster on the shipped named-capstone body (Threnos the First
  // Voice): the same per-level coefficients, at the chapter's level.
  [C4_HAMLIN]: {
    ...ZONE3_MOBS.threnos_first_voice,
    id: C4_HAMLIN,
    name: 'Forgemaster Hamlin Vellthorn',
    minLevel: 18,
    maxLevel: 18,
    loot: [{ copper: 300, chance: 1 }],
    color: 0x6d4c33,
    componentTags: ['cloth'],
  },
};

const CAMPS: CampDef[] = [
  { mobId: C4_HAMLIN, center: { x: 445, z: 2136 }, radius: 2, count: 1, offStream: true },
];

const ITEMS: Record<string, ItemDef> = {
  c4_willful_ore: qi('c4_willful_ore', 'Willful Ore', 'c4_02_dig_down_not_tomorrow', 5),
  c4_ore_sample: qi('c4_ore_sample', 'Sample of Willful Ore', 'c4_04_what_metal_tells'),
  c4_brunna_letter: qi('c4_brunna_letter', "Brunna's Sealed Letter", 'c4_05_the_keep_road'),
  c4_scorched_forge_plan: qi(
    'c4_scorched_forge_plan',
    'Scorched Forge Plan',
    'c4_06_forgemaster_at_the_gate',
    2,
  ),
};
const FIXTURES: Record<string, string> = {
  c4_unfed_forge: 'Unfed Mountain Forge',
};
for (const [id, name] of Object.entries(FIXTURES)) {
  ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

const OBJECTS = objects(2_147_260_000, [
  // The kobold tunnel mouths east of Highwatch: ore that rolled out on its own.
  [
    'c4_willful_ore',
    'Willful Ore',
    [
      { x: 84.5, z: 609.5 },
      { x: 84.5, z: 617 },
      { x: 87.5, z: 605 },
      { x: 93, z: 605 },
      { x: 98.5, z: 609.5 },
    ],
  ],
  // The storm-touched heights: forges burning with nothing to burn.
  [
    'c4_unfed_forge',
    'Unfed Mountain Forge',
    [
      { x: 122, z: 775 },
      { x: 128, z: 773.5 },
      { x: 126.5, z: 779 },
    ],
  ],
  // The keep road: the plans the forgemaster has not burned yet.
  [
    'c4_scorched_forge_plan',
    'Scorched Forge Plan',
    [
      { x: 441.5, z: 2131 },
      { x: 447, z: 2130.5 },
    ],
  ],
]);

const QUESTS: Record<string, QuestDef> = {
  c4_01_metal_with_a_will: quest(
    'c4_01_metal_with_a_will',
    'Metal With a Will',
    16,
    'small',
    CADDIS,
    C4_ODRIK,
    'hearthwright_compact',
    'Before we go looking for old forges, we should look at the new trouble. The mine foreman east of town, Odrik Caskwell, swears his tools walk about at night. He also swears the tunnels hum, the ore rolls uphill, and the moon is following him. Some of that is true. Go and find out which part.',
    "You're from Caddis? Good. Sit, no, not there, that crate moved on its own this morning. I am not frightened. I am a professional who is extremely alert.",
    [talk(C4_ODRIK, 'Found Odrik Caskwell on the mine road')],
    { requiresQuest: C3_CLOSING_QUEST },
  ),
  c4_02_dig_down_not_tomorrow: quest(
    'c4_02_dig_down_not_tomorrow',
    'Dig Down, Not Into Tomorrow',
    16,
    'medium',
    C4_ODRIK,
    C4_ODRIK,
    'hearthwright_compact',
    'The kobolds dug too deep and woke something, and now they will not let my crew back into our own tunnels. Clear them off, $N, and while you are at it, pick up the ore lying around the tunnel mouths. Nobody mined it. It climbed out. Use gloves, and do not let it hear you call it ore.',
    'Five lumps, all warm, all pointing the same way when I set them down. North and down. Ore does not point, $N. Ore does not do anything. I would like to go back to a world where ore does not do anything.',
    [
      kill('deeprock_kobold', 10, 'Deeprock Kobold driven out'),
      collect('c4_willful_ore', 5, 'Willful Ore'),
    ],
    { requiresQuest: 'c4_01_metal_with_a_will' },
  ),
  c4_03_forges_without_fuel: quest(
    'c4_03_forges_without_fuel',
    'Forges Without Fuel',
    17,
    'medium',
    C4_ODRIK,
    C4_ODRIK,
    'lanternwardens',
    'Up on the storm heights there are three old forges nobody has fed in a hundred years, and all three are burning. The storm things up there have started gathering around them like moths. Thin the storm things out, then look at each forge. Tell me what it is making. I am not going up. I have a professional fear of heights.',
    'Hammers ringing with no hand on them, and every forge shaping the same piece: a pin, long as your arm, and never finished. The mountain is trying to remember how to make something, $N. It cannot quite do it alone.',
    [
      kill('stormcrag_elemental', 8, 'Stormcrag Elemental scattered'),
      inspect('c4_unfed_forge', 3, 'Unfed mountain forge watched'),
    ],
    { requiresQuest: 'c4_02_dig_down_not_tomorrow' },
  ),
  c4_04_what_metal_tells: quest(
    'c4_04_what_metal_tells',
    'What the Metal Tells',
    17,
    'medium',
    C4_ODRIK,
    BRUNNA,
    'hearthwright_compact',
    'There is one smith in the realm who will look at a lump of ore and tell you its family history, and she lives down in Eastbrook. Brunna Flintmorrow. Take her a sample of the willful ore. If she laughs at you, it is ordinary ore. If she goes quiet, run.',
    'Metal tells the truth. People rarely bother. This piece was worked once, long before it was dug, by a smith who gave it a piece of herself to make it hold. I have read about that in the old forge songs. I did not think it was a recipe.',
    [talk(BRUNNA, 'Willful ore shown to Brunna Flintmorrow', 'c4_ore_sample')],
    { requiresQuest: 'c4_03_forges_without_fuel', requiredItems: ['c4_ore_sample'] },
  ),
  c4_05_the_keep_road: quest(
    'c4_05_the_keep_road',
    'The Keep Road',
    17,
    'small',
    BRUNNA,
    YERRIN,
    'hearthwright_compact',
    'The forge songs name one place where the first smiths wrote it all down: the Last Keep, south in the Drakelands. A forgemaster of the old royal line has gone there ahead of us, and he does not want those records read. Take my letter to the Wyrmwatch scout who watches that road. Yerrin misses nothing on that road.',
    "Brunna's hand, and Brunna's temper. Yes, he passed. A tall man in a soot-black coat, with a cart full of oil and a face like a funeral. He is at the keep gate now, and he is not there to read.",
    [talk(YERRIN, "Brunna's letter given to Scout Yerrin", 'c4_brunna_letter')],
    { requiresQuest: 'c4_04_what_metal_tells', requiredItems: ['c4_brunna_letter'] },
  ),
  c4_06_forgemaster_at_the_gate: quest(
    'c4_06_forgemaster_at_the_gate',
    'The Forgemaster at the Gate',
    18,
    'large',
    YERRIN,
    YERRIN,
    'lanternwardens',
    'Hamlin Vellthorn says the Hearthpins were made by taking pieces of people, and that mending them would only take more. He might be right. That is what frightens me. He is still not allowed to burn the only record of how it was done. Stop him at the gate, and save whatever plans he has not burned yet.',
    'He said the old kings lied about the price, and he was not wrong. But a truth burned is a truth nobody gets to argue with. Two plans, scorched at the edges. And the keep doors still standing open behind him.',
    [
      kill(C4_HAMLIN, 1, 'Forgemaster Hamlin Vellthorn stopped'),
      collect('c4_scorched_forge_plan', 2, 'Scorched Forge Plan'),
    ],
    { requiresQuest: 'c4_05_the_keep_road' },
  ),
  [C4_CLOSING_QUEST]: quest(
    C4_CLOSING_QUEST,
    'The Last Keep Remembers',
    18,
    'large',
    YERRIN,
    SAELWYN,
    'hearthwright_compact',
    'The plans stop halfway, and the rest is inside. Walk the Last Keep, $N. Nobody fights in there any more; it is all cold halls and old banners. The garrison left its signet on the floor of the entrance hall the day it marched out. Bring it back out with you, and carry it to the Keeper in the Veiled Hollow. The plans say the old kingdom never truly ended. They say it is still there, behind the mist.',
    'The garrison signet, and the mist is already thinning around it. The plans were right: a Hearthpin can be forged again, but only by the old powers and the people living now, together. And the door to what is left of the kingdom has started, very quietly, to open.',
    [collect('last_keep_signet', 1, 'Signet of the Last Keep carried out of the keep')],
    { requiresQuest: 'c4_06_forgemaster_at_the_gate', keepsCollectedItems: true },
  ),
};

export const CHAPTER_FOUR: ChapterTwoBundle = Object.freeze({
  zoneIds: CHAPTER_FOUR_ZONE_IDS,
  items: ITEMS,
  mobs: MOBS,
  npcs: NPCS,
  quests: QUESTS,
  camps: CAMPS,
  objects: OBJECTS,
});
