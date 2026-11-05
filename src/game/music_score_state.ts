// The score layer's per-director state, shared by the layer (music_score_layer.ts, which
// writes it every HUD music tick) and the stream targeting (music_zone_streams.ts, which
// reads the active slot). It lives in its own module so the two never import each other.
//
// A director the score layer has never ticked has no state here, so the director plays
// its remastered zone and battle streams exactly as before (tests/music.test.ts drives
// that path); the first tick switches the score on for that director.

import type { ScoreSignals, ScoreSlot } from './music_score';

/** One slot's playback bookkeeping. */
export interface ScorePlay {
  /** Index into the slot's cue pool of the cue now loaded. */
  cueIdx: number;
  /** True while the slot rests in silence between plays. */
  resting: boolean;
  /** AudioContext time the rest ends (meaningful while resting). */
  restUntil: number;
  /** The media element the ended listener is bound to (rebinds after a swap). */
  bound: HTMLAudioElement | null;
}

export interface ScoreStingerTrack {
  el: HTMLAudioElement;
  gain: GainNode;
}

export interface ScoreState {
  night: boolean;
  slot: ScoreSlot | null;
  plays: Map<string, ScorePlay>;
  /** Region slugs heard this session (the discovery sting plays on a new one). */
  heard: Set<string>;
  signals: ScoreSignals | null;
  stingers: Map<string, ScoreStingerTrack>;
  /** AudioContext time the last sting started (stings never stack). */
  lastStingAt: number;
  /** The kind of the last sting rung, or null. */
  lastStingKind: string | null;
  /** AudioContext time the stinger duck lifts, or -1 when no duck is held. */
  duckUntil: number;
}

const STATE = new WeakMap<object, ScoreState>();

export function scoreStateFor(director: object): ScoreState {
  let s = STATE.get(director);
  if (!s) {
    s = {
      night: false,
      slot: null,
      plays: new Map(),
      heard: new Set(),
      signals: null,
      stingers: new Map(),
      lastStingAt: Number.NEGATIVE_INFINITY,
      lastStingKind: null,
      duckUntil: -1,
    };
    STATE.set(director, s);
  }
  return s;
}

/** The slot the score holds for `director`, or null (never ticked, or no cue here). */
export function activeScoreSlot(director: object): ScoreSlot | null {
  return STATE.get(director)?.slot ?? null;
}

/** Whether `key` is resting in a silence gap. */
export function scoreSlotResting(director: object, key: string): boolean {
  return STATE.get(director)?.plays.get(key)?.resting ?? false;
}

/** Whether a stream key belongs to the score (its keys never collide with a MusicZone). */
export function isScoreStreamKey(key: string): boolean {
  return key.startsWith('score:');
}
