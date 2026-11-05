// Wyndlewood add-on sandbox bootstrap. Runs ONLY inside the sandboxed,
// opaque-origin iframe the add-on runtime creates (src/ui/hud/addons/
// addon_runtime_controller.ts), under that iframe's deny-all CSP. It never runs
// add-on code itself: it turns each spawn request into a dedicated Worker built
// from one blob: script (prelude first, then the add-on files), hands the worker its
// MessagePort to the game, and terminates workers on request. Workers inherit
// this document's opaque origin and CSP, so they have no network, no storage
// and no eval. Contract: docs/design/addon-api.md section 3.
'use strict';
(() => {
  const workers = new Map();
  const toHost = (msg) => parent.postMessage(msg, '*');
  const blobUrl = (code) =>
    URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));

  function spawn(msg, port) {
    const key = String(msg.key);
    if (workers.has(key)) workers.get(key).worker.terminate();
    // One worker script: the prelude call (it hardens the global first), then
    // the add-on files in load order, then the load trailer. The same shape as
    // addonWorkerScript() in src/ui/hud/addons/addon_worker_prelude.ts.
    let code = `"use strict";\n(${String(msg.prelude)})(self, ${JSON.stringify(msg.init)});\n`;
    for (const f of msg.files) code += `${String(f)}\n;\n`;
    code += 'self.__wyndLoaded();\n';
    const url = blobUrl(code);
    let worker;
    try {
      worker = new Worker(url, { name: key });
    } catch (e) {
      toHost({ t: 'spawnError', key, message: String(e && e.message ? e.message : e) });
      return;
    }
    worker.addEventListener('error', (e) => {
      e.preventDefault();
      toHost({ t: 'workerError', key, message: String(e.message || 'worker error') });
    });
    // Worker -> iframe messages are never read: the game end of the port is the
    // only channel, so an add-on cannot talk to this bootstrap.
    worker.postMessage({ t: 'port' }, [port]);
    workers.set(key, { worker, urls: [url] });
    // The worker fetched its script at construction; the URL is not needed again.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toHost({ t: 'spawned', key });
  }

  function kill(key) {
    const rec = workers.get(key);
    if (!rec) return;
    rec.worker.terminate();
    for (const u of rec.urls) URL.revokeObjectURL(u);
    workers.delete(key);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'spawn' && e.ports && e.ports[0] && Array.isArray(msg.files)) {
      spawn(msg, e.ports[0]);
    } else if (msg.t === 'kill') {
      kill(String(msg.key));
    } else if (msg.t === 'killAll') {
      for (const key of Array.from(workers.keys())) kill(key);
    }
  });
  toHost({ t: 'ready' });
})();
