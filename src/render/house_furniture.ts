// Placed house furniture (Project H housing, phase 2): the world props for the
// furniture ENTITIES standing in an owner's private house copy (kind 'object',
// templateId `furniture_<itemId>`, src/sim/housing/furniture_objects.ts).
// Mirrors them the way mobile_stations.ts mirrors the placed station: create
// on first appearance, re-seat on an authority move, remove on despawn. Each
// piece is the kcas furniture GLB its FurnitureDef names (content/furniture.ts
// renderKey), the very models the Dawnhold dressing instances, so a Wooden
// Chair at home is Dawnhold's chair; the rug is a flat plane (the rift decor
// rug's shape, smaller).
//
// A PREPARED GPU PRODUCER (src/render/CLAUDE.md, "GPU work: every new producer
// is a client of the scheduler"): every piece's group attaches through the
// host's compile gate (gated_scene_attach.ts), hidden until its programs link,
// under the label kind `house-furniture`. The kcas materials are the loader's
// shared instances (linked at boot wherever a dressed interior stood, for the
// INSTANCED draw; the plain-mesh program here is what the gate covers); the
// ENTITY's own invisible click proxy and nameplate (nameplate_view.ts feastNear
// admits a furniture templateId) stand in meanwhile. NO point light: a light
// added after boot changes numPointLights (a program-cache-key input).
//
// Models resolve through PROP_ASSET_DEFS urls via loadGltf (props.ts preloads
// the registry at boot, so these are cache hits); a model that fails to load
// leaves its pieces as the click proxy alone, never a broken scene.
//
// FAIRNESS: decoration only (walk-through, no gameplay read), so a graphics
// tier may shed nothing a player acts on by drawing less of it; today every
// tier draws every piece.

import * as THREE from 'three';
import { type FurnitureRenderKey, furnitureDefFor } from '../sim/content/furniture';
import { furnitureItemOf } from '../sim/housing/furniture_template';
import type { Entity } from '../sim/types';
import { loadGltf } from './assets/loader';
import { GPU_WORK_PRIORITY } from './background_gpu_queue';
import { attachSceneGroupGated, GatedSceneAttachCancelledError } from './gated_scene_attach';
import { GFX } from './gfx';
import { PROP_ASSET_DEFS } from './props';
import { setRenderCategory } from './renderer_diagnostics';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

export type HouseFurnitureCompileGate = (
  target: THREE.Object3D,
  label: string,
  priority: number,
) => Promise<unknown>;

/** The model keys the catalog can name (every FurnitureRenderKey but the
 *  rug): the kcas furniture set, since phase 3's home stations the two qprops
 *  station props the market stalls already place, and the painted Wyndlewood
 *  kit pieces. All resolve through PROP_ASSET_DEFS the same way. */
const KCAS_KEYS = [
  'kcasChair',
  'kcasStool',
  'kcasBench',
  'kcasTableRoundSmall',
  'kcasTableRoundMedium',
  'kcasTableLong',
  'kcasTableCloth',
  'kcasBookcase',
  'kcasKeg',
  'kcasBarrel',
  'kcasChest',
  'kcasShelfSmall',
  'kcasShelfCandles',
  'kcasBartopMedium',
  'kcasCandleTriple',
  'anvil',
  'weaponStand',
  // The painted Wyndlewood kit pieces (render/wyndlewood_props.ts registers
  // them in PROP_ASSET_DEFS like every key above).
  'wynCottageBed',
  'wynCottageTable',
  'wynCottageChair',
  'wynCottageShelf',
  'wynBraidedRug',
  'wynTableLantern',
  'wynSmallStorageChest',
  'wynFoldingWorktable',
] as const satisfies readonly Exclude<FurnitureRenderKey, 'rug'>[];
type KcasKey = (typeof KCAS_KEYS)[number];

/** The rug plane's half extents (yards) and its warm wool tint. */
export const FURNITURE_RUG_HALF_X = 1.5;
export const FURNITURE_RUG_HALF_Z = 2.25;
const RUG_COLOR = 0x6b2a1c;
const RUG_LIFT_Y = 0.02;

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

/** One standing piece while its entity exists. */
interface FurnitureVisual {
  group: THREE.Group;
  templateId: string | null;
  /** False while the piece stood up before its model had loaded: the next
   *  sync after the load rebuilds it with the model. */
  modelled: boolean;
}

const partsCache = new Map<KcasKey, Part[]>();
let loadTask: Promise<void> | null = null;

function ignoreRetiredAttach(error: unknown): void {
  if (!(error instanceof GatedSceneAttachCancelledError)) throw error;
}

// Bake a loaded scene into parts, xz-centered with min-y at 0 and normalized
// to unit height, so a FurnitureDef scale is the piece's height in yards.
// Geometry is cloned (loader cache results are immutable); the materials stay
// the loader's shared instances, marked shared so view disposal skips them.
function extractParts(scene: THREE.Group): Part[] {
  scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    parts.push({ geo: markSharedGeometry(geo), mat: markSharedMaterial(mat) });
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    box.union(p.geo.boundingBox as THREE.Box3);
  }
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const height = Math.max(box.max.y - box.min.y, 1e-3);
  for (const p of parts) {
    p.geo.translate(-cx, -box.min.y, -cz);
    p.geo.scale(1 / height, 1 / height, 1 / height);
    p.geo.computeBoundingBox();
    p.geo.computeBoundingSphere();
  }
  return parts;
}

