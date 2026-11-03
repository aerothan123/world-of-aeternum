// Felled trees, the collision half (src/sim/trees/tree_felling.ts is the
// authority): a felled tree's trunk stops blocking movement, line of sight and
// the camera until it regrows. This is the fourth process-wide COLLISION VIEW
// (src/sim/CLAUDE.md, beside the dungeon gates, the ferry berths and the combat
// walls): a projection of world state that the owning world re-publishes, read
// by every collision reader in the process through colliders.ts
// collidersInCell, and mirrored by the online client from the same state.
//
// Who writes it: the authoritative Sim on every fell and regrow (tree_felling.ts)
// and the online ClientWorld from the felled set it mirrors
// (src/net/felled_trees_wire.ts), so local movement prediction walks through
// the stump exactly where the server does. Process-wide, the shape of the gate
// view: two live worlds in one process contend, and each re-writes its own
// state; constructing a world clears it. Keyed by the decoration BODY key
// colliders.ts files the trunk under (`${x},${z}`, the decoration's own floats).
//
// Pure leaf: no SimContext, no rng, no world reads (colliders.ts imports it, so
// it must not import anything that imports colliders.ts).

import type { Collider } from '../colliders';

const felled = new Set<string>();
let version = 0;

/** Mark one trunk felled (true) or standing (false). No-op when unchanged. */
export function setTreeBodyFelled(bodyKey: string, isFelled: boolean): void {
  if (isFelled === felled.has(bodyKey)) return;
  if (isFelled) felled.add(bodyKey);
  else felled.delete(bodyKey);
  version++;
}

/** Replace the whole felled set (the client mirror's publish). */
export function publishFelledTreeBodies(bodyKeys: Iterable<string>): void {
  const next = new Set(bodyKeys);
  let same = next.size === felled.size;
  if (same) {
    for (const key of next) {
      if (!felled.has(key)) {
        same = false;
        break;
      }
    }
  }
  if (same) return;
  felled.clear();
  for (const key of next) felled.add(key);
  version++;
}

/** Forget every felled trunk (a fresh world, or a test). */
export function clearFelledTreeBodies(): void {
  if (felled.size === 0) return;
  felled.clear();
  version++;
}

/** Whether this trunk is felled right now. */
export function isTreeBodyFelled(bodyKey: string): boolean {
  return felled.has(bodyKey);
}

/** The view's change counter (bumps on every effective change). */
export function felledTreeCollisionVersion(): number {
  return version;
}

const seenVersion = new WeakMap<Map<number, Collider[]>, number>();

/**
 * Drop a grid's combined-cell memo when the felled set changed since that memo
 * was last synced, so the next read re-combines through withoutFelledTrees.
 * Cheap: re-combining is a concat, the expensive decoration materialization is
 * kept. Called at the top of every collidersInCell read.
 */
export function syncFelledTreeCells(combinedCells: Map<number, Collider[]>): void {
  const seen = seenVersion.get(combinedCells);
  if (seen === version) return;
  if (seen !== undefined) combinedCells.clear();
  seenVersion.set(combinedCells, version);
}

/** A cell's decoration bodies minus every felled trunk: the list itself while
 *  nothing is felled or none of its bodies is (the common case, no allocation). */
export function withoutFelledTrees(decorations: Collider[]): Collider[] {
  if (felled.size === 0) return decorations;
  let out: Collider[] | null = null;
  for (let i = 0; i < decorations.length; i++) {
    const c = decorations[i];
    const down = c.type === 'circle' && felled.has(`${c.x},${c.z}`);
    if (down && out === null) out = decorations.slice(0, i);
    else if (!down && out !== null) out.push(c);
  }
  return out ?? decorations;
}
