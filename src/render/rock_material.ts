// The world rock material and its colorway geometry (extracted from
// foliage.ts): one material for every rock and the merged 3-boulder cluster,
// baked moss-top and snow-dust vertex colours, and under World Style Refined
// the warm sky-fill correction (rock_material_core.ts holds the pure logic).
//
// No new GPU producer: the material is the same clone foliage.ts always drew,
// built once per foliage build; the colorway geometries are published to the
// foliage prewarm group (foliage.ts buildFoliageMaterialPrewarmGroup through
// foliagePrewarmDraws), so the Refined variant links in the existing
// 'foliage.materials' prewarm entry, never live.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyInstanceCollapse } from './foliage_collapse';
import { patchRefinedRockFragment, rockTopTint } from './rock_material_core';

/** The rock material drawn from the first rock model's own material. The
 *  source GLBs ship no COLOR_0, so the clone turns vertexColors on for the
 *  baked colorways; clone() drops shader hooks, so it re-takes the collapse
 *  window (the rock window on both arms). */
export function createRockMaterial(
  base: THREE.MeshStandardMaterial,
  refined: boolean,
): THREE.MeshStandardMaterial {
  const mat = base.clone();
  mat.vertexColors = true;
  applyInstanceCollapse(mat, 'rock');
  if (refined) {
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      prev.call(mat, shader, renderer);
      shader.fragmentShader = patchRefinedRockFragment(shader.fragmentShader);
    };
    mat.customProgramCacheKey = () => `${prevKey()}|ws-rock-fill`;
  }
  return mat;
}

/** Bake the moss / snow top tint into a rock geometry's vertex colours. */
export function bakeRockTopTint(
  geo: THREE.BufferGeometry,
  tint: THREE.Color,
): THREE.BufferGeometry {
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const arr = new Float32Array(nrm.count * 3);
  const t: [number, number, number] = [tint.r, tint.g, tint.b];
  for (let i = 0; i < nrm.count; i++) arr.set(rockTopTint(nrm.getY(i), t), i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const m = new THREE.Matrix4();
const v = new THREE.Vector3();
const q = new THREE.Quaternion();
const sv = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

/** One colorway: the single rocks tinted, plus the merged 3-boulder cluster
 *  built from them. Returns [single x N, cluster]. */
export function rockColorway(
  geometries: readonly THREE.BufferGeometry[],
  tint: THREE.Color,
): THREE.BufferGeometry[] {
  const singles = geometries.map((geo) => bakeRockTopTint(geo.clone(), tint));
  const member = (gi: number, x: number, y: number, z: number, ry: number, s: number) =>
    singles[gi % singles.length]
      .clone()
      .applyMatrix4(m.compose(v.set(x, y, z), q.setFromAxisAngle(up, ry), sv.set(s, s, s)));
  const cluster = mergeGeometries([
    member(0, -0.55, 0, 0.15, 0.3, 0.85),
    member(1, 0.95, -0.12, 0.45, 1.4, 0.62),
    member(2, 0.2, 0.6, -0.35, 2.4, 0.48),
  ]);
  return [...singles, cluster];
}
