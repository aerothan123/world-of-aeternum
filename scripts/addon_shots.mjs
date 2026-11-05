// Visual proof of the add-on platform: boots the offline game on the dev server
// (where the SDK examples load by default), starts a fight so the damage meter
// and the encounter timer have something to show, adds a countdown with the
// encounter timer's slash command, then captures the HUD with the three example
// add-ons, the AddOns window, and an add-on's Options panel.
//   node scripts/addon_shots.mjs [outDir]    (needs `npm run dev`; GAME_URL overrides)
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = path.resolve(process.argv[2] ?? 'docs/screenshots/addons');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const click = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`missing ${s}`);
    el.click();
  }, sel);

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
await sleep(500);
await click('#btn-offline');
await sleep(300);
await page.type('#char-name', 'Brindle');
await click('#offline-select .mini-class[data-class="warrior"]');
await click('#btn-start-offline');
await page.waitForFunction(() => window.__game?.sim?.player, { timeout: 90000 });
await sleep(4000);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /skip tutorial/i.test(b.textContent || ''),
  );
  btn?.click();
});
await sleep(500);

// A fight: stand beside the nearest live mob, target it, and swing.
const fight = await page.evaluate(() => {
  const sim = window.__game.sim;
  const p = sim.player;
  let best = null;
  let bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob' || e.dead || e.ownerId !== null || e.level > p.level + 2) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  if (!best) return 'no mob';
  p.pos.x = best.pos.x + 1.5;
  p.pos.z = best.pos.z + 1.5;
  p.prevPos.x = p.pos.x;
  p.prevPos.z = p.pos.z;
  sim.targetEntity(best.id);
  sim.startAutoAttack();
  return best.name;
});
console.log('fighting', fight);
await sleep(1500);
// The encounter timer's own slash command, typed in chat like a player would.
const chat = async (line) => {
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
  await sleep(300);
};
await chat('/et 25 Adds');
await chat('/et pull 9');
await sleep(4500);

const state = await page.evaluate(() => {
  const rt = window.__game.hud.addons.runtime;
  return rt.entries.map((e) => `${e.key}:${e.status}:${e.errors.total}`);
});
console.log('addons', state.join(' '));
await page.screenshot({ path: path.join(OUT, 'addons_in_game.jpg'), type: 'jpeg', quality: 86 });

await chat('/addons');
await sleep(1500);
await page.screenshot({ path: path.join(OUT, 'addons_window.jpg'), type: 'jpeg', quality: 86 });

await page.evaluate(() => {
  const b = document.querySelector(
    '#addons-window [data-act="options"][data-key="simple-damage-meter"]',
  );
  b?.click();
});
await sleep(600);
await page.screenshot({ path: path.join(OUT, 'addons_options.jpg'), type: 'jpeg', quality: 86 });

const perf = await page.evaluate(() => window.__game.perf?.snapshot?.() ?? null);
if (perf) console.log('perf', JSON.stringify(perf).slice(0, 400));
await browser.close();
console.log('wrote', OUT);
