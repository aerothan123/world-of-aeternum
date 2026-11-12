// The Eastbrook Vale v2 scatter: inside the imported field the procedural tree and
// rock scatter yields to the design's own wild trees (layout.generated.ts EBV2_TREES),
// so every tree the Unreal client draws is a tree the server collides with and lets a
// player chop, and no procedural tree stands where the client draws open ground.
//
// The tree pipeline names a tree by its decoration-grid ANCHOR (trees/tree_registry.ts:
// the nearest 10 yd lattice point), one tree per anchor. world.ts asks this module for
// every anchor whose lattice point lies on ground the design owns (ground.ts
// ebv2Owns; elsewhere the procedural scatter keeps it): the anchor gets the design tree
// that sits in its cell ([gx - 5, gx + 5) by [gz - 5, gz + 5), the cell Math.round
// assigns to it), the one nearest the lattice point when several share a cell, and
// nothing otherwise. A design tree that loses its cell to a nearer neighbour still
// collides (colliders.ts ebv2Colliders gives it a trunk) but is not choppable.
//
// Pure leaf, built-in world only, no rng draws (the variant reads the same stateless
// hash the procedural scatter uses).

import { isBuiltinWorldActive, WORLD_MAX_X, WORLD_MIN_X, WORLD_MIN_Z } from '../data';
import { hash2 } from '../rng';
import type { Decoration } from '../world';
import { ebv2Owns, inEbv2Field } from './ground';
import { EBV2_TREES } from './layout.generated';

const CELL = 10;
const HALF = CELL / 2;

// Bucket the trees on a 10 yd grid aligned to multiples of 10 (any alignment works:
// a lookup scans the buckets its query cell overlaps).
const BUCKETS = new Map<string, number[]>();
EBV2_TREES.forEach(([x, z], i) => {
  const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const list = BUCKETS.get(key);
  if (list) list.push(i);
  else BUCKETS.set(key, [i]);
});

// The tree registry names a tree by rounding its position onto ITS lattice, whose x
// origin (trees/tree_registry.ts X_START, -(WORLD_MAX_X - 14)) need not be a whole
// number of steps from the decoration grid's (WORLD_MIN_X + 14) once the world is
// asymmetric. A design tree is only owned where both cells agree, so every owned tree
// is found by its own anchor's window AND keeps a registry id no other tree shares.
const REGISTRY_X0 = -(WORLD_MAX_X - 14);
const REGISTRY_Z0 = WORLD_MIN_Z + 14;

function cellAround(origin: number, g: number): [number, number] {
  const c = origin + Math.round((g - origin) / CELL) * CELL;
  return [c - HALF, c + HALF];
}

/** The index of the design tree owning anchor (gx, gz), or -1. */
export function ebv2TreeForAnchor(gx: number, gz: number): number {
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  const [rx0, rx1] = cellAround(REGISTRY_X0, gx);
  const [rz0, rz1] = cellAround(REGISTRY_Z0, gz);
  const x0 = Math.max(gx - HALF, rx0);
  const x1 = Math.min(gx + HALF, rx1);
  const z0 = Math.max(gz - HALF, rz0);
  const z1 = Math.min(gz + HALF, rz1);
  const bx0 = Math.floor((gx - HALF) / CELL);
  const bz0 = Math.floor((gz - HALF) / CELL);
  for (let bx = bx0; bx <= bx0 + 1; bx++) {
    for (let bz = bz0; bz <= bz0 + 1; bz++) {
      for (const i of BUCKETS.get(`${bx},${bz}`) ?? []) {
        const [x, z] = EBV2_TREES[i];
        if (x < x0 || x >= x1 || z < z0 || z >= z1 || !ebv2Owns(x, z)) continue;
        const d = (x - gx) ** 2 + (z - gz) ** 2;
        if (d < bestD || (d === bestD && i < best)) {
          bestD = d;
          best = i;
        }
      }
    }
  }
  return best;
}

/** True when the design owns anchor (gx, gz): world.ts must hand it to
 *  ebv2Decoration instead of the procedural scatter. Where the design does not own
 *  the ground (edge band, corridors) the shipped scatter keeps the anchor. */
export function ebv2OwnsAnchor(gx: number, gz: number): boolean {
  return inEbv2Field(gx, gz) && ebv2Owns(gx, gz) && isBuiltinWorldActive();
}

/** The decoration at an owned anchor: the design tree in its cell, or null. */
export function ebv2Decoration(seed: number, gx: number, gz: number): Decoration | null {
  const i = ebv2TreeForAnchor(gx, gz);
  if (i < 0) return null;
  const [x, z] = EBV2_TREES[i];
  return {
    kind: 'tree2',
    x,
    z,
    scale: 1,
    variant: Math.floor(hash2(Math.round(gx), Math.round(gz), seed + 77) * 3),
    biome: 'vale',
  };
}

/** The decoration-grid anchor of a point (world.ts DECORATION_X_START/_Z_START,
 *  restated the way trees/tree_registry.ts restates them). */
export function ebv2AnchorOf(x: number, z: number): { gx: number; gz: number } {
  const x0 = WORLD_MIN_X + 14;
  const z0 = WORLD_MIN_Z + 14;
  return {
    gx: x0 + Math.round((x - x0) / CELL) * CELL,
    gz: z0 + Math.round((z - z0) / CELL) * CELL,
  };
}

/** Design trees on owned ground whose anchor went to a nearer neighbour (or sits
 *  on ground the design does not own): they stand as plain trunks (collide, never
 *  chop). A design tree off owned ground does not stand at all. Indexes into
 *  EBV2_TREES. */
export function ebv2UnanchoredTreeIndexes(): number[] {
  const out: number[] = [];
  for (let i = 0; i < EBV2_TREES.length; i++) {
    const [x, z] = EBV2_TREES[i];
    if (!ebv2Owns(x, z)) continue;
    const { gx, gz } = ebv2AnchorOf(x, z);
    const anchored = inEbv2Field(gx, gz) && ebv2Owns(gx, gz) && ebv2TreeForAnchor(gx, gz) === i;
    if (!anchored) out.push(i);
  }
  return out;
}
