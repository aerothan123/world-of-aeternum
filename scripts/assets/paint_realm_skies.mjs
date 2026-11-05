// Paint the realm sky HDRIs from original text prompts, then build their Radiance
// masters under public/env/. This is the PNG-to-Radiance step compress_sky_hdr.mjs
// expects to run before it; the pure maths lives in lib/sky_rgbe_core.mjs.
//
//   node scripts/assets/paint_realm_skies.mjs paint [--only stem,stem] [--cap 100]
//   node scripts/assets/paint_realm_skies.mjs build [--only stem,stem]
//   node scripts/assets/compress_sky_hdr.mjs <stems...>
//   node scripts/hdri_irradiance.mjs          (then refresh REALM_SKY_IRRADIANCE)
//   node scripts/build_media_manifest.mjs generate
//
// paint: one Tripo text-to-image task per sky (seedream_v4, 2912x1456, prompt only, no
// image is uploaded). Needs TRIPO_API_KEY. Every task id and its credit cost is
// appended to specs/realm_skies_ledger.jsonl (committed: the paid-plan provenance
// record); the paintings land in tmp/realm_skies/ (gitignored, maintainer-local).
// Resume-safe: a sky whose PNG exists is skipped and a created task is polled, never
// re-created. --cap stops creating tasks once this run's spend plus the tasks in
// flight could pass that many credits.
//
// build: linearize the painting, wrap the seam, settle the poles, roll it so its own
// painted sun sits at the azimuth sky.ts already rotates by (HDRI_SUN_U), calibrate
// the open sky to the spec's target irradiance with the HDR sun re-injected, and
// write <stem>_2k.hdr (2048x1024) and <stem>_1k.hdr (1024x512). A preview JPEG of
// each master goes to tmp/realm_skies/preview_<stem>.jpg.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  brightestUv,
  calibrateExposure,
  encodeRadiance,
  findHorizon,
  findPaintedSun,
  injectSun,
  linearFromSrgb8,
  placeHorizon,
  previewSrgb8,
  resampleEquirect,
  rollU,
  scaleImage,
  settlePoles,
  skyIrradiance,
  wrapSeam,
} from './lib/sky_rgbe_core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..');
const SPEC = JSON.parse(readFileSync(join(here, 'specs', 'realm_skies.json'), 'utf8'));
const LEDGER = join(here, 'specs', 'realm_skies_ledger.jsonl');
const SRC = join(ROOT, 'tmp', 'realm_skies');
const ENV = join(ROOT, 'public', 'env');
const BASE = 'https://openapi.tripo3d.ai/v3';
const SIZE = '2912x1456';

