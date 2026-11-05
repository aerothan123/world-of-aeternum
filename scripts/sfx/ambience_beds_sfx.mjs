// Region ambience beds (the zone and town soundscapes): ElevenLabs Sound Effects
// takes, made into seamless stereo loops and mastered for the Ambience bus.
//
//   ELEVENLABS_API_KEY=... node scripts/sfx/ambience_beds_sfx.mjs usage
//   ELEVENLABS_API_KEY=... node scripts/sfx/ambience_beds_sfx.mjs generate [--only <key>]
//   node scripts/sfx/ambience_beds_sfx.mjs build [--only <key>]
//   node scripts/sfx/ambience_beds_sfx.mjs demo [--only <key>]
//
// generate keeps the raw take in scripts/sfx/sources/ambience/<key>.source.mp3 and never
// regenerates one that exists (the quota is shared), records the take's date and the account
// tier it was made on in scripts/sfx/sources/ambience/takes.json (the licensing ledger,
// docs/audio/elevenlabs_provenance.md, reads it), and retries once a take that came back
// near silent. build cuts the raw take into a
// loop: the tail is crossfaded (equal power) over the head, so the wrap the runtime's plain
// loop=true playback makes is inaudible, then masters it (loudness and true-peak ceiling) and
// writes public/audio/sfx/<key>.mp3. demo renders a short listening file per bed that plays
// the loop twice across its wrap, so the seam can be judged by ear.
//
// Every take is DRY: the outdoor reverb and the distance crossfades are applied at runtime.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMBIENCE_BED_PROMPTS } from './ambience_bed_prompts.mjs';
import { FFMPEG_PATH } from './ffmpeg_paths.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT_DIR = join(ROOT, 'public/audio/sfx');
const SOURCES = join(ROOT, 'scripts/sfx/sources/ambience');
const DEMO_DIR = process.env.AMBIENCE_DEMO_DIR ?? join(ROOT, 'tmp/ambience-demo');
const API = 'https://api.elevenlabs.io';
const SR = 44100;
const PROMPT_INFLUENCE = 0.45;
/** The take's delivery format: 192 kbps needs a paid tier (the free-tier takes were 128). */
const OUTPUT_FORMAT = process.env.AMBIENCE_OUTPUT_FORMAT ?? 'mp3_44100_192';
/** A take quieter than this (integrated LUFS) came back near silent: retry it once. */
const SILENT_TAKE_LUFS = -45;
const TAKES_FILE = join(SOURCES, 'takes.json');
/** Seconds of the take's tail folded over its head to hide the wrap. */
const SEAM_SECONDS = 2.5;
/** Integrated loudness the beds are mastered to (they sit under everything else). */
const TARGET_LUFS = -20;
/** Sample-peak ceiling (dBFS). */
const PEAK_DB = -6;
/** Most gain reduction the limiter may apply to reach the loudness target (dB). */
const LIMIT_MAX_DB = 6;

const mode = process.argv[2] ?? 'build';
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const only = arg('--only');
const beds = AMBIENCE_BED_PROMPTS.filter((b) => !only || only.split(',').includes(b.key));

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return key;
}

let lastTier = 'unknown';

async function usage() {
  const res = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': apiKey() } });
  if (!res.ok) {
    console.log(`usage: unavailable (${res.status})`);
    return null;
  }
  const s = await res.json();
  console.log(`usage: ${s.character_count} / ${s.character_limit} characters (tier ${s.tier})`);
  lastTier = s.tier;
  return s.character_count;
}

