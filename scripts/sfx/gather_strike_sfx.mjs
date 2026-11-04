// Gathering's strike and tree-fall takes: ElevenLabs Sound Effects candidates,
// auditioned by measurement, trimmed to a tight attack and conformed through the
// repo's asset standard (scripts/sfx/conform_audio.mjs). Prompts and counts live
// in gather_strike_prompts.mjs.
//
//   ELEVENLABS_API_KEY=... node scripts/sfx/gather_strike_sfx.mjs generate [--only <key>]
//       paid: N candidates per key into tmp/gather-strike-takes/<key>/cand_<i>.mp3
//       (existing candidates are kept, so a rerun only fills the gaps)
//   node scripts/sfx/gather_strike_sfx.mjs select [--keep <key>=3,1,7,5 ...]
//       free: measures every candidate (onset, attack, crest, hit count, tail,
//       brightness, low body), ranks them, copies the kept raw masters to
//       scripts/sfx/sources/gather/<key>_<n>.source.mp3 and builds them
//   node scripts/sfx/gather_strike_sfx.mjs build
//       free and reproducible: the committed raw masters to
//       public/audio/sfx/<key>_<n>.mp3 (trim, fades, conform)
//   ELEVENLABS_API_KEY=... node scripts/sfx/gather_strike_sfx.mjs usage
//       prints the account's used / limit character counts (never the key)
//   then: npm run sfx:manifest
//
// Style directions (audition only; GATHER_STRIKE_STYLES, never shipped keys):
//   ELEVENLABS_API_KEY=... node scripts/sfx/gather_strike_sfx.mjs styles-generate
//   node scripts/sfx/gather_strike_sfx.mjs styles-select [heavy.impact_gather_pick=3,1 ...]
//   node scripts/sfx/gather_strike_sfx.mjs styles-build
//
// Every take is DRY on purpose: the outdoor echo is added at runtime.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conformSfxAudio } from './conform_audio.mjs';
import { FFMPEG_PATH } from './ffmpeg_paths.mjs';
import {
  GATHER_STRIKE_PROMPTS,
  GATHER_STRIKE_STYLES,
  STYLE_CANDIDATES,
  STYLE_KEEP,
} from './gather_strike_prompts.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT_DIR = join(ROOT, 'public/audio/sfx');
const WORK = join(ROOT, 'tmp/gather-strike-takes');
const SOURCES = join(ROOT, 'scripts/sfx/sources/gather');
const API = 'https://api.elevenlabs.io';
const SR = 44100;
const PROMPT_INFLUENCE = 0.55;

const mode = process.argv[2] ?? 'select';
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const only = arg('--only');
const cues = GATHER_STRIKE_PROMPTS.filter((c) => !only || c.key === only);

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return key;
}

async function usage() {
  const res = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': apiKey() } });
  if (!res.ok) {
    console.log(`usage: unavailable (${res.status})`);
    return;
  }
  const s = await res.json();
  console.log(`usage: ${s.character_count} / ${s.character_limit} characters (tier ${s.tier})`);
}

async function generateOne(cue) {
  const body = {
    text: cue.prompt,
    duration_seconds: cue.request,
    prompt_influence: PROMPT_INFLUENCE,
    output_format: 'mp3_44100_128',
  };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/v1/sound-generation`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const detail = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`${cue.key} -> ${res.status} ${detail.slice(0, 200)}`);
  }
}

async function generate() {
  await usage();
  let seconds = 0;
  for (const cue of cues) {
    const dir = join(WORK, cue.key);
    mkdirSync(dir, { recursive: true });
    for (let i = 1; i <= cue.candidates; i++) {
      const file = join(dir, `cand_${i}.mp3`);
      if (existsSync(file)) continue;
      process.stdout.write(`gen ${cue.key} #${i} (${cue.request}s)... `);
      writeFileSync(file, await generateOne(cue));
      seconds += cue.request;
      console.log('ok');
    }
  }
  console.log(`requested ${seconds.toFixed(1)} s of audio`);
  await usage();
}

function decode(file) {
  const raw = execFileSync(
    FFMPEG_PATH,
    ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), 'pipe:1'],
    { maxBuffer: 1 << 28 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
}

const BLOCK = Math.round(SR * 0.001); // 1 ms envelope blocks

function envelope(x) {
  const n = Math.ceil(x.length / BLOCK);
  const e = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let m = 0;
    for (let i = b * BLOCK; i < Math.min(x.length, (b + 1) * BLOCK); i++)
      m = Math.max(m, Math.abs(x[i]));
    e[b] = m;
  }
  return e;
}

const energy = (x, from, to) => {
  let s = 0;
  for (let i = Math.max(0, from); i < Math.min(x.length, to); i++) s += x[i] * x[i];
  return s;
};

