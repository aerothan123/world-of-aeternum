// The add-on worker prelude (src/ui/hud/addons/addon_worker_prelude.ts), run
// SERIALIZED through toString() into a fake worker global, the same way the
// sandbox bootstrap evaluates it: hardening (every blocked global gone, string
// timers refused, `wynd` frozen), handler isolation, UI ops, saved variables,
// derived events, slash and load errors. Real-browser escape coverage lives in
// scripts/addon_sandbox_probe.mjs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ADDON_WORKER_BLOCKED_GLOBALS,
  type AddonWorkerInit,
  addonWorkerMain,
  addonWorkerScript,
} from '../src/ui/hud/addons/addon_worker_prelude';
import { createFakeWorker, deliverPort, type FakeWorker } from './helpers/addon_fake_worker';

const PRELUDE = addonWorkerMain.toString();
const live: { w: FakeWorker; ch: MessageChannel }[] = [];

function init(over: Partial<AddonWorkerInit['addon']> = {}, saved = {}): AddonWorkerInit {
  return {
    runtimeApiVersion: 1,
    addon: {
      id: 'test-addon',
      name: 'Test',
      version: '1.0.0',
      apiVersion: 1,
      permissions: [],
      savedVariables: { account: true, character: false },
      slashCommands: ['tst'],
      ...over,
    },
    saved: { account: null, character: null, ...saved },
    settings: { mode: 'a' },
    locale: 'de_DE',
    firstRun: true,
  };
}

/** Boot one add-on and collect every message it sends to the host. */
function boot(code: string | string[], i = init()) {
  const w = createFakeWorker(PRELUDE, i, Array.isArray(code) ? code : [code]);
  const ch = new MessageChannel();
  const got: { t: string; [k: string]: unknown }[] = [];
  ch.port1.onmessage = (e) => got.push(e.data);
  deliverPort(w, ch.port2);
  live.push({ w, ch });
  const send = (m: unknown) => ch.port1.postMessage(m);
  return { w, got, send };
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  for (const { w, ch } of live.splice(0)) {
    w.terminate();
    ch.port1.close();
    ch.port2.close();
  }
});

describe('addon worker prelude: hardening', () => {
  it('removes every blocked global before add-on code runs', async () => {
    const { got } = boot(`
      const seen = {};
      for (const n of ${JSON.stringify([...ADDON_WORKER_BLOCKED_GLOBALS])}) seen[n] = typeof self[n];
      seen.bareFetch = typeof fetch;
      seen.bareImport = typeof importScripts;
      seen.bareXhr = typeof XMLHttpRequest;
      wynd.print(JSON.stringify(seen));
    `);
    await tick();
    const print = got.find((m) => m.t === 'print');
    const seen = JSON.parse(String(print?.text));
    for (const n of ADDON_WORKER_BLOCKED_GLOBALS) expect(seen[n], n).toBe('undefined');
    expect(seen.bareFetch).toBe('undefined');
    expect(seen.bareImport).toBe('undefined');
    expect(seen.bareXhr).toBe('undefined');
  });

  it('cannot restore a blocked global or replace the wynd API', async () => {
    const { got } = boot(`
      let restored = 'no';
      try { self.fetch = () => 1; restored = typeof self.fetch; } catch (e) { restored = 'threw'; }
      let replaced = 'no';
      try { self.wynd = null; replaced = String(self.wynd === null); } catch (e) { replaced = 'threw'; }
      let mutated = 'no';
      try { wynd.ui.create = null; mutated = String(wynd.ui.create === null); } catch (e) { mutated = 'threw'; }
      wynd.print([restored, replaced, mutated].join(','));
    `);
    await tick();
    const text = String(got.find((m) => m.t === 'print')?.text);
    const [restored, replaced, mutated] = text.split(',');
    expect(restored === 'undefined' || restored === 'threw').toBe(true);
    expect(replaced === 'false' || replaced === 'threw').toBe(true);
    expect(mutated === 'false' || mutated === 'threw').toBe(true);
  });

  it('refuses string-eval timers', async () => {
    const { got } = boot(`
      let r = 'ran';
      try { setTimeout('wynd.print("evil")', 1); } catch (e) { r = e.name; }
      wynd.print(r);
    `);
    await tick(30);
    const prints = got.filter((m) => m.t === 'print').map((m) => m.text);
    expect(prints).toContain('TypeError');
    expect(prints).not.toContain('evil');
  });
});

describe('addon worker prelude: integrity', () => {
  it('refuses to run when a global it relies on was rebound before it ran', () => {
    // A hoisted `function setTimeout() {}` in an add-on file rebinds the global
    // before the prelude executes; the prelude must abort, not run unhardened.
    const main = new Function(`return (${PRELUDE});`)();
    const hijacked = {
      setTimeout: () => 0,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: () => {},
      Intl,
      performance,
    };
    expect(() => main(hijacked, init())).toThrow(/integrity/);
  });
});

