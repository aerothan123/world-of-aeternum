// Felled-tree presentation (docs/design/tree-chopping.md): the thin Three.js
// consumer of tree_felling_core.ts. The renderer composes one TreeFellingView
// and calls it from three places (one line each): every SimEvent
// (`handleEvent`), every frame (`update`), and the character cast clip
// (`castClipFor`, so a chopping body loops its one-hand swing).
//
// What it draws, all from IWorld state (`felledTrees()` and the `treeFelled`
// event), never deciding anything:
//   * the standing tree's instances HIDDEN in their instanced batches (one
//     matrix write per part, and its bucket shadow-caster slot zeroed with a
//     forced repack), never a batch rebuild;
//   * a FALL: a one-instance copy of each of the tree's parts pivoting about
//     the trunk base away from the feller, the dust burst and the crash cue on
//     impact, then the trunk sinking away;
//   * a STUMP under every felled tree, on every graphics preset (a missing tree
//     is world state, the fairness rule);
//   * a REGROW: the tree's instances back, scaled up from a sapling;
//   * the fall's audio: a creak as the tree starts to go over and a crash as
//     it lands, through the sink's gathering path (outdoor reverb, long range).
// The axe strikes themselves are timed off each chopper's own swing clip by
// gather_strike_audio.ts, the same path the pick strikes take.
//
// GPU work (src/render/CLAUDE.md "GPU work"): this module adds NO program.
// The fall copies and the regrow reuse the batch's own geometry and material on
// a one-instance InstancedMesh with an instanceColor, the exact program key the
// batch was linked under at world entry (instancing + instancing colour + the
// same onBeforeCompile hooks), and a stump is the batch's bark MATERIAL on a
// cylinder whose attribute set is padded to the bark geometry's, so its key is
// the bark batch's too. Stumps pool per bark material into one InstancedMesh
// (one draw per species), and only animating trees cost anything per frame.

import * as THREE from 'three';
import { gatherNodesInActiveWorld } from '../sim/data';
import type { GatherToolSlots } from '../sim/professions/gather_tool_slots';
import { treeAnchorId } from '../sim/trees/tree_registry';
import { GATHER_CAST_ID, type SimEvent, TREE_CHOP_CAST_ID } from '../sim/types';
import { itemWeaponModelUrl } from './characters/manifest';
import { gatherCastClipFor, gatherProfessionForCast, heldGatherMainhand } from './gather_pose_core';

const NO_NODES: readonly never[] = [];
const hasHeldModel = (itemId: string): boolean => itemWeaponModelUrl(itemId) !== null;

import type { FelledTreesView } from '../world_api/professions';
import type { SpatialAudioSink } from './audio_sink';
import { disposeGhostHideGeometry, ghostHideGeometry } from './instanced_dither_fade';
import {
  CHOP_SWING_SECONDS,
  diffFelled,
  type FallPose,
  fallDirection,
  fallPoseAt,
  impactCrossed,
  pendingFallFresh,
  regrowScaleAt,
  stumpDims,
  TREE_CHOP_CAST_CLIP,
  TREE_FALL_SECONDS,
  TREE_REGROW_ANIM_SECONDS,
} from './tree_felling_core';
import type { TreeHideable } from './tree_hide_fade';

/** The creak rises from partway up the trunk, where the fibres tear. */
const CREAK_HEIGHT = 2;
/** Stump pool capacity per bark material. Past it a stump simply is not drawn
 *  (the tree is still hidden and still walkable: nothing actionable is lost). */
const STUMP_POOL_CAP = 128;

export interface TreeFellingHost {
  scene: () => THREE.Scene;
  world: () => {
    felledTrees(): FelledTreesView;
    entities: ReadonlyMap<number, { castingAbility: string | null }>;
  };
  /** The live foliage hide records (rebuilt foliage hands a new array). */
  trees: () => readonly TreeHideable[];
  ground: (x: number, z: number) => number;
  puff: (x: number, y: number, z: number, power: number) => void;
  audio: () => SpatialAudioSink | null;
}

interface Hidden {
  handle: TreeHideable;
  /** The parts' original matrices, restored on regrow. */
  matrices: THREE.Matrix4[];
  /** The original shadow-slot matrices. */
  shadows: Float32Array[];
  r: number;
}

