// Wyndlewood Chapter Two, Act F: the Heath Way to the Low Reaches (levels 9 to
// 15). Data only.
//
// The 6 to 15 leveling band thinned out after the Mirefen chain: levels 9 and
// 13 to 15 had a handful of quests each, and the three Low Reaches zones (the
// Saltmeads, the Wychwold and the Tinmarch) shipped with camps, hubs and giver
// plots but no quests at all. This act runs one road through them: a Ferncross
// peat foreman's level 9 work on the Kindlemoor, then Panwick's salt pans
// (11 to 13), the Bracken Circle lodge at Elmhallow (12 to 14) and the Gilt
// Measure's mine at Wheal Patience (13 to 15), each zone ending in a hand-off
// to the next hub so leveling flows without a grind.
//
// A GATED bundle like its siblings (chapter_two_kindlemoor.ts,
// chapter_two_chalkbarrow.ts): it merges only when every zone it stands in is
// in the zone table. Givers stand on the frontier hub plots
// (src/sim/frontier/hub_plots.ts) and positions come from the world crew's
// FRONTIER_ANCHORS (frontier/layout.ts), restated here so this module reads no
// file that may not exist yet; tests/chapter_two_content.test.ts holds them to
// dry open ground. Creatures are zone variants of shipped templates at this
// act's levels, so a kill or drop counts only in its own zone. Ground objects
// use reserved entity ids from 2_147_260_000 and every camp spawns offStream,
// so nothing shifts a shipped id or rng stream.

import type { CampDef, EscortDef, ItemDef, MobTemplate, NpcDef, QuestDef } from '../types';
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
  talk,
  useOn,
} from './chapter_two';
import { GALECREST_MOBS } from './galecrest';
import { PALMREACH_MOBS } from './palmreach';
import { ZONE1_MOBS } from './zone1';
import { ZONE2_MOBS } from './zone2';
import { ZONE3_MOBS } from './zone3';

/** Every zone this bundle stands in. */
export const CHAPTER_TWO_LOW_REACHES_ZONE_IDS: readonly string[] = Object.freeze([
  'kindlemoor',
  'saltmeads',
  'wychwold',
  'tinmarch',
]);

// The world crew's anchors (frontier/layout.ts FRONTIER_ANCHORS).
const PEAT_CUTS = { x: -14, z: -346 };
const PANWICK = { x: 362, z: -652 };
const BRINE_PANS = { x: 440, z: -704 };
const ELMHALLOW = { x: 34, z: -690 };
const KNOTTED_ELM = { x: -56, z: -764 };
const WHEAL_PATIENCE = { x: -330, z: -668 };
const BLACKADIT = { x: -262, z: -806 };

// Givers, one per hub plot (frontier/hub_plots.ts FRONTIER_HUB_PLOTS).
export const LR_PEAT_FOREMAN = 'peat_foreman_wat';
export const LR_PAN_REEVE = 'pan_reeve_odda';
export const LR_SALT_BOILER = 'salt_boiler_jory';
export const LR_LODGE_KEEPER = 'lodge_keeper_hesper';
export const LR_CHARCOAL_BURNER = 'charcoal_burner_gyles';
export const LR_MINE_CAPTAIN = 'mine_captain_penhallow';
export const LR_ASSAYER = 'assayer_merrin';
export const LR_WAGONER_ESCORT_MOB = 'escort_lr_wagoner_nan';

const NPCS: Record<string, NpcDef> = {
  [LR_PEAT_FOREMAN]: npc(
    LR_PEAT_FOREMAN,
    'Wat Heathersby',
    'Peat-Cutters Foreman',
    { x: 23.8, z: -321.7 },
    Math.PI / 2,
    0x6a5a3a,
    'Mind where you put your feet. Half this moor is peat and the other half is pretending.',
  ),
  [LR_PAN_REEVE]: npc(
    LR_PAN_REEVE,
    'Odda Brinewell',
    'Pan-Reeve of Panwick',
    { x: 368, z: -645.3 },
    Math.PI,
    0x8a8f96,
    'Panwick salts the fish of half the south. When the pans stop, people go hungry. So the pans do not stop.',
  ),
  [LR_SALT_BOILER]: npc(
    LR_SALT_BOILER,
    'Jory Pannell',
    'Salt Boiler',
    { x: 357.5, z: -644.2 },
    Math.PI * 0.9,
    0xb8a888,
    'Breathe through your nose. You get used to the brine. Mostly.',
  ),
  [LR_LODGE_KEEPER]: npc(
    LR_LODGE_KEEPER,
    'Hesper Elmsley',
    'Keeper of the Elmhallow Lodge',
    { x: 40, z: -683.3 },
    Math.PI,
    0x4f7a46,
    'The wold was old before the first hearth was lit. Walk softly. It remembers.',
  ),
  [LR_CHARCOAL_BURNER]: npc(
    LR_CHARCOAL_BURNER,
    'Gyles Charwood',
    'Charcoal Burner',
    { x: 29.5, z: -682.2 },
    Math.PI * 1.1,
    0x3d3a36,
    'Soot washes off. Wolves do not. I will take the soot.',
  ),
  [LR_MINE_CAPTAIN]: npc(
    LR_MINE_CAPTAIN,
    'Tobias Penhallow',
    'Mine Captain of Wheal Patience',
    { x: -324, z: -661.3 },
    Math.PI,
    0x7a6a4e,
    'Wheal Patience. The name was a joke when we sank the shaft. Nobody is laughing now.',
  ),
  [LR_ASSAYER]: npc(
    LR_ASSAYER,
    'Merrin Coyle',
    'Assayer',
    { x: -334.5, z: -660.2 },
    Math.PI * 0.9,
    0x9a8a5a,
    'Every stone tells you what it is, if you ask it the right way. Most people only ask with a hammer.',
  ),
};

