import { NodeIO } from '@gltf-transform/core';

const io = new NodeIO();
for (const f of process.argv.slice(2)) {
  const d = await io.read(f);
  const r = d.getRoot();
  const nodes = r
    .listNodes()
    .map(
      (n) =>
        `${n.getName()}[t=${n.getTranslation()} s=${n.getScale()} m=${n.getMesh() ? n.getMesh().listPrimitives().length : '-'}]`,
    );
  console.log(
    f.split(/[\\/]/).pop(),
    'scenes',
    r.listScenes().length,
    'meshes',
    r.listMeshes().length,
    'mats',
    r
      .listMaterials()
      .map((m) => m.getName())
      .join('|'),
    nodes.join(' '),
  );
}
