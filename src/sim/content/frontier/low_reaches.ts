// The Low Reaches: the second frontier row, three zone cells south of the
// Southern Reaches (z -900..-540), shaped by src/sim/frontier/ (terrain +
// layout). Run east to west by level, so the row is an alternative 11 to 15
// road beside the Thornpeak climb:
//
//   The Saltmeads (11 to 13): salt marsh and pan villages on a grey downs
//     coast, entered over the Saltmeads gate off the Applewold's south downs.
//     The Hearthwright Compact's pan-town of Panwick boils brine for half the
//     south, and the tides have started bringing in more than salt.
//   The Wychwold (12 to 14): an old elm wold of charcoal burners, held by a
//     Bracken Circle lodge at Elmhallow around the Knotted Elm.
//   The Tinmarch (13 to 15): tin moor and spoil heaps, where the Gilt
//     Measure's mine at Wheal Patience works beside the Stannary Stones and a
//     Pale Accord crew has opened the old Blackadit. Also reached by the
//     Chalkbarrow pass down from Wreckers' Cove, so the Chalkbarrow road at
//     13 runs straight on south.
//
// The Tinmarch's west ford leads on into the West March (./west_march.ts).
// Creatures reuse shipped rigs and templates at camp-level ranges
// (CampDef.levelMin/Max); the quests that will live here belong to the story
// crew, and every hub keeps room for a quest board and five givers
// (frontier/hub_plots.ts).
//
// Append-only rule: merged LAST in data.ts after the Southern Reaches
// (rng-stream stability, positional poi locale rows); add new entries at the
// end of each list, never in the middle.

