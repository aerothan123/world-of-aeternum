// One-off: render the player-housing furniture item icons (src/sim/content/
// furniture.ts) from the REAL models the owner places (the KayKit castle set
// and the qprops station props the house interior draws, plus a medieval
// village carpet for the woven rug, whose in-house look is a procedural
// plane), seen from a little above and composited over the item-icon vignette
// at the shipped 128px. A sibling of render_island_item_icons.mjs (same
// bundled stills entry, same server, same sharp finishing); the outputs land
// in public/ui/items/ and are committed like any painted icon.
//
// Run: node scripts/render_furniture_icons.mjs   (ONLY=furn_a,furn_b for a batch)

import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import esbuild from 'esbuild';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { BROWSER_PATH } from './browser_path.mjs';
import { PORTRAIT_RENDER_DEFINES } from './lib/mob_portrait_jobs.mjs';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const OUT_PX = 128;

// Pitch 0.42 rad: about 24 degrees above level, enough to read a tabletop
// and a chest lid without losing the front face. The rug sits flat, so it is
// seen from much higher.
const PITCH = 0.42;
const FURNITURE_MODELS = {
  furn_wooden_chair: '/models/dungeon/chair.glb',
  furn_wooden_stool: '/models/dungeon/stool.glb',
  furn_oak_bench: '/models/biome/kcas_bench.glb',
  furn_round_table: '/models/dungeon/table_round_small.glb',
  furn_long_table: '/models/biome/kcas_table_long.glb',
  furn_bookcase: '/models/biome/kcas_bookcase.glb',
  furn_keg: '/models/biome/kcas_keg.glb',
  furn_barrel: '/models/biome/kcas_barrel.glb',
  furn_candlestick: '/models/dungeon/candle_triple.glb',
  furn_trophy_plaque: '/models/dungeon/shelf_small.glb',
  furn_station_forge: '/models/props/anvil.glb',
  furn_station_kitchens: '/models/dungeon/bartop_a_medium.glb',
  furn_station_apothecary: '/models/dungeon/shelf_small_candles.glb',
  furn_station_tannery: '/models/dungeon/table_round_medium.glb',
  furn_station_loom: '/models/dungeon/table_long_tablecloth.glb',
  furn_station_toolworks: '/models/props/weapon_stand.glb',
  // The painted Wyndlewood kit (src/sim/content/wyndlewood_props.ts). The
  // storage chest moved onto the painted small chest with it.
  furn_storage_chest: '/models/props/wyn_furn_small_storage_chest.glb',
  furn_cottage_bed: '/models/props/wyn_furn_cottage_bed.glb',
  furn_cottage_table: '/models/props/wyn_furn_cottage_table.glb',
  furn_cottage_chair: '/models/props/wyn_furn_cottage_chair.glb',
  furn_cottage_shelf: '/models/props/wyn_furn_cottage_shelf.glb',
  furn_table_lantern: '/models/props/wyn_furn_table_lantern.glb',
  furn_folding_worktable: '/models/props/wyn_furn_folding_worktable.glb',
};
const ALL_JOBS = [
  ...Object.entries(FURNITURE_MODELS).map(([itemId, url]) => ({
    itemId,
    spec: { url, pitch: PITCH },
  })),
  {
    itemId: 'furn_woven_rug',
    spec: { url: '/models/medieval_village_v2/props/Carpet_02.glb', pitch: 1.05 },
  },
  {
    itemId: 'furn_braided_rug',
    spec: { url: '/models/props/wyn_furn_braided_rug.glb', pitch: 1.05 },
  },
];
// ONLY=id,id renders just those icons (a new batch), leaving the rest of the
// committed set byte-identical.
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const JOBS = ONLY ? ALL_JOBS.filter((job) => ONLY.has(job.itemId)) : ALL_JOBS;

const bundled = await esbuild.build({
  entryPoints: [path.join(root, 'scripts', 'wiki', 'stills_render_entry.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  absWorkingDir: root,
  define: PORTRAIT_RENDER_DEFINES,
  write: false,
  logLevel: 'silent',
});
const bundleJs = bundled.outputFiles[0].text;
if (bundleJs.includes('import.meta') || /\bimport_meta\b/.test(bundleJs)) {
  throw new Error('stills bundle still reads an import.meta.env field with no define');
}

const HARNESS = `<!doctype html><html><head><meta charset="utf8"><style>html,body{margin:0;background:transparent}</style></head><body><script src="/__icons_bundle.js"></script></body></html>`;
const MIME = {
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.hdr': 'image/vnd.radiance',
  '.json': 'application/json',
  '.gltf': 'model/gltf+json',
};
const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/__icons.html') {
    res.setHeader('content-type', 'text/html');
    res.end(HARNESS);
    return;
  }
  if (url === '/__icons_bundle.js') {
    res.setHeader('content-type', 'text/javascript');
    res.end(bundleJs);
    return;
  }
  const filePath = path.normalize(path.join(publicDir, url));
  if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }
  try {
    const buf = await readFile(filePath);
    res.setHeader(
      'content-type',
      MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    );
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

// The item-icon vignette: a soft radial glow over near-black, the shipped
// icon family's ground.
const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_PX}" height="${OUT_PX}"><defs><radialGradient id="g" cx="50%" cy="42%" r="62%"><stop offset="0%" stop-color="#3a3527"/><stop offset="55%" stop-color="#211d15"/><stop offset="100%" stop-color="#0d0b08"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--no-sandbox',
  ],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERR', e.message));
await page.goto(`http://127.0.0.1:${port}/__icons.html`, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction('window.__ready === true', { timeout: 20000 });

for (const job of JOBS) {
  const pngUrl = await page.evaluate((s) => window.renderStill(s, null), job.spec);
  const png = Buffer.from(pngUrl.split(',')[1], 'base64');
  const alpha = (await sharp(png).stats()).channels[3];
  if (!alpha || alpha.max < 8) throw new Error(`blank render for ${job.itemId}`);
  const inset = Math.max(1, Math.round(OUT_PX * 0.09));
  const subject = await sharp(png)
    .trim()
    .resize(OUT_PX - inset * 2, OUT_PX - inset * 2, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const webp = await sharp(Buffer.from(backgroundSvg))
    .composite([{ input: subject }])
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toBuffer();
  writeFileSync(path.join(publicDir, 'ui', 'items', `${job.itemId}.webp`), webp);
  console.log(`ok ${job.itemId}.webp (${(webp.length / 1024).toFixed(1)} KB)`);
}
await browser.close();
server.close();
