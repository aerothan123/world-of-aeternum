// Fit the painted split-rail fence (a Tripo source in assets_src/props/) onto
// the village fence module's authored frame, so props.ts places it exactly
// like the old KayKit rail: length 0.79 along local +x, top at 0.326 (the
// placement scales it about 2.9x, landing the rail top at FENCE_RAIL_HEIGHT,
// the sight-line constant in src/sim/fence_dims.ts), base at the ground, and
// depth well inside the sim's fence collider (FENCE_HALF_DEPTH).
//
// node scripts/assets/fit_village_fence.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dequantize,
  getBounds,
  meshopt,
  simplify,
  transformPrimitive,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const SRC = 'assets_src/props/village_fence.glb';
const OUT = 'public/models/props/fence.glb';
/** The old module's authored frame (re-measured from the shipped KayKit rail). */
export const FENCE_FRAME = { length: 0.79, height: 0.326, minY: -0.003, maxDepth: 0.2 };
/** Shipped triangle ceiling. The village lays hundreds of rail modules (and
 *  every one casts a shadow), so the full Tripo rail put the fences alone
 *  over a hundred thousand triangles a view; pinned by
 *  tests/village_fence_budget.test.ts. */
export const FENCE_TRIANGLE_BUDGET = 600;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.listScenes()[0];
await doc.transform(dequantize());
// bake every mesh node's world matrix into its primitives first
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const w = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) transformPrimitive(prim, w);
}
for (const node of root.listNodes())
  node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const b0 = getBounds(scene);
const size = b0.max.map((v, i) => v - b0.min[i]);
// The source rail runs along whichever horizontal axis is longer; turn it onto +x.
const alongZ = size[2] > size[0];
const len = alongZ ? size[2] : size[0];
const dep = alongZ ? size[0] : size[2];
const s = FENCE_FRAME.length / len;
const sy = FENCE_FRAME.height / size[1];
const sd = Math.min(s, FENCE_FRAME.maxDepth / dep);
const cx = (b0.min[0] + b0.max[0]) / 2;
const cz = (b0.min[2] + b0.max[2]) / 2;
// column-major mat4: optional 90 degree yaw (z to x), then scale, centred
const m = alongZ
  ? [0, 0, -sd, 0, 0, sy, 0, 0, s, 0, 0, 0, -cz * s, FENCE_FRAME.minY - b0.min[1] * sy, cx * sd, 1]
  : [s, 0, 0, 0, 0, sy, 0, 0, 0, 0, sd, 0, -cx * s, FENCE_FRAME.minY - b0.min[1] * sy, -cz * sd, 1];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) transformPrimitive(prim, m);
  node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
// props.ts keys its material conversion and the wood surface-detail family
// on the material name; the rail keeps the old module's.
for (const mat of root.listMaterials()) mat.setName('Wood');
for (const mesh of root.listMeshes()) mesh.setName('Fence');
const triangles = () =>
  root
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce(
      (n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3,
      0,
    );
const rawTris = triangles();
for (const error of [0.01, 0.03, 0.08]) {
  if (triangles() <= FENCE_TRIANGLE_BUDGET) break;
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: FENCE_TRIANGLE_BUDGET / triangles(), error }),
  );
}
console.log('fence triangles', rawTris, '->', triangles());
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT, doc);
const b = getBounds(scene);
console.log(
  'fence',
  OUT,
  'min',
  b.min.map((v) => +v.toFixed(3)),
  'max',
  b.max.map((v) => +v.toFixed(3)),
);
