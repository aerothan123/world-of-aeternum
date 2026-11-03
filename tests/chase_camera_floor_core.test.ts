import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHASE_CAMERA_GROUND_CLEARANCE,
  CHASE_FLOOR_SLACK,
  CHASE_FLOOR_SNAP,
  chaseCameraFloorLift,
  chaseCameraFloorY,
  createChaseFloorSmooth,
  stepChaseFloorSmooth,
} from '../src/render/chase_camera_floor_core';
import {
  GARDEN_MAZE_GRID,
  MAZE_CELL,
  MAZE_WALL_HEIGHT,
  MAZE_X0,
  MAZE_Z1,
} from '../src/render/garden_maze_core';
import { groundHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The chase camera's floor (src/render/chase_camera_floor_core.ts), moved out of renderer.ts
// updateCamera unchanged: the ground a hand over, lifted over the Great Maze's hedges (and a
// raised Rift tier), and the renderer lifting its one pose to it.

describe('chase camera floor', () => {
  it('stands a hand over the ground in the open world', () => {
    for (const [x, z] of [
      [0, 0],
      [-17, 408],
      [250, -120],
    ]) {
      expect(chaseCameraFloorY(x, z, WORLD_SEED, null)).toBeCloseTo(
        groundHeight(x, z, WORLD_SEED) + CHASE_CAMERA_GROUND_CLEARANCE,
        9,
      );
    }
  });

  it('rides over a maze hedge the way the old terrain walls lifted it', () => {
    let r = 0;
    let c = 0;
    outer: for (r = 0; r < GARDEN_MAZE_GRID.length; r++) {
      for (c = 0; c < GARDEN_MAZE_GRID[r].length; c++)
        if (GARDEN_MAZE_GRID[r][c] === '#') break outer;
    }
    const x = MAZE_X0 + (c + 0.5) * MAZE_CELL;
    const z = MAZE_Z1 - (r + 0.5) * MAZE_CELL;
    const ground = groundHeight(x, z, WORLD_SEED) + CHASE_CAMERA_GROUND_CLEARANCE;
    expect(chaseCameraFloorY(x, z, WORLD_SEED, null)).toBeCloseTo(ground + MAZE_WALL_HEIGHT, 5);
    // an authored map adds the same lift over its own ground
    expect(chaseCameraFloorLift(x, z, null)).toBeCloseTo(MAZE_WALL_HEIGHT, 5);
    expect(chaseCameraFloorLift(250, -120, null)).toBe(0);
  });

  it('is the floor the renderer lifts its one chase pose to', () => {
    const renderer = readFileSync(path.join(__dirname, '..', 'src/render/renderer.ts'), 'utf8');
    expect(renderer).toContain('groundY = chaseCameraFloorY(cx, cz, seed, this.sim.riftFloor);');
    expect(renderer).toContain('chaseCameraFloorLift(cx, cz, this.sim.riftFloor);');
    expect(renderer).toContain('this.camera.position.set(cx, Math.max(cy, groundY), cz);');
    // ...through the smoother, once, right before that one pose assignment.
    expect(renderer).toContain(
      'groundY = stepChaseFloorSmooth(this.chaseFloor, groundY, dt);\n    this.camera.position.set(cx, Math.max(cy, groundY), cz);',
    );
    expect(renderer.match(/stepChaseFloorSmooth\(/g)).toHaveLength(1);
  });
});

// The "camera shakes sometimes when running" report. While the orbit rides the
// floor, the camera height IS the floor sampled under it, and the built-in
// ground steps at every walk lift (kerbs, stones, bridge ends): the camera
// used to pop the full step in one frame while its aim moved smoothly.
describe('chase camera floor smoothing', () => {
  const RUN = 7; // yd/s, the sim's RUN_SPEED
  const cadences: Array<{ name: string; dts: number[] }> = [
    { name: '30 Hz', dts: [1 / 30] },
    { name: '60 Hz', dts: [1 / 60] },
    { name: '144 Hz', dts: [1 / 144] },
    { name: 'uneven', dts: [1 / 144, 1 / 60, 1 / 90, 1 / 40, 1 / 120] },
  ];

  // The first real kerb-sized rise in the built-in ground along the scanned
  // rows (a walk-lift edge: a jump inside 0.1 yd with near-level ground on
  // both sides): a camera running across it on the floor is the bug's path.
  function findRealStep(): { x: number; z: number; rise: number } {
    const g = (x: number, z: number) => groundHeight(x, z, WORLD_SEED);
    for (let z = -400; z <= 400; z += 2) {
      let prev = g(-400, z);
      for (let x = -399.9; x <= 400; x += 0.1) {
        const h = g(x, z);
        const rise = h - prev;
        if (
          rise > 0.15 &&
          rise <= CHASE_FLOOR_SLACK &&
          Math.abs(g(x - 1.1, z) - prev) < 0.08 &&
          Math.abs(g(x + 1, z) - h) < 0.08
        )
          return { x, z, rise };
        prev = h;
      }
    }
    throw new Error('no kerb-sized step in the scanned ground');
  }

  it('glides a camera riding the floor across a real ground step instead of popping it', () => {
    const step = findRealStep();
    for (const { name, dts } of cadences) {
      const smooth = createChaseFloorSmooth();
      let x = step.x - 3;
      let prevRaw = Number.NaN;
      let prevSmooth = Number.NaN;
      // Worst vertical camera SPEED over one frame (yd/s).
      let rawWorst = 0;
      let smoothWorst = 0;
      for (let i = 0; x < step.x + 3; i++) {
        const dt = dts[i % dts.length];
        x += RUN * dt;
        // The orbit sits below the floor here, so the drawn height is the floor.
        const raw = chaseCameraFloorY(x, step.z, WORLD_SEED, null);
        const drawn = stepChaseFloorSmooth(smooth, raw, dt);
        expect(drawn, name).toBeGreaterThanOrEqual(raw - CHASE_FLOOR_SLACK - 1e-9);
        if (Number.isFinite(prevRaw)) {
          rawWorst = Math.max(rawWorst, Math.abs(raw - prevRaw) / dt);
          smoothWorst = Math.max(smoothWorst, Math.abs(drawn - prevSmooth) / dt);
        }
        prevRaw = raw;
        prevSmooth = drawn;
      }
      // Unsmoothed, the whole step lands inside one frame, so the camera's
      // vertical speed spikes with the frame rate (about 4.5 to 22 yd/s here).
      expect(rawWorst, name).toBeGreaterThan(4);
      // Smoothed, it is bounded by the step times the follow rate at any
      // frame rate, on top of the slope the run is climbing anyway.
      expect(smoothWorst, name).toBeLessThan(4);
    }
  });

  it('never lets the camera lag more than the slack under the floor, and settles on it', () => {
    const s = createChaseFloorSmooth();
    expect(stepChaseFloorSmooth(s, 10, 1 / 60)).toBe(10);
    // a rise bigger than the slack: the camera comes up at once to raw - slack
    expect(stepChaseFloorSmooth(s, 11, 1 / 60)).toBeCloseTo(11 - CHASE_FLOOR_SLACK, 9);
    let y = 0;
    for (let i = 0; i < 60; i++) y = stepChaseFloorSmooth(s, 11, 1 / 60);
    expect(y).toBeCloseTo(11, 3);
    // a drop eases down rather than falling away in one frame
    const first = stepChaseFloorSmooth(s, 10.5, 1 / 60);
    expect(first).toBeLessThan(11);
    expect(first).toBeGreaterThan(10.5);
  });

  it('adopts a teleport-sized gap outright, and passes a non-finite floor through', () => {
    const s = createChaseFloorSmooth();
    stepChaseFloorSmooth(s, 0, 1 / 60);
    expect(stepChaseFloorSmooth(s, CHASE_FLOOR_SNAP + 1, 1 / 60)).toBe(CHASE_FLOOR_SNAP + 1);
    expect(stepChaseFloorSmooth(s, -40, 1 / 60)).toBe(-40);
    expect(stepChaseFloorSmooth(s, Number.NEGATIVE_INFINITY, 1 / 60)).toBe(
      Number.NEGATIVE_INFINITY,
    );
    expect(stepChaseFloorSmooth(s, -40, 1 / 60)).toBe(-40);
  });
});
