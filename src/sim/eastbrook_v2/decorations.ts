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
import { ebv2FieldHeight, ebv2Owns, ebv2Weight, inEbv2Field } from './ground';
import { EBV2_TREES } from './layout.generated';

const CELL = 10;
const HALF = CELL / 2;

// A design tree on a cliff face (the design's bandit-camp scarp carries two) is
// never a decoration: the shared scatter rule (world.ts DECORATION_MAX_SLOPE,
// tests/fixes.test.ts) keeps every tree and rock off a wall steeper than the climb
// limit, and a choppable tree there would ask a woodcutter to stand on the wall.
// It still stands as a plain trunk where the Unreal client draws it (an anchor
// skips it, so ebv2UnanchoredTreeIndexes hands it to colliders.ts). The slope is
// read off the design field itself, the way world.ts terrainSteepness reads the
// ground (central differences STEEPNESS_SAMPLE apart): where the design owns the
// ground outright its field IS the ground (ebv2Ground is applied last). Both
// literals are pinned equal to world.ts's by tests/eastbrook_v2_world.test.ts;
// this leaf cannot import world.ts (world.ts imports it).
export const EBV2_TREE_MAX_SLOPE = 1.5;
export const EBV2_SLOPE_SAMPLE = 0.35;

// The verdict is a pure function of the generated field, so it is read once per tree.
let cliffTrees: boolean[] | null = null;

/** True when design tree `i` stands on a cliff face of fully owned design ground. */
export function ebv2TreeOnCliff(i: number): boolean {
  cliffTrees ??= EBV2_TREES.map((_, j) => treeOnCliff(j));
  return cliffTrees[i];
}

function treeOnCliff(i: number): boolean {
  const [x, z] = EBV2_TREES[i];
  const e = EBV2_SLOPE_SAMPLE;
  const samples: [number, number][] = [
    [x + e, z],
    [x - e, z],
    [x, z + e],
    [x, z - e],
  ];
  if (samples.some(([sx, sz]) => ebv2Weight(sx, sz) < 1)) return false;
  const hx = (ebv2FieldHeight(x + e, z) - ebv2FieldHeight(x - e, z)) / (2 * e);
  const hz = (ebv2FieldHeight(x, z + e) - ebv2FieldHeight(x, z - e)) / (2 * e);
  return Math.hypot(hx, hz) > EBV2_TREE_MAX_SLOPE;
}

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
// asymmetric (it sits 2 yd off today). An anchor takes the nearest design tree in its
// own decoration cell, so every owned tree is found by its own anchor's window; it
// keeps a registry id no other tree shares because, where two neighbouring anchors'
// trees round to ONE registry cell, only the tree nearer that cell's lattice point
// stands as a decoration (the other stands as a trunk). Earlier this was a window
// cut to the overlap of the two cells, which also dropped every tree in the 2 yd
// strip where the cells disagree even when no other tree claimed its registry id.
const REGISTRY_X0 = -(WORLD_MAX_X - 14);
const REGISTRY_Z0 = WORLD_MIN_Z + 14;

const registryCell = (origin: number, v: number) => origin + Math.round((v - origin) / CELL) * CELL;

/** The registry lattice point a design tree's id rounds to, and its squared distance. */
function registryOf(i: number): { rx: number; rz: number; d: number } {
  const [x, z] = EBV2_TREES[i];
  const rx = registryCell(REGISTRY_X0, x);
  const rz = registryCell(REGISTRY_Z0, z);
  return { rx, rz, d: (x - rx) ** 2 + (z - rz) ** 2 };
}

/** The index of the design tree owning anchor (gx, gz), or -1. */
export function ebv2TreeForAnchor(gx: number, gz: number): number {
  const i = nearestInCell(gx, gz);
  if (i < 0) return -1;
  const mine = registryOf(i);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      const nx = gx + dx * CELL;
      const nz = gz + dz * CELL;
      // only an anchor the design owns shows its design tree (world.ts)
      if (!inEbv2Field(nx, nz) || !ebv2Owns(nx, nz)) continue;
      const n = nearestInCell(nx, nz);
      if (n < 0) continue;
      const theirs = registryOf(n);
      if (theirs.rx !== mine.rx || theirs.rz !== mine.rz) continue;
      if (theirs.d < mine.d || (theirs.d === mine.d && n < i)) return -1;
    }
  }
  return i;
}

/** The design tree nearest anchor (gx, gz) inside its decoration cell, or -1. */
function nearestInCell(gx: number, gz: number): number {
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  const x0 = gx - HALF;
  const x1 = gx + HALF;
  const z0 = gz - HALF;
  const z1 = gz + HALF;
  const bx0 = Math.floor((gx - HALF) / CELL);
  const bz0 = Math.floor((gz - HALF) / CELL);
  for (let bx = bx0; bx <= bx0 + 1; bx++) {
    for (let bz = bz0; bz <= bz0 + 1; bz++) {
      for (const i of BUCKETS.get(`${bx},${bz}`) ?? []) {
        const [x, z] = EBV2_TREES[i];
        if (x < x0 || x >= x1 || z < z0 || z >= z1 || !ebv2Owns(x, z)) continue;
        if (ebv2TreeOnCliff(i)) continue;
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
