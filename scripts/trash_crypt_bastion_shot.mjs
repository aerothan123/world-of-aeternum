// Evidence frames of the Sunken Bastion trash mechanics pass
// (src/sim/mob/trash_kit/bastion_kit.ts) in a live offline world (the Hollow
// Crypt's sequences left with the dungeon, retired 2026-11-11):
// every mechanic set up with /dev spawns, framed, saved frame by frame and
// joined into one strip per mechanic. Evidence tooling, not a repo test.
//
//   node scripts/trash_crypt_bastion_shot.mjs [outDir] [seq ...]
//
// Env: SHOT_URL (http://127.0.0.1:5249/), BROWSER_PATH, SHOT_PRESET (4),
// SHOT_W / SHOT_H (1280x720), SHOT_GPU=0 to force SwiftShader.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.SHOT_URL ?? 'http://127.0.0.1:5249/';
const OUT = process.argv[2] ?? path.join('tmp', 'trash_crypt_bastion');
const ONLY = process.argv.slice(3);
const W = Number(process.env.SHOT_W ?? 1280);
const H = Number(process.env.SHOT_H ?? 720);
const PRESET = Number(process.env.SHOT_PRESET ?? 4);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each sequence: the dungeon (bastion) and difficulty, the mobs to
// spawn (/dev <d> spawn <type>, each 10 yd ahead of where the player faces,
// the player turned by `spread` between spawns), a setup action, then the
// trigger: a cast id to wait for on a bar, an aura id to wait for, or an
// action, and the frames (ms after the trigger) to save.
const SEQS = [
  // ---- the Sunken Bastion ----
  {
    id: 'bichero',
    dir: 'bastion',
    d: 'bastion',
    spawn: ['watchman'],
    spawnDist: 14,
    // A lone player is the watchman's own foe: hold it rooted at range so its
    // hook (8 yd and out) has someone to reach.
    action: 'rootWatchman',
    cast: 'bastion_boathook',
    frames: [100, 900, 1700, 2050, 2350, 2800],
    cam: { yaw: 1.3, pitch: 0.45, dist: 22 },
  },
  {
    id: 'muro_alabardas_heroico',
    dir: 'bastion',
    d: 'bastion',
    heroic: true,
    spawn: ['watchman', 'watchman'],
    spread: 0.25,
    aura: { id: 'bastion_halberd_wall' },
    frames: [300, 1500],
    cam: { yaw: 1.2, pitch: 0.35, dist: 18 },
  },
  {
    id: 'retirada_ballestero',
    dir: 'bastion',
    d: 'bastion',
    spawn: ['arbalest'],
    action: 'stepToArbalest',
    frames: [2600, 3000, 3200, 3400, 3700, 4400],
    cam: { yaw: 1.4, pitch: 0.35, dist: 18 },
  },
  {
    id: 'atracon_cangrejo',
    dir: 'bastion',
    d: 'bastion',
    spawn: ['crawler', 'revenant'],
    spread: 0.12,
    action: 'killRevenant',
    frames: [500, 3500, 6500, 9500],
    after: { action: 'killCrawler', frames: [300, 900, 1400, 1700, 2200] },
    cam: { yaw: 1.0, pitch: 0.55, dist: 16 },
  },
  {
    id: 'jauria_perros',
    dir: 'bastion',
    d: 'bastion',
    spawn: ['warhound', 'warhound', 'warhound'],
    spread: 0.3,
    action: 'killHound',
    frames: [100, 500, 1000, 1700, 3000],
    cam: { yaw: 1.2, pitch: 0.35, dist: 18 },
  },
  {
    id: 'banco_niebla',
    dir: 'bastion',
    d: 'bastion',
    spawn: ['mistweaver', 'revenant'],
    spread: 0.5,
    cast: 'bastion_fog_bank',
    frames: [100, 1000, 1900, 2300, 4000, 8000],
    cam: { yaw: 1.1, pitch: 0.55, dist: 20 },
  },
  {
    id: 'columna_salmuera',
    dir: 'bastion',
    d: 'bastion',
    spawn: ['acolyte'],
    cast: 'bastion_brine_column',
    frames: [100, 1000, 2000, 3200, 3900, 4400],
    cam: { yaw: 1.3, pitch: 0.4, dist: 16 },
  },
  {
    id: 'grilletes_rotos',
    dir: 'bastion',
    d: 'bastion',
    spawn: ['prisoner'],
    action: 'woundPrisoner',
    actionAfter: 1500,
    frames: [100, 600, 1500, 3000, 4800, 5400, 6000],
    cam: { yaw: 1.2, pitch: 0.3, dist: 12 },
  },
];

