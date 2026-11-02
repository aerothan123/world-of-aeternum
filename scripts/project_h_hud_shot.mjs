// Before/after captures for the Project H interface packets
// (docs/design/project-h-interface.md): the in-world desktop HUD and the
// landscape mobile HUD through the shared offline entry flow, plus a desktop
// frame with a target selected so the thin target bar is in the picture.
// A bespoke rig only because the packet's subject spans the whole HUD rather
// than one window: the generic pr_screenshots.mjs plan picks a window target
// from a diff that also touches settings. Seeds the LOWEST graphics preset
// (the standing capture rule) and waits out the long software-GL world boot.
//
// Run:  npx vite --port 5173   (in another terminal)
//       BROWSER_PATH=/path/to/chrome SHOTS_DIR=out node scripts/project_h_hud_shot.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { enterOfflineGame } from './enter_offline_game.mjs';
import { suppressGpuNotice } from './lib/gpu_notice_suppress.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS_DIR ?? 'project-h-shots';
const PREFIX = process.env.SHOT_PREFIX ?? 'after';
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS ?? 240000);
fs.mkdirSync(OUT, { recursive: true });

const { BROWSER_PATH } = await import('./browser_path.mjs');
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});

// Software GL on a small box: the class cards and the world boot both take
// minutes, so the waits are generous and the loading screen is polled away.
const ENTRY_OPTS = { settleMs: 4000, selectorTimeoutMs: 300000, gameBootTimeoutMs: 600000 };
const LOADING_TIMEOUT = Number(process.env.LOADING_TIMEOUT_MS ?? 900000);

async function waitForWorld(page) {
  await page.waitForFunction(
    () => {
      const loading = document.getElementById('loading-screen');
      const gone = !loading || getComputedStyle(loading).display === 'none' || loading.hidden;
      return gone && !!window.__game?.sim?.player;
    },
    { timeout: LOADING_TIMEOUT, polling: 1000 },
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedLowestPreset(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 1 }));
      localStorage.removeItem('woc_entry_probe');
    } catch {
      /* storage unavailable */
    }
  });
}

async function targetNearest(page) {
  // Drive the real Tab keybind (target nearest) so the target bar paints from
  // the live path; fall back to the debug hook when nothing is in range.
  await page.keyboard.press('Tab');
  await sleep(600);
  const targeted = await page.evaluate(() => {
    const g = window.__game;
    if (!g?.sim?.player) return false;
    if (g.sim.player.targetId != null) return true;
    const p = g.sim.player;
    let best = null;
    let bestD = Infinity;
    for (const e of g.sim.entities?.values?.() ?? []) {
      if (e === p || e.dead) continue;
      const d = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) p.targetId = best.id;
    return best != null;
  });
  await sleep(800);
  return targeted;
}

const errors = [];
try {
  const page = await browser.newPage();
  await seedLowestPreset(page);
  await suppressGpuNotice(page);
  page.on('pageerror', (e) => errors.push(`desktop: ${e.message}`));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT });
  await enterOfflineGame(page, { charClass: 'warrior', charName: 'Thorgar', ...ENTRY_OPTS });
  await waitForWorld(page);
  await sleep(4000);
  await page.screenshot({ path: `${OUT}/${PREFIX}-desktop.png` });
  const targeted = await targetNearest(page);
  await page.screenshot({ path: `${OUT}/${PREFIX}-desktop-target.png` });
  console.log(`desktop: captured (target ${targeted ? 'shown' : 'none in range'})`);
  await page.close();
} catch (e) {
  errors.push(`desktop: ${e.message}`);
}

if (process.env.SKIP_MOBILE !== '1')
  try {
    const mobile = await browser.newPage();
    await seedLowestPreset(mobile);
    await suppressGpuNotice(mobile);
    mobile.on('pageerror', (e) => errors.push(`mobile: ${e.message}`));
    await mobile.emulate({
      viewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await mobile.goto(URL, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT });
    await mobile.evaluate(() => document.body.classList.add('mobile-touch'));
    await enterOfflineGame(mobile, { charClass: 'mage', charName: 'Aldwin', ...ENTRY_OPTS });
    await waitForWorld(mobile);
    await sleep(4000);
    await mobile.screenshot({ path: `${OUT}/${PREFIX}-mobile-landscape.png` });
    console.log('mobile: captured');
    await mobile.close();
  } catch (e) {
    errors.push(`mobile: ${e.message}`);
  }

await browser.close();
if (errors.length) console.log(`errors:\n${errors.join('\n')}`);
console.log(`wrote ${OUT}/${PREFIX}-*.png`);
