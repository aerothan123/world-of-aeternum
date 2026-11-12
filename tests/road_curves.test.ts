// road_curves.ts: the Eastbrook Vale v2 design roads take no meander (the Unreal
// client paints them on their splines), every other road keeps it.
import { describe, expect, it } from 'vitest';
import { ROADS } from '../src/sim/data';
import { EBV2_ROADS } from '../src/sim/eastbrook_v2/layout.generated';
import { ebv2IsDesignRoad } from '../src/sim/eastbrook_v2/roads';
import { roadDistance } from '../src/sim/world';

describe('road curves', () => {
  it('reads every design road unwarped: each design waypoint lies on the road', () => {
    for (const road of EBV2_ROADS) {
      for (const [x, z] of road.points) {
        expect(roadDistance(x, z), `${road.id} (${x},${z})`).toBeLessThan(1e-6);
      }
    }
  });

  it('knows the design roads by their points, and only those', () => {
    const design = ROADS.filter((r) => ebv2IsDesignRoad(r));
    expect(design).toHaveLength(EBV2_ROADS.length);
    expect(
      ebv2IsDesignRoad([
        { x: 0, z: 0 },
        { x: 1, z: 1 },
      ]),
    ).toBe(false);
  });

  it('stops a design road at the slot edge, so the neighbour zones never read it', () => {
    // the Mirefen road ends on the north edge (4, 180) and the causeway road on the
    // east edge (180, -28): half a yard past either end the design road no longer
    // counts (the neighbour's own road, a few yards off, is the nearest there)
    expect(roadDistance(4, 180.5)).toBeGreaterThan(2);
    expect(roadDistance(180.5, -28)).toBeGreaterThan(1.5);
    expect(roadDistance(4, 179.5)).toBeLessThan(1);
  });

  it('keeps the meander on the other roads', () => {
    let warped = 0;
    for (const road of ROADS) {
      if (ebv2IsDesignRoad(road)) continue;
      for (const p of road) if (roadDistance(p.x, p.z) > 0.5) warped++;
    }
    expect(warped).toBeGreaterThan(0);
  });
});