async function strip(files, out) {
  const rootRequire = createRequire(import.meta.url);
  const cliRequire = createRequire(rootRequire.resolve('@gltf-transform/cli'));
  const sharp = (await import(pathToFileURL(cliRequire.resolve('sharp')).href)).default;
  const w = Math.round(W / 2);
  const h = Math.round(H / 2);
  const cols = Math.min(files.length, 4);
  const rows = Math.ceil(files.length / cols);
  const tiles = await Promise.all(
    files.map(async (f, i) => ({
      input: await sharp(f).resize(w, h).toBuffer(),
      left: (i % cols) * w,
      top: Math.floor(i / cols) * h,
    })),
  );
  await sharp({
    create: { width: cols * w, height: rows * h, channels: 3, background: '#000' },
  })
    .composite(tiles)
    .png()
    .toFile(out);
}

const chat = (page, c) => page.evaluate((cmd) => window.__game.world.chat(cmd), c);

/** The scripted page actions (the offline world is the Sim itself). */
async function action(page, name) {
  return page.evaluate((n) => {
    const w = window.__game.world;
    const ctx = w.ctx;
    const me = w.player;
    const mobs = [...w.entities.values()].filter((e) => e.kind === 'mob' && !e.dead);
    const first = (t) => mobs.find((e) => e.templateId === t);
    const kill = (e) => e && ctx.handleDeath(e, me);
    if (n === 'stepToArbalest') {
      const a = first('fogbound_arbalest');
      if (a) {
        me.pos = { x: a.pos.x + 2, y: a.pos.y, z: a.pos.z };
        me.prevPos = { ...me.pos };
      }
    }
    if (n === 'rootWatchman') {
      // Hold it 14 yd out (a lone player is its own foe, and the hook only
      // reaches 8 yd and out): the capture freezes its stride.
      const wm = first('drowned_watchman');
      if (wm) {
        wm.moveSpeed = 0;
        const dx = me.pos.x - wm.pos.x;
        const dz = me.pos.z - wm.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        me.pos = { x: wm.pos.x + (dx / len) * 14, y: me.pos.y, z: wm.pos.z + (dz / len) * 14 };
        me.prevPos = { ...me.pos };
      }
    }
    if (n === 'killRevenant') kill(first('bastion_revenant'));
    if (n === 'killCrawler') kill(first('barnacle_crawler'));
    if (n === 'killHound') kill(first('bastion_warhound'));
    if (n === 'woundPrisoner') {
      const p = first('shackled_prisoner');
      if (p) ctx.dealDamage(me, p, p.maxHp * 2, false, 'physical', 'Strike', 'hit');
    }
    return true;
  }, name);
}

async function waitCast(page, cast, timeout = 45000) {
  return page
    .waitForFunction(
      (c) => {
        for (const e of window.__game.world.entities.values())
          if (e.castingAbility === c && e.castTotal > 0) return true;
        return false;
      },
      { timeout, polling: 30 },
      cast,
    )
    .then(() => true)
    .catch(() => false);
}

async function waitAura(page, aura, timeout = 45000) {
  return page
    .waitForFunction(
      (a) => {
        for (const e of window.__game.world.entities.values())
          for (const x of e.auras ?? [])
            if (x.id === a.id && (a.stacks === undefined || (x.stacks ?? 0) >= a.stacks))
              return true;
        return false;
      },
      { timeout, polling: 50 },
      aura,
    )
    .then(() => true)
    .catch(() => false);
}

async function enter(page, d, heroic) {
  // Pick the difficulty first, then reset: the reset claims a fresh run at it.
  await chat(page, `/dev ${d} enter ${heroic ? 'heroic' : 'normal'}`);
  await sleep(1500);
  await chat(page, `/dev ${d} reset`);
  await sleep(2500);
  // A quiet bench: the packs round the bench die (never a boss: a heroic
  // final boss kill would lock the next heroic run out).
  const packs = ['f1', 'f2', 'fa', 'fb', 'f3'];
  for (const pack of packs) await chat(page, `/dev ${d} kill ${pack}`);
  await sleep(800);
  // A clear patch of floor: the Bastion's tidal flats.
  await chat(page, `/dev ${d} tp flats`);
  await sleep(1500);
}

