import * as THREE from 'three';
import { activeGatherNodes } from '../sim/data';
import type { GatherNodeDef, GatherNodeType } from '../sim/types';
import { terrainHeight } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';
import {
  type BatchReachState,
  FOG_REACH_HYSTERESIS,
  planBatchReach,
} from './gather_batch_reach_core';
import {
  DEPLETED_NODE_TYPES,
  DEPLETED_POLL_FRAMES,
  GATHER_NODE_MODEL_SCALE,
  GATHER_NODE_VARIANTS,
  type GatherNodeVariant,
  gatherNodeVariantFor,
  nodeShowsDepleted,
} from './gather_node_variant_core';
import { NODE_COLOR, NODE_Y_OFFSET, nodeTierScale } from './gather_nodes_lookup';
import { surfaceMat } from './gfx';
import { renderLayerDisabled } from './render_dev_flags';
import { casterShadowMayReachCamera, type ScenerySphere } from './resident_scenery_core';

// Visible markers for gatherable world nodes (ore/wood/herb). Content and
// placements come from sim/content/gather_nodes.ts (merged into
// sim/data.ts's GATHER_NODES); this module only draws them. No harvest logic
// here (see G3); these are static, unowned fixtures.
//
// Each node type is a small Tripo-generated GLB (see public/models/resources/
// CLAUDE.md for the generation/compression pipeline). Adding a node type
// requires a new entry in NODE_ASSET_URL here plus a matching entry in
// gather_nodes_lookup.ts (colors, used as the fallback-primitive tint) and
// the GatherNodeType union (sim/types.ts).
const NODE_ASSET_URL: Record<GatherNodeType, string> = {
  ore: '/models/resources/gather_ore_vein.glb',
  wood: '/models/resources/gather_wood_pile.glb',
  herb: '/models/resources/gather_herb_cluster.glb',
};

// Fallback primitive geometry, used only if a node's GLB has not finished
// loading yet by the time buildGatherNodes runs (headless/test hosts, or a
// slow preload race online). Kept tiny and deterministic, no textures.
const NODE_FALLBACK_GEOMETRY: Record<GatherNodeType, () => THREE.BufferGeometry> = {
  ore: () => new THREE.IcosahedronGeometry(0.7, 0),
  wood: () => new THREE.ConeGeometry(0.55, 1.8, 6),
  herb: () => new THREE.BoxGeometry(0.5, 0.5, 0.5),
};

// Per-material models (gather_node_variant_core.ts) and the harvested look
// each type swaps to while this viewer's respawn timer runs. Unlike the shared
// type models above these are pipeline props: base at y=0, so they sit on the
// ground with a small sink instead of NODE_Y_OFFSET. A variant or depleted
// model that has not loaded falls back to the type's shared model, and a
// type with no depleted model simply never swaps.
const NODE_VARIANT_URL: Record<GatherNodeVariant, string> = {
  ore_copper: '/models/resources/node_ore_copper.glb',
  ore_iron: '/models/resources/node_ore_iron.glb',
  ore_thorium: '/models/resources/node_ore_thorium.glb',
  herb_silverleaf: '/models/resources/node_herb_silverleaf.glb',
  herb_goldleaf: '/models/resources/node_herb_goldleaf.glb',
  herb_sunpetal: '/models/resources/node_herb_sunpetal.glb',
};
const NODE_DEPLETED_URL: Partial<Record<GatherNodeType, string>> = {
  ore: '/models/resources/node_ore_depleted.glb',
  herb: '/models/resources/node_herb_depleted.glb',
};
/** How far a based (y=0) pipeline model sinks into the ground, so uneven
 *  terrain under its footprint never shows a gap. */
const BASED_MODEL_SINK = -0.06;

const loadedNodeGltf = new Map<GatherNodeType, THREE.Group>();
const loadedVariantGltf = new Map<GatherNodeVariant, THREE.Group>();
const loadedDepletedGltf = new Map<GatherNodeType, THREE.Group>();

