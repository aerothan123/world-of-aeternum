// Nanite terrain mesh tiles for the Unreal world, cut from the 25-zone tile
// export (ue_zone_export.ts). Same convention as the env lead's slice terrain
// (terrain_mesh.ts and unreal/env-slice): plain glTF in the GAME frame
// (right-handed, +Y up, yards; Interchange maps it to UE = (100 x, 100 z,
// 100 y)), one mesh named terrain_<i>_<j> per file, material slot 0 for
// M_Terrain, COLOR_0 = ground layer weights (r dirt, g sand, b rock, a cobble;
// grass is the remainder), TEXCOORD_0 = world-normalized position.
//
// Mesh tiles are 51 yd: each exported 255 yd landscape tile splits 5 x 5, so a
// mesh tile never straddles an exported tile (its weights, mask and padding
// come from that one tile) and has 102 x 102 cells at the export's 0.5 yd
// lattice, 103^2 = 10,609 vertices, under the Uint16 index cap.
//
// Padding (cells past the world's edge, see tileZoneMask) is skipped: a quad
// whose four corners are all padding is dropped, vertices nothing uses are
// dropped, and a mesh tile left with no quads is not written.
import { Document, NodeIO } from '@gltf-transform/core';
import { QUAD_YD, TILE_QUADS, TILE_VERTS } from './ue_tiles';

export const MESH_PER_TILE = 5;
export const MESH_CELLS = TILE_QUADS / MESH_PER_TILE;
export const MESH_VERTS = MESH_CELLS + 1;
export const MESH_YD = MESH_CELLS * QUAD_YD;

export function meshTileName(i: number, j: number): string {
  return `terrain_${i}_${j}`;
}

export interface MeshTileInput {
  /** world position (yards) of the exported tile's vertex (0, 0) */
  originX: number;
  originZ: number;
  /** height in yards at exported-tile lattice (i, j); may reach 1 outside 0..510 for normals; NaN when unknown */
  height: (i: number, j: number) => number;
  /** four TILE_VERTS^2 weight maps in order dirt, sand, rock, cobble (0..255) */
  weights: readonly Uint8Array[];
  /** TILE_VERTS^2, 255 inside a zone, 0 padding; undefined = all inside */
  mask?: Uint8Array;
  /** world extent for TEXCOORD_0 */
  uvOrigin: { x: number; z: number };
  uvSize: { x: number; z: number };
}

export interface MeshTileData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Uint8Array;
  uvs: Float32Array;
  indices: Uint16Array;
  vertexCount: number;
  quadCount: number;
}

/** Build sub-mesh (sx, sz) in 0..4 of an exported tile, or null when it is all padding. */
export function buildMeshTile(inp: MeshTileInput, sx: number, sz: number): MeshTileData | null {
  const i0 = sx * MESH_CELLS;
  const j0 = sz * MESH_CELLS;
  const inside = (i: number, j: number): boolean => !inp.mask || inp.mask[j * TILE_VERTS + i] !== 0;
  const remap = new Int32Array(MESH_VERTS * MESH_VERTS).fill(-1);
  const quads: number[] = [];
  const used: number[] = [];
  const take = (a: number, b: number): number => {
    const k = b * MESH_VERTS + a;
    if (remap[k] < 0) {
      remap[k] = used.length;
      used.push(k);
    }
    return remap[k];
  };
  for (let b = 0; b < MESH_CELLS; b++) {
    for (let a = 0; a < MESH_CELLS; a++) {
      const i = i0 + a;
      const j = j0 + b;
      if (!(inside(i, j) || inside(i + 1, j) || inside(i, j + 1) || inside(i + 1, j + 1))) continue;
      const v0 = take(a, b);
      const v1 = take(a + 1, b);
      const v2 = take(a, b + 1);
      const v3 = take(a + 1, b + 1);
      // counter-clockwise seen from +Y (glTF front faces), as terrain_mesh.ts
      quads.push(v0, v2, v1, v1, v2, v3);
    }
  }
  if (quads.length === 0) return null;
  const n = used.length;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const colors = new Uint8Array(n * 4);
  const uvs = new Float32Array(n * 2);
  for (let v = 0; v < n; v++) {
    const a = used[v] % MESH_VERTS;
    const b = (used[v] - a) / MESH_VERTS;
    const i = i0 + a;
    const j = j0 + b;
    const x = inp.originX + i * QUAD_YD;
    const z = inp.originZ + j * QUAD_YD;
    const h = inp.height(i, j);
    // central differences; an unknown neighbour falls back to this vertex
    const at = (ii: number, jj: number): number => {
      const hh = inp.height(ii, jj);
      return Number.isNaN(hh) ? h : hh;
    };
    const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * QUAD_YD);
    const dz = (at(i, j + 1) - at(i, j - 1)) / (2 * QUAD_YD);
    const len = Math.hypot(dx, 1, dz);
    positions.set([x, h, z], v * 3);
    normals.set([-dx / len, 1 / len, -dz / len], v * 3);
    const o = j * TILE_VERTS + i;
    colors.set([inp.weights[0][o], inp.weights[1][o], inp.weights[2][o], inp.weights[3][o]], v * 4);
    uvs.set([(x - inp.uvOrigin.x) / inp.uvSize.x, (z - inp.uvOrigin.z) / inp.uvSize.z], v * 2);
  }
  return {
    positions,
    normals,
    colors,
    uvs,
    indices: Uint16Array.from(quads),
    vertexCount: n,
    quadCount: quads.length / 6,
  };
}

/** Write one mesh tile as a binary glTF named like the env lead's terrain tiles. */
export async function meshTileToGlb(name: string, m: MeshTileData): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const acc = (
    type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR',
    arr: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer> | Uint16Array<ArrayBuffer>,
    normalized = false,
  ) => doc.createAccessor().setType(type).setArray(arr).setNormalized(normalized).setBuffer(buffer);
  const mat = doc.createMaterial('terrain').setRoughnessFactor(1).setMetallicFactor(0);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', m.positions as Float32Array<ArrayBuffer>))
    .setAttribute('NORMAL', acc('VEC3', m.normals as Float32Array<ArrayBuffer>))
    .setAttribute('COLOR_0', acc('VEC4', m.colors as Uint8Array<ArrayBuffer>, true))
    .setAttribute('TEXCOORD_0', acc('VEC2', m.uvs as Float32Array<ArrayBuffer>))
    .setIndices(acc('SCALAR', m.indices as Uint16Array<ArrayBuffer>))
    .setMaterial(mat);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  const node = doc.createNode(name).setMesh(mesh);
  doc.createScene(name).addChild(node);
  return new NodeIO().writeBinary(doc);
}
