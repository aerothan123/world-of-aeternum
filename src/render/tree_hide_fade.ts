// The world trees' camera-occluder fade, lifted out of foliage.ts: the
// hideable records, the eye-to-camera hit test against a tree's trunk circle
// and its crown,
// the per-frame ghosting of its instances through the pool's arm (pooled
// stand-ins behind the gated fade, occluder_fade_gate.ts, or the per-instance
// dither, instanced_dither_fade.ts), and the ghost sources the boot prewarm
// covers.
import type * as THREE from 'three';
import type { InstancedGhostHide, InstancedOccluderGhosts } from './instanced_occluder_ghosts';
import {
  OCCLUDER_FADE_PREFETCH_YD,
  occluderFadeSettled,
  occluderFadesDisabled,
  occluderKeepsInstances,
  withinOccluderFadePrefetch,
} from './occluder_fade_core';
import { TreeHideIndex } from './tree_hide_index_core';

export interface TreeHidePart {
  mesh: THREE.InstancedMesh;
  index: number;
  visibleMatrix: THREE.Matrix4;
}

export interface TreeHideable {
  x: number;
  z: number;
  r: number;
  topY: number;
  /** Ghosted (the fade applied), NOT "occluding": a tree that occludes the
   *  camera while its fade program is still gate-held reads false. */
  hidden: boolean;
  /** Animated fade level (1 = opaque instance, 0.2 = occluding ghost). */
  alpha: number;
  /** One live ghost per part while the fade is active (empty = at rest). */
  ghosts: InstancedGhostHide[];
  parts: TreeHidePart[];
  /** The ghost programs were asked for ahead of the first occlusion. */
  prefetched: boolean;
  /** This tree's slots in the bucket shadow-caster rows (foliage.ts
   *  buildShadowCasters): the felled-tree presenter (tree_felling.ts) zeroes a
   *  slot's packed source matrix and forces a repack so a stump casts no
   *  standing tree's shadow. */
  shadows: TreeShadowSlot[];
  /** The crown the camera boom must not draw inside of, derived once from
   *  the leaf parts (treeCrownOf); null for a bare tree, unset until the
   *  index first sees the tree. */
  crown?: TreeCrown | null;
  /** How far from (x, z) the tree can occlude: the trunk radius, or the
   *  crown's far edge. The spatial index grows its segment query by it. */
  reach?: number;
}

/** A crown as the fade tests it: a vertical cylinder, inset from the leaf
 *  bounds so a boom that only grazes the outer leaves keeps the tree. */
export interface TreeCrown {
  x: number;
  z: number;
  r: number;
  bottomY: number;
  topY: number;
}

/** Fraction of the leaf bounds' mean half extent the crown cylinder keeps. */
export const CROWN_FADE_INSET = 0.8;

const LEAF_PART = /^(Leaves|Flowers)/;

/**
 * The crown cylinder of a tree in world space: the union of its leaf parts'
 * geometry bounds under each part's instance matrix. A storybook crown is
 * broad and starts low (a fitted oak's leaves begin near a third of its
 * height, the kit's near two thirds), so a chase camera that a trunk-only
 * test never fades for sits inside the canopy and the whole view turns to
 * leaves. Null when the tree has no leaf part (a dead tree) or no bounds.
 */
export function treeCrownOf(t: Pick<TreeHideable, 'parts'>): TreeCrown | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of t.parts) {
    const mesh = part.mesh as Partial<THREE.InstancedMesh> | undefined;
    const mat = mesh?.material;
    const material = Array.isArray(mat) ? mat[0] : mat;
    const geometry = mesh?.geometry;
    const e = part.visibleMatrix?.elements;
    if (!material || !LEAF_PART.test(material.name) || !geometry || !e) continue;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) continue;
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? box.max.x : box.min.x;
      const y = c & 2 ? box.max.y : box.min.y;
      const z = c & 4 ? box.max.z : box.min.z;
      const w = [
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      ];
      for (let k = 0; k < 3; k++) {
        if (w[k] < min[k]) min[k] = w[k];
        if (w[k] > max[k]) max[k] = w[k];
      }
    }
  }
  if (!(max[0] > min[0])) return null;
  return {
    x: (min[0] + max[0]) / 2,
    z: (min[2] + max[2]) / 2,
    r: (CROWN_FADE_INSET * (max[0] - min[0] + (max[2] - min[2]))) / 4,
    bottomY: min[1],
    topY: max[1],
  };
}

