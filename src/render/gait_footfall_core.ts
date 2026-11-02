// Gait foot-plant detection: the single source of truth for on-foot footstep
// timing (renderer.ts's movement-audio arm). A footstep fires when the
// locomotion cycle that is actually driving the legs crosses a foot-plant
// phase, so the cadence follows the animation whatever the ground speed, the
// rig's authored cycle length, or the clamped time scale happens to be.
//
// Why not a distance accumulator: the old FOOT_STRIDE_RUN of 1.55 yd fired a
// step every 0.22 s at the 7 yd/s run while the shipped player Run cycle
// (woc anims_*.glb, 0.667 s at runRef 7) plants a foot every 0.333 s, so three
// cues played for every two plants and the steps read as doubled and rushed.
// Measured off the clips (foot bone minima, scripts/assets/woc_character
// rig_math.mjs): both the woc Run/Walk and the KayKit Running_A/Walking_A
// cycles plant twice per cycle, half a cycle apart, within a tenth of a cycle
// of phase 0 and 0.5. No clip carries authored plant markers, so the plant
// phases are the fixed PLANT_PHASES below.
//
// RENDER_PURE_CORES: host-agnostic and deterministic (no Three/DOM, no clock,
// no RNG), unit-tested directly (tests/gait_footfall_core.test.ts). Not
// value-pure: it advances the track it is handed in place (one small record
// per entity view, no per-frame allocation). The renderer stays the only
// caller and keeps sink dispatch; the character visual reports the cycle.

/** Foot plants per locomotion cycle: left and right, half a cycle apart. */
export const PLANTS_PER_CYCLE = 2;
const PLANT_SPACING = 1 / PLANTS_PER_CYCLE;

/** The locomotion cycle driving a rig's legs this frame: which gait (null when
 *  no cycle is playing: idle, a one-shot, a jump) and its normalized phase in
 *  [0, 1). Filled by CharacterVisual.gaitCycle into a caller-owned record. */
export interface GaitCycle {
  gait: string | null;
  phase: number;
}

export function newGaitCycle(): GaitCycle {
  return { gait: null, phase: 0 };
}

/** Per-entity memory of the last observed cycle. */
export interface FootfallTrack {
  gait: string | null;
  phase: number;
}

export function newFootfallTrack(): FootfallTrack {
  return { gait: null, phase: 0 };
}

/** Normalize a clip time against its cycle length into [0, 1). */
export function cyclePhase(time: number, duration: number): number {
  if (!(duration > 0) || !Number.isFinite(time)) return 0;
  const p = (time / duration) % 1;
  return p < 0 ? p + 1 : p;
}

/**
 * Observe this frame's gait cycle and report how many foot plants happened
 * since the previous observation: 0 or 1 on any ordinary frame (2 only when a
 * hitch frame advanced the cycle by more than one plant spacing).
 *
 * A change of gait (walk to run, a jump landing back on the run, the first
 * moving frame) only re-anchors the track and never fires: the outgoing cycle
 * and the incoming one are at unrelated phases, and firing on the hand-off is
 * exactly the doubled step this core exists to prevent. Direction follows the
 * phase delta (a reversed backpedal plays the cycle backwards), taking the
 * shorter way round the wrap, so a cycle can never be mistaken for a step.
 */
export function observeGaitCycle(track: FootfallTrack, gait: string | null, phase: number): number {
  if (gait === null) {
    track.gait = null;
    return 0;
  }
  if (gait !== track.gait) {
    track.gait = gait;
    track.phase = phase;
    return 0;
  }
  const from = track.phase;
  track.phase = phase;
  let delta = phase - from;
  if (delta > 0.5) delta -= 1;
  else if (delta < -0.5) delta += 1;
  if (delta === 0) return 0;
  const to = from + delta;
  if (delta > 0) {
    // plant marks m with from < m <= to
    return Math.floor(to / PLANT_SPACING) - Math.floor(from / PLANT_SPACING);
  }
  // plant marks m with to <= m < from
  return Math.ceil(from / PLANT_SPACING) - Math.ceil(to / PLANT_SPACING);
}
