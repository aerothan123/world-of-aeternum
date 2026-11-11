// The Eastbrook Vale v2 rest areas: the design's inn (the Kettle and Cradle) is where
// a body rests and earns rested XP on the built-in world (progression/xp.ts
// isResting). Its footprint is the inn's own box from the design export
// (layout.generated.ts EBV2_REST_AREAS, data/eastbrook_v2/import_config.json
// restBuildings), padded like an authored inn's. The shipped town's inn record stands
// on ground the design owns, so it rests nobody there (xp.ts skips it).
//
// Pure leaf: no rng, no clock.

import { rotY } from '../collider_shapes';
import { EBV2_REST_AREAS } from './layout.generated';

/** Yards of slack round the inn's walls that still count as resting (the doorstep
 *  and the porch), the same slack an editor-placed inn gets. */
export const EBV2_REST_PADDING = 2;

/** True when (x, z) lies in (or just beside) one of the design's rest buildings. Not
 *  world-gated: the caller gates on the built-in world. */
export function ebv2RestsAt(x: number, z: number): boolean {
  for (const [cx, cz, hw, hd, rot] of EBV2_REST_AREAS) {
    const l = rotY(x - cx, z - cz, -rot);
    if (Math.abs(l.x) <= hw + EBV2_REST_PADDING && Math.abs(l.z) <= hd + EBV2_REST_PADDING) {
      return true;
    }
  }
  return false;
}
