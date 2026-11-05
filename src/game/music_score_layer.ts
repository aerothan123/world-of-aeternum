// The Wyndlewood score layer: drives MusicDirector's streams from the score's slots
// (music_score.ts) once per HUD music tick, beside the director instead of inside it
// (the music.ts monolith ratchet; the same untyped-host pattern as music_zone_streams.ts
// and minigame_music_layer.ts, welded to music.ts's private names in
// tests/music_score_layer.test.ts).
//
// Per tick it:
//   * turns day/night with hysteresis and resolves the slot for where the player is;
//   * on a slot change, crossfades to it (the zone stream targeting does the fade), plays
//     a fresh arrival from the top, and rings the discovery sting for a region not yet
//     heard this session;
//   * rests a slot in silence after each play-through ('gap' slots: the element stops
//     looping and its `ended` starts the rest), then plays the slot's next pool cue;
//   * keeps stream residency bounded: silent score streams beyond the newest few are
//     released (their buffered media dropped), so a long session never holds every cue;
//   * diffs the world readings for the stingers, plays at most one over a short duck of
//     the score, and lifts the duck once the sting has rung out.
// Everything routes through the director's master gain, so the music toggle, the volume
// slider, the menu fade and the boss duck apply to the score and its stingers unchanged.

import { dayWeightForPhase } from '../render/region_ambience_core';
import { minigameLayerFor } from './minigame_music_layer';
import { isMusicMixAudible, type MusicMixState } from './music_mix_policy';
import {
  regionOfSlot,
  SCORE_STINGERS,
  type ScoreContext,
  type ScoreSignals,
  type ScoreSlot,
  type ScoreStinger,
  scoreNight,
  scoreSlotFor,
  silenceGapSeconds,
  stingersFor,
} from './music_score';
import { isScoreStreamKey, type ScorePlay, scoreStateFor } from './music_score_state';
import { SCORE_TRACK_FILES } from './music_score_tracks.generated';
import { applyZoneStreamTargets, releaseStream, type ZoneStreamTrack } from './music_zone_streams';

/** The private MusicDirector members the layer reads and drives. */
interface ScoreHost {
  ctx: AudioContext | null;
  master: GainNode | null;
  zoneStreams: Partial<Record<string, ZoneStreamTrack>>;
  combatStreams: ZoneStreamTrack[];
  mixState(): MusicMixState;
}

/** Silent score streams kept resident (beyond these the oldest silent ones go). */
export const SCORE_RESIDENT_STREAMS = 4;
/** A silent score stream is released only after this long silent (s), so a quick
 *  combat or a doorway hop back resumes without a refetch. */
export const SCORE_RELEASE_AFTER_S = 30;
/** The score sits this far under a sting while it rings (gain multiplier). */
export const STINGER_DUCK = 0.4;
/** Stings never fire closer together than this (s). */
export const STINGER_SPACING_S = 4;

export interface ScoreTickInput extends Omit<ScoreContext, 'night'> {
  /** The day/night cycle phase (0 midnight, 0.5 noon). */
  dayPhase: number;
  /** The world readings for the stingers, or null when the world has no player yet. */
  signals: ScoreSignals | null;
  /** A Crucible floor owns the mix: hold the score still (the minigame layer is read
   *  from the director itself). */
  suspended: boolean;
  /** Injected randomness for the gap lengths (Math.random at the call site). */
  rand: () => number;
}

function playFor(plays: Map<string, ScorePlay>, key: string): ScorePlay {
  let p = plays.get(key);
  if (!p) {
    p = { cueIdx: 0, resting: false, restUntil: 0, bound: null };
    plays.set(key, p);
  }
  return p;
}

function rewind(el: HTMLAudioElement | null): void {
  if (!el) return;
  try {
    el.currentTime = 0;
  } catch {
    /* browser may reject seeking before metadata */
  }
}

/**
 * One score tick for `director`. Called by InstanceMusicController.update right after
 * the director's own update(), at the HUD's medium music cadence.
 */
export function tickScore(director: object, input: ScoreTickInput): void {
  const h = director as ScoreHost;
  const state = scoreStateFor(director);
  state.night = scoreNight(state.night, dayWeightForPhase(input.dayPhase));
  const ctx = h.ctx;
  const now = ctx?.currentTime ?? 0;

  const suspended = input.suspended || minigameLayerFor(director).active !== null;
  const next = suspended ? null : scoreSlotFor({ ...input, night: state.night });
  const changed = (next?.key ?? null) !== (state.slot?.key ?? null);
  let discovered = false;
  if (changed) {
    state.slot = next;
    if (next !== null) discovered = arrive(h, state, next, input.combat);
    if (ctx) applyZoneStreamTargets(director, true);
  }
  if (ctx && state.slot !== null) serviceSlot(director, h, state.slot, now, input.rand);
  if (ctx) trimResidency(h, state.slot?.key ?? null, now);

  const stings = input.signals ? stingersFor(state.signals, input.signals) : [];
  if (input.signals) state.signals = { ...input.signals };
  if (stings.length > 0) playStinger(director, stings[0]);
  else if (discovered) playStinger(director, 'discovery');
  if (state.duckUntil >= 0 && now >= state.duckUntil) liftDuck(h, state, now);
}

