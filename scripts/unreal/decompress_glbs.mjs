// Unreal cannot read EXT_meshopt_compression or KHR_mesh_quantization. This writes plain,
// dequantized copies of the game GLBs (the originals are never touched) and repoints the
// manifest at them. Node transforms and mesh pivots are preserved exactly.
// Usage: node scripts/unreal/decompress_glbs.mjs <manifest.json> <outDir> [tiers]
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { dequantize, prune } from '@gltf-transform/functions';
import { mergeToSingleMesh } from './merge_meshes.mjs';

const [manifestPath, outDir, tiersArg] = process.argv.slice(2);
const tiers = (tiersArg ?? '1').split(',').map(Number);
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!man.srcRoot) man.srcRoot = man.modelsRoot;
let ok = 0;
let bad = 0;
for (const it of man.items) {
  if (!tiers.includes(it.tier)) continue;
  const out = path.join(outDir, it.cat, it.name + '.glb');
  if (fs.existsSync(out)) { it.local = out; continue; }
  try {
    const doc = await io.read(path.join(man.srcRoot, it.glb));
    // Drop authored LOD nodes (Nanite replaces them), keep sockets (empties) for the registry.
    for (const n of doc.getRoot().listNodes()) if (/(^|_)LOD[1-9]|Silhouette_LOD/.test(n.getName()) && n.getMesh()) n.setMesh(null);
    const sockets = doc.getRoot().listNodes().filter((n) => n.getName().startsWith('Socket_') && !n.getMesh()).map((n) => ({ name: n.getName(), pos: n.getWorldTranslation() }));
    await doc.transform(dequantize());
    it.prims = mergeToSingleMesh(doc, it.name);
    await doc.transform(prune());
    it.sockets = sockets;
    for (const ext of doc.getRoot().listExtensionsUsed()) {
      if (ext.extensionName === 'EXT_meshopt_compression' || ext.extensionName === 'KHR_mesh_quantization') ext.dispose();
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await io.write(out, doc);
    it.local = out;
    ok++;
  } catch (e) {
    bad++;
    console.log('FAIL', it.id, String(e).slice(0, 120));
  }
}
fs.writeFileSync(manifestPath, JSON.stringify(man, null, 1));
console.log('decompressed', ok, 'failed', bad);