/** Resolve every furniture GLB (cache hits after props.ts preloads). A model
 *  that fails to load resolves to no parts and its pieces stay click proxies. */
export function ensureHouseFurnitureModels(): Promise<void> {
  loadTask ??= Promise.all(
    KCAS_KEYS.map(async (key) => {
      try {
        const gltf = await loadGltf(PROP_ASSET_DEFS[key].url);
        partsCache.set(key, extractParts(gltf.scene));
      } catch {
        partsCache.set(key, []);
      }
    }),
  ).then(() => undefined);
  return loadTask;
}

export class HouseFurnitureVisuals {
  private readonly pieces = new Map<number, FurnitureVisual>();
  private readonly seen = new Set<number>();
  private readonly rugGeo: THREE.BufferGeometry;
  private readonly rugMat: THREE.Material;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly compileGate: HouseFurnitureCompileGate | null = null,
  ) {
    this.rugGeo = new THREE.PlaneGeometry(FURNITURE_RUG_HALF_X * 2, FURNITURE_RUG_HALF_Z * 2);
    this.rugGeo.rotateX(-Math.PI / 2);
    // One opaque material for every rug (no transparency: a second program
    // and a sort for a floor cloth nobody sees through).
    this.rugMat = GFX.standardMaterials
      ? new THREE.MeshStandardMaterial({ color: RUG_COLOR, roughness: 1 })
      : new THREE.MeshLambertMaterial({ color: RUG_COLOR });
    void ensureHouseFurnitureModels();
  }

  /** Mirrors the furniture entities: one entity-map walk plus set membership,
   *  no allocation in steady state (the mobile-station sync idiom). */
  sync(entities: ReadonlyMap<number, Entity>): void {
    if (this.disposed) return;
    this.seen.clear();
    for (const e of entities.values()) {
      if (e.kind !== 'object' || furnitureItemOf(e.templateId) === null) continue;
      this.seen.add(e.id);
      const existing = this.pieces.get(e.id);
      if (!existing) this.create(e);
      else if (existing.templateId !== e.templateId || (!existing.modelled && this.modelReady(e))) {
        this.remove(e.id, existing);
        this.create(e);
      } else if (!existing.group.position.equals(e.pos)) this.seat(existing.group, e);
    }
    for (const [id, visual] of this.pieces) {
      if (!this.seen.has(id)) this.remove(id, visual);
    }
  }

  /** Whether the model a furniture entity needs has resolved (a rug needs none). */
  private modelReady(e: Entity): boolean {
    const def = furnitureDefFor(furnitureItemOf(e.templateId));
    return def !== undefined && (def.renderKey === 'rug' || partsCache.has(def.renderKey));
  }

  /** Test and diagnostics window: the ids currently mirrored. */
  standingIds(): number[] {
    return [...this.pieces.keys()];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [id, visual] of this.pieces) this.remove(id, visual);
    this.rugGeo.dispose();
    this.rugMat.dispose();
  }

  private create(e: Entity): void {
    const itemId = furnitureItemOf(e.templateId);
    const def = furnitureDefFor(itemId);
    if (!def) return;
    const group = new THREE.Group();
    group.name = `houseFurniture:${e.id}`;
    this.seat(group, e);
    let modelled = true;
    if (def.renderKey === 'rug') {
      const rug = new THREE.Mesh(this.rugGeo, this.rugMat);
      rug.position.y = RUG_LIFT_Y;
      rug.receiveShadow = true;
      group.add(rug);
    } else {
      const parts = partsCache.get(def.renderKey);
      // Not loaded yet: the click proxy stands alone and `modelled` stays
      // false, so the sync after the load rebuilds the piece with its model
      // (a failed load resolves to an empty parts list and counts as done).
      modelled = parts !== undefined;
      if (parts) {
        for (const part of parts) {
          const mesh = new THREE.Mesh(part.geo, part.mat);
          mesh.scale.setScalar(def.scale);
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          group.add(mesh);
        }
      }
    }
    setRenderCategory(group, 'props');
    const record: FurnitureVisual = { group, templateId: e.templateId, modelled };
    this.pieces.set(e.id, record);
    this.attachGated(group, `house-furniture:${e.id}`, () => this.pieces.get(e.id) !== record);
  }

  /** The entity's seat, facing the anchor's yaw (the entity facing). */
  private seat(group: THREE.Group, e: Entity): void {
    group.position.copy(e.pos);
    group.rotation.set(0, e.facing, 0);
  }

  private remove(id: number, visual: FurnitureVisual): void {
    this.pieces.delete(id);
    this.scene.remove(visual.group);
  }

  private attachGated(group: THREE.Group, label: string, retired: () => boolean): void {
    const gate = this.compileGate;
    if (!gate) {
      this.scene.add(group);
      return;
    }
    void attachSceneGroupGated(
      this.scene,
      group,
      (target) => gate(target, label, GPU_WORK_PRIORITY.LIVE_VIEW),
      retired,
    ).catch(ignoreRetiredAttach);
  }
}

/** Test-only window. */
export const houseFurnitureInternalsForTest = {
  kcasKeys: KCAS_KEYS,
  partsCache,
};