async function frameCam(page, cam) {
  await page.evaluate((c) => {
    const input = window.__game.input;
    input.camYaw = c.yaw;
    input.camPitch = c.pitch;
    input.camDist = c.dist * 0.62;
  }, cam);
}

async function shoot(page, seq, out, frames, prefix, files) {
  const t0 = Date.now();
  for (const at of frames) {
    const wait = at - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    await frameCam(page, seq.cam);
    const file = path.join(out, `${seq.id}_${prefix}${String(at).padStart(5, '0')}.png`);
    await page.screenshot({ path: file });
    files.push(file);
  }
}

async function runSeq(page, seq) {
  const out = path.join(OUT, seq.dir);
  fs.mkdirSync(out, { recursive: true });
  await enter(page, seq.d, seq.heroic);
  const dist = seq.spawnDist ?? 10;
  for (let i = 0; i < seq.spawn.length; i++) {
    await page.evaluate(
      (o) => {
        const p = window.__game.world.player;
        p.facing += o.turn;
        p.prevFacing = p.facing;
      },
      { turn: i === 0 ? 0 : (seq.spread ?? 0.3) },
    );
    if (dist !== 10) {
      // /dev spawn raises 10 yd ahead: step back first so it lands `dist` away.
      await page.evaluate((back) => {
        const p = window.__game.world.player;
        p.pos.x -= Math.sin(p.facing) * back;
        p.pos.z -= Math.cos(p.facing) * back;
        p.prevPos = { ...p.pos };
      }, dist - 10);
    }
    await chat(page, `/dev ${seq.d} spawn ${seq.spawn[i]}`);
    await sleep(250);
  }
  await frameCam(page, seq.cam);
  const files = [];
  if (seq.cast) {
    if (seq.action) {
      await sleep(400);
      await action(page, seq.action);
    }
    const ok = await waitCast(page, seq.cast);
    if (!ok) console.log('NO CAST', seq.id);
  } else if (seq.aura) {
    const ok = await waitAura(page, seq.aura);
    if (!ok) console.log('NO AURA', seq.id);
    if (seq.action) {
      await shoot(page, seq, out, [0], 'a', files);
      await sleep(seq.actionAfter ?? 0);
      await action(page, seq.action);
    }
  } else if (seq.action) {
    if (seq.actionAfter) await sleep(seq.actionAfter);
    await action(page, seq.action);
  }
  await shoot(page, seq, out, seq.frames, 'f', files);
  if (seq.after) {
    await action(page, seq.after.action);
    await shoot(page, seq, out, seq.after.frames, 'g', files);
  }
  await strip(files, path.join(out, `${seq.id}_tira.png`));
  console.log('STRIP', path.join(out, `${seq.id}_tira.png`));
}

async function main() {
  const gpu = process.env.SHOT_GPU !== '0';
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    args: [
      `--window-size=${W},${H}`,
      ...(gpu
        ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
        : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    ],
    defaultViewport: { width: W, height: H },
    protocolTimeout: 240000,
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300));
    });
    await page.evaluateOnNewDocument((preset) => {
      try {
        localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: preset }));
      } catch {
        /* ignore */
      }
    }, PRESET);
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180000 });
    const booted = await enterOfflineGame(page, {
      charClass: 'warrior',
      charName: 'Tombwarden',
      gameBootTimeoutMs: 180000,
      selectorTimeoutMs: 90000,
      settleMs: 4000,
    });
    if (!booted) throw new Error('offline world did not boot');
    for (const cmd of ['/dev level 20', '/dev god']) {
      await chat(page, cmd);
      await sleep(1300);
    }
    await page.addStyleTag({ content: '#ui, #nameplates { display: none !important; }' });
    let field = '';
    for (const seq of SEQS) {
      if (ONLY.length && !ONLY.includes(seq.id)) continue;
      const want = 'sunkenBastionField';
      try {
        await runSeq(page, seq);
        if (field !== want) {
          // The interior streams in on the first entry: re-run the first
          // sequence of each dungeon once it has loaded, for clean frames.
          await page.waitForFunction(
            (name) => {
              let found = false;
              window.__game.renderer.scene.traverse((o) => {
                if (o.name === name) found = true;
              });
              return found;
            },
            { timeout: 180000, polling: 1000 },
            want,
          );
          field = want;
          await sleep(4000);
          await runSeq(page, seq);
        }
      } catch (e) {
        console.log('SEQ FAILED', seq.id, e.message);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