/** A fresh arrival plays from the top (a paused stream rewinds, a rest is cut short).
 *  Returns whether it reached a region not heard yet this session (the first region of
 *  the session only marks itself heard: logging in is not a discovery). */
function arrive(
  h: ScoreHost,
  state: ReturnType<typeof scoreStateFor>,
  slot: ScoreSlot,
  combat: boolean,
): boolean {
  const play = playFor(state.plays, slot.key);
  play.resting = false;
  const el = h.zoneStreams[slot.key]?.el ?? null;
  if (el?.paused) rewind(el);
  const region = regionOfSlot(slot.key);
  if (region === null || combat || state.heard.has(region)) return false;
  const first = state.heard.size === 0;
  state.heard.add(region);
  return !first;
}

function serviceSlot(
  director: object,
  h: ScoreHost,
  slot: ScoreSlot,
  now: number,
  rand: () => number,
): void {
  const state = scoreStateFor(director);
  const play = playFor(state.plays, slot.key);
  const stream = h.zoneStreams[slot.key];
  const el = stream?.el ?? null;
  if (el && play.bound !== el) {
    play.bound = el;
    if (slot.repeat === 'gap') {
      el.loop = false;
      el.addEventListener?.('ended', () => {
        // The cue has played through: rest in silence, then play the next one.
        const s = scoreStateFor(director);
        if (s.slot?.key !== slot.key) return;
        const p = playFor(s.plays, slot.key);
        if (p.resting) return;
        p.resting = true;
        p.restUntil = (h.ctx?.currentTime ?? 0) + silenceGapSeconds(slot.group, rand);
        applyZoneStreamTargets(director, false);
      });
    }
  }
  if (play.resting && now >= play.restUntil) {
    play.resting = false;
    if (slot.cues.length > 1) play.cueIdx = (play.cueIdx + 1) % slot.cues.length;
    rewind(h.zoneStreams[slot.key]?.el ?? null);
    applyZoneStreamTargets(director, false);
  }
}

/** Release the oldest silent score streams past the resident budget. */
function trimResidency(h: ScoreHost, activeKey: string | null, now: number): void {
  const silent: [string, ZoneStreamTrack][] = [];
  let resident = 0;
  for (const [key, stream] of Object.entries(h.zoneStreams)) {
    if (!stream || !isScoreStreamKey(key)) continue;
    resident++;
    const since = stream.silentAt ?? -1;
    if (
      key !== activeKey &&
      stream.target === 0 &&
      since >= 0 &&
      now - since >= SCORE_RELEASE_AFTER_S
    )
      silent.push([key, stream]);
  }
  if (resident <= SCORE_RESIDENT_STREAMS) return;
  silent.sort((a, b) => (a[1].silentAt ?? 0) - (b[1].silentAt ?? 0));
  for (const [key, stream] of silent) {
    if (resident <= SCORE_RESIDENT_STREAMS) break;
    releaseStream(stream);
    delete h.zoneStreams[key];
    resident--;
  }
}

/**
 * Play one stinger over a short duck of the score. Returns whether it played: never
 * while the mix is inaudible (toggle off, volume 0, menu open, a boss track owning the
 * mix), never within STINGER_SPACING_S of the last, never for a cue not generated yet.
 */
export function playStinger(director: object, kind: ScoreStinger): boolean {
  const h = director as ScoreHost;
  const ctx = h.ctx;
  if (!ctx || !h.master || typeof h.mixState !== 'function') return false;
  if (!isMusicMixAudible(h.mixState())) return false;
  const cue = SCORE_STINGERS[kind];
  const file = SCORE_TRACK_FILES[cue];
  if (!file) return false;
  const state = scoreStateFor(director);
  const now = ctx.currentTime;
  if (now - state.lastStingAt < STINGER_SPACING_S) return false;
  let track = state.stingers.get(cue);
  if (!track) {
    if (typeof Audio !== 'function') return false;
    const el = new Audio(file.url);
    el.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.value = 1;
    try {
      ctx.createMediaElementSource(el).connect(gain);
    } catch {
      el.muted = true; // never play outside the mix's gains
    }
    gain.connect(h.master);
    track = { el, gain };
    state.stingers.set(cue, track);
  }
  rewind(track.el);
  void track.el.play().catch(() => {});
  state.lastStingAt = now;
  state.duckUntil = now + Math.max(1, file.seconds - 0.5);
  for (const stream of duckable(h)) {
    stream.gain.gain.setTargetAtTime(stream.target * STINGER_DUCK, now, 0.08);
  }
  return true;
}

function* duckable(h: ScoreHost): Iterable<ZoneStreamTrack> {
  for (const s of Object.values(h.zoneStreams)) if (s && s.target > 0) yield s;
  for (const s of h.combatStreams) if (s.target > 0) yield s;
}

function liftDuck(h: ScoreHost, state: ReturnType<typeof scoreStateFor>, now: number): void {
  state.duckUntil = -1;
  for (const s of Object.values(h.zoneStreams)) s?.gain.gain.setTargetAtTime(s.target, now, 0.8);
  for (const s of h.combatStreams) s.gain.gain.setTargetAtTime(s.target, now, 0.8);
}
