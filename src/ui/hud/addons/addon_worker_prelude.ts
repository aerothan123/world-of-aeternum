// The code that runs FIRST inside every add-on worker: it builds the `wynd`
// API, hardens the worker global (deletes every network/storage/eval-adjacent
// global after capturing the few it needs), then loads the add-on's files.
//
// SELF-CONTAINED BY CONTRACT: `addonWorkerMain` is serialized with
// Function.prototype.toString() by the runtime and evaluated in a fresh worker
// realm, so it may reference NOTHING outside its own body (no imports, no
// module constants, no helpers). Everything it needs arrives as `scope` (the
// worker global) and `init` (JSON data). tests/addon_worker_prelude.test.ts runs
// it against a fake scope; scripts/addon_sandbox_probe.mjs runs it in Chromium.
// The add-on files run AFTER it in the same worker script (addonWorkerScript).
//
// The prelude is NOT the security boundary (the opaque-origin iframe, the CSP
// and the host-side validation are); it is defense in depth plus ergonomics.

/** The data the host hands the prelude (embedded as JSON by the bootstrap). */
export interface AddonWorkerInit {
  runtimeApiVersion: number;
  addon: {
    id: string;
    name: string;
    version: string;
    apiVersion: number;
    permissions: string[];
    savedVariables: { account: boolean; character: boolean };
    slashCommands: string[];
  };
  saved: { account: string | null; character: string | null };
  settings: Record<string, unknown>;
  locale: string;
  firstRun: boolean;
}

/** Names deleted from the worker global (and its prototype chain). */
export const ADDON_WORKER_BLOCKED_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebTransport',
  'EventSource',
  'importScripts',
  'indexedDB',
  'caches',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'postMessage',
  'RTCPeerConnection',
  'WebAssembly',
  'Notification',
  'FileSystemHandle',
  'requestFileSystem',
  'webkitRequestFileSystem',
  'storage',
] as const;

// biome-ignore lint/suspicious/noExplicitAny: the worker global is untyped here on purpose.
type AnyScope = any;