if (typeof window !== 'undefined') {
  for (const [type, url] of Object.entries(NODE_ASSET_URL) as [GatherNodeType, string][]) {
    registerDeferredPreload(() =>
      loadGltf(url).then((gltf) => {
        loadedNodeGltf.set(type, gltf.scene);
      }),
    );
  }
  for (const variant of GATHER_NODE_VARIANTS) {
    registerDeferredPreload(() =>
      loadGltf(NODE_VARIANT_URL[variant]).then((gltf) => {
        loadedVariantGltf.set(variant, gltf.scene);
      }),
    );
  }
  for (const type of DEPLETED_NODE_TYPES) {
    const url = NODE_DEPLETED_URL[type];
    if (!url) continue;
    registerDeferredPreload(() =>
      loadGltf(url).then((gltf) => {
        loadedDepletedGltf.set(type, gltf.scene);
      }),
    );
  }
}

/** Which batch key the instanced arm uses: one InstancedMesh per (zone, type)
 *  with the per-batch reach hide (`'coarse'`, the default), or the older
 *  (zone, type, 180 yd z-band) key with every batch drawn to the far plane
 *  (`'band'`, the `?gathercoarse=off` A/B arm). */
export type GatherBatchKeyMode = 'coarse' | 'band';

export interface GatherNodesView {
  group: THREE.Group;
  /** Per frame: the per-batch shadow shed while `sun.castShadow` is on, and
   *  the per-batch reach hide on every tier. `reach` is the horizontal
   *  distance beyond which a batch whose NEAREST node lies past it is hidden
   *  (the renderer passes its scenery cull far, at or outside the visible fog;
   *  indoors that max keeps the last OUTDOOR request, so the reach is the
   *  stale outdoor value and nothing hides that an interior fog would show). */
  update(camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight, reach: number): void;
}

// One entry per instanced batch (or per individual fallback node): the
// shadow shed's verdict and the reach hide's state compose into the casters'
// castShadow write, so a hidden batch never binds its depth program either.
interface GatherNodeEntry extends BatchReachState {
  readonly bounds: ScenerySphere | null;
  readonly casters: THREE.Mesh[];
  readonly batches: THREE.InstancedMesh[];
  readonly instanceCount: number;
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  casts: boolean;
  shown: boolean;
  /** The harvested-look swap, when the type has a loaded depleted model. */
  readonly twin: DepletedTwin | null;
}

interface GatherNodeBatch {
  type: GatherNodeType;
  zoneId: string;
  band: number;
  nodes: GatherNodeDef[];
}

const NO_NODES = new Float64Array(0);

function sphereOf(box: THREE.Box3): ScenerySphere {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return { x: sphere.center.x, y: sphere.center.y, z: sphere.center.z, radius: sphere.radius };
}

function writeCastShadow(entry: GatherNodeEntry): void {
  const casts = entry.casts && entry.shown;
  for (const mesh of entry.casters) mesh.castShadow = casts;
}

interface GatherNodeMeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  matrix: THREE.Matrix4;
  source: THREE.Mesh;
}

function shadowedClone(loaded: THREE.Group): THREE.Object3D {
  const inst = loaded.clone(true);
  inst.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return inst;
}

/** A based pipeline model's template, tagged with its ground offset. */
function basedTemplate(loaded: THREE.Group | undefined, scaleKey: string): THREE.Object3D | null {
  if (!loaded) return null;
  const inst = shadowedClone(loaded);
  inst.scale.setScalar(GATHER_NODE_MODEL_SCALE[scaleKey] ?? 1);
  inst.userData.gatherNodeYOffset = BASED_MODEL_SINK;
  return inst;
}

function templateYOffset(template: THREE.Object3D, type: GatherNodeType): number {
  const offset = template.userData.gatherNodeYOffset;
  return typeof offset === 'number' ? offset : NODE_Y_OFFSET[type];
}

