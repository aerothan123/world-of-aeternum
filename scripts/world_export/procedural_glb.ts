// Plain glTF binaries from geometry the client builds in code (the harbor
// decks, the weekly vault, the slice's own ground cover), so an engine can
// place the same pieces the Three.js client draws without a GLB on disk.
//
// Every mesh is baked to world space (its matrixWorld applied), keeps its
// position, normal, uv and vertex colour attributes, and gets a metal-rough
// material from the Three.js material's colour, roughness and emissive.
import { Document, type Material as GltfMaterial, NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';

type Arr = Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;

function f32(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  size: number,
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(attr.count * size);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < size; c++) out[i * size + c] = attr.getComponent(i, c);
  }
  return out;
}

export interface ProceduralGlbOptions {
  /** name of the glTF scene's single node */
  name: string;
}

/** One GLB holding every mesh under `root`, world-space baked. */
export async function object3DToGlb(
  root: THREE.Object3D,
  opts: ProceduralGlbOptions,
): Promise<Uint8Array> {
  root.updateMatrixWorld(true);
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(opts.name);
  const mats = new Map<THREE.Material, GltfMaterial>();
  const material = (m: THREE.Material): GltfMaterial => {
    const hit = mats.get(m);
    if (hit) return hit;
    const std = m as THREE.MeshStandardMaterial;
    const out = doc.createMaterial(m.name || `mat_${mats.size}`);
    const c = std.color ?? new THREE.Color(1, 1, 1);
    out.setBaseColorFactor([c.r, c.g, c.b, 1]);
    out.setRoughnessFactor(std.roughness ?? 0.9);
    out.setMetallicFactor(std.metalness ?? 0);
    if (std.emissive && (std.emissive.r || std.emissive.g || std.emissive.b)) {
      out.setEmissiveFactor([std.emissive.r, std.emissive.g, std.emissive.b]);
    }
    if (m.side === THREE.DoubleSide) out.setDoubleSided(true);
    mats.set(m, out);
    return out;
  };
  const accessor = (array: Arr, type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR') =>
    doc.createAccessor().setArray(array).setType(type).setBuffer(buffer);

  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const inst = m as unknown as THREE.InstancedMesh;
    const matrices: THREE.Matrix4[] = [];
    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        const local = new THREE.Matrix4();
        inst.getMatrixAt(i, local);
        matrices.push(m.matrixWorld.clone().multiply(local));
      }
    } else {
      matrices.push(m.matrixWorld);
    }
    for (const matrix of matrices) addGeometry(m, matrix);
  });
  function addGeometry(m: THREE.Mesh, matrix: THREE.Matrix4): void {
    const g = m.geometry.clone();
    g.applyMatrix4(matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const groups = g.groups.length
      ? g.groups
      : [
          {
            start: 0,
            count: g.index ? g.index.count : g.getAttribute('position').count,
            materialIndex: 0,
          },
        ];
    const list = Array.isArray(m.material) ? m.material : [m.material];
    const pos = accessor(f32(g.getAttribute('position'), 3), 'VEC3');
    const nor = accessor(f32(g.getAttribute('normal'), 3), 'VEC3');
    const uvAttr = g.getAttribute('uv');
    const uv = uvAttr ? accessor(f32(uvAttr, 2), 'VEC2') : null;
    const colAttr = g.getAttribute('color');
    const col = colAttr
      ? accessor(
          f32(colAttr, colAttr.itemSize === 4 ? 4 : 3),
          colAttr.itemSize === 4 ? 'VEC4' : 'VEC3',
        )
      : null;
    for (const grp of groups) {
      const idx = new Uint32Array(grp.count);
      for (let i = 0; i < grp.count; i++)
        idx[i] = g.index ? g.index.getX(grp.start + i) : grp.start + i;
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', pos)
        .setAttribute('NORMAL', nor)
        .setIndices(accessor(idx, 'SCALAR'))
        .setMaterial(material(list[grp.materialIndex ?? 0] ?? list[0]));
      if (uv) prim.setAttribute('TEXCOORD_0', uv);
      if (col) prim.setAttribute('COLOR_0', col);
      mesh.addPrimitive(prim);
    }
    g.dispose();
  }
  const node = doc.createNode(opts.name).setMesh(mesh);
  doc.createScene(opts.name).addChild(node);
  return new NodeIO().writeBinary(doc);
}
