// The tree Chop prompt's decision: which standing tree, if any, a press of
// Interact would start chopping right now, and where its world-anchored
// "F Chop" chip stands. Pure (no DOM, no renderer), registered in
// UI_PURE_CORES (tests/architecture.test.ts); driven by
// tests/chop_prompt_core.test.ts.
//
// The prompt can never name a tree the press would not chop, because it asks
// the press's own resolver (nearby_interaction_core.ts
// resolveNearbyInteractionCandidate) over the press's own node list
// (interact_key_gather.ts interactKeyNodes: the static veins plus every
// STANDING choppable tree in reach). So an npc, a lootable corpse, a ground
// object, an escort start or a nearer vein in range wins exactly as it wins
// the press, a felled tree or a town tree never appears (the node list never
// holds one), and the tree named is the nearest one F picks.
//
// On top of the candidate it hides wherever the sim's harvestNode would
// refuse before range is even read (dead, in combat, swimming, busy casting
// or consuming, an action-locked shapeshift, the Gaol Turnkey's cage, which
// turns every press into an escape press), and while a chop is in progress
// (the chop IS a cast, so the busy gate covers it). A tool shortfall
// ("Requires a better axe") still shows the chip: the shared affordance has
// no disabled state, so the press answers with the existing node line.

import { isActionLockingFormAuraKind } from '../sim/combat/forms';
import { TURNKEY_CAGED } from '../sim/encounters/sunken_bastion/ids';
import { isSwimming } from '../sim/player_motion';
import { parseTreeNodeId } from '../sim/trees/tree_registry';
import { type Entity, isConsuming } from '../sim/types';
import { groundHeight } from '../sim/world';
import {
  type NearbyGatherNode,
  type NearbyInteractionScanWorld,
  resolveNearbyInteractionCandidate,
} from './nearby_interaction_core';

/** Yards above the terrain at the trunk where the chip anchors: about the
 *  height of a standing character's head, which puts it on the trunk below
 *  the canopy and in the middle of the default chase camera's view. */
export const CHOP_PROMPT_LIFT = 2.4;

/** Where the chip stands: the tree's gather-node id and the world anchor. */
export interface ChopPromptTarget {
  nodeId: string;
  x: number;
  y: number;
  z: number;
}

/** The scan slice: the press's own world slice plus the seed (terrain height,
 *  the swim test) and the per-viewer readiness read. IWorld satisfies it. */
export interface ChopPromptWorld extends NearbyInteractionScanWorld {
  cfg: { seed: number };
  nodeHarvestableByMe(nodeId: string): boolean;
}

/** The player fields the cheap per-frame gate reads. */
export type ChopPromptPlayer = Pick<
  Entity,
  'dead' | 'inCombat' | 'castingAbility' | 'eating' | 'drinking' | 'auras'
>;

/** The refusals that can flip between two polls (a cast starting, combat,
 *  death, a drink): cheap enough to test every frame, so the chip goes away
 *  on the frame the chop begins rather than up to a poll later. */
export function chopPromptPlayerBlocked(p: ChopPromptPlayer): boolean {
  if (p.dead || p.inCombat || p.castingAbility || isConsuming(p)) return true;
  for (const a of p.auras) {
    if (a.id === TURNKEY_CAGED || isActionLockingFormAuraKind(a.kind)) return true;
  }
  return false;
}

/**
 * Resolve the tree a press would chop now, writing it into `out`. Returns
 * false (and leaves `out` untouched) when the press would do anything else,
 * or nothing: a different candidate, no tree in reach, or a refusal state.
 * `nodes` must be the press's own list (interactKeyNodes).
 */
export function resolveChopPromptTarget(
  world: ChopPromptWorld,
  nodes: readonly NearbyGatherNode[],
  out: ChopPromptTarget,
): boolean {
  const p = world.player;
  if (chopPromptPlayerBlocked(p)) return false;
  const seed = world.cfg.seed;
  if (isSwimming(p, seed)) return false;
  // The keyboard press's exact call: reliable harvest state, no preferred npc.
  const candidate = resolveNearbyInteractionCandidate(world, true, null, nodes);
  if (candidate?.kind !== 'node') return false;
  if (parseTreeNodeId(candidate.id) === null) return false;
  // A tree felled since the node list was built (the mirror moved first).
  if (!world.nodeHarvestableByMe(candidate.id)) return false;
  const { x, z } = candidate.node.pos;
  out.nodeId = candidate.id;
  out.x = x;
  out.z = z;
  out.y = groundHeight(x, z, seed) + CHOP_PROMPT_LIFT;
  return true;
}
