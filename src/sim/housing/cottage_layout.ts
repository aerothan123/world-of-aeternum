// The player house interior (Project H housing, phase 1): one small,
// single-story authored room graph every house lot opens onto. Plain numbers
// only, like the Last Keep and Dawnhold plans in ../dungeon_layout.ts, and the
// single source for BOTH the renderer's walls and floor and the sim's collider
// set: it is registered under interior 'house' in ../dungeon_floor.ts
// INTERIOR_LAYOUTS, which colliders, the floor lift and the renderer all read.
//
// Instance-local frame (x east, z north, the door at the south end). Every room
// is flat (no `lift`), so the floor needs no per-interior height arm in
// world.ts; the dais is never raised, so it only pools warm light on the
// hearth room's rug (render dungeon.ts placeDais, flat arm).
//
// The three rooms are the anchors later housing phases furnish: the hearth room
// (storage chests, trophies), the bedroom, and the workshop (home crafting
// stations). Decor here is the fixed shell dressing only; player furniture is
// per-owner state, never part of this shared plan.

import type { DungeonLayout } from '../dungeon_layout';
import type { AuthoredDecor, AuthoredDoor, AuthoredRoom } from '../rift/authored';

/** Arrival point just inside the door, 4yd north of the exit portal so zoning
 *  in never lands inside the exit's 2yd door trigger (the Last Keep rule). */
export const HOUSE_ENTRY = Object.freeze({ x: 0, z: -6 });
/** The exit portal, 2yd off the south wall. */
export const HOUSE_EXIT = Object.freeze({ x: 0, z: -10 });

const R_BRAZIER = 0.85; // measured from the shared infernal_brazier model (Dawnhold)
const R_HEARTH = 1.3; // the hell_forge hearth, as Dawnhold's parlor uses it
const R_CAULDRON = 0.7;

export const HOUSE_COTTAGE_ROOMS: readonly AuthoredRoom[] = Object.freeze([
  // The hearth room: the door opens into it from the south.
  { id: 'hearth_room', x0: -10, x1: 10, z0: -12, z1: 6 },
  // The bedroom, north-west off the hearth room.
  { id: 'bedroom', x0: -10, x1: 2, z0: 6, z1: 16 },
  // The workshop, north-east off the hearth room.
  { id: 'workshop', x0: 2, x1: 10, z0: 6, z1: 16 },
]);

export const HOUSE_COTTAGE_DOORS: readonly AuthoredDoor[] = Object.freeze([
  { x: -4, z: 6, hw: 1.4, hd: 1 }, // hearth room -> bedroom
  { x: 6, z: 6, hw: 1.2, hd: 1 }, // hearth room -> workshop
]);

export const HOUSE_COTTAGE_DECOR: readonly AuthoredDecor[] = Object.freeze([
  // Hearth room: the hearth on the west wall, a rug before it, warm light in
  // both door-side corners (clear of the 2yd exit trigger round 0,-10).
  { key: 'hell_forge', x: -8.6, z: -2, yaw: Math.PI / 2, r: R_HEARTH },
  { key: 'rug', x: -1, z: -2, yaw: 0 },
  { key: 'infernal_brazier', x: -8.4, z: -10.4, yaw: 0, r: R_BRAZIER },
  { key: 'infernal_brazier', x: 8.4, z: -10.4, yaw: 0, r: R_BRAZIER },
  // Bedroom: a rug and one corner light, off the door lane at x -4.
  { key: 'rug', x: -4, z: 12, yaw: Math.PI / 2 },
  { key: 'infernal_brazier', x: -8.4, z: 14.4, yaw: 0, r: R_BRAZIER },
  // Workshop: the cook pot in the far corner, one light by it.
  { key: 'slag_cauldron', x: 8.2, z: 14.2, yaw: 0.6, r: R_CAULDRON },
  { key: 'infernal_brazier', x: 3.6, z: 14.4, yaw: 0, r: R_BRAZIER },
]);

export const HOUSE_COTTAGE_LAYOUT: DungeonLayout = {
  zMin: -12,
  zMax: 16,
  sideWallZ: 2,
  sideWallHd: 14,
  pillars: [],
  tombs: [],
  stubs: [],
  // Never raised (the house render variant keeps a flat floor): only a warm
  // glow pooled on the hearth room rug.
  dais: { x: -1, z: -2, r: 2 },
  wallX: 10,
  endWallHw: 11,
  floorHalfX: 10,
  rooms: HOUSE_COTTAGE_ROOMS.map((r) => ({ ...r })),
  doors: HOUSE_COTTAGE_DOORS.map((d) => ({ ...d })),
  decor: HOUSE_COTTAGE_DECOR.map((d) => ({ ...d })),
};
