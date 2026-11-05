// Takes the Three.js half of the engine look comparison: the same camera
// poses and times of day as the Unreal slice (unreal/env-slice/Scripts/
// look_shots.json), from a running dev client, HUD hidden, plus the mean
// frame time at each pose. Dev tool only.
//
//   GAME_URL=http://127.0.0.1:5317 OUT_DIR=E:\WyndlewoodUnreal\out \
//     node scripts/world_export/threejs_shots.mjs
//
// Env: GAME_URL (dev server), OUT_DIR, GFX (default high), WORLD_STYLE
// (default refined), SHOTS (comma list), SETTLE_MS, SAMPLE_MS.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from '../browser_path.mjs';
import { dismissEntryOverlays, enterOfflineGame } from '../enter_offline_game.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const LOOK = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'unreal/env-slice/Scripts/look_shots.json'), 'utf8'),
);
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5317';
const OUT = path.resolve(process.env.OUT_DIR ?? 'tmp/look_shots');
const GFX = process.env.GFX ?? 'high';
const STYLE = process.env.WORLD_STYLE ?? 'refined';
const ONLY = (process.env.SHOTS ?? '').split(',').filter(Boolean);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 9000);
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 5000);
// the key-light phases the export used (scripts/world_export/world_slice_export.ts)
const PHASE = { morning: 0.32, noon: 0.5, late_afternoon: 0.64, golden_hour: 0.705, dusk: 0.75 };

fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=2560,1440'],
  defaultViewport: { width: LOOK.width, height: LOOK.height, deviceScaleFactor: 1 },
});
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/play.html?gfx=${GFX}&worldstyle=${STYLE}&fpscap=display`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await enterOfflineGame(page, {
    charName: 'Lookdev',
    charClass: 'warrior',
    settleMs: 6000,
    gameBootTimeoutMs: 180_000,
    selectorTimeoutMs: 120_000,
  });
  await dismissEntryOverlays(page).catch(() => {});
  await page.addStyleTag({
    content: '#hud, .hud, #ui-root, .nameplate, canvas.minimap, #banner, #subzone-banner { display: none !important; }',
  });
  for (const shot of LOOK.shots.filter((s) => !ONLY.length || ONLY.includes(s.name))) {
    await page.evaluate(
      async ({ shot, phase }) => {
        const game = window.__game;
        const [{ terrainHeight, waterLevel }, clock] = await Promise.all([
          import('/src/sim/world.ts'),
          import('/src/render/day_night_clock.ts'),
        ]);
        const seed = game.sim.cfg.seed;
        const [ex, eh, ez] = shot.eye;
        const [tx, th, tz] = shot.target;
        const player = game.sim.player;
        // park the hero behind the camera, out of frame
        player.pos.x = ex + (ex - tx) * 0.05;
        player.pos.z = ez + (ez - tz) * 0.05;
        player.pos.y = terrainHeight(player.pos.x, player.pos.z, seed);
        player.prevPos.x = player.pos.x;
        player.prevPos.y = player.pos.y;
        player.prevPos.z = player.pos.z;
        clock.setDayNightPhaseOverride(phase);
        const r = game.renderer;
        const v = (x, y, z) => r.camera.position.clone().set(x, y, z);
        r.editorCam = {
          pos: v(ex, terrainHeight(ex, ez, seed) + eh, ez),
          target: v(tx, Math.max(terrainHeight(tx, tz, seed), waterLevel()) + th, tz),
        };
        // UE focal on a 36 x 20.25 filmback, as a vertical field of view
        r.camera.fov = (2 * Math.atan(10.125 / shot.focal) * 180) / Math.PI;
        r.camera.updateProjectionMatrix();
      },
      { shot, phase: PHASE[shot.time] },
    );
    await delay(SETTLE_MS);
    const frame = await page.evaluate(async (ms) => {
      const dts = [];
      let last = performance.now();
      const end = last + ms;
      await new Promise((resolve) => {
        const step = (t) => {
          dts.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      dts.sort((a, b) => a - b);
      return {
        meanFrameMs: dts.reduce((a, b) => a + b, 0) / dts.length,
        p95FrameMs: dts[Math.floor(dts.length * 0.95)],
        fov: window.__game.renderer.camera.fov,
      };
    }, SAMPLE_MS);
    const file = path.join(OUT, `threejs_${shot.name}.png`);
    await page.screenshot({ path: file });
    results.push({ name: shot.name, time: shot.time, ...frame, file });
    console.log(JSON.stringify(results.at(-1)));
  }
} finally {
  fs.writeFileSync(path.join(OUT, 'threejs_shots.json'), JSON.stringify(results, null, 1));
  await browser.close();
}
