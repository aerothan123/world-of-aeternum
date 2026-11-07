// A scripted online session against a LOCAL dev server, for the Unreal client
// work (docs/unreal/wire-protocol.md section 10): it records the raw world
// frames that the golden-frame tests replay, drives a second "walker" player so
// the world has a moving peer, and measures downstream bandwidth with and
// without permessage-deflate.
//
//   node scripts/unreal/golden_session.mjs record --server http://127.0.0.1:8790 \
//     --user NAME --pass PW --seconds 30 --out frames.tsv [--deflate off]
//   node scripts/unreal/golden_session.mjs walk --server ... --user ... --pass ... --seconds 600
//
// It refuses any server that is not on the loopback interface: this tool must
// never touch a production or public realm.

import { readFileSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const mode = process.argv[2];
const server = arg('server', 'http://127.0.0.1:8790');
const user = arg('user');
const pass = arg('pass');
const seconds = Number(arg('seconds', '30'));
const out = arg('out');
const deflate = arg('deflate', 'on') !== 'off';
const ORIGIN = 'app://worldofclaudecraft';

const host = new URL(server).hostname;
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
  console.error(`refusing non-loopback server ${server}`);
  process.exit(2);
}
if (!['record', 'walk'].includes(mode) || !user || !pass) {
  console.error('usage: golden_session.mjs record|walk --user U --pass P [--server URL]');
  process.exit(2);
}

async function rest(method, path, body, token) {
  const headers = { 'content-type': 'application/json', origin: ORIGIN };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(server + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const login = await rest('POST', '/api/login', { username: user, password: pass });
const roster = await rest('GET', '/api/characters', undefined, login.token);
const list = Array.isArray(roster) ? roster : roster.characters;
const character = list[0];
// The handshake discriminator comes from the generated protocol export, never a literal.
const protocol = JSON.parse(
  readFileSync(new URL('./protocol/wyndlewood_protocol.json', import.meta.url), 'utf8'),
);
const authType = protocol.authType;

const ws = new WebSocket(`${server.replace(/^http/, 'ws')}/ws`, { perMessageDeflate: deflate });
const lines = [];
let t0 = 0;
let payloadBytes = 0;
let snaps = 0;
let seq = 0;
let ct = 0;
let facing = null;
let helloAt = 0;
const errors = [];

ws.on('open', () => {
  t0 = performance.now();
  ws.send(
    JSON.stringify({
      t: authType,
      token: login.token,
      character: character.id,
      clientSeed: '',
      dungeonEntryFacingWire: protocol.capabilities.dungeonEntryFacingWire,
      timerWire: protocol.capabilities.timerWire,
      petSpecialWire: protocol.capabilities.petSpecialWire,
      movementWire: protocol.capabilities.movementWire,
    }),
  );
});

ws.on('message', (data, isBinary) => {
  if (isBinary) return;
  const text = data.toString('utf8');
  const ms = performance.now() - t0;
  payloadBytes += Buffer.byteLength(text);
  const t = text.slice(0, 40).match(/"t":"([a-zA-Z]+)"/)?.[1];
  if (t === 'hello') helloAt = ms;
  if (t === 'snap') {
    snaps++;
    if (facing === null) facing = JSON.parse(text).self?.f ?? 0;
  }
  if (t === 'error') errors.push(text);
  if (mode === 'record') lines.push(`${ms.toFixed(3)}\t${text}`);
});

// The scripted route at the 20 Hz input tick: walk forward while turning
// slowly, pause, strafe, jump once, so the frames carry movement, facing and
// the reconciliation keys.
const timer = setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN || facing === null) return;
  const phase = ct % 200;
  const forward = phase < 120;
  const strafe = phase >= 140 && phase < 170;
  if (forward) facing += 0.02;
  seq++;
  ws.send(
    JSON.stringify({
      t: 'input',
      seq,
      ct,
      mi: {
        f: forward ? 1 : 0,
        b: 0,
        tl: 0,
        tr: 0,
        sl: strafe ? 1 : 0,
        sr: 0,
        j: phase === 125 ? 1 : 0,
        dv: 0,
        sf: 0,
      },
      facing: Math.round(facing * 10000) / 10000,
    }),
  );
  ct++;
}, 50);

ws.on('close', (code) => finish(`closed ${code}`));
setTimeout(() => {
  ws.send(JSON.stringify({ t: 'logout' }));
  setTimeout(() => ws.close(), 200);
}, seconds * 1000);

let done = false;
function finish(why) {
  if (done) return;
  done = true;
  clearInterval(timer);
  const wireBytes = ws._socket?.bytesRead ?? null;
  const elapsed = (performance.now() - t0) / 1000;
  if (out && mode === 'record') writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(
    JSON.stringify({
      mode,
      why,
      deflate,
      extensions: ws.extensions,
      character: character.id,
      helloAtMs: Math.round(helloAt),
      seconds: Number(elapsed.toFixed(2)),
      snaps,
      frames: lines.length,
      payloadBytes,
      wireBytes,
      payloadKBps: Number((payloadBytes / 1024 / elapsed).toFixed(2)),
      wireKBps: wireBytes === null ? null : Number((wireBytes / 1024 / elapsed).toFixed(2)),
      errors,
    }),
  );
  process.exit(0);
}
