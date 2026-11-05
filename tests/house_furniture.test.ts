// The placed house furniture renderer (src/render/house_furniture.ts) in plain
// Node, the mobile_stations.test.ts idiom: THREE.Group/Mesh construct fine
// without a canvas, so the mirror's create, seat, model fill-in, remove,
// gated hold and dispose are assertable here. The kcas GLBs never load in
// Node, so a piece stands as its empty (click-proxy) group until the parts
// cache is filled by hand.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ENTITY_GATE_STAND_INS } from '../src/render/entity_gate_stand_in_core';
import {
  FURNITURE_RUG_HALF_X,
  FURNITURE_RUG_HALF_Z,
  type HouseFurnitureCompileGate,
  HouseFurnitureVisuals,
  houseFurnitureInternalsForTest,
} from '../src/render/house_furniture';
import { FURNITURE_DEFS } from '../src/sim/content/furniture';
import { furnitureTemplateId } from '../src/sim/housing/furniture_template';
import type { Entity } from '../src/sim/types';

function piece(id: number, itemId: string, pos = { x: 12, y: 0, z: -8 }, facing = 0.7): Entity {
  return {
    id,
    kind: 'object',
    templateId: furnitureTemplateId(itemId),
    name: 'hearth_floor_1',
    pos,
    facing,
    objectItemId: null,
    lootable: false,
  } as unknown as Entity;
}

function groupOf(scene: THREE.Scene, id: number): THREE.Object3D | undefined {
  return scene.children.find((c) => c.name === `houseFurniture:${id}`);
}

describe('HouseFurnitureVisuals', () => {
  it('mirrors a placed piece into the scene at its seat and removes it on despawn', () => {
    const scene = new THREE.Scene();
    const visuals = new HouseFurnitureVisuals(scene);
    const entities = new Map<number, Entity>([[7, piece(7, 'furn_woven_rug')]]);
    visuals.sync(entities);
    const group = groupOf(scene, 7) as THREE.Group;
    expect(group).toBeDefined();
    expect(group.position.x).toBe(12);
    expect(group.rotation.y).toBeCloseTo(0.7);
    // The rug is procedural: one plane of the catalog size, no GLB needed.
    const rug = group.children[0] as THREE.Mesh;
    expect(rug.isMesh).toBe(true);
    rug.geometry.computeBoundingBox();
    const box = rug.geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(FURNITURE_RUG_HALF_X * 2);
    expect(box.max.z - box.min.z).toBeCloseTo(FURNITURE_RUG_HALF_Z * 2);
    expect(visuals.standingIds()).toEqual([7]);
    // Steady state: a second read creates nothing new; a move re-seats.
    visuals.sync(entities);
    expect(scene.children.filter((c) => c.name === 'houseFurniture:7')).toHaveLength(1);
    entities.set(7, piece(7, 'furn_woven_rug', { x: 20, y: 0, z: 3 }));
    visuals.sync(entities);
    expect((groupOf(scene, 7) as THREE.Group).position.z).toBe(3);
    entities.clear();
    visuals.sync(entities);
    expect(groupOf(scene, 7)).toBeUndefined();
    expect(visuals.standingIds()).toEqual([]);
    visuals.dispose();
  });

  it('ignores every other object and fills a model in once its parts resolve', () => {
    const scene = new THREE.Scene();
    const visuals = new HouseFurnitureVisuals(scene);
    const chair = piece(1, 'furn_wooden_chair');
    const other = { ...piece(2, 'furn_wooden_chair'), templateId: 'ground_ironbark_log' } as Entity;
    const entities = new Map<number, Entity>([
      [1, chair],
      [2, other],
    ]);
    const { partsCache } = houseFurnitureInternalsForTest;
    partsCache.delete('wynRusticChair');
    visuals.sync(entities);
    expect(visuals.standingIds()).toEqual([1]);
    // Not loaded yet: the empty group stands in for the click proxy.
    expect((groupOf(scene, 1) as THREE.Group).children).toHaveLength(0);
    // The model lands: the next sync rebuilds the piece with it, at the
    // catalog scale.
    const geo = new THREE.BoxGeometry(1, 1, 1);
    partsCache.set('wynRusticChair', [{ geo, mat: new THREE.MeshBasicMaterial() }]);
    visuals.sync(entities);
    const group = groupOf(scene, 1) as THREE.Group;
    expect(group.children).toHaveLength(1);
    const scale = FURNITURE_DEFS.find((def) => def.itemId === 'furn_wooden_chair')!.scale;
    expect(group.children[0].scale.x).toBeCloseTo(scale);
    // And a third sync leaves it alone.
    visuals.sync(entities);
    expect(groupOf(scene, 1)).toBe(group);
    partsCache.delete('wynRusticChair');
    visuals.dispose();
    expect(groupOf(scene, 1)).toBeUndefined();
  });

  it('every catalog render key but the rug names a kcas template the mirror loads', () => {
    const keys = new Set<string>(houseFurnitureInternalsForTest.kcasKeys);
    for (const def of FURNITURE_DEFS) {
      if (def.renderKey === 'rug') continue;
      expect(keys.has(def.renderKey), def.itemId).toBe(true);
    }
  });

  it('holds a piece hidden behind the compile gate until it settles, and drops a retired hold', async () => {
    const scene = new THREE.Scene();
    let release: (() => void) | null = null;
    const gate: HouseFurnitureCompileGate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const visuals = new HouseFurnitureVisuals(scene, gate);
    const entities = new Map<number, Entity>([[3, piece(3, 'furn_woven_rug')]]);
    visuals.sync(entities);
    // Attached hidden while the gate is open.
    const group = groupOf(scene, 3) as THREE.Group;
    expect(group).toBeDefined();
    expect(group.visible).toBe(false);
    expect(release).not.toBeNull();
    release!();
    await new Promise((r) => setTimeout(r, 0));
    expect(group.visible).toBe(true);
    // A piece that despawns mid-hold is removed and never shown.
    const entities2 = new Map<number, Entity>([[4, piece(4, 'furn_woven_rug')]]);
    visuals.sync(entities2);
    expect(visuals.standingIds().sort()).toEqual([4]);
    const held = groupOf(scene, 4) as THREE.Group;
    expect(held.visible).toBe(false);
    entities2.clear();
    visuals.sync(entities2);
    release!();
    await new Promise((r) => setTimeout(r, 0));
    expect(groupOf(scene, 4)).toBeUndefined();
    visuals.dispose();
  });

  it('names its gate stand-in in the registry', () => {
    const row = ENTITY_GATE_STAND_INS.find((r) => r.file === 'src/render/house_furniture.ts');
    expect(row?.gate).toBe('attachSceneGroupGated');
    expect(row?.standIn).toContain('nameplate');
  });
});
