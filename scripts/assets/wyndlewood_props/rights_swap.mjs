// Asset rights: replace an inherited model IN PLACE with an original
// Wyndlewood model, keeping its path (so no code changes) and its size: the
// new model is wrapped in one parent node scaled uniformly to the old model's
// height and moved so its footprint centre and floor match the old one.
// usage: node scripts/assets/wyndlewood_props/rights_swap.mjs <newGlb>=<oldGlbPath> ...
import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const boundsOf = (doc) => getBounds(doc.getRoot().listScenes()[0]);
for (const pair of process.argv.slice(2)) {
  const [src, dst] = pair.split('=');
  const old = boundsOf(await io.readBinary(readFileSync(dst)));
  const doc = await io.readBinary(readFileSync(src));
  const scene = doc.getRoot().listScenes()[0];
  const b = boundsOf(doc);
  const hOld = old.max[1] - old.min[1];
  const hNew = b.max[1] - b.min[1];
  const k = hNew > 1e-6 ? hOld / hNew : 1;
  const wrap = doc.createNode('WynSwapRoot').setScale([k, k, k]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrap.addChild(child);
  }
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  const ox = (old.min[0] + old.max[0]) / 2;
  const oz = (old.min[2] + old.max[2]) / 2;
  wrap.setTranslation([ox - cx * k, old.min[1] - b.min[1] * k, oz - cz * k]);
  scene.addChild(wrap);
  writeFileSync(dst, await io.writeBinary(doc));
  console.log(`swapped ${dst} <- ${src} (scale ${k.toFixed(3)}, height ${hOld.toFixed(2)})`);
}
