// One high oblique aerial per overworld zone (or per entry of a ZONES_JSON list),
// for world-building surveys. Offline client, noon, HUD and nameplates hidden,
// camera held by the renderer's editor-camera override (renderer.editorCam, the
// hook scripts/eastbrook_aerial_shot.mjs on feature/town-kit uses), the player
// parked at each target so its zone streams in first.
//
//   npx vite --port 5261
//   GAME_URL=http://localhost:5261 SHOTS_DIR=tmp/world-survey GPU=1 \
//     node scripts/world_survey_aerials.mjs
//
// GRAPHICS_PRESET (default 3 high), ONLY (comma list of zone ids), TARGETS
// (JSON file of [{ id, x, z, dist?, height? }] overriding the zone hubs).
// LAPS (default 1): extra laps revisit every target without a screenshot and
// log the long-session memory readout (JS heap, renderer geometry and texture
// counts, resident zone count) after each stop, to check desktop eviction.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5261';
const OUT = process.env.SHOTS_DIR ?? 'tmp/world-survey';
const PRESET = Number(process.env.GRAPHICS_PRESET ?? 3);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const GPU = process.env.GPU === '1';
const PREFIX = process.env.PREFIX ?? 'aerial-';
const W = 1600;
const H = 900;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    `--window-size=${W},${H}`,
    ...(GPU
      ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  ],
  defaultViewport: { width: W, height: H },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(`
  try { localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: ${PRESET}, graphicsDefaultApplied: true, worldStyle: 1 })); } catch {}
`);
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180000 });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Surveyor',
  gameBootTimeoutMs: 240000,
  selectorTimeoutMs: 120000,
});
if (!booted) throw new Error('offline world did not boot');
await sleep(1500);
const run = (body) => page.evaluate(`(async () => { ${body} })()`);

await page.waitForSelector('#chat-input', { timeout: 120000 });
await page.evaluate(() => {
  const chat = document.querySelector('#chat-input');
  chat.value = '/daynight day';
  chat.dispatchEvent(new Event('input', { bubbles: true }));
  chat.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await sleep(4000);
await page.addStyleTag({ content: '#ui, #nameplates { display: none !important; }' });

let targets;
if (process.env.TARGETS) {
  targets = JSON.parse(fs.readFileSync(process.env.TARGETS, 'utf8'));
} else {
  targets = await run(`
    const zones = window.__game.sim.constructor && (await import('/src/sim/data.ts')).ZONES;
    return zones.map((z) => ({ id: z.id, x: z.hub.x, z: z.hub.z,
      cx: ((z.xMin ?? -180) + (z.xMax ?? 180)) / 2, cz: (z.zMin + z.zMax) / 2 }));
  `);
}
const LAPS = Number(process.env.LAPS ?? 1);
const memory = () =>
  run(`
    const g = window.__game;
    const r = g.renderer;
    let info = null;
    for (const k of Object.keys(r)) { const v = r[k]; if (v && v.info && v.info.memory) { info = v.info.memory; break; } }
    return { heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      geometries: info ? info.geometries : null, textures: info ? info.textures : null,
      zones: r.preparedZones ? r.preparedZones.size : null };
  `).catch(() => null);
for (let lap = 0; lap < LAPS; lap++)
  for (const t of targets) {
    if (ONLY && !ONLY.has(t.id)) continue;
    if (lap > 0) {
      await run(`
      const g = window.__game; const p = g.sim.player;
      const pos = g.sim.groundPos(${t.cx ?? t.x}, ${t.cz ?? t.z});
      p.pos = { ...pos }; p.prevPos = { ...pos }; p.vx = 0; p.vy = 0; p.vz = 0;
      g.renderer.editorCam = null;
    `);
      await sleep(GPU ? 10000 : 20000);
      console.log('lap', lap, t.id, JSON.stringify(await memory()));
      continue;
    }
    const cx = t.cx ?? t.x;
    const cz = t.cz ?? t.z;
    await run(`
    const g = window.__game;
    const p = g.sim.player;
    const pos = g.sim.groundPos(${cx}, ${cz});
    p.pos = { ...pos }; p.prevPos = { ...pos };
    p.vx = 0; p.vy = 0; p.vz = 0;
    g.renderer.editorCam = null;
  `);
    await sleep(GPU ? 12000 : 25000);
    const dist = t.dist ?? 250;
    const height = t.height ?? 230;
    await run(`
    const g = window.__game;
    const T = g.renderer.camera.position.constructor;
    const ty = g.sim.groundPos(${cx}, ${cz}).y;
    g.renderer.editorCam = {
      target: new T(${cx}, ty, ${cz}),
      pos: new T(${cx}, ty + ${height}, ${cz} - ${dist}),
    };
  `);
    await sleep(GPU ? 9000 : 18000);
    const file = path.join(OUT, `${PREFIX}${t.id}.png`);
    await page.screenshot({ path: file });
    const perf = await run(
      'const s = window.__game.perf && window.__game.perf.snapshot ? window.__game.perf.snapshot() : null; return s ? { fps: s.fps, drawCalls: s.drawCalls ?? s.calls, tris: s.triangles ?? s.tris } : null;',
    ).catch(() => null);
    console.log('wrote', file, JSON.stringify(perf), JSON.stringify(await memory()));
  }
await run('window.__game.renderer.editorCam = null;');
await browser.close();
