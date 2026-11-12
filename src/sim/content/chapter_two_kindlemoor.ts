// Wyndlewood Chapter Two, Act C: the Kindlemoor, Ferncross and the First
// Hearth Ring (outline quests 15 to 21, levels 8 to 10). Data only.
//
// A GATED bundle like the Applewold one in chapter_two.ts: the Kindlemoor is a
// world crew zone still on feature/world-expansion
// (src/sim/content/frontier/southern_reaches.ts KINDLEMOOR_ZONE), so
// chapter_two_bundles.ts merges this bundle ONLY when the zone table carries
// 'kindlemoor'. On a build without it nothing here exists, and no core quest
// requires one of these. Positions are taken from the world crew's
// FRONTIER_ANCHORS (frontier/layout.ts), restated so this module reads no file
// that may not exist yet; tests/chapter_two_content.test.ts holds them to dry
// open ground once the zone is live. Two records stand on ground every build
// has (Orwin in Eastbrook, Yara's mixing table in Fenbridge), and that test
// pins those two today. Ground objects use reserved entity ids from
// 2_147_230_000 and the camps spawn offStream, so nothing shifts a shipped id
// or rng stream.

import type { CampDef, EscortDef, ItemDef, MobTemplate, NpcDef, QuestDef } from '../types';
import { AMBERFALL_MOBS } from './amberfall';
import {
  type ChapterTwoBundle,
  collect,
  inspect,
  kill,
  npc,
  objects,
  pick,
  qi,
  quest,
  useOn,
} from './chapter_two';
import { ZONE1_MOBS } from './zone1';
import { ZONE2_MOBS } from './zone2';

/** Every zone this bundle stands in. */
export const CHAPTER_TWO_KINDLEMOOR_ZONE_IDS: readonly string[] = Object.freeze(['kindlemoor']);

// The world crew's Kindlemoor anchors (frontier/layout.ts FRONTIER_ANCHORS).
const FERNCROSS = { x: 32, z: -318 };
const HEARTH_RING = { x: -48, z: -405 };
const HEATH_WAY = { x: 176, z: -372 };
/** The peat cuts: open moor between Ferncross and the Moor Tarn. */
const PEAT_CUTS = { x: -14, z: -346 };

// Shipped NPCs (ids frozen).
const SILVEN = 'trader_wilkes';
const YARA = 'herbalist_yara';

export const C2_FERNCROSS_WARDEN = 'warden_tamsin_bracewell';
/** Ivara Fenmoss (apothecary_lin) visiting the Ring: a second record, the
 *  display name unchanged (the brother_aldric_fen precedent). */
export const C2_IVARA_RING = 'apothecary_lin_ring';
/** Orwin Pellock, the bible's Eastbrook historian (wyndlewood_bible.md section
 *  10). He ships with this bundle because only its quest speaks to him. */
export const C2_ORWIN = 'historian_orwin';
export const C2_KEEPER_ESCORT_MOB = 'escort_c2_keeper_agnes';

const NPCS: Record<string, NpcDef> = {
  [C2_FERNCROSS_WARDEN]: npc(
    C2_FERNCROSS_WARDEN,
    'Tamsin Bracewell',
    'Ferncross Camp Warden',
    { x: FERNCROSS.x + 3, z: FERNCROSS.z + 5 },
    Math.PI,
    0x5d7a3a,
    'The moor is quiet today. I have learned not to trust that, and I advise you to learn it faster than I did.',
  ),
  [C2_IVARA_RING]: npc(
    C2_IVARA_RING,
    'Ivara Fenmoss',
    'Herbalist',
    { x: HEARTH_RING.x + 12, z: HEARTH_RING.z + 10 },
    -Math.PI * 0.75,
    0x6b8e4e,
    'The stones are listening. Be polite.',
  ),
  [C2_ORWIN]: npc(
    C2_ORWIN,
    'Orwin Pellock',
    'Historian',
    { x: 5, z: -101.5 },
    Math.PI / 2,
    0x7a5c8e,
    'That is either impossible or extremely inconvenient. Possibly both. Have I eaten today?',
  ),
};