function buildNodeTemplate(type: GatherNodeType): THREE.Object3D {
  const loaded = loadedNodeGltf.get(type);
  if (loaded) return shadowedClone(loaded);
  const geo = NODE_FALLBACK_GEOMETRY[type]();
  const mat = surfaceMat({ color: NODE_COLOR[type] });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function isOpaqueMaterial(material: THREE.Material): boolean {
  const physical = material as THREE.Material & { transmission?: number };
  return (
    material.visible &&
    !material.transparent &&
    material.opacity === 1 &&
    material.alphaTest === 0 &&
    !material.alphaHash &&
    !material.alphaToCoverage &&
    material.depthTest &&
    material.depthWrite &&
    material.colorWrite &&
    (physical.transmission ?? 0) === 0
  );
}

function gatherNodeMeshParts(template: THREE.Object3D): GatherNodeMeshPart[] | null {
  template.updateMatrixWorld(true);
  const parts: GatherNodeMeshPart[] = [];
  let supported = true;
  template.traverse((child) => {
    if (
      child instanceof THREE.Line ||
      child instanceof THREE.Points ||
      child instanceof THREE.Sprite ||
      child instanceof THREE.SkinnedMesh
    ) {
      supported = false;
      return;
    }
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    if (
      materials.some((material) => !isOpaqueMaterial(material)) ||
      Object.keys(child.geometry.morphAttributes).length > 0
    ) {
      supported = false;
      return;
    }
    parts.push({
      geometry: child.geometry,
      material: child.material,
      matrix: child.matrixWorld.clone(),
      source: child,
    });
  });
  return supported && parts.length > 0 ? parts : null;
}

// Under the coarse key a batch's band is its first node's band (kept for the
// mesh name and userData.gatherNodeBand). Map insertion order over the
// content list keeps the batch order deterministic under both keys.
function gatherNodeBatches(
  nodes: readonly GatherNodeDef[],
  mode: GatherBatchKeyMode,
): GatherNodeBatch[] {
  const byKey = new Map<string, GatherNodeBatch>();
  for (const node of nodes) {
    const band = Math.floor(node.pos.z / 180);
    const key =
      mode === 'band' ? `${node.zoneId}:${node.type}:${band}` : `${node.zoneId}:${node.type}`;
    let batch = byKey.get(key);
    if (!batch) {
      batch = { type: node.type, zoneId: node.zoneId, band, nodes: [] };
      byKey.set(key, batch);
    }
    batch.nodes.push(node);
  }
  return [...byKey.values()];
}

function copyMeshRenderState(source: THREE.Mesh, target: THREE.InstancedMesh): void {
  target.castShadow = source.castShadow;
  target.receiveShadow = source.receiveShadow;
  target.layers.mask = source.layers.mask;
  target.renderOrder = source.renderOrder;
  target.frustumCulled = source.frustumCulled;
  target.customDepthMaterial = source.customDepthMaterial;
  target.customDistanceMaterial = source.customDistanceMaterial;
  target.onBeforeRender = source.onBeforeRender;
  target.onAfterRender = source.onAfterRender;
  target.onBeforeShadow = source.onBeforeShadow;
  target.onAfterShadow = source.onAfterShadow;
}

// DELIBERATELY NOT on the shared glb_instanced_props kernel (stations and
// farm_patches adopted it at farming Phase 7 QA): this variant composes
// per-(part, instance) matrices with per-instance tier scale and base
// anchoring, carries picker userData tables, and mirrors shadow render state,
// so only the ~8-line InstancedMesh tail would be shared and the adoption
// would be abstraction for uniformity, not reuse.
/** The UNSCALED template bounds' minY, per BUILD and not module-level: the
 *  GLBs can finish loading between one build and a later one (the
 *  fallback-primitive race), and a stale cache would then anchor fresh GLB
 *  instances with the primitive's minY. The base anchor needs the
 *  geometry-space minY of the whole template (the parts union, each in its
 *  baked local transform). A degenerate box (no geometry yet) reads 0 and the
 *  anchor is a no-op. */
function partsMinY(parts: readonly GatherNodeMeshPart[]): number {
  const partBox = new THREE.Box3();
  const templateBox = new THREE.Box3();
  for (const part of parts) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) {
      partBox.copy(part.geometry.boundingBox).applyMatrix4(part.matrix);
      templateBox.union(partBox);
    }
  }
  return Number.isFinite(templateBox.min.y) ? templateBox.min.y : 0;
}

/** One instanced mesh per template part over every node of the batch, its
 *  matrices placed. Returns the meshes plus each one's placed matrices (the
 *  depleted swap restores them). */
