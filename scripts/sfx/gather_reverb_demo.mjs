// Offline listening demo of the gathering strikes through the SAME mix and
// reverb chain the game runs (src/game/gather_strike_mix.ts for the levels, the
// distance falloff, the air-absorption low-pass and the send; the stereo
// impulse responses of src/game/outdoor_reverb_ir.ts convolved exactly as the
// runtime ConvolverNode does with normalize off). Renders about 22 s:
//   0 to 5 s    a miner beside you, among cliffs
//   5 to 10 s   a miner across the canyon (58 yd): mostly echo
//   10 to 15 s  a woodcutter beside you, in an open valley
//   15 to 22 s  a woodcutter across the valley (52 yd), and his tree going over
//
//   node scripts/sfx/gather_reverb_demo.mjs [--out <dir>]
//
// Writes gather_reverb_demo.wav/.mp3 and a dry-only twin (the same mix with the
// send muted) for an A/B of what the reverb adds. Reads the shipped takes from
// public/audio/sfx (run scripts/sfx/gather_strike_sfx.mjs first).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { FFMPEG_PATH } from './ffmpeg_paths.mjs';
import { readSfxPlaybackProfile, resolveSfxPlaybackProfile } from './playback_profile.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SR = 44100;
const MASTER = 0.85 * 0.8; // sfx.ts SAMPLE_GAIN at the default 0.8 effects volume
const outArg = process.argv.indexOf('--out');
const OUT = outArg >= 0 ? process.argv[outArg + 1] : join(ROOT, 'tmp/gather-reverb-demo');

async function loadCores() {
  const result = await build({
    stdin: {
      contents:
        "export * from './src/game/outdoor_reverb_ir.ts';\nexport * from './src/game/gather_strike_mix.ts';",
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function decode(file) {
  const raw = execFileSync(
    FFMPEG_PATH,
    ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), 'pipe:1'],
    { maxBuffer: 1 << 28 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ low-pass, Butterworth Q (the dry path's BiquadFilterNode). */
function lowpass(x, hz) {
  const w = (2 * Math.PI * Math.min(hz, SR * 0.45)) / SR;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 - cw) / 2 / a0;
  const b1 = (1 - cw) / a0;
  const a1 = (-2 * cw) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** Playback at `rate` (linear interpolation), the AudioBufferSourceNode jitter. */
function resample(x, rate) {
  const n = Math.floor(x.length / rate);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const k = Math.floor(p);
    const f = p - k;
    y[i] = x[k] * (1 - f) + (x[k + 1] ?? 0) * f;
  }
  return y;
}

function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j];
        const ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br;
        im[i + j + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) re[i] /= n;
}

/** Linear convolution of a mono bus with one IR channel (FFT). */
function convolve(signal, ir, outLength) {
  let n = 1;
  while (n < signal.length + ir.length) n <<= 1;
  const sr = new Float64Array(n);
  const si = new Float64Array(n);
  const hr = new Float64Array(n);
  const hi = new Float64Array(n);
  sr.set(signal);
  hr.set(ir);
  fft(sr, si, false);
  fft(hr, hi, false);
  for (let i = 0; i < n; i++) {
    const r = sr[i] * hr[i] - si[i] * hi[i];
    si[i] = sr[i] * hi[i] + si[i] * hr[i];
    sr[i] = r;
  }
  fft(sr, si, true);
  return Float32Array.from(sr.subarray(0, outLength));
}

function wavStereo(left, right, scale) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i] * scale));
    const r = Math.max(-1, Math.min(1, right[i] * scale));
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  return buf;
}

const core = await loadCores();
const PLAYBACK = readSfxPlaybackProfile(ROOT);
const takes = {};
const takeCount = {
  impact_gather_pick: 4,
  impact_gather_axe: 4,
  impact_tree_creak: 2,
  impact_tree_crash: 2,
};
for (const [key, count] of Object.entries(takeCount)) {
  takes[key] = Array.from({ length: count }, (_, i) =>
    decode(join(ROOT, `public/audio/sfx/${key}_${i + 1}.mp3`)),
  );
}

