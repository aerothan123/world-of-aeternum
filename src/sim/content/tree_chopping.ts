// Tree chopping content (docs/design/tree-chopping.md): every overworld scatter
// tree ('tree' / 'tree2' decorations, sim/world.ts generateDecorations) is a
// Logging source, replacing the retired wood-stand nodes. DATA-AS-CODE only:
// the mechanics live in src/sim/trees/ and src/sim/professions/gathering.ts.
//
// Tier mix per zone. Each row is the tier makeup of the wood stands the zone
// carried before trees replaced them (the retired GATHER_NODES wood rows), as
// relative weights for tiers 1, 2 and 3. A tree's tier is picked from its
// zone's row by a stable hash of the tree's own id, so the forest keeps the
// same tier ladder the stands taught: Eastbrook all tier 1, Mirefen two thirds
// tier 1 and one third tier 2, Thornpeak an even three-way split (its tier-3
// trees are what finish the Logging climb to 100). A zone with no row (the
// tutorial island, a Studio map's zones) grows tier-1 trees only.
//
// The tree's yield is the zone's existing wood material (NODE_MATERIAL_TABLE
// wood rows, unchanged), and its content level is the ceil of the zone's
// levelRange midpoint, the same snapshot rule every gather node followed.

/** Relative weights for tree tiers 1, 2 and 3 in one zone. */
export type TreeTierWeights = readonly [number, number, number];

export const TREE_TIER_WEIGHTS_BY_ZONE: Readonly<Record<string, TreeTierWeights>> = Object.freeze({
  eastbrook_vale: [1, 0, 0],
  mirefen_marsh: [2, 1, 0],
  thornpeak_heights: [1, 1, 1],
});

/** The zones whose forests the material tables name as Logging sources (every
 *  zone the retired wood stands stood in, the same set NODE_MATERIAL_TABLE's
 *  wood rows cover). Trees grow elsewhere too (the tutorial island) and chop
 *  the same way; this list is what the source readouts (item tooltips, the
 *  material-grade ladder) report. */
export const TREE_SOURCE_ZONE_IDS: readonly string[] = Object.freeze([
  'eastbrook_vale',
  'mirefen_marsh',
  'thornpeak_heights',
  'veiled_hollow',
  'drakelands',
  'frostveil',
  'amberfall',
  'willowfen',
  'nightbloom',
  'wraithwood',
  'galecrest',
  'palmreach',
  'evergarden',
  'farshore_isle',
]);

/** Zones whose trees are scenery only: the Proving Shore (the tutorial island)
 *  is professions-free by design (the R37 rollout row 'none', pinned by
 *  tests/professions_zone_rollout.test.ts), so its forest is never choppable. */
export const TREE_FREE_ZONE_IDS: readonly string[] = Object.freeze(['proving_shore']);

/** The tiers a zone's trees come in (every tier with a positive weight). */
export function treeTiersInZone(zoneId: string): readonly number[] {
  const weights = TREE_TIER_WEIGHTS_BY_ZONE[zoneId] ?? DEFAULT_TREE_TIER_WEIGHTS;
  const tiers: number[] = [];
  for (let t = 0; t < 3; t++) if (weights[t] > 0) tiers.push(t + 1);
  return tiers;
}

/** The tier mix for a zone with no row of its own. */
export const DEFAULT_TREE_TIER_WEIGHTS: TreeTierWeights = [1, 0, 0];

/** Sim seconds a felled tree stays down before it regrows (five minutes). */
export const TREE_REGROW_SECONDS = 300;

/** One axe swing, in sim seconds: the chop cast is a whole number of swings. */
export const TREE_CHOP_SWING_SECONDS = 1;

/** Swing bounds: a tier-1 tree starts at four swings, tier 3 at six, and a
 *  better axe or a higher Logging band takes swings off down to the floor. */
export const TREE_CHOP_MIN_SWINGS = 3;
export const TREE_CHOP_MAX_SWINGS = 6;

/** Trees within this many yards beyond a zone hub's own radius stay standing:
 *  they are the town's backdrop, and a deforested square reads as a bug. */
export const TOWN_TREE_CLEARANCE = 20;

/** The same protection round a painted town's buildings (sim/painted_towns/). */
export const PAINTED_TOWN_TREE_PAD = 10;

/** How far round a player the server reports felled trees (yards): the
 *  server's `ftr` readout and the client mirror's coverage rule share it. */
export const FELLED_TREE_WIRE_RADIUS = 200;