/** What an audition listens for, measured. Times in seconds. */
export function measure(x) {
  const env = envelope(x);
  let peak = 0;
  let peakBlock = 0;
  env.forEach((v, b) => {
    if (v > peak) {
      peak = v;
      peakBlock = b;
    }
  });
  const onsetBlock = Math.max(
    0,
    env.findIndex((v) => v > peak * 0.15),
  );
  const onset = (onsetBlock * BLOCK) / SR;
  const attackMs = peakBlock - onsetBlock;
  const s0 = onsetBlock * BLOCK;
  const active = Math.round(0.4 * SR);
  const rms = Math.sqrt(energy(x, s0, s0 + active) / active) || 1e-9;
  const crest = peak / rms;
  // separate hits: 5 ms envelope peaks above 45% of the max, 120 ms apart
  let hits = 0;
  let last = -1e9;
  for (let b = 5; b < env.length - 5; b++) {
    const v = env[b];
    if (v < peak * 0.45) continue;
    let isMax = true;
    for (let k = b - 5; k <= b + 5; k++) if (env[k] > v) isMax = false;
    if (isMax && b - last >= 120) {
      hits++;
      last = b;
    }
  }
  const head = Math.round(0.35 * SR);
  const tail = energy(x, s0 + head, x.length) / (energy(x, s0, s0 + head) || 1e-9);
  // brightness: first-difference energy against signal energy, first 60 ms
  const w = Math.round(0.06 * SR);
  let diff = 0;
  for (let i = s0 + 1; i < Math.min(x.length, s0 + w); i++) diff += (x[i] - x[i - 1]) ** 2;
  const bright = diff / (energy(x, s0, s0 + w) || 1e-9);
  // low body: a 150 Hz one-pole low-pass's share of the first 300 ms
  const a = 1 - Math.exp((-2 * Math.PI * 150) / SR);
  let lp = 0;
  let lowE = 0;
  const lw = Math.round(0.3 * SR);
  for (let i = s0; i < Math.min(x.length, s0 + lw); i++) {
    lp += a * (x[i] - lp);
    lowE += lp * lp;
  }
  const low = lowE / (energy(x, s0, s0 + lw) || 1e-9);
  const coverage = env.filter((v) => v > peak * 0.1).length / env.length;
  let clipped = 0;
  for (const v of x) if (Math.abs(v) > 0.995) clipped++;
  return { peak, onset, attackMs, crest, hits, tail, bright, low, coverage, clipped };
}

/** Higher is better, per cue: what makes a usable one-hit take. */
export function score(key, m) {
  const clip = m.clipped > 20 ? 2 : 0;
  const late = m.onset > 0.3 ? 1 : 0;
  if (key === 'impact_gather_pick') {
    return (
      Math.log(m.crest) +
      3 * m.bright -
      1.2 * Math.max(0, m.hits - 1) -
      1.5 * m.tail -
      m.attackMs / 15 -
      clip -
      late
    );
  }
  if (key === 'impact_gather_axe') {
    return (
      Math.log(m.crest) +
      1.5 * m.low -
      1.2 * Math.max(0, m.hits - 1) -
      1.5 * m.tail -
      m.attackMs / 15 -
      clip -
      late
    );
  }
  if (key === 'impact_tree_creak') return 2 * m.coverage - 0.3 * Math.max(0, m.hits - 4) - clip;
  return 3 * m.low + 0.5 * Math.log(m.crest) - 0.4 * Math.max(0, m.hits - 3) - clip - late;
}

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buf;
}

/** Where a take's first hit ends: the sample just before the envelope re-attacks
 *  (a second swing the generator added), or the take's end. Searched from 120 ms
 *  after the onset on a 5 ms envelope: a rise to 3x the running minimum that
 *  also reaches 40% of the first hit's peak is a new hit. */
function firstHitEnd(x, onsetSample) {
  const W = Math.round(0.005 * SR);
  const blocks = [];
  for (let i = onsetSample; i < x.length; i += W) {
    let m = 0;
    for (let k = i; k < Math.min(x.length, i + W); k++) m = Math.max(m, Math.abs(x[k]));
    blocks.push(m);
  }
  // a hit's own crack and splinters ring inside its first 120 ms; only a strong
  // re-attack after that is a second swing
  const skip = 24;
  let firstPeak = 0;
  for (let b = 0; b < Math.min(skip, blocks.length); b++)
    firstPeak = Math.max(firstPeak, blocks[b]);
  let floor = Number.POSITIVE_INFINITY;
  for (let b = skip; b < blocks.length; b++) {
    floor = Math.min(floor, blocks[b]);
    if (blocks[b] > floor * 3 && blocks[b] > firstPeak * 0.4) {
      return onsetSample + Math.max(0, b - 1) * W;
    }
  }
  return x.length;
}

