// Terrain tiles as plain glTF meshes, for engines (or offline renderers) that
// take a mesh terrain instead of a heightfield. Each tile is a regular grid
// cut from the export rasters, in the GAME frame (which is also the glTF
// frame: right-handed, +Y up), so it imports through the same axis
// conversion as every prop GLB and lines up with the placements exactly.
//
// Per vertex: POSITION from the terrainHeight raster, NORMAL by central
// differences, COLOR_0 = the ground layer weights (r dirt, g sand, b rock,
// a cobble; grass is the remainder), TEXCOORD_0 = the slice-normalized
// position (u = (x - minX) / size, v = (z - minZ) / size) for the tint and
// density textures.
import { Document, NodeIO } from '@gltf-transform/core';
import type { WorldSliceExport } from './world_slice_export';

export interface TerrainTile {
  name: string;
  /** tile index along x and z */
  ix: number;
  iz: number;
  bytes: Uint8Array;
}

/** How far each tile's edge skirt hangs below the edge, in yards. */
export const SKIRT_DEPTH = 1.5;
/**
 * How far each skirt's lower edge leans out past the tile, in yards. A plumb
 * skirt sits edge-on in the zero-width plane two tiles share, so a hairline
 * crack seen from above still showed sky past both skirts (the v17 seam
 * shot); leaning out, each skirt reaches under its neighbour and fills it.
 */
export const SKIRT_FLARE = 0.5;
/**
 * Grid cells each tile runs past its +x and +z edges, under its neighbour.
 * Skirts alone still left a sky-coloured line along the boundaries (the
 * v17 seam shot, also with Lumen off and a flat material: an up-facing skirt
 * seen edge-on reads as sky). With an overlap there is real ground from
 * both tiles across every boundary, whatever each engine LOD does to its
 * own edges; the overlapping cell is the same heights and material.
 */
export const TILE_OVERLAP = 1;

