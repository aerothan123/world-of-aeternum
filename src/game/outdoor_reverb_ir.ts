// The outdoor reverb's impulse responses: the natural echo a pickaxe strike or
// an axe bite rings out with across a valley, off a cliff face, under a forest
// canopy, or inside a cave. Pure and deterministic (a fixed seed per profile,
// no clock, no Math.random), so the runtime send (outdoor_reverb_bus.ts) and the
// offline demo render (scripts/sfx/gather_reverb_demo.mjs) convolve with the
// exact same response. Original synthesis, no recorded or third-party IR.
//
// Each response is two layers, energy-normalized so a profile's wet level is
// set only by the send that feeds it (gather_strike_mix.ts):
//   * discrete ECHOES: band-limited slaps off the terrain (the treeline, the far
//     valley wall, a cliff), each later one darker (air absorption), panned so
//     the reflections come back from around the listener;
//   * a diffuse TAIL: decorrelated noise per channel under an exponential decay
//     (the profile's RT60), whose low-pass cutoff falls as it rings out, the
//     way a real outdoor tail loses its highs first.

/** The acoustic space a strike rings out in (gather_strike_mix.ts reverbEnvFor). */
export type ReverbEnv = 'open' | 'forest' | 'cliffs' | 'cave';

export interface ReverbEcho {
  /** Seconds after the dry hit. */
  readonly at: number;
  /** Relative level against the profile's other echoes. */
  readonly gain: number;
  /** -1 (left) to 1 (right). */
  readonly pan: number;
}

export interface ReverbProfile {
  /** Seconds before the diffuse tail starts. */
  readonly predelay: number;
  /** RT60 of the diffuse tail, seconds. */
  readonly decay: number;
  /** Tail low-pass cutoff at its start, Hz. */
  readonly brightHz: number;
  /** Tail low-pass cutoff one decay later, Hz. */
  readonly darkHz: number;
  readonly echoes: readonly ReverbEcho[];
  /** Share (0..1) of the response's energy carried by the discrete echoes. */
  readonly echoShare: number;
  /** Base wet send of a close strike (gather_strike_mix.ts scales it). */
  readonly send: number;
  readonly seed: number;
}

export const REVERB_PROFILES: Readonly<Record<ReverbEnv, ReverbProfile>> = Object.freeze({
  // A meadow valley: a treeline slap and the far hillside answering, a long soft tail.
  open: {
    predelay: 0.024,
    decay: 1.7,
    brightHz: 6200,
    darkHz: 1500,
    echoes: [
      { at: 0.105, gain: 1, pan: -0.35 },
      { at: 0.235, gain: 0.72, pan: 0.45 },
      { at: 0.42, gain: 0.5, pan: -0.15 },
      { at: 0.68, gain: 0.32, pan: 0.3 },
    ],
    echoShare: 0.45,
    send: 0.6,
    seed: 0x0a11ee,
  },
  // Mountains, canyons, quarries: hard rock walls throw back clear, spaced echoes.
  cliffs: {
    predelay: 0.03,
    decay: 2.4,
    brightHz: 7200,
    darkHz: 1800,
    echoes: [
      { at: 0.16, gain: 1, pan: -0.55 },
      { at: 0.34, gain: 0.8, pan: 0.6 },
      { at: 0.55, gain: 0.58, pan: -0.3 },
      { at: 0.83, gain: 0.4, pan: 0.4 },
      { at: 1.16, gain: 0.25, pan: -0.2 },
    ],
    echoShare: 0.55,
    send: 0.78,
    seed: 0xc11ff5,
  },
  // Dense trees: many small, close scatters, heavily damped, short and soft.
  forest: {
    predelay: 0.012,
    decay: 0.95,
    brightHz: 3600,
    darkHz: 900,
    echoes: [
      { at: 0.034, gain: 1, pan: 0.4 },
      { at: 0.057, gain: 0.8, pan: -0.5 },
      { at: 0.082, gain: 0.7, pan: 0.2 },
      { at: 0.118, gain: 0.5, pan: -0.25 },
      { at: 0.19, gain: 0.3, pan: 0.35 },
    ],
    echoShare: 0.25,
    send: 0.34,
    seed: 0xf0e575,
  },
  // A cave or a mine: dense early reflections off near walls and a long bright tail.
  cave: {
    predelay: 0.008,
    decay: 2.9,
    brightHz: 7800,
    darkHz: 2400,
    echoes: [
      { at: 0.014, gain: 1, pan: -0.6 },
      { at: 0.027, gain: 0.9, pan: 0.6 },
      { at: 0.041, gain: 0.75, pan: -0.2 },
      { at: 0.06, gain: 0.6, pan: 0.3 },
      { at: 0.088, gain: 0.45, pan: -0.45 },
    ],
    echoShare: 0.25,
    send: 0.72,
    seed: 0xca7e,
  },
});

