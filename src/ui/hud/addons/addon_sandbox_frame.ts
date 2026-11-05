// The sandbox host: one hidden iframe with sandbox="allow-scripts" (NO
// allow-same-origin, so an opaque origin: no cookies, no same-origin storage,
// no reach into the game page) and a deny-all CSP, running only our bootstrap
// (public/addon-sandbox/bootstrap.js). The bootstrap turns each spawn into a
// dedicated blob: Worker that inherits that origin and CSP. The runtime talks
// to the sandbox only through AddonSandboxHost, so tests swap in an in-process
// host (tests/addon_runtime.test.ts). Contract: docs/design/addon-api.md 3.

import type { AddonWorkerInit } from './addon_worker_prelude';

export const ADDON_BOOTSTRAP_PATH = '/addon-sandbox/bootstrap.js';

export interface AddonSpawnPayload {
  prelude: string;
  init: AddonWorkerInit;
  files: string[];
}

export interface AddonSandboxHost {
  spawn(key: string, payload: AddonSpawnPayload, port: MessagePort): void;
  kill(key: string): void;
  dispose(): void;
}

export type AddonSandboxEvent = {
  key: string;
  kind: 'spawnError' | 'workerError';
  message: string;
};

/** The CSP the sandbox document (and, inherited, every add-on worker) runs under. */
export function addonSandboxCsp(bootstrapUrl: string): string {
  return [
    "default-src 'none'",
    `script-src ${bootstrapUrl} blob:`,
    'worker-src blob:',
    "connect-src 'none'",
    "img-src 'none'",
    "style-src 'none'",
    "font-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

export function createIframeSandbox(
  doc: Document,
  win: Window,
  onEvent: (e: AddonSandboxEvent) => void,
): AddonSandboxHost {
  const src = `${win.location.origin}${ADDON_BOOTSTRAP_PATH}`;
  const f = doc.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.className = 'addon-sandbox-frame';
  f.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${addonSandboxCsp(src)}"><script src="${src}"></script>`;
  let ready = false;
  const queue: { key: string; payload: AddonSpawnPayload; port: MessagePort }[] = [];
  const post = (key: string, payload: AddonSpawnPayload, port: MessagePort) => {
    f.contentWindow?.postMessage({ t: 'spawn', key, ...payload }, '*', [port]);
  };
  const onMessage = (e: MessageEvent) => {
    if (e.source !== f.contentWindow) return;
    const m = e.data as { t?: string; key?: string; message?: string } | null;
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ready') {
      ready = true;
      for (const q of queue.splice(0)) post(q.key, q.payload, q.port);
      return;
    }
    if ((m.t === 'spawnError' || m.t === 'workerError') && typeof m.key === 'string') {
      onEvent({ key: m.key, kind: m.t, message: String(m.message ?? '') });
    }
  };
  win.addEventListener('message', onMessage);
  doc.body.appendChild(f);
  return {
    spawn(key, payload, port) {
      if (ready) post(key, payload, port);
      else queue.push({ key, payload, port });
    },
    kill(key) {
      f.contentWindow?.postMessage({ t: 'kill', key }, '*');
    },
    dispose() {
      win.removeEventListener('message', onMessage);
      f.remove();
    },
  };
}