/** Derive a tree's crown and reach once (the index reads the reach). */
export function prepareTreeCrown(t: TreeHideable): void {
  if (t.reach !== undefined) return;
  t.crown = treeCrownOf(t);
  const c = t.crown;
  t.reach = c ? Math.max(t.r, Math.hypot(c.x - t.x, c.z - t.z) + c.r) : t.r;
}

/** The [t0, t1] stretch of the segment from a to b whose xz lies inside the
 *  circle, clamped to the segment; null when it never enters. */
function segmentCircleSpan(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  r: number,
): [number, number] | null {
  const dx = bx - ax,
    dz = bz - az;
  const fx = ax - cx,
    fz = az - cz;
  const a = dx * dx + dz * dz;
  const c0 = fx * fx + fz * fz - r * r;
  if (a < 1e-12) return c0 < 0 ? [0, 1] : null;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c0;
  if (disc < 0) return null;
  const q = Math.sqrt(disc);
  const t0 = Math.max(0, (-b - q) / (2 * a));
  const t1 = Math.min(1, (-b + q) / (2 * a));
  return t0 <= t1 ? [t0, t1] : null;
}

/** Whether the eye-to-camera segment runs through the crown cylinder. */
export function cameraSegmentHitsCrown(
  c: TreeCrown,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  camX: number,
  camY: number,
  camZ: number,
): boolean {
  const span = segmentCircleSpan(eyeX, eyeZ, camX, camZ, c.x, c.z, c.r);
  if (!span) return false;
  const y0 = eyeY + (camY - eyeY) * span[0];
  const y1 = eyeY + (camY - eyeY) * span[1];
  return Math.max(y0, y1) >= c.bottomY && Math.min(y0, y1) <= c.topY;
}

/** One tree's slot in a shadow-caster row: the row's packed source matrices
 *  (16 floats per instance) and its repack serial. */
export interface TreeShadowSlot {
  row: { source: Float32Array; packSerial: number };
  index: number;
}

function pointInsideTree(t: TreeHideable, x: number, z: number): boolean {
  const dx = x - t.x,
    dz = z - t.z;
  return dx * dx + dz * dz < t.r * t.r;
}

function segmentCircleEntry(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  r: number,
): number {
  const dx = bx - ax,
    dz = bz - az;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return Infinity;
  const fx = ax - cx,
    fz = az - cz;
  const c0 = fx * fx + fz * fz - r * r;
  if (c0 < 0) return 0;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c0;
  if (disc < 0) return Infinity;
  return (-b - Math.sqrt(disc)) / (2 * a);
}

export function cameraSegmentHitsTree(
  t: TreeHideable,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  camX: number,
  camY: number,
  camZ: number,
): boolean {
  // The editor's viewport turns every camera fade off (occluder_fade_core).
  if (occluderFadesDisabled()) return false;
  if (t.crown && cameraSegmentHitsCrown(t.crown, eyeX, eyeY, eyeZ, camX, camY, camZ)) return true;
  if (
    (eyeY < t.topY && pointInsideTree(t, eyeX, eyeZ)) ||
    (camY < t.topY && pointInsideTree(t, camX, camZ))
  ) {
    return true;
  }
  const hitT = segmentCircleEntry(eyeX, eyeZ, camX, camZ, t.x, t.z, t.r);
  if (hitT < 0 || hitT > 1) return false;
  return eyeY + (camY - eyeY) * hitT < t.topY;
}

/** Every InstancedMesh a hideable tree can ghost, repeats included: the ghost
 *  pool clones per SOURCE mesh, so this is the set its programs come from. */
