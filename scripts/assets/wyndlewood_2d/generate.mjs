// Wyndlewood 2D replacement, step 3: paint each planned sheet with Tripo text-to-image.
//
// Original text prompts only (sheets.json); no image is ever uploaded. At most two tasks run
// at once (the shared account caps concurrency). Every task id and its credit cost goes to
// ledger.jsonl beside this file (committed: the paid-plan provenance record); the sheets
// themselves land in tmp/wyndlewood_2d/sheets/ (gitignored, maintainer-local sources).
// Resume-safe: a sheet whose PNG exists is skipped, a created task is polled, not re-created.
//
// usage: TRIPO_API_KEY=... node scripts/assets/wyndlewood_2d/generate.mjs [--family skills] [--only id,id]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://openapi.tripo3d.ai/v3';
const KEY = (process.env.TRIPO_API_KEY || '').trim();
if (!KEY) {
  console.log('[w2d] TRIPO_API_KEY absent');
  process.exit(2);
}
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : process.argv[i + 1];
};
const fams = arg('--family', '').split(',').filter(Boolean);
const only = arg('--only', '').split(',').filter(Boolean);
const conc = Number(arg('--concurrency', '2'));
const outDir = join(process.cwd(), 'tmp/wyndlewood_2d/sheets');
mkdirSync(outDir, { recursive: true });
const ledgerPath = join(here, 'ledger.jsonl');
const ledger = new Map();
if (existsSync(ledgerPath)) {
  for (const l of readFileSync(ledgerPath, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const r = JSON.parse(l);
    ledger.set(r.sheet, { ...(ledger.get(r.sheet) ?? {}), ...r });
  }
}
const log = (r) => {
  appendFileSync(ledgerPath, `${JSON.stringify(r)}\n`);
  ledger.set(r.sheet, { ...(ledger.get(r.sheet) ?? {}), ...r });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, { method = 'GET', body } = {}) {
  for (let a = 0; a < 8; a++) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: {
          Authorization: `Bearer ${KEY}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(method === 'GET' ? 30_000 : 90_000),
      });
    } catch (e) {
      if (method !== 'GET') throw e;
      await sleep(2000 * (a + 1));
      continue;
    }
    const t = await res.text();
    let j = null;
    try {
      j = JSON.parse(t);
    } catch {}
    if (res.ok && j && j.code === 0) return j.data;
    if (res.status === 429 || (res.status >= 500 && method === 'GET')) {
      await sleep(Math.min(60000, 5000 * 2 ** a));
      continue;
    }
    throw new Error(`${method} ${path} HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  throw new Error(`${method} ${path} retries exhausted`);
}
const urls = (o, acc = []) => {
  if (typeof o === 'string') {
    if (/^https?:\/\//.test(o)) acc.push(o);
  } else if (o && typeof o === 'object') for (const v of Object.values(o)) urls(v, acc);
  return acc;
};
let sheets = JSON.parse(readFileSync(join(here, 'sheets.json'), 'utf8'));
if (fams.length) sheets = sheets.filter((s) => fams.includes(s.family));
if (only.length) sheets = sheets.filter((s) => only.includes(s.id));
const bal0 = await api('/account/balance').catch((e) => ({ err: String(e) }));
console.log('[w2d] balance start', JSON.stringify(bal0), 'sheets', sheets.length);
let next = 0;
let done = 0;
let spent = 0;
async function worker() {
  while (next < sheets.length) {
    const s = sheets[next++];
    const file = join(outDir, `${s.id}.png`);
    if (existsSync(file)) continue;
    const rec = ledger.get(s.id);
    try {
      let taskId = rec?.taskId && rec.status !== 'failed' ? rec.taskId : null;
      if (!taskId) {
        const d = await api('/generation/text-to-image', {
          method: 'POST',
          body: {
            prompt: s.prompt,
            model: 'seedream_v4',
            size: s.size ?? '2048x2048',
            output_format: 'png',
          },
        });
        taskId = d.task_id;
        log({
          sheet: s.id,
          taskId,
          status: 'created',
          model: 'seedream_v4',
          at: new Date().toISOString(),
        });
      }
      let task;
      const maxPolls = Number(arg('--max-polls', '200'));
      for (let i = 0; i < maxPolls; i++) {
        await sleep(3000);
        task = await api(`/tasks/${taskId}`);
        if (['success', 'failed', 'banned', 'expired', 'cancelled'].includes(task.status)) break;
      }
      if (!['success', 'failed', 'banned', 'expired', 'cancelled'].includes(task.status)) {
        // Still running on Tripo's side: leave it for a later resume (it is polled, never re-created).
        console.log('[w2d] still running', s.id, taskId);
        continue;
      }
      if (task.status !== 'success') {
        log({
          sheet: s.id,
          taskId,
          status: 'failed',
          taskStatus: task.status,
          credits: task.credits_consumed ?? 0,
        });
        continue;
      }
      const res = await fetch(urls(task.output)[0]);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      done++;
      spent += Number(task.credits_consumed ?? 0);
      log({
        sheet: s.id,
        taskId,
        status: 'done',
        credits: task.credits_consumed,
        bytes: buf.length,
      });
      console.log('[w2d] done', s.id, task.credits_consumed);
    } catch (e) {
      log({ sheet: s.id, status: 'error', err: String(e).slice(0, 300) });
      console.log('[w2d] error', s.id, String(e).slice(0, 200));
      await sleep(5000);
    }
  }
}
await Promise.all(Array.from({ length: conc }, worker));
const bal1 = await api('/account/balance').catch((e) => ({ err: String(e) }));
console.log('[w2d] balance end', JSON.stringify(bal1), 'done', done, 'credits', spent);
