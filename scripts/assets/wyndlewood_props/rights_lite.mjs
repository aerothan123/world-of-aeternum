// Lite pass for replacements whose slot pins a small budget (the world-quest
// placer kit: one mesh of about a thousand triangles and one texture):
// simplify the mesh into the band and keep only the base colour map.
// usage: node scripts/assets/wyndlewood_props/rights_lite.mjs <min>-<max> <glb> ...
import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [band, ...files] = process.argv.slice(2);
const [lo, hi] = band.split('-').map(Number);
const target = (lo + hi) / 2;
const tris = (doc) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0);
for (const f of files) {
  const src = readFileSync(f);
  let best = null;
  for (const errScale of [0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1]) {
    const doc = await io.readBinary(src);
    for (const m of doc.getRoot().listMaterials()) {
      m.setNormalTexture(null)
        .setMetallicRoughnessTexture(null)
        .setOcclusionTexture(null)
        .setEmissiveTexture(null);
    }
    await doc.transform(dequantize(), weld());
    const n0 = tris(doc);
    if (n0 > hi)
      await doc.transform(
        simplify({ simplifier: MeshoptSimplifier, ratio: target / n0, error: errScale }),
      );
    await doc.transform(prune());
    const n = tris(doc);
    best = { doc, n };
    if (n >= lo && n <= hi) break;
  }
  if (best.n > hi) {
    // Seams lock the edge collapser: fall back to the sloppy simplifier on the index list.
    for (const prim of best.doc
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives())) {
      const pos = prim.getAttribute('POSITION').getArray();
      const idx = new Uint32Array(prim.getIndices().getArray());
      const want = Math.floor((target * 3 * idx.length) / 3 / best.n / 3) * 3;
      const [out] =
        MeshoptSimplifier.simplifySloppy.length >= 6
          ? MeshoptSimplifier.simplifySloppy(idx, new Float32Array(pos), 3, null, want, 1)
          : MeshoptSimplifier.simplifySloppy(idx, new Float32Array(pos), 3, want, 1);
      prim.getIndices().setArray(new Uint32Array(out));
    }
    best.n = tris(best.doc);
  }
  writeFileSync(f, await io.writeBinary(best.doc));
  console.log(
    `lite ${f}: ${best.n} triangles, textures ${best.doc.getRoot().listTextures().length}`,
  );
}
