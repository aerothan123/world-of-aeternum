// In-game close shots of the Wyndlewood props kit: boots the offline dev
// client, sets noon, loads each kit GLB through the game's own loader and
// stands it on the real terrain beside the player (scene-only, nothing enters
// the sim), then captures each group wide and close with the HUD hidden, plus
// a frame-rate / draw-call / triangle sample per shot.
//
//   npx vite --port 5272 --strictPort
//   GAME_URL=http://localhost:5272 SHOTS_DIR=tmp/props_kit/shots GPU=1 \
//     node scripts/assets/wyndlewood_props/kit_shots.mjs
//
// GROUPS (env) limits the run to a comma list of group names.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from '../../browser_path.mjs';
import { enterOfflineGame } from '../../enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5272';
const OUT = process.env.SHOTS_DIR ?? 'tmp/props_kit/shots';
const PRESET = Number(process.env.GRAPHICS_PRESET ?? 3);
const GPU = process.env.GPU === '1';
const ONLY = process.env.GROUPS ? new Set(process.env.GROUPS.split(',')) : null;
const GROUPS = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'shot_groups.json'), 'utf8'));
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
await page.goto(`${URL}/?fpscap=display`, { waitUntil: 'networkidle0', timeout: 180000 });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Propsurveyor',
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

// Stage every group once, each around its own anchor beside the spawn point.
const origin = await run(`const p = window.__game.sim.player; return { x: p.pos.x, z: p.pos.z };`);
console.log('origin', JSON.stringify(origin));
await run(`
  const { loadGltf } = await import('/src/render/assets/loader.ts');
  const g = window.__game;
  const scene = g.renderer.scene;
  const groups = ${JSON.stringify(GROUPS)};
  window.__kitStage = {};
  for (const grp of groups) {
    const ax = ${origin.x} + grp.anchor[0];
    const az = ${origin.z} + grp.anchor[1];
    for (const it of grp.items) {
      const gltf = await loadGltf('/models/props/wyn_' + it.id + '.glb');
      const obj = gltf.scene.clone(true);
      const x = ax + it.at[0];
      const z = az + it.at[1];
      const pos = g.sim.groundPos(x, z);
      obj.position.set(pos.x, pos.y + (it.lift ?? 0), pos.z);
      obj.rotation.set(it.tilt ?? 0, it.yaw ?? 0, 0);
      if (it.scale) obj.scale.setScalar(it.scale);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(obj);
    }
    window.__kitStage[grp.name] = { ax, az };
  }
`);

async function standLooking(x, z, tx, tz, pitch, dist) {
  await run(`
    const g = window.__game;
    const p = g.sim.player;
    const pos = g.sim.groundPos(${x}, ${z});
    p.pos = { ...pos }; p.prevPos = { ...pos };
    const yaw = Math.atan2(${tx} - ${x}, ${tz} - ${z});
    p.facing = yaw; p.prevFacing = yaw;
    p.vx = 0; p.vy = 0; p.vz = 0;
    g.input.camYaw = g.renderer.camYaw = yaw;
    g.input.camPitch = g.renderer.camPitch = ${pitch};
    g.input.camDist = g.renderer.camDist = ${dist};
  `);
}
async function hideHud() {
  await run(`
    for (const el of document.body.querySelectorAll('*')) {
      if (el.tagName === 'CANVAS' || el.querySelector('canvas')) continue;
      if (el.closest('canvas')) continue;
      const parentHasCanvas = el.parentElement && (el.parentElement === document.body || el.parentElement.querySelector(':scope > canvas'));
      if (parentHasCanvas) el.style.visibility = 'hidden';
    }
  `);
}
async function sample() {
  return run(`
    return await new Promise((resolve) => {
      const info = window.__game.renderer.webgl.info.render;
      let frames = 0; const t0 = performance.now();
      let calls = 0; let tris = 0;
      const tick = () => {
        frames++; calls = Math.max(calls, info.calls); tris = Math.max(tris, info.triangles);
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
        else resolve({ fps: Math.round((frames * 1000) / (performance.now() - t0)), calls, tris });
      };
      requestAnimationFrame(tick);
    });
  `);
}

const perf = {};
for (const grp of GROUPS) {
  if (ONLY && !ONLY.has(grp.name)) continue;
  for (const shot of grp.shots) {
    const ax = origin.x + grp.anchor[0];
    const az = origin.z + grp.anchor[1];
    const at = [ax + shot.at[0], az + shot.at[1]];
    const look = [ax + shot.look[0], az + shot.look[1]];
    await standLooking(...at, ...look, shot.pitch, shot.dist);
    await sleep(GPU ? 5000 : 10000);
    await standLooking(...at, ...look, shot.pitch, shot.dist);
    await sleep(1200);
    await hideHud();
    const name = `${grp.name}-${shot.name}`;
    perf[name] = await sample();
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', file, JSON.stringify(perf[name]));
  }
}
perf.snapshot = await run(`return window.__game.perf?.snapshot?.() ?? null;`).catch(() => null);
fs.writeFileSync(path.join(OUT, 'perf.json'), `${JSON.stringify(perf, null, 2)}\n`);
await browser.close();
