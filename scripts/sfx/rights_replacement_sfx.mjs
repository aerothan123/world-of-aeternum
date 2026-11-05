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
//   ELEVENLABS_API_KEY=... node scripts/sfx/rights_replacement_sfx.mjs extras [--only k1,k2]
//       one extra take per instance a key's take is short of (<key>.extra<n>.source.mp3);
//       build tops the variants up from them, so no variant is a repeat
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
import { RIGHTS_SFX_UPSTREAM } from './rights_replacement_prompts_upstream.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT_DIR = join(ROOT, 'public/audio/sfx');
const SOURCES = join(ROOT, 'scripts/sfx/sources/rights');
const TAKES = join(SOURCES, 'takes.json');
const ARCHIVE = process.env.RIGHTS_ARCHIVE ?? null;
const API = 'https://api.elevenlabs.io';
const SR = 44100;
const PROMPT_INFLUENCE = 0.5;
/** Characters left on the account below which generate stops (shared with the music crew). */
const RESERVE = Number(process.env.RIGHTS_RESERVE ?? 2500);
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

/** The prompt as sent: `{N}` becomes one more instance than the key ships (at least two). */
function promptFor(cue) {
  const n = Math.min(9, Math.max(2, shippedFiles(cue.key).length + 1));
  return cue.prompt.replace('{N}', WORDS[n]);
}

const mode = process.argv[2] ?? 'build';
const i = process.argv.indexOf('--only');
const only = i >= 0 ? process.argv[i + 1].split(',') : null;
const cues = [...RIGHTS_SFX_PROMPTS, ...RIGHTS_SFX_UPSTREAM].filter(
  (c) => !only || only.includes(c.key),
);

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
    text: promptFor(cue),
    duration_seconds: requestOf(cue),
    prompt_influence: PROMPT_INFLUENCE,
  };
  if (cue.loop) Object.assign(body, { loop: true, model_id: 'eleven_text_to_sound_v2' });
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
    if (shippedFiles(cue.key).length === 0) {
      console.log(`skip ${cue.key} (no shipped files)`);
      continue;
    }
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
      prompt: promptFor(cue),
    };
    writeFileSync(TAKES, `${JSON.stringify(takes, null, 2)}\n`);
    console.log(`gen ${cue.key} (${cue.request}s) usage before ${s?.used}/${s?.limit}`);
  }
  const s = await subscription();
  console.log(`usage now ${s?.used} / ${s?.limit} (tier ${s?.tier})`);
}