import { FRONTIER_ANCHORS as A, FRONTIER_LAKES } from '../../frontier/layout';
import type { CampDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';

const lake = (i: number) => ({ ...FRONTIER_LAKES[i] });

/** An offStream frontier camp (every frontier camp draws from its own stream). */
export const frontierCamp = (
  mobId: string,
  x: number,
  z: number,
  radius: number,
  count: number,
  levelMin: number,
  levelMax: number,
): CampDef => ({ mobId, center: { x, z }, radius, count, levelMin, levelMax, offStream: true });

export const SALTMEADS_ZONE: ZoneDef = {
  id: 'saltmeads',
  name: 'The Saltmeads',
  openBorders: true,
  zMin: -900,
  zMax: -540,
  xMin: 180,
  xMax: 540,
  levelRange: [11, 13],
  biome: 'gale',
  hub: { x: A.panwick.x, z: A.panwick.z, radius: 15, name: 'Panwick' },
  graveyard: { x: A.panwickYard.x, z: A.panwickYard.z },
  lakes: [lake(3)],
  pois: [
    { x: A.panwick.x, z: A.panwick.z, label: 'Panwick', id: 'panwick' },
    { x: A.brinePans.x, z: A.brinePans.z, label: 'The Brine Pans', id: 'the_brine_pans' },
    { x: A.gannetStack.x, z: A.gannetStack.z, label: 'Gannet Stack', id: 'gannet_stack' },
    {
      x: A.wrackShallows.x,
      z: A.wrackShallows.z,
      label: 'The Wrack Shallows',
      id: 'the_wrack_shallows',
    },
    {
      x: A.saltmeadsGate.x,
      z: A.saltmeadsGate.z,
      label: 'The Saltmeads Gate',
      id: 'saltmeads_gate',
    },
  ],
  welcome:
    'Grey water, white pans and the smell of brine. Panwick boils salt for half the south, but lately the tide brings in more than weed, and the gannets will not land on the stack.',
};

export const WYCHWOLD_ZONE: ZoneDef = {
  id: 'wychwold',
  name: 'The Wychwold',
  openBorders: true,
  zMin: -900,
  zMax: -540,
  xMin: -180,
  xMax: 180,
  levelRange: [12, 14],
  biome: 'vale',
  hub: { x: A.elmhallow.x, z: A.elmhallow.z, radius: 15, name: 'Elmhallow' },
  graveyard: { x: A.elmhallowYard.x, z: A.elmhallowYard.z },
  lakes: [],
  pois: [
    { x: A.elmhallow.x, z: A.elmhallow.z, label: 'Elmhallow', id: 'elmhallow' },
    { x: A.knottedElm.x, z: A.knottedElm.z, label: 'The Knotted Elm', id: 'the_knotted_elm' },
    {
      x: A.charcoalHollow.x,
      z: A.charcoalHollow.z,
      label: 'Charcoal Hollow',
      id: 'charcoal_hollow',
    },
    { x: A.sunkLane.x, z: A.sunkLane.z, label: 'The Sunk Lane', id: 'the_sunk_lane' },
    { x: A.saltWay.x, z: A.saltWay.z, label: 'The Salt Way', id: 'the_salt_way' },
  ],
  welcome:
    'The Wychwold was old before the Hearthbinding. The charcoal burners still work its hollows, the Bracken Circle still keeps its oldest elm, and something under the roots has begun to stir.',
};

export const TINMARCH_ZONE: ZoneDef = {
  id: 'tinmarch',
  name: 'The Tinmarch',
  openBorders: true,
  zMin: -900,
  zMax: -540,
  xMin: -540,
  xMax: -180,
  levelRange: [13, 15],
  biome: 'peaks',
  hub: { x: A.whealPatience.x, z: A.whealPatience.z, radius: 15, name: 'Wheal Patience' },
  graveyard: { x: A.whealYard.x, z: A.whealYard.z },
  lakes: [],
  pois: [
    { x: A.whealPatience.x, z: A.whealPatience.z, label: 'Wheal Patience', id: 'wheal_patience' },
    {
      x: A.stannaryStones.x,
      z: A.stannaryStones.z,
      label: 'The Stannary Stones',
      id: 'the_stannary_stones',
    },
    { x: A.blackadit.x, z: A.blackadit.z, label: 'Blackadit', id: 'blackadit' },
    { x: A.tinnersFord.x, z: A.tinnersFord.z, label: "Tinners' Ford", id: 'tinners_ford' },
    { x: A.chalkPass.x, z: A.chalkPass.z, label: 'The Chalk Pass', id: 'the_chalk_pass' },
  ],
  welcome:
    'Tin, spoil and wind. The Gilt Measure keeps Wheal Patience working by lamplight, and the miners swear the old Blackadit was sealed before any of them were born. Someone has opened it.',
};

export const LOW_REACHES_ZONES: ZoneDef[] = [SALTMEADS_ZONE, WYCHWOLD_ZONE, TINMARCH_ZONE];

export const LOW_REACHES_ROADS: { x: number; z: number }[][] = [
  [
    { x: 332, z: -486 },
    { x: 331, z: -530 },
    { x: A.saltmeadsGate.x, z: A.saltmeadsGate.z },
    { x: 332, z: -600 },
    { x: 346, z: -630 },
    { x: A.panwick.x - 6, z: A.panwick.z + 10 },
  ], // the Saltmeads gate: the Applewold's south downs -> Panwick
  [
    { x: A.panwick.x + 12, z: A.panwick.z - 6 },
    { x: 400, z: -676 },
    { x: 428, z: -696 },
  ], // Panwick -> the Brine Pans
  [
    { x: A.panwick.x + 8, z: A.panwick.z - 12 },
    { x: 400, z: -740 },
    { x: 448, z: -786 },
  ], // Panwick -> Gannet Stack
  [
    { x: A.panwick.x - 14, z: A.panwick.z - 4 },
    { x: 300, z: -700 },
    { x: 262, z: -720 },
    { x: 222, z: -728 },
    { x: A.saltWay.x, z: A.saltWay.z },
    { x: 140, z: -720 },
    { x: 92, z: -704 },
    { x: A.elmhallow.x + 14, z: A.elmhallow.z },
  ], // the Salt Way: Panwick -> west over the salt way -> Elmhallow
  [
    { x: 262, z: -720 },
    { x: 258, z: -752 },
    { x: A.wrackShallows.x + 4, z: A.wrackShallows.z + 10 },
  ], // the Salt Way -> the Wrack Shallows
  [
    { x: A.elmhallow.x - 10, z: A.elmhallow.z - 10 },
    { x: 0, z: -730 },
    { x: -44, z: -756 },
  ], // Elmhallow -> the Knotted Elm
  [
    { x: A.elmhallow.x + 10, z: A.elmhallow.z - 12 },
    { x: 70, z: -746 },
    { x: 90, z: -788 },
  ], // Elmhallow -> Charcoal Hollow
  [
    { x: A.elmhallow.x - 14, z: A.elmhallow.z + 2 },
    { x: -40, z: -684 },
    { x: A.sunkLane.x, z: A.sunkLane.z },
    { x: -150, z: -704 },
    { x: A.tinnersFord.x, z: A.tinnersFord.z },
    { x: -224, z: -712 },
    { x: -276, z: -690 },
    { x: A.whealPatience.x + 14, z: A.whealPatience.z - 2 },
  ], // the Sunk Lane: Elmhallow -> Tinners' Ford -> Wheal Patience
  [
    { x: -234, z: -474 },
    { x: -238, z: -510 },
    { x: A.chalkPass.x, z: A.chalkPass.z },
    { x: -247, z: -590 },
    { x: -256, z: -640 },
    { x: -290, z: -660 },
    { x: A.whealPatience.x + 12, z: A.whealPatience.z + 8 },
  ], // the Chalk Pass: Wreckers' Cove's east headland -> Wheal Patience
  [
    { x: A.whealPatience.x - 10, z: A.whealPatience.z - 12 },
    { x: -380, z: -720 },
    { x: A.stannaryStones.x + 10, z: A.stannaryStones.z + 10 },
  ], // Wheal Patience -> the Stannary Stones
  [
    { x: A.whealPatience.x + 8, z: A.whealPatience.z - 14 },
    { x: -300, z: -740 },
    { x: -270, z: -790 },
  ], // Wheal Patience -> Blackadit
  [
    { x: A.whealPatience.x - 14, z: A.whealPatience.z + 4 },
    { x: -400, z: -690 },
    { x: -460, z: -720 },
    { x: -510, z: -736 },
    { x: A.rookFord.x, z: A.rookFord.z },
  ], // the Rook Way: Wheal Patience -> west to the Rook Ford (the West March)
];

// Shore scuttlers, deckhands of the drowned and wreck thieves along the salt
// coast; wolves, boars, weavers and the restless dead in the old wold; kobolds,
// rats, storm-touched stone and the Pale Accord's crew at the Blackadit.
export const LOW_REACHES_CAMPS: CampDef[] = [
  // the Saltmeads
  frontierCamp('tide_scuttler', 420, -666, 12, 4, 11, 12),
  frontierCamp('shoal_scuttler', 290, -780, 12, 4, 11, 12),
  frontierCamp('wreck_thief', 300, -756, 11, 3, 11, 12),
  frontierCamp('drowned_deckhand', 456, -760, 12, 4, 12, 13),
  frontierCamp('moor_ram', 392, -812, 13, 3, 12, 13),
  frontierCamp('bog_bloat', 470, -690, 10, 3, 12, 13),
  // the Wychwold
  frontierCamp('forest_wolf', 96, -660, 13, 4, 12, 13),
  frontierCamp('thicket_boar', -20, -640, 13, 4, 12, 13),
  frontierCamp('canopy_weaver', -70, -778, 12, 3, 13, 14),
  frontierCamp('restless_bones', 100, -804, 12, 4, 13, 14),
  frontierCamp('mire_widow', -110, -740, 12, 3, 13, 14),
  // the Tinmarch
  frontierCamp('tunnel_rat', -300, -720, 11, 4, 13, 14),
  frontierCamp('deeprock_kobold', -400, -756, 12, 4, 13, 14),
  frontierCamp('stormcrag_elemental', -456, -780, 13, 2, 14, 15),
  frontierCamp('gravecaller_cultist', -262, -796, 11, 4, 14, 15),
  frontierCamp('ridge_stalker', -360, -616, 13, 3, 14, 15),
];

// Dressing from the shipped prop families only (tents, fires, crates, fences,
// ruin rings, wells, mines, decor GLBs); new landmark models wait for the
// environment crew's style pass.
export const LOW_REACHES_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  tents: [
    // Panwick, the pan-town
    { x: 350, z: -666, rot: 0.6, scale: 1 },
    { x: 376, z: -666, rot: -0.6, scale: 1 },
    { x: 362, z: -640, rot: 3.1, scale: 1.1 },
    // Elmhallow, the Bracken Circle's lodge
    { x: 22, z: -702, rot: 0.7, scale: 1 },
    { x: 46, z: -704, rot: -0.7, scale: 0.9 },
    { x: 34, z: -678, rot: 3.0, scale: 1 },
    // Wheal Patience, the Gilt Measure's mine camp
    { x: -342, z: -682, rot: 0.5, scale: 1.1 },
    { x: -318, z: -682, rot: -0.5, scale: 1 },
    { x: -330, z: -656, rot: 3.1, scale: 1 },
    // the Pale Accord's crew at the Blackadit
    { x: -276, z: -812, rot: 0.9, scale: 0.9 },
  ],
  campfires: [
    [362, -652],
    [34, -690],
    [-330, -668],
    [-262, -800],
    [100, -800],
  ],
  crates: [
    [372, -646, 0.4],
    [352, -646, 1.2],
    // Panwick's salt store, sacks stacked against the weather
    [386, -652, 2],
    [389.5, -650, 0.8],
    [-320, -660, 0.7],
    [-340, -660, 1.9],
    [-256, -812, 0.5],
  ],
  wells: [{ x: 368, z: -660, r: 1.4 }],
  mines: [{ x: -262, z: -812, rot: 0.2 }],
  ruinRings: [
    // the Stannary Stones: where the tinners once weighed and sealed the tin
    { x: A.stannaryStones.x, z: A.stannaryStones.z, ringR: 8, columns: 8, omit: [3, 6] },
    // the Knotted Elm's old ring of hearth stones
    { x: A.knottedElm.x, z: A.knottedElm.z, ringR: 7, columns: 7, omit: [1, 4], bare: true },
    // the charcoal burners' stone ring in Charcoal Hollow
    { x: 80.5, z: -791, ringR: 6, columns: 6, omit: [2] },
  ],
  fences: [
    // Panwick's pan rails
    { x1: 380, z1: -640, x2: 400, z2: -640 },
    // the Blackadit's spoil palisade
    { x1: -286, z1: -800, x2: -276, z2: -790, kind: 'palisade' },
  ],
  graveyards: [
    { x: A.panwickYard.x, z: A.panwickYard.z },
    { x: A.elmhallowYard.x, z: A.elmhallowYard.z },
    { x: A.whealYard.x, z: A.whealYard.z },
  ],
  decorProps: [
    // the Wrack Shallows
    { key: 'rowboat', x: 268, z: -778, rot: 2.4 },
    { key: 'wq_broken_planks', x: 280, z: -776, rot: 0.6 },
    { key: 'wq_waterlogged_barrel', x: 266, z: -768, rot: 1.4 },
    // the Pale Accord at the Blackadit
    { key: 'hanging_cage', x: -268, z: -818, rot: 0.3 },
    { key: 'bone_pile', x: -250, z: -804, rot: 1.1 },
    { key: 'wq_damaged_crate', x: -282, z: -806, rot: 2.0 },
    // the Brine Pans' wind pump, lifting the sea into the pans
    { key: 'hexWindmill', x: 419.5, z: -700.5, rot: 0.6, scale: 8, r: 4.5, h: 12 },
    // Wheal Patience's engine house stack, the Tinmarch's tallest mark
    { key: 'hexTower', x: -311.5, z: -652.5, rot: 0.4, scale: 7, r: 3.5, h: 15 },
  ],
};