const MOBS: Record<string, MobTemplate> = {
  moor_hound: {
    ...ZONE2_MOBS.mire_prowler,
    id: 'moor_hound',
    name: 'Moor Hound',
    minLevel: 8,
    maxLevel: 9,
    loot: [
      { copper: 30, chance: 1 },
      { itemId: 'c2_moor_hound_pelt', chance: 0.6, questId: 'c2_15_moor_hounds' },
    ],
    color: 0x6e5a44,
  },
  peatfire_wisp: {
    ...AMBERFALL_MOBS.harvest_sprite,
    id: 'peatfire_wisp',
    name: 'Peatfire Wisp',
    minLevel: 9,
    maxLevel: 10,
    family: 'elemental',
    loot: [{ copper: 34, chance: 1 }],
    color: 0xe0782e,
  },
  moor_bandit: {
    ...ZONE1_MOBS.vale_bandit,
    id: 'moor_bandit',
    name: 'Moor Bandit',
    minLevel: 9,
    maxLevel: 10,
    loot: [
      { copper: 36, chance: 1 },
      { itemId: 'c2_gilt_coin_purse', chance: 0.5, questId: 'c2_17_bandit_pay' },
    ],
  },
  // The escortee: a friendly walker the escort run drives (the Chapter One
  // escortee shape, content/chapter_one.ts).
  [C2_KEEPER_ESCORT_MOB]: {
    id: C2_KEEPER_ESCORT_MOB,
    name: 'Agnes Tarnby',
    minLevel: 9,
    maxLevel: 9,
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
    color: 0x7c8a5a,
  },
};

const CAMPS: CampDef[] = [
  {
    mobId: 'moor_hound',
    center: { x: PEAT_CUTS.x, z: PEAT_CUTS.z - 6 },
    radius: 9,
    count: 6,
    offStream: true,
  },
  {
    mobId: 'peatfire_wisp',
    center: { x: PEAT_CUTS.x - 26, z: PEAT_CUTS.z + 40 },
    radius: 8,
    count: 4,
    offStream: true,
  },
  {
    mobId: 'moor_bandit',
    center: { x: HEATH_WAY.x - 26, z: HEATH_WAY.z - 8 },
    radius: 8,
    count: 5,
    offStream: true,
  },
];

