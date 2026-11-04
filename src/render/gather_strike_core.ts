// Gathering strike timing: the single source of truth for WHEN a pick meets
// the vein or an axe bites the trunk, for any gathering body the client draws
// (the local player and every other player alike). A strike fires when the
// gather swing that is actually driving the rig (CharacterVisual
// gatherSwingCycle: the looping mine or chop clip and its normalized phase)
// crosses the clip's tool-contact phase, so the clank lands on the frame the
// tool does whatever the clip's length, time scale or loadout swap is.
//
// The contact phase is the clip's first ClipMap.contacts entry (the measured
// blade-contact seconds every WOC melee clip already carries, characters/
// manifest.ts WOC_CONTACTS) over the clip's duration; a rig whose clip lists no
// contact strikes at DEFAULT_STRIKE_PHASE.
//
// A body whose rig is not advancing this frame (behind the camera, where the
// mixer only banks time) still swings in the world, and is still heard: the
// track COASTS on the last swing period and contact the rig reported (or the
// defaults for a body never seen swinging), so a miner behind you keeps his
// rhythm. Switching between the rig and the coast re-anchors without firing.
//
// Remote bodies need no wire field: the swing pose itself is derived from the
// cast id every snapshot carries plus the static node table
// (gather_pose_core.ts), so strikes follow the same state the pose does.
//
// RENDER_PURE_CORES: host-agnostic and deterministic (no Three/DOM, no clock, no
// RNG), unit-tested directly (tests/gather_strike_core.test.ts). Not value-pure:
// it advances the track it is handed in place (one small record per body).

import { GATHER_MINE_CAST_CLIP } from './gather_pose_core';
import { TREE_CHOP_CAST_CLIP } from './tree_felling_core';

/** The swings that strike: herb picking kneels and is silent here. */
export type GatherSwingKind = 'mine' | 'chop';

/** Where a clip with no listed contact lands its tool, as a cycle fraction. */
export const DEFAULT_STRIKE_PHASE = 0.5;
/** Seconds per swing for a coasting body never seen swinging (the sim's
 *  one-second chop swing, tree_felling_core CHOP_SWING_SECONDS). */
export const DEFAULT_SWING_PERIOD = 1;

/** The gather swing driving a rig this frame: its kind (null when no gather
 *  swing is playing), normalized phase in [0, 1), contact phase (null when the
 *  clip lists none) and seconds per swing at its current time scale. Filled by
 *  CharacterVisual.gatherSwingCycle. */
export interface GatherSwingCycle {
  kind: GatherSwingKind | null;
  phase: number;
  contact: number | null;
  period: number;
}

export function newGatherSwingCycle(): GatherSwingCycle {
  return { kind: null, phase: 0, contact: null, period: DEFAULT_SWING_PERIOD };
}

/** Per-body memory of the last observed swing. */
export interface GatherStrikeTrack {
  kind: GatherSwingKind | null;
  phase: number;
  /** Where the tool lands, as a cycle fraction (last reported by the rig). */
  contact: number;
  /** Seconds per swing (last reported by the rig). */
  period: number;
  /** Whether the last observation came from the rig or the coast. */
  coasting: boolean;
}

export function newGatherStrikeTrack(): GatherStrikeTrack {
  return {
    kind: null,
    phase: 0,
    contact: DEFAULT_STRIKE_PHASE,
    period: DEFAULT_SWING_PERIOD,
    coasting: false,
  };
}

/** The strike kind of a cast-clip key (gather_pose_core / tree_felling_core). */
export function gatherSwingKindFor(castClipKey: string | null | undefined): GatherSwingKind | null {
  if (castClipKey === GATHER_MINE_CAST_CLIP) return 'mine';
  if (castClipKey === TREE_CHOP_CAST_CLIP) return 'chop';
  return null;
}

/** A listed contact (seconds from the clip's first frame) as a cycle fraction. */
export function contactPhase(
  contactSeconds: number | undefined,
  clipDuration: number,
): number | null {
  if (contactSeconds === undefined || !(clipDuration > 0) || !Number.isFinite(contactSeconds)) {
    return null;
  }
  const p = (contactSeconds / clipDuration) % 1;
  return p < 0 ? p + 1 : p;
}

/** Contact marks crossed moving forward from `from` by `delta` (< 1). */
function crossings(from: number, delta: number, mark: number): number {
  return Math.floor(from + delta - mark) - Math.floor(from - mark);
}

/**
 * Observe this frame's rig swing and report how many tool contacts happened
 * since the previous observation: 0 or 1 (a hitch longer than a whole swing
 * reads as at most one strike, never a burst). A change of kind (the first
 * gathering frame, a switch from mining to chopping) or of source (the rig
 * taking over from the coast) only anchors the track, so a strike never fires
 * off a hand-off; the first swing of a cast still strikes, because its clip
 * starts before its contact. A swing never plays backwards, so a phase that
 * went back (a restarted clip) re-anchors instead of counting.
 */
export function observeGatherSwing(track: GatherStrikeTrack, cycle: GatherSwingCycle): number {
  if (cycle.kind === null) {
    track.kind = null;
    return 0;
  }
  track.contact = cycle.contact ?? DEFAULT_STRIKE_PHASE;
  if (cycle.period > 0 && Number.isFinite(cycle.period)) track.period = cycle.period;
  if (cycle.kind !== track.kind || track.coasting) {
    track.kind = cycle.kind;
    track.phase = cycle.phase;
    track.coasting = false;
    return 0;
  }
  const from = track.phase;
  track.phase = cycle.phase;
  let delta = cycle.phase - from;
  if (delta < -0.5) delta += 1;
  if (delta <= 0) return 0;
  return crossings(from, delta, track.contact);
}

/**
 * Advance a body whose rig is not advancing this frame by `dt` seconds on its
 * last known swing period, and report the contacts crossed (0 or 1). `kind` is
 * what the body's cast says it is doing (null: not gathering). A body that
 * starts gathering while coasting anchors at the top of its swing, the way a
 * fresh cast's clip starts.
 */
export function coastGatherSwing(
  track: GatherStrikeTrack,
  kind: GatherSwingKind | null,
  dt: number,
): number {
  if (kind === null) {
    track.kind = null;
    return 0;
  }
  if (kind !== track.kind) {
    track.kind = kind;
    track.phase = 0;
    track.coasting = true;
    return 0;
  }
  // From the rig to the coast the swing simply carries on from its last phase.
  track.coasting = true;
  if (!(dt > 0)) return 0;
  const delta = Math.min(0.999, dt / track.period);
  const from = track.phase;
  track.phase = (from + delta) % 1;
  return crossings(from, delta, track.contact);
}