export function addonWorkerMain(scope: AnyScope, init: AddonWorkerInit): void {
  const BLOCKED = [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'WebTransport',
    'EventSource',
    'importScripts',
    'indexedDB',
    'caches',
    'BroadcastChannel',
    'Worker',
    'SharedWorker',
    'postMessage',
    'RTCPeerConnection',
    'WebAssembly',
    'Notification',
    'FileSystemHandle',
    'requestFileSystem',
    'webkitRequestFileSystem',
    'storage',
  ];
  const MIN_TIMER_S = 0.05;
  const MAX_TIMERS = 64;
  const FLUSH_SAVED_MS = 10000;
  // ---- capture what the prelude itself needs, before hardening -------------
  const perf = scope.performance;
  const clock = (): number => (perf && typeof perf.now === 'function' ? perf.now() : 0);
  const setT: (fn: () => void, ms: number) => unknown = scope.setTimeout.bind(scope);
  const clearT: (h: unknown) => void = scope.clearTimeout.bind(scope);
  const setI: (fn: () => void, ms: number) => unknown = scope.setInterval.bind(scope);
  const clearI: (h: unknown) => void = scope.clearInterval.bind(scope);
  const stringify = JSON.stringify;
  const parse = JSON.parse;
  const IntlRef = scope.Intl;
  const freeze = Object.freeze;
  const urlCtor = scope.URL;
  // ---- harden ------------------------------------------------------------
  for (const name of BLOCKED) {
    let o = scope;
    while (o) {
      try {
        if (Object.hasOwn(o, name)) delete o[name];
      } catch {
        /* non-configurable: shadowed below */
      }
      o = Object.getPrototypeOf(o);
    }
    try {
      Object.defineProperty(scope, name, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    } catch {
      /* already locked */
    }
  }
  try {
    if (urlCtor) {
      urlCtor.createObjectURL = undefined;
      urlCtor.revokeObjectURL = undefined;
    }
  } catch {
    /* frozen in this engine */
  }
  // String-eval timers are refused even where a CSP would not refuse them.
  const guardTimer =
    (orig: (fn: unknown, ms?: number) => unknown) => (fn: unknown, ms?: number) => {
      if (typeof fn !== 'function') throw new TypeError('timer callback must be a function');
      return orig(fn, ms);
    };
  scope.setTimeout = guardTimer(setT as (fn: unknown, ms?: number) => unknown);
  scope.setInterval = guardTimer(setI as (fn: unknown, ms?: number) => unknown);

  // ---- channel to the host ------------------------------------------------
  type PortLike = { postMessage(m: unknown): void; onmessage: unknown };
  const chan: { port: PortLike | null } = { port: null };
  const outbox: unknown[] = [];
  let ops: unknown[] = [];
  let flushQueued = false;
  const send = (m: unknown) => {
    if (chan.port) chan.port.postMessage(m);
    else outbox.push(m);
  };
  const flushOps = () => {
    flushQueued = false;
    if (ops.length === 0) return;
    const batch = ops;
    ops = [];
    send({ t: 'ui', ops: batch });
  };
  const queueOp = (op: unknown) => {
    ops.push(op);
    if (!flushQueued) {
      flushQueued = true;
      setT(flushOps, 0);
    }
  };

  // ---- handler isolation + CPU accounting ---------------------------------
  let cpuMs = 0;
  const describe = (e: unknown): string => {
    if (e && typeof e === 'object' && 'message' in e) {
      const err = e as { message?: unknown; stack?: unknown };
      const stack =
        typeof err.stack === 'string' ? err.stack.split('\n').slice(0, 3).join(' | ') : '';
      return `${String(err.message)}${stack ? ` (${stack})` : ''}`;
    }
    return String(e);
  };
  const safe = (where: string, fn: (...a: unknown[]) => unknown, ...args: unknown[]) => {
    const t0 = clock();
    try {
      fn(...args);
    } catch (e) {
      send({ t: 'err', where, message: describe(e).slice(0, 1000) });
    } finally {
      cpuMs += clock() - t0;
    }
  };

  // ---- events --------------------------------------------------------------
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const emit = (name: string, payload: unknown) => {
    const set = handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) safe(name, fn as (...a: unknown[]) => unknown, payload);
  };
  const on = (name: string, fn: (p: unknown) => void) => {
    if (typeof name !== 'string' || typeof fn !== 'function') {
      throw new TypeError('wynd.on(name, fn)');
    }
    let set = handlers.get(name);
    if (!set) {
      set = new Set();
      handlers.set(name, set);
    }
    set.add(fn);
    return () => set?.delete(fn);
  };

  // ---- snapshot + derived events -------------------------------------------
  // biome-ignore lint/suspicious/noExplicitAny: snapshot is plain host JSON.
  let snap: any = null;
  let lastSnapTime = 0;
  const onSnapshot = (next: { time: number; [k: string]: unknown }) => {
    const prev = snap;
    snap = next;
    const time = next.time;
    if (prev) {
      if (!prev.inCombat && next.inCombat) emit('COMBAT_START', { time });
      if (prev.inCombat && !next.inCombat) emit('COMBAT_END', { time });
      const pt = prev.units?.target?.id ?? null;
      // biome-ignore lint/suspicious/noExplicitAny: plain JSON
      const nt = (next as any).units?.target?.id ?? null;
      // biome-ignore lint/suspicious/noExplicitAny: plain JSON
      if (pt !== nt) emit('TARGET_CHANGED', { unit: (next as any).units?.target ?? null });
      const ps = prev.party ? prev.party.members.length : 0;
      // biome-ignore lint/suspicious/noExplicitAny: plain JSON
      const np = (next as any).party;
      const ns = np ? np.members.length : 0;
      if (ps !== ns || !!prev.party?.raid !== !!np?.raid) {
        emit('PARTY_CHANGED', { size: ns, raid: !!np?.raid });
      }
      if (prev.zoneId !== next.zoneId) emit('ZONE_CHANGED', { zoneId: next.zoneId });
    }
    emit('UPDATE', { time, dt: prev ? Math.max(0, time - lastSnapTime) : 0 });
    lastSnapTime = time;
  };

  // ---- UI handles --------------------------------------------------------
  let nextId = 0;
  const clickFns = new Map<number, (p: unknown) => void>();
  type Handle = {
    id: number;
    type: string;
    set(props: Record<string, unknown>): Handle;
    destroy(): void;
    onClick(fn: (p: unknown) => void): Handle;
  };
  const cleanProps = (props: unknown): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (!props || typeof props !== 'object') return out;
    for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
      if (k === 'parent' || k === 'onClick') continue;
      if (typeof v === 'function') continue;
      out[k] = v;
    }
    return out;
  };
  const parentId = (p: unknown): number | null => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'number') return p;
    if (typeof p === 'object' && typeof (p as { id?: unknown }).id === 'number') {
      return (p as { id: number }).id;
    }
    throw new TypeError('parent must be a widget handle');
  };
  const create = (type: string, props?: Record<string, unknown>): Handle => {
    const id = ++nextId;
    const p = cleanProps(props);
    const click = props && typeof props.onClick === 'function' ? props.onClick : null;
    if (click) {
      clickFns.set(id, click as (p: unknown) => void);
      p.clickable = true;
    }
    queueOp({ op: 'c', id, type, parent: parentId(props?.parent), props: p });
    const handle: Handle = freeze({
      id,
      type,
      set(next: Record<string, unknown>) {
        const np = cleanProps(next);
        if (next && typeof next.onClick === 'function') {
          clickFns.set(id, next.onClick as (p: unknown) => void);
          np.clickable = true;
        }
        queueOp({ op: 's', id, props: np });
        return handle;
      },
      destroy() {
        clickFns.delete(id);
        queueOp({ op: 'd', id });
      },
      onClick(fn: (p: unknown) => void) {
        if (typeof fn !== 'function') throw new TypeError('onClick(fn)');
        clickFns.set(id, fn);
        queueOp({ op: 's', id, props: { clickable: true } });
        return handle;
      },
    });
    return handle;
  };

  // ---- timers --------------------------------------------------------------
  let liveTimers = 0;
  const after = (seconds: number, fn: () => void) => {
    if (typeof fn !== 'function') throw new TypeError('wynd.after(seconds, fn)');
    if (liveTimers >= MAX_TIMERS) throw new RangeError('too many timers');
    liveTimers++;
    const ms = Math.max(MIN_TIMER_S, Number(seconds) || 0) * 1000;
    const h = setT(() => {
      liveTimers--;
      safe('timer', fn);
    }, ms);
    return freeze({
      cancel: () => {
        clearT(h);
        liveTimers--;
      },
    });
  };
  const every = (seconds: number, fn: () => void) => {
    if (typeof fn !== 'function') throw new TypeError('wynd.every(seconds, fn)');
    if (liveTimers >= MAX_TIMERS) throw new RangeError('too many timers');
    liveTimers++;
    const ms = Math.max(MIN_TIMER_S, Number(seconds) || 0) * 1000;
    const h = setI(() => safe('timer', fn), ms);
    return freeze({
      cancel: () => {
        clearI(h);
        liveTimers--;
      },
    });
  };

  // ---- saved variables -----------------------------------------------------
  const readScope = (raw: string | null): Record<string, unknown> => {
    if (!raw) return {};
    try {
      const v = parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  };
  const saved: { account?: Record<string, unknown>; character?: Record<string, unknown> } = {};
  const lastSaved: { account: string; character: string } = { account: '', character: '' };
  if (init.addon.savedVariables.account) {
    saved.account = readScope(init.saved.account);
    lastSaved.account = stringify(saved.account);
  }
  if (init.addon.savedVariables.character) {
    saved.character = readScope(init.saved.character);
    lastSaved.character = stringify(saved.character);
  }
  const flushSaved = () => {
    for (const scopeName of ['account', 'character'] as const) {
      const obj = saved[scopeName];
      if (!obj) continue;
      let json: string;
      try {
        json = stringify(obj);
      } catch (e) {
        send({ t: 'err', where: 'saved', message: describe(e) });
        continue;
      }
      if (json !== lastSaved[scopeName]) {
        lastSaved[scopeName] = json;
        send({ t: 'sv', scope: scopeName, json });
      }
    }
  };
  setI(flushSaved, FLUSH_SAVED_MS);

  // ---- slash, print, settings, comm, locale ----------------------------------
  const slashFns = new Map<string, (args: string) => void>();
  const settings: Record<string, unknown> = { ...init.settings };
  const bcp = init.locale.replace('_', '-');
  const lang = init.locale.split('_')[0];
  let numberFmt: { format(n: number): string } | null = null;
  const fmtNumber = (n: number, opts?: Record<string, unknown>) => {
    try {
      if (!opts) {
        numberFmt ??= new IntlRef.NumberFormat(bcp, { maximumFractionDigits: 1 });
        return (numberFmt as { format(n: number): string }).format(n);
      }
      return new IntlRef.NumberFormat(bcp, opts).format(n);
    } catch {
      return String(n);
    }
  };
  const fmtDuration = (seconds: number) => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}:${r < 10 ? '0' : ''}${r}` : `${r}`;
  };

  const api = freeze({
    apiVersion: init.runtimeApiVersion,
    addon: freeze({ id: init.addon.id, name: init.addon.name, version: init.addon.version }),
    on,
    time: () => (snap ? snap.time : 0),
    inCombat: () => !!snap?.inCombat,
    zone: () => (snap ? snap.zoneId : ''),
    unit: (token: string) => (snap?.units?.[token] ? snap.units[token] : null),
    party: () => (snap ? snap.party : null),
    minimap: () => (snap ? snap.minimap : null),
    inventory: () => (snap ? snap.inventory : null),
    quests: () => (snap ? snap.quests : null),
    after,
    every,
    cancel: (h: { cancel?: () => void } | null) => h?.cancel?.(),
    ui: freeze({ create }),
    saved: freeze({
      get account() {
        return saved.account ?? null;
      },
      get character() {
        return saved.character ?? null;
      },
      save: flushSaved,
    }),
    slash: (name: string, fn: (args: string) => void) => {
      if (typeof name !== 'string' || typeof fn !== 'function') {
        throw new TypeError('wynd.slash(name, fn)');
      }
      const key = name.toLowerCase().replace(/^\//, '');
      if (!init.addon.slashCommands.includes(key)) {
        throw new RangeError(`slash command /${key} is not declared in addon.json`);
      }
      slashFns.set(key, fn);
      send({ t: 'slash', name: key });
    },
    print: (text: unknown, color?: string) => {
      send({ t: 'print', text: String(text), color: color ?? null });
    },
    locale: () => init.locale,
    L: (table: Record<string, unknown>) => {
      if (!table || typeof table !== 'object') return table;
      return table[init.locale] ?? table[lang] ?? table.en;
    },
    format: freeze({
      number: fmtNumber,
      duration: fmtDuration,
      percent: (frac: number) => fmtNumber(frac, { style: 'percent', maximumFractionDigits: 0 }),
    }),
    settings: freeze({ get: (key: string) => settings[key] }),
    comm: freeze({
      send: (to: string, data: unknown) => {
        send({ t: 'comm', to: String(to), json: stringify(data ?? null) });
      },
    }),
  });

  let loaded = false;

  // ---- host messages -------------------------------------------------------
  // biome-ignore lint/suspicious/noExplicitAny: messages are validated by shape here.
  const onHost = (e: { data: any }) => {
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'snap':
        onSnapshot(m.snap);
        break;
      case 'ev':
        for (const rec of m.combat ?? []) emit('COMBAT_LOG', rec);
        for (const rec of m.chat ?? []) emit('CHAT', rec);
        break;
      case 'ping':
        send({ t: 'stats', cpuMs: Math.round(cpuMs * 100) / 100 });
        cpuMs = 0;
        send({ t: 'pong' });
        break;
      case 'click': {
        const fn = clickFns.get(m.id);
        if (fn) safe('click', fn, { widget: m.id, button: m.button });
        emit('CLICK', { widget: m.id, button: m.button });
        break;
      }
      case 'moved':
        emit('FRAME_MOVED', { widget: m.id, x: m.x, y: m.y });
        break;
      case 'setting':
        settings[m.key] = m.value;
        emit('SETTING_CHANGED', { key: m.key, value: m.value });
        break;
      case 'slash': {
        const fn = slashFns.get(m.name);
        if (fn) safe(`/${m.name}`, fn as (...a: unknown[]) => unknown, String(m.args ?? ''));
        break;
      }
      case 'comm': {
        let data: unknown = null;
        try {
          data = parse(m.json);
        } catch {
          data = null;
        }
        emit('COMM', { from: m.from, data });
        break;
      }
      case 'logout':
        emit('LOGOUT', {});
        flushSaved();
        break;
      default:
        break;
    }
  };
  // Errors that escape every handler (an async callback, a rejected promise)
  // are reported and counted instead of surfacing as worker crashes.
  // Before the load trailer ran, an uncaught error is a top-level throw in an
  // add-on file: a load error, not a runtime one.
  scope.addEventListener('error', (e: { message?: string; preventDefault?: () => void }) => {
    const message = String(e?.message ?? 'error').slice(0, 1000);
    send(loaded ? { t: 'err', where: 'async', message } : { t: 'loadError', message });
    e?.preventDefault?.();
  });
  scope.addEventListener(
    'unhandledrejection',
    (e: { reason?: unknown; preventDefault?: () => void }) => {
      send({ t: 'err', where: 'promise', message: describe(e?.reason).slice(0, 1000) });
      e?.preventDefault?.();
    },
  );
  scope.addEventListener('message', (e: { ports?: unknown[] }) => {
    if (chan.port || !e.ports || !e.ports[0]) return;
    const p = e.ports[0] as PortLike;
    chan.port = p;
    p.onmessage = onHost;
    for (const m of outbox.splice(0)) p.postMessage(m);
  });

  // ---- load the add-on -------------------------------------------------------
  // The bootstrap concatenates the add-on files AFTER this call in the same
  // worker script and ends it with `__wyndLoaded()`. One script, not
  // importScripts: the desktop shell's inherited CSP allows blob: workers but
  // not blob: script imports. A syntax error or a top-level throw in an add-on
  // file aborts the script before the trailer runs, so the worker reports an
  // uncaught error without `ready`, which the host treats as a load error.
  Object.defineProperty(scope, 'wynd', { value: api, writable: false, configurable: false });
  const loadStarted = clock();
  Object.defineProperty(scope, '__wyndLoaded', {
    value: () => {
      if (loaded) return;
      loaded = true;
      cpuMs += clock() - loadStarted;
      send({ t: 'ready' });
      emit('LOADED', { firstRun: init.firstRun });
    },
    writable: false,
    configurable: false,
  });
}

/** The single worker script the bootstrap builds: the prelude call, then the
 *  add-on files in load order, then the load trailer. Shared with the bootstrap
 *  (which inlines the same shape) and the tests. */
export function addonWorkerScript(
  prelude: string,
  initJson: string,
  files: readonly string[],
): string {
  let out = `"use strict";\n(${prelude})(self, ${initJson});\n`;
  for (const f of files) out += `${f}\n;\n`;
  return `${out}self.__wyndLoaded();\n`;
}
