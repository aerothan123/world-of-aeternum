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
  /**
   * Whether the lattice vertex (i, j) beyond this exported tile (a coordinate
   * outside 0..510) lies inside a zone; it decides whether the neighbouring
   * quad across a mesh edge exists. Default: inside.
   */
  insideBeyondTile?: (i: number, j: number) => boolean;
}

/** How far each mesh tile's edge skirt hangs below the edge, in yards (terrain_mesh.ts SKIRT_DEPTH). */
export const SKIRT_DEPTH = 1.5;

export interface MeshTileData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Uint8Array;
  uvs: Float32Array;
  indices: Uint16Array;
  /** terrain vertices; the skirt vertices follow them in every attribute array */
  vertexCount: number;
  skirtVertexCount: number;
  quadCount: number;
  /** skirt strips written (two-sided, so 4 triangles each) */
  skirtSegments: number;
}

/** Build sub-mesh (sx, sz) in 0..4 of an exported tile, or null when it is all padding. */
export function buildMeshTile(inp: MeshTileInput, sx: number, sz: number): MeshTileData | null {
  const i0 = sx * MESH_CELLS;
  const j0 = sz * MESH_CELLS;
  const inside = (i: number, j: number): boolean =>
    i < 0 || j < 0 || i >= TILE_VERTS || j >= TILE_VERTS
      ? (inp.insideBeyondTile?.(i, j) ?? true)
      : !inp.mask || inp.mask[j * TILE_VERTS + i] !== 0;
  // A quad in a neighbouring tile shares its edge vertices with this tile, so only
  // its own (beyond-tile) corners say whether that neighbour really exists.
  const quadKept = (i: number, j: number): boolean => {
    const out = i < 0 || j < 0 || i >= TILE_VERTS - 1 || j >= TILE_VERTS - 1;
    for (const [ci, cj] of [
      [i, j],
      [i + 1, j],
      [i, j + 1],
      [i + 1, j + 1],
    ]) {
      if (out && ci >= 0 && cj >= 0 && ci < TILE_VERTS && cj < TILE_VERTS) continue;
      if (inside(ci, cj)) return true;
    }
    return false;
  };
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
      if (!quadKept(i, j)) continue;
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

  // Skirts: engines simplify each tile on its own (Nanite clusters), so shared
  // edges drift apart and open a seam; a strip hanging SKIRT_DEPTH below each
  // edge fills it. A strip is written only where both quads across the edge
  // exist: an edge facing all-padding (the world's rim) gets none.
  const kept = (s: number, edge: number): [boolean, boolean] => {
    switch (edge) {
      case 0: // south, z = mesh min
        return [quadKept(i0 + s, j0), quadKept(i0 + s, j0 - 1)];
      case 1: // north
        return [quadKept(i0 + s, j0 + MESH_CELLS - 1), quadKept(i0 + s, j0 + MESH_CELLS)];
      case 2: // west, x = mesh min
        return [quadKept(i0, j0 + s), quadKept(i0 - 1, j0 + s)];
      default: // east
        return [quadKept(i0 + MESH_CELLS - 1, j0 + s), quadKept(i0 + MESH_CELLS, j0 + s)];
    }
  };
  const edgeVertex = (s: number, edge: number): number =>
    remap[
      edge === 0
        ? s
        : edge === 1
          ? MESH_CELLS * MESH_VERTS + s
          : edge === 2
            ? s * MESH_VERTS
            : s * MESH_VERTS + MESH_CELLS
    ];
  const skirtTops: number[] = [];
  const skirtOf = new Map<number, number>();
  const skirtVertex = (edge: number, s: number): number => {
    const key = edge * MESH_VERTS + s;
    let sv = skirtOf.get(key);
    if (sv === undefined) {
      sv = n + skirtTops.length;
      skirtTops.push(edgeVertex(s, edge));
      skirtOf.set(key, sv);
    }
    return sv;
  };
  const skirtQuads: number[] = [];
  let skirtSegments = 0;
  for (let edge = 0; edge < 4; edge++) {
    for (let s = 0; s < MESH_CELLS; s++) {
      const [own, across] = kept(s, edge);
      if (!own || !across) continue;
      const [t0, t1] = [edgeVertex(s, edge), edgeVertex(s + 1, edge)];
      const [b0, b1] = [skirtVertex(edge, s), skirtVertex(edge, s + 1)];
      // both windings: the strip is seen from either side of the seam
      skirtQuads.push(t0, b0, t1, t1, b0, b1, t0, t1, b0, t1, b1, b0);
      skirtSegments++;
    }
  }
  const total = n + skirtTops.length;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Uint8Array(total * 4);
  const uvs = new Float32Array(total * 2);
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
  skirtTops.forEach((top, k) => {
    const sv = n + k;
    positions.set(
      [positions[top * 3], positions[top * 3 + 1] - SKIRT_DEPTH, positions[top * 3 + 2]],
      sv * 3,
    );
    normals.set(normals.subarray(top * 3, top * 3 + 3), sv * 3);
    colors.set(colors.subarray(top * 4, top * 4 + 4), sv * 4);
    uvs.set(uvs.subarray(top * 2, top * 2 + 2), sv * 2);
  });
  return {
    positions,
    normals,
    colors,
    uvs,
    indices: Uint16Array.from([...quads, ...skirtQuads]),
    vertexCount: n,
    skirtVertexCount: skirtTops.length,
    quadCount: quads.length / 6,
    skirtSegments,
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