// The scene: [time s, kind, distance yd, azimuth deg (-90 left .. 90 right), env]
const events = [];
for (let k = 0; k < 4; k++) events.push([0.4 + k * 1.15, 'mine', 7, -25, 'cliffs']);
for (let k = 0; k < 4; k++) events.push([5.4 + k * 1.15, 'mine', 58, 50, 'cliffs']);
for (let k = 0; k < 4; k++) events.push([10.6 + k * 1.0, 'chop', 6, 20, 'open']);
for (let k = 0; k < 3; k++) events.push([15.2 + k * 1.0, 'chop', 52, -55, 'open']);
events.push([17.9, 'tree_creak', 52, -50, 'open']);
events.push([17.9 + 1.5, 'tree_crash', 50, -45, 'open']); // tree_felling_core TREE_FALL_SECONDS
const DURATION = 22.5;
const N = Math.round(DURATION * SR);

const dryL = new Float32Array(N);
const dryR = new Float32Array(N);
const wet = { open: new Float32Array(N), cliffs: new Float32Array(N) };
const rand = rng(0x6a7e);
const lastTake = {};
for (const [time, kind, distance, azimuth, env] of events) {
  const mix = core.gatherStrikeMix(distance, env, kind);
  if (!mix) continue;
  const key = core.GATHER_STRIKE_SFX[kind];
  const pool = takes[key];
  // no-repeat random variant, like the runtime picker
  let pick = Math.floor(rand() * pool.length);
  if (pool.length > 1 && pick === lastTake[key]) pick = (pick + 1) % pool.length;
  lastTake[key] = pick;
  // playAt's jitter: +-6% rate, +-10% level
  const clip = resample(pool[pick], 1 + (rand() * 2 - 1) * 0.06);
  // the clip's resolved manifest gain (scripts/sfx/sfx_gain_map.json), as sfx.ts applies it
  const clipGain = resolveSfxPlaybackProfile(key, PLAYBACK).gain;
  const peak = mix.gain * clipGain * (1 + (rand() * 2 - 1) * 0.1);
  const dry = mix.lowpassHz < 18000 ? lowpass(clip, mix.lowpassHz) : clip;
  const fall = core.gatherDryFalloff(distance);
  const x = (Math.max(-90, Math.min(90, azimuth)) + 90) / 180;
  const gl = Math.cos((x * Math.PI) / 2) * fall * peak;
  const gr = Math.sin((x * Math.PI) / 2) * fall * peak;
  const at = Math.round(time * SR);
  const bus = wet[env];
  for (let i = 0; i < clip.length && at + i < N; i++) {
    dryL[at + i] += dry[i] * gl;
    dryR[at + i] += dry[i] * gr;
    bus[at + i] += dry[i] * peak * mix.send; // the send taps after the low-pass
  }
}

const outL = Float32Array.from(dryL);
const outR = Float32Array.from(dryR);
for (const env of Object.keys(wet)) {
  const [irL, irR] = core.outdoorImpulseResponse(env, SR);
  const l = convolve(wet[env], irL, N);
  const r = convolve(wet[env], irR, N);
  for (let i = 0; i < N; i++) {
    outL[i] += l[i];
    outR[i] += r[i];
  }
}

let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
// Master as the game plays it, then one common gain to -1 dBFS for listening
// (the same gain on both files, so the A/B compares like with like).
const scale = Math.min(1 / (peak * MASTER), 10) * MASTER * 0.891;
mkdirSync(OUT, { recursive: true });
for (const [name, l, r] of [
  ['gather_reverb_demo', outL, outR],
  ['gather_reverb_demo_dry', dryL, dryR],
]) {
  const wavPath = join(OUT, `${name}.wav`);
  writeFileSync(wavPath, wavStereo(l, r, scale));
  execFileSync(FFMPEG_PATH, [
    '-v',
    'error',
    '-y',
    '-i',
    wavPath,
    '-b:a',
    '192k',
    join(OUT, `${name}.mp3`),
  ]);
  console.log(`wrote ${join(OUT, name)}.wav/.mp3`);
}
