// Writes the terrain mesh tiles of the Unreal world export. Run through
// ue_mesh.mjs AFTER ue_export.mjs (it reads that export's tiles).
//
//   node scripts/world_export/ue_mesh.mjs [outDir] [--world dir] [--tile name]...
//
// Layout under outDir:
//   manifest.json            tile index, conventions, skipped padding tiles, file hashes
//   terrain/terrain_<i>_<j>.glb   one 51 yd mesh per file (see ue_terrain_mesh.ts)
// <i>, <j> count 51 yd mesh tiles from the world's south-west tile corner, so
// they are never negative; the manifest maps each name to its world bounds.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IncrementalWriter, readPreviousFiles, sha256, stableJson } from './ue_manifest';
import {
  buildMeshTile,
  MESH_CELLS,
  MESH_PER_TILE,
  MESH_YD,
  meshTileName,
  meshTileToGlb,
  SKIRT_DEPTH,
} from './ue_terrain_mesh';
import { decodeHeight, QUAD_YD, TILE_QUADS, TILE_VERTS, TILE_YD } from './ue_tiles';

const args = process.argv.slice(2);
const multi = (flag: string): string[] =>
  args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const flagged = new Set(['--world', '--tile']);
const positional = args.filter((a, i) => !a.startsWith('--') && !flagged.has(args[i - 1]));
const outDir = path.resolve(positional[0] ?? 'E:/WyndlewoodUnreal/export/world_mesh');
const worldDir = path.resolve(multi('--world')[0] ?? 'E:/WyndlewoodUnreal/export/world');
const onlyTiles = new Set(multi('--tile'));

const t0 = Date.now();
const man = JSON.parse(fs.readFileSync(path.join(worldDir, 'manifest.json'), 'utf8'));
interface TileEntry {
  tx: number;
  tz: number;
  files: string[];
  padding: { mask: string } | null;
}
const tiles = man.tiles as Record<string, TileEntry>;
const enc = {
  zeroYd: man.landscape.heightmap.zeroYd as number,
  scaleZ: man.landscape.heightmap.scaleZ as number,
  stepCm: man.landscape.heightmap.stepCm as number,
};
const entries = Object.entries(tiles);
const minTx = Math.min(...entries.map(([, t]) => t.tx));
const maxTx = Math.max(...entries.map(([, t]) => t.tx));
const minTz = Math.min(...entries.map(([, t]) => t.tz));
const maxTz = Math.max(...entries.map(([, t]) => t.tz));
const originX = minTx * TILE_YD;
const originZ = minTz * TILE_YD;
const sizeX = (maxTx - minTx + 1) * TILE_YD;
const sizeZ = (maxTz - minTz + 1) * TILE_YD;

