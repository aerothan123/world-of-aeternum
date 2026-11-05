// The felled-tree painter (src/render/tree_felling.ts) driven over real
// Three objects in Node (no WebGL): a felled tree's batch instance is hidden
// and a stump drawn, a treeFelled event plays a fall copy that leaves the scene
// when the fade ends, and a regrow scales the instance back to its original
// matrix. The curves themselves are pinned by tree_felling_core.test.ts.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TreeFellingView } from '../src/render/tree_felling';
import { TREE_FALL_TOTAL_SECONDS, TREE_REGROW_ANIM_SECONDS } from '../src/render/tree_felling_core';
import type { TreeHideable } from '../src/render/tree_hide_fade';
import type { FelledTree } from '../src/sim/trees/tree_felling';
import { treeAnchorId } from '../src/sim/trees/tree_registry';
import { TREE_CHOP_CAST_ID } from '../src/sim/types';

const X = 120;
const Z = -40;
const ID = treeAnchorId(X, Z);

function rig() {
  const scene = new THREE.Scene();
  const bark = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.3, 0.4, 4),
    new THREE.MeshLambertMaterial(),
    2,
  );
  const placed = new THREE.Matrix4().makeTranslation(X, 0, Z);
  bark.setMatrixAt(1, placed);
  scene.add(bark);
  const shadowSource = new Float32Array(32).fill(1);
  const shadowRow = { source: shadowSource, packSerial: 3 };
  const tree: TreeHideable = {
    x: X,
    z: Z,
    r: 1.2,
    topY: 6,
    hidden: false,
    alpha: 1,
    ghosts: [],
    parts: [{ mesh: bark, index: 1, visibleMatrix: placed.clone() }],
    prefetched: false,
    shadows: [{ row: shadowRow, index: 1 }],
  };
  const trees = [tree];
  let felled = new Map<number, FelledTree>();
  let rev = 0;
  const entities = new Map<number, { castingAbility: string | null }>();
  const sounds: string[] = [];
  const view = new TreeFellingView({
    scene: () => scene,
    world: () => ({ felledTrees: () => ({ rev, trees: felled }), entities }),
    trees: () => trees,
    ground: () => 0,
    puff: () => {},
    audio: () =>
      ({
        playAt: (id: string) => sounds.push(id),
        gatherStrike: (kind: string) => sounds.push(kind),
      }) as never,
  });
  const fell = () => {
    felled = new Map([[ID, { id: ID, x: X, z: Z, regrowAt: 300 }]]);
    rev++;
  };
  const regrow = () => {
    felled = new Map();
    rev++;
  };
  return { scene, bark, placed, tree, shadowRow, view, fell, regrow, entities, sounds };
}

const at = (mesh: THREE.InstancedMesh, i: number) => {
  const out = new THREE.Matrix4();
  mesh.getMatrixAt(i, out);
  return out;
};

// A hidden instance is scaled to nothing (the zero-scale matrix).
const collapsed = (m: THREE.Matrix4) =>
  m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0;

describe('TreeFellingView', () => {
  it('a tree already felled on first sight is hidden with a stump and no fall', () => {
    const r = rig();
    r.fell();
    r.view.update(0.05);
    expect(collapsed(at(r.bark, 1))).toBe(true);
    expect(collapsed(r.tree.parts[0].visibleMatrix)).toBe(true);
    expect(r.tree.r).toBe(0);
    expect(r.shadowRow.packSerial).toBe(-1);
    expect([...r.shadowRow.source.slice(16, 32)].every((v) => v === 0)).toBe(true);
    expect(r.view.stats()).toMatchObject({ felled: 1, falling: 0, stumps: 1 });
  });

  it('a treeFelled event plays a fall copy that leaves the scene when it is done', () => {
    const r = rig();
    const before = r.scene.children.length;
    r.view.handleEvent({ type: 'treeFelled', treeId: ID, x: X, z: Z, yaw: 0, fellerId: 1 });
    r.fell();
    r.view.update(0.05);
    expect(r.view.stats().falling).toBe(1);
    // The stump pool plus one copy per part joined the scene.
    expect(r.scene.children.length).toBe(before + 2);
    for (let t = 0; t < TREE_FALL_TOTAL_SECONDS + 0.5; t += 0.1) r.view.update(0.1);
    expect(r.view.stats().falling).toBe(0);
    expect(r.scene.children.length).toBe(before + 1); // the stump pool stays
    // the trunk creaks as it starts to tip, then crashes once on impact
    expect(r.sounds.filter((s) => s === 'tree_creak')).toHaveLength(1);
    expect(r.sounds.filter((s) => s === 'tree_crash')).toHaveLength(1);
    expect(r.sounds.indexOf('tree_creak')).toBeLessThan(r.sounds.indexOf('tree_crash'));
  });

  it('a regrow restores the original matrix, shadow slot and occluder radius', () => {
    const r = rig();
    r.fell();
    r.view.update(0.05);
    r.regrow();
    r.view.update(0.05);
    expect(r.view.stats()).toMatchObject({ felled: 0, stumps: 0, regrowing: 1 });
    for (let t = 0; t < TREE_REGROW_ANIM_SECONDS + 0.2; t += 0.1) r.view.update(0.1);
    expect(at(r.bark, 1).equals(r.placed)).toBe(true);
    expect(r.tree.parts[0].visibleMatrix.equals(r.placed)).toBe(true);
    expect(r.tree.r).toBe(1.2);
    expect([...r.shadowRow.source.slice(16, 32)].every((v) => v === 1)).toBe(true);
  });

  it('loops the swing clip while a body chops, leaving the axe strikes to the swing itself', () => {
    const r = rig();
    r.entities.set(7, { castingAbility: TREE_CHOP_CAST_ID });
    r.view.handleEvent({
      type: 'castStart',
      entityId: 7,
      chopTreeId: ID,
    } as never);
    for (let t = 0; t < 3; t += 0.05) r.view.update(0.05);
    // the strikes land on the swing clip's own contact (gather_strike_audio.ts),
    // never on a timer here, so a chop is never doubled
    expect(r.sounds).toHaveLength(0);
    const pos = { x: X, z: Z };
    expect(r.view.castClipFor({ id: 7, castingAbility: TREE_CHOP_CAST_ID, pos })).toBe('chop_tree');
    expect(r.view.castClipFor({ id: 8, castingAbility: 'fireball', pos })).toBe('fireball');
  });
});
