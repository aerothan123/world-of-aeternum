// The online client's mirror of the felled overworld trees near the player
// (IWorld `felledTrees`), decoded from the `ftr` self key the server ships
// (server/felled_trees_wire.ts), plus its publish into the process-wide
// felled-tree COLLISION VIEW (src/sim/trees/tree_fell_collision.ts), so local
// movement prediction walks through a stump exactly where the server does.
//
// Wire shape: `ftr` is the sorted list `[[treeId, regrowAt], ...]` of trees
// felled within FELLED_TREE_WIRE_RADIUS of the player, `regrowAt` in server
// sim seconds (absolute, so the value is stable for a tree's whole down time
// and the key only re-sends when the set changes). Delta-omitted like every
// self key: absent means unchanged.
//
// Coverage: the server sends only nearby trees, so a tree that drops out of
// the list while it is still due to stay down and lies beyond the readout's
// reach left COVERAGE, it did not regrow: the mirror keeps it until its
// regrowAt passes (so walking away and back never flashes a regrown tree).
// A tree that drops out inside the reach regrew.
//
// Positions never ride the wire: the tree registry derives each felled tree's
// exact trunk position from the shared deterministic decoration field, which
// is what the collision view keys on.

import { FELLED_TREE_WIRE_RADIUS } from '../sim/content/tree_chopping';
import { publishFelledTreeBodies } from '../sim/trees/tree_fell_collision';
import type { FelledTree, FelledTreesView } from '../sim/trees/tree_felling';
import { choppableTreeById, parseTreeNodeId, treeBodyKey } from '../sim/trees/tree_registry';

export type { FelledTreesView };

/** Retain an entry the list dropped when it lies beyond this share of the reach. */
// 0.85, not 1: the server centres each readout on the player's 32-yard cell,
// up to ~23 yards off the player (server/felled_trees_wire.ts).
const COVERAGE_MARGIN = 0.85;

/** Decode one `ftr` value into (id, regrowAt) pairs; malformed rows are skipped. */
export function decodeFelledTreesWire(raw: unknown): Array<[number, number]> {
  if (!Array.isArray(raw)) return [];
  const out: Array<[number, number]> = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const id = row[0];
    const at = row[1];
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) continue;
    if (typeof at !== 'number' || !Number.isFinite(at)) continue;
    out.push([id, at]);
  }
  return out;
}

export class FelledTreeMirror {
  private trees = new Map<number, FelledTree>();
  private rev = 0;
  /** Latest server sim time seen (seconds). */
  private now = 0;
  view: FelledTreesView = { rev: 0, trees: this.trees };

  constructor(private readonly seed: number) {
    // A fresh world mirror owns the view from here: never inherit stumps.
    publishFelledTreeBodies([]);
  }

  /** Apply one snapshot: `raw` is the `ftr` value (undefined when omitted),
   *  `now` the snapshot's server time, `anchor` the player's position. */
  apply(raw: unknown, now: number, anchor: { x: number; z: number } | null): void {
    this.now = now;
    let changed = false;
    if (raw !== undefined) {
      const next = new Map<number, FelledTree>();
      for (const [id, regrowAt] of decodeFelledTreesWire(raw)) {
        const known = this.trees.get(id);
        if (known && known.regrowAt === regrowAt) {
          next.set(id, known);
          continue;
        }
        const tree = choppableTreeById(this.seed, id);
        if (!tree) continue;
        next.set(id, { id, x: tree.x, z: tree.z, regrowAt });
        changed = true;
      }
      const reach = FELLED_TREE_WIRE_RADIUS * COVERAGE_MARGIN;
      for (const [id, tree] of this.trees) {
        if (next.has(id)) continue;
        const outside = anchor !== null && Math.hypot(tree.x - anchor.x, tree.z - anchor.z) > reach;
        if (outside && tree.regrowAt > now) next.set(id, tree);
        else changed = true;
      }
      if (next.size !== this.trees.size) changed = true;
      this.trees = next;
    }
    // Retained out-of-coverage entries expire on their own clock.
    for (const [id, tree] of this.trees) {
      if (tree.regrowAt > now) continue;
      if (
        anchor !== null &&
        Math.hypot(tree.x - anchor.x, tree.z - anchor.z) <=
          FELLED_TREE_WIRE_RADIUS * COVERAGE_MARGIN
      )
        continue;
      this.trees.delete(id);
      changed = true;
    }
    if (!changed) return;
    this.rev++;
    this.view = { rev: this.rev, trees: this.trees };
    publishFelledTreeBodies([...this.trees.values()].map(treeBodyKey));
  }

  /** Whether a gather node id is workable as far as the felled set knows:
   *  false only for a tree id that is felled. */
  standing(nodeId: string): boolean {
    const id = parseTreeNodeId(nodeId);
    return id === null || !this.trees.has(id);
  }

  /** Seconds until a felled tree regrows, or null (not a tree, or standing). */
  regrowSeconds(nodeId: string): number | null {
    const id = parseTreeNodeId(nodeId);
    const tree = id === null ? undefined : this.trees.get(id);
    return tree ? Math.max(0, tree.regrowAt - this.now) : null;
  }
}
