// The gait foot-plant core (RENDER_PURE_CORES): the one source of footstep
// timing for on-foot bodies. The repro drives it the way the renderer does,
// off the locomotion clip's phase at the real run cadence, and pins one cue
// per foot plant with no two cues inside a plausible minimum gap. Node-only:
// no Three, no DOM.
import { describe, expect, it } from 'vitest';
import {
  cyclePhase,
  newFootfallTrack,
  observeGaitCycle,
  PLANTS_PER_CYCLE,
} from '../src/render/gait_footfall_core';
import { strideHit } from '../src/render/stride_audio_core';

/** The shipped player Run cycle (woc anims_*.glb) at the 7 yd/s run, time scale 1. */
const RUN_CYCLE_SEC = 0.667;
const RUN_SPEED = 7;
/** Closest two real foot plants can come at a run: half a cycle. */
const MIN_PLANT_GAP_SEC = 0.2;

/** Drive the core like the renderer: one observation per frame off the clip
 *  time, returning the times (seconds) at which a footstep cue fired. */
function driveRun(
  frameDt: number,
  seconds: number,
  timeScale = 1,
): { fired: number[]; plants: number } {
  const track = newFootfallTrack();
  const fired: number[] = [];
  let t = 0;
  let clipTime = 0;
  while (t < seconds) {
    t += frameDt;
    clipTime += frameDt * timeScale;
    const plants = observeGaitCycle(track, 'run', cyclePhase(clipTime, RUN_CYCLE_SEC));
    for (let i = 0; i < plants; i++) fired.push(t);
  }
  // every plant mark the clip crossed after the first (anchoring) frame
  const plants = Math.floor(clipTime / (RUN_CYCLE_SEC / PLANTS_PER_CYCLE));
  return { fired, plants };
}

describe('observeGaitCycle: one footstep per foot plant at the real run cadence', () => {
  it('fires once per plant at 60 Hz: two per cycle, half a cycle apart', () => {
    const { fired, plants } = driveRun(1 / 60, 4);
    // 4 s of running is 6 cycles: 12 plants, one cue each
    expect(plants).toBe(12);
    expect(fired.length).toBe(plants);
    for (let i = 1; i < fired.length; i++) {
      const gap = fired[i] - fired[i - 1];
      expect(gap).toBeGreaterThan(MIN_PLANT_GAP_SEC);
      expect(gap).toBeCloseTo(RUN_CYCLE_SEC / PLANTS_PER_CYCLE, 1);
    }
  });

  it('keeps the same cadence at 20 Hz and at 144 Hz (frame rate independent)', () => {
    for (const hz of [20, 144]) {
      const { fired, plants } = driveRun(1 / hz, 4);
      expect(fired.length).toBe(plants);
      for (let i = 1; i < fired.length; i++)
        expect(fired[i] - fired[i - 1]).toBeGreaterThan(MIN_PLANT_GAP_SEC);
    }
  });

  it('follows the clip when its time scale is clamped, not the ground speed', () => {
    // runTimeScaleMax 1.6: the legs cycle 1.6x faster, so the plants do too.
    const { fired, plants } = driveRun(1 / 60, 4, 1.6);
    expect(fired.length).toBe(plants);
    for (let i = 1; i < fired.length; i++)
      expect(fired[i] - fired[i - 1]).toBeCloseTo(RUN_CYCLE_SEC / PLANTS_PER_CYCLE / 1.6, 1);
  });

  it('counts plants when the cycle plays backwards (a reversed backpedal)', () => {
    const track = newFootfallTrack();
    let clipTime = RUN_CYCLE_SEC * 0.9;
    observeGaitCycle(track, 'run', cyclePhase(clipTime, RUN_CYCLE_SEC));
    let plants = 0;
    for (let i = 0; i < 120; i++) {
      clipTime -= 1 / 60;
      plants += observeGaitCycle(track, 'run', cyclePhase(clipTime, RUN_CYCLE_SEC));
    }
    // 2 s backwards is 3 cycles: 6 plants.
    expect(plants).toBe(6);
  });
});