// One world-wide height lattice so tile-edge normals see their neighbours.
const gw = (maxTx - minTx + 1) * TILE_QUADS + 1;
const gh = (maxTz - minTz + 1) * TILE_QUADS + 1;
const grid = new Float32Array(gw * gh).fill(Number.NaN);
const readHeights = (name: string): Uint16Array => {
  const b = fs.readFileSync(path.join(worldDir, 'tiles', name, 'heightmap.r16'));
  return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
for (const [name, t] of entries) {
  const h = readHeights(name);
  const bi = (t.tx - minTx) * TILE_QUADS;
  const bj = (t.tz - minTz) * TILE_QUADS;
  for (let j = 0; j < TILE_VERTS; j++) {
    for (let i = 0; i < TILE_VERTS; i++) {
      grid[(bj + j) * gw + bi + i] = decodeHeight(h[j * TILE_VERTS + i], enc);
    }
  }
}

const previous = readPreviousFiles(path.join(outDir, 'manifest.json'));
const w = new IncrementalWriter(outDir, previous);
const meshIndex: Record<string, unknown> = {};
const skipped: string[] = [];
const rawPng = async (file: string): Promise<Uint8Array> =>
  new Uint8Array(await sharp(file).raw().toBuffer());

// Zone masks of every tile with padding, so a mesh edge on an exported tile's
// border can ask whether the quad across it (in the neighbouring tile) exists.
const masks = new Map<string, Uint8Array | null>();
for (const [, t] of entries) {
  masks.set(
    `${t.tx},${t.tz}`,
    t.padding ? await rawPng(path.join(worldDir, t.padding.mask)) : null,
  );
}
const insideBeyond =
  (tx: number, tz: number) =>
  (i: number, j: number): boolean => {
    // called only for a lattice coordinate outside 0..510 on at least one axis
    const dx = i < 0 ? -1 : i >= TILE_VERTS ? 1 : 0;
    const dz = j < 0 ? -1 : j >= TILE_VERTS ? 1 : 0;
    const li = i - dx * TILE_QUADS;
    const lj = j - dz * TILE_QUADS;
    const m = masks.get(`${tx + dx},${tz + dz}`);
    if (m === undefined) return false; // no tile there: outside the world
    return m === null || m[lj * TILE_VERTS + li] !== 0;
  };

for (const [name, t] of entries) {
  const bi = (t.tx - minTx) * TILE_QUADS;
  const bj = (t.tz - minTz) * TILE_QUADS;
  const weights = [
    await rawPng(path.join(worldDir, 'tiles', name, 'splat_dirt.png')),
    await rawPng(path.join(worldDir, 'tiles', name, 'splat_sand.png')),
    await rawPng(path.join(worldDir, 'tiles', name, 'splat_rock.png')),
    await rawPng(path.join(worldDir, 'tiles', name, 'splat_cobble.png')),
  ];
  const mask = t.padding ? await rawPng(path.join(worldDir, t.padding.mask)) : undefined;
  const input = {
    originX: t.tx * TILE_YD,
    originZ: t.tz * TILE_YD,
    height: (i: number, j: number): number => {
      const gi = bi + i;
      const gj = bj + j;
      return gi < 0 || gj < 0 || gi >= gw || gj >= gh ? Number.NaN : grid[gj * gw + gi];
    },
    weights,
    mask,
    insideBeyondTile: insideBeyond(t.tx, t.tz),
    uvOrigin: { x: originX, z: originZ },
    uvSize: { x: sizeX, z: sizeZ },
  };
  for (let sz = 0; sz < MESH_PER_TILE; sz++) {
    for (let sx = 0; sx < MESH_PER_TILE; sx++) {
      const mi = (t.tx - minTx) * MESH_PER_TILE + sx;
      const mj = (t.tz - minTz) * MESH_PER_TILE + sz;
      const mname = meshTileName(mi, mj);
      if (onlyTiles.size && !onlyTiles.has(mname)) continue;
      const mesh = buildMeshTile(input, sx, sz);
      if (!mesh) {
        skipped.push(mname);
        continue;
      }
      const glb = await meshTileToGlb(mname, mesh);
      const rel = `terrain/${mname}.glb`;
      w.write(rel, glb);
      meshIndex[mname] = {
        i: mi,
        j: mj,
        minX: input.originX + sx * MESH_YD,
        minZ: input.originZ + sz * MESH_YD,
        maxX: input.originX + (sx + 1) * MESH_YD,
        maxZ: input.originZ + (sz + 1) * MESH_YD,
        exportTile: name,
        uvInExportTile: {
          u0: (sx * MESH_CELLS) / TILE_QUADS,
          v0: (sz * MESH_CELLS) / TILE_QUADS,
          u1: ((sx + 1) * MESH_CELLS) / TILE_QUADS,
          v1: ((sz + 1) * MESH_CELLS) / TILE_QUADS,
        },
        vertices: mesh.vertexCount,
        quads: mesh.quadCount,
        skirtSegments: mesh.skirtSegments,
        file: rel,
      };
    }
  }
}

const manifest = {
  version: 1,
  generator: 'scripts/world_export/ue_mesh.mjs',
  source: {
    world: worldDir,
    manifestSha256: sha256(fs.readFileSync(path.join(worldDir, 'manifest.json'))),
  },
  convention: {
    frame:
      'game frame glTF (right-handed, +Y up, yards); Interchange imports as UE = (100 x, 100 z, 100 y)',
    names: 'terrain_<i>_<j>, i and j count mesh tiles from the south-west corner, never negative',
    meshTileYards: MESH_YD,
    cellsPerMeshTile: MESH_CELLS,
    quadYards: QUAD_YD,
    material: 'one primitive, material slot 0 for M_Terrain',
    skirts: `two-sided strips hanging ${SKIRT_DEPTH} yd below each mesh edge, same as the slice terrain; omitted on edges that face all-padding`,
    vertexColor:
      'COLOR_0 normalized uint8: r dirt, g sand, b rock, a cobble; grass is 1 - r - g - b - a clamped at 0',
    uv0: 'world-normalized: u = (x - worldMinX) / worldSizeX, v = (z - worldMinZ) / worldSizeZ',
    splatTexturesPerTile:
      'tiles/<exportTile>/splat_<layer>.png in the world export, 511 x 511, sample with uvInExportTile',
    unreal: 'UE X = game x, UE Y = game z, UE Z = game y; one game unit is one metre',
  },
  world: { minX: originX, minZ: originZ, sizeX, sizeZ, meshTileOrigin: { x: originX, z: originZ } },
  meshTiles: meshIndex,
  skippedAllPadding: skipped.sort(),
  files: { ...previous, ...w.files },
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'manifest.json'), stableJson(manifest));
console.log(
  JSON.stringify(
    {
      outDir,
      meshTiles: Object.keys(meshIndex).length,
      skippedAllPadding: skipped.length,
      files: w.stats,
      ms: Date.now() - t0,
    },
    null,
    1,
  ),
);
