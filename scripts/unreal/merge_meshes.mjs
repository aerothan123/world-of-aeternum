// Eastbrook town buildings carry COLOR_0 values that the web client classifies into surface
// semantics (eastbrookTownSemanticForColor in src/render/eastbrook_surface_atlas.ts). The same
// palette is mirrored here so each semantic becomes its own material slot in Unreal.
const hexLin = (h) =>
  [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
const PALETTE = [
  [0x30343a, 'darkStoneBlocks'],
  [0x555b61, 'mediumGrayStone'],
  [0x777d80, 'lightStoneBlocks'],
  [0x979b98, 'lightGrayStone'],
  [0x706b62, 'warmPlaster'],
  [0x999388, 'warmPlaster'],
  [0xb7b0a2, 'warmPlaster'],
  [0x211813, 'verticalDarkTimber'],
  [0x33251c, 'verticalDarkTimber'],
  [0x4c3829, 'horizontalWarmTimber'],
  [0x704e32, 'horizontalWarmTimber'],
  [0x0c2454, 'cobaltRoofShingles'],
  [0x153b88, 'cobaltRoofShingles'],
  [0x2658b1, 'cobaltRoofShingles'],
  [0x31363b, 'darkForgedMetal'],
  [0x596067, 'darkForgedMetal'],
  [0xa27320, 'warmGoldMetal'],
  [0xd4a23c, 'warmGoldMetal'],
  [0xffa127, 'mediumGrayStone'],
  [0xffdc77, 'mediumGrayStone'],
  [0x21c6e8, 'cyanCrystal'],
  [0x83efff, 'cyanCrystal'],
  [0x315b9d, 'blueCreamCanvas'],
  [0xd6c29d, 'blueCreamCanvas'],
  [0xaa4c39, 'redCreamCanvas'],
  [0x788f36, 'darkBrownLeather'],
  [0xd4a12e, 'darkBrownLeather'],
  [0xa95a45, 'darkBrownLeather'],
  [0x183e64, 'irregularDarkStone'],
  [0x181718, 'darkForgedMetal'],
].map(([h, s]) => ({ c: hexLin(h), s }));
export function semanticForColor(r, g, b) {
  let best = PALETTE[0];
  let bd = Infinity;
  for (const p of PALETTE) {
    const d = (r - p.c[0]) ** 2 + (g - p.c[1]) ** 2 + (b - p.c[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best.s;
}
// Merges every mesh node of a glTF document into ONE mesh (one primitive per material) with the
// node world transforms baked into the vertices. The result is a single identity node whose origin is
// the GLB root origin, so pivots stay exactly where the game puts them (Unreal then imports one
// StaticMesh per asset id with one material slot per game material).
export function mergeToSingleMesh(doc, name) {
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const out = doc.createMesh(name);
  const semMats = new Map();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const det =
      m[0] * (m[5] * m[10] - m[9] * m[6]) -
      m[4] * (m[1] * m[10] - m[9] * m[2]) +
      m[8] * (m[1] * m[6] - m[5] * m[2]);
    // inverse transpose of the upper 3x3 for normals
    const a = m[0],
      b = m[4],
      c = m[8],
      d = m[1],
      e = m[5],
      f = m[9],
      g = m[2],
      h = m[6],
      i = m[10];
    const inv = 1 / (det || 1);
    const n = [
      (e * i - f * h) * inv,
      (f * g - d * i) * inv,
      (d * h - e * g) * inv,
      (c * h - b * i) * inv,
      (a * i - c * g) * inv,
      (b * g - a * h) * inv,
      (b * f - c * e) * inv,
      (c * d - a * f) * inv,
      (a * e - b * d) * inv,
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
            const x = arr[k * 3],
              y = arr[k * 3 + 1],
              z = arr[k * 3 + 2];
            arr[k * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
            arr[k * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
            arr[k * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
          }
        } else if (sem === 'NORMAL' || sem === 'TANGENT') {
          const stride = sem === 'NORMAL' ? 3 : 4;
          const mat =
            sem === 'NORMAL' ? n : [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
          for (let k = 0; k < cnt; k++) {
            const x = arr[k * stride],
              y = arr[k * stride + 1],
              z = arr[k * stride + 2];
            const nx = mat[0] * x + mat[1] * y + mat[2] * z;
            const ny = mat[3] * x + mat[4] * y + mat[5] * z;
            const nz = mat[6] * x + mat[7] * y + mat[8] * z;
            const l = Math.hypot(nx, ny, nz) || 1;
            arr[k * stride] = nx / l;
            arr[k * stride + 1] = ny / l;
            arr[k * stride + 2] = nz / l;
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
          for (let k = 0; k + 2 < ia.length; k += 3) {
            const t = ia[k + 1];
            ia[k + 1] = ia[k + 2];
            ia[k + 2] = t;
          }
          ic.setArray(ia);
        }
        np.setIndices(ic);
      }
      const col = np.getAttribute('COLOR_0');
      if (prim.getMaterial() && prim.getMaterial().getName() === 'TownOpaque' && col) {
        const ca = col.getArray();
        const ce = col.getElementSize();
        const ia = np.getIndices()
          ? np.getIndices().getArray()
          : Uint32Array.from({ length: np.getAttribute('POSITION').getCount() }, (_, k) => k);
        const groups = new Map();
        for (let k = 0; k + 2 < ia.length; k += 3) {
          const v = ia[k];
          const sem = semanticForColor(ca[v * ce], ca[v * ce + 1], ca[v * ce + 2]);
          if (!groups.has(sem)) groups.set(sem, []);
          groups.get(sem).push(ia[k], ia[k + 1], ia[k + 2]);
        }
        for (const [sem, tri] of groups) {
          const key = 'TownOpaque__' + sem;
          let mat = semMats.get(key);
          if (!mat) {
            mat = doc.createMaterial(key);
            semMats.set(key, mat);
          }
          const sp = doc.createPrimitive().setMaterial(mat).setMode(4);
          for (const s of np.listSemantics()) sp.setAttribute(s, np.getAttribute(s));
          sp.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(tri)));
          out.addPrimitive(sp);
        }
        continue;
      }
      out.addPrimitive(np);
    }
  }
  for (const node of root.listNodes()) if (node.getMesh()) node.setMesh(null);
  const host = doc.createNode(name).setMesh(out);
  scene.addChild(host);
  return out.listPrimitives().length;
}