function placeInstancedParts(
  group: THREE.Group,
  batch: GatherNodeBatch,
  parts: readonly GatherNodeMeshPart[],
  yOffset: number,
  seed: number,
  tag: string,
): { meshes: THREE.InstancedMesh[]; placed: Float32Array[] } {
  const placement = new THREE.Matrix4();
  const tierMatrix = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();
  const scaleVec = new THREE.Vector3();
  const minY = partsMinY(parts);
  const nodeIds = batch.nodes.map((node) => node.id);
  const meshes: THREE.InstancedMesh[] = [];
  const placed: Float32Array[] = [];
  for (const [partIndex, part] of parts.entries()) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, batch.nodes.length);
    mesh.name = `gatherNodes:${batch.zoneId}:${batch.type}:${batch.band}:${tag}${partIndex}`;
    // Raycaster intersections carry the instance index, which resolves through
    // this stable content-order table without widening the renderer's picker.
    mesh.userData.gatherNodeIds = nodeIds;
    mesh.userData.gatherNodeZoneId = batch.zoneId;
    mesh.userData.gatherNodeType = batch.type;
    mesh.userData.gatherNodeBand = batch.band;
    copyMeshRenderState(part.source, mesh);
    for (const [instanceId, node] of batch.nodes.entries()) {
      const y = terrainHeight(node.pos.x, node.pos.z, seed);
      // Tier differentiation (the UX pass): size, never hue, identical on
      // every preset (gather_nodes_lookup.ts nodeTierScale), anchored at
      // the BASE and not the geometry center (the phase 14 QA): the prop
      // geometries are centered in Y, so a center-anchored upscale pushes
      // the base (s - 1) * |minY| deeper and a tier-3 prop sinks visibly
      // into the terrain. Compensate so the base sits at the same height
      // above ground at every tier.
      // A Studio map's size and turn (sim/moved_objects.ts) ride the same
      // base-anchored scale; built-in rows carry neither, so their matrices
      // are exactly the tier scale they always were.
      const tierScale = nodeTierScale(node.tier) * (node.scale ?? 1);
      placement.makeTranslation(node.pos.x, y + yOffset - (tierScale - 1) * minY, node.pos.z);
      if (node.rotY === undefined) tierMatrix.makeScale(tierScale, tierScale, tierScale);
      else tierMatrix.makeRotationY(node.rotY).scale(scaleVec.setScalar(tierScale));
      instanceMatrix.multiplyMatrices(placement, tierMatrix).multiply(part.matrix);
      mesh.setMatrixAt(instanceId, instanceMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    placed.push(new Float32Array(mesh.instanceMatrix.array));
    meshes.push(mesh);
    group.add(mesh);
  }
  return { meshes, placed };
}

const HIDDEN_INSTANCE = new THREE.Matrix4().makeScale(0, 0, 0);

