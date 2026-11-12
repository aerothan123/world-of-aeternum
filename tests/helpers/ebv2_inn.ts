// The Eastbrook Vale v2 inn (the Kettle and Cradle): the design's rest area
// (src/sim/eastbrook_v2/rest.ts), which replaced the shipped inn record as the
// town's rest building on the built-in world. Tests that rest a body re-site here.
import { rotY } from '../../src/sim/collider_shapes';
import { EBV2_REST_AREAS } from '../../src/sim/eastbrook_v2/layout.generated';
import { EBV2_REST_PADDING } from '../../src/sim/eastbrook_v2/rest';

const [CX, CZ, HW, HD, ROT] = EBV2_REST_AREAS[0];

/** The centre of the design inn's rest footprint. */
export const EBV2_INN = { x: CX, z: CZ } as const;

/** Points one yard outside the inn's walls all the way round (the doorstep and
 *  porch band, inside the rest padding), in world space, in a fixed order. */
export function ebv2InnDoorstepCandidates(): { x: number; z: number }[] {
  const m = Math.min(1, EBV2_REST_PADDING / 2);
  const out: { x: number; z: number }[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = -1 + (2 * i) / steps;
    for (const [lx, lz] of [
      [t * HW, HD + m],
      [t * HW, -HD - m],
      [HW + m, t * HD],
      [-HW - m, t * HD],
    ]) {
      const w = rotY(lx, lz, ROT);
      out.push({ x: CX + w.x, z: CZ + w.z });
    }
  }
  return out;
}