describe('addon worker prelude: lifecycle and API', () => {
  it('reports ready, then LOADED, and batches UI ops into one message', async () => {
    const { got } = boot(`
      wynd.on('LOADED', (e) => wynd.print('loaded ' + e.firstRun));
      const f = wynd.ui.create('frame', { name: 'main', width: 10, height: 10, movable: true });
      wynd.ui.create('text', { parent: f, text: 'hi' });
    `);
    await tick();
    expect(got.some((m) => m.t === 'ready')).toBe(true);
    expect(got.find((m) => m.t === 'print')?.text).toBe('loaded true');
    const ui = got.filter((m) => m.t === 'ui');
    expect(ui).toHaveLength(1);
    const ops = ui[0].ops as { op: string; id: number; parent: number | null }[];
    expect(ops.map((o) => o.op)).toEqual(['c', 'c']);
    expect(ops[1].parent).toBe(ops[0].id);
  });

  it('isolates a throwing handler: the next handler still runs, the error is reported', async () => {
    const { got, send } = boot(`
      wynd.on('UPDATE', () => { throw new Error('boom'); });
      wynd.on('UPDATE', () => wynd.print('second ran'));
    `);
    send({ t: 'snap', snap: { time: 1, inCombat: false, zoneId: 'z', units: {}, party: null } });
    await tick();
    expect(got.some((m) => m.t === 'err' && String(m.message).includes('boom'))).toBe(true);
    expect(got.some((m) => m.t === 'print' && m.text === 'second ran')).toBe(true);
  });

  it('derives COMBAT_START / COMBAT_END and TARGET_CHANGED from snapshots', async () => {
    const { got, send } = boot(`
      for (const n of ['COMBAT_START', 'COMBAT_END', 'TARGET_CHANGED', 'ZONE_CHANGED']) {
        wynd.on(n, () => wynd.print(n));
      }
    `);
    const snap = (time: number, inCombat: boolean, target: number | null, zoneId = 'a') => ({
      time,
      inCombat,
      zoneId,
      party: null,
      units: target ? { target: { id: target } } : {},
    });
    send({ t: 'snap', snap: snap(1, false, null) });
    send({ t: 'snap', snap: snap(2, true, 7) });
    send({ t: 'snap', snap: snap(3, false, 7, 'b') });
    await tick();
    const prints = got.filter((m) => m.t === 'print').map((m) => m.text);
    expect(prints).toEqual(['COMBAT_START', 'TARGET_CHANGED', 'COMBAT_END', 'ZONE_CHANGED']);
  });

  it('round-trips saved variables and only declared scopes exist', async () => {
    const { got } = boot(
      `
      wynd.print(String(wynd.saved.character));
      wynd.saved.account.count = (wynd.saved.account.count || 0) + 1;
      wynd.saved.save();
    `,
      init({}, { account: '{"count":4}' }),
    );
    await tick();
    expect(got.find((m) => m.t === 'print')?.text).toBe('null');
    const sv = got.find((m) => m.t === 'sv');
    expect(sv?.scope).toBe('account');
    expect(JSON.parse(String(sv?.json))).toEqual({ count: 5 });
  });

  it('only registers slash commands declared in the manifest', async () => {
    const { got, send } = boot(`
      try { wynd.slash('dance', () => {}); } catch (e) { wynd.print(e.name); }
      wynd.slash('tst', (args) => wynd.print('args:' + args));
    `);
    await tick();
    expect(got.filter((m) => m.t === 'slash').map((m) => m.name)).toEqual(['tst']);
    send({ t: 'slash', name: 'tst', args: 'hello world' });
    await tick();
    const prints = got.filter((m) => m.t === 'print').map((m) => m.text);
    expect(prints).toContain('RangeError');
    expect(prints).toContain('args:hello world');
  });

  it('a syntax error fails the whole worker script before any add-on code runs', async () => {
    const { w, got } = boot(['wynd.print("first file ran");', 'this is not javascript (']);
    await tick();
    expect(w.startError).not.toBeNull();
    expect(got).toEqual([]);
  });

  it('a top-level throw in an add-on file is a load error, never ready', async () => {
    const { got } = boot(['wynd.print("first file ran");', 'throw new Error("top level");']);
    await tick();
    expect(got.some((m) => m.t === 'print' && m.text === 'first file ran')).toBe(true);
    expect(got.some((m) => m.t === 'loadError' && String(m.message).includes('top level'))).toBe(
      true,
    );
    expect(got.some((m) => m.t === 'ready')).toBe(false);
  });

  it('answers pings with CPU stats and a pong; L() and settings read the host values', async () => {
    const { got, send } = boot(`
      wynd.print(wynd.L({ en: 'hello', de: 'hallo' }) + ' ' + wynd.settings.get('mode'));
    `);
    send({ t: 'ping' });
    await tick();
    expect(got.find((m) => m.t === 'print')?.text).toBe('hallo a');
    expect(got.some((m) => m.t === 'pong')).toBe(true);
    expect(got.some((m) => m.t === 'stats' && typeof m.cpuMs === 'number')).toBe(true);
  });
});

describe('the sandbox bootstrap builds the same single worker script', () => {
  it('prelude call first, files in order, load trailer last', () => {
    const script = addonWorkerScript('function(){}', '{}', ['A', 'B']);
    expect(script.indexOf('(function(){})(this, {})')).toBeLessThan(script.indexOf('A'));
    expect(script.indexOf('A')).toBeLessThan(script.indexOf('B'));
    expect(script.trimEnd().endsWith('self.__wyndLoaded();')).toBe(true);
    const boot = readFileSync(
      join(__dirname, '..', 'public', 'addon-sandbox', 'bootstrap.js'),
      'utf8',
    );
    expect(boot).toContain(
      '"use strict";\\n(${String(msg.prelude)})(this, ${JSON.stringify(msg.init)});\\n',
    );
    expect(boot).toContain("code += 'self.__wyndLoaded();\\n';");
    expect(boot).not.toContain('importScripts');
  });
});