/** A zone variant of a shipped template: same rig and kit, this act's levels,
 *  copper on the shipped frontier ladder (about four copper a level) and an
 *  optional quest drop. */
function variant(
  base: MobTemplate,
  id: string,
  name: string,
  minLevel: number,
  maxLevel: number,
  drop?: { itemId: string; chance: number; questId: string },
): MobTemplate {
  return {
    ...base,
    id,
    name,
    minLevel,
    maxLevel,
    loot: [{ copper: maxLevel * 4, chance: 1 }, ...(drop ? [drop] : [])],
  };
}

const MOBS: Record<string, MobTemplate> = {
  // The Kindlemoor (8 to 10).
  heath_widow: variant(ZONE2_MOBS.mire_widow, 'heath_widow', 'Heath Widow', 8, 9, {
    itemId: 'lr_heath_widow_silk',
    chance: 0.55,
    questId: 'lr_01_silk_in_the_heather',
  }),
  barrow_walker: variant(ZONE1_MOBS.restless_bones, 'barrow_walker', 'Barrow Walker', 8, 9, {
    itemId: 'lr_barrow_grave_good',
    chance: 0.5,
    questId: 'lr_30_barrow_grave_goods',
  }),
  heath_prowler: variant(ZONE2_MOBS.mire_prowler, 'heath_prowler', 'Heath Prowler', 10, 10),
  // The Saltmeads (11 to 13).
  brine_scuttler: variant(PALMREACH_MOBS.tide_scuttler, 'brine_scuttler', 'Brine Scuttler', 11, 12),
  pan_looter: variant(ZONE1_MOBS.vale_bandit, 'pan_looter', 'Pan Looter', 11, 12, {
    itemId: 'lr_stolen_salt_sack',
    chance: 0.5,
    questId: 'lr_07_stolen_salt',
  }),
  saltdown_ram: variant(GALECREST_MOBS.moor_ram, 'saltdown_ram', 'Saltdown Ram', 12, 13, {
    itemId: 'lr_saltdown_fleece',
    chance: 0.6,
    questId: 'lr_09_fleece_for_the_salters',
  }),
  drowned_salt_hand: variant(
    GALECREST_MOBS.drowned_deckhand,
    'drowned_salt_hand',
    'Drowned Salt-Hand',
    12,
    13,
    { itemId: 'lr_salters_ledger', chance: 0.25, questId: 'lr_11_ledger_in_the_brine' },
  ),
  brine_bloat: variant(ZONE2_MOBS.bog_bloat, 'brine_bloat', 'Brine Bloat', 12, 13),
  // The Wychwold (12 to 14).
  wold_wolf: variant(ZONE1_MOBS.forest_wolf, 'wold_wolf', 'Wold Wolf', 12, 13),
  charwood_boar: variant(PALMREACH_MOBS.thicket_boar, 'charwood_boar', 'Charwood Boar', 12, 13, {
    itemId: 'lr_charwood_boar_tusk',
    chance: 0.6,
    questId: 'lr_16_tusks_and_tempers',
  }),
  elmshade_weaver: variant(
    PALMREACH_MOBS.canopy_weaver,
    'elmshade_weaver',
    'Elmshade Weaver',
    13,
    14,
    { itemId: 'lr_elmshade_silk', chance: 0.55, questId: 'lr_18_silk_in_the_elms' },
  ),
  elmroot_dead: variant(ZONE1_MOBS.restless_bones, 'elmroot_dead', 'Elmroot Dead', 13, 14, {
    itemId: 'lr_root_knot_charm',
    chance: 0.45,
    questId: 'lr_20_the_knotted_elm',
  }),
  // The Tinmarch (13 to 15).
  spoilheap_digger: variant(ZONE1_MOBS.tunnel_rat, 'spoilheap_digger', 'Spoilheap Digger', 13, 14),
  blackadit_tunneler: variant(
    ZONE3_MOBS.deeprock_kobold,
    'blackadit_tunneler',
    'Blackadit Tunneler',
    14,
    15,
    { itemId: 'lr_stolen_mine_lamp', chance: 0.5, questId: 'lr_24_stolen_lamps' },
  ),
  tinmoor_stalker: variant(ZONE3_MOBS.ridge_stalker, 'tinmoor_stalker', 'Tinmoor Stalker', 14, 15),
  tinstone_elemental: variant(
    ZONE3_MOBS.stormcrag_elemental,
    'tinstone_elemental',
    'Tinstone Elemental',
    14,
    15,
    { itemId: 'lr_humming_tinstone', chance: 0.6, questId: 'lr_26_the_humming_stones' },
  ),
  pale_accord_delver: variant(
    ZONE2_MOBS.gravecaller_cultist,
    'pale_accord_delver',
    'Pale Accord Delver',
    14,
    15,
    { itemId: 'lr_pale_ink_orders', chance: 0.25, questId: 'lr_28_orders_in_pale_ink' },
  ),
  // The escortee: a friendly walker the escort run drives (the Kindlemoor
  // keeper's shape, chapter_two_kindlemoor.ts).
  [LR_WAGONER_ESCORT_MOB]: {
    id: LR_WAGONER_ESCORT_MOB,
    name: 'Nan Saltash',
    minLevel: 12,
    maxLevel: 12,
    family: 'humanoid',
    hpBase: 320,
    hpPerLevel: 34,
    dmgBase: 1,
    dmgPerLevel: 0,
    attackSpeed: 2,
    armorPerLevel: 20,
    moveSpeed: 0,
    aggroRadius: 0,
    loot: [],
    scale: 1,
    color: 0x9a7a5a,
  },
};