/** A tight take: 4 ms before the onset, cut where it falls 50 dB under its peak
 *  (at most `trim` seconds; a one-hit cue also ends before any second hit),
 *  short fades at both ends. */
function tighten(x, trim, singleHit = false) {
  const m = measure(x);
  const start = Math.max(0, Math.round((m.onset - 0.004) * SR));
  const env = envelope(x);
  let endBlock = env.length - 1;
  while (endBlock > 0 && env[endBlock] < m.peak * 0.00316) endBlock--;
  const hitEnd = singleHit ? firstHitEnd(x, Math.round(m.onset * SR)) : x.length;
  const end = Math.min(
    x.length,
    hitEnd,
    start + Math.round(trim * SR),
    (endBlock + 1) * BLOCK + Math.round(0.02 * SR),
  );
  const y = x.slice(start, end);
  const fi = Math.round(0.0015 * SR);
  const fo = Math.min(Math.round((trim > 1 ? 0.12 : 0.05) * SR), y.length);
  for (let i = 0; i < fi && i < y.length; i++) y[i] *= i / fi;
  for (let i = 0; i < fo; i++) y[y.length - 1 - i] *= i / fo;
  return y;
}

function build() {
  for (const cue of cues) {
    for (let n = 1; n <= cue.keep; n++) {
      const source = join(SOURCES, `${cue.key}_${n}.source.mp3`);
      if (!existsSync(source)) throw new Error(`missing raw master ${source}`);
      const y = tighten(decode(source), cue.trim, cue.singleHit === true);
      const tmp = join(OUT_DIR, `.${cue.key}_${n}.${process.pid}.source.wav`);
      writeFileSync(tmp, wav(y));
      try {
        // the standard generated-content conform: a short take to a -6 dBFS true
        // peak, a long one to -14 LUFS under the same peak ceiling, so the takes of
        // a cue land level-matched
        conformSfxAudio({
          inputFile: tmp,
          outputFile: join(OUT_DIR, `${cue.key}_${n}.mp3`),
          duration: y.length / SR,
          ffmpegPath: FFMPEG_PATH,
          channels: 1,
        });
      } finally {
        rmSync(tmp, { force: true });
      }
      console.log(`built ${cue.key}_${n}.mp3 (${(y.length / SR).toFixed(2)} s)`);
    }
  }
}

