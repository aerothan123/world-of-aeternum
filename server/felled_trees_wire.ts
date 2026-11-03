// The `ftr` self key: the felled overworld trees near a player (IWorld
// `felledTrees`, mirrored by src/net/felled_trees_wire.ts), extracted beside
// GameServer.selfWireJson (the monolith ratchet).
//
// Hot-path shape (server/CLAUDE.md "Hot paths"): this rides the per-tick self
// path, so it carries a named bound and a revision gate.
//   * The backing collection is the Sim's felled set (src/sim/trees/), which
//     holds only trees felled in the last TREE_REGROW_SECONDS: bounded by
//     recent chopping, never by realm age.
//   * Nothing is rebuilt while nothing changed: each session remembers the
//     set's `rev` and its own coarse cell, and only a fell, a regrow, or the
//     player crossing a cell boundary rebuilds. The value stays byte-identical
//     between those moments (absolute regrow times, not countdowns), so the
//     delta gate (`maybeSerialized`) suppresses the send as well.
//   * The fragment is VIEWER-IDENTICAL per cell: it is built once per (rev,
//     cell) and shared by every session standing in that cell, so a busy town
//     pays one build per change, not one per player.
// Wire: `[[treeId, regrowAt], ...]` sorted by id, regrowAt in sim seconds to a
// tenth, for every tree within FELLED_TREE_WIRE_RADIUS of the cell's centre.

import { FELLED_TREE_WIRE_RADIUS } from '../src/sim/content/tree_chopping';
import type { FelledTreesView } from '../src/sim/trees/tree_felling';
/** The coarse cell a session's readout is keyed on (yards). */
export const FELLED_TREE_WIRE_CELL = 32;

export interface FelledTreesReader {
  felledTrees(): FelledTreesView;
}

interface SessionState {
  rev: number;
  cell: number;
  json: string;
}

const perSession = new WeakMap<object, SessionState>();
let memoRev = -1;
let memoView: FelledTreesView | null = null;
const memoByCell = new Map<number, string>();

function cellOf(x: number, z: number): number {
  const cx = Math.floor(x / FELLED_TREE_WIRE_CELL);
  const cz = Math.floor(z / FELLED_TREE_WIRE_CELL);
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** Build (or reuse) the fragment for one cell of one felled-set revision. */
export function felledTreesCellJson(view: FelledTreesView, cell: number): string {
  if (memoView !== view || memoRev !== view.rev) {
    memoView = view;
    memoRev = view.rev;
    memoByCell.clear();
  }
  const hit = memoByCell.get(cell);
  if (hit !== undefined) return hit;
  const cx = (Math.floor(cell / 65536) - 32768 + 0.5) * FELLED_TREE_WIRE_CELL;
  const cz = ((cell % 65536) - 32768 + 0.5) * FELLED_TREE_WIRE_CELL;
  const r2 = FELLED_TREE_WIRE_RADIUS * FELLED_TREE_WIRE_RADIUS;
  const rows: { id: number; at: number }[] = [];
  for (const tree of view.trees.values()) {
    const dx = tree.x - cx;
    const dz = tree.z - cz;
    if (dx * dx + dz * dz <= r2)
      rows.push({ id: tree.id, at: Math.round(tree.regrowAt * 10) / 10 });
  }
  rows.sort((a, b) => a.id - b.id);
  const json = `[${rows.map((r) => `[${r.id},${r.at}]`).join(',')}]`;
  memoByCell.set(cell, json);
  return json;
}

/** Emit `ftr` for one session through the self record's delta emitter. */
export function appendFelledTreesSelfWire(
  sim: FelledTreesReader,
  session: object,
  pos: { x: number; z: number },
  maybeSerialized: (key: string, serialized: string) => void,
): void {
  const view = sim.felledTrees();
  const cell = cellOf(pos.x, pos.z);
  let state = perSession.get(session);
  if (!state || state.rev !== view.rev || state.cell !== cell) {
    const json = felledTreesCellJson(view, cell);
    if (state) {
      state.rev = view.rev;
      state.cell = cell;
      state.json = json;
    } else {
      state = { rev: view.rev, cell, json };
      perSession.set(session, state);
    }
  }
  maybeSerialized('ftr', state.json);
}