const camp = (mobId: string, x: number, z: number, radius: number, count: number): CampDef => ({
  mobId,
  center: { x, z },
  radius,
  count,
  offStream: true,
});

const CAMPS: CampDef[] = [
  // The Kindlemoor: widows in the heather east of the peat cuts, walkers on the
  // barrows south of the Hearth Ring.
  camp('heath_widow', 118, -350, 10, 6),
  camp('barrow_walker', -30, -440, 10, 6),
  camp('heath_prowler', 76, -460, 10, 6),
  // The Saltmeads: the pans, the salt downs and the drowned shore.
  camp('brine_scuttler', 404, -690, 10, 7),
  camp('pan_looter', 316, -736, 9, 6),
  camp('saltdown_ram', 376, -796, 11, 6),
  camp('drowned_salt_hand', 470, -742, 10, 7),
  camp('brine_bloat', 482, -676, 9, 5),
  // The Wychwold: wolves and boars round the charcoal clamps, weavers and the
  // elmroot dead under the Knotted Elm.
  camp('wold_wolf', 112, -676, 11, 6),
  camp('charwood_boar', -6, -626, 11, 6),
  camp('elmshade_weaver', -90, -790, 10, 6),
  camp('elmroot_dead', -56, -784, 9, 6),
  // The Tinmarch: spoil heaps, the moor, the Stannary Stones and the Blackadit.
  camp('spoilheap_digger', -286, -704, 10, 7),
  camp('tinmoor_stalker', -376, -632, 11, 5),
  camp('tinstone_elemental', -444, -750, 9, 4),
  camp('blackadit_tunneler', -244, -780, 9, 6),
  camp('pale_accord_delver', -270, -822, 8, 6),
];

const ITEMS: Record<string, ItemDef> = {
  lr_heath_widow_silk: qi(
    'lr_heath_widow_silk',
    'Heath Widow Silk',
    'lr_01_silk_in_the_heather',
    5,
  ),
  lr_barrow_grave_good: qi(
    'lr_barrow_grave_good',
    'Barrow Grave-Good',
    'lr_30_barrow_grave_goods',
    5,
  ),
  lr_peat_brick: qi('lr_peat_brick', 'Stacked Peat Brick', 'lr_03_peat_for_the_cutters', 6),
  lr_stolen_salt_sack: qi('lr_stolen_salt_sack', 'Sack of Panwick Salt', 'lr_07_stolen_salt', 6),
  lr_brine_skim: qi('lr_brine_skim', 'Skim of Clean Brine', 'lr_08_skimming_the_pans', 5),
  lr_saltdown_fleece: qi(
    'lr_saltdown_fleece',
    'Saltdown Fleece',
    'lr_09_fleece_for_the_salters',
    6,
  ),
  lr_salters_ledger: qi(
    'lr_salters_ledger',
    "A Drowned Salter's Ledger",
    'lr_11_ledger_in_the_brine',
  ),
  lr_charwood_boar_tusk: qi(
    'lr_charwood_boar_tusk',
    'Charwood Boar Tusk',
    'lr_16_tusks_and_tempers',
    6,
  ),
  // Loaned on accept and kept through the turn-in, like every quest tool here.
  lr_burners_firebrand: qi('lr_burners_firebrand', "Burner's Firebrand", 'lr_17_cold_clamps'),
  lr_elmshade_silk: qi('lr_elmshade_silk', 'Elmshade Silk', 'lr_18_silk_in_the_elms', 5),
  lr_root_knot_charm: qi('lr_root_knot_charm', 'Root-Knot Charm', 'lr_20_the_knotted_elm', 4),
  lr_ore_sample: qi('lr_ore_sample', 'Spoil Heap Ore Sample', 'lr_25_assay_samples', 5),
  lr_stolen_mine_lamp: qi('lr_stolen_mine_lamp', 'Stolen Mine Lamp', 'lr_24_stolen_lamps', 6),
  lr_humming_tinstone: qi('lr_humming_tinstone', 'Humming Tinstone', 'lr_26_the_humming_stones', 4),
  lr_pale_ink_orders: qi('lr_pale_ink_orders', 'Orders in Pale Ink', 'lr_28_orders_in_pale_ink'),
  lr_pit_prop: qi('lr_pit_prop', 'Bundle of Pit Props', 'lr_29_shore_up_the_blackadit', 3),
};
const FIXTURES: Record<string, string> = {
  lr_stacked_peat: 'Stack of Cut Peat',
  lr_brine_pan_edge: 'Brine Pan',
  lr_cold_clamp: 'Cold Charcoal Clamp',
  lr_knotted_elm: 'The Knotted Elm',
  lr_spoil_heap: 'Tin Spoil Heap',
  lr_blackadit_mouth: 'Blackadit Working',
};
for (const [id, name] of Object.entries(FIXTURES)) {
  ITEMS[id] = { id, name, kind: 'quest', sellValue: 0 };
}

