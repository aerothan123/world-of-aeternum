// Wyndlewood Chapter One capture: the Eastbrook quest board's Notices tab and a
// Chapter One quest dialog, driven through the offline client.
//
// Usage (dev server on the given port, e.g. `npx vite --port 5241 --strictPort`):
//   BROWSER_PATH=<chromium or edge> PORT=5241 OUT_DIR=<dir> node scripts/wyndlewood_board_shot.mjs
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { enterOfflineGame } from './enter_offline_game.mjs';

const PORT = process.env.PORT ?? '5241';
const OUT = process.env.OUT_DIR ?? 'wyndlewood-shots';
const BROWSER = process.env.BROWSER_PATH;
if (!BROWSER) throw new Error('BROWSER_PATH is required');
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console.error', m.text().slice(0, 200));
});
await page.goto(`http://localhost:${PORT}/?fpscap=display`, { waitUntil: 'domcontentloaded' });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  settleMs: 8000,
  gameBootTimeoutMs: 180000,
  selectorTimeoutMs: 180000,
});
console.log('booted', booted);
if (!booted) await page.waitForFunction(() => window.__game?.sim?.player, { timeout: 300000 });

// Stage a player who has finished "Someone to Vouch for You", standing at the board.
await page.evaluate(() => {
  const g = window.__game;
  const s = g.sim;
  const meta = s.players.get(s.player.id);
  for (const q of ['c1_01_arrival', 'c1_02_beacon_lied', 'c1_07_across', 'c1_08_vouch']) {
    meta.questsDone.add(q);
  }
  if (typeof s.setPlayerLevel === 'function') s.setPlayerLevel(4);
  else s.player.level = 4;
  s.player.pos.x = 5;
  s.player.pos.z = -86;
});
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => window.__game.hud.openGuildBoard('eastbrook_noticeboard'));
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: path.join(OUT, 'board_full.png') });
const board = await page.$('#guild-board-window');
if (board) await board.screenshot({ path: path.join(OUT, 'board_window.png') });
const rows = await page.evaluate(
  () => document.querySelectorAll('#guild-board-window .tb-notice').length,
);
console.log('board rows', rows);

// A Chapter One quest dialog: Brother Aldric offering "Flowers Facing Down".
await page.evaluate(() => window.__game.hud.openGuildBoard && document.querySelector('#guild-board-window .close, #guild-board-window [data-close]')?.click());
await page.evaluate(() => {
  const s = window.__game.sim;
  const aldric = [...s.entities.values()].find((e) => e.templateId === 'brother_aldric');
  s.player.pos.x = aldric.pos.x;
  s.player.pos.z = aldric.pos.z + 1.5;
  s.talkToNpc(aldric.id);
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: path.join(OUT, 'quest_dialog_full.png') });
console.log('done');
await browser.close();