/** The longest response any profile produces, seconds (a hard bound on cost). */
export const REVERB_IR_MAX_SECONDS = 3.6;

/** The response length of a profile: its diffuse tail down to silence, or its
 *  last echo plus that echo's smear, whichever is later, capped. */
export function reverbIrSeconds(p: ReverbProfile): number {
  const lastEcho = p.echoes.reduce((max, e) => Math.max(max, e.at), 0);
  return Math.min(REVERB_IR_MAX_SECONDS, Math.max(p.predelay + p.decay * 1.05, lastEcho + 0.25));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The coefficient of a one-pole low-pass at `hz`. */
function onePole(hz: number, sampleRate: number): number {
  return 1 - Math.exp((-2 * Math.PI * Math.min(hz, sampleRate * 0.45)) / sampleRate);
}

function energyOf(channels: readonly Float32Array[]): number {
  let sum = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
  return sum;
}

/**
 * The stereo impulse response of `env` at `sampleRate`: [left, right], each
 * channel at unit energy (a unit impulse through it carries the same energy
 * out as in), so the send alone decides how loud the echo is.
 */
export function outdoorImpulseResponse(
  env: ReverbEnv,
  sampleRate: number,
): [Float32Array, Float32Array] {
  const p = REVERB_PROFILES[env];
  const len = Math.max(1, Math.round(reverbIrSeconds(p) * sampleRate));
  const tail = [new Float32Array(len), new Float32Array(len)];
  const echo = [new Float32Array(len), new Float32Array(len)];
  for (let ch = 0; ch < 2; ch++) {
    const rand = mulberry32(p.seed + ch * 7919);
    // Diffuse tail: decorrelated noise, two-pole low-passed with a falling cutoff.
    const start = Math.round(p.predelay * sampleRate);
    let lp1 = 0;
    let lp2 = 0;
    for (let i = start; i < len; i++) {
      const t = (i - start) / sampleRate;
      const amp = Math.exp((-6.9078 * t) / p.decay) * Math.min(1, t / 0.035);
      const hz = p.brightHz * (p.darkHz / p.brightHz) ** Math.min(1.5, t / p.decay);
      const a = onePole(hz, sampleRate);
      lp1 += a * (rand() * 2 - 1 - lp1);
      lp2 += a * (lp1 - lp2);
      tail[ch][i] = lp2 * amp;
    }
    // Discrete echoes: an impulse with a short noise smear, darker the later it comes.
    p.echoes.forEach((e, k) => {
      const theta = ((Math.min(1, Math.max(-1, e.pan)) + 1) * Math.PI) / 4;
      const g = e.gain * (ch === 0 ? Math.cos(theta) : Math.sin(theta)) * Math.SQRT2;
      // The far ear hears a side reflection a few milliseconds later.
      const lag = (ch === 0 ? Math.max(0, e.pan) : Math.max(0, -e.pan)) * 0.004;
      const at = Math.round((e.at + lag) * sampleRate);
      const smear = 0.004 + 0.006 * k;
      const span = Math.round(smear * 5 * sampleRate);
      const a = onePole(9500 * 0.74 ** k, sampleRate);
      let l1 = 0;
      let l2 = 0;
      for (let j = 0; j < span && at + j < len; j++) {
        const t = j / sampleRate;
        const x = (j === 0 ? 1 : 0) + (rand() * 2 - 1) * 0.12 * Math.exp(-t / smear);
        l1 += a * (x - l1);
        l2 += a * (l1 - l2);
        echo[ch][at + j] += l2 * g;
      }
    });
  }
  const eTail = energyOf(tail);
  const eEcho = energyOf(echo);
  const kTail = eTail > 0 ? Math.sqrt((2 * (1 - p.echoShare)) / eTail) : 0;
  const kEcho = eEcho > 0 ? Math.sqrt((2 * p.echoShare) / eEcho) : 0;
  const out: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  for (let ch = 0; ch < 2; ch++) {
    for (let i = 0; i < len; i++) out[ch][i] = tail[ch][i] * kTail + echo[ch][i] * kEcho;
  }
  // The two layers overlap, so their sum carries a small cross term: settle the
  // whole response on exactly unit energy per channel (on average).
  const eOut = energyOf(out);
  const k = eOut > 0 ? Math.sqrt(2 / eOut) : 0;
  for (const ch of out) for (let i = 0; i < len; i++) ch[i] *= k;
  return out;
}