/** Show one instance of a part set (its placed matrix) or hide it (zero scale). */
function writeInstance(
  meshes: readonly THREE.InstancedMesh[],
  placed: readonly Float32Array[],
  instanceId: number,
  show: boolean,
): void {
  for (const [i, mesh] of meshes.entries()) {
    if (show) {
      const offset = instanceId * 16;
      mesh.instanceMatrix.array.set(placed[i].subarray(offset, offset + 16), offset);
    } else {
      mesh.setMatrixAt(instanceId, HIDDEN_INSTANCE);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A batch's harvested twin: the depleted model at every node, every instance
 *  hidden until that node's respawn timer runs for this viewer. Built at world
 *  build with the rest of the group, so its programs link with the batch's
 *  and a swap never mints a material in a live frame. */
interface DepletedTwin {
  readonly nodeIds: readonly string[];
  readonly live: { meshes: THREE.InstancedMesh[]; placed: Float32Array[] };
  readonly twin: { meshes: THREE.InstancedMesh[]; placed: Float32Array[] };
  readonly depleted: Uint8Array;
}

function addInstancedBatch(
  group: THREE.Group,
  batch: GatherNodeBatch,
  parts: GatherNodeMeshPart[],
  yOffset: number,
  seed: number,
  entries: GatherNodeEntry[],
  depletedParts: { parts: GatherNodeMeshPart[]; yOffset: number } | null,
): void {
  // The authored node.pos, exact: the placement carries no horizontal
  // offset, so the reach measures the instance's true footprint.
  const xs = new Float64Array(batch.nodes.length);
  const zs = new Float64Array(batch.nodes.length);
  for (const [instanceId, node] of batch.nodes.entries()) {
    xs[instanceId] = node.pos.x;
    zs[instanceId] = node.pos.z;
  }
  const live = placeInstancedParts(group, batch, parts, yOffset, seed, '');
  const batches = [...live.meshes];
  let twin: DepletedTwin | null = null;
  if (depletedParts) {
    const placedTwin = placeInstancedParts(
      group,
      batch,
      depletedParts.parts,
      depletedParts.yOffset,
      seed,
      'depleted:',
    );
    for (const mesh of placedTwin.meshes) {
      mesh.userData.gatherNodeDepleted = true;
      for (let i = 0; i < batch.nodes.length; i++) mesh.setMatrixAt(i, HIDDEN_INSTANCE);
      mesh.instanceMatrix.needsUpdate = true;
    }
    batches.push(...placedTwin.meshes);
    twin = {
      nodeIds: batch.nodes.map((node) => node.id),
      live,
      twin: placedTwin,
      depleted: new Uint8Array(batch.nodes.length),
    };
  }
  // Instance transforms are baked into world space. Union every mesh part so
  // one castShadow decision conservatively covers the regional batch.
  const batchBounds = new THREE.Box3();
  const casters: THREE.Mesh[] = [];
  for (const mesh of batches) {
    if (mesh.boundingBox) batchBounds.union(mesh.boundingBox);
    if (mesh.castShadow) casters.push(mesh);
  }
  entries.push({
    bounds: casters.length > 0 && !batchBounds.isEmpty() ? sphereOf(batchBounds) : null,
    casters,
    batches,
    instanceCount: batch.nodes.length,
    xs,
    zs,
    casts: true,
    shown: true,
    twin,
  });
}

function addIndividualNode(
  group: THREE.Group,
  template: THREE.Object3D,
  node: GatherNodeDef,
  seed: number,
  entries: GatherNodeEntry[],
): void {
  const obj = template.clone(true);
  const y = terrainHeight(node.pos.x, node.pos.z, seed);
  // Tier scale with the same base anchor as the instanced path: measure the
  // clone's UNSCALED bounds at the origin (fresh per build, the
  // fallback-primitive race), then compensate the upscale's push so the
  // prop base sits at the same height above ground at every tier.
  const templateBox = new THREE.Box3().setFromObject(obj);
  const minY = Number.isFinite(templateBox.min.y) ? templateBox.min.y : 0;
  const tierScale = nodeTierScale(node.tier) * (node.scale ?? 1);
  obj.scale.setScalar(tierScale);
  if (node.rotY !== undefined) obj.rotation.y = node.rotY;
  const yOffset = templateYOffset(template, node.type);
  obj.position.set(node.pos.x, y + yOffset - (tierScale - 1) * minY, node.pos.z);
  obj.name = node.id;
  obj.userData.gatherNodeId = node.id;
  group.add(obj);
  const casters: THREE.Mesh[] = [];
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.castShadow) casters.push(child);
  });
  // An individual node has no instance count to hide through: shadow shed
  // only, never on the reach list (an empty batch would measure Infinity).
  if (casters.length > 0) {
    entries.push({
      bounds: sphereOf(new THREE.Box3().setFromObject(obj)),
      casters,
      batches: [],
      instanceCount: 0,
      xs: NO_NODES,
      zs: NO_NODES,
      casts: true,
      shown: true,
      twin: null,
    });
  }
}

/** The per-viewer harvest read the depleted swap polls (IWorld professions facet). */
export interface GatherNodeRespawnRead {
  nodeRespawnSeconds(nodeId: string): number | null;
}

/** Optional per-material and harvested-look templates (absent: shared models only). */
export interface GatherNodeExtraTemplates {
  readonly variants?: ReadonlyMap<GatherNodeVariant, THREE.Object3D>;
  readonly depleted?: ReadonlyMap<GatherNodeType, THREE.Object3D>;
  readonly respawn?: GatherNodeRespawnRead;
}