interface Fall {
  id: number;
  t: number;
  yaw: number;
  copies: THREE.InstancedMesh[];
  base: THREE.Vector3;
}

interface StumpPool {
  mesh: THREE.InstancedMesh;
  /** The unit stump geometry (the mesh may draw a hide shell over it). */
  cylinder: THREE.BufferGeometry;
  slots: (number | null)[];
}

interface Regrow {
  id: number;
  t: number;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const m = new THREE.Matrix4();
const pivot = new THREE.Matrix4();
const axis = new THREE.Vector3();
const tmpColor = new THREE.Color();
const stumpPos = new THREE.Vector3();
const stumpRot = new THREE.Quaternion();
const stumpScale = new THREE.Vector3();
const pose: FallPose = { angle: 0, scale: 1, sink: 0, landed: false, done: false };
const diff = { added: [] as number[], removed: [] as number[] };

export class TreeFellingView {
  private byId = new Map<number, TreeHideable>();
  private source: readonly TreeHideable[] | null = null;
  private shown = new Set<number>();
  private rev = -1;
  private hidden = new Map<number, Hidden>();
  private pendingFalls = new Map<number, { yaw: number; at: number }>();
  private falls = new Map<number, Fall>();
  private regrows = new Map<number, Regrow>();
  private stumpPools = new Map<THREE.Material, StumpPool>();
  private stumpSlot = new Map<number, { pool: THREE.InstancedMesh; slot: number }>();
  private clock = 0;

  constructor(private readonly host: TreeFellingHost) {}

  /** Every SimEvent the renderer sees. */
  handleEvent(ev: SimEvent): void {
    if (ev.type === 'treeFelled') {
      this.pendingFalls.set(ev.treeId, { yaw: ev.yaw, at: this.clock });
    }
  }

  /** The cast clip a body plays: the chop swing while it chops a tree, and
   *  the mining or herb loop while it works a node (gather_pose_core.ts). */
  castClipFor(e: {
    id: number;
    castingAbility: string | null;
    pos: { x: number; z: number };
  }): string | null {
    if (e.castingAbility === TREE_CHOP_CAST_ID) return TREE_CHOP_CAST_CLIP;
    if (e.castingAbility === GATHER_CAST_ID) {
      const pose = gatherCastClipFor(
        gatherProfessionForCast(e.castingAbility, e.pos, gatherNodesInActiveWorld()),
      );
      if (pose) return pose;
    }
    return e.castingAbility ?? null;
  }

  /** The item a body's main hand shows: the gathering tool (or its held
   *  stand-in) while it chops, mines or picks herbs, else its real weapon,
   *  so the weapon comes back the frame the cast ends or is interrupted. Only
   *  the viewer's own belt is known to this client, so a peer always shows
   *  the profession's stand-in (gather_pose_core.ts). */
  heldMainhandFor(
    e: { id: number; castingAbility: string | null; pos: { x: number; z: number } },
    realMainhand: string | null,
    selfId: number,
    belt: Readonly<GatherToolSlots>,
  ): string | null {
    if (!e.castingAbility) return realMainhand;
    const nodes = e.castingAbility === GATHER_CAST_ID ? gatherNodesInActiveWorld() : NO_NODES;
    const profession = gatherProfessionForCast(e.castingAbility, e.pos, nodes);
    const tool = profession && e.id === selfId ? (belt[profession]?.itemId ?? null) : null;
    return heldGatherMainhand(profession, realMainhand, tool, hasHeldModel);
  }

  update(dt: number): void {
    this.clock += dt;
    this.syncSource();
    const world = this.host.world();
    const view = world.felledTrees();
    if (view.rev !== this.rev) {
      this.rev = view.rev;
      diffFelled(this.shown, view.trees.keys(), diff);
      for (const id of diff.added) this.onFelled(id);
      for (const id of diff.removed) this.onRegrown(id);
    }
    for (const fall of this.falls.values()) this.stepFall(fall, dt);
    for (const regrow of this.regrows.values()) this.stepRegrow(regrow, dt);
    for (const [id, p] of this.pendingFalls) {
      if (!pendingFallFresh(p.at, this.clock)) this.pendingFalls.delete(id);
    }
  }

