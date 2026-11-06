// W9 live-check setup for the native client (DEV SERVER ONLY: needs ALLOW_DEV_COMMANDS=1). Logs the
// test character in over the world socket, puts it where one stage of the gathering and crafting
// check happens, then logs out so the Unreal client takes over at that spot:
//   chop   beside a choppable Eastbrook tree        mine   beside an Eastbrook copper vein
//   craft  at the Eastbrook forge, the bearded axe recipe trained and its flux and logs given
// The dev commands (dev_teleport, dev_give) are server-side cheats the native client never sends.
//   node scripts/unreal/prof_live_setup.mjs --port 8792 --user wyndprof --pass-file <file> --stage chop
// The password is generated into --pass-file on first use and never printed.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc),
      [],
    ),
);
const PORT = args.port ?? '8792';
const BASE = `http://127.0.0.1:${PORT}`;
const USER = args.user ?? 'wyndprof';
const STAGE = args.stage ?? 'chop';
const passFile = args['pass-file'];
if (!passFile) throw new Error('--pass-file is required');
if (!existsSync(passFile)) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 18; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  writeFileSync(passFile, pw);
}
const PASSWORD = readFileSync(passFile, 'utf8').trim();

const STAGES = {
  // A tier-1 Eastbrook tree near the copper veins, approached from the south.
  chop: { tree: true, near: { x: -20, z: 153 } },
  mine: { at: { x: -18.2, z: 152.2 } },
  craft: {
    at: { x: -6.2, z: -112.4 },
    train: 'recipe_copper_bearded_axe',
    give: [
      ['copper_ore', 4],
      ['ironbark_log', 2],
      ['smithing_flux', 1],
    ],
  },
};

async function api(path, opts = {}, token = null) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'app://worldofclaudecraft',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function token() {
  let login = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: USER, password: PASSWORD }),
  });
  if (login.status !== 200) {
    const reg = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username: USER, password: PASSWORD, email: `${USER}@example.com` }),
    });
    if (reg.status !== 200 && reg.status !== 201)
      throw new Error(`register failed ${reg.status} ${JSON.stringify(reg.body)}`);
    login = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: USER, password: PASSWORD }),
    });
  }
  if (!login.body.token) throw new Error(`login failed ${login.status}`);
  return login.body.token;
}

async function character(tok) {
  const list = await api('/api/characters', {}, tok);
  const chars = list.body.characters ?? list.body ?? [];
  const name = args.char ?? 'Woodwright';
  const found = Array.isArray(chars) ? chars.find((c) => c.name === name) : null;
  if (found) return found;
  const made = await api(
    '/api/characters',
    { method: 'POST', body: JSON.stringify({ name, class: 'warrior' }) },
    tok,
  );
  if (!made.body.id && !made.body.character)
    throw new Error(`character failed ${made.status} ${JSON.stringify(made.body)}`);
  return made.body.character ?? made.body;
}

async function main() {
  const { choppableTreeById, choppableTreesNear } = await import(
    '../../src/sim/trees/tree_registry.ts'
  );
  const { WORLD_SEED } = await import('../../src/sim/world_seed.ts');
  const { worldAuthMessage } = await import('../lib/world_auth.mjs');
  const stage = STAGES[STAGE];
  if (!stage) throw new Error(`unknown stage ${STAGE}`);
  let at = stage.at;
  if (stage.tree) {
    const trees = choppableTreesNear(WORLD_SEED, stage.near.x, stage.near.z, 90).filter(
      (t) => t.tier === 1 && t.zoneId === 'eastbrook_vale',
    );
    trees.sort(
      (a, b) =>
        Math.hypot(a.x - stage.near.x, a.z - stage.near.z) -
        Math.hypot(b.x - stage.near.x, b.z - stage.near.z),
    );
    // --pick N takes the Nth nearest (a felled tree stays down for five minutes).
    // --tree <id> names one tree outright (a tree the client reports bound to a world object).
    const t = args.tree
      ? choppableTreeById(WORLD_SEED, Number(args.tree))
      : trees[Number(args.pick ?? 0)];
    if (!t) throw new Error('no tree near the stage');
    at = { x: t.x, z: t.z - 2.4 };
    console.log(`stage chop: tree ${t.id} at ${t.x.toFixed(2)},${t.z.toFixed(2)} tier ${t.tier}`);
  }
  const tok = await token();
  const ch = await character(tok);
  console.log(`character ${ch.id} ${ch.name}`);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const send = (o) => ws.send(JSON.stringify(o));
  const events = [];
  let self = null;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('hello timeout')), 10000);
    ws.on('open', () => send(worldAuthMessage(tok, ch.id)));
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      if (msg.t === 'hello') {
        clearTimeout(t);
        resolve();
      } else if (msg.t === 'events') events.push(...msg.list);
      else if (msg.t === 'snap' && msg.self) self = { ...(self ?? {}), ...msg.self };
      else if (msg.t === 'error') reject(new Error(msg.error));
    });
    ws.on('error', reject);
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(800);
  // A character that died while away (a wandering mob) releases and takes the spirit healer's
  // resurrection first; both are refused harmlessly when it is alive.
  send({ t: 'cmd', cmd: 'release' });
  await wait(600);
  send({ t: 'cmd', cmd: 'resurrect_healer' });
  await wait(800);
  // Level 10: the vale's level 4 to 6 wildlife leaves it alone (a level-1 test character idling
  // in a capture got killed), while level-4 content still pays life-skill XP (green, not gray).
  send({ t: 'cmd', cmd: 'dev_level', level: 10 });
  send({ t: 'cmd', cmd: 'dev_teleport', x: at.x, z: at.z });
  await wait(800);
  for (const [item, count] of stage.give ?? []) send({ t: 'cmd', cmd: 'dev_give', item, count });
  if (stage.train) send({ t: 'cmd', cmd: 'train_recipe', recipe: stage.train });
  await wait(1500);
  const lines = events
    .filter((e) => ['trainResult', 'error', 'loot'].includes(e.type))
    .map(
      (e) =>
        `${e.type}:${e.reason ?? e.text ?? e.recipeId ?? ''}${e.ok === false ? ' (refused)' : ''}`,
    );
  console.log(
    `stage ${STAGE}: teleported to ${at.x.toFixed(2)},${at.z.toFixed(2)}; events ${lines.join(' | ') || 'none'}`,
  );
  send({ t: 'logout' });
  await wait(600);
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(`setup failed: ${e.message}`);
  process.exit(1);
});