const OBJECTS = objects(2_147_260_000, [
  // Quest 3: peat stacked to dry in the cuts north of the hound runs.
  [
    'lr_stacked_peat',
    'Stack of Cut Peat',
    [
      { x: PEAT_CUTS.x - 4, z: PEAT_CUTS.z + 10 },
      { x: PEAT_CUTS.x + 4, z: PEAT_CUTS.z + 8 },
      { x: PEAT_CUTS.x - 10, z: PEAT_CUTS.z + 16 },
      { x: PEAT_CUTS.x + 10, z: PEAT_CUTS.z + 2 },
      { x: PEAT_CUTS.x, z: PEAT_CUTS.z + 20 },
      { x: PEAT_CUTS.x + 8, z: PEAT_CUTS.z + 16 },
    ],
  ],
  // Quest 8: the rims of the Brine Pans.
  [
    'lr_brine_pan_edge',
    'Brine Pan',
    [
      // Each a step back from the pan's own rim, on the walkable bank.
      { x: BRINE_PANS.x - 14.5, z: BRINE_PANS.z + 1 },
      { x: BRINE_PANS.x - 11, z: BRINE_PANS.z - 9.5 },
      { x: BRINE_PANS.x - 1, z: BRINE_PANS.z - 14.5 },
      { x: BRINE_PANS.x + 11, z: BRINE_PANS.z - 10 },
      { x: BRINE_PANS.x - 9.5, z: BRINE_PANS.z + 11 },
    ],
  ],
  // Quest 17: the charcoal clamps in the hollow south of Elmhallow.
  [
    'lr_cold_clamp',
    'Cold Charcoal Clamp',
    [
      { x: ELMHALLOW.x - 20, z: ELMHALLOW.z - 30 },
      { x: ELMHALLOW.x - 30, z: ELMHALLOW.z - 38 },
      { x: ELMHALLOW.x - 12, z: ELMHALLOW.z - 42 },
      { x: ELMHALLOW.x - 24, z: ELMHALLOW.z - 50 },
    ],
  ],
  // Quest 20: the Knotted Elm itself.
  ['lr_knotted_elm', 'The Knotted Elm', [{ x: KNOTTED_ELM.x + 5, z: KNOTTED_ELM.z + 3 }]],
  // Quest 25: spoil heaps east of the mine camp.
  [
    'lr_spoil_heap',
    'Tin Spoil Heap',
    [
      { x: WHEAL_PATIENCE.x + 24, z: WHEAL_PATIENCE.z - 20 },
      { x: WHEAL_PATIENCE.x + 32, z: WHEAL_PATIENCE.z - 28 },
      { x: WHEAL_PATIENCE.x + 20, z: WHEAL_PATIENCE.z - 34 },
      { x: WHEAL_PATIENCE.x + 36, z: WHEAL_PATIENCE.z - 40 },
      { x: WHEAL_PATIENCE.x + 26, z: WHEAL_PATIENCE.z - 46 },
    ],
  ],
  // Quest 29: the three workings the Pale Accord opened round the Blackadit.
  [
    'lr_blackadit_mouth',
    'Blackadit Working',
    [
      { x: BLACKADIT.x + 10, z: BLACKADIT.z + 4 },
      { x: BLACKADIT.x - 10, z: BLACKADIT.z + 6 },
      { x: BLACKADIT.x + 5, z: BLACKADIT.z - 10 },
    ],
  ],
]);

const ESCORTS: Record<string, EscortDef> = {
  esc_lr_wagoner_nan: {
    id: 'esc_lr_wagoner_nan',
    npcMobId: LR_WAGONER_ESCORT_MOB,
    questId: 'lr_13_salt_cart',
    start: { x: PANWICK.x + 8, z: PANWICK.z - 12 },
    waypoints: [
      { x: PANWICK.x + 20, z: PANWICK.z - 22 },
      { x: PANWICK.x + 36, z: PANWICK.z - 32 },
      { x: PANWICK.x + 52, z: PANWICK.z - 40 },
      { x: BRINE_PANS.x - 21, z: BRINE_PANS.z + 8.5 },
    ],
    moveSpeed: 3,
    // The scuttlers come up out of the pans for the cart halfway.
    ambushes: [{ atWaypoint: 2, mobId: 'brine_scuttler', count: 2 }],
    creditRadius: 30,
    respawnSeconds: 30,
    startText:
      'Walk by the wheel. The scuttlers go for the cart and I would rather they went for you.',
    successText: 'Every sack dry and the axle still on. Odda owes you a supper, and so do I.',
    failText: 'Nan has turned the cart back to Panwick to mend a wheel.',
  },
};

