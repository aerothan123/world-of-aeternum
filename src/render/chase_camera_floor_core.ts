// The chase camera's floor: the lowest the camera may stand over the world at (x, z). The
// renderer's updateCamera lifts its one pose to this (Math.max with the orbit's height), so
// the camera never sinks into what the player stands on. Three-, DOM- and i18n-free.
//
//  - the ground (groundHeight: the terrain and every walk lift folded into it), a hand over;
//  - on a raised Rift tier, the same lift the sim stands entities on (a flat ground clamp
//    alone would let the camera sink into the riser);
//  - over the Great Maze's modeled hedges, which are not terrain: the camera rides over
//    their leaves the way the old terrain walls lifted it (garden_maze_core.ts).
//
// An authored map reads its own ground under the boom (authored_map/chase_boom_core.ts) and
// adds the same lifts (chaseCameraFloorLift). Interiors keep their own clamp
// (interior_camera.ts): this is only the floor.

import { isRiftPos } from '../sim/data';
import { generateRiftFloor, riftLiftAt } from '../sim/rift/rift_gen';
import { groundHeight } from '../sim/world';
import type { RiftFloorView } from '../world_api/dungeons';
import { gardenMazeCameraLift } from './garden_maze_core';

/** How far over the ground the camera's floor stands. */
export const CHASE_CAMERA_GROUND_CLEARANCE = 0.6;

/** What lifts the camera's floor over the ground at world (x, z): a raised Rift tier and
 *  the Great Maze's hedges. */
export function chaseCameraFloorLift(
  x: number,
  z: number,
  riftFloor: RiftFloorView | null,
): number {
  let lift = 0;
  if (riftFloor && isRiftPos(x)) {
    const r = riftFloor;
    const floor = generateRiftFloor(r.seed, r.baseLevel, r.floorIndex, r.upgrade);
    lift += riftLiftAt(floor, x - r.origin.x, z - r.origin.z);
  }
  return lift + gardenMazeCameraLift(x, z);
}

/** The camera's floor at world (x, z) on the built-in world: the ground a hand over, lifted
 *  over a raised Rift tier and the Great Maze's hedges. */
export function chaseCameraFloorY(
  x: number,
  z: number,
  seed: number,
  riftFloor: RiftFloorView | null,
): number {
  return (
    groundHeight(x, z, seed) + CHASE_CAMERA_GROUND_CLEARANCE + chaseCameraFloorLift(x, z, riftFloor)
  );
}

// ---------------------------------------------------------------------------
// The floor the camera is LIFTED to, smoothed. The raw floor is sampled right
// under the camera every frame, and the built-in ground is not smooth there:
// every walk lift (a kerb, a field stone, a bridge end, a prop top) is a step
// in groundHeight, and the terrain mesh has slope kinks. While the orbit rides
// the floor (running downhill with the camera behind, a low pitch, the close
// Action Cam zoom), the camera followed those steps exactly, one frame each,
// while its aim stayed on the smoothly moving avatar: the view jolted with
// every edge the camera crossed. The smoother follows the floor on a short
// exponential, but never lets the camera sit more than CHASE_FLOOR_SLACK under
// the raw floor (so it always keeps CHASE_CAMERA_GROUND_CLEARANCE minus the
// slack over the ground itself), and adopts a teleport-sized gap outright.

/** Floor follow rate (1/s): about 70 ms, a step reads as a glide, not a pop. */
export const CHASE_FLOOR_SMOOTH_RATE = 14;
/** How far under the raw floor the smoothed one may lag (yards). Leaves 0.3 of
 *  the clearance over the ground, above the camera's 0.2 near plane. */
export const CHASE_FLOOR_SLACK = 0.3;
/** A floor gap this large is a teleport or a cliff edge: adopt it (yards). */
export const CHASE_FLOOR_SNAP = 6;
const CHASE_FLOOR_MAX_DT = 0.25;

export interface ChaseFloorSmoothState {
  y: number;
  active: boolean;
}

export function createChaseFloorSmooth(): ChaseFloorSmoothState {
  return { y: 0, active: false };
}

/** Advance the smoothed floor toward this frame's raw floor; returns it. */
export function stepChaseFloorSmooth(s: ChaseFloorSmoothState, raw: number, dt: number): number {
  if (!Number.isFinite(raw)) return raw;
  if (!s.active || Math.abs(raw - s.y) > CHASE_FLOOR_SNAP) {
    s.y = raw;
    s.active = true;
    return raw;
  }
  const step = Math.min(Math.max(dt, 0), CHASE_FLOOR_MAX_DT);
  s.y = raw + (s.y - raw) * Math.exp(-CHASE_FLOOR_SMOOTH_RATE * step);
  if (s.y < raw - CHASE_FLOOR_SLACK) s.y = raw - CHASE_FLOOR_SLACK;
  return s.y;
}