export async function terrainTiles(ex: WorldSliceExport, tilesPerSide = 8): Promise<TerrainTile[]> {
  const { res, step, bounds } = ex.meta;
  const cells = res - 1;
  if (cells % tilesPerSide !== 0)
    throw new Error(`${cells} cells do not split into ${tilesPerSide} tiles`);
  const per = cells / tilesPerSide;
  const size = bounds.maxX - bounds.minX;
  const nL = ex.meta.layers.length;
  const h = (i: number, j: number): number =>
    ex.heights[Math.min(res - 1, Math.max(0, j)) * res + Math.min(res - 1, Math.max(0, i))];
  const io = new NodeIO();
  const out: TerrainTile[] = [];
  for (let tz = 0; tz < tilesPerSide; tz++) {
    for (let tx = 0; tx < tilesPerSide; tx++) {
      // TILE_OVERLAP cells past the +x and +z edges, under the neighbour
      // (none at the slice's outer edge)
      const nx = per + 1 + (tx < tilesPerSide - 1 ? TILE_OVERLAP : 0);
      const nz = per + 1 + (tz < tilesPerSide - 1 ? TILE_OVERLAP : 0);
      // the nx * nz grid first, then one skirt row per edge
      const total = nx * nz + 2 * nx + 2 * nz;
      const pos = new Float32Array(total * 3);
      const nor = new Float32Array(total * 3);
      const col = new Float32Array(total * 4);
      const uv = new Float32Array(total * 2);
      for (let b = 0; b < nz; b++) {
        for (let a = 0; a < nx; a++) {
          const i = tx * per + a;
          const j = tz * per + b;
          const v = b * nx + a;
          const x = bounds.minX + i * step;
          const z = bounds.minZ + j * step;
          pos.set([x, h(i, j), z], v * 3);
          const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * step);
          const dz = (h(i, j + 1) - h(i, j - 1)) / (2 * step);
          const len = Math.hypot(dx, 1, dz);
          nor.set([-dx / len, 1 / len, -dz / len], v * 3);
          const o = (j * res + i) * nL;
          // layer order grass, dirt, sand, rock, cobble
          col.set([ex.splat[o + 1], ex.splat[o + 2], ex.splat[o + 3], ex.splat[o + 4]], v * 4);
          uv.set([(x - bounds.minX) / size, (z - bounds.minZ) / size], v * 2);
        }
      }
      // Skirts: each edge row repeated SKIRT_DEPTH below itself and joined to
      // it with a two-sided strip. Engines simplify each tile on its own
      // (Nanite clusters, LODs), so the shared edges drift a few
      // centimetres apart and open a sky-coloured seam; the skirt fills it.
      const edges: number[][] = [
        Array.from({ length: nx }, (_, a) => a), // z = tile min
        Array.from({ length: nx }, (_, a) => (nz - 1) * nx + a), // z = tile max
        Array.from({ length: nz }, (_, b) => b * nx), // x = tile min
        Array.from({ length: nz }, (_, b) => b * nx + nx - 1), // x = tile max
      ];
      let sv = nx * nz;
      // outward direction (x, z) of each edge above, for the flare
      const outward: [number, number][] = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      const skirtOf: number[][] = [];
      for (const [e, edge] of edges.entries()) {
        const [ox, oz] = outward[e];
        const row: number[] = [];
        for (const v of edge) {
          pos.set(
            [
              pos[v * 3] + ox * SKIRT_FLARE,
              pos[v * 3 + 1] - SKIRT_DEPTH,
              pos[v * 3 + 2] + oz * SKIRT_FLARE,
            ],
            sv * 3,
          );
          nor.set(nor.subarray(v * 3, v * 3 + 3), sv * 3);
          col.set(col.subarray(v * 4, v * 4 + 4), sv * 4);
          uv.set(uv.subarray(v * 2, v * 2 + 2), sv * 2);
          row.push(sv++);
        }
        skirtOf.push(row);
      }
      const idx = new Uint32Array((nx - 1) * (nz - 1) * 6 + (2 * (nx - 1) + 2 * (nz - 1)) * 12);
      let k = 0;
      for (let b = 0; b < nz - 1; b++) {
        for (let a = 0; a < nx - 1; a++) {
          const v0 = b * nx + a;
          const v1 = v0 + 1;
          const v2 = v0 + nx;
          const v3 = v2 + 1;
          // counter-clockwise seen from +Y (glTF front faces)
          idx.set([v0, v2, v1, v1, v2, v3], k);
          k += 6;
        }
      }
      for (const [e, edge] of edges.entries()) {
        const low = skirtOf[e];
        for (let s = 0; s < edge.length - 1; s++) {
          const [t0, t1, b0, b1] = [edge[s], edge[s + 1], low[s], low[s + 1]];
          // both windings: the strip is seen from either side of the seam
          idx.set([t0, b0, t1, t1, b0, b1, t0, t1, b0, t1, b1, b0], k);
          k += 12;
        }
      }
      const doc = new Document();
      const buffer = doc.createBuffer();
      const acc = (
        type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR',
        arr: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
      ) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
      const mat = doc.createMaterial('terrain').setRoughnessFactor(1).setMetallicFactor(0);
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', acc('VEC3', pos))
        .setAttribute('NORMAL', acc('VEC3', nor))
        .setAttribute('COLOR_0', acc('VEC4', col))
        .setAttribute('TEXCOORD_0', acc('VEC2', uv))
        .setIndices(acc('SCALAR', idx))
        .setMaterial(mat);
      const name = `terrain_${tx}_${tz}`;
      const mesh = doc.createMesh(name).addPrimitive(prim);
      const node = doc.createNode(name).setMesh(mesh);
      doc.createScene(name).addChild(node);
      out.push({ name, ix: tx, iz: tz, bytes: await io.writeBinary(doc) });
    }
  }
  return out;
}
