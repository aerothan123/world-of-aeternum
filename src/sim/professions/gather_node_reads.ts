// The per-viewer gather-node READS behind IWorldProfessions (nodeHarvestableByMe
// / nodeRespawnSeconds), moved out of the sim.ts coordinator (the monolith
// ratchet) when tree chopping gave them a second arm. Two kinds of node answer
// here:
//   * a content node (ore vein, herb patch): the per-PLAYER respawn timer
//     (gathering.ts isNodeHarvestableBy / nodeRespawnRemainingSec), with
//     existence checked through node_persist's O(1) live-id map because this
//     read runs on the tooltip path;
//   * a tree (`tree:<id>`, src/sim/trees/): the WORLD felled state. A tree is
//     harvestable while it stands, and its "respawn" is its regrow countdown,
//     the same for every viewer.
// Pure reads: no rng, no mutation.

import type { SimContext } from '../sim_context';
import { isTreeFelled, treeRegrowSecondsLeft } from '../trees/tree_felling';
import { choppableTreeByNodeId } from '../trees/tree_registry';
import { isNodeHarvestableBy, nodeRespawnRemainingSec } from './gathering';
import { isLiveGatherNodeId } from './node_persist';

/** Whether `pid` may work `nodeId` right now (false for an unknown id). */
export function nodeHarvestableFor(ctx: SimContext, nodeId: string, pid: number): boolean {
  const meta = ctx.players.get(pid);
  if (!meta) return false;
  if (isLiveGatherNodeId(nodeId)) return isNodeHarvestableBy(meta, nodeId, ctx.time);
  const tree = choppableTreeByNodeId(ctx.cfg.seed, nodeId);
  return tree !== null && !isTreeFelled(ctx.treeFells, tree.id);
}

/** Seconds until `pid` may work `nodeId` again, or null when ready or unknown. */
export function nodeRespawnSecondsFor(ctx: SimContext, nodeId: string, pid: number): number | null {
  const meta = ctx.players.get(pid);
  if (!meta) return null;
  if (isLiveGatherNodeId(nodeId)) return nodeRespawnRemainingSec(meta, nodeId, ctx.time);
  const tree = choppableTreeByNodeId(ctx.cfg.seed, nodeId);
  return tree === null ? null : treeRegrowSecondsLeft(ctx.treeFells, tree.id, ctx.time);
}
