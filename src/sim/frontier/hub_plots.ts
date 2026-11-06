// Room for the quest crew at every frontier settlement: one quest-board spot
// and five giver spots per hub, on the hub's level pad, clear of the tents,
// fires, crates, wells, fences, graveyards and standing stones the content
// files place there. The story and quest-board crews put their NPCs and the
// board on these points (or move one, keeping tests/frontier_hub_plots.test.ts
// green), so a hub never fills up with props first and leaves its givers
// standing in a tent.
//
// Plain data: positions in world yards, picked on the shipped seed by a sweep
// of rings round each hub's anchor (dry, within half a yard of the pad height,
// spaced 6.5yd apart, 4yd at the two small sites) and pinned by the test. The
// first entry of each hub's list is the board. Pure leaf.

export interface HubPlots {
  /** The settlement's POI id. */
  id: string;
  /** The zone it stands in. */
  zoneId: string;
  /** The anchor name in FRONTIER_ANCHORS the pad is centered on. */
  anchor: string;
  board: { x: number; z: number };
  givers: readonly { x: number; z: number }[];
}

const p = (x: number, z: number) => ({ x, z });

export const FRONTIER_HUB_PLOTS: readonly HubPlots[] = [
  {
    id: 'pressford',
    zoneId: 'applewold',
    anchor: 'pressford',
    board: p(341, -318),
    givers: [
      p(336.5, -310.2),
      p(329.2, -309.4),
      p(323.8, -314.3),
      p(323.8, -321.7),
      p(329.2, -326.6),
    ],
  },
  {
    id: 'causeway_watch',
    zoneId: 'applewold',
    anchor: 'wardenPost',
    board: p(376.5, -262),
    givers: [
      p(374.3, -258.1),
      p(367.6, -262.9),
      p(370.6, -266.3),
      p(370, -255.8),
      p(375.3, -267.6),
    ],
  },
  {
    id: 'ferncross',
    zoneId: 'kindlemoor',
    anchor: 'ferncross',
    board: p(41, -318),
    givers: [p(38, -311.3), p(29.2, -309.4), p(23.8, -314.3), p(23.8, -321.7), p(29.2, -326.6)],
  },
  {
    id: 'the_first_hearth_ring',
    zoneId: 'kindlemoor',
    anchor: 'firstHearthRing',
    board: p(-42.5, -405),
    givers: [
      p(-44.3, -400.9),
      p(-48.6, -399.5),
      p(-52.4, -401.8),
      p(-53.4, -406.1),
      p(-50.8, -409.8),
    ],
  },
  {
    id: 'coinwell_camp',
    zoneId: 'chalkbarrow_coast',
    anchor: 'coinwell',
    board: p(-309, -336),
    givers: [
      p(-312, -329.3),
      p(-322.5, -328.2),
      p(-326.8, -334.1),
      p(-325.3, -341.3),
      p(-318.9, -345),
    ],
  },
  {
    id: 'panwick',
    zoneId: 'saltmeads',
    anchor: 'panwick',
    board: p(371, -652),
    givers: [p(368, -645.3), p(357.5, -644.2), p(353.2, -650.1), p(354.7, -657.3), p(361.1, -661)],
  },
  {
    id: 'elmhallow',
    zoneId: 'wychwold',
    anchor: 'elmhallow',
    board: p(43, -690),
    givers: [p(40, -683.3), p(29.5, -682.2), p(25.2, -688.1), p(26.7, -695.3), p(33.1, -699)],
  },
  {
    id: 'wheal_patience',
    zoneId: 'tinmarch',
    anchor: 'whealPatience',
    board: p(-321, -668),
    givers: [
      p(-324, -661.3),
      p(-334.5, -660.2),
      p(-338.8, -666.1),
      p(-337.3, -673.3),
      p(-330.9, -677),
    ],
  },
  {
    id: 'kestrel_point',
    zoneId: 'rookcliffs',
    anchor: 'kestrelPoint',
    board: p(-695, -664),
    givers: [
      p(-698, -657.3),
      p(-704.9, -655),
      p(-711.3, -658.7),
      p(-712.8, -665.9),
      p(-708.5, -671.8),
    ],
  },
  {
    id: 'withyholt',
    zoneId: 'sedgemarch',
    anchor: 'withyholt',
    board: p(-683, -336),
    givers: [
      p(-686, -329.3),
      p(-692.9, -327),
      p(-699.3, -330.7),
      p(-700.8, -337.9),
      p(-696.5, -343.8),
    ],
  },
  {
    id: 'fellgate',
    zoneId: 'harrowfells',
    anchor: 'fellgate',
    board: p(-725, -34),
    givers: [p(-728, -27.3), p(-734.9, -25), p(-741.3, -28.7), p(-742.8, -35.9), p(-738.5, -41.8)],
  },
  {
    id: 'lanternfold',
    zoneId: 'wardmere',
    anchor: 'lanternfold',
    board: p(-733, 326),
    givers: [p(-736, 332.7), p(-742.9, 335), p(-749.3, 331.3), p(-750.8, 324.1), p(-746.5, 318.2)],
  },
];
