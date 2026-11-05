// Writes the Unreal world export. Run through ue_export.mjs.
//
//   node scripts/world_export/ue_export.mjs [outDir] [--zone id]... [--no-tiles]
//        [--registry path]... [--seed n]
//
// Layout under outDir:
//   manifest.json                   hashes, encoding, validation, tile and zone index
//   tiles/<tile>/heightmap.r16      uint16 little endian, 511 x 511, row 0 = tile minZ
//   tiles/<tile>/splat_<layer>.png  8 bit grayscale weight maps, one per ground layer
//   zones/<zone>/placements.json    props, buildings, fences, clutter, lamps (Unreal space)
//   zones/<zone>/roads.json         road and street polylines (Unreal space)
//   dungeons.json                   wall colliders of every dungeon interior
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { WORLD_SEED } from '../../src/sim/world_seed';
import { IncrementalWriter, readPreviousFiles, stableJson } from './ue_manifest';
import { allRoads } from './ue_roads';
import { LANDSCAPE_LAYOUT, QUAD_YD, TILE_VERTS, TILE_YD, pickHeightEncoding, tileName } from './ue_tiles';
import {
  type HeightReport,
  loadRegistryKeys,
  validateAssets,
  validateTileHeights,
} from './ue_validate';
import {
  type UePlacement,
  dungeonWalls,
  exportTileRasters,
  worldHeightRange,
  worldTiles,
  zoneInfos,
  zonePlacements,
  zoneRoads,
} from './ue_zone_export';
import { GROUND_LAYERS, parsePropAssetUrls } from './world_slice_export';

export const EXPORT_VERSION = 1;
const DEFAULT_REGISTRY = 'E:/WyndlewoodUnreal/EnvSlice/Content/Wyndlewood/Assets/asset_registry.json';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const multi = (flag: string): string[] =>
  args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const flagged = new Set(['--zone', '--registry', '--seed']);
const positional = args.filter((a, i) => !a.startsWith('--') && !flagged.has(args[i - 1]));
const outDir = path.resolve(positional[0] ?? 'E:/WyndlewoodUnreal/export/world');
const onlyZones = new Set(multi('--zone'));
const skipTiles = args.includes('--no-tiles');
const registryFiles = multi('--registry');
const seed = multi('--seed')[0] ? Number(multi('--seed')[0]) : WORLD_SEED;

const t0 = Date.now();
const zones = zoneInfos().filter((z) => onlyZones.size === 0 || onlyZones.has(z.id));
if (zones.length === 0) throw new Error(`no zone matches ${[...onlyZones].join(', ')}`);

// The height encoding and tile set always come from the WHOLE world, so a
// partial run writes tiles byte-identical to a full run.
const allZones = zoneInfos();
const allTiles = worldTiles(allZones);
const range = worldHeightRange(allTiles, seed);
const enc = pickHeightEncoding(range.min, range.max);