  // The foliage view can be rebuilt (a graphics change): re-key the handles and
  // re-apply every hide to the new batches.
  private syncSource(): void {
    const trees = this.host.trees();
    if (trees === this.source) return;
    this.source = trees;
    this.byId.clear();
    for (const t of trees) this.byId.set(treeAnchorId(t.x, t.z), t);
    for (const fall of this.falls.values()) this.endFall(fall);
    this.falls.clear();
    this.regrows.clear();
    this.hidden.clear();
    for (const pool of this.stumpPools.values()) {
      this.host.scene().remove(pool.mesh);
      // The cylinder and its shell are ours; the bark material is the batch's.
      disposeGhostHideGeometry(pool.mesh.geometry);
      pool.cylinder.dispose();
      pool.mesh.dispose();
    }
    this.stumpPools.clear();
    this.stumpSlot.clear();
    const ids = [...this.shown];
    this.shown.clear();
    for (const id of ids) this.onFelled(id, true);
  }

  private onFelled(id: number, silent = false): void {
    this.shown.add(id);
    this.regrows.delete(id);
    const handle = this.byId.get(id);
    if (!handle) return; // not drawn here (a farOnly mirror, outside the foliage bounds)
    this.hide(id, handle);
    this.placeStump(id, handle);
    const pending = this.pendingFalls.get(id);
    this.pendingFalls.delete(id);
    if (!silent && pending && pendingFallFresh(pending.at, this.clock))
      this.startFall(id, handle, pending.yaw);
  }

  private onRegrown(id: number): void {
    this.shown.delete(id);
    const fall = this.falls.get(id);
    if (fall) {
      this.endFall(fall);
      this.falls.delete(id);
    }
    this.removeStump(id);
    if (this.hidden.has(id)) this.regrows.set(id, { id, t: 0 });
  }

  private hide(id: number, handle: TreeHideable): void {
    if (this.hidden.has(id)) return;
    const record: Hidden = { handle, matrices: [], shadows: [], r: handle.r };
    for (const part of handle.parts) {
      record.matrices.push(part.visibleMatrix.clone());
      // The occluder fade restores visibleMatrix on show: zero it too, so a
      // ghost settling over a felled tree can never stand it back up.
      part.visibleMatrix.copy(ZERO);
      part.mesh.setMatrixAt(part.index, ZERO);
      part.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const slot of handle.shadows) {
      const at = slot.index * 16;
      record.shadows.push(slot.row.source.slice(at, at + 16));
      slot.row.source.fill(0, at, at + 16);
      slot.row.packSerial = -1;
    }
    handle.r = 0; // a stump never occludes the camera
    this.hidden.set(id, record);
  }

  private restore(id: number, scale: number): void {
    const record = this.hidden.get(id);
    if (!record) return;
    const { handle } = record;
    handle.parts.forEach((part, i) => {
      const full = record.matrices[i];
      if (scale >= 1) part.visibleMatrix.copy(full);
      scaleAboutBase(full, scale, m);
      part.mesh.setMatrixAt(part.index, m);
      part.mesh.instanceMatrix.needsUpdate = true;
    });
    if (scale >= 1) {
      handle.shadows.forEach((slot, i) => {
        slot.row.source.set(record.shadows[i], slot.index * 16);
        slot.row.packSerial = -1;
      });
      handle.r = record.r;
      this.hidden.delete(id);
    }
  }

  private startFall(id: number, handle: TreeHideable, yaw: number): void {
    const record = this.hidden.get(id);
    if (!record) return;
    const base = new THREE.Vector3(handle.x, this.host.ground(handle.x, handle.z), handle.z);
    const copies: THREE.InstancedMesh[] = [];
    handle.parts.forEach((part, i) => {
      const geometry = ghostHideGeometry(part.mesh.geometry, 1);
      const copy = new THREE.InstancedMesh(geometry, part.mesh.material, 1);
      // Instance colour only where the batch has it: its presence is a program
      // key input (USE_INSTANCING_COLOR), so matching it keeps the copy on the
      // batch's linked program.
      if (part.mesh.instanceColor) {
        copy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
        part.mesh.getColorAt(part.index, tmpColor);
        copy.setColorAt(0, tmpColor);
      }
      copy.setMatrixAt(0, record.matrices[i]);
      copy.frustumCulled = false;
      copy.castShadow = false;
      copy.receiveShadow = part.mesh.receiveShadow;
      copy.userData.felledTreeCopy = true;
      this.host.scene().add(copy);
      copies.push(copy);
    });
    this.falls.set(id, { id, t: 0, yaw, copies, base });
    // The fibres let go as it starts to tip: the creak leads into the crash at
    // impact (TREE_FALL_SECONDS later).
    this.host.audio()?.gatherStrike?.('tree_creak', base.x, base.y + CREAK_HEIGHT, base.z, false);
  }

