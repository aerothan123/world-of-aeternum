// The offline renderer behind the gathering listening demos
// (gather_reverb_demo.mjs, gather_styles_demo.mjs): it plays a scripted scene
// of strikes through the SAME mix and reverb chain the game runs
// (src/game/gather_strike_mix.ts for the levels, the distance falloff, the
// air-absorption low-pass and the send; the stereo impulse responses of
// src/game/outdoor_reverb_ir.ts convolved exactly as the runtime
// ConvolverNode does with normalize off; each clip's resolved manifest gain).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { FFMPEG_PATH } from './ffmpeg_paths.mjs';
import { readSfxPlaybackProfile, resolveSfxPlaybackProfile } from './playback_profile.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const SR = 44100;
const MASTER = 0.85 * 0.8; // sfx.ts SAMPLE_GAIN at the default 0.8 effects volume

/** The runtime's pure mix and impulse-response cores, bundled from src/game. */
export async function loadCores() {
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

export function decode(file) {
  const raw = execFileSync(
    FFMPEG_PATH,
    ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), 'pipe:1'],
    { maxBuffer: 1 << 28 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
}

export function rng(seed) {
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

/**
 * Mix a scene. Each event is { time, kind, distance, azimuth (-90 left .. 90
 * right), bus, pool, gainKey }: `pool` is the decoded takes to draw from (no
 * repeat, like the runtime picker), `gainKey` the catalog key whose manifest
 * gain applies, and `bus` names a reverb in `reverbs`: { mixEnv, ir: [l, r] },
 * where `mixEnv` is the environment the mix core sends for. Returns the wet
 * mix and its dry twin.
 */
export function mixScene(core, events, reverbs, duration, seed = 0x6a7e) {
  const playback = readSfxPlaybackProfile(ROOT);
  const N = Math.round(duration * SR);
  const dryL = new Float32Array(N);
  const dryR = new Float32Array(N);
  const wet = Object.fromEntries(Object.keys(reverbs).map((k) => [k, new Float32Array(N)]));
  const rand = rng(seed);
  const lastTake = new Map();
  for (const ev of events) {
    const mix = core.gatherStrikeMix(ev.distance, reverbs[ev.bus].mixEnv, ev.kind);
    if (!mix) continue;
    let pick = Math.floor(rand() * ev.pool.length);
    if (ev.pool.length > 1 && pick === lastTake.get(ev.pool)) pick = (pick + 1) % ev.pool.length;
    lastTake.set(ev.pool, pick);
    // playAt's jitter: +-6% rate, +-10% level
    const clip = resample(ev.pool[pick], 1 + (rand() * 2 - 1) * 0.06);
    const clipGain = resolveSfxPlaybackProfile(ev.gainKey, playback).gain;
    const peak = mix.gain * clipGain * (1 + (rand() * 2 - 1) * 0.1) * (reverbs[ev.bus].dry ?? 1);
    const send = mix.send * (reverbs[ev.bus].sendScale ?? 1);
    const dry = mix.lowpassHz < 18000 ? lowpass(clip, mix.lowpassHz) : clip;
    const fall = core.gatherDryFalloff(ev.distance);
    const x = (Math.max(-90, Math.min(90, ev.azimuth)) + 90) / 180;
    const gl = Math.cos((x * Math.PI) / 2) * fall * peak;
    const gr = Math.sin((x * Math.PI) / 2) * fall * peak;
    const at = Math.round(ev.time * SR);
    const bus = wet[ev.bus];
    for (let i = 0; i < clip.length && at + i < N; i++) {
      dryL[at + i] += dry[i] * gl;
      dryR[at + i] += dry[i] * gr;
      bus[at + i] += dry[i] * peak * send; // the send taps after the low-pass
    }
  }
  const outL = Float32Array.from(dryL);
  const outR = Float32Array.from(dryR);
  for (const [name, reverb] of Object.entries(reverbs)) {
    const l = convolve(wet[name], reverb.ir[0], N);
    const r = convolve(wet[name], reverb.ir[1], N);
    for (let i = 0; i < N; i++) {
      outL[i] += l[i];
      outR[i] += r[i];
    }
  }
  return { outL, outR, dryL, dryR };
}

/** Write stereo pairs as WAV and 192 kbps MP3, all at ONE common gain (master as
 *  the game plays it, then the loudest file to -1 dBFS), so they compare like for
 *  like. `files` is [[name, left, right], ...]. */
export function writeDemo(outDir, files) {
  let peak = 0;
  for (const [, l, r] of files) {
    for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  }
  const scale = Math.min(1 / (peak * MASTER), 10) * MASTER * 0.891;
  mkdirSync(outDir, { recursive: true });
  for (const [name, l, r] of files) {
    const wavPath = join(outDir, `${name}.wav`);
    writeFileSync(wavPath, wavStereo(l, r, scale));
    execFileSync(FFMPEG_PATH, [
      '-v',
      'error',
      '-y',
      '-i',
      wavPath,
      '-b:a',
      '192k',
      join(outDir, `${name}.mp3`),
    ]);
    console.log(`wrote ${join(outDir, name)}.wav/.mp3`);
  }
}
