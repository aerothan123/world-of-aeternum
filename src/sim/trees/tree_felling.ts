// Felled-tree state behind the SimContext seam: which overworld trees are down
// right now, when each regrows, and the fell / regrow transitions. The backing
// object lives on Sim (`treeFells`, a live ctx view); this module holds the
// functions. TRANSIENT by design: a server restart regrows the forest, so the
// state is never serialized (docs/design/tree-chopping.md).
//
// Cost shape (server/CLAUDE.md "Hot paths"): the set holds only trees felled in
// the last TREE_REGROW_SECONDS, so it is bounded by recent chopping, never by
// realm age. Regrowth pops a FIFO queue (every fell regrows after the same
// constant delay, so fell order IS regrow order): the per-tick check is one
// head comparison, never a scan of the felled set or of the world's trees.
// `rev` bumps on every fell and regrow; the server's per-viewer readout and
// the renderer diff against it. Draws ZERO rng anywhere.

import { TREE_REGROW_SECONDS } from '../content/tree_chopping';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { type Entity, TREE_CHOP_CAST_ID } from '../types';
import { clearFelledTreeBodies, setTreeBodyFelled } from './tree_fell_collision';
import { type ChoppableTree, treeBodyKey, treeNodeId } from './tree_registry';

/** One felled tree as both worlds expose it (IWorld `felledTrees`). */
export interface FelledTree {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** World (sim) time, in seconds, at which the tree stands again. */
  readonly regrowAt: number;
}

/** The read view: the felled set plus its change counter. */
export interface FelledTreesView {
  readonly rev: number;
  readonly trees: ReadonlyMap<number, FelledTree>;
}

/** The Sim-owned backing state (a superset of the read view). */
export interface TreeFellState extends FelledTreesView {
  rev: number;
  readonly trees: Map<number, FelledTree>;
  /** Tree ids in fell order; `head` is the next one due to regrow. */
  readonly queue: number[];
  head: number;
}

/** A fresh, empty forest state. Also clears the process-wide collision view,
 *  so a newly constructed world never inherits another world's stumps. */
export function createTreeFellState(): TreeFellState {
  clearFelledTreeBodies();
  return { rev: 0, trees: new Map(), queue: [], head: 0 };
}

/** Whether the tree is felled in this world right now. */
export function isTreeFelled(state: FelledTreesView, id: number): boolean {
  return state.trees.has(id);
}

/**
 * The horizontal direction a tree falls when `feller` lands the last swing:
 * straight away from them, as a yaw where the fall heads along
 * (sin(yaw), cos(yaw)) in world x/z. A feller standing on the trunk centre (no
 * direction) fells it along +z.
 */
export function treeFallYaw(tree: { x: number; z: number }, feller: { x: number; z: number }) {
  const dx = tree.x - feller.x;
  const dz = tree.z - feller.z;
  if (dx * dx + dz * dz < 1e-6) return 0;
  return Math.atan2(dx, dz);
}

/**
 * Fell `tree`: record it with its regrow time, open its collider, announce the
 * fall to everyone in event range (`treeFelled`, anchored at the trunk), mark
 * the feller's first-felling deed, and stop every OTHER player still swinging
 * at it (first to finish fells it; the rest get the felled line, not a wasted
 * swing count). Called by the gather completion after the yield landed.
 */
export function fellTree(
  ctx: SimContext,
  tree: ChoppableTree,
  feller: Entity,
  meta: PlayerMeta,
): void {
  const state = ctx.treeFells;
  if (state.trees.has(tree.id)) return;
  state.trees.set(tree.id, {
    id: tree.id,
    x: tree.x,
    z: tree.z,
    regrowAt: ctx.time + TREE_REGROW_SECONDS,
  });
  state.queue.push(tree.id);
  state.rev++;
  setTreeBodyFelled(treeBodyKey(tree), true);
  ctx.emit({
    type: 'treeFelled',
    treeId: tree.id,
    x: tree.x,
    z: tree.z,
    yaw: Math.round(treeFallYaw(tree, feller.pos) * 1000) / 1000,
    fellerId: feller.id,
  });
  ctx.markVisited(meta, 'felling:tree');
  const nodeId = treeNodeId(tree.id);
  for (const other of ctx.players.values()) {
    if (other.entityId === feller.id) continue;
    const e = ctx.entities.get(other.entityId);
    if (!e || e.castingAbility !== TREE_CHOP_CAST_ID || e.gatherCastNodeId !== nodeId) continue;
    ctx.cancelCast(e);
    ctx.error(other.entityId, 'The tree is already felled.');
  }
}

/** The regrow phase (zero rng, appended to the tick's zero-rng tail): pop
 *  every tree whose time has come, restore its collider, bump `rev`. */
export function updateTreeRegrowth(ctx: SimContext): void {
  const state = ctx.treeFells;
  const queue = state.queue;
  while (state.head < queue.length) {
    const id = queue[state.head];
    const tree = state.trees.get(id);
    if (tree && tree.regrowAt > ctx.time) break;
    state.head++;
    if (!tree) continue;
    state.trees.delete(id);
    setTreeBodyFelled(treeBodyKey(tree), false);
    state.rev++;
  }
  // Keep the queue bounded by the live set: drop the consumed prefix once it
  // dominates (amortized O(1) per regrow).
  if (state.head > 64 && state.head * 2 > queue.length) {
    queue.splice(0, state.head);
    state.head = 0;
  }
}

/** Seconds until the tree regrows, or null when it is standing. */
export function treeRegrowSecondsLeft(
  state: FelledTreesView,
  id: number,
  now: number,
): number | null {
  const tree = state.trees.get(id);
  return tree ? Math.max(0, tree.regrowAt - now) : null;
}
