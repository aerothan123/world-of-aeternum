// Original Wyndlewood replacements for inherited CC BY-NC sound effects (prompts in
// rights_replacement_prompts.mjs). Each key gets ONE ElevenLabs take holding several separated
// instances; build slices it on its onsets into exactly the variant files the key already ships
// (public/audio/sfx/<key>.mp3 or <key>_<n>.mp3), conformed like every generated one-shot, so
// ids, paths and counts stay stable.
//
//   ELEVENLABS_API_KEY=... node scripts/sfx/rights_replacement_sfx.mjs generate [--only k1,k2]
//       one take per key into scripts/sfx/sources/rights/<key>.source.mp3 (kept, never
//       regenerated), stamped with date and plan tier in takes.json; stops while the account
//       still has RESERVE characters left
//   node scripts/sfx/rights_replacement_sfx.mjs build [--only k1,k2]
//       slices and conforms every take over the key's shipped files; with RIGHTS_ARCHIVE set,
//       copies each replaced original there first (outside the repo)
//   then: npm run sfx:manifest
import { execFileSync, spawnSync } from 'node:child_process';
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
import { RIGHTS_SFX_PROMPTS } from './rights_replacement_prompts.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT_DIR = join(ROOT, 'public/audio/sfx');
const SOURCES = join(ROOT, 'scripts/sfx/sources/rights');
const TAKES = join(SOURCES, 'takes.json');
const ARCHIVE = process.env.RIGHTS_ARCHIVE ?? null;
const API = 'https://api.elevenlabs.io';
const SR = 44100;
const PROMPT_INFLUENCE = 0.5;
/** Characters left on the account below which generate stops (shared with the music crew). */
const RESERVE = 2500;

const mode = process.argv[2] ?? 'build';
const i = process.argv.indexOf('--only');
const only = i >= 0 ? process.argv[i + 1].split(',') : null;
const cues = RIGHTS_SFX_PROMPTS.filter((c) => !only || only.includes(c.key));

async function subscription() {
  const res = await fetch(`${API}/v1/user/subscription`, {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
  });
  if (!res.ok) return null;
  const s = await res.json();
  return { used: s.character_count, limit: s.character_limit, tier: s.tier };
}

async function generateOne(cue) {
  const body = {
    text: cue.prompt,
    duration_seconds: cue.request,
    prompt_influence: PROMPT_INFLUENCE,
  };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/v1/sound-generation?output_format=mp3_44100_192`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const detail = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${cue.key} -> ${res.status} ${detail.slice(0, 200)}`);
  }
}

function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function generate() {
  mkdirSync(SOURCES, { recursive: true });
  const takes = existsSync(TAKES) ? JSON.parse(readFileSync(TAKES, 'utf8')) : {};
  for (const cue of cues) {
    const file = join(SOURCES, `${cue.key}.source.mp3`);
    if (existsSync(file)) continue;
    const s = await subscription();
    if (s && s.limit - s.used < RESERVE) {
      console.log(
        `STOP: ${s.limit - s.used} characters left (reserve ${RESERVE}), ${cue.key} not generated`,
      );
      break;
    }
    writeFileSync(file, await generateOne(cue));
    takes[cue.key] = {
      generated: localDate(),
      tier: s?.tier ?? 'unknown',
      format: 'mp3_44100_192',
      prompt: cue.prompt,
    };
    writeFileSync(TAKES, `${JSON.stringify(takes, null, 2)}\n`);
    console.log(`gen ${cue.key} (${cue.request}s) usage before ${s?.used}/${s?.limit}`);
  }
  const s = await subscription();
  console.log(`usage now ${s?.used} / ${s?.limit} (tier ${s?.tier})`);
}

