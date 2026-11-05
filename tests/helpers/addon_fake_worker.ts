// An in-process stand-in for an add-on worker: a fake worker global that the
// REAL prelude (addonWorkerMain, serialized and re-evaluated exactly like the
// sandbox bootstrap does) hardens and then loads add-on files into. Add-on code
// is evaluated with the fake global's names passed as parameters, so a bare
// `fetch` or `importScripts` inside an add-on resolves to the hardened value,
// the way a global lookup would inside a real worker.
//
// Used by tests/addon_worker_prelude.test.ts and tests/addon_runtime.test.ts.
// The real-browser counterpart is scripts/addon_sandbox_probe.mjs.

import type {
  AddonSandboxEvent,
  AddonSandboxHost,
} from '../../src/ui/hud/addons/addon_sandbox_frame';
import {
  ADDON_WORKER_BLOCKED_GLOBALS,
  type AddonWorkerInit,
} from '../../src/ui/hud/addons/addon_worker_prelude';

export type { AddonSandboxEvent };

// biome-ignore lint/suspicious/noExplicitAny: a deliberately loose worker global.
export type FakeScope = Record<string, any>;

export interface FakeWorker {
  scope: FakeScope;
  listeners: Map<string, ((e: unknown) => void)[]>;
  timers: Set<ReturnType<typeof setTimeout>>;
  /** Set when the worker script failed to compile (the real worker's 'error'). */
  startError: string | null;
  terminate(): void;
}

const GLOBAL_NAMES = [...ADDON_WORKER_BLOCKED_GLOBALS, 'self', 'wynd', 'setTimeout', 'setInterval'];

export function createFakeWorker(
  prelude: string,
  init: AddonWorkerInit,
  files: string[],
): FakeWorker {
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const scope: FakeScope = {
    performance: { now: () => performance.now() },
    setTimeout: (fn: () => void, ms: number) => {
      const h = setTimeout(() => {
        timers.delete(h);
        fn();
      }, ms);
      timers.add(h);
      return h;
    },
    clearTimeout: (h: ReturnType<typeof setTimeout>) => {
      clearTimeout(h);
      timers.delete(h);
    },
    setInterval: (fn: () => void, ms: number) => {
      const h = setInterval(fn, ms);
      timers.add(h);
      return h;
    },
    clearInterval: (h: ReturnType<typeof setInterval>) => {
      clearInterval(h);
      timers.delete(h);
    },
    Intl,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    fetch: () => Promise.resolve('LEAK'),
    XMLHttpRequest: class {},
    WebSocket: class {},
    EventSource: class {},
    importScripts: () => 'LEAK',
    indexedDB: { open: () => 'LEAK' },
    caches: { open: () => 'LEAK' },
    BroadcastChannel: class {},
    Worker: class {},
    postMessage: () => 'LEAK',
    WebAssembly: {},
    addEventListener(type: string, fn: (e: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
  };
  scope.self = scope;
  const worker: FakeWorker = {
    scope,
    listeners,
    timers,
    startError: null,
    terminate() {
      for (const h of timers) {
        clearTimeout(h);
        clearInterval(h);
      }
      timers.clear();
    },
  };
  // Compile every file first: a syntax error anywhere fails the whole worker
  // script before the prelude runs, exactly like the real single-script worker.
  let compiled: ((...a: unknown[]) => void)[];
  try {
    compiled = files.map(
      (code) =>
        new Function(...GLOBAL_NAMES, `'use strict';\n${code}`) as (...a: unknown[]) => void,
    );
  } catch (e) {
    worker.startError = String((e as Error).message);
    return worker;
  }
  const main = new Function(`return (${prelude});`)() as (
    s: FakeScope,
    init: AddonWorkerInit,
  ) => void;
  main(scope, init);
  try {
    for (const fn of compiled) fn(...GLOBAL_NAMES.map((n) => (n === 'self' ? scope : scope[n])));
    scope.__wyndLoaded();
  } catch (e) {
    // An uncaught top-level throw reaches the worker's global error listeners.
    dispatch(worker, 'error', { message: String((e as Error).message), preventDefault() {} });
  }
  return worker;
}

/** An AddonSandboxHost that runs every add-on in-process via createFakeWorker. */
export function createFakeSandbox(onEvent?: (e: AddonSandboxEvent) => void): AddonSandboxHost & {
  workers: Map<string, FakeWorker>;
} {
  const workers = new Map<string, FakeWorker>();
  return {
    workers,
    spawn(key, payload, port) {
      const w = createFakeWorker(payload.prelude, payload.init as AddonWorkerInit, payload.files);
      workers.set(key, w);
      if (w.startError !== null) {
        onEvent?.({ key, kind: 'workerError', message: w.startError });
        return;
      }
      deliverPort(w, port);
    },
    kill(key) {
      workers.get(key)?.terminate();
      workers.delete(key);
    },
    dispose() {
      for (const w of workers.values()) w.terminate();
      workers.clear();
    },
  };
}

/** Fire the scope's listeners, like the worker receiving an event. */
export function dispatch(w: FakeWorker, type: string, event: unknown): void {
  for (const fn of w.listeners.get(type) ?? []) fn(event);
}

/** Deliver the host's MessagePort, like worker.postMessage({ t: 'port' }, [port]). */
export function deliverPort(w: FakeWorker, port: MessagePort): void {
  dispatch(w, 'message', { data: { t: 'port' }, ports: [port] });
}