const QUESTS: Record<string, QuestDef> = {
  // -------------------------------------------------------------------------
  // The Kindlemoor: Ferncross's peat cutters (9 to 10)
  // -------------------------------------------------------------------------
  lr_01_silk_in_the_heather: quest(
    'lr_01_silk_in_the_heather',
    'Silk in the Heather',
    9,
    'medium',
    LR_PEAT_FOREMAN,
    LR_PEAT_FOREMAN,
    'bracken_circle',
    'Widows have spun over the heather east of the cuts, and my cutters walk into the webs every morning with a spade in one hand and a scream in the other. Clear them out for me. And bring back some of that silk: wound tight, it makes the best drying lines on the moor.',
    'Five good hanks and a heath you can walk across without dancing. The cutters will sing about you, $N. Badly, but they will sing.',
    [
      kill('heath_widow', 8, 'Heath Widow slain'),
      collect('lr_heath_widow_silk', 5, 'Heath Widow Silk'),
    ],
  ),
  lr_02_barrow_walkers: quest(
    'lr_02_barrow_walkers',
    'The Barrow Walkers',
    9,
    'medium',
    LR_PEAT_FOREMAN,
    LR_PEAT_FOREMAN,
    'bracken_circle',
    'South of the Hearth Ring the old barrows have started to empty, and what climbs out walks the moor at dusk. They do not want our peat and they do not want our coin. They just walk, and anything in their way gets walked over. Lay them back down, $N, gently if you can and firmly if you cannot.',
    'Quiet again, and the barrows only barrows. Tamsin says the moor is listening to something. I say it is listening to you now.',
    [kill('barrow_walker', 10, 'Barrow Walker laid to rest')],
    { requiresQuest: 'lr_01_silk_in_the_heather' },
  ),
  lr_30_barrow_grave_goods: quest(
    'lr_30_barrow_grave_goods',
    'Barrow Grave-Goods',
    9,
    'small',
    LR_PEAT_FOREMAN,
    LR_PEAT_FOREMAN,
    'bracken_circle',
    'The walkers carry things out of the barrows with them: brooches, combs, little clay hearths no bigger than your thumb. Those belong in the ground with their owners. Bring me what they carry and I will see the keepers put it all back where it was.',
    'Clay hearths, every one of them. The old moor folk buried their dead with a fire to carry. I will have Agnes take them back to the barrows at first light.',
    [collect('lr_barrow_grave_good', 5, 'Barrow Grave-Good')],
    { requiresQuest: 'lr_01_silk_in_the_heather' },
  ),
  lr_03_peat_for_the_cutters: quest(
    'lr_03_peat_for_the_cutters',
    'Peat for the Cutters',
    9,
    'small',
    LR_PEAT_FOREMAN,
    LR_PEAT_FOREMAN,
    'bracken_circle',
    'The hounds have kept my cutters off the drying stacks for a week, and wet peat does not burn. Go down to the cuts and bring me a brick from each stack while the weather holds. The hounds will not thank you. Neither will your back.',
    'Dry as a sermon, every brick. Ferncross will be warm tonight, and that is your doing.',
    [pick('lr_stacked_peat', 6, 'Peat brick taken from a stack', 'lr_peat_brick')],
    { shareable: false },
  ),
  lr_04_prowlers_on_the_heath: quest(
    'lr_04_prowlers_on_the_heath',
    'Prowlers on the Heath',
    10,
    'medium',
    LR_PEAT_FOREMAN,
    LR_PEAT_FOREMAN,
    'bracken_circle',
    'Prowlers have come up from the south heath and taken two of our ponies. A pony is a cart, and a cart is how the peat gets to market. Thin them out before they get bold enough to try the camp.',
    'No more tracks by the pony line this morning. The carts roll again. Thank you, $N.',
    [kill('heath_prowler', 8, 'Heath Prowler slain')],
    { requiresQuest: 'lr_01_silk_in_the_heather' },
  ),
  lr_05_word_to_panwick: quest(
    'lr_05_word_to_panwick',
    'Word to Panwick',
    10,
    'small',
    LR_PEAT_FOREMAN,
    LR_PAN_REEVE,
    'hearthwright_compact',
    'Panwick buys half my peat to boil their brine, and the Pan-Reeve has not sent a cart in a fortnight. Odda Brinewell does not miss a fortnight. Take the Applewold road south over the Saltmeads gate and find out what is keeping her. If it is trouble, she will be glad of you. If it is not, buy me some salt.',
    'Wat sent you? Then he has worked out something is wrong before I have had time to write it down. Sit. There is more trouble in Panwick than there are pans, and I have a great many pans.',
    [talk(LR_PAN_REEVE, 'Speak with Odda Brinewell in Panwick')],
    { requiresQuest: 'lr_02_barrow_walkers' },
  ),
  // -------------------------------------------------------------------------
  // The Saltmeads: Panwick's pans (11 to 13)
  // -------------------------------------------------------------------------
  lr_06_claws_in_the_pans: quest(
    'lr_06_claws_in_the_pans',
    'Claws in the Pans',
    11,
    'medium',
    LR_SALT_BOILER,
    LR_SALT_BOILER,
    'hearthwright_compact',
    'Scuttlers. Up out of the shallows and into the settling pans, snipping at anyone who bends over the brine. A boiler with no fingers is a boiler with no job. Go and teach them the pans are ours.',
    'Ten fewer claws and I can finally rake a pan without counting my fingers after. You have the makings of a salter, $N.',
    [kill('brine_scuttler', 10, 'Brine Scuttler slain')],
  ),
  lr_07_stolen_salt: quest(
    'lr_07_stolen_salt',
    'Stolen Salt',
    11,
    'medium',
    LR_PAN_REEVE,
    LR_PAN_REEVE,
    'hearthwright_compact',
    'Looters have been carrying off whole sacks from the drying sheds by night and camping west of the pans as if they owned the place. Salt is the only coin this town has. Get my sacks back, and if the looters object, let them object to you.',
    'Six sacks, still dry. You would not believe how hard it is to find someone who can carry salt through a fight without spilling it.',
    [collect('lr_stolen_salt_sack', 6, 'Sack of Panwick Salt')],
  ),
  lr_08_skimming_the_pans: quest(
    'lr_08_skimming_the_pans',
    'Skimming the Pans',
    11,
    'small',
    LR_SALT_BOILER,
    LR_SALT_BOILER,
    'hearthwright_compact',
    'Now the scuttlers are gone, the pans need skimming before the brine sours. Go out to the Brine Pans and take a skim from each pan rim. Keep the scum out of it. If it is grey, it is wrong. If it is pink, run.',
    'Clean, clear and sharp as a winter morning. Those will boil down into the best salt Panwick has made all season.',
    [pick('lr_brine_pan_edge', 5, 'Brine skimmed from a pan', 'lr_brine_skim')],
    { requiresQuest: 'lr_06_claws_in_the_pans', shareable: false },
  ),
  lr_09_fleece_for_the_salters: quest(
    'lr_09_fleece_for_the_salters',
    'Fleece for the Salters',
    12,
    'medium',
    LR_SALT_BOILER,
    LR_SALT_BOILER,
    'hearthwright_compact',
    'Salters work with their hands in brine all day, and brine eats skin. The rams on the salt downs grow a fleece so greasy the brine slides right off it. Bring me some and the whole crew will have gloves by winter.',
    'Greasy, thick and smelling of the downs. The crew will grumble about the smell for a week and then never take the gloves off.',
    [collect('lr_saltdown_fleece', 6, 'Saltdown Fleece')],
  ),
  lr_10_what_the_tide_brought: quest(
    'lr_10_what_the_tide_brought',
    'What the Tide Brought',
    12,
    'medium',
    LR_PAN_REEVE,
    LR_PAN_REEVE,
    'hearthwright_compact',
    'The tide has started bringing in more than salt. Drowned men walk up out of the shallows east of the pans, still in salter aprons, still carrying rakes. Some of them I knew. Put them to rest, $N. I cannot ask the town to do it.',
    'Thank you. I will have their names read in the square tonight, the ones I can still remember. Something sent them back to us. I want to know what.',
    [kill('drowned_salt_hand', 10, 'Drowned Salt-Hand laid to rest')],
    { requiresQuest: 'lr_07_stolen_salt' },
  ),
  lr_11_ledger_in_the_brine: quest(
    'lr_11_ledger_in_the_brine',
    'A Ledger in the Brine',
    12,
    'medium',
    LR_PAN_REEVE,
    LR_PAN_REEVE,
    'hearthwright_compact',
    'Every salter carries a tally book in a waxed pouch, and the drowned still wear theirs. One of them will say where they were working when the water took them. Find me a ledger that can still be read.',
    'Waterlogged, but legible. The last page is a tally of salt sold to a buyer with no name, paid in new coin, delivered to the Wychwold road. Salt does not go west, $N. Nobody in the wold needs that much.',
    [collect('lr_salters_ledger', 1, "A Drowned Salter's Ledger")],
    { requiresQuest: 'lr_10_what_the_tide_brought' },
  ),
  lr_12_bloats_on_the_saltings: quest(
    'lr_12_bloats_on_the_saltings',
    'Bloats on the Saltings',
    13,
    'small',
    LR_SALT_BOILER,
    LR_SALT_BOILER,
    'hearthwright_compact',
    'Bloats have drifted onto the saltings east of town and they sour every pan they float near. Pop them, from a distance if you have any sense. I will not be helping with the washing afterwards.',
    'I could smell that from here. The pans will forgive you. Your boots may not.',
    [kill('brine_bloat', 8, 'Brine Bloat popped')],
  ),
  lr_13_salt_cart: quest(
    'lr_13_salt_cart',
    'The Salt Cart',
    13,
    'medium',
    LR_PAN_REEVE,
    LR_PAN_REEVE,
    'hearthwright_compact',
    'Nan Saltash takes the cart out to the Brine Pans for the morning skim, and twice this week the scuttlers have come up out of the water for her. Walk with her to the pans. If that ledger is right, I will need every sack we can make before somebody else comes asking for it.',
    'Nan says you kept the scuttlers off the cart and only lost your temper once. From Nan, that is high praise.',
    [
      {
        type: 'escort',
        escortId: 'esc_lr_wagoner_nan',
        count: 1,
        label: 'Nan Saltash escorted to the Brine Pans',
      },
    ],
    { requiresQuest: 'lr_11_ledger_in_the_brine', shareable: false },
  ),
  lr_14_the_salt_way_west: quest(
    'lr_14_the_salt_way_west',
    'The Salt Way West',
    13,
    'small',
    LR_PAN_REEVE,
    LR_LODGE_KEEPER,
    'bracken_circle',
    'The ledger says the salt went west along the salt way, into the Wychwold. The Bracken Circle keeps a lodge at Elmhallow and Hesper Elmsley knows every cart that has rolled through the wold in thirty years. Take her the news, and ask her who in the wold is buying salt by the cartload.',
    'Salt by the cartload? Out here? Nobody in the wold salts anything but the odd ham. Then somebody is buying it for something else, and I do not like the list of things that need that much salt.',
    [talk(LR_LODGE_KEEPER, 'Speak with Hesper Elmsley at Elmhallow')],
    { requiresQuest: 'lr_13_salt_cart' },
  ),
  // -------------------------------------------------------------------------
  // The Wychwold: Elmhallow and the Knotted Elm (12 to 14)
  // -------------------------------------------------------------------------
  lr_15_wolves_at_the_clamps: quest(
    'lr_15_wolves_at_the_clamps',
    'Wolves at the Clamps',
    12,
    'medium',
    LR_CHARCOAL_BURNER,
    LR_CHARCOAL_BURNER,
    'bracken_circle',
    'A clamp has to be watched day and night or it burns through and you are left with ash. The wolves know it. They wait until a burner dozes and then they come for the lunch basket, and sometimes for the burner. Drive them off east of the lodge.',
    'The pack has gone quiet. My lads slept last night for the first time in a week, and only two clamps burned through. That is a good week, $N.',
    [kill('wold_wolf', 10, 'Wold Wolf slain')],
  ),
  lr_16_tusks_and_tempers: quest(
    'lr_16_tusks_and_tempers',
    'Tusks and Tempers',
    12,
    'small',
    LR_CHARCOAL_BURNER,
    LR_CHARCOAL_BURNER,
    'bracken_circle',
    'The boars north of the lodge root up the turf we stack over the clamps, and a clamp with no turf is just a bonfire. Bring me some tusks. The Circle carves them into pegs for the turf, which the boars find very insulting.',
    'Good, sharp tusks. There is a kind of justice in pegging their own turf down with them.',
    [collect('lr_charwood_boar_tusk', 6, 'Charwood Boar Tusk')],
  ),
  lr_17_cold_clamps: quest(
    'lr_17_cold_clamps',
    'Cold Clamps',
    13,
    'medium',
    LR_CHARCOAL_BURNER,
    LR_CHARCOAL_BURNER,
    'bracken_circle',
    'Four of my clamps in the hollow went cold overnight. Not burned out: cold, with the wood still inside, like something drank the fire out of them. Take this firebrand down to the hollow and light them again. If they will not take, come back and tell me, and we will both pretend we are not worried.',
    'They took, all four, though you say the smoke came out the wrong way at first. Into the ground instead of up. I will be asking Hesper about that.',
    [
      useOn('lr_cold_clamp', 4, 'Cold charcoal clamp relit', 'lr_burners_firebrand', {
        keepsUsedItem: true,
      }),
    ],
    {
      requiresQuest: 'lr_15_wolves_at_the_clamps',
      requiredItems: ['lr_burners_firebrand'],
      shareable: false,
    },
  ),
  lr_18_silk_in_the_elms: quest(
    'lr_18_silk_in_the_elms',
    'Silk in the Elms',
    13,
    'medium',
    LR_LODGE_KEEPER,
    LR_LODGE_KEEPER,
    'bracken_circle',
    'Weavers have strung the elms south of here so thick that the light does not reach the floor. The Circle does not hurt the wold lightly, but a wood with no light is a dying wood. Cut them back, and bring me their silk. We weave it into the binding cords for the Knotted Elm.',
    'Light on the wold floor again, and enough silk to bind the elm for a year. Thank you. Now I can show you what I have been afraid to look at alone.',
    [
      kill('elmshade_weaver', 8, 'Elmshade Weaver slain'),
      collect('lr_elmshade_silk', 5, 'Elmshade Silk'),
    ],
  ),
  lr_19_under_the_roots: quest(
    'lr_19_under_the_roots',
    'Under the Roots',
    14,
    'medium',
    LR_LODGE_KEEPER,
    LR_LODGE_KEEPER,
    'bracken_circle',
    'The old wold folk buried their dead among the roots of the Knotted Elm, so the tree would keep them. Now the tree is letting them go. They climb out of the roots and stand around the trunk as if they are waiting for someone. Lay them down again, $N, before they decide who.',
    'Still now, all of them. They were facing the same way, east, toward the salt way. Whatever the salt is for, the dead under the elm know about it.',
    [kill('elmroot_dead', 10, 'Elmroot Dead laid to rest')],
    { requiresQuest: 'lr_18_silk_in_the_elms' },
  ),
  lr_20_the_knotted_elm: quest(
    'lr_20_the_knotted_elm',
    'The Knotted Elm',
    14,
    'large',
    LR_LODGE_KEEPER,
    LR_LODGE_KEEPER,
    'bracken_circle',
    'The elmroot dead wear knotted charms, the old binding the wold folk tied before the first hearth. Gather some from them, then go to the Knotted Elm and lay your hand on the trunk. If the binding still holds, you will feel it. If it does not, tell me what you felt instead.',
    'Cold, you say, and pulling toward the south-west. Toward the Tinmarch. Someone is taking salt and fire out of this country and sending it somewhere under the ground. The miners at Wheal Patience will know where the ground has been opened.',
    [
      collect('lr_root_knot_charm', 4, 'Root-Knot Charm'),
      inspect('lr_knotted_elm', 1, 'The Knotted Elm touched'),
    ],
    { requiresQuest: 'lr_19_under_the_roots' },
  ),
  lr_21_tinners_ford: quest(
    'lr_21_tinners_ford',
    "Tinners' Ford",
    14,
    'small',
    LR_LODGE_KEEPER,
    LR_MINE_CAPTAIN,
    'gilt_measure',
    "Cross Tinners' Ford into the Tinmarch and find Captain Tobias Penhallow at Wheal Patience. He is a Gilt Measure man and he will want to argue about who pays for what. Let him. Then tell him the elm is pulling toward his moor, and watch his face.",
    'The elm, pulling toward my moor. That is the second strange thing I have heard this week, and the first was a crew of strangers opening the old Blackadit without a licence. Sit down. I think we have the same problem.',
    [talk(LR_MINE_CAPTAIN, 'Speak with Tobias Penhallow at Wheal Patience')],
    { requiresQuest: 'lr_20_the_knotted_elm' },
  ),
  // -------------------------------------------------------------------------
  // The Tinmarch: Wheal Patience and the Blackadit (13 to 15)
  // -------------------------------------------------------------------------
  lr_22_rats_in_the_spoil: quest(
    'lr_22_rats_in_the_spoil',
    'Rats in the Spoil',
    13,
    'medium',
    LR_MINE_CAPTAIN,
    LR_MINE_CAPTAIN,
    'gilt_measure',
    'Diggers have burrowed into the spoil heaps east of camp, and a spoil heap full of tunnels is a spoil heap waiting to fall on somebody. Clear them out before my insurers hear about it.',
    'The heaps have stopped twitching. My insurers will never know how close they came to paying out. Neither will my wife.',
    [kill('spoilheap_digger', 10, 'Spoilheap Digger slain')],
  ),
  lr_23_stalkers_on_the_moor: quest(
    'lr_23_stalkers_on_the_moor',
    'Stalkers on the Moor',
    14,
    'small',
    LR_ASSAYER,
    LR_ASSAYER,
    'gilt_measure',
    'I walk the moor north of camp for samples, and lately something walks behind me. Stalkers, a whole family of them, and they have learned that an assayer with her nose in a rock does not look up. Make them reconsider.',
    'I walked the north moor this morning and nothing followed me but my own shadow. You cannot assay peace of mind, but I would put a high value on it.',
    [kill('tinmoor_stalker', 8, 'Tinmoor Stalker slain')],
  ),
  lr_24_stolen_lamps: quest(
    'lr_24_stolen_lamps',
    'Stolen Lamps',
    14,
    'medium',
    LR_MINE_CAPTAIN,
    LR_MINE_CAPTAIN,
    'gilt_measure',
    'Tunnelers came up from the Blackadit and stripped our lamp store bare. A miner with no lamp is a miner with no work, and the shift is waiting. They are camped by the old working south-east of here. Bring the lamps home.',
    'Six lamps, and every one of them with the Wheal Patience mark scratched off and a pale sigil scratched on. Somebody is supplying those tunnelers, $N. Tunnelers do not draw sigils.',
    [collect('lr_stolen_mine_lamp', 6, 'Stolen Mine Lamp')],
    { requiresQuest: 'lr_22_rats_in_the_spoil' },
  ),
  lr_25_assay_samples: quest(
    'lr_25_assay_samples',
    'Assay Samples',
    13,
    'small',
    LR_ASSAYER,
    LR_ASSAYER,
    'gilt_measure',
    'The spoil heaps east of camp should be worthless: that is what spoil means. But my lamp flickers when I walk past them. Bring me a sample from each heap. Do not lick them. I am told people need telling.',
    'Tin, mostly. And something else, bright as a struck spark and humming like a kettle. It is not ore. I do not know what it is, and that is not a sentence an assayer likes to say.',
    [pick('lr_spoil_heap', 5, 'Ore sample taken from a spoil heap', 'lr_ore_sample')],
    { shareable: false },
  ),
  lr_26_the_humming_stones: quest(
    'lr_26_the_humming_stones',
    'The Humming Stones',
    15,
    'medium',
    LR_ASSAYER,
    LR_ASSAYER,
    'gilt_measure',
    'The hum in those samples leads to the Stannary Stones, west of camp. Living stone walks there now, tin and quartz grown legs, and it hums the same note. Break a few apart and bring me the cores. Carefully. I want to know what is singing.',
    'Hold one to your ear. That hum is a hearth, $N. A hearth with no fire, pulled up out of the ground and left to walk. Someone is drawing the old fires out of this country, and the stones are what is left over.',
    [
      kill('tinstone_elemental', 6, 'Tinstone Elemental broken'),
      collect('lr_humming_tinstone', 4, 'Humming Tinstone'),
    ],
    { requiresQuest: 'lr_25_assay_samples' },
  ),
  lr_27_who_opened_the_blackadit: quest(
    'lr_27_who_opened_the_blackadit',
    'Who Opened the Blackadit',
    15,
    'medium',
    LR_MINE_CAPTAIN,
    LR_MINE_CAPTAIN,
    'gilt_measure',
    'The Blackadit was sealed before my grandfather was born. It floods, it falls in and it eats lamps. Now a crew in pale coats has opened it and set the tunnelers to work for them. They are the Pale Accord, the same crew Coinwell chased off the chalk. Drive them out of my moor.',
    'They fought like people with somewhere to be. Whatever they are digging for, they think it is worth more than tin. That frightens me more than they did.',
    [kill('pale_accord_delver', 10, 'Pale Accord Delver defeated')],
    { requiresQuest: 'lr_24_stolen_lamps' },
  ),
  lr_28_orders_in_pale_ink: quest(
    'lr_28_orders_in_pale_ink',
    'Orders in Pale Ink',
    15,
    'large',
    LR_MINE_CAPTAIN,
    LR_MINE_CAPTAIN,
    'gilt_measure',
    'A crew that organized carries orders. Find them. I want to know who signs for salt from Panwick, firebrands from the wold and the old fires from under my moor, and I want it in their own hand.',
    "Salt to keep the deep workings dry, charcoal to keep them lit, and the hearths under the moor drawn up and sent on in sealed carts. No name at the bottom, only that pale sigil. This is bigger than one mine, $N. I will send copies to Panwick, Elmhallow and the Gilt Measure's own house before the week is out.",
    [collect('lr_pale_ink_orders', 1, 'Orders in Pale Ink')],
    { requiresQuest: 'lr_27_who_opened_the_blackadit' },
  ),
  lr_29_shore_up_the_blackadit: quest(
    'lr_29_shore_up_the_blackadit',
    'Shore Up the Blackadit',
    15,
    'medium',
    LR_MINE_CAPTAIN,
    LR_MINE_CAPTAIN,
    'gilt_measure',
    'I cannot seal a mine my grandfather could not, but I can make it too much trouble to use. Take these pit props down to the three workings the Accord opened round the Blackadit and brace them shut. Nobody gets through a braced working without a week of work and a great deal of noise, and my lads will be listening.',
    'Three workings braced and my lads posted on the spoil heaps. The Accord will be back, but they will have to knock first. Wheal Patience will not forget it, $N. Neither will I.',
    [
      useOn('lr_blackadit_mouth', 3, 'Blackadit working braced shut', 'lr_pit_prop', {
        keepsUsedItem: true,
      }),
    ],
    {
      requiresQuest: 'lr_28_orders_in_pale_ink',
      requiredItems: ['lr_pit_prop'],
      shareable: false,
    },
  ),
};

/** The Low Reaches bundle (chapter_two_bundles.ts merges it when the zones are live). */
export const CHAPTER_TWO_LOW_REACHES: ChapterTwoBundle = Object.freeze({
  zoneIds: CHAPTER_TWO_LOW_REACHES_ZONE_IDS,
  items: ITEMS,
  mobs: MOBS,
  npcs: NPCS,
  quests: QUESTS,
  camps: CAMPS,
  objects: OBJECTS,
  escorts: ESCORTS,
});
