// Client-side gathering-tool item use (#2343): pressing the EQUIPPED
// pick/axe/sickle on the hotbar behaves like the interact press, scoped to the
// tool's own profession; clicking a tool that sits in the bags equips it
// instead (the plain useItem path, answered by the sim's tool belt). These pure helpers pick the node; the
// main.ts hook composes them with handleGatherNodeInteract (the localized
// error surface + world.harvestNode dispatch) wrapped in
// stopAutorunForInteraction, so the bag click honors the #1982 autorun-stop
// contract exactly like the F key and the node click. Fishing tools never
// resolve here (their item use routes to startFishing at the sim boundary),
// and the server stays authoritative: whichever node the client picks is
// re-validated by the sim's own harvestNode gates.

import type { GatheringProfessionId } from '../sim/content/professions';
import { gatherNodesInActiveWorld } from '../sim/data';
import { NODE_TYPE_BY_PROFESSION } from '../sim/professions/gathering';
import { isGatherToolUse } from '../sim/professions/tools';
import { choppableTreesNear } from '../sim/trees/tree_registry';
import { type GatherNodeDef, INTERACT_RANGE, type ItemDef } from '../sim/types';
import type { IWorld } from '../world_api';

/** The node profession a clicked tool gathers for, or null when the item is
 *  not a node-gathering tool OR is not the tool EQUIPPED in its slot (the
 *  tool belt, src/sim/professions/gather_tool_slots.ts): a bagged tool falls
 *  back to the plain useItem path, which the sim answers by equipping it, and
 *  fishing implements fall back too (they cast at the sim boundary). */
export function gatherToolProfessionFor(
  item: ItemDef,
  world: Pick<IWorld, 'gatherToolSlots'>,
): GatheringProfessionId | null {
  const use = item.use;
  if (!isGatherToolUse(use)) return null;
  if (world.gatherToolSlots[use.professionId]?.itemId !== item.id) return null;
  return use.professionId in NODE_TYPE_BY_PROFESSION ? use.professionId : null;
}

/** The node a tool click should work: the nearest matching-type node within
 *  interact range, preferring one that is ready for this viewer over one
 *  still respawning (ties resolve by distance). Mirrors the sim-side
 *  useGatherToolItem selection policy; the sim re-validates whichever id is
 *  sent, so the mirror is a UX nicety, never an authority. */
export function nearestGatherNodeForProfession(
  world: Pick<IWorld, 'player' | 'nodeHarvestableByMe'> &
    Partial<Pick<IWorld, 'cfg' | 'felledTrees'>>,
  professionId: GatheringProfessionId,
): GatherNodeDef | null {
  const nodeType = NODE_TYPE_BY_PROFESSION[professionId];
  if (!nodeType) return null;
  const p = world.player;
  let best: GatherNodeDef | null = null;
  let bestDist = Infinity;
  let bestReady = false;
  // An axe works the standing trees in reach (src/sim/trees/), the sim's own
  // useGatherToolItem arm; one decoration-window query per click.
  const candidates: GatherNodeDef[] = [...gatherNodesInActiveWorld()];
  if (nodeType === 'wood' && world.cfg) {
    const felled = world.felledTrees?.().trees;
    for (const tree of choppableTreesNear(world.cfg.seed, p.pos.x, p.pos.z, INTERACT_RANGE)) {
      if (!felled?.has(tree.id)) candidates.push(tree.node);
    }
  }
  for (const node of candidates) {
    if (node.type !== nodeType) continue;
    const dx = p.pos.x - node.pos.x;
    const dz = p.pos.z - node.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > INTERACT_RANGE) continue;
    const ready = world.nodeHarvestableByMe(node.id);
    if (ready !== bestReady) {
      if (!ready) continue;
      best = node;
      bestDist = d;
      bestReady = true;
    } else if (d < bestDist) {
      best = node;
      bestDist = d;
    }
  }
  return best;
}