export function* hideableGhostSources(
  trees: readonly TreeHideable[],
): Generator<THREE.InstancedMesh> {
  for (const t of trees) for (const part of t.parts) yield part.mesh;
}

/** One tree, one frame: its instances ghosted through the pool, given whether
 *  the eye-to-camera segment crosses it.
 *  Returns whether the tree's fade is in flight after this frame (it holds
 *  ghosts), which is what the index keeps it on the active list for. */
export function stepTreeHide(
  t: TreeHideable,
  ghosts: InstancedOccluderGhosts,
  hide: boolean,
  dt: number,
  reducedMotion: boolean,
): boolean {
  if (occluderKeepsInstances(hide, t.ghosts.length > 0, ghosts, t.parts)) {
    t.hidden = false;
    t.alpha = 1;
    return false;
  }
  t.hidden = hide;
  if (t.ghosts.length === 0) {
    for (let j = 0; j < t.parts.length; j++) {
      const part = t.parts[j];
      t.ghosts.push(ghosts.hide(part.mesh, part.index, part.visibleMatrix));
    }
  }
  t.alpha = ghosts.step(t.alpha, hide, dt, reducedMotion);
  for (let j = 0; j < t.ghosts.length; j++) ghosts.fade(t.ghosts[j], t.alpha);
  if (!hide && occluderFadeSettled(t.alpha, false)) {
    for (let j = 0; j < t.ghosts.length; j++) ghosts.show(t.ghosts[j]);
    t.ghosts.length = 0;
  }
  return t.ghosts.length > 0;
}

// One index per hideable registry (the array identity), rebuilt when the
// registry grew: buildTrees only ever appends to it.
const indexes = new WeakMap<TreeHideable[], TreeHideIndex>();

function indexFor(trees: TreeHideable[]): TreeHideIndex {
  let index = indexes.get(trees);
  if (!index || index.count !== trees.length) {
    for (const t of trees) prepareTreeCrown(t);
    index = new TreeHideIndex(trees, undefined, index?.active ?? []);
    indexes.set(trees, index);
  }
  return index;
}

export function updateTreeHides(
  trees: TreeHideable[],
  ghosts: InstancedOccluderGhosts,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  camX: number,
  camY: number,
  camZ: number,
  dt: number,
  reducedMotion: boolean,
): void {
  // The shipped field has 3k+ hideable trees; a frame looks at three sets of
  // them, each a handful: the cells under the eye-to-camera segment (the only
  // trees the segment can cross), the unlatched trees of the cells the
  // prefetch reach touches (only when the camera moved: a still camera brings
  // no tree into reach), and the trees whose fade is already in flight (a
  // ghosted tree keeps stepping toward its rest whether or not the segment
  // still crosses it). Every other tree is untouched, exactly as the linear
  // walk left it: opaque, unfaded, with nothing to update.
  const index = indexFor(trees);
  index.beginFrame();
  // The dithered ghost links no second program: nothing to ask ahead for.
  if (!ghosts.dithered && index.sweepDue(camX, camZ)) {
    index.forEachUnprefetchedWithin(camX, camZ, OCCLUDER_FADE_PREFETCH_YD, (i) => {
      const t = trees[i];
      if (t.prefetched || !withinOccluderFadePrefetch(t.x, t.z, camX, camZ)) return;
      t.prefetched = true;
      ghosts.prefetchAll(t.parts);
      index.notePrefetched(i);
    });
  }
  index.forEachNearSegment(eyeX, eyeZ, camX, camZ, (i) => {
    const t = trees[i];
    const hide = cameraSegmentHitsTree(t, eyeX, eyeY, eyeZ, camX, camY, camZ);
    if (stepTreeHide(t, ghosts, hide, dt, reducedMotion)) index.active.add(i);
    else index.active.delete(i);
  });
  for (const i of index.active) {
    if (index.visitedThisFrame(i)) continue;
    if (!stepTreeHide(trees[i], ghosts, false, dt, reducedMotion)) index.active.delete(i);
  }
}
