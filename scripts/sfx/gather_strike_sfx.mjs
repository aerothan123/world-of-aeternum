// Gathering's own strike sounds, synthesized here from first principles (no
// recording, no generator, no third-party sample): modal oscillator banks for
// the ringing steel and stone, seeded noise through RBJ biquads for the crack,
// the debris and the wood fibre, written as 44.1 kHz mono masters and conformed
// to the repo's asset standard (scripts/sfx/conform_audio.mjs) into
// public/audio/sfx/<key>_<n>.mp3.
//
//   node scripts/sfx/gather_strike_sfx.mjs [--only <key>]
//   then: npm run sfx:manifest
//
// The cues (every one DRY: the outdoor echo is added at runtime by the shared
// reverb send, src/game/outdoor_reverb_bus.ts, so it can grow with distance and
// follow the space the listener stands in):
//   impact_gather_pick  a pickaxe biting stone: a bright steel tick, the pick
//                       head ringing, the rock cracking and a few chips falling
//   impact_gather_axe   an axe biting a trunk: a dense woody thunk, the fibre
//                       crack and a couple of chips
//   impact_tree_creak   a felled tree letting go: the trunk groaning as its
//                       fibres tear, faster and faster, the crown starting to
//                       sweep the air, a final split
//   impact_tree_crash   it lands: a deep body thud, the crown's branches
//                       crunching and the leaves thrashing, a smaller rebound
//
// Deterministic: a fixed seed per take (mulberry32), no clock. Original work,
// recorded in CREDITS.md.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conformSfxAudio } from './conform_audio.mjs';
import { FFMPEG_PATH } from './ffmpeg_paths.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT_DIR = join(ROOT, 'public/audio/sfx');
const SR = 44100;
const TAU = Math.PI * 2;

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

