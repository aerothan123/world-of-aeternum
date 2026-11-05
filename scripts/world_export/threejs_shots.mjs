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
const PROGRESS = path.join(OUT, 'threejs_progress.log');
const note = (m) => fs.appendFileSync(PROGRESS, `${new Date().toISOString()} ${m}\n`);
note('launch');
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=2560,1440'],
  defaultViewport: { width: LOOK.width, height: LOOK.height, deviceScaleFactor: 1 },
});
const results = [];
try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') note(`console ${m.text().slice(0, 300)}`);
  });
  note('goto');
  await page.goto(`${BASE}/?gfx=${GFX}&worldstyle=${STYLE}&fpscap=display`, {
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
  note('entered');
  await dismissEntryOverlays(page).catch(() => {});
  await page.addStyleTag({
    content:
      '#hud, .hud, #ui-root, .nameplate, canvas.minimap, #banner, #subzone-banner { display: none !important; }',
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
        const back = 30 / Math.hypot(ex - tx, ez - tz);
        player.pos.x = ex + (ex - tx) * back;
        player.pos.z = ez + (ez - tz) * back;
        player.pos.y = terrainHeight(player.pos.x, player.pos.z, seed);
        player.prevPos.x = player.pos.x;
        player.prevPos.y = player.pos.y;
        player.prevPos.z = player.pos.z;
        clock.setDayNightPhaseOverride(phase);
        const r = game.renderer;
        const v = (x, y, z) => r.camera.position.clone().set(x, y, z);
        const pose = {
          pos: v(ex, terrainHeight(ex, ez, seed) + eh, ez),
          target: v(tx, Math.max(terrainHeight(tx, tz, seed), waterLevel()) + th, tz),
          // UE focal on a 36 x 20.25 filmback, as a vertical field of view
          fov: (2 * Math.atan(10.125 / shot.focal) * 180) / Math.PI,
        };
        // The chase camera rewrites the pose every frame, so pin it at the
        // last moment: on each draw of the main camera (the composer passes
        // draw through the same WebGLRenderer.render).
        window.__lookPose = pose;
        // Re-read the live renderer and camera on every draw: a slow boot
        // can rebuild either after this runs (a single-shot run once drew
        // the chase camera at its default fov because the pin sat on a
        // stale pair).
        if (!r.webgl.__lookPinned) {
          const orig = r.webgl.render.bind(r.webgl);
          r.webgl.render = (scene, cam) => {
            const p = window.__lookPose;
            // A fresh character on the starter island draws through an
            // intro camera rather than renderer.camera, so any 16:9
            // perspective view camera is pinned too (shadow and cube
            // cameras are not 16:9).
            const view =
              cam === window.__game.renderer.camera ||
              (cam?.isPerspectiveCamera && Math.abs(cam.aspect - 16 / 9) < 0.02);
            if (p && view) {
              window.__lookPinDraws = (window.__lookPinDraws ?? 0) + 1;
              // the game camera hangs under a boom rig, so its local pose is
              // not its world pose: write the world matrices directly and
              // stop the scene graph from recomputing them
              p.m = p.m ?? cam.matrixWorld.clone();
              p.m.lookAt(p.pos, p.target, cam.up);
              p.m.setPosition(p.pos);
              cam.matrixAutoUpdate = false;
              cam.matrixWorldAutoUpdate = false;
              cam.matrixWorld.copy(p.m);
              cam.matrixWorldInverse.copy(p.m).invert();
              if (cam.fov !== p.fov) {
                cam.fov = p.fov;
                cam.updateProjectionMatrix();
              }
            }
            return orig(scene, cam);
          };
          r.webgl.__lookPinned = true;
        }
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
        // draws the pose pin rewrote; 0 means the shot is the chase camera
        pinnedDraws: window.__lookPinDraws ?? 0,
        sameRenderer: window.__game.renderer.webgl.__lookPinned === true,
      };
    }, SAMPLE_MS);
    const file = path.join(OUT, `threejs_${shot.name}.png`);
    // the world canvas alone: hide every DOM layer that is not the canvas or
    // one of its ancestors (the HUD, nameplates and tutorial are DOM)
    await page.evaluate(() => {
      const c = [...document.querySelectorAll('canvas')].sort(
        (a, b) => b.width * b.height - a.width * a.height,
      )[0];
      for (const el of document.body.querySelectorAll('*')) {
        el.style.visibility = el === c || el.contains(c) ? 'visible' : 'hidden';
      }
    });
    await delay(300);
    await page.screenshot({ path: file });
    results.push({ name: shot.name, time: shot.time, ...frame, file });
    note(JSON.stringify(results.at(-1)));
  }
} catch (err) {
  note(`error ${err?.stack ?? err}`);
  throw err;
} finally {
  fs.writeFileSync(path.join(OUT, 'threejs_shots.json'), JSON.stringify(results, null, 1));
  await browser.close();
}