const manifestPath = path.join(outDir, 'manifest.json');
const previous = readPreviousFiles(manifestPath);
const w = new IncrementalWriter(outDir, previous);
let prevManifest: { tiles?: Record<string, unknown>; zones?: Record<string, unknown> } = {};
try {
  prevManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch {
  prevManifest = {};
}

const tileIndex: Record<string, unknown> = { ...(prevManifest.tiles ?? {}) };
const heightReports: HeightReport[] = [];
const zoneTileNames = (z: (typeof zones)[number]): string[] =>
  worldTiles([z]).map(tileName);

if (!skipTiles) {
  const wanted = new Map(worldTiles(zones).map((t) => [tileName(t), t]));
  for (const [name, t] of wanted) {
    const r = exportTileRasters(t, seed, enc);
    w.write(`tiles/${name}/heightmap.r16`, r.heights);
    const rel = [`tiles/${name}/heightmap.r16`];
    for (const [k, layerName] of GROUND_LAYERS.entries()) {
      const png = await sharp(r.layers[k], {
        raw: { width: TILE_VERTS, height: TILE_VERTS, channels: 1 },
      })
        .png({ compressionLevel: 9 })
        .toBuffer();
      w.write(`tiles/${name}/splat_${layerName}.png`, png);
      rel.push(`tiles/${name}/splat_${layerName}.png`);
    }
    heightReports.push(validateTileHeights(name, t, r.heights, enc, seed));
    tileIndex[name] = {
      tx: t.tx,
      tz: t.tz,
      minX: t.tx * TILE_YD,
      minZ: t.tz * TILE_YD,
      files: rel,
    };
  }
}

const propUrls = parsePropAssetUrls(fs.readFileSync(path.join(repo, 'src/render/props.ts'), 'utf8'));
const propUrl = (k: string): string | null => propUrls[k] ?? null;
const roads = allRoads();
const placementsByZone: Record<string, UePlacement[]> = {};
const zoneIndex: Record<string, unknown> = { ...(prevManifest.zones ?? {}) };
for (const z of zones) {
  const placements = zonePlacements(z, seed, propUrl);
  const zr = zoneRoads(z, roads, seed);
  placementsByZone[z.id] = placements;
  w.write(`zones/${z.id}/placements.json`, stableJson(placements));
  w.write(`zones/${z.id}/roads.json`, stableJson(zr));
  zoneIndex[z.id] = {
    name: z.name,
    rect: z.rect,
    tiles: zoneTileNames(z),
    placements: placements.length,
    approximatePlacements: placements.filter((p) => p.approximate).length,
    roads: zr.length,
    files: [`zones/${z.id}/placements.json`, `zones/${z.id}/roads.json`],
  };
}

const dungeons = dungeonWalls();
w.write('dungeons.json', stableJson(dungeons));

const registry = loadRegistryKeys(registryFiles.length ? registryFiles : [DEFAULT_REGISTRY]);
const assets = validateAssets(placementsByZone, registry);
const worstVertex = heightReports.reduce((a, r) => Math.max(a, r.maxVertexErrCm), 0);
const worstOffGrid = heightReports.reduce((a, r) => Math.max(a, r.maxOffGridErrCm), 0);

const manifest = {
  version: EXPORT_VERSION,
  generator: 'scripts/world_export/ue_export.mjs',
  seed,
  space: {
    mapping: 'UE (X, Y, Z) = sim (x, z, y) * 100; yawDeg = -rotY in degrees',
    unitsPerSimUnit: 100,
  },
  landscape: {
    ...LANDSCAPE_LAYOUT,
    tileVerts: TILE_VERTS,
    tileYards: TILE_YD,
    quadYards: QUAD_YD,
    quadUu: QUAD_YD * 100,
    layers: GROUND_LAYERS,
    heightmap: {
      type: 'uint16le',
      rowZero: 'tile minZ (UE +Y)',
      zeroYd: enc.zeroYd,
      scaleZ: enc.scaleZ,
      stepCm: enc.stepCm,
      minYd: range.min,
      maxYd: range.max,
      tileLocationUu: 'X = tx * 25500, Y = tz * 25500, Z = zeroYd * 100',
    },
  },
  tiles: tileIndex,
  zones: zoneIndex,
  validation: {
    heights: {
      tilesChecked: heightReports.length,
      worstVertexErrCm: worstVertex,
      worstOffGridErrCm: worstOffGrid,
      withinTwoCm: worstVertex <= 2,
    },
    assets,
  },
  // a partial run (--zone) keeps the hashes of files it did not touch
  files: { ...previous, ...w.files },
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(manifestPath, stableJson(manifest));

console.log(
  JSON.stringify(
    {
      outDir,
      zonesExported: zones.map((z) => z.id),
      tiles: heightReports.length,
      files: w.stats,
      heights: manifest.validation.heights,
      assets: {
        registryFiles: assets.registryFiles,
        registrySize: assets.registrySize,
        referenced: assets.referenced,
        missing: assets.missing.length,
      },
      ms: Date.now() - t0,
    },
    null,
    1,
  ),
);
