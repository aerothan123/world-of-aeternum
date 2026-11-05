// Unreal cannot read EXT_meshopt_compression, KHR_mesh_quantization or KTX2 (KHR_texture_basisu) data.
// This writes plain copies of the game GLBs (originals untouched): dequantized, the base colour texture
// transcoded to an embedded PNG (all other textures dropped, the masters supply detail), authored LOD
// nodes removed, every mesh node merged into ONE mesh with transforms baked (pivot = GLB root origin).
// Output files that still contain KTX2 data from an older run are regenerated.
// Usage (cwd = worktree): node scripts/unreal/decompress_glbs.mjs <manifest.json> <outDir> [tiers]
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { ktx2ToPngBuffer } from './ktx2_png.mjs';
import { mergeToSingleMesh } from './merge_meshes.mjs';

const [manifestPath, outDir, tiersArg] = process.argv.slice(2);
const tiers = (tiersArg ?? '1').split(',').map(Number);
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!man.srcRoot) man.srcRoot = man.modelsRoot;
const matInfo = (doc) =>
  Object.fromEntries(
    doc
      .getRoot()
      .listMaterials()
      .map((m) => [
        m.getName(),
        { color: m.getBaseColorFactor().slice(0, 3), tex: !!m.getBaseColorTexture() },
      ]),
  );
let ok = 0;
let redone = 0;
let bad = 0;
for (const it of man.items) {
  if (!tiers.includes(it.tier) || it.tier === 6) continue; // tier 6 (tidehold) is built by prep_tidehold.mjs
  const out = path.join(outDir, it.cat, it.name + '.glb');
  let stale = false;
  if (fs.existsSync(out)) {
    try {
      const probe = await io.read(out);
      stale =
        probe
          .getRoot()
          .listTextures()
          .some((x) => x.getMimeType() === 'image/ktx2') ||
        probe
          .getRoot()
          .listExtensionsUsed()
          .some((e) => e.extensionName === 'KHR_texture_basisu');
      if (!stale) {
        it.local = out;
        if (!it.matinfo) it.matinfo = matInfo(probe);
        continue;
      }
    } catch {
      stale = true;
    }
  }
  try {
    const doc = await io.read(path.join(man.srcRoot, it.glb));
    for (const n of doc.getRoot().listNodes())
      if (/(^|_)LOD[1-9]|Silhouette_LOD/.test(n.getName()) && n.getMesh()) n.setMesh(null);
    const sockets = doc
      .getRoot()
      .listNodes()
      .filter((n) => n.getName().startsWith('Socket_') && !n.getMesh())
      .map((n) => ({ name: n.getName(), pos: n.getWorldTranslation() }));
    await doc.transform(dequantize());
    for (const m of doc.getRoot().listMaterials()) {
      const bt = m.getBaseColorTexture();
      if (bt && bt.getMimeType() === 'image/ktx2') {
        const r = await ktx2ToPngBuffer(bt.getImage());
        bt.setImage(new Uint8Array(r.png)).setMimeType('image/png');
      }
      m.setEmissiveTexture(null)
        .setNormalTexture(null)
        .setOcclusionTexture(null)
        .setMetallicRoughnessTexture(null);
    }
    it.prims = mergeToSingleMesh(doc, it.name);
    await doc.transform(prune({ keepAttributes: true }));
    it.matinfo = matInfo(doc);
    it.sockets = sockets;
    for (const ext of doc.getRoot().listExtensionsUsed()) {
      if (
        ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu'].includes(
          ext.extensionName,
        )
      )
        ext.dispose();
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await io.write(out, doc);
    it.local = out;
    if (stale) redone++;
    else ok++;
  } catch (e) {
    bad++;
    console.log('FAIL', it.id, String(e).slice(0, 160));
  }
}
fs.writeFileSync(manifestPath, JSON.stringify(man, null, 1));
console.log('decompressed', ok, 'regenerated (had KTX2)', redone, 'failed', bad);