async function generateOne(bed) {
  const body = {
    text: bed.prompt,
    duration_seconds: bed.request,
    prompt_influence: PROMPT_INFLUENCE,
    loop: true,
    model_id: 'eleven_text_to_sound_v2',
  };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/v1/sound-generation?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const detail = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${bed.key} -> ${res.status} ${detail.slice(0, 200)}`);
  }
}

async function generate() {
  let before = await usage();
  mkdirSync(SOURCES, { recursive: true });
  for (const bed of beds) {
    const file = join(SOURCES, `${bed.key}.source.mp3`);
    if (existsSync(file)) {
      console.log(`skip ${bed.key} (take exists)`);
      continue;
    }
    process.stdout.write(`gen ${bed.key} (${bed.request}s)... `);
    writeFileSync(file, await generateOne(bed));
    const lufs = integratedLufs(file);
    if (!(lufs > SILENT_TAKE_LUFS)) {
      renameSync(file, join(SOURCES, `${bed.key}.rejected.mp3`));
      process.stdout.write(`near silent (${lufs} LUFS), retrying... `);
      writeFileSync(file, await generateOne(bed));
    }
    const after = await usage();
    const takes = existsSync(TAKES_FILE) ? JSON.parse(readFileSync(TAKES_FILE, 'utf8')) : {};
    takes[bed.key] = { generated: localDate(), tier: lastTier, format: OUTPUT_FORMAT };
    writeFileSync(TAKES_FILE, `${JSON.stringify(takes, null, 2)}\n`);
    if (before !== null && after !== null) console.log(`  cost ${after - before} characters`);
    before = after;
  }
}

/** Today's date (YYYY-MM-DD) on the generating machine's own clock. */
function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Decode to interleaved-free stereo planes at SR. */
function decode(file) {
  const raw = execFileSync(
    FFMPEG_PATH,
    ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1'],
    { maxBuffer: 1 << 28 },
  );
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const n = x.length / 2;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = x[2 * i];
    r[i] = x[2 * i + 1];
  }
  return [l, r];
}

function encode(planes, file, extra = []) {
  const [l, r] = planes;
  const inter = new Float32Array(l.length * 2);
  for (let i = 0; i < l.length; i++) {
    inter[2 * i] = l[i];
    inter[2 * i + 1] = r[i];
  }
  execFileSync(
    FFMPEG_PATH,
    [
      '-v',
      'error',
      '-y',
      '-f',
      'f32le',
      '-ar',
      String(SR),
      '-ac',
      '2',
      '-i',
      'pipe:0',
      ...extra,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      file,
    ],
    { input: Buffer.from(inter.buffer) },
  );
}

/** Trim leading/trailing fade-in/out (a window 20 dB under the take's median level), never
 *  more than 1.5 s a side. Judged against the median, not the peak: a bed's bird chirp can
 *  sit 30 dB over its steady wash, which is not silence. */
function trimEdges(planes) {
  const [l, r] = planes;
  const n = l.length;
  const win = Math.round(SR * 0.05);
  const level = (i) => {
    let s = 0;
    for (let k = i; k < Math.min(n, i + win); k++) s += l[k] * l[k] + r[k] * r[k];
    return Math.sqrt(s / (2 * win));
  };
  const levels = [];
  for (let i = 0; i + win <= n; i += win) levels.push(level(i));
  levels.sort((a, b) => a - b);
  const floor = levels[Math.floor(levels.length / 2)] * 0.1;
  const loud = (i) => level(i) > floor;
  const cap = Math.round(SR * 1.5);
  let a = 0;
  while (a < cap && !loud(a)) a += win;
  let b = n;
  while (n - b < cap && !loud(b - win)) b -= win;
  return [l.slice(a, b), r.slice(a, b)];
}

/** Fold the last SEAM_SECONDS over the first (equal power): the result's end runs straight
 *  into its start. */
function makeLoop(planes) {
  const seam = Math.round(SR * SEAM_SECONDS);
  return planes.map((x) => {
    const n = x.length - seam;
    const y = x.slice(0, n);
    for (let i = 0; i < seam; i++) {
      const t = i / seam;
      const fin = Math.sin((t * Math.PI) / 2);
      const fout = Math.cos((t * Math.PI) / 2);
      y[i] = x[i] * fin + x[n + i] * fout;
    }
    return y;
  });
}

/** Integrated loudness via ffmpeg's ebur128 summary (printed on stderr). */
function integratedLufs(file) {
  const p = spawnSync(
    FFMPEG_PATH,
    ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 26 },
  );
  const m = [...String(p.stderr).matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
  return m.length ? Number(m[m.length - 1][1]) : Number.NaN;
}

/** Gain the take to TARGET_LUFS, with a look-ahead peak limiter (LIMIT_MAX_DB at most of
 *  gain reduction) holding the ceiling; a bed that would need more is left quieter. Runs on
 *  the raw take, BEFORE the loop is cut, so the limiter's state never steps at the wrap. */
function master(planes, tmp) {
  encode(planes, tmp);
  const lufs = integratedLufs(tmp);
  let g = 10 ** ((TARGET_LUFS - lufs) / 20);
  let peak = 0;
  for (const x of planes) for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const ceiling = 10 ** (PEAK_DB / 20);
  const maxG = (ceiling / peak) * 10 ** (LIMIT_MAX_DB / 20);
  if (g > maxG) g = maxG;
  const gained = planes.map((x) => x.map((v) => v * g));
  return { planes: limit(gained, ceiling), lufs, gainDb: 20 * Math.log10(g) };
}

/** A stereo-linked look-ahead peak limiter: 5 ms look-ahead, instant attack on the
 *  look-ahead window's peak, 120 ms release. */
function limit(planes, ceiling) {
  const [l, r] = planes;
  const n = l.length;
  const ahead = Math.round(SR * 0.005);
  const rel = Math.exp(-1 / (SR * 0.12));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  // running minimum of the needed gain over the look-ahead window (simple O(n*ahead))
  const out = [new Float32Array(n), new Float32Array(n)];
  let gr = 1;
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let k = i; k < Math.min(n, i + ahead); k++) if (need[k] < m) m = need[k];
    gr = m < gr ? m : 1 - (1 - gr) * rel;
    if (gr > m) gr = m;
    out[0][i] = l[i] * gr;
    out[1][i] = r[i] * gr;
  }
  return out;
}

function build() {
  mkdirSync(DEMO_DIR, { recursive: true });
  for (const bed of beds) {
    const src = join(SOURCES, `${bed.key}.source.mp3`);
    if (!existsSync(src)) {
      console.log(`missing take ${bed.key}`);
      continue;
    }
    const m = master(trimEdges(decode(src)), join(DEMO_DIR, `.${bed.key}.measure.mp3`));
    const looped = makeLoop(m.planes);
    m.planes = looped;
    const out = join(OUT_DIR, `${bed.key}.mp3`);
    encode(looped, out);
    const final = integratedLufs(out);
    console.log(
      `${bed.key}: ${(m.planes[0].length / SR).toFixed(2)} s loop, raw ${m.lufs.toFixed(1)} LUFS, gain ${m.gainDb.toFixed(1)} dB, final ${final.toFixed(1)} LUFS`,
    );
  }
}

/** The loop played twice (so the wrap is heard once mid-file), capped at 30 s, faded. */
function demo() {
  mkdirSync(DEMO_DIR, { recursive: true });
  for (const bed of beds) {
    const file = join(OUT_DIR, `${bed.key}.mp3`);
    if (!existsSync(file)) continue;
    const [l, r] = decode(file);
    const n = l.length;
    const half = Math.min(n, Math.round(SR * 15));
    // the last `half` seconds of one pass followed by the first `half` of the next
    const out = [new Float32Array(2 * half), new Float32Array(2 * half)];
    const fade = Math.round(SR * 1);
    [l, r].forEach((x, c) => {
      for (let i = 0; i < half; i++) out[c][i] = x[n - half + i];
      for (let i = 0; i < half; i++) out[c][half + i] = x[i];
      for (let i = 0; i < fade; i++) {
        out[c][i] *= i / fade;
        out[c][2 * half - 1 - i] *= i / fade;
      }
    });
    const dst = join(DEMO_DIR, `${bed.key}_demo.mp3`);
    encode(out, dst);
    console.log(`demo ${dst} (wrap at ${(half / SR).toFixed(1)} s)`);
  }
}

if (mode === 'usage') await usage();
else if (mode === 'generate') await generate();
else if (mode === 'build') build();
else if (mode === 'demo') demo();
else throw new Error(`unknown mode ${mode}`);
