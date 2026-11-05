// Real-browser escape suite for the add-on sandbox (docs/design/addon-api.md 3).
// Bundles the REAL sandbox host (src/ui/hud/addons/addon_sandbox_frame.ts) and
// the REAL worker prelude with esbuild, serves them with the REAL bootstrap
// (public/addon-sandbox/bootstrap.js) from a local server, and runs a hostile
// add-on in headless Chromium twice: once with no page CSP (the dev server) and
// once under the desktop shell's own CSP (electron/shell_guards.cjs). Every
// escape attempt must fail, the local server must see ZERO requests from the
// add-on, and a `while (true) {}` add-on must not stall the page.
//
//   node scripts/addon_sandbox_probe.mjs [--port 5278]
//
// Exit code 0 = sandbox held; 1 = an escape succeeded (details printed).

import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const require = createRequire(import.meta.url);
const { buildContentSecurityPolicy } = require('../electron/shell_guards.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.indexOf('--port');
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 5278;
const ORIGIN = `http://localhost:${PORT}`;

const bundle = await esbuild.build({
  stdin: {
    contents: `
      import { createIframeSandbox } from './src/ui/hud/addons/addon_sandbox_frame';
      import { addonWorkerMain } from './src/ui/hud/addons/addon_worker_prelude';
      window.__probe = { createIframeSandbox, prelude: addonWorkerMain.toString() };
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  write: false,
  minify: true,
  target: 'es2022',
});
const probeJs = bundle.outputFiles[0].text;
const bootstrap = fs.readFileSync(path.join(root, 'public/addon-sandbox/bootstrap.js'), 'utf8');

const hits = [];
let csp = null;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  if (url.pathname.startsWith('/probe-hit')) {
    hits.push(url.pathname + url.search);
    res.end('hit');
    return;
  }
  const headers = {};
  if (csp) headers['Content-Security-Policy'] = csp;
  if (url.pathname === '/') {
    res.writeHead(200, { ...headers, 'content-type': 'text/html' });
    res.end('<!doctype html><title>probe</title><script src="/probe.js"></script>');
  } else if (url.pathname === '/probe.js') {
    res.writeHead(200, { ...headers, 'content-type': 'text/javascript' });
    res.end(probeJs);
  } else if (url.pathname === '/addon-sandbox/bootstrap.js') {
    res.writeHead(200, { ...headers, 'content-type': 'text/javascript' });
    res.end(bootstrap);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(PORT, r));

// The hostile add-on: every line tries one way out and reports what happened.
const ESCAPE = `
  const out = {};
  const hit = (p) => '${ORIGIN}/probe-hit/' + p;
  const tryIt = async (name, fn) => {
    try { const v = await fn(); out[name] = 'OPEN:' + String(v).slice(0, 40); }
    catch (e) { out[name] = 'blocked'; }
  };
  (async () => {
    out.origin = String(self.origin);
    out.document = typeof document;
    out.localStorage = typeof localStorage;
    out.wocDesktop = typeof self.wocDesktop;
    out.game = typeof self.__game;
    await tryIt('fetchSelf', () => self.fetch(hit('fetch')));
    await tryIt('fetchBare', () => fetch(hit('fetch-bare')));
    await tryIt('xhr', () => { const x = new XMLHttpRequest(); x.open('GET', hit('xhr')); x.send(); return 'sent'; });
    await tryIt('websocket', () => new WebSocket('ws://localhost:${PORT}/probe-hit/ws'));
    await tryIt('eventsource', () => new EventSource(hit('sse')));
    await tryIt('importScripts', () => importScripts(hit('import.js')));
    await tryIt('dynamicImport', () => import(hit('dyn.js')));
    await tryIt('eval', () => eval('1+1'));
    await tryIt('newFunction', () => new Function('return 1')());
    await tryIt('ctorFunction', () => (function () {}).constructor('return 1')());
    await tryIt('stringTimer', () => setTimeout('1', 1));
    await tryIt('indexedDB', () => indexedDB.open('x'));
    await tryIt('caches', () => caches.open('x'));
    await tryIt('broadcast', () => new BroadcastChannel('x'));
    await tryIt('worker', () => new Worker('data:text/javascript,1'));
    await tryIt('wasm', () => WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])));
    await tryIt('postToFrame', () => postMessage('x'));
    await tryIt('beacon', () => navigator.sendBeacon(hit('beacon'), 'x'));
    await tryIt('blobUrl', () => URL.createObjectURL(new Blob(['x'])));
    await new Promise((r) => setTimeout(r, 400));
    wynd.print(JSON.stringify(out));
  })();
`;
const LOOP = `wynd.on('LOADED', () => { for (;;) {} });`;

async function runMode(label, pageCsp) {
  csp = pageCsp;
  hits.length = 0;
  const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.goto(`${ORIGIN}/`);
    const result = await page.evaluate(
      async ({ escapeCode, loop }) => {
        const { createIframeSandbox, prelude } = window.__probe;
        const events = [];
        const sandbox = createIframeSandbox(document, window, (e) => events.push(e));
        const init = (id) => ({
          runtimeApiVersion: 1,
          addon: {
            id,
            name: id,
            version: '1.0.0',
            apiVersion: 1,
            permissions: [],
            savedVariables: { account: false, character: false },
            slashCommands: [],
          },
          saved: { account: null, character: null },
          settings: {},
          locale: 'en',
          firstRun: true,
        });
        const spawn = (id, code) =>
          new Promise((resolve) => {
            const ch = new MessageChannel();
            const msgs = [];
            ch.port1.onmessage = (e) => {
              msgs.push(e.data);
              if (e.data.t === 'print' || e.data.t === 'loadError') resolve({ msgs, ch });
            };
            sandbox.spawn(id, { prelude, init: init(id), files: [code] }, ch.port2);
            setTimeout(() => resolve({ msgs, ch }), 4000);
          });
        const esc = await spawn('escape', escapeCode);
        const printed = esc.msgs.find((m) => m.t === 'print');
        // The hung add-on: the page's own timers must keep running on time.
        const loopCh = new MessageChannel();
        sandbox.spawn('loop', { prelude, init: init('loop'), files: [loop] }, loopCh.port2);
        let pong = false;
        loopCh.port1.onmessage = (e) => {
          if (e.data.t === 'pong') pong = true;
        };
        await new Promise((r) => setTimeout(r, 300));
        loopCh.port1.postMessage({ t: 'ping' });
        const t0 = performance.now();
        let maxLag = 0;
        for (let i = 0; i < 10; i++) {
          const s = performance.now();
          await new Promise((r) => setTimeout(r, 50));
          maxLag = Math.max(maxLag, performance.now() - s - 50);
        }
        sandbox.kill('loop');
        return {
          report: printed ? JSON.parse(printed.text) : null,
          loopAnsweredPing: pong,
          mainThreadMaxLagMs: Math.round(maxLag),
          elapsedMs: Math.round(performance.now() - t0),
          events,
        };
      },
      { escapeCode: ESCAPE, loop: LOOP },
    );
    await new Promise((r) => setTimeout(r, 300));
    return { label, ...result, networkHits: [...hits] };
  } finally {
    await browser.close();
  }
}

const failures = [];
const results = [];
for (const [label, policy] of [
  ['dev (no page CSP)', null],
  ['desktop shell CSP', buildContentSecurityPolicy({ apiOrigin: ORIGIN })],
]) {
  const r = await runMode(label, policy);
  results.push(r);
  if (!r.report) {
    failures.push(`${label}: the escape add-on never reported`);
    continue;
  }
  if (r.report.origin !== 'null')
    failures.push(`${label}: origin is ${r.report.origin}, expected opaque`);
  for (const k of ['document', 'localStorage', 'wocDesktop', 'game']) {
    if (r.report[k] !== 'undefined') failures.push(`${label}: ${k} is reachable (${r.report[k]})`);
  }
  for (const [k, v] of Object.entries(r.report)) {
    if (typeof v === 'string' && v.startsWith('OPEN'))
      failures.push(`${label}: ${k} escaped (${v})`);
  }
  if (r.networkHits.length > 0) failures.push(`${label}: server saw ${r.networkHits.join(', ')}`);
  if (r.loopAnsweredPing) failures.push(`${label}: the looping add-on answered a ping`);
  if (r.mainThreadMaxLagMs > 250)
    failures.push(`${label}: main thread lagged ${r.mainThreadMaxLagMs} ms`);
}
server.close();
console.log(JSON.stringify(results, null, 2));
if (failures.length > 0) {
  console.error(`SANDBOX FAILED:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('SANDBOX HELD in both modes.');
process.exit(0);
