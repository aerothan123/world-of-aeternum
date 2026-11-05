import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as F from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const out = [];
out.push(
  'core ' + JSON.parse(fs.readFileSync('node_modules/@gltf-transform/core/package.json')).version,
);
out.push(
  'fns ' +
    Object.keys(F)
      .filter((k) => /transform|join|flatten|prune|dequant|weld|clear/i.test(k))
      .join(','),
);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const r = doc.getRoot();
  out.push(
    '== ' +
      f +
      ' ext=' +
      r
        .listExtensionsUsed()
        .map((e) => e.extensionName)
        .join(','),
  );
  for (const n of r.listNodes()) {
    const m = n.getMesh();
    out.push(
      ' node ' +
        n.getName() +
        (m
          ? ' mesh=' +
            m.getName() +
            ' prims=' +
            m.listPrimitives().length +
            ' attrs=' +
            m.listPrimitives()[0].listSemantics().join('|')
          : '') +
        (n.getSkin() ? ' SKIN' : ''),
    );
  }
  for (const mat of r.listMaterials()) {
    out.push(
      ' mat ' +
        mat.getName() +
        ' bc=' +
        mat
          .getBaseColorFactor()
          .map((v) => v.toFixed(2))
          .join(',') +
        ' tex=' +
        !!mat.getBaseColorTexture() +
        ' nrm=' +
        !!mat.getNormalTexture() +
        ' mr=' +
        !!mat.getMetallicRoughnessTexture() +
        ' m=' +
        mat.getMetallicFactor() +
        ' r=' +
        mat.getRoughnessFactor() +
        ' em=' +
        mat.getEmissiveFactor().join(',') +
        ' alpha=' +
        mat.getAlphaMode(),
    );
  }
  out.push(' anims=' + r.listAnimations().length + ' skins=' + r.listSkins().length);
}
fs.writeFileSync('C:/Users/cdero/Apps/woa-unreal-assets-ops/inspect.txt', out.join('\n'));
