import { describe, expect, it } from 'vitest';
import { ActionCamRig } from '../src/render/action_cam_core';
import { createCameraBoom, stepCameraBoom } from '../src/render/camera_boom_core';
import { createCameraFeel, stepCameraFeel } from '../src/render/camera_feel_core';
import {
  createChaseFloorSmooth,
  stepChaseFloorSmooth,
} from '../src/render/chase_camera_floor_core';
import {
  createSelfRenderPositionState,
  type ReconciledSelfPrediction,
  updateSelfRenderPosition,
} from '../src/render/self_render_position_core';
import type { Entity } from '../src/sim/types';
import { RUN_SPEED } from '../src/sim/types';

// The "camera shakes sometimes when running" report, end to end over the pure
// cores renderer.ts updateCamera composes, in its order: the self display pose
// (a reconciled prediction with a server correction folded in as a residual),
// the spring boom, the look-ahead lead, the Action Cam shoulder and stride bob,
// and the camera floor. A straight run at RUN_SPEED over gently rolling
// ground, at 30, 60 and 144 Hz and at uneven frame times. The camera's
// forward motion must never reverse, and its frame-to-frame velocity change
// must stay under an acceleration bound: a step or a cusp anywhere in the
// chain shows up as a spike far past it.

const CADENCES: Array<{ name: string; dts: number[] }> = [
  { name: '30 Hz', dts: [1 / 30] },
  { name: '60 Hz', dts: [1 / 60] },
  { name: '144 Hz', dts: [1 / 144] },
  { name: 'uneven', dts: [1 / 144, 1 / 60, 1 / 90, 1 / 40, 1 / 120] },
];

// Gently rolling ground, optionally with a kerb-sized walk-lift edge at x = 30
// (the built-in ground steps like this at every walk lift).
const rolling = (x: number) => 0.6 * Math.sin(x / 9);
const withKerb = (x: number) => rolling(x) + (x > 30 ? 0.25 : 0);

interface Sample {
  t: number;
  x: number;
  y: number;
}

// `floorLift` 0 is the real floor (the ground a hand over: the orbit stays
// above it on this ground); a few yards stands in for a downhill run where
// the orbit rides the floor under the camera.
function runPath(
  dts: number[],
  correction: number,
  ground: (x: number) => number,
  floorLift = 0,
): Sample[] {
  const self = createSelfRenderPositionState();
  const boom = createCameraBoom();
  const feel = createCameraFeel();
  const cam = new ActionCamRig();
  cam.set(true, 1);
  const floor = createChaseFloorSmooth();
  const player = { pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0 } } as Entity;
  const out: Sample[] = [];
  let t = 0;
  let truthX = 0;
  let lastX = Number.NaN;
  let lastZ = 0;
  let corrected = false;
  for (let i = 0; truthX < 60; i++) {
    const dt = dts[i % dts.length];
    t += dt;
    truthX += RUN_SPEED * dt;
    // One server correction mid-run: the predicted pose jumps back by
    // `correction` and the residual carries the gap the display hides.
    let residual: { x: number; y: number; z: number } | null = null;
    let shown = truthX;
    if (!corrected && truthX > 20) {
      corrected = true;
      residual = { x: correction, y: 0, z: 0 };
    }
    if (corrected) shown = truthX - correction;
    const prediction: ReconciledSelfPrediction = {
      kind: 'reconciled',
      position: { x: shown, y: ground(shown), z: 0 },
      residual,
    };
    const pos = updateSelfRenderPosition(self, player, 1, 1, dt, 0, prediction, false);
    stepCameraBoom(boom, pos.x, pos.y, pos.z, dt);
    const velX = Number.isFinite(lastX) ? (pos.x - lastX) / dt : 0;
    const velZ = Number.isFinite(lastX) ? (pos.z - lastZ) / dt : 0;
    lastX = pos.x;
    lastZ = pos.z;
    stepCameraFeel(feel, velX, velZ, dt, true);
    cam.step(dt, false, false, velX, velZ, pos.y);
    // Running along +x with the camera behind: yaw pi/2 looks along +x.
    const yaw = Math.PI / 2;
    const pitch = 0.32;
    const dist = 3;
    const shoulder = cam.offset(yaw, dist);
    const px = boom.x + feel.leadX + shoulder.x;
    const eyeY = boom.y + 2 - shoulder.drop;
    const cx = px - Math.sin(yaw) * Math.cos(pitch) * dist;
    const cy = eyeY + Math.sin(pitch) * dist;
    const floorY = stepChaseFloorSmooth(floor, ground(cx) + 0.6 + floorLift, dt);
    out.push({ t, x: cx, y: Math.max(cy, floorY) });
  }
  return out;
}

// Skips the first second: the run START is its own transient (the boom's
// leash engaging as the pivot reaches the avatar), not the running shake.
function worst(samples: Sample[]) {
  let minForward = Number.POSITIVE_INFINITY;
  let maxAccel = 0;
  let maxDv = 0;
  let prevV: { x: number; y: number; dt: number } | null = null;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    const v = {
      x: (samples[i].x - samples[i - 1].x) / dt,
      y: (samples[i].y - samples[i - 1].y) / dt,
      dt,
    };
    if (samples[i].t > 1 && prevV) {
      minForward = Math.min(minForward, v.x);
      const dv = Math.hypot(v.x - prevV.x, v.y - prevV.y);
      maxDv = Math.max(maxDv, dv);
      maxAccel = Math.max(maxAccel, dv / ((dt + prevV.dt) / 2));
    }
    prevV = v;
  }
  return { minForward, maxAccel, maxDv };
}

describe('chase camera over a run (the running-shake report)', () => {
  it('moves smoothly at every frame rate on a clean run', () => {
    // Before the bob fix its footfall cusp alone measured 33 yd/s^2 here at
    // 30 Hz, growing with the frame rate (a fixed velocity flip per frame).
    for (const { name, dts } of CADENCES) {
      const { minForward, maxAccel } = worst(runPath(dts, 0, rolling));
      expect(minForward, name).toBeGreaterThan(0);
      expect(maxAccel, name).toBeLessThan(25);
    }
  });

  it('glides a server correction in without reversing the camera', () => {
    // A 0.3 yd reconcile residual decays at the handoff rate: the display
    // slows for a moment, it never steps or runs backward. At run speed the
    // boom rides its leash, so the camera carries that slowdown as is: a
    // bounded velocity change spread over the glide, never a one-frame pop.
    for (const { name, dts } of CADENCES) {
      const { minForward, maxDv } = worst(runPath(dts, 0.3, rolling));
      expect(minForward, name).toBeGreaterThan(0);
      expect(maxDv, name).toBeLessThan(5);
    }
  });

  it('crosses a walk-lift edge under the camera without a velocity spike', () => {
    // Before the fix the edge landed inside one frame: a vertical velocity
    // jump of the step over one frame time (7.5 yd/s at 30 Hz, 36 at 144 Hz).
    for (const { name, dts } of CADENCES) {
      const { minForward, maxDv } = worst(runPath(dts, 0, withKerb, 2.5));
      expect(minForward, name).toBeGreaterThan(0);
      expect(maxDv, name).toBeLessThan(4);
    }
  });
});
