// Owner-facing captures of Eastbrook for the town kit (docs/design/town-layout-eastbrook.md):
// the overview from the ferry bell's quay landing, the crafting yard, Market Row and the
// two housing streets, each with a frame-rate, draw-call and triangle sample. Offline
// client, dev build, driven through window.__game the way drakelands_harbor_shot.mjs is.
// The same camera stations serve the before and after captures (run it against a dev
// server on the old code first).
//
//   npx vite --port 5191
//   GAME_URL=http://localhost:5191 SHOTS_DIR=tmp/eastbrook-kit PREFIX=after- GPU=1 \
//     node scripts/eastbrook_town_kit_shot.mjs
//
// GRAPHICS_PRESET picks the preset (1 low, 3 high, the default). ONLY limits the run to
// a comma list of shot names.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5191';
const OUT = process.env.SHOTS_DIR ?? 'tmp/eastbrook-kit';
const PRESET = Number(process.env.GRAPHICS_PRESET ?? 3);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const PREFIX = process.env.PREFIX ?? '';
const GPU = process.env.GPU === '1';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--window-size=1600,900',
    ...(GPU
      ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  ],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(`
  try { localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: ${PRESET}, graphicsDefaultApplied: true })); } catch {}
`);
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180000 });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Townsurveyor',
  gameBootTimeoutMs: 240000,
  selectorTimeoutMs: 120000,
});
if (!booted) throw new Error('offline world did not boot');
await sleep(1500);

function run(body) {
  return page.evaluate(`(async () => { ${body} })()`);
}

await run(`window.__game.sim.setPlayerLevel(20);`);
await page.waitForSelector('#chat-input', { timeout: 120000 });
await page.evaluate(() => {
  const chat = document.querySelector('#chat-input');
  chat.value = '/daynight day';
  chat.dispatchEvent(new Event('input', { bubbles: true }));
  chat.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await sleep(5000);

/** Stand the player at (x, z), the camera looking at world point (tx, tz). */
async function standLooking(x, z, tx, tz, pitch, dist) {
  await run(`
    const g = window.__game;
    const p = g.sim.player;
    const pos = g.sim.groundPos(${x}, ${z});
    p.pos = { ...pos };
    p.prevPos = { ...pos };
    const yaw = Math.atan2(${tx} - ${x}, ${tz} - ${z});
    p.facing = yaw;
    p.prevFacing = yaw;
    p.vx = 0; p.vy = 0; p.vz = 0;
    g.input.camYaw = g.renderer.camYaw = yaw;
    g.input.camPitch = g.renderer.camPitch = ${pitch};
    g.input.camDist = g.renderer.camDist = ${dist};
  `);
}

async function sample() {
  return run(`
    return await new Promise((resolve) => {
      // The renderer may not reset info per frame, so the counters are read as
      // a per-frame mean over the window: (end - start) / frames, or the
      // largest single frame when a reset lands inside the window.
      const info = window.__game.renderer.webgl.info.render;
      let frames = 0;
      let prevCalls = info.calls;
      let prevTris = info.triangles;
      const startCalls = info.calls;
      const startTris = info.triangles;
      let resetSeen = false;
      let frameCalls = 0;
      let frameTris = 0;
      const t0 = performance.now();
      const tick = () => {
        frames++;
        if (info.calls < prevCalls) {
          resetSeen = true;
          frameCalls = Math.max(frameCalls, prevCalls);
          frameTris = Math.max(frameTris, prevTris);
        }
        prevCalls = info.calls;
        prevTris = info.triangles;
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
        else {
          const calls = resetSeen ? frameCalls : Math.round((info.calls - startCalls) / frames);
          const tris = resetSeen ? frameTris : Math.round((info.triangles - startTris) / frames);
          resolve({ fps: Math.round((frames * 1000) / (performance.now() - t0)), calls, tris });
        }
      };
      requestAnimationFrame(tick);
    });
  `);
}

const STATIONS = [
  // From the ferry bell's town landing (FERRY_BELL_TOWN_LANDING), up into town.
  { name: 'quay-overview', at: [-92.5, -46.5], look: [-60, -66], pitch: 0.55, dist: 24 },
  // The crafting yard south of the square, from its square end.
  { name: 'crafting-yard', at: [-7, -100], look: [-9, -118], pitch: 0.5, dist: 15 },
  // Market Row: the trading post and the storage shed from the main street.
  { name: 'market-row', at: [-34, -97], look: [-35, -108], pitch: 0.3, dist: 13 },
  // Housing street B down the main street.
  { name: 'housing-street', at: [-52, -74], look: [-62, -92], pitch: 0.3, dist: 13 },
  // Housing street A: the row terrace on the harbour rise.
  { name: 'housing-terrace', at: [-74, -60], look: [-78, -44.5], pitch: 0.28, dist: 13 },
];

const perf = {};
for (const s of STATIONS) {
  if (ONLY && !ONLY.has(s.name)) continue;
  await standLooking(...s.at, ...s.look, s.pitch, s.dist);
  await sleep(GPU ? 6000 : 12000);
  await standLooking(...s.at, ...s.look, s.pitch, s.dist);
  await sleep(1500);
  perf[s.name] = await sample();
  await run(
    `for (const id of ['#error-msg']) { const el = document.querySelector(id); if (el) el.style.visibility = 'hidden'; }`,
  );
  const file = path.join(OUT, `${PREFIX}${s.name}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file, JSON.stringify(perf[s.name]));
}
fs.writeFileSync(path.join(OUT, `${PREFIX}perf.json`), `${JSON.stringify(perf, null, 2)}\n`);
await browser.close();
