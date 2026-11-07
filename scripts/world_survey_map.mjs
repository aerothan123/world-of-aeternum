#!/usr/bin/env node
// Top-down survey map of the shipped overworld, drawn straight from the sim's
// own pure height function (src/sim/world.ts terrainHeight at WORLD_SEED), so it
// shows the true playable ground rather than whatever the renderer has resident.
// Hillshaded height, sea and lakes, zone rectangles with names and level bands,
// roads, hubs, POIs, dungeon doors and portals. World-crew planning tool.
//
//   node scripts/world_survey_map.mjs [out.png] [yardsPerPixel]
//
// Optional PLAN=path/to/plan.json overlays planned zone rects
// ([{ name, xMin, xMax, zMin, zMax, levels }]) as dashed outlines.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

const out = process.argv[2] ?? 'tmp/world-survey/world_map.png';
const YPP = Number(process.argv[3] ?? 2);
const temp = mkdtempSync(path.join(tmpdir(), 'woc-survey-'));
const entry = path.join(temp, 'entry.ts');
const root = process.cwd().replace(/\\/g, '/');
writeFileSync(
  entry,
  `export * from '${root}/src/sim/world';
export { ZONES, ROADS, PORTALS, DUNGEON_LIST, WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Z, WORLD_MAX_Z } from '${root}/src/sim/data';
export { WORLD_SEED } from '${root}/src/sim/world_seed';
`,
);
const outfile = path.join(temp, 'survey.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'error',
  define: { 'import.meta.env': '{}' },
  loader: { '.glsl': 'text' },
});
const W = await import(pathToFileURL(outfile).href);
rmSync(temp, { recursive: true, force: true });

const plan = process.env.PLAN ? JSON.parse(readFileSync(process.env.PLAN, 'utf8')) : [];
const pad = 60;
let minX = W.WORLD_MIN_X - pad;
let maxX = W.WORLD_MAX_X + pad;
let minZ = W.WORLD_MIN_Z - pad;
let maxZ = W.WORLD_MAX_Z + pad;
for (const p of plan) {
  minX = Math.min(minX, p.xMin - pad);
  maxX = Math.max(maxX, p.xMax + pad);
  minZ = Math.min(minZ, p.zMin - pad);
  maxZ = Math.max(maxZ, p.zMax + pad);
}
const cols = Math.ceil((maxX - minX) / YPP);
const rows = Math.ceil((maxZ - minZ) / YPP);
// Image: north (+z) up, east (+x) right.
const px = (x) => (x - minX) / YPP;
const py = (z) => (maxZ - z) / YPP;
const seed = W.WORLD_SEED;
const H = new Float32Array(cols * rows);
const t0 = Date.now();
for (let r = 0; r < rows; r++) {
  const z = maxZ - (r + 0.5) * YPP;
  for (let c = 0; c < cols; c++) {
    const x = minX + (c + 0.5) * YPP;
    H[r * cols + c] = W.terrainHeight(x, z, seed);
  }
}
const BIOME = {
  vale: [118, 160, 82],
  marsh: [96, 120, 78],
  peaks: [140, 136, 120],
  dusk: [120, 104, 150],
  frost: [220, 228, 236],
  ember: [120, 84, 70],
  amber: [196, 140, 64],
  fen: [104, 138, 96],
  night: [70, 78, 120],
  haunt: [84, 92, 84],
  jungle: [70, 140, 70],
  garden: [130, 180, 100],
  gale: [150, 160, 120],
};
const zoneAtXZ = (x, z) =>
  W.ZONES.find((zn) => {
    const x0 = zn.xMin ?? -180;
    const x1 = zn.xMax ?? 180;
    return x >= x0 && x < x1 && z >= zn.zMin && z < zn.zMax;
  });
