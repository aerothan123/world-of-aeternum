import { describe, expect, it } from 'vitest';
import {
  ACTION_CAM_DROP,
  ACTION_CAM_FOV,
  ACTION_CAM_SIDE_BASE,
  ACTION_CAM_SIDE_MAX,
  ACTION_CAM_SIDE_PER_DIST,
  type ActionCamOffset,
  ActionCamRig,
  actionCamOffset,
  createActionCam,
  setActionCamTarget,
  stepActionCam,
} from '../src/render/action_cam_core';

const out = (): ActionCamOffset => ({ x: 9, z: 9, drop: 9, fov: 9 });

// A primed state (the boot apply already happened with the cam off), so a
// later request glides the way a player's toggle does.
function primed() {
  const s = createActionCam();
  setActionCamTarget(s, false, 1);
  return s;
}

function step(
  s: ReturnType<typeof createActionCam>,
  enabled: boolean,
  side: number,
  dt = 1 / 60,
  snap = false,
) {
  setActionCamTarget(s, enabled, side);
  stepActionCam(s, dt, snap);
}

function settle(enabled: boolean, side: number, s = primed(), seconds = 3) {
  for (let t = 0; t < seconds; t += 1 / 60) step(s, enabled, side);
  return s;
}

describe('action_cam_core', () => {
  it('starts off: the classic chase camera passes through untouched', () => {
    const s = createActionCam();
    expect(actionCamOffset(s, 0.7, 12, out())).toEqual({ x: 0, z: 0, drop: 0, fov: 0 });
  });

  it('the first request (boot or renderer rebuild) lands instantly, no sweep', () => {
    const s = createActionCam();
    setActionCamTarget(s, true, -1);
    expect(s.weight).toBe(1);
    expect(s.side).toBe(-1);
  });

  it('blends in over time rather than snapping', () => {
    const s = primed();
    step(s, true, 1);
    expect(s.weight).toBeGreaterThan(0);
    expect(s.weight).toBeLessThan(0.2);
    settle(true, 1, s);
    expect(s.weight).toBe(1);
  });

  it('reduced motion snaps straight to the target mode and side', () => {
    const s = primed();
    step(s, true, -1, 1 / 60, true);
    expect(s.weight).toBe(1);
    expect(s.side).toBe(-1);
    step(s, false, -1, 1 / 60, true);
    expect(s.weight).toBe(0);
  });

  it('right shoulder shifts the pivot to screen-right, left to screen-left', () => {
    // yaw 0: the camera looks along +z, so screen-right is -x.
    const right = actionCamOffset(settle(true, 1), 0, 10, out());
    const expected = ACTION_CAM_SIDE_BASE + ACTION_CAM_SIDE_PER_DIST * 10;
    expect(right.x).toBeCloseTo(-expected);
    expect(right.z).toBeCloseTo(0);
    const left = actionCamOffset(settle(true, -1), 0, 10, out());
    expect(left.x).toBeCloseTo(expected);
    // yaw pi/2: looking along +x, screen-right is +z.
    const r90 = actionCamOffset(settle(true, 1), Math.PI / 2, 10, out());
    expect(r90.x).toBeCloseTo(0);
    expect(r90.z).toBeCloseTo(expected);
  });

  it('the shift is perpendicular to the view direction at any yaw', () => {
    const s = settle(true, 1);
    for (const yaw of [0.3, 1.9, -2.4, 3.1]) {
      const o = actionCamOffset(s, yaw, 8, out());
      expect(o.x * Math.sin(yaw) + o.z * Math.cos(yaw)).toBeCloseTo(0);
    }
  });

  it('caps the lateral shift at far zoom and applies the drop and FOV at full weight', () => {
    const o = actionCamOffset(settle(true, 1), 0, 100, out());
    expect(Math.abs(o.x)).toBeCloseTo(ACTION_CAM_SIDE_MAX);
    expect(o.drop).toBeCloseTo(ACTION_CAM_DROP);
    expect(o.fov).toBeCloseTo(ACTION_CAM_FOV);
  });

  it('the shoulder slider scales the offset: center sits right behind the avatar', () => {
    const full = actionCamOffset(settle(true, 1), 0, 3, out());
    const half = actionCamOffset(settle(true, 0.5), 0, 3, out());
    const center = actionCamOffset(settle(true, 0), 0, 3, out());
    expect(half.x).toBeCloseTo(full.x / 2);
    expect(center.x).toBeCloseTo(0);
    // Center still keeps the shoulder-height drop and the FOV widen.
    expect(center.drop).toBeCloseTo(ACTION_CAM_DROP);
    // Out-of-range input clamps to the full offset.
    const s = primed();
    setActionCamTarget(s, true, 5);
    expect(s.targetSide).toBe(1);
  });

  it('a shoulder swap glides through center instead of jumping', () => {
    const s = settle(true, 1);
    step(s, true, -1);
    expect(s.side).toBeLessThan(1);
    expect(s.side).toBeGreaterThan(0);
    settle(true, -1, s);
    expect(s.side).toBe(-1);
  });

  it('while off it tracks the chosen side, so re-enabling never sweeps across', () => {
    const s = settle(true, 1);
    settle(false, 1, s);
    expect(s.weight).toBe(0);
    step(s, false, -1);
    expect(s.side).toBe(-1);
  });

  it('clamps a huge frame step so a hitch cannot overshoot', () => {
    const s = primed();
    step(s, true, 1, 10);
    expect(s.weight).toBeLessThan(1);
    step(s, true, 1, -1);
    expect(Number.isFinite(s.weight)).toBe(true);
  });

  // The owner's playtest: "when walking/running every footstep still shakes
  // the screen, shouldn't be any shaking." The stride bob (a cos^2 dip per
  // footfall plus a sideways sway per stride) is gone outright, not zeroed:
  // the rig reads no avatar motion at all, so a run at any frame rate leaves
  // the offset exactly where standing still leaves it.
  describe('no per-footfall camera motion', () => {
    const CADENCES: Array<{ name: string; dts: number[] }> = [
      { name: '30 Hz', dts: [1 / 30] },
      { name: '60 Hz', dts: [1 / 60] },
      { name: '144 Hz', dts: [1 / 144] },
      { name: 'uneven', dts: [1 / 144, 1 / 60, 1 / 90, 1 / 40, 1 / 120] },
    ];

    it('holds the offset constant across a run at 30, 60 and 144 Hz', () => {
      for (const { name, dts } of CADENCES) {
        const rig = new ActionCamRig();
        rig.set(true, 1);
        const rest = { ...rig.offset(0, 3) };
        // Six seconds of stepping: the cadence a run would step it at.
        let t = 0;
        for (let i = 0; t < 6; i++) {
          const dt = dts[i % dts.length];
          t += dt;
          rig.step(dt, false);
          const o = rig.offset(0, 3);
          expect(o.drop, name).toBe(rest.drop);
          expect(o.x, name).toBe(rest.x);
          expect(o.z, name).toBe(rest.z);
          expect(o.fov, name).toBe(rest.fov);
        }
        expect(rest.drop, name).toBeCloseTo(ACTION_CAM_DROP);
      }
    });

    it('takes no motion input, so a footfall has nothing to feed', () => {
      // step(dt, reduce): no speed, no height, no swim or death flag.
      expect(ActionCamRig.prototype.step.length).toBe(2);
      expect(Object.keys(createActionCam()).some((k) => /bob/i.test(k))).toBe(false);
    });
  });
});
