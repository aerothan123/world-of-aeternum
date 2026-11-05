// Clean in-game shots of the whole Wyndlewood kit: boots the offline dev
// client at noon, finds flat dry ground near the spawn, stands every kit model
// there in labelled rows through the game's own loader (scene only, nothing
// enters the sim), hides the HUD and the player, and shoots each row; then
// shoots the rebuilt Fallen Chapel where the world places it.
//
//   npx vite --port 5272 --strictPort
//   GAME_URL=http://localhost:5272 SHOTS_DIR=tmp/props_kit/shots2 GPU=1 \
//     node scripts/assets/wyndlewood_props/kit_shots2.mjs
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from '../../browser_path.mjs';
import { enterOfflineGame } from '../../enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5272';
const OUT = process.env.SHOTS_DIR ?? 'tmp/props_kit/shots2';
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
await page.evaluateOnNewDocument(
  `try { localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 3, graphicsDefaultApplied: true })); } catch {}`,
);
await page.goto(`${URL}/?fpscap=display`, { waitUntil: 'networkidle0', timeout: 180000 });
if (
  !(await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'Propsurveyor',
    gameBootTimeoutMs: 240000,
    selectorTimeoutMs: 120000,
  }))
)
  throw new Error('offline world did not boot');
await sleep(1500);
const run = (body) => page.evaluate(`(async () => { ${body} })()`);
async function chat(cmd) {
  await page.evaluate((c) => {
    const el = document.querySelector('#chat-input');
    el.value = c;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }, cmd);
  await sleep(1500);
}
await page.waitForSelector('#chat-input', { timeout: 120000 });
await chat('/daynight day');
await chat('/time 12');

// The rows: every kit model, grouped by category, at most eight to a row.
const rows = await run(`
  const { WYN_PROP_MODELS } = await import('/src/sim/content/wyndlewood_props.ts');
  const by = {};
  for (const m of Object.values(WYN_PROP_MODELS)) (by[m.category] ??= []).push(m);
  const out = [];
  for (const [cat, list] of Object.entries(by))
    for (let i = 0; i < list.length; i += 8) out.push({ name: cat + '-' + (i / 8 + 1), items: list.slice(i, i + 8).map((m) => ({ url: m.url, w: m.w, d: m.d, h: m.propHeight })) });
  return out;
`);
// Flat dry ground near the spawn: a grid search, one site per row.
const sites = await run(`
  const g = window.__game;
  const o = g.sim.player.pos;
  const y0 = o.y;
  const found = [];
  for (let r = 30; r < 260 && found.length < ${rows.length}; r += 18)
    for (let a = 0; a < 6.283 && found.length < ${rows.length}; a += 0.35) {
      const x = o.x + Math.cos(a) * r;
      const z = o.z + Math.sin(a) * r;
      const ys = [];
      for (const [dx, dz] of [[0,0],[-9,0],[9,0],[0,-6],[0,6],[-9,6],[9,6]]) ys.push(g.sim.groundPos(x + dx, z + dz).y);
      const lo = Math.min(...ys), hi = Math.max(...ys);
      if (lo < y0 + 0.8 || hi - lo > 1.4) continue;
      if (found.some((s) => Math.hypot(s.x - x, s.z - z) < 34)) continue;
      found.push({ x, z });
    }
  return found;
`);
console.log('rows', rows.length, 'sites', sites.length);
await run(`
  const { loadGltf } = await import('/src/render/assets/loader.ts');
  const g = window.__game;
  const rows = ${JSON.stringify(rows)};
  const sites = ${JSON.stringify(sites)};
  for (let i = 0; i < rows.length && i < sites.length; i++) {
    const total = rows[i].items.reduce((s, it) => s + Math.max(it.w, 0.6) + 1.4, 0);
    let x = sites[i].x - total / 2;
    for (const it of rows[i].items) {
      const w = Math.max(it.w, 0.6);
      const gltf = await loadGltf(it.url);
      const obj = gltf.scene.clone(true);
      const p = g.sim.groundPos(x + w / 2, sites[i].z);
      obj.position.set(p.x, p.y, p.z);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.renderer.scene.add(obj);
      x += w + 1.4;
    }
  }
`);
async function hideHudAndPlayer() {
  await run(`
    const g = window.__game;
    const main = g.renderer.webgl.domElement;
    for (const el of document.body.querySelectorAll('*')) el.style.visibility = 'hidden';
    main.style.visibility = 'visible';
    // the player: every small scene root standing on the player's spot
    const p = g.sim.player.pos;
    window.__hidden = [];
    const v = new main.ownerDocument.defaultView.Object();
    for (const root of g.renderer.scene.children) {
      if (!root.visible) continue;
      let near = false;
      let big = false;
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingSphere?.();
        const r = (o.geometry.boundingSphere?.radius ?? 0) * Math.max(o.scale.x, o.scale.y, o.scale.z);
        if (r > 4) big = true;
        const w = o.getWorldPosition(o.position.clone());
        if (Math.hypot(w.x - p.x, w.z - p.z) < 2.2 && Math.abs(w.y - p.y) < 3) near = true;
      });
      if (near && !big) { root.visible = false; window.__hidden.push(root); }
    }
    void v;
  `);
}
async function stand(x, z, tx, tz, pitch, dist) {
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
async function shoot(name) {
  await sleep(GPU ? 4500 : 9000);
  await hideHudAndPlayer();
  await sleep(600);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file);
}
for (let i = 0; i < rows.length && i < sites.length; i++) {
  const total = rows[i].items.reduce((s, it) => s + Math.max(it.w, 0.6) + 1.4, 0);
  const tall = Math.max(...rows[i].items.map((it) => it.h));
  const back = Math.max(5, total * 0.34, tall * 1.3);
  await stand(sites[i].x, sites[i].z + back, sites[i].x, sites[i].z, 0.5, 5);
  await shoot(`row-${String(i + 1).padStart(2, '0')}-${rows[i].name}`);
  await run(`for (const r of window.__hidden ?? []) r.visible = true; window.__hidden = [];`);
}
// The rebuilt Fallen Chapel, where the world places it (the Hollow Crypt door).
const door = await run(`
  const { activeDungeonDoorPos, DUNGEONS } = await import('/src/sim/data.ts');
  return activeDungeonDoorPos(DUNGEONS.hollow_crypt);
`);
for (const [name, dx, dz, pitch, dist] of [
  ['chapel-front', 4, -46, 0.3, 7],
  ['chapel-door', 0, -9, 0.28, 5],
  ['chapel-side', -30, -10, 0.32, 7],
]) {
  await stand(door.x + dx, door.z + dz, door.x, door.z - 6, pitch, dist);
  await shoot(name);
  await run(`for (const r of window.__hidden ?? []) r.visible = true; window.__hidden = [];`);
}
await browser.close();