function decode(file, channels) {
  const raw = execFileSync(
    FFMPEG_PATH,
    [
      '-v',
      'error',
      '-i',
      file,
      '-f',
      'f32le',
      '-ac',
      String(channels),
      '-ar',
      String(SR),
      'pipe:1',
    ],
    { maxBuffer: 1 << 28 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

function channelsOf(file) {
  const p = spawnSync(FFMPEG_PATH, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  return /\bmono\b/.test(String(p.stderr)) ? 1 : 2;
}

function wav(inter, channels) {
  const buf = Buffer.alloc(44 + inter.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + inter.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(inter.length * 2, 40);
  for (let k = 0; k < inter.length; k++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, inter[k])) * 32767), 44 + k * 2);
  return buf;
}

/** The shipped files of a key, in variant order. */
function shippedFiles(key) {
  const re = new RegExp(`^${key}(_(\\d+))?\\.mp3$`);
  return readdirSync(OUT_DIR)
    .map((f) => [f, f.match(re)])
    .filter(([, m]) => m)
    .sort((a, b) => Number(a[1][2] ?? 0) - Number(b[1][2] ?? 0))
    .map(([f]) => f);
}

/** Onset segments of a take (interleaved, `ch` channels): [start, end) sample frames, by an
 *  envelope 26 dB under the take's peak to open and 40 dB under it, held 40 ms, to close. */
function segments(x, ch) {
  const n = x.length / ch;
  const B = Math.round(SR * 0.005);
  const env = [];
  for (let b = 0; b * B < n; b++) {
    let s = 0;
    for (let f = b * B; f < Math.min(n, (b + 1) * B); f++)
      for (let c = 0; c < ch; c++) s += x[f * ch + c] ** 2;
    env.push(Math.sqrt(s / (B * ch)));
  }
  const peak = Math.max(...env);
  const on = peak * 10 ** (-26 / 20);
  const off = peak * 10 ** (-40 / 20);
  const hold = 8;
  const out = [];
  let b = 0;
  while (b < env.length) {
    while (b < env.length && env[b] < on) b++;
    if (b >= env.length) break;
    let a = b;
    while (a > 0 && env[a - 1] > off && b - a < 10) a--;
    let e = b;
    let quiet = 0;
    let segPeak = 0;
    while (e < env.length && quiet < hold) {
      segPeak = Math.max(segPeak, env[e]);
      quiet = env[e] < Math.max(off, segPeak * 0.02) ? quiet + 1 : 0;
      e++;
    }
    out.push({
      start: Math.max(0, a * B - Math.round(SR * 0.004)),
      end: Math.min(n, (e - hold) * B + Math.round(SR * 0.03)),
      peak: segPeak,
    });
    b = e;
  }
  return out;
}

function cut(x, ch, seg, maxLen) {
  const len = Math.min(seg.end - seg.start, Math.round(maxLen * SR));
  const y = x.slice(seg.start * ch, (seg.start + len) * ch);
  const fi = Math.round(SR * 0.002);
  const fo = Math.min(Math.round(SR * 0.03), len);
  for (let f = 0; f < len; f++) {
    const g = Math.min(1, f / fi, (len - 1 - f) / fo);
    for (let c = 0; c < ch; c++) y[f * ch + c] *= Math.max(0, g);
  }
  return y;
}

/** Playback-rate factors for repeated slices (a repeat is never an identical file). */
const PITCH = [0.94, 1.06, 0.9, 1.1];

/** Resample interleaved audio by `rate` (above 1 is higher and shorter), linear. */
function repitch(x, ch, rate) {
  const n = x.length / ch;
  const m = Math.floor((n - 1) / rate);
  const y = new Float32Array(m * ch);
  for (let f = 0; f < m; f++) {
    const p = f * rate;
    const a = Math.floor(p);
    const t = p - a;
    for (let c = 0; c < ch; c++)
      y[f * ch + c] = x[a * ch + c] * (1 - t) + x[Math.min(n - 1, a + 1) * ch + c] * t;
  }
  return y;
}

function build() {
  const report = {};
  for (const cue of cues) {
    const src = join(SOURCES, `${cue.key}.source.mp3`);
    const files = shippedFiles(cue.key);
    if (!existsSync(src) || files.length === 0) {
      console.log(`skip ${cue.key} (${existsSync(src) ? 'no shipped files' : 'no take'})`);
      continue;
    }
    const origOf = (f) =>
      ARCHIVE && existsSync(join(ARCHIVE, f)) ? join(ARCHIVE, f) : join(OUT_DIR, f);
    const ch = channelsOf(origOf(files[0]));
    const longest = Math.max(...files.map((f) => decode(origOf(f), 1).length / SR));
    const x = decode(src, ch);
    let segs = segments(x, ch);
    // keep the loudest well-formed instances, in take order
    segs = segs.filter((s) => s.end - s.start > SR * 0.04);
    const usable = cue.single
      ? [{ start: segs[0]?.start ?? 0, end: x.length / ch, peak: 1 }]
      : [...segs]
          .sort((a, b) => b.peak - a.peak)
          .slice(0, files.length)
          .sort((a, b) => a.start - b.start);
    const maxLen = cue.single ? cue.request : Math.max(0.25, longest * 1.6);
    if (ARCHIVE) mkdirSync(ARCHIVE, { recursive: true });
    files.forEach((f, n) => {
      const seg = usable[n % usable.length];
      if (ARCHIVE && !existsSync(join(ARCHIVE, f)))
        copyFileSync(join(OUT_DIR, f), join(ARCHIVE, f));
      // a take with fewer instances than files: the repeats become pitch variants
      const reuse = Math.floor(n / usable.length);
      let y = cut(x, ch, seg, maxLen);
      if (reuse > 0) y = repitch(y, ch, PITCH[(reuse - 1 + n) % PITCH.length]);
      const tmp = join(OUT_DIR, `.${f}.${process.pid}.wav`);
      writeFileSync(tmp, wav(y, ch));
      try {
        conformSfxAudio({
          inputFile: tmp,
          outputFile: join(OUT_DIR, f),
          duration: y.length / ch / SR,
          ffmpegPath: FFMPEG_PATH,
          channels: ch,
        });
      } finally {
        rmSync(tmp, { force: true });
      }
    });
    report[cue.key] = {
      files: files.length,
      instances: segs.length,
      reused: Math.max(0, files.length - usable.length),
    };
    console.log(
      `built ${cue.key}: ${files.length} files from ${segs.length} instances${usable.length < files.length ? ` (REUSED ${files.length - usable.length})` : ''}, ${ch} ch`,
    );
  }
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (mode === 'generate') await generate();
  else if (mode === 'build') build();
  else throw new Error(`unknown mode ${mode}`);
}