const mode = process.argv[2];
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : process.argv[i + 1];
};
const only = arg('--only', '').split(',').filter(Boolean);
const skies = SPEC.skies.filter((s) => !only.length || only.includes(s.stem));
mkdirSync(SRC, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function paint() {
  const key = (process.env.TRIPO_API_KEY || '').trim();
  if (!key) {
    console.log('[sky] TRIPO_API_KEY absent');
    process.exit(2);
  }
  const cap = Number(arg('--cap', '100'));
  const ledger = new Map();
  if (existsSync(LEDGER)) {
    for (const l of readFileSync(LEDGER, 'utf8').split('\n')) {
      if (!l.trim()) continue;
      const r = JSON.parse(l);
      ledger.set(r.stem, { ...(ledger.get(r.stem) ?? {}), ...r });
    }
  }
  const log = (r) => {
    appendFileSync(LEDGER, `${JSON.stringify(r)}\n`);
    ledger.set(r.stem, { ...(ledger.get(r.stem) ?? {}), ...r });
  };
  async function api(path, { method = 'GET', body } = {}) {
    for (let a = 0; a < 8; a++) {
      let res;
      try {
        res = await fetch(BASE + path, {
          method,
          headers: {
            Authorization: `Bearer ${key}`,
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
  const bal0 = await api('/account/balance').catch((e) => ({ err: String(e) }));
  console.log('[sky] balance start', JSON.stringify(bal0), 'skies', skies.length, 'cap', cap);
  const PER_TASK = 5; // seedream_v4 text-to-image, as the 2D ledger records it
  let spent = 0;
  let inFlight = 0;
  let next = 0;
  async function worker() {
    while (next < skies.length) {
      const s = skies[next++];
      const file = join(SRC, `${s.stem}.png`);
      if (existsSync(file)) continue;
      const rec = ledger.get(s.stem);
      try {
        let taskId = rec?.taskId && rec.status !== 'failed' ? rec.taskId : null;
        if (!taskId) {
          if (spent + (inFlight + 1) * PER_TASK > cap) {
            console.log('[sky] cap reached, not creating', s.stem);
            continue;
          }
          const prompt = `${SPEC.style} ${s.prompt}`;
          const d = await api('/generation/text-to-image', {
            method: 'POST',
            body: { prompt, model: 'seedream_v4', size: SIZE, output_format: 'png' },
          });
          taskId = d.task_id;
          log({
            stem: s.stem,
            taskId,
            status: 'created',
            model: 'seedream_v4',
            size: SIZE,
            prompt,
            at: new Date().toISOString(),
          });
        }
        inFlight++;
        let task;
        for (let i = 0; i < 400; i++) {
          await sleep(3000);
          task = await api(`/tasks/${taskId}`);
          if (['success', 'failed', 'banned', 'expired', 'cancelled'].includes(task.status)) break;
        }
        inFlight--;
        if (task.status !== 'success') {
          spent += Number(task.credits_consumed ?? 0);
          log({
            stem: s.stem,
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
        spent += Number(task.credits_consumed ?? 0);
        log({
          stem: s.stem,
          taskId,
          status: 'done',
          credits: task.credits_consumed,
          bytes: buf.length,
        });
        console.log('[sky] done', s.stem, task.credits_consumed);
      } catch (e) {
        log({ stem: s.stem, status: 'error', err: String(e).slice(0, 300) });
        console.log('[sky] error', s.stem, String(e).slice(0, 200));
      }
    }
  }
  await Promise.all([worker(), worker()]);
  const bal1 = await api('/account/balance').catch((e) => ({ err: String(e) }));
  console.log('[sky] balance end', JSON.stringify(bal1), 'credits this run', spent);
}

async function build() {
  const sharp = (await import('sharp')).default;
  for (const s of skies) {
    const file = join(SRC, `${s.stem}.png`);
    if (!existsSync(file)) {
      console.log('[sky] no painting for', s.stem);
      continue;
    }
    const { data, info } = await sharp(file)
      .resize(2048, 1024, { fit: 'fill', kernel: 'lanczos3' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let img = linearFromSrgb8(data, info.width, info.height, info.channels);
    img = wrapSeam(img, 0.08);
    const horizon = s.horizon ?? findHorizon(img);
    img = placeHorizon(img, horizon, { skyTop: 0.12, seaBottom: 0.85 });
    // The painted sun is searched only above the new equator, so its glitter lane on
    // the water is never mistaken for it.
    // A spec may pin the painted sun (u, v after horizon placement) where a low sun sits in
    // a bright horizon band and the contrast search would pick a cloud highlight instead.
    const painted = s.paintedSun
      ? { u: s.paintedSun[0], v: s.paintedSun[1], contrast: 0 }
      : findPaintedSun(img, { vMin: 0.12, vMax: 0.5 });
    if (painted) img = rollU(img, s.sunU - painted.u);
    img = settlePoles(img, {
      zenithV: 0.24,
      horizonV: 0.5,
      hazeV: 0.9,
      groundGain: 0.8,
      groundV: 0.72,
    });
    // The HDR sun goes where the painting put its sun, so there is only ever one.
    const sun = { ...s.sun, u: s.sunU, v: painted ? painted.v : s.sunV };
    const at1k = (k) => injectSun(scaleImage(resampleEquirect(img, 1024, 512), k), sun);
    const k = calibrateExposure(at1k, s.target, s.gain, s.clamp);
    const master2k = injectSun(scaleImage(img, k), sun);
    const master1k = resampleEquirect(master2k, 1024, 512);
    writeFileSync(join(ENV, `${s.stem}_2k.hdr`), encodeRadiance(master2k));
    writeFileSync(join(ENV, `${s.stem}_1k.hdr`), encodeRadiance(master1k));
    const b2 = brightestUv(master2k);
    const b1 = brightestUv(master1k);
    console.log(
      '[sky] built',
      s.stem,
      'exposure',
      k.toFixed(4),
      'horizon',
      horizon.toFixed(3),
      'painted sun',
      painted
        ? `${painted.u.toFixed(3)},${painted.v.toFixed(3)} x${painted.contrast.toFixed(2)}`
        : 'none',
      'E1k',
      skyIrradiance(master1k, s.gain, s.clamp).toFixed(4),
      'target',
      s.target,
      'sunU 2k/1k',
      b2.u.toFixed(3),
      b1.u.toFixed(3),
    );
    // Preview at the dome's own grade: the gain sky.ts applies, Reinhard on top.
    await sharp(Buffer.from(previewSrgb8(master1k, s.gain)), {
      raw: { width: 1024, height: 512, channels: 3 },
    })
      .jpeg({ quality: 85 })
      .toFile(join(SRC, `preview_${s.stem}.jpg`));
  }
}

if (mode === 'paint') await paint();
else if (mode === 'build') await build();
else {
  console.log('usage: paint_realm_skies.mjs paint|build [--only stem,stem] [--cap credits]');
  process.exit(1);
}
