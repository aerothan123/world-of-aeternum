// Writes the world slice export to disk: rasters as raw files, records as
// JSON, every referenced GLB copied next to them, plus a manifest. Run through
// export_slice.mjs (which starts Node with the tsx loader).
//
//   node scripts/world_export/export_slice.mjs [outDir] [--cells 1024]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { WORLD_SEED } from '../../src/sim/world_seed';
import { engineGlb } from './engine_glb';
import { terrainTiles } from './terrain_mesh';
import {
  EASTBROOK_VALE_SLICE,
  exportWorldSlice,
  parsePropAssetUrls,
  quantizeHeights,
  quantizeUnit,
} from './world_slice_export';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const cellsAt = args.indexOf('--cells');
const cells = cellsAt >= 0 ? Number(args[cellsAt + 1]) : 1024;
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--cells');
const outDir = path.resolve(positional[0] ?? 'tmp/world_export/eastbrook_vale');

const t0 = Date.now();
const propSource = fs.readFileSync(path.join(repo, 'src/render/props.ts'), 'utf8');
const propUrls = parsePropAssetUrls(propSource);
const ex = exportWorldSlice(EASTBROOK_VALE_SLICE, WORLD_SEED, (k) => propUrls[k] ?? null, cells);
const sampleMs = Date.now() - t0;

fs.mkdirSync(outDir, { recursive: true });
const write = (name: string, data: Uint8Array | Uint16Array | string): void => {
  const file = path.join(outDir, name);
  if (typeof data === 'string') fs.writeFileSync(file, data);
  else fs.writeFileSync(file, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
};

// 16-bit little-endian heightmap; world height = min + v / 65535 * (max - min)
const hMin = Math.floor(ex.meta.heightMin) - 1;
const hMax = Math.ceil(ex.meta.heightMax) + 1;
write('heightmap.r16', quantizeHeights(ex.heights, hMin, hMax));
write('splat.u8', quantizeUnit(ex.splat));
// tint: the client's linear vertex colour, stored sRGB-encoded 8 bit
const tint = new Float32Array(ex.tint.length);
for (let i = 0; i < tint.length; i++) {
  const c = Math.max(0, ex.tint[i]);
  tint[i] = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}
write('tint_srgb.u8', quantizeUnit(tint));
write('grass_density.u8', quantizeUnit(ex.grassDensity));
write('flower_density.u8', quantizeUnit(ex.flowerDensity));

// The same rasters as PNG (image row 0 = minZ, column 0 = minX) for engines
// that take textures, and the terrain as glTF tiles (terrain_mesh.ts).
const res = ex.meta.res;
const png = async (name: string, data: Uint8Array, channels: 1 | 3 | 4): Promise<void> => {
  await sharp(data, { raw: { width: res, height: res, channels } })
    .png()
    .toFile(path.join(outDir, name));
};
const splatBytes = quantizeUnit(ex.splat);
const control = new Uint8Array(res * res * 4);
for (let o = 0; o < res * res; o++) control.set(splatBytes.subarray(o * 5 + 1, o * 5 + 5), o * 4);
await png('splat_control.png', control, 4);
await png('tint.png', quantizeUnit(tint), 3);
await png('grass_density.png', quantizeUnit(ex.grassDensity), 1);
await png('flower_density.png', quantizeUnit(ex.flowerDensity), 1);
const tiles = await terrainTiles(ex);
fs.mkdirSync(path.join(outDir, 'terrain'), { recursive: true });
for (const t of tiles) fs.writeFileSync(path.join(outDir, 'terrain', `${t.name}.glb`), t.bytes);

// GLBs: each referenced file is rewritten under its public path as a plain
// glTF binary (meshopt decoded, attributes dequantized, KTX2 and WebP decoded
// to PNG, engine_glb.ts), since desktop importers do not read the web
// delivery extensions. The manifest keeps both extension sets.
const glbPaths = [
  ...new Set([...ex.placements.map((p) => p.path), ...ex.scatter.map((t) => t.path)]),
].sort();
interface ModelRow {
  path: string;
  sourceBytes: number;
  bytes: number;
  sourceExtensions: string[];
  extensionsUsed: string[];
  missing?: true;
  error?: string;
}
const models: ModelRow[] = [];
for (const p of glbPaths) {
  const src = path.join(repo, 'public', p);
  if (!fs.existsSync(src)) {
    models.push({
      path: p,
      sourceBytes: 0,
      bytes: 0,
      sourceExtensions: [],
      extensionsUsed: [],
      missing: true,
    });
    continue;
  }
  const buf = fs.readFileSync(src);
  let sourceExtensions: string[] = [];
  try {
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    sourceExtensions = json.extensionsUsed ?? [];
  } catch {
    sourceExtensions = [];
  }
  const dst = path.join(outDir, p);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    const out = await engineGlb(repo, new Uint8Array(buf));
    fs.writeFileSync(dst, out.bytes);
    models.push({
      path: p,
      sourceBytes: buf.length,
      bytes: out.bytes.byteLength,
      sourceExtensions,
      extensionsUsed: out.extensionsUsed,
    });
  } catch (err) {
    fs.copyFileSync(src, dst);
    const error = err instanceof Error ? err.message : String(err);
    models.push({
      path: p,
      sourceBytes: buf.length,
      bytes: buf.length,
      sourceExtensions,
      extensionsUsed: sourceExtensions,
      error,
    });
  }
}