function select() {
  mkdirSync(SOURCES, { recursive: true });
  const report = {};
  for (const cue of cues) {
    const dir = join(WORK, cue.key);
    const files = readdirSync(dir)
      .filter((f) => /^cand_\d+\.mp3$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    const rows = files.map((f) => {
      // audition the take as it would ship: trimmed to its first hit
      const m = measure(tighten(decode(join(dir, f)), cue.trim, cue.singleHit === true));
      return { file: f, score: score(cue.key, m), ...m };
    });
    const override = process.argv
      .filter((a) => a.startsWith(`${cue.key}=`))
      .map((a) =>
        a
          .split('=')[1]
          .split(',')
          .map((s) => `cand_${s.trim()}.mp3`),
      )[0];
    const ranked = [...rows].sort((a, b) => b.score - a.score);
    const kept = override ?? ranked.slice(0, cue.keep).map((r) => r.file);
    for (const [i, f] of kept.entries()) {
      copyFileSync(join(dir, f), join(SOURCES, `${cue.key}_${i + 1}.source.mp3`));
    }
    report[cue.key] = { kept, rows };
    console.log(`\n${cue.key}: kept ${kept.join(', ')}`);
    for (const r of rows) {
      console.log(
        `  ${r.file.padEnd(12)} score ${r.score.toFixed(2).padStart(6)}  onset ${r.onset.toFixed(3)}  attack ${String(r.attackMs).padStart(3)}ms  crest ${r.crest.toFixed(1).padStart(5)}  hits ${r.hits}  tail ${r.tail.toFixed(2)}  bright ${r.bright.toFixed(3)}  low ${r.low.toFixed(2)}  cover ${r.coverage.toFixed(2)}  clip ${r.clipped}`,
      );
    }
  }
  mkdirSync(WORK, { recursive: true });
  writeFileSync(join(WORK, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  build();
}

// --- Style directions (audition only, never shipped keys) ---------------------
// Candidates and the kept picks live in scripts/sfx/sources/gather/variants/
// <style>/; `styles-build` renders the kept ones, trimmed and conformed like a
// shipped take, into tmp/gather-strike-styles/<style>/<key>_<n>.mp3 for the
// styles demo (scripts/sfx/gather_styles_demo.mjs).
const VARIANTS = join(SOURCES, 'variants');
const STYLE_OUT = join(ROOT, 'tmp/gather-strike-styles');
const STRIKE_KEYS = ['impact_gather_pick', 'impact_gather_axe'];

async function stylesGenerate() {
  await usage();
  let seconds = 0;
  for (const [style, spec] of Object.entries(GATHER_STRIKE_STYLES)) {
    const dir = join(VARIANTS, style);
    mkdirSync(dir, { recursive: true });
    for (const key of STRIKE_KEYS) {
      const cue = { key: `${style}:${key}`, ...spec[key] };
      for (let i = 1; i <= STYLE_CANDIDATES; i++) {
        const file = join(dir, `${key}_cand_${i}.mp3`);
        if (existsSync(file)) continue;
        process.stdout.write(`gen ${style} ${key} #${i} (${cue.request}s)... `);
        writeFileSync(file, await generateOne(cue));
        seconds += cue.request;
        console.log('ok');
      }
    }
  }
  console.log(`requested ${seconds.toFixed(1)} s of audio`);
  await usage();
}

/** What a direction should sound like, measured: heavy wants low body and less
 *  treble, ringing a bright sustained head, crunchy a dense spread of debris. */
function styleScore(style, m) {
  const base = -(m.clipped > 20 ? 2 : 0) - (m.onset > 0.3 ? 1 : 0) - m.attackMs / 20;
  if (style === 'heavy') return base + 4 * m.low - 0.8 * m.bright + 0.5 * Math.log(m.crest);
  if (style === 'ringing') return base + 1.5 * m.bright + 2 * m.coverage;
  return base + 3 * m.coverage + 0.5 * m.bright;
}

function stylesSelect() {
  const kept = {};
  for (const [style, spec] of Object.entries(GATHER_STRIKE_STYLES)) {
    kept[style] = {};
    for (const key of STRIKE_KEYS) {
      const { trim, singleHit = true } = spec[key];
      const rows = [];
      for (let i = 1; i <= STYLE_CANDIDATES; i++) {
        const file = join(VARIANTS, style, `${key}_cand_${i}.mp3`);
        if (!existsSync(file)) continue;
        const m = measure(tighten(decode(file), trim, singleHit));
        rows.push({ i, score: styleScore(style, m), ...m });
      }
      const override = process.argv
        .filter((a) => a.startsWith(`${style}.${key}=`))
        .map((a) => a.split('=')[1].split(',').map(Number))[0];
      const picks =
        override ??
        [...rows]
          .sort((a, b) => b.score - a.score)
          .slice(0, STYLE_KEEP)
          .map((r) => r.i);
      kept[style][key] = picks;
      console.log(`\n${style} ${key}: kept ${picks.join(', ')}`);
      for (const r of rows) {
        console.log(
          `  cand_${r.i} score ${r.score.toFixed(2).padStart(6)}  attack ${String(r.attackMs).padStart(3)}ms  crest ${r.crest.toFixed(1).padStart(5)}  bright ${r.bright.toFixed(3)}  low ${r.low.toFixed(2)}  cover ${r.coverage.toFixed(2)}  clip ${r.clipped}`,
        );
      }
    }
  }
  writeFileSync(join(VARIANTS, 'kept.json'), `${JSON.stringify(kept, null, 2)}\n`);
  stylesBuild();
}

function stylesBuild() {
  const kept = JSON.parse(readFileSync(join(VARIANTS, 'kept.json'), 'utf8'));
  for (const [style, byKey] of Object.entries(kept)) {
    const dir = join(STYLE_OUT, style);
    mkdirSync(dir, { recursive: true });
    for (const [key, picks] of Object.entries(byKey)) {
      const { trim, singleHit = true } = GATHER_STRIKE_STYLES[style][key];
      picks.forEach((i, n) => {
        const y = tighten(decode(join(VARIANTS, style, `${key}_cand_${i}.mp3`)), trim, singleHit);
        const tmp = join(dir, `.${key}_${n + 1}.source.wav`);
        writeFileSync(tmp, wav(y));
        try {
          conformSfxAudio({
            inputFile: tmp,
            outputFile: join(dir, `${key}_${n + 1}.mp3`),
            duration: y.length / SR,
            ffmpegPath: FFMPEG_PATH,
            channels: 1,
          });
        } finally {
          rmSync(tmp, { force: true });
        }
        console.log(`built ${style}/${key}_${n + 1}.mp3 (${(y.length / SR).toFixed(2)} s)`);
      });
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (mode === 'generate') await generate();
  else if (mode === 'usage') await usage();
  else if (mode === 'build') build();
  else if (mode === 'styles-generate') await stylesGenerate();
  else if (mode === 'styles-select') stylesSelect();
  else if (mode === 'styles-build') stylesBuild();
  else select();
}