const ITEMS: Record<string, ItemDef> = {
  c2_moor_hound_pelt: qi('c2_moor_hound_pelt', 'Moor Hound Pelt', 'c2_15_moor_hounds', 4),
  // Loaned on accept and taken back on turn-in, like every quest tool here.
  c2_peat_water_pail: qi('c2_peat_water_pail', 'Pail of Tarn Water', 'c2_16_fires_should_not_burn'),
  c2_gilt_coin_purse: qi('c2_gilt_coin_purse', 'Purse of New Gilt Coin', 'c2_17_bandit_pay', 3),
  c2_hearthpin_fragment: qi(
    'c2_hearthpin_fragment',
    'Hearthpin Fragment',
    'c2_19_first_hearth_ring',
  ),
  c2_hearth_ash: qi('c2_hearth_ash', 'Hearth Ash Sample', 'c2_20_ash_before_kingdom', 4),
  c2_heath_mallow: qi('c2_heath_mallow', 'Heath Mallow', 'c2_21_heath_herbs_fen', 6),
  c2_marsh_poultice: qi('c2_marsh_poultice', 'Marsh Poultice', 'c2_21_heath_herbs_fen', 2),
};
const FIXTURES: Record<string, string> = {
  c2_fuelless_fire: 'Fire With Nothing to Burn',
  c2_standing_stone: 'Ring Standing Stone',
  c2_hearth_stone: 'The Hearth Stone',
  c2_heath_mallow_patch: 'Heath Mallow Patch',
  c2_fen_mixing_table: "Yara's Mixing Table",
};
for (const [id, name] of Object.entries(FIXTURES)) {
  ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

/** The five stones of the Ring, evenly around a nine-yard circle. */
const RING_STONES = [0, 1, 2, 3, 4].map((i) => {
  const a = (i * 2 * Math.PI) / 5;
  return {
    x: Math.round((HEARTH_RING.x + 9 * Math.cos(a)) * 2) / 2,
    z: Math.round((HEARTH_RING.z + 9 * Math.sin(a)) * 2) / 2,
  };
});
// The fifth stone's evenly spaced spot sits on blocked ground after the world
// relayout; stand it one yard in, on open ground (still on the nine-yard ring's edge).
RING_STONES[4] = { x: HEARTH_RING.x + 2.5, z: HEARTH_RING.z - 7.5 };

const OBJECTS = objects(2_147_230_000, [
  // Quest 16: the fires in the peat cuts, beside the wisps that feed on them.
  [
    'c2_fuelless_fire',
    'Fire With Nothing to Burn',
    [
      { x: PEAT_CUTS.x - 22, z: PEAT_CUTS.z + 36 },
      { x: PEAT_CUTS.x - 30, z: PEAT_CUTS.z + 44 },
      { x: PEAT_CUTS.x - 24, z: PEAT_CUTS.z + 48 },
    ],
  ],
  // Quest 19: the Ring's stones and its hearth.
  ['c2_standing_stone', 'Ring Standing Stone', RING_STONES],
  ['c2_hearth_stone', 'The Hearth Stone', [{ x: HEARTH_RING.x + 1, z: HEARTH_RING.z + 1 }]],
  // Quest 20: ash drifts around the hearth stone.
  [
    'c2_hearth_ash',
    'Hearth Ash Sample',
    [
      { x: HEARTH_RING.x + 4, z: HEARTH_RING.z + 4 },
      { x: HEARTH_RING.x - 2, z: HEARTH_RING.z + 4 },
      { x: HEARTH_RING.x + 4, z: HEARTH_RING.z - 4 },
      { x: HEARTH_RING.x - 3.5, z: HEARTH_RING.z - 3.5 },
    ],
  ],
  // Quest 21: mallow on the open heath off the Heath Way, and Yara's table
  // beside her stall in Fenbridge (Mirefen ground every build ships).
  [
    'c2_heath_mallow_patch',
    'Heath Mallow Patch',
    [
      { x: HEATH_WAY.x - 64, z: HEATH_WAY.z - 24 },
      { x: HEATH_WAY.x - 58, z: HEATH_WAY.z - 32 },
      { x: HEATH_WAY.x - 50, z: HEATH_WAY.z - 26 },
      { x: HEATH_WAY.x - 54, z: HEATH_WAY.z - 38 },
      { x: HEATH_WAY.x - 46, z: HEATH_WAY.z - 34 },
      { x: HEATH_WAY.x - 62, z: HEATH_WAY.z - 38 },
    ],
  ],
  ['c2_fen_mixing_table', "Yara's Mixing Table", [{ x: 0.5, z: 324 }]],
]);

const ESCORTS: Record<string, EscortDef> = {
  esc_c2_keeper_agnes: {
    id: 'esc_c2_keeper_agnes',
    npcMobId: C2_KEEPER_ESCORT_MOB,
    questId: 'c2_18_keepers_escort',
    start: { x: FERNCROSS.x + 6, z: FERNCROSS.z - 6 },
    waypoints: [
      { x: FERNCROSS.x - 12, z: FERNCROSS.z - 22 },
      { x: FERNCROSS.x - 32, z: FERNCROSS.z - 42 },
      { x: FERNCROSS.x - 52, z: FERNCROSS.z - 62 },
      { x: HEARTH_RING.x + 14, z: HEARTH_RING.z + 12 },
    ],
    moveSpeed: 3,
    // The moor hounds break from the heather halfway and go for the keeper.
    ambushes: [{ atWaypoint: 2, mobId: 'moor_hound', count: 2 }],
    creditRadius: 30,
    respawnSeconds: 30,
    startText: 'Walk on my left. The heather on the right has never liked me.',
    successText:
      'There they are, all five, and still standing. Thank you. I will sit with them a while.',
    failText: 'Agnes has gone back to Ferncross to catch her breath.',
  },
};

const QUESTS: Record<string, QuestDef> = {
  c2_15_moor_hounds: quest(
    'c2_15_moor_hounds',
    'Moor Hounds at the Peat Cuts',
    8,
    'small',
    C2_FERNCROSS_WARDEN,
    C2_FERNCROSS_WARDEN,
    'bracken_circle',
    'The hounds on this moor have always been a nuisance, but they have never been clever. Now they work the peat cuts in packs and herd the cutters off the ground, the way a dog herds sheep. I want them thinned before somebody is herded into a bog. Bring me some pelts while you are at it: Tanner Hesk in Fenbridge pays well, and the camp needs boots.',
    'Four good pelts and a moor that only growls at a distance. Whatever taught them to herd, it did not teach them to count. That is the first piece of luck Ferncross has had all month, $N.',
    [
      kill('moor_hound', 10, 'Moor Hound slain'),
      collect('c2_moor_hound_pelt', 4, 'Moor Hound Pelt'),
    ],
  ),
  c2_16_fires_should_not_burn: quest(
    'c2_16_fires_should_not_burn',
    'Fires That Should Not Burn',
    9,
    'medium',
    C2_FERNCROSS_WARDEN,
    C2_FERNCROSS_WARDEN,
    'bracken_circle',
    'There are fires down in the peat cuts that have been burning for three days on nothing. No wood, no peat, no oil. Something small and bright dances around them, and it bites. Take this pail of tarn water, chase off whatever is tending them, and put the fires out. If they will not go out, come back quickly and do not tell the cutters.',
    'Out, all three, and the ground under them was cold. Cold, $N, under a fire. I have stopped pretending this moor is only a moor. Thank you for coming back with both eyebrows.',
    [
      kill('peatfire_wisp', 6, 'Peatfire Wisp dispersed'),
      useOn('c2_fuelless_fire', 3, 'Fire with nothing to burn doused', 'c2_peat_water_pail', {
        keepsUsedItem: true,
      }),
    ],
    { requiresQuest: 'c2_15_moor_hounds', requiredItems: ['c2_peat_water_pail'], shareable: false },
  ),
  c2_17_bandit_pay: quest(
    'c2_17_bandit_pay',
    'Bandit Pay',
    9,
    'medium',
    C2_FERNCROSS_WARDEN,
    SILVEN,
    'gilt_measure',
    "The bandits on the Heath Way are paid, and paid well: every one we catch has a purse of new coin, still bright, still stamped. Bandits do not earn new coin. Somebody hands it to them. Take three purses off them and carry them to Silven Brackett in Eastbrook. He knows the Gilt Measure's stamps better than he knows his own mother.",
    "Minted this spring, struck at a Gilt Measure house, and paid out to men who rob carts. I would like to say I am shocked. I am mostly offended, $N: somebody is spending my guild's good name on cutthroats, and I intend to find out who.",
    [collect('c2_gilt_coin_purse', 3, 'Purse of New Gilt Coin')],
    { requiresQuest: 'c2_15_moor_hounds' },
  ),
  c2_18_keepers_escort: quest(
    'c2_18_keepers_escort',
    "A Keeper's Escort",
    9,
    'medium',
    C2_FERNCROSS_WARDEN,
    C2_FERNCROSS_WARDEN,
    'bracken_circle',
    'The circle keepers have walked to the old stones every week for longer than Ferncross has had a name. This week Agnes Tarnby would not go alone, and Agnes has walked that moor through two winters and a wedding. Walk her to the Ring, $N. Keep the hounds off her, and keep her talking: she goes quiet when she is frightened, and the moor goes quiet with her.',
    'Agnes says the stones were warm when she touched them, warm as a hearth with nobody tending it. She also says you are a good listener, which from Agnes is very nearly a knighthood.',
    [
      {
        type: 'escort',
        escortId: 'esc_c2_keeper_agnes',
        count: 1,
        label: 'Agnes Tarnby escorted to the Ring',
      },
    ],
    { requiresQuest: 'c2_15_moor_hounds', shareable: false },
  ),
  c2_19_first_hearth_ring: quest(
    'c2_19_first_hearth_ring',
    'The First Hearth Ring',
    10,
    'large',
    C2_IVARA_RING,
    C2_IVARA_RING,
    'bracken_circle',
    'Brother Aldric sent me this fragment, and it has been warm in my hand all the way across the moor. These stones are older than any kingdom: the folk who raised them lit the first hearths. Touch each stone so they know you, then set the fragment on the hearth stone at the centre. The woods are listening, $N. So are the stones. Be polite.',
    'Did you feel it? The fragment answered the hearth, the way a child answers its name. The Hearthpins were made from fires like this one. Whatever is pulling them apart, it has to pull against something very old.',
    [
      inspect('c2_standing_stone', 5, 'Ring standing stone touched'),
      useOn(
        'c2_hearth_stone',
        1,
        'Hearthpin fragment set on the hearth stone',
        'c2_hearthpin_fragment',
        {
          keepsUsedItem: true,
        },
      ),
    ],
    // Re-gated on the Ring hub's own opener when the Hollow Crypt (and its
    // q_hollow) was retired (2026-11-11); the fragment is granted on accept.
    {
      requiresQuest: 'c2_15_moor_hounds',
      requiredItems: ['c2_hearthpin_fragment'],
      shareable: false,
    },
  ),
  c2_20_ash_before_kingdom: quest(
    'c2_20_ash_before_kingdom',
    'Ash From Before the Kingdom',
    10,
    'medium',
    C2_IVARA_RING,
    C2_ORWIN,
    'bracken_circle',
    'The ash around the hearth stone is not from any fire I know. It is fine as flour and it smells of rain. Gather a few samples, carefully, and take them to Orwin Pellock in Eastbrook. He will forget his lunch, his hat and possibly his name, but he will not forget what this ash means.',
    'This ash is older than the first kingdom. Older than Eastbrook, older than the road, older than the idea of a road. That is either impossible or extremely inconvenient. Where did you say you found it? No, do not tell me yet. Let me be astonished properly first.',
    [collect('c2_hearth_ash', 4, 'Hearth Ash Sample')],
    { requiresQuest: 'c2_19_first_hearth_ring' },
  ),
  c2_21_heath_herbs_fen: quest(
    'c2_21_heath_herbs_fen',
    'Heath Herbs for the Fen Healers',
    10,
    'small',
    YARA,
    YARA,
    'bracken_circle',
    'The fog sickness is spreading faster than my shelves can follow. Heath mallow draws the fever, but it only grows on the open Kindlemoor, off the Heath Way. Pick me six good stems, bring them back to my mixing table here, and grind them into two poultices. I will show you the grind. Mind your thumbs: the mallow does not.',
    'Two poultices, smooth and sharp-smelling, and two fevers broken before supper. You would make a fair apothecary, $N, if you could ever be persuaded to stand still.',
    [
      pick('c2_heath_mallow_patch', 6, 'Heath Mallow picked', 'c2_heath_mallow'),
      useOn(
        'c2_fen_mixing_table',
        2,
        'Marsh Poultice ground at the mixing table',
        'c2_heath_mallow',
        {
          usesCount: 3,
          yieldsItemId: 'c2_marsh_poultice',
          station: true,
        },
      ),
    ],
    { shareable: false },
  ),
};

/** The Kindlemoor bundle (chapter_two_bundles.ts merges it when the zone is live). */
export const CHAPTER_TWO_KINDLEMOOR: ChapterTwoBundle = Object.freeze({
  zoneIds: CHAPTER_TWO_KINDLEMOOR_ZONE_IDS,
  items: ITEMS,
  mobs: MOBS,
  npcs: NPCS,
  quests: QUESTS,
  camps: CAMPS,
  objects: OBJECTS,
  escorts: ESCORTS,
});