write('placements.json', JSON.stringify(ex.placements, null, 1));
write('scatter.json', JSON.stringify(ex.scatter));
write('roads.json', JSON.stringify(ex.roads, null, 1));
write('water.json', JSON.stringify(ex.water, null, 1));
write('lights.json', JSON.stringify(ex.lights, null, 1));

const countBy = (keys: readonly string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
};
const extensions = countBy(models.flatMap((m) => m.extensionsUsed));
const manifest = {
  generator: 'scripts/world_export/export_slice.mjs',
  slice: 'eastbrook_vale',
  ...ex.meta,
  heightEncoding: { file: 'heightmap.r16', type: 'uint16le', min: hMin, max: hMax },
  rasters: {
    splat: { file: 'splat.u8', channels: ex.meta.layers.length, order: ex.meta.layers },
    tint: { file: 'tint_srgb.u8', channels: 3, colorSpace: 'sRGB' },
    grass: { file: 'grass_density.u8', channels: 1 },
    flowers: { file: 'flower_density.u8', channels: 1 },
    png: {
      splatControl: {
        file: 'splat_control.png',
        channels: 'r dirt, g sand, b rock, a cobble; grass = 1 - sum',
      },
      tint: 'tint.png',
      grass: 'grass_density.png',
      flowers: 'flower_density.png',
      rowZero: 'minZ',
    },
  },
  terrainTiles: {
    dir: 'terrain',
    count: tiles.length,
    perSide: Math.sqrt(tiles.length),
    vertexColor: 'r dirt, g sand, b rock, a cobble',
    uv0: 'slice-normalized x, z',
  },
  records: ['placements.json', 'scatter.json', 'roads.json', 'water.json', 'lights.json'],
  stats: {
    sampleMs,
    placements: ex.placements.length,
    placementsBySource: countBy(ex.placements.map((p) => p.source)),
    approximatePlacements: ex.placements.filter((p) => p.approximate).length,
    scatter: ex.scatter.length,
    scatterBySpecies: countBy(ex.scatter.map((s) => s.species)),
    roads: ex.roads.length,
    lakes: ex.water.lakes.length,
    pointLights: ex.lights.pointLights.length,
    models: models.length,
    modelsMissing: models.filter((m) => m.missing).map((m) => m.path),
    modelsFailed: models.filter((m) => m.error).map((m) => `${m.path}: ${m.error}`),
    sourceModelBytes: models.reduce((a, m) => a + m.sourceBytes, 0),
    modelBytes: models.reduce((a, m) => a + m.bytes, 0),
    sourceGltfExtensions: countBy(models.flatMap((m) => m.sourceExtensions)),
    gltfExtensions: extensions,
  },
  models,
};
write('manifest.json', JSON.stringify(manifest, null, 1));
console.log(JSON.stringify(manifest.stats, null, 1));
console.log(`wrote ${outDir}`);