  private stepFall(fall: Fall, dt: number): void {
    const prev = fall.t;
    fall.t += dt;
    fallPoseAt(fall.t, pose);
    const record = this.hidden.get(fall.id);
    if (!record || pose.done) {
      this.endFall(fall);
      this.falls.delete(fall.id);
      return;
    }
    const dir = fallDirection(fall.yaw);
    // Tip about the horizontal axis perpendicular to the fall direction, so the
    // crown travels along +dir: rotate by +angle about (dir.z, 0, -dir.x).
    axis.set(dir.z, 0, -dir.x).normalize();
    pivot.makeTranslation(fall.base.x, fall.base.y - pose.sink, fall.base.z);
    pivot.multiply(m.makeRotationAxis(axis, pose.angle));
    pivot.multiply(m.makeScale(pose.scale, pose.scale, pose.scale));
    pivot.multiply(m.makeTranslation(-fall.base.x, -fall.base.y, -fall.base.z));
    fall.copies.forEach((copy, i) => {
      m.multiplyMatrices(pivot, record.matrices[i]);
      copy.setMatrixAt(0, m);
      copy.instanceMatrix.needsUpdate = true;
    });
    if (impactCrossed(prev, fall.t)) this.impact(fall);
  }

  private impact(fall: Fall): void {
    const dir = fallDirection(fall.yaw);
    const handle = this.hidden.get(fall.id)?.handle;
    const length = handle ? Math.max(3, handle.topY - fall.base.y) : 6;
    for (const k of [0.3, 0.55, 0.8]) {
      const x = fall.base.x + dir.x * length * k;
      const z = fall.base.z + dir.z * length * k;
      this.host.puff(x, this.host.ground(x, z), z, 0.9);
    }
    const mid = length * 0.5;
    const cx = fall.base.x + dir.x * mid;
    const cz = fall.base.z + dir.z * mid;
    this.host.audio()?.gatherStrike?.('tree_crash', cx, this.host.ground(cx, cz), cz, false);
  }

  private endFall(fall: Fall): void {
    for (const copy of fall.copies) {
      this.host.scene().remove(copy);
      // Only the one-instance shell is ours: the source geometry's buffers stay
      // with the batch (a no-op when the dither fade is off and no shell exists).
      disposeGhostHideGeometry(copy.geometry);
      copy.dispose();
    }
    fall.copies.length = 0;
  }

  private stepRegrow(regrow: Regrow, dt: number): void {
    regrow.t += dt;
    const scale = regrowScaleAt(regrow.t);
    const done = regrow.t >= TREE_REGROW_ANIM_SECONDS;
    this.restore(regrow.id, done ? 1 : scale);
    if (done) this.regrows.delete(regrow.id);
  }

  private placeStump(id: number, handle: TreeHideable): void {
    if (this.stumpSlot.has(id)) return;
    const bark = barkPartOf(handle);
    if (!bark) return;
    const pool = this.stumpPoolFor(bark.mesh);
    const slot = pool.slots.indexOf(null);
    if (slot < 0) return;
    pool.slots[slot] = id;
    const record = this.hidden.get(id);
    const scale = record ? horizontalScale(record.matrices[0]) : 1;
    const dims = stumpDims(scale);
    const y = this.host.ground(handle.x, handle.z);
    m.compose(
      stumpPos.set(handle.x, y + dims.height / 2 - 0.08, handle.z),
      stumpRot,
      stumpScale.set(dims.radius, dims.height, dims.radius),
    );
    pool.mesh.setMatrixAt(slot, m);
    if (bark.mesh.instanceColor && pool.mesh.instanceColor) {
      bark.mesh.getColorAt(bark.index, tmpColor);
      pool.mesh.setColorAt(slot, tmpColor);
    }
    pool.mesh.count = Math.max(pool.mesh.count, slot + 1);
    pool.mesh.instanceMatrix.needsUpdate = true;
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    this.stumpSlot.set(id, { pool: pool.mesh, slot });
  }

