// Prepares the painted Tidehold village buildings (the ones EASTBROOK_LAYOUT.buildings places) for Unreal.
// Their baked base-colour and emissive textures are KTX2, which Unreal cannot read: they are transcoded
// to PNG next to the GLB and the GLB is written texture-free. The mesh merge keeps every node (L0, H1, H2,
// INT). The painted look stays in the PNGs; assign_materials.py binds them to the Wyndlewood masters.
// Usage (cwd = worktree): node scripts/unreal/prep_tidehold.mjs <manifest.json> <glbOutDir> <texOutDir>
import fs from 'node:fs';
import path from 'node:path';
import { ktx2ToPngBuffer } from './ktx2_png.mjs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { dequantize, prune } from '@gltf-transform/functions';
import { mergeToSingleMesh } from './merge_meshes.mjs';

const [manifestPath, glbOut, texOut] = process.argv.slice(2);
const NAMES = ['bank', 'smithy', 'tavern', 'hall', 'shop_a', 'house_b'];
async function ktx2ToPng(buf, out) {
  const r = await ktx2ToPngBuffer(buf);
  fs.writeFileSync(out, r.png);
  return { w: r.w, h: r.h, mean: r.mean };
}
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const report = [];
for (const n of NAMES) {
  const id = `tidehold/${n}`;
  const name = `SM_tidehold_${n}`;
  const doc = await io.read(path.join(man.srcRoot ?? man.modelsRoot, 'tidehold', `${n}.glb`));
  await doc.transform(dequantize());
  const matinfo = {};
  for (const m of doc.getRoot().listMaterials()) {
    const info = { color: m.getBaseColorFactor().slice(0, 3), emisFactor: m.getEmissiveFactor() };
    const dir = path.join(texOut, name);
    fs.mkdirSync(dir, { recursive: true });
    const safe = m.getName().replace(/[^A-Za-z0-9_]+/g, '_');
    const bt = m.getBaseColorTexture();
    if (bt && bt.getMimeType() === 'image/ktx2') {
      info.base = path.join(dir, `T_${name}_${safe}_base.png`);
      info.baseStats = await ktx2ToPng(bt.getImage(), info.base);
    }
    const et = m.getEmissiveTexture();
    if (et && et.getMimeType() === 'image/ktx2') {
      info.emis = path.join(dir, `T_${name}_${safe}_emis.png`);
      info.emisStats = await ktx2ToPng(et.getImage(), info.emis);
    }
    m.setBaseColorTexture(null).setEmissiveTexture(null).setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null);
    m.setEmissiveFactor([0, 0, 0]);
    matinfo[m.getName()] = info;
  }
  for (const node of doc.getRoot().listNodes()) {
    if (/(^|_)LOD[1-9]/.test(node.getName()) && node.getMesh()) node.setMesh(null);
  }
  const sockets = doc.getRoot().listNodes().filter((x) => x.getName().startsWith('Socket_') && !x.getMesh()).map((x) => ({ name: x.getName(), pos: x.getWorldTranslation() }));
  const nodesKept = doc.getRoot().listNodes().filter((x) => x.getMesh()).map((x) => x.getName());
  const prims = mergeToSingleMesh(doc, name);
  await doc.transform(prune());
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu'].includes(ext.extensionName)) ext.dispose();
  }
  const out = path.join(glbOut, 'Buildings', `${name}.glb`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  // Re-point (or add) the manifest entry: Buildings category, tier 6 so the generic batch driver skips it.
  let it = man.items.find((x) => x.id === id);
  if (!it) { it = { id, glb: `tidehold/${n}.glb`, bytes: 0 }; man.items.push(it); }
  Object.assign(it, { tier: 6, cat: 'Buildings', mat: 'Plaster', name, local: out, prims, sockets, matinfo });
  report.push({ id, prims, nodesKept: nodesKept.length, mats: Object.entries(matinfo).map(([k, v]) => `${k}:${v.baseStats ? v.baseStats.mean : '-'}|e:${v.emisStats ? v.emisStats.mean : '-'}`) });
}
fs.writeFileSync(manifestPath, JSON.stringify(man, null, 1));
console.log(JSON.stringify(report, null, 1));