const img = Buffer.alloc(cols * rows * 3);
let landCells = 0;
for (let r = 0; r < rows; r++) {
  const z = maxZ - (r + 0.5) * YPP;
  for (let c = 0; c < cols; c++) {
    const x = minX + (c + 0.5) * YPP;
    const h = H[r * cols + c];
    const wl = W.waterLevelAt(x, z, seed);
    const o = (r * cols + c) * 3;
    if (h < wl) {
      const d = Math.min(1, (wl - h) / 12);
      img[o] = 40 - d * 20;
      img[o + 1] = 110 - d * 50;
      img[o + 2] = 170 - d * 50;
      continue;
    }
    landCells++;
    const hx = H[r * cols + Math.min(cols - 1, c + 1)] - H[r * cols + Math.max(0, c - 1)];
    const hz = H[Math.max(0, r - 1) * cols + c] - H[Math.min(rows - 1, r + 1) * cols + c];
    const shade = Math.max(0.45, Math.min(1.35, 1 + (-hx * 0.7 + hz * 0.7) / (2 * YPP) / 1.2));
    const zn = zoneAtXZ(x, z);
    const base = (zn && BIOME[zn.biome]) || [90, 90, 90];
    const lift = Math.max(-0.15, Math.min(0.35, h / 120));
    for (let k = 0; k < 3; k++) {
      img[o + k] = Math.max(0, Math.min(255, base[k] * shade * (1 + lift)));
    }
  }
}
console.log(`sampled ${cols}x${rows} at ${YPP} yd/px in ${Date.now() - t0} ms`);
const landSqYd = landCells * YPP * YPP;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols}" height="${rows}" font-family="Segoe UI, Arial" >`;
for (const road of W.ROADS) {
  svg += `<polyline fill="none" stroke="#e8d7a8" stroke-width="2" stroke-opacity="0.9" points="${road.map((p) => `${px(p.x).toFixed(1)},${py(p.z).toFixed(1)}`).join(' ')}"/>`;
}
for (const zn of W.ZONES) {
  const x0 = zn.xMin ?? -180;
  const x1 = zn.xMax ?? 180;
  svg += `<rect x="${px(x0)}" y="${py(zn.zMax)}" width="${(x1 - x0) / YPP}" height="${(zn.zMax - zn.zMin) / YPP}" fill="none" stroke="#fff" stroke-width="1.5" stroke-opacity="0.8"/>`;
  const cx = px((x0 + x1) / 2);
  const cy = py(zn.zMax) + 16;
  const lv = `${zn.levelRange[0]}-${zn.levelRange[1]}`;
  svg += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${esc(zn.name)} (${lv})</text>`;
  if (zn.hub) {
    svg += `<rect x="${px(zn.hub.x) - 4}" y="${py(zn.hub.z) - 4}" width="8" height="8" fill="#ffd34d" stroke="#000"/>`;
    svg += `<text x="${px(zn.hub.x) + 7}" y="${py(zn.hub.z) + 4}" font-size="11" fill="#ffe9a0" stroke="#000" stroke-width="2.5" paint-order="stroke">${esc(zn.hub.name)}</text>`;
  }
  for (const poi of zn.pois ?? []) {
    svg += `<circle cx="${px(poi.x)}" cy="${py(poi.z)}" r="2.5" fill="#fff" stroke="#000" stroke-width="0.8"/>`;
  }
}
for (const d of W.DUNGEON_LIST) {
  if (!d.doorPos || Math.abs(d.doorPos.x) > 5000) continue;
  svg += `<path d="M${px(d.doorPos.x)},${py(d.doorPos.z) - 6} l5,10 h-10 z" fill="#c03030" stroke="#000"/>`;
}
for (const p of W.PORTALS) {
  for (const end of [p.a, p.b]) {
    svg += `<circle cx="${px(end.x)}" cy="${py(end.z)}" r="5" fill="#b060ff" stroke="#000"/>`;
  }
}
for (const p of plan) {
  svg += `<rect x="${px(p.xMin)}" y="${py(p.zMax)}" width="${(p.xMax - p.xMin) / YPP}" height="${(p.zMax - p.zMin) / YPP}" fill="#ffffff" fill-opacity="0.06" stroke="#ffcc33" stroke-width="2" stroke-dasharray="8 5"/>`;
  svg += `<text x="${px((p.xMin + p.xMax) / 2)}" y="${py((p.zMin + p.zMax) / 2)}" text-anchor="middle" font-size="13" font-weight="700" fill="#ffcc33" stroke="#000" stroke-width="3" paint-order="stroke">${esc(p.name)}${p.levels ? ` (${esc(p.levels)})` : ''}</text>`;
}
// scale bar + legend
svg += `<rect x="10" y="${rows - 34}" width="${500 / YPP}" height="6" fill="#fff" stroke="#000"/>`;
svg += `<text x="10" y="${rows - 40}" font-size="12" fill="#fff" stroke="#000" stroke-width="2.5" paint-order="stroke">500 yd   N is up, E is right   world ${W.WORLD_MAX_X - W.WORLD_MIN_X} x ${W.WORLD_MAX_Z - W.WORLD_MIN_Z} yd, land ${(landSqYd / 1e6).toFixed(2)} M sq yd</text>`;
svg += `<text x="10" y="${rows - 12}" font-size="11" fill="#fff" stroke="#000" stroke-width="2.5" paint-order="stroke">yellow = hub, white dot = POI, red = dungeon door, purple = portal, tan = road${plan.length ? ', dashed = PLANNED' : ''}</text>`;
svg += '</svg>';
const base = sharp(img, { raw: { width: cols, height: rows, channels: 3 } });
await base
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toFile(out);
console.log(
  JSON.stringify({
    out,
    worldRect: [W.WORLD_MIN_X, W.WORLD_MAX_X, W.WORLD_MIN_Z, W.WORLD_MAX_Z],
    rectSqYd: (W.WORLD_MAX_X - W.WORLD_MIN_X) * (W.WORLD_MAX_Z - W.WORLD_MIN_Z),
    landSqYd,
    roads: W.ROADS.length,
    roadYd: Math.round(
      W.ROADS.reduce(
        (s, r) => s + r.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - r[i].x, p.z - r[i].z), 0),
        0,
      ),
    ),
    zones: W.ZONES.map((zn) => ({
      id: zn.id,
      rect: [zn.xMin ?? -180, zn.xMax ?? 180, zn.zMin, zn.zMax],
      lv: zn.levelRange,
      biome: zn.biome,
      hub: zn.hub?.name,
      pois: (zn.pois ?? []).length,
    })),
  }),
);