/** An RBJ biquad (lowpass, highpass, bandpass), its centre movable per sample. */
function biquad(type) {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x, freq, q = Math.SQRT1_2) => {
    const w = (TAU * Math.min(freq, SR * 0.45)) / SR;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0;
    let b1;
    let b2;
    if (type === 'lp') {
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
    } else if (type === 'hp') {
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    const a1 = -2 * cw;
    const a2 = 1 - alpha;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

const env = (t, attack, decay) =>
  t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / decay);

/** A pitch-dropping sine thump: the body of an impact. */
function thump(t, f0, f1, drop, decay) {
  if (t < 0) return 0;
  const phase = TAU * (f1 * t + (f0 - f1) * drop * (1 - Math.exp(-t / drop)));
  return Math.sin(phase) * env(t, 0.002, decay);
}

/** A bank of decaying sine modes (a struck bar, plate or log): [freq, amp, decay]. */
function modes(t, bank, phases) {
  if (t < 0) return 0;
  let s = 0;
  for (let i = 0; i < bank.length; i++) {
    const [f, a, d] = bank[i];
    s += Math.sin(TAU * f * t + phases[i]) * a * Math.exp(-t / d);
  }
  return s;
}

/** Sparse grit: random clicks at `rate` per second, each a short decaying burst. */
function makeGrit(rand) {
  let level = 0;
  return (rate, size) => {
    if (rand() < rate / SR) level = size * (0.4 + rand() * 0.6) * (rand() < 0.5 ? -1 : 1);
    level *= 0.93;
    return level * (rand() * 2 - 1);
  };
}

function render(dur, fn) {
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}

/** A short fade at both ends so no take starts or stops on a click. */
function edges(samples, fadeIn = 0.0008, fadeOut = 0.03) {
  const fi = Math.round(fadeIn * SR);
  const fo = Math.round(fadeOut * SR);
  for (let i = 0; i < fi && i < samples.length; i++) samples[i] *= i / fi;
  for (let i = 0; i < fo && i < samples.length; i++) samples[samples.length - 1 - i] *= i / fo;
  return samples;
}

/** Pick on stone. Variant `v` shifts the steel's pitch, the rock's grain and the debris. */
function pickStrike(v) {
  const rand = rng(0x51c4 + v * 977);
  const steelF = [2180, 2420, 1980, 2310][v % 4];
  // free-free bar ratios for the pick head: 1 : 2.756 : 5.404 : 8.933
  // (a near-twin of the fundamental beats against it: a real head never rings pure)
  const steel = [
    [steelF, 0.24, 0.075],
    [steelF * 1.0045, 0.09, 0.06],
    [steelF * 2.756, 0.17, 0.035],
    [steelF * 5.404, 0.08, 0.018],
    [steelF * 8.933 * 0.5, 0.05, 0.022],
  ];
  const stoneF = [620, 540, 700, 580][v % 4];
  const stone = [
    [stoneF, 0.18, 0.03],
    [stoneF * 1.71, 0.12, 0.022],
    [stoneF * 2.93, 0.08, 0.015],
  ];
  const ps = steel.map(() => rand() * TAU);
  const pr = stone.map(() => rand() * TAU);
  const crackBp = biquad('bp');
  const tickHp = biquad('hp');
  const bodyLp = biquad('lp');
  const debrisBp = biquad('bp');
  const crumbleBp = biquad('bp');
  const grit = makeGrit(rand);
  const chips = Array.from({ length: 4 + (v % 3) }, () => ({
    at: 0.07 + rand() * 0.28,
    f: 2500 + rand() * 3500,
    a: 0.06 + rand() * 0.1,
  }));
  return edges(
    render(0.55, (t) => {
      const n = rand() * 2 - 1;
      const tick = tickHp(n, 4200, 0.8) * env(t, 0.0002, 0.0025) * 1.6;
      const ring = modes(t - 0.0006, steel, ps);
      const rock = modes(t, stone, pr);
      const crack =
        crackBp(n, 2600 - 900 * Math.min(1, t / 0.05), 1.1) * env(t, 0.0004, 0.018) * 1.5;
      const crumble =
        crumbleBp(grit(t < 0.09 ? 900 * Math.exp(-t / 0.04) : 0, 0.9), 3000, 0.8) * 1.6;
      const body =
        thump(t, 240, 105, 0.012, 0.055) * 0.55 + bodyLp(n, 500) * env(t, 0.001, 0.04) * 0.6;
      let debris = 0;
      for (const c of chips) {
        const dt = t - c.at;
        if (dt >= 0 && dt < 0.03) debris += Math.sin(TAU * c.f * dt) * c.a * Math.exp(-dt / 0.006);
      }
      const trickle = debrisBp(n, 3200, 1.2) * 0.05 * env(t - 0.05, 0.02, 0.12);
      return tick + ring + rock + crack + crumble * 0.6 + body + debris + trickle;
    }),
  );
}

/** Axe into a trunk. Variant `v` shifts the trunk's resonance, the bite and the chips. */
function axeStrike(v) {
  const rand = rng(0xa8e + v * 1213);
  const woodF = [182, 165, 198, 172][v % 4];
  const log = [
    [woodF * 2.2, 0.3, 0.05],
    [woodF * 5.3, 0.16, 0.03],
    [woodF * 8.9, 0.08, 0.018],
  ];
  const pl = log.map(() => rand() * TAU);
  const bodyBp = biquad('bp');
  const biteHp = biquad('hp');
  const fibreBp = biquad('bp');
  const chipBp = biquad('bp');
  const grit = makeGrit(rand);
  const chips = Array.from({ length: 2 + (v % 2) }, () => ({
    at: 0.06 + rand() * 0.16,
    a: 0.08 + rand() * 0.08,
  }));
  return edges(
    render(0.5, (t) => {
      const n = rand() * 2 - 1;
      const thunk = thump(t, woodF * 1.15, woodF * 0.5, 0.02, 0.085) * 0.9;
      const resonance = bodyBp(n, 480 + 60 * (v % 3), 3.5) * env(t, 0.001, 0.06) * 1.3;
      const grain = modes(t, log, pl);
      const bite = biteHp(n, 3500, 0.9) * env(t, 0.0003, 0.006) * 1.1;
      const fibre = fibreBp(n, 2300, 1.6) * env(t - 0.004, 0.002, 0.03) * 0.7;
      const splinter = grit(t < 0.05 ? 600 * Math.exp(-t / 0.02) : 0, 0.6);
      const edge = Math.sin(TAU * 3150 * t) * 0.05 * env(t, 0.0003, 0.012);
      let chip = 0;
      for (const c of chips) chip += chipBp(n, 1800, 2) * c.a * env(t - c.at, 0.001, 0.015);
      return thunk + resonance + grain + bite + fibre + splinter * 0.5 + edge + chip;
    }),
  );
}

/** A felled tree letting go: accelerating stick-slip creaks into a final split. */
function treeCreak(v) {
  const rand = rng(0xc7ea + v * 331);
  const dur = 1.45;
  const r1 = biquad('bp');
  const r2 = biquad('bp');
  const r3 = biquad('bp');
  const rustle = biquad('hp');
  const splitBp = biquad('bp');
  const fibreBp = biquad('bp');
  const grit = makeGrit(rand);
  let phase = 0;
  let pulse = 0;
  const base = [0.95, 1.08][v % 2];
  return edges(
    render(dur, (t) => {
      const u = t / dur;
      const n = rand() * 2 - 1;
      // stick-slip: the slip rate falls from a groan to slow cracks as the trunk gives
      const rate = (28 - 16 * u) * (1 + (rand() - 0.5) * 0.5);
      phase += rate / SR;
      if (phase >= 1) {
        phase -= 1;
        pulse = 0.6 + rand() * 0.4;
      }
      pulse *= 0.985;
      const exc = pulse * (rand() * 0.6 + 0.4);
      const swell = Math.min(1, t / 0.25) * (0.5 + 0.5 * u);
      const groan =
        (r1(exc, 260 * base, 9) * 1.2 +
          r2(exc, 640 * base, 8) * 0.8 +
          r3(exc, 1220 * base, 7) * 0.45) *
        swell;
      // fibres snapping: band-limited ticks, sparse at first and racing near the end
      const fibres = fibreBp(grit(40 + 500 * u ** 2, 0.5), 1500, 1.2) * 1.4;
      const air = rustle(n, 2500, 0.7) * 0.035 * u ** 2;
      const split = splitBp(n, 1800, 0.9) * env(t - dur * 0.86, 0.002, 0.05) * 1.6;
      const splitBody = thump(t - dur * 0.86, 160, 70, 0.02, 0.09) * 0.6;
      return groan * 0.9 + fibres + air + split + splitBody;
    }),
    0.01,
    0.08,
  );
}

/** A felled tree landing: a deep thud, the crown crunching and thrashing, a rebound. */
function treeCrash(v) {
  const rand = rng(0xc4a5 + v * 557);
  const dur = 1.9;
  const bodyLp = biquad('lp');
  const crunchBp = biquad('bp');
  const leavesBp = biquad('bp');
  const reboundLp = biquad('lp');
  const branchBp = biquad('bp');
  const settleBp = biquad('bp');
  const grit = makeGrit(rand);
  const grit2 = makeGrit(rand);
  const bounce = 0.45; // tree_felling_core TREE_BOUNCE_SECONDS: the rebound off the ground
  const low = [62, 56][v % 2];
  return edges(
    render(dur, (t) => {
      const n = rand() * 2 - 1;
      const thud = thump(t, low * 1.6, low * 0.6, 0.04, 0.32) * 1.1;
      const body = bodyLp(n, 700) * env(t, 0.003, 0.22) * 1.2;
      const crunch = crunchBp(n, 1600 + 900 * Math.exp(-t / 0.2), 0.8) * env(t, 0.004, 0.35) * 0.55;
      const branches =
        branchBp(grit(t < 0.9 ? 1400 * Math.exp(-t / 0.3) : 0, 0.9), 1700, 0.7) * 1.1;
      const leaves = leavesBp(n, 3600, 0.6) * env(t, 0.02, 0.3) * 0.3;
      const rb = t - bounce;
      const rebound =
        thump(rb, low * 1.3, low * 0.6, 0.03, 0.18) * 0.45 +
        reboundLp(n, 500) * env(rb, 0.003, 0.12) * 0.4;
      const settle =
        settleBp(grit2(t > bounce ? 160 * Math.exp(-(t - bounce) / 0.4) : 0, 0.4), 1400, 0.8) * 0.6;
      return thud + body + crunch + branches + leaves + rebound + settle;
    }),
    0.0015,
    0.15,
  );
}

const CUES = {
  impact_gather_pick: [0, 1, 2, 3].map((v) => () => pickStrike(v)),
  impact_gather_axe: [0, 1, 2, 3].map((v) => () => axeStrike(v)),
  impact_tree_creak: [0, 1].map((v) => () => treeCreak(v)),
  impact_tree_crash: [0, 1].map((v) => () => treeCrash(v)),
};

/** 16-bit PCM mono WAV. */
export function wav(samples, sampleRate = SR) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const k = peak > 0 ? 0.9 / peak : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * k)) * 32767), 44 + i * 2);
  }
  return buf;
}

export const GATHER_STRIKE_SFX_KEYS = Object.keys(CUES);
export const GATHER_STRIKE_TAKES = Object.fromEntries(
  Object.entries(CUES).map(([key, takes]) => [key, takes.length]),
);

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? process.argv[onlyArg + 1] : null;
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [key, takes] of Object.entries(CUES)) {
    if (only && key !== only) continue;
    takes.forEach((make, index) => {
      const samples = make();
      const name = `${key}_${index + 1}`;
      const dest = join(OUT_DIR, `${name}.mp3`);
      const tmp = join(dirname(dest), `.${name}.${process.pid}.source.wav`);
      writeFileSync(tmp, wav(samples));
      try {
        conformSfxAudio({
          inputFile: tmp,
          outputFile: dest,
          duration: samples.length / SR,
          ffmpegPath: FFMPEG_PATH,
          channels: 1,
          // custom: true in the catalog: the synth's own mix is the master (peak-safe only)
          preserveLoudness: true,
        });
      } finally {
        rmSync(tmp, { force: true });
      }
      console.log(`wrote ${name}.mp3 (${(samples.length / SR).toFixed(2)} s)`);
    });
  }
}
