// Wyndlewood 2D replacement: repaint the world-map plates (public/map_art/) from the game's
// own terrain painter instead of inherited art. Each plate is the procedural terrain of the
// region the HUD composites it over (mapZoneRegion for a zone, the world bounds for `world`
// and the continent overview), painted at the plate's own pixel size from the fixed world
// seed, then given a soft painterly finish (median smoothing, a gentle saturation lift and a
// deterministic paper grain). No image model and no reference art: the plates are a pure
// function of (world seed, region), so coastlines, water and roads match the game exactly.
//
// usage: node scripts/assets/wyndlewood_2d/paint_map_plates.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import sharp from 'sharp';

const root = process.cwd();
const WORLD_SEED = 20061; // src/main.ts WORLD_SEED, as scripts/build_map_backgrounds.mjs
const built = await esbuild.build({
  stdin: {
    contents: `export { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z, ZONES } from './src/sim/data.ts';
export { mapZoneRegion, paintTerrainRows } from './src/ui/map_terrain.ts';`,
    resolveDir: root,
    sourcefile: 'w2d-map-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z, ZONES, mapZoneRegion, paintTerrainRows } = mod;
const worldRegion = { minX: WORLD_MIN_X, maxX: WORLD_MAX_X, minZ: WORLD_MIN_Z, maxZ: WORLD_MAX_Z };
const artDir = path.join(root, 'public', 'map_art');

function grain(data, W, H) {
  // Deterministic paper grain: an integer hash per pixel, +-6 levels on each channel.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let h = (x * 374761393 + y * 668265263) | 0;
      h = (h ^ (h >>> 13)) * 1274126177;
      const g = ((h >>> 24) % 13) - 6;
      const i = (y * W + x) * 4;
      data[i] = Math.max(0, Math.min(255, data[i] + g));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + g));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + g));
    }
  }
}

async function paint(region, W, H) {
  const data = new Uint8ClampedArray(W * H * 4);
  paintTerrainRows(data, W, H, region, WORLD_SEED, 0, H);
  grain(data, W, H);
  return sharp(Buffer.from(data.buffer), { raw: { width: W, height: H, channels: 4 } })
    .removeAlpha()
    .median(3)
    .modulate({ saturation: 1.08, brightness: 1.02 })
    .blur(0.5);
}

const written = [];
for (const f of fs.readdirSync(artDir)) {
  const m = /^(.+)\.(png|webp)$/.exec(f);
  if (!m) continue;
  const id = m[1];
  const file = path.join(artDir, f);
  const meta = await sharp(file).metadata();
  let region = null;
  if (id === 'world' || id === 'world_overview') region = worldRegion;
  else {
    const zone = ZONES.find((z) => z.id === id);
    if (zone) region = mapZoneRegion(zone);
  }
  if (!region) {
    console.log('[w2d] map plate kept (no region):', f);
    continue;
  }
  const img = await paint(region, meta.width, meta.height);
  const out = m[2] === 'png' ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.webp({ quality: 86 }).toBuffer();
  fs.writeFileSync(file, out);
  written.push(`public/map_art/${f}`);
  console.log('[w2d] map plate', f, meta.width, meta.height, out.length);
}
fs.writeFileSync(
  path.join(root, 'scripts/assets/wyndlewood_2d/map_plates.json'),
  `${JSON.stringify({ seed: WORLD_SEED, painter: 'src/ui/map_terrain.ts paintTerrainRows', plates: written }, null, 1)}\n`,
);
