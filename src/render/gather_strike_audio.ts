// Per-strike gathering audio for every body the renderer draws: the thin
// consumer of gather_strike_core.ts. The renderer calls `observe` once per
// drawn character per frame, right after the rig's mixer advanced; a body
// whose gather swing just crossed its tool contact sends one `gatherStrike`
// to the audio sink at the body, so you hear your own pick and every other
// miner and woodcutter around you, each on the beat of their own swing. A body
// whose rig is not advancing (behind the camera) coasts on its last swing.
//
// Range, falloff, the outdoor reverb and the strike voice cap belong to the
// engine (src/game/gather_strike_mix.ts); this only gates out bodies past the
// hearing range so a far one costs one squared-distance compare.

import type { SpatialAudioSink } from './audio_sink';
import {
  coastGatherSwing,
  type GatherStrikeTrack,
  type GatherSwingCycle,
  gatherSwingKindFor,
  newGatherStrikeTrack,
  newGatherSwingCycle,
  observeGatherSwing,
} from './gather_strike_core';

/** Hearing range from the player, yards: the engine's GATHER_HEAR_RANGE
 *  (src/game/gather_strike_mix.ts; tests/gather_strike_audio.test.ts pins the
 *  two equal, src/render may not import src/game). */
export const GATHER_STRIKE_RANGE = 76;
const RANGE_SQ = GATHER_STRIKE_RANGE * GATHER_STRIKE_RANGE;
/** Strikes sound at tool height, not at the feet. */
const TOOL_HEIGHT = 1;
/** Frames a track may go unobserved (its body despawned or left the view)
 *  before it is dropped, and how often the sweep runs. */
const STALE_FRAMES = 120;
const PRUNE_EVERY_FRAMES = 60;

/** The rig surface this reads (CharacterVisual implements it). */
export interface GatherSwingSource {
  gatherSwingCycle(out: GatherSwingCycle): void;
}

/** The body's animation state this frame: the cast-clip key it was handed
 *  (gather_pose_core / tree_felling.ts castClipFor), null when not casting. */
export interface GatherCastState {
  readonly castingAbility?: string | null;
}

interface Track extends GatherStrikeTrack {
  seen: number;
}

export class GatherStrikeAudio {
  private readonly tracks = new Map<number, Track>();
  private readonly cycle = newGatherSwingCycle();
  private lastPrune = 0;

  constructor(private readonly sink: () => SpatialAudioSink | null) {}

  /** One drawn body this frame. `d2` is its squared distance from the player. */
  observe(
    frame: number,
    dt: number,
    id: number,
    rig: GatherSwingSource,
    state: GatherCastState,
    d2: number,
    x: number,
    y: number,
    z: number,
    self: boolean,
  ): void {
    this.prune(frame);
    const sink = this.sink();
    const castKind = gatherSwingKindFor(state.castingAbility);
    if (!castKind || !sink?.gatherStrike || d2 > RANGE_SQ) {
      this.tracks.delete(id);
      return;
    }
    let track = this.tracks.get(id);
    if (!track) {
      track = { ...newGatherStrikeTrack(), seen: frame };
      this.tracks.set(id, track);
    }
    track.seen = frame;
    rig.gatherSwingCycle(this.cycle);
    const strikes =
      this.cycle.kind === castKind
        ? observeGatherSwing(track, this.cycle)
        : coastGatherSwing(track, castKind, dt);
    if (strikes > 0) sink.gatherStrike(castKind, x, y + TOOL_HEIGHT, z, self);
  }

  /** Bodies with a live track (tests, perf readouts). */
  get tracked(): number {
    return this.tracks.size;
  }

  private prune(frame: number): void {
    if (frame - this.lastPrune < PRUNE_EVERY_FRAMES) return;
    this.lastPrune = frame;
    for (const [id, track] of this.tracks) {
      if (frame - track.seen > STALE_FRAMES) this.tracks.delete(id);
    }
  }
}
