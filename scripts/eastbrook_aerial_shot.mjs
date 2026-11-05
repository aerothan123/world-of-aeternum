// High aerial captures of Eastbrook (docs/design/town-layout-eastbrook.md): a near
// top-down overview of the whole town and two 45-degree obliques, from the south and
// from the harbour. Offline client, dev build, noon, HUD and nameplates hidden, the
// camera held by the renderer's editor-camera override (renderer.editorCam, the same
// hook the look-capture scripts use), the player parked in the middle of town so the
// terrain and props around it are resident.
//
//   npx vite --port 5191
//   GAME_URL=http://localhost:5191 SHOTS_DIR=tmp/eastbrook-aerial GPU=1 \
//     node scripts/eastbrook_aerial_shot.mjs
//
// GRAPHICS_PRESET picks the preset (4 ultra, the default here; 3 high). PREFIX wraps
// every file name. ONLY limits the run to a comma list of shot names.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5191';
const OUT = process.env.SHOTS_DIR ?? 'tmp/eastbrook-aerial';
const PRESET = Number(process.env.GRAPHICS_PRESET ?? 4);
const PREFIX = process.env.PREFIX ?? '';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const GPU = process.env.GPU === '1';
const W = 1920;
const H = 1080;
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
  charName: 'Skywatcher',
  gameBootTimeoutMs: 240000,
  selectorTimeoutMs: 120000,
});
if (!booted) throw new Error('offline world did not boot');
await sleep(1500);

function run(body) {
  return page.evaluate(`(async () => { ${body} })()`);
}

await page.waitForSelector('#chat-input', { timeout: 120000 });
await page.evaluate(() => {
  const chat = document.querySelector('#chat-input');
  chat.value = '/daynight day';
  chat.dispatchEvent(new Event('input', { bubbles: true }));
  chat.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await sleep(5000);
await page.addStyleTag({ content: '#ui, #nameplates { display: none !important; }' });

// The town's middle: between the square, the crafting yard and Market Row.
const TOWN = { x: -30, z: -85 };
await run(`
  const g = window.__game;
  const p = g.sim.player;
  const pos = g.sim.groundPos(${TOWN.x}, ${TOWN.z});
  p.pos = { ...pos };
  p.prevPos = { ...pos };
  p.vx = 0; p.vy = 0; p.vz = 0;
`);
await sleep(GPU ? 8000 : 15000);

const SHOTS = [
  // Near straight down over the whole town, tipped a few degrees so walls read.
  { name: 'aerial-overview', target: [-30, -82], pos: [-30, 200, -125] },
  // 45 degrees from the south (looking north up the town; south is -z).
  { name: 'aerial-oblique-south', target: [-30, -85], pos: [-30, 115, -200] },
  // 45 degrees from the harbour (east of town is -x), looking inland.
  { name: 'aerial-oblique-harbour', target: [-35, -80], pos: [-150, 115, -60] },
];

for (const s of SHOTS) {
  if (ONLY && !ONLY.has(s.name)) continue;
  await run(`
    const g = window.__game;
    const T = g.renderer.camera.position.constructor;
    const ty = g.sim.groundPos(${s.target[0]}, ${s.target[1]}).y;
    g.renderer.editorCam = {
      target: new T(${s.target[0]}, ty, ${s.target[1]}),
      pos: new T(${s.pos[0]}, ty + ${s.pos[1]}, ${s.pos[2]}),
    };
  `);
  await sleep(GPU ? 9000 : 18000);
  const file = path.join(OUT, `${PREFIX}${s.name}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file);
}
await run('window.__game.renderer.editorCam = null;');
await browser.close();
