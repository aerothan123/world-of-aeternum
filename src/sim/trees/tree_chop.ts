// Tree chop pacing and access, pure (no SimContext, no rng): how many axe
// swings a tree takes and which axe tier it asks for. The gather cast that
// chops a tree (professions/gathering.ts harvestNode) runs for exactly
// `swings * TREE_CHOP_SWING_SECONDS`; the renderer plays one swing and one
// axe-hit cue per TREE_CHOP_SWING_SECONDS of it.

import {
  TREE_CHOP_MAX_SWINGS,
  TREE_CHOP_MIN_SWINGS,
  TREE_CHOP_SWING_SECONDS,
} from '../content/tree_chopping';

/**
 * Swings to fell a tree: three plus its tier (a tier-1 tree four, tier 3 six),
 * minus one per WIELDABLE axe tier above the tree's tier, minus the Logging
 * proficiency band (0, 1 or 2), clamped to [TREE_CHOP_MIN_SWINGS,
 * TREE_CHOP_MAX_SWINGS]. Holding exactly the needed axe buys nothing, the same
 * rule the node cast follows (gathering.ts gatherCastDurationSec).
 */
export function treeChopSwings(treeTier: number, wieldableTier: number, band: 0 | 1 | 2): number {
  const raw = 3 + treeTier - Math.max(0, wieldableTier - treeTier) - band;
  return Math.max(TREE_CHOP_MIN_SWINGS, Math.min(TREE_CHOP_MAX_SWINGS, raw));
}

/** The chop cast length in seconds (whole swings). */
export function treeChopSeconds(treeTier: number, wieldableTier: number, band: 0 | 1 | 2): number {
  return treeChopSwings(treeTier, wieldableTier, band) * TREE_CHOP_SWING_SECONDS;
}

/**
 * The axe tier a tree asks for: an axe EQUIPPED in the logging tool slot of
 * at least the tree's tier (never below tier 1), exactly as wood stands did,
 * including the R22 wield requirement on the axe. Tier-1 trees used to need
 * no axe at all; since the tool belt (professions/gather_tool_slots.ts) every
 * character starts with the basic handaxe equipped, so the starting forest is
 * still open to a brand new character and every tree follows the node rule.
 */
export function treeRequiredToolTier(treeTier: number): number {
  return Math.max(1, treeTier);
}