/** One extra take per instance a key's take is short of (counted as the build counts them). */
async function extras() {
  const takes = existsSync(TAKES) ? JSON.parse(readFileSync(TAKES, 'utf8')) : {};
  for (const cue of cues) {
    if (cue.single || cue.loop) continue;
    const src = join(SOURCES, `${cue.key}.source.mp3`);
    const files = shippedFiles(cue.key);
    if (!existsSync(src) || files.length < 2) continue;
    const have = segments(decode(src, 1), 1).filter((g) => g.end - g.start > SR * 0.04).length;
    for (let e = 1; e <= files.length - Math.min(have, files.length); e++) {
      const file = join(SOURCES, `${cue.key}.extra${e}.source.mp3`);
      if (existsSync(file)) continue;
      const sub = await subscription();
      if (sub && sub.limit - sub.used < RESERVE) {
        console.log(`STOP: ${sub.limit - sub.used} characters left (reserve ${RESERVE})`);
        return;
      }
      writeFileSync(file, await generateOne(cue));
      takes[`${cue.key}.extra${e}`] = {
        generated: localDate(),
        tier: sub?.tier ?? 'unknown',
        format: 'mp3_44100_192',
        prompt: promptFor(cue),
      };
      writeFileSync(TAKES, `${JSON.stringify(takes, null, 2)}\n`);
      console.log(`extra ${cue.key} #${e}`);
    }
  }
  const sub = await subscription();
  console.log(`usage now ${sub?.used} / ${sub?.limit} (tier ${sub?.tier})`);
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

/** The shortest clip the conform step accepts cleanly (seconds). */
const MIN_CUT = 0.12;

/** A slice of one instance: at least MIN_CUT, at least `keepLen` seconds (the length of the
 *  file it replaces, so the instance keeps its natural decay instead of ending where the onset
 *  envelope closes), at most `maxLen`, and never past `bound` (the next instance's onset). */
function cut(x, ch, seg, maxLen, keepLen = 0, bound = Number.POSITIVE_INFINITY) {
  const total = x.length / ch;
  const room = Math.max(Math.round(MIN_CUT * SR), Math.min(total, bound) - seg.start);
  const want = Math.max(
    Math.round(MIN_CUT * SR),
    Math.min(seg.end - seg.start, Math.round(maxLen * SR)),
    Math.min(Math.round(Math.min(keepLen, maxLen) * SR), room),
  );
  const start = Math.min(seg.start, Math.max(0, total - want));
  const len = Math.max(1, Math.min(want, total - start));
  const seg2 = { start };
  const y = x.slice(seg2.start * ch, (seg2.start + len) * ch);
  const fi = Math.round(SR * 0.002);
  const fo = Math.min(Math.round(SR * 0.03), len);
  for (let f = 0; f < len; f++) {
    const g = Math.min(1, f / fi, (len - 1 - f) / fo);
    for (let c = 0; c < ch; c++) y[f * ch + c] *= Math.max(0, g);
  }
  return y;
}

/** Seconds to ask for: a number as given, or 'auto', sized from the shipped clip it replaces
 *  (a loop at least 4 s, a multi-instance take room for one spare instance), 0.5 to 22 s. */
function requestOf(cue) {
  if (typeof cue.request === 'number') return cue.request;
  const files = shippedFiles(cue.key);
  const origOf = (f) =>
    ARCHIVE && existsSync(join(ARCHIVE, f)) ? join(ARCHIVE, f) : join(OUT_DIR, f);
  const longest = files.length
    ? Math.max(...files.map((f) => decode(origOf(f), 1).length / SR))
    : 2;
  const clamp = (v) => Math.round(Math.min(22, Math.max(0.5, v)) * 10) / 10;
  if (cue.loop) return clamp(Math.max(4, longest));
  if (files.length <= 1) return clamp(longest + 0.4);
  return clamp((files.length + 1) * (longest + 0.8));
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
    // a thin take is topped up from its extra takes (one fresh performance each)
    if (!cue.single && !cue.loop) {
      for (let e = 1; usable.length < files.length; e++) {
        const extra = join(SOURCES, `${cue.key}.extra${e}.source.mp3`);
        if (!existsSync(extra)) break;
        const xe = decode(extra, ch);
        const best = segments(xe, ch)
          .filter((g) => g.end - g.start > SR * 0.04)
          .sort((a, b) => b.peak - a.peak)[0];
        if (best) usable.push({ ...best, src: xe });
      }
    }
    const maxLen = cue.single ? requestOf(cue) : Math.max(0.25, longest * 1.6);
    // a slice may run on to the next instance this build uses from the same take, never into it
    const boundOf = (take, at) => {
      const next = usable
        .filter((g) => (g.src ?? x) === take && g.start > at)
        .reduce((m, g) => Math.min(m, g.start), Number.POSITIVE_INFINITY);
      return next === Number.POSITIVE_INFINITY ? next : next - Math.round(SR * 0.01);
    };
    if (ARCHIVE) mkdirSync(ARCHIVE, { recursive: true });
    files.forEach((f, n) => {
      const seg = usable[n % usable.length];
      if (ARCHIVE && !existsSync(join(ARCHIVE, f)))
        copyFileSync(join(OUT_DIR, f), join(ARCHIVE, f));
      // a take with fewer instances than files: the repeats become pitch variants
      const reuse = Math.floor(n / usable.length);
      // a seamless loop ships whole: no trim, no fades (the generator made it loop)
      const take = seg.src ?? x;
      const keepLen = cue.single ? 0 : decode(origOf(f), 1).length / SR;
      let y = cue.loop
        ? x.slice()
        : cut(take, ch, seg, maxLen, keepLen, cue.single ? undefined : boundOf(take, seg.start));
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
  else if (mode === 'extras') await extras();
  else throw new Error(`unknown mode ${mode}`);
}