function buildGatherNodesFromTemplates(
  seed: number,
  templates: ReadonlyMap<GatherNodeType, THREE.Object3D>,
  nodes: readonly GatherNodeDef[],
  mode: GatherBatchKeyMode,
  extra: GatherNodeExtraTemplates = {},
): GatherNodesView {
  const group = new THREE.Group();
  group.name = 'gatherNodes';
  const entries: GatherNodeEntry[] = [];
  const partsByTemplate = new Map<THREE.Object3D, GatherNodeMeshPart[] | null>();
  const partsOf = (template: THREE.Object3D): GatherNodeMeshPart[] | null => {
    if (!partsByTemplate.has(template)) {
      partsByTemplate.set(template, gatherNodeMeshParts(template));
    }
    return partsByTemplate.get(template) ?? null;
  };
  for (const batch of gatherNodeBatches(nodes, mode)) {
    const variant = gatherNodeVariantFor(batch.type, batch.zoneId);
    const template =
      (variant ? extra.variants?.get(variant) : undefined) ?? templates.get(batch.type);
    if (!template) throw new Error(`Missing gather node render template: ${batch.type}`);
    const parts = partsOf(template);
    if (parts) {
      // The harvested twin needs a respawn read to ever show, and an
      // instanced shape of its own; otherwise the batch keeps one look.
      const depletedTemplate = extra.respawn ? extra.depleted?.get(batch.type) : undefined;
      const depletedParts = depletedTemplate ? partsOf(depletedTemplate) : null;
      const yOffset = templateYOffset(template, batch.type);
      const twin =
        depletedTemplate && depletedParts
          ? { parts: depletedParts, yOffset: templateYOffset(depletedTemplate, batch.type) }
          : null;
      addInstancedBatch(group, batch, parts, yOffset, seed, entries, twin);
      continue;
    }
    // Preserve the authored hierarchy and draw order if a future asset uses
    // transparent, alpha-tested, skinned, morphed, line, point, or sprite
    // rendering. Those cases are not safe to consolidate.
    for (const node of batch.nodes) {
      addIndividualNode(group, template, node, seed, entries);
    }
  }
  const shadowEntries = entries.filter((entry) => entry.bounds !== null);
  // The band arm draws every batch to the far plane (today's behaviour), so
  // its reach list is empty and update() is the shadow shed alone.
  const reachEntries = mode === 'coarse' ? entries.filter((entry) => entry.batches.length > 0) : [];
  const cameraForward = new THREE.Vector3();
  const lightDirection = new THREE.Vector3();
  const cameraState = {
    position: new THREE.Vector3(),
    forward: cameraForward,
    near: 0,
  };
  const flips: number[] = [];
  const twinEntries = entries.filter((entry) => entry.twin !== null);
  const respawn = extra.respawn;
  let pollFrame = 0;
  return {
    group,
    update(camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight, reach: number): void {
      // The harvested look: a cadenced poll, and only over batches in reach
      // (a hidden batch draws nothing either way; it catches up the frame it
      // returns). Writes only on a flip, so a steady world uploads nothing.
      if (respawn && twinEntries.length > 0 && ++pollFrame >= DEPLETED_POLL_FRAMES) {
        pollFrame = 0;
        for (const entry of twinEntries) {
          const twin = entry.twin;
          if (!twin || !entry.shown) continue;
          for (let i = 0; i < twin.nodeIds.length; i++) {
            const depleted = nodeShowsDepleted(respawn.nodeRespawnSeconds(twin.nodeIds[i])) ? 1 : 0;
            if (depleted === twin.depleted[i]) continue;
            twin.depleted[i] = depleted;
            writeInstance(twin.live.meshes, twin.live.placed, i, depleted === 0);
            writeInstance(twin.twin.meshes, twin.twin.placed, i, depleted === 1);
          }
        }
      }
      if (sun.castShadow) {
        lightDirection.subVectors(sun.position, sun.target.position).normalize();
        camera.getWorldDirection(cameraForward);
        cameraState.position.copy(camera.position);
        cameraState.near = camera.near;
        for (const entry of shadowEntries) {
          if (!entry.bounds) continue;
          const casts = casterShadowMayReachCamera(entry.bounds, cameraState, lightDirection);
          if (casts === entry.casts) continue;
          entry.casts = casts;
          writeCastShadow(entry);
        }
      }
      // The hide is `count`, never `visible` and never a bounds recompute: the
      // mesh stays a compile-lane root with its build-time sphere, and three
      // draws nothing for a count-0 InstancedMesh in the colour pass while the
      // composed castShadow keeps it out of the shadow pass.
      const flipped = planBatchReach(
        reachEntries,
        camera.position.x,
        camera.position.z,
        reach,
        FOG_REACH_HYSTERESIS,
        flips,
      );
      for (let i = 0; i < flipped; i++) {
        const entry = reachEntries[flips[i]];
        const count = entry.shown ? entry.instanceCount : 0;
        for (const mesh of entry.batches) mesh.count = count;
        writeCastShadow(entry);
      }
    },
  };
}

