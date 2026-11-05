// Merges every mesh node of a glTF document into ONE mesh (one primitive per material) with the
// node world transforms baked into the vertices. The result is a single identity node whose origin is
// the GLB root origin, so pivots stay exactly where the game puts them (Unreal then imports one
// StaticMesh per asset id with one material slot per game material).
export function mergeToSingleMesh(doc, name) {
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const out = doc.createMesh(name);
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    // inverse transpose of the upper 3x3 for normals
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const inv = 1 / (det || 1);
    const n = [
      (e * i - f * h) * inv, (f * g - d * i) * inv, (d * h - e * g) * inv,
      (c * h - b * i) * inv, (a * i - c * g) * inv, (b * g - a * h) * inv,
      (b * f - c * e) * inv, (c * d - a * f) * inv, (a * e - b * d) * inv,
    ];
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const np = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(4);
      for (const sem of prim.listSemantics()) {
        const acc = prim.getAttribute(sem).clone();
        const arr = acc.getArray();
        const cnt = acc.getCount();
        if (sem === 'POSITION') {
          for (let k = 0; k < cnt; k++) {
            const x = arr[k * 3], y = arr[k * 3 + 1], z = arr[k * 3 + 2];
            arr[k * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
            arr[k * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
            arr[k * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
          }
        } else if (sem === 'NORMAL' || sem === 'TANGENT') {
          const stride = sem === 'NORMAL' ? 3 : 4;
          const mat = sem === 'NORMAL' ? n : [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
          for (let k = 0; k < cnt; k++) {
            const x = arr[k * stride], y = arr[k * stride + 1], z = arr[k * stride + 2];
            let nx = mat[0] * x + mat[1] * y + mat[2] * z;
            let ny = mat[3] * x + mat[4] * y + mat[5] * z;
            let nz = mat[6] * x + mat[7] * y + mat[8] * z;
            const l = Math.hypot(nx, ny, nz) || 1;
            arr[k * stride] = nx / l; arr[k * stride + 1] = ny / l; arr[k * stride + 2] = nz / l;
          }
        }
        acc.setArray(arr);
        np.setAttribute(sem, acc);
      }
      const idx = prim.getIndices();
      if (idx) {
        const ic = idx.clone();
        if (det < 0) {
          const ia = ic.getArray();
          for (let k = 0; k + 2 < ia.length; k += 3) { const t = ia[k + 1]; ia[k + 1] = ia[k + 2]; ia[k + 2] = t; }
          ic.setArray(ia);
        }
        np.setIndices(ic);
      }
      out.addPrimitive(np);
    }
  }
  for (const node of root.listNodes()) if (node.getMesh()) node.setMesh(null);
  const host = doc.createNode(name).setMesh(out);
  scene.addChild(host);
  return out.listPrimitives().length;
}
