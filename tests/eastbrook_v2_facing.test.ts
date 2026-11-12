// Eastbrook Vale v2 facings (src/sim/eastbrook_v2/facing.ts): the town's keepers
// face the nearest design road, not the retired town kit's benches and sheds.
import { describe, expect, it } from 'vitest';
import {
  EASTBROOK_LAYOUT,
  EASTBROOK_NPC_PLACEMENTS_BY_ID,
  facingToward,
} from '../src/sim/eastbrook_layout';
import { ebv2FacingToRoad, ebv2NearestRoadPoint } from '../src/sim/eastbrook_v2/facing';
import { EBV2_ROADS } from '../src/sim/eastbrook_v2/layout.generated';
import { ebv2RoadClearance } from '../src/sim/eastbrook_v2/points';

describe('Eastbrook v2 facings', () => {
  it('finds a point on a design road centreline as near as the road clearance says', () => {
    const [x0, z0] = EBV2_ROADS[0].points[0];
    for (const [x, z] of [
      [x0 + 7, z0 - 3],
      [-20, -90],
      [10, -80],
    ]) {
      const p = ebv2NearestRoadPoint(x, z);
      expect(p).not.toBeNull();
      if (!p) continue;
      // the clearance is centreline distance less a half width, so the nearest
      // centreline point is never further than clearance plus the widest half road
      const widest = Math.max(...EBV2_ROADS.map((r) => r.width)) / 2;
      expect(Math.hypot(p.x - x, p.z - z)).toBeLessThanOrEqual(
        ebv2RoadClearance(x, z) + widest + 1e-9,
      );
    }
  });

  it('turns a body toward that road in the layout yaw convention', () => {
    const at = { x: -20, z: -90 };
    const p = ebv2NearestRoadPoint(at.x, at.z);
    if (!p) throw new Error('no design road');
    expect(ebv2FacingToRoad(at.x, at.z)).toBeCloseTo(facingToward(at, p), 12);
  });

  it('turns the station masters, the Merchant and the bursar toward their road, kit-free', () => {
    const keepers = [
      'forgemistress_darva',
      'cook_marlow',
      'weaver_ottilie',
      'tinker_gizzel',
      'tanner_tamsin',
      'the_merchant',
      'bursar_fernando',
    ];
    for (const id of keepers) {
      const npc = EASTBROOK_NPC_PLACEMENTS_BY_ID[id];
      expect(npc, id).toBeDefined();
      expect(npc.facing, id).toBeCloseTo(ebv2FacingToRoad(npc.position.x, npc.position.z), 12);
      expect(npc.anchorId.startsWith('kit_'), `${id} anchor ${npc.anchorId}`).toBe(false);
    }
    for (const station of EASTBROOK_LAYOUT.services.stations) {
      expect(Object.keys(station)).not.toContain('kitId');
      // every master stands within reach of the station they keep
      const master = EASTBROOK_NPC_PLACEMENTS_BY_ID[station.masterNpcId];
      expect(
        Math.hypot(master.position.x - station.position.x, master.position.z - station.position.z),
        station.id,
      ).toBeLessThan(station.interactionRadius);
    }
  });

  it('keeps the fallback where no direction exists (on a centreline)', () => {
    const [x, z] = EBV2_ROADS[0].points[0];
    expect(ebv2FacingToRoad(x, z, 1.25)).toBe(1.25);
  });

  it('turns the Merchant north to the market road on purpose, not by the centreline fallback', () => {
    // His yaw comes out as exactly 0. Checked: he stands yards off every
    // centreline and the nearest road point lies due north (+Z), so atan2
    // gives a true 0; a different fallback would not move him.
    const merchant = EASTBROOK_NPC_PLACEMENTS_BY_ID.the_merchant;
    const { x, z } = merchant.position;
    const road = ebv2NearestRoadPoint(x, z);
    if (!road) throw new Error('the design lost its roads');
    expect(Math.hypot(road.x - x, road.z - z)).toBeGreaterThan(1);
    expect(road.z).toBeGreaterThan(z);
    expect(ebv2FacingToRoad(x, z, 1.25)).toBe(ebv2FacingToRoad(x, z, -2));
    expect(merchant.facing).toBeCloseTo(facingToward(merchant.position, road), 9);
  });
});
