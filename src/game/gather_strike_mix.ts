// How a gathering strike (a pick on stone, an axe in a trunk) or a felled
// tree's creak and crash is mixed for the listener: which clip, how far it
// carries, how much of it rings out through the outdoor reverb, how dark the
// direct sound gets with distance, and which of a small pool of strike voices
// it may take. Pure and DOM-free; `sfx.ts gatherStrike` is the thin WebAudio
// consumer and scripts/sfx/gather_reverb_demo.mjs renders the same mix offline.
//
// The shape of the mix: the DRY hit stays tight and falls off linearly with
// distance through the strike's own long-range panner (GATHER_REF_DISTANCE to
// GATHER_HEAR_RANGE), while the reverb SEND falls off far slower, so a close
// miner is a crisp clank with a valley echo behind it and a miner across the
// zone is mostly echo, the way a far-off pick reads in the open.

import type { GatherStrikeKind } from '../render/audio_sink';
import type { BiomeId } from '../sim/types';
import { REVERB_PROFILES, type ReverbEnv } from './outdoor_reverb_ir';

/** The clip each strike kind plays (scripts/sfx/gather_strike_sfx.mjs). */
export const GATHER_STRIKE_SFX: Readonly<Record<GatherStrikeKind, string>> = Object.freeze({
  mine: 'impact_gather_pick',
  chop: 'impact_gather_axe',
  tree_creak: 'impact_tree_creak',
  tree_crash: 'impact_tree_crash',
});

/** Yards from the listener a strike is heard to (the dry hit is silent there). */
export const GATHER_HEAR_RANGE = 76;
/** Yards within which the dry hit plays at full level. */
export const GATHER_REF_DISTANCE = 6;
/** Concurrent strike voices: past it the nearest strikes win. */
export const GATHER_STRIKE_VOICES = 6;

const CLOSE_LOWPASS_HZ = 18000;
const FAR_LOWPASS_HZ = 3200;
/** The share of a close strike's send that a strike at the hearing edge keeps. */
const FAR_SEND_FLOOR = 0.35;

/** Per kind: the dry level, how hard it drives the reverb, and how long (seconds)
 *  it holds its voice. Rock rings louder in the echo than wood; the creak is a
 *  quieter lead-in to the crash. */
const KIND_MIX: Readonly<Record<GatherStrikeKind, { gain: number; send: number; hold: number }>> =
  Object.freeze({
    mine: { gain: 0.9, send: 1, hold: 0.55 },
    chop: { gain: 0.95, send: 0.85, hold: 0.5 },
    tree_creak: { gain: 0.8, send: 0.55, hold: 1.5 },
    tree_crash: { gain: 1, send: 1, hold: 1.9 },
  });

/** The acoustic space by the listener's biome. A dungeon is always a cave. */
const ENV_BY_BIOME: Readonly<Record<BiomeId, ReverbEnv>> = Object.freeze({
  vale: 'open',
  beach: 'open',
  dusk: 'open',
  amber: 'open',
  garden: 'open',
  night: 'open',
  peaks: 'cliffs',
  frost: 'cliffs',
  volcano: 'cliffs',
  ember: 'cliffs',
  gale: 'cliffs',
  desert: 'cliffs',
  marsh: 'forest',
  fen: 'forest',
  jungle: 'forest',
  haunt: 'forest',
  cave: 'cave',
});

/** The reverb environment the listener stands in. */
export function reverbEnvFor(biome: BiomeId, inDungeon: boolean): ReverbEnv {
  if (inDungeon) return 'cave';
  return ENV_BY_BIOME[biome] ?? 'open';
}

export interface GatherStrikeMix {
  /** Dry per-play gain (the panner adds the distance falloff on top). */
  gain: number;
  /** Reverb send level, pre-panner (tapped after the low-pass). */
  send: number;
  /** Low-pass cutoff on the hit and its send (air absorption), Hz. */
  lowpassHz: number;
  /** Seconds the strike occupies its voice. */
  hold: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number): number => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/** Where `distance` sits between full level and the hearing edge, 0..1. */
export function gatherDistanceFraction(distance: number): number {
  return clamp01((distance - GATHER_REF_DISTANCE) / (GATHER_HEAR_RANGE - GATHER_REF_DISTANCE));
}

/** The panner's linear dry falloff (WebAudio 'linear' distance model, rolloff 1),
 *  restated so the offline demo and the tests read the same curve. */
export function gatherDryFalloff(distance: number): number {
  return 1 - gatherDistanceFraction(distance);
}

/** The mix of one strike `distance` yards from the listener in `env`, or null
 *  past the hearing range. */
export function gatherStrikeMix(
  distance: number,
  env: ReverbEnv,
  kind: GatherStrikeKind,
): GatherStrikeMix | null {
  if (!(distance >= 0) || distance > GATHER_HEAR_RANGE) return null;
  const u = gatherDistanceFraction(distance);
  const k = KIND_MIX[kind];
  const edge = 1 - smoothstep(0.85, 1, u);
  const reach = FAR_SEND_FLOOR + (1 - FAR_SEND_FLOOR) * (1 - u) ** 1.5;
  return {
    gain: k.gain,
    send: REVERB_PROFILES[env].send * k.send * reach * edge,
    lowpassHz: CLOSE_LOWPASS_HZ * (FAR_LOWPASS_HZ / CLOSE_LOWPASS_HZ) ** u,
    hold: k.hold,
  };
}

/** The strike voices: when each slot frees up (audio-clock seconds) and how far
 *  its strike is. */
export interface StrikeVoicePool {
  readonly ends: Float64Array;
  readonly dists: Float64Array;
}

export function newStrikeVoicePool(size = GATHER_STRIKE_VOICES): StrikeVoicePool {
  return { ends: new Float64Array(size), dists: new Float64Array(size) };
}

/**
 * Claim a voice for a strike `distance` away at audio time `now`, held for
 * `hold` seconds: a free slot when there is one, else the slot of the farthest
 * strike still sounding if this one is nearer (its voice is stolen), else -1
 * (this strike is dropped). Nearest first, so a crowd of miners keeps the ones
 * beside the listener and loses the far ones, never the other way round. Pass 0
 * for the listener's own strikes.
 */
export function admitStrikeVoice(
  pool: StrikeVoicePool,
  distance: number,
  now: number,
  hold: number,
): number {
  let far = -1;
  let farDist = -1;
  let slot = -1;
  for (let i = 0; i < pool.ends.length; i++) {
    if (pool.ends[i] <= now) {
      slot = i;
      break;
    }
    if (pool.dists[i] > farDist) {
      farDist = pool.dists[i];
      far = i;
    }
  }
  if (slot < 0 && farDist > distance) slot = far;
  if (slot < 0) return -1;
  pool.ends[slot] = now + hold;
  pool.dists[slot] = distance;
  return slot;
}

/** Free a slot whose strike never started (a cold clip, the global voice cap). */
export function releaseStrikeVoice(pool: StrikeVoicePool, slot: number): void {
  if (slot >= 0 && slot < pool.ends.length) pool.ends[slot] = 0;
}