/** The session's batch key: the band arm only under `?gathercoarse=off`. */
export function gatherBatchKeyMode(): GatherBatchKeyMode {
  return renderLayerDisabled('gathercoarse') ? 'band' : 'coarse';
}

export function buildGatherNodes(
  seed: number,
  mode: GatherBatchKeyMode = gatherBatchKeyMode(),
  respawn?: GatherNodeRespawnRead,
): GatherNodesView {
  // activeGatherNodes(), never the raw table: on an authored map it is empty,
  // because these veins are pinned to shipped overworld coordinates and would
  // otherwise erupt wherever the built-in world's ore happens to sit (on one
  // authored map, ore and herbs through a town and 223k triangles a frame to
  // draw them). Building no templates at all also
  // keeps the node GLBs out of the world-entry decode.
  const nodes = activeGatherNodes();
  const templates = new Map<GatherNodeType, THREE.Object3D>();
  const variants = new Map<GatherNodeVariant, THREE.Object3D>();
  const depleted = new Map<GatherNodeType, THREE.Object3D>();
  for (const node of nodes) {
    if (!templates.has(node.type)) templates.set(node.type, buildNodeTemplate(node.type));
    const variant = gatherNodeVariantFor(node.type, node.zoneId);
    if (variant && !variants.has(variant)) {
      const template = basedTemplate(loadedVariantGltf.get(variant), variant);
      if (template) variants.set(variant, template);
    }
    if (!depleted.has(node.type)) {
      const template = basedTemplate(loadedDepletedGltf.get(node.type), `depleted_${node.type}`);
      if (template) depleted.set(node.type, template);
    }
  }
  return buildGatherNodesFromTemplates(seed, templates, nodes, mode, {
    variants,
    depleted,
    respawn,
  });
}

export function gatherNodeIdFromIntersection(
  hit: THREE.Intersection<THREE.Object3D>,
): string | null {
  const instanceIds = hit.object.userData.gatherNodeIds;
  if (hit.instanceId !== undefined && Array.isArray(instanceIds)) {
    const id = instanceIds[hit.instanceId];
    if (typeof id === 'string') return id;
  }
  let object: THREE.Object3D | null = hit.object;
  while (object) {
    if (typeof object.userData.gatherNodeId === 'string') {
      return object.userData.gatherNodeId as string;
    }
    object = object.parent;
  }
  return null;
}

// Structural raycast-hit shape shared with THREE.Intersection, so the
// resolver is Node-testable without a renderer.
export interface GatherNodePickHit {
  object: { userData: Record<string, unknown>; parent?: unknown } | null;
  instanceId?: number;
}

/**
 * Resolve a raycast hit list to a gather-node content id. Instanced batches
 * resolve through instanceId against their stable id list, while authored
 * hierarchy fallbacks walk parents for the legacy per-object id.
 */
export function resolveGatherNodePick(hits: readonly GatherNodePickHit[]): string | null {
  for (const hit of hits) {
    const ids = hit.object?.userData.gatherNodeIds;
    if (Array.isArray(ids) && typeof hit.instanceId === 'number') {
      const id = ids[hit.instanceId];
      if (typeof id === 'string') return id;
    }
    let object = hit.object ?? null;
    while (object) {
      if (typeof object.userData.gatherNodeId === 'string') {
        return object.userData.gatherNodeId as string;
      }
      object = (object.parent ?? null) as GatherNodePickHit['object'];
    }
  }
  return null;
}

/** Test-only window into the preload asset set (mirrors props.ts). */
export const gatherNodePreloadInternalsForTest = {
  nodeAssetUrl: NODE_ASSET_URL,
  nodeVariantUrl: NODE_VARIANT_URL,
  nodeDepletedUrl: NODE_DEPLETED_URL,
  buildFromTemplates: buildGatherNodesFromTemplates,
};
