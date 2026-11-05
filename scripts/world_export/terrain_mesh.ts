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
      const n = per + 1;
      const pos = new Float32Array(n * n * 3);
      const nor = new Float32Array(n * n * 3);
      const col = new Float32Array(n * n * 4);
      const uv = new Float32Array(n * n * 2);
      for (let b = 0; b < n; b++) {
        for (let a = 0; a < n; a++) {
          const i = tx * per + a;
          const j = tz * per + b;
          const v = b * n + a;
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
      const idx = new Uint32Array(per * per * 6);
      let k = 0;
      for (let b = 0; b < per; b++) {
        for (let a = 0; a < per; a++) {
          const v0 = b * n + a;
          const v1 = v0 + 1;
          const v2 = v0 + n;
          const v3 = v2 + 1;
          // counter-clockwise seen from +Y (glTF front faces)
          idx.set([v0, v2, v1, v1, v2, v3], k);
          k += 6;
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