describe('observeGaitCycle: hand-offs never double a step', () => {
  it('re-anchors on a gait change without firing', () => {
    const track = newFootfallTrack();
    observeGaitCycle(track, 'walk', 0.45);
    expect(observeGaitCycle(track, 'walk', 0.52)).toBe(1); // a real plant at 0.5
    // walk -> run crossfade: the run action restarts at phase 0, which is a
    // plant mark, but the hand-off must not fire.
    expect(observeGaitCycle(track, 'run', 0.01)).toBe(0);
    expect(observeGaitCycle(track, 'run', 0.03)).toBe(0);
    expect(observeGaitCycle(track, 'run', 0.51)).toBe(1);
  });

  it('fires nothing while no gait cycle drives the legs, and forgets the old phase', () => {
    const track = newFootfallTrack();
    observeGaitCycle(track, 'run', 0.49);
    expect(observeGaitCycle(track, null, 0)).toBe(0); // a jump: the one-shot owns the rig
    expect(observeGaitCycle(track, null, 0)).toBe(0);
    // landing back on the run near its plant mark: re-anchor, no cue
    expect(observeGaitCycle(track, 'run', 0.51)).toBe(0);
  });

  it('fires nothing on a frozen cycle (the gait wind-down holds the pose)', () => {
    const track = newFootfallTrack();
    observeGaitCycle(track, 'run', 0.3);
    for (let i = 0; i < 30; i++) expect(observeGaitCycle(track, 'run', 0.3)).toBe(0);
  });

  it('fires exactly once across the wrap from the end of the cycle to its start', () => {
    const track = newFootfallTrack();
    observeGaitCycle(track, 'run', 0.98);
    expect(observeGaitCycle(track, 'run', 0.02)).toBe(1);
    expect(observeGaitCycle(track, 'run', 0.49)).toBe(0);
    expect(observeGaitCycle(track, 'run', 0.5)).toBe(1);
  });

  it('caps a hitch frame at the plants it really crossed', () => {
    const track = newFootfallTrack();
    observeGaitCycle(track, 'run', 0.1);
    // a 0.45-cycle hitch crosses only the 0.5 mark
    expect(observeGaitCycle(track, 'run', 0.55)).toBe(1);
  });
});

describe('cyclePhase', () => {
  it('normalizes a looping clip time into [0, 1) and tolerates bad input', () => {
    expect(cyclePhase(0, RUN_CYCLE_SEC)).toBe(0);
    expect(cyclePhase(RUN_CYCLE_SEC / 2, RUN_CYCLE_SEC)).toBeCloseTo(0.5, 9);
    expect(cyclePhase(RUN_CYCLE_SEC * 2.25, RUN_CYCLE_SEC)).toBeCloseTo(0.25, 9);
    expect(cyclePhase(-RUN_CYCLE_SEC * 0.25, RUN_CYCLE_SEC)).toBeCloseTo(0.75, 9);
    expect(cyclePhase(1, 0)).toBe(0);
    expect(cyclePhase(Number.NaN, RUN_CYCLE_SEC)).toBe(0);
  });
});

describe('why the distance accumulator was the bug', () => {
  it('the old 1.55 yd run stride fired 1.5 cues per animated foot plant', () => {
    // The removed FOOT_STRIDE_RUN, driven at the real run speed: a cue every
    // 0.22 s against a 0.333 s plant gap. Pinned so the number is never tuned
    // back in beside the gait core.
    const view = { stepAccum: 0 };
    const fired: number[] = [];
    for (let i = 1; i <= 240; i++) if (strideHit(view, RUN_SPEED, 1 / 60, 1.55)) fired.push(i / 60);
    const plants = (4 / RUN_CYCLE_SEC) * PLANTS_PER_CYCLE;
    expect(fired.length / plants).toBeGreaterThan(1.4);
    expect(fired[1] - fired[0]).toBeLessThan(RUN_CYCLE_SEC / PLANTS_PER_CYCLE);
  });
});