  private removeStump(id: number): void {
    const at = this.stumpSlot.get(id);
    if (!at) return;
    this.stumpSlot.delete(id);
    at.pool.setMatrixAt(at.slot, ZERO);
    at.pool.instanceMatrix.needsUpdate = true;
    for (const pool of this.stumpPools.values()) {
      if (pool.mesh === at.pool) pool.slots[at.slot] = null;
    }
  }

  private stumpPoolFor(bark: THREE.InstancedMesh): StumpPool {
    const material = bark.material as THREE.Material;
    let pool = this.stumpPools.get(material);
    if (pool) return pool;
    const cylinder = stumpGeometryLike(bark.geometry);
    const geometry = ghostHideGeometry(cylinder, STUMP_POOL_CAP);
    const mesh = new THREE.InstancedMesh(geometry, material, STUMP_POOL_CAP);
    // Same program key as the bark batch: instance colour only if it has one.
    if (bark.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(STUMP_POOL_CAP * 3).fill(1),
        3,
      );
    }
    for (let i = 0; i < STUMP_POOL_CAP; i++) mesh.setMatrixAt(i, ZERO);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.felledTreeStumps = true;
    this.host.scene().add(mesh);
    pool = { mesh, cylinder, slots: new Array(STUMP_POOL_CAP).fill(null) };
    this.stumpPools.set(material, pool);
    return pool;
  }

  /** Test/perf readout: what this view is holding right now. */
  stats(): {
    felled: number;
    falling: number;
    regrowing: number;
    stumps: number;
  } {
    return {
      felled: this.shown.size,
      falling: this.falls.size,
      regrowing: this.regrows.size,
      stumps: this.stumpSlot.size,
    };
  }
}

// The bark part: the one whose material is not a leaf (the canopy parts carry
// alpha-tested leaf maps). Falls back to the first part.
function barkPartOf(handle: TreeHideable): TreeHideable['parts'][number] | null {
  for (const part of handle.parts) {
    const mat = part.mesh.material as THREE.Material & { alphaTest?: number };
    if (!(mat.alphaTest && mat.alphaTest > 0)) return part;
  }
  return handle.parts[0] ?? null;
}

function horizontalScale(matrix: THREE.Matrix4): number {
  const e = matrix.elements;
  return Math.hypot(e[0], e[1], e[2]) || 1;
}

// A unit stump (radius 1, height 1, centred) whose vertex attribute SET
// matches the bark geometry's, so the bark material links the same program for
// it as for the batch (three's program key reads which attributes exist:
// tangents, a second uv set, vertex colours). Missing attributes are padded
// with neutral values; instanced ones (the batch's own per-instance data) are
// skipped, the pool carries its own.
function stumpGeometryLike(bark: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.82, 1, 1, 9, 1, false);
  const count = geo.attributes.position.count;
  for (const name in bark.attributes) {
    if (geo.attributes[name]) continue;
    const attr = bark.attributes[name] as THREE.BufferAttribute;
    if ((attr as THREE.InstancedBufferAttribute).isInstancedBufferAttribute) continue;
    const fill = name === 'color' ? 1 : 0;
    geo.setAttribute(
      name,
      new THREE.BufferAttribute(new Float32Array(count * attr.itemSize).fill(fill), attr.itemSize),
    );
  }
  return geo;
}

// `full` scaled uniformly about its own translation (the trunk base).
const scaleTmp = new THREE.Matrix4();
function scaleAboutBase(full: THREE.Matrix4, scale: number, out: THREE.Matrix4): THREE.Matrix4 {
  const e = full.elements;
  out.makeTranslation(e[12], e[13], e[14]);
  out.multiply(scaleTmp.makeScale(scale, scale, scale));
  out.multiply(scaleTmp.makeTranslation(-e[12], -e[13], -e[14]));
  return out.multiply(full);
}

export { CHOP_SWING_SECONDS, TREE_CHOP_CAST_CLIP, TREE_FALL_SECONDS };
