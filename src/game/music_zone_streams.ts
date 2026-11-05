// The zone and combat stream targeting of MusicDirector's update(), with the
// pooled-zone roll it needs (a zone that ships more than one remaster picks
// one per arrival). It sits beside MusicDirector instead of inside it (the
// music.ts monolith ratchet), the same way minigame_music_layer.ts does: the
// director keeps a one-line call in update() and this module reads the
// director's private stream plumbing through an untyped host, welded to
// music.ts in tests/music.test.ts.
//
// A single-track zone resolves exactly the zone/combat targets music.ts's
// update() always did.
//
// The Wyndlewood score (music_score.ts) rides the same map: once the score layer
// (music_score_layer.ts) has ticked a director and holds a slot, the slot's stream
// (keyed "score:...", never a MusicZone) is the one that plays, for exploration and
// for the battle layer alike, and it rests at 0 through its silence gaps. With no
// slot the remastered zone and battle streams play exactly as before.

import type { CrucibleFloor } from './crucible_music';
import { minigameLayerFor } from './minigame_music_layer';
import type { ScoreSlot } from './music_score';
import { activeScoreSlot, scoreSlotResting, scoreStateFor } from './music_score_state';
import { SCORE_TRACK_FILES } from './music_score_tracks.generated';
import { pickCombatTrackIndex, zoneStreamUrls } from './music_tracks';
import type { MusicZone } from './music_zones';

/** The part of MusicDirector's private StreamTrack this module touches. */
export interface ZoneStreamTrack {
  url: string;
  el: HTMLAudioElement | null;
  gain: GainNode;
  target: number;
  /** ctx.currentTime the stream went silent, -1 while audible (music.ts StreamTrack). */
  silentAt?: number;
}

/** The private MusicDirector members the targeting reads and drives. */
interface MusicDirectorStreamHost<S extends ZoneStreamTrack> {
  ctx: AudioContext | null;
  zone: MusicZone | null;
  combat: boolean;
  combatIdx: number;
  crucibleFloor: CrucibleFloor | null;
  zoneStreams: Partial<Record<string, S>>;
  combatStreams: S[];
  makeStream(url: string): S | null;
  setStreamTarget(stream: S, target: number, fadeSeconds: number): void;
}

/** music.ts FADE_SECONDS / 3, the zone fade-in (and combat fade-out) the
 *  director's update() always used; music.ts passes its own value in. */
const FADE_IN_SECONDS = 2.2 / 3;

/**
 * Point every zone and combat stream at its target for the director's current
 * zone and combat flag. Called from the director's update() (zoneChanging
 * marks a genuine zone change).
 *
 * Combat music replaces the zone theme rather than layering over it: the zone
 * is silenced for the duration of combat and fades back in when it ends. Fade
 * out faster than fade in so instance music does not bleed into the world.
 */
export function applyZoneStreamTargets<S extends ZoneStreamTrack = ZoneStreamTrack>(
  director: object,
  zoneChanging: boolean,
  zoneFadeIn = FADE_IN_SECONDS,
): void {
  const h = director as MusicDirectorStreamHost<S>;
  if (!h.ctx || minigameLayerFor(director).active !== null) return;
  // A Crucible floor owns the whole mix (upstream's crucible streams, faded
  // in setCrucibleFloor).
  const crucible = h.crucibleFloor !== null;
  // Null before the first update(): no zone is playing yet, so every stream
  // below simply targets 0, which is exactly right.
  const zone = h.zone;
  const inCombat = h.combat;
  // The score's slot, when the layer holds one, replaces both the zone theme and the
  // remastered battle themes (its battle layer is a slot too).
  const slot = zone !== null && !crucible ? activeScoreSlot(director) : null;
  if (slot !== null) ensureScoreStream(h, director, slot);
  else if (zone !== null && !inCombat && !crucible) ensureZoneStream(h, zone, zoneChanging);
  const active: string | null = slot !== null ? slot.key : !inCombat ? zone : null;
  const resting = slot !== null && scoreSlotResting(director, slot.key);
  for (const [name, stream] of Object.entries(h.zoneStreams) as [string, S][]) {
    if (!stream) continue;
    const target = !crucible && name === active && !resting ? 1 : 0;
    // The battle layer cuts in fast and hands back at the zone fade.
    const fadeIn = slot?.group === 'combat' ? 0.35 : zoneFadeIn;
    h.setStreamTarget(stream, target, target > 0 ? fadeIn : 0.35);
  }
  h.combatStreams.forEach((stream, idx) => {
    const target = !crucible && slot === null && inCombat && idx === h.combatIdx ? 1 : 0;
    h.setStreamTarget(stream, target, target > 0 || crucible ? 0.35 : zoneFadeIn);
  });
}

/** Ensure the score slot has a live stream on its current cue. A slot plays its pool in
 *  turn (music_score_layer.ts advances the index at the end of each rest). */
function ensureScoreStream<S extends ZoneStreamTrack>(
  h: MusicDirectorStreamHost<S>,
  director: object,
  slot: ScoreSlot,
): void {
  const play = scoreStateFor(director).plays.get(slot.key);
  const cue = slot.cues[(play?.cueIdx ?? 0) % slot.cues.length];
  const file = SCORE_TRACK_FILES[cue];
  if (!file) return;
  const existing = h.zoneStreams[slot.key];
  if (existing && existing.url === file.url) return;
  if (existing) {
    releaseStream(existing);
    delete h.zoneStreams[slot.key];
  }
  const stream = h.makeStream(file.url);
  if (stream) h.zoneStreams[slot.key] = stream;
}

/** Ensure `zone` has a live stream. `arriving` marks a genuine zone change
 *  (not a combat handback): only then does a POOLED zone roll a different one
 *  of its cues, so a capital with two harbor themes varies between visits
 *  instead of wearing one loop out. Single-track zones are untouched and keep
 *  resuming mid-track exactly as before. */
function ensureZoneStream<S extends ZoneStreamTrack>(
  h: MusicDirectorStreamHost<S>,
  zone: MusicZone,
  arriving: boolean,
): void {
  const urls = zoneStreamUrls(zone);
  if (urls.length === 0) return;
  const existing = h.zoneStreams[zone];
  if (existing && (urls.length === 1 || !arriving)) return;
  const url = urls.length === 1 ? urls[0] : urls[pickCombatTrackIndex(urls.length, Math.random)];
  if (existing) {
    if (existing.url === url) return; // rolled the same cue: keep it playing
    releaseStream(existing);
    delete h.zoneStreams[zone];
  }
  const stream = h.makeStream(url);
  if (stream) h.zoneStreams[zone] = stream;
}

/** Tear one zone stream down for good: the swapped-out cue must stop
 *  buffering behind the one now playing, so this releases the buffered media
 *  rather than just pausing the playhead. */
export function releaseStream(stream: ZoneStreamTrack): void {
  const el = stream.el;
  stream.el = null;
  stream.target = 0;
  try {
    el?.pause();
  } catch {
    /* best-effort: the element is being discarded either way */
  }
  try {
    el?.removeAttribute('src');
    el?.load();
  } catch {
    /* older/stubbed elements: pausing already stopped the download */
  }
  try {
    stream.gain.disconnect();
  } catch {
    /* already detached */
  }
}
