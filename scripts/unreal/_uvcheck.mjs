import { NodeIO } from '@gltf-transform/core';

const d = await new NodeIO().read(process.argv[2]);
for (const m of d.getRoot().listMeshes()) {
  for (const p of m.listPrimitives()) {
    const uv = p.getAttribute('TEXCOORD_0');
    let r = 'NO UV';
    if (uv) {
      const a = uv.getArray();
      let u0 = 9e9,
        u1 = -9e9,
        v0 = 9e9,
        v1 = -9e9;
      for (let i = 0; i < a.length; i += 2) {
        u0 = Math.min(u0, a[i]);
        u1 = Math.max(u1, a[i]);
        v0 = Math.min(v0, a[i + 1]);
        v1 = Math.max(v1, a[i + 1]);
      }
      r = `u[${u0.toFixed(2)},${u1.toFixed(2)}] v[${v0.toFixed(2)},${v1.toFixed(2)}] n=${uv.getCount()}`;
    }
    console.log(p.getMaterial()?.getName(), r);
  }
}
