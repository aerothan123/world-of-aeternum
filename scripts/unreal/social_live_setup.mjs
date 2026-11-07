// W5 live-check setup for the native client (DEV SERVER ONLY: needs ALLOW_DEV_COMMANDS=1). Makes two
// accounts with one character each, logs each in over the world socket, puts both side by side in
// Eastbrook (trade range), gives the first a stack to trade, then logs out so two Unreal headless
// clients take over at that spot:
//   node scripts/unreal/social_live_setup.mjs --port 8815 --dir <folder>
// Writes <dir>/<user>.pw (generated on first use, never printed) and <dir>/accounts.json
// ({user, char, id} per side). The dev commands (dev_teleport, dev_give, dev_level) are server-side
// cheats the native client never sends.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc),
      [],
    ),
);
const PORT = args.port ?? '8815';
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = args.dir;
if (!DIR) throw new Error('--dir is required');

const SIDES = [
  {
    user: 'wyndsoca',
    char: 'Ashfinch',
    cls: 'warrior',
    at: { x: -6.2, z: -110.4 },
    give: [['copper_ore', 3]],
  },
  { user: 'wyndsocb', char: 'Wrenlow', cls: 'mage', at: { x: -4.2, z: -110.4 }, give: [] },
];

function password(user) {
  const file = join(DIR, `${user}.pw`);
  if (!existsSync(file)) {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let pw = '';
    for (let i = 0; i < 18; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    writeFileSync(file, pw);
  }
  return readFileSync(file, 'utf8').trim();
}

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

async function token(user, pass) {
  const body = JSON.stringify({ username: user, password: pass });
  let login = await api('/api/login', { method: 'POST', body });
  if (login.status !== 200) {
    const reg = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username: user, password: pass, email: `${user}@example.com` }),
    });
    if (reg.status !== 200 && reg.status !== 201)
      throw new Error(`register ${user} failed ${reg.status} ${JSON.stringify(reg.body)}`);
    login = await api('/api/login', { method: 'POST', body });
  }
  if (!login.body.token) throw new Error(`login ${user} failed ${login.status}`);
  return login.body.token;
}

async function character(tok, side) {
  const list = await api('/api/characters', {}, tok);
  const chars = list.body.characters ?? list.body ?? [];
  const found = Array.isArray(chars) ? chars.find((c) => c.name === side.char) : null;
  if (found) return found;
  const made = await api(
    '/api/characters',
    { method: 'POST', body: JSON.stringify({ name: side.char, class: side.cls }) },
    tok,
  );
  if (!made.body.id && !made.body.character)
    throw new Error(`character ${side.char} failed ${made.status} ${JSON.stringify(made.body)}`);
  return made.body.character ?? made.body;
}

async function stage(side, worldAuthMessage) {
  const tok = await token(side.user, password(side.user));
  const ch = await character(tok, side);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const send = (o) => ws.send(JSON.stringify(o));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('hello timeout')), 10000);
    ws.on('open', () => send(worldAuthMessage(tok, ch.id)));
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      if (msg.t === 'hello') {
        clearTimeout(t);
        resolve();
      } else if (msg.t === 'error') reject(new Error(msg.error));
    });
    ws.on('error', reject);
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(800);
  send({ t: 'cmd', cmd: 'release' });
  await wait(400);
  send({ t: 'cmd', cmd: 'resurrect_healer' });
  await wait(600);
  // Level 10 keeps the vale's wildlife off a character idling through the check.
  send({ t: 'cmd', cmd: 'dev_level', level: 10 });
  send({ t: 'cmd', cmd: 'dev_teleport', x: side.at.x, z: side.at.z });
  for (const [item, count] of side.give) send({ t: 'cmd', cmd: 'dev_give', item, count });
  await wait(1200);
  send({ t: 'logout' });
  await wait(600);
  ws.close();
  console.log(`staged ${side.user} ${ch.name} id ${ch.id} at ${side.at.x},${side.at.z}`);
  return { user: side.user, char: ch.name, id: ch.id };
}

async function main() {
  const { worldAuthMessage } = await import('../lib/world_auth.mjs');
  const out = [];
  for (const side of SIDES) out.push(await stage(side, worldAuthMessage));
  writeFileSync(join(DIR, 'accounts.json'), `${JSON.stringify(out, null, 2)}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`setup failed: ${e.message}`);
  process.exit(1);
});
