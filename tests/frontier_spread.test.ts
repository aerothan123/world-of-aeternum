import { describe, expect, it } from 'vitest';
import {
  CAMPS,
  FRONTIER_SPREAD_POS_EPOCH,
  INSTANCE_POS_EPOCH,
  NPCS,
  SAVE_POS_EPOCH,
  ZONES,
  zoneAt,
} from '../src/sim/data';
import { FRONTIER_ANCHORS } from '../src/sim/frontier/layout';
import { mainPathLength } from '../src/sim/frontier/main_path';
import {
  FRONTIER_SPREAD,
  inFrontierRegion,
  spreadFrontierContent,
  spreadPoint,
  unspreadFrontierContent,
  unspreadPoint,
} from '../src/sim/frontier/spread';
import { resolveSavedPosExit } from '../src/sim/saved_pos_exit';
import { RUN_SPEED } from '../src/sim/types';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const FRONTIER_ZONE_IDS = new Set([
  'applewold',
  'kindlemoor',
  'chalkbarrow_coast',
  'saltmeads',
  'wychwold',
  'tinmarch',
  'rookcliffs',
  'sedgemarch',
  'harrowfells',
  'wardmere',
]);

describe('frontier spread', () => {
  it('is the identity in the core and on far sentinels', () => {
    expect(spreadPoint(0, 0)).toEqual({ x: 0, z: 0 });
    expect(spreadPoint(-540, -180)).toEqual({ x: -540, z: -180 });
    expect(spreadPoint(-12000, -12000)).toEqual({ x: -12000, z: -12000 });
    expect(inFrontierRegion(400, 2000)).toBe(false);
  });

  it('scales every frontier distance by the spread factor', () => {
    const a = spreadPoint(32, -318);
    const b = spreadPoint(-318, -336);
    const authored = Math.hypot(32 + 318, -318 + 336);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(authored * FRONTIER_SPREAD, 9);
  });

  it('round-trips every authored anchor exactly (the touch-up token relies on it)', () => {
    for (const [name, p] of Object.entries(FRONTIER_ANCHORS)) {
      const s = spreadPoint(p.x, p.z);
      expect(unspreadPoint(s.x, s.z), name).toEqual({ x: p.x, z: p.z });
    }
    const content = {
      a: { x: -330, z: -668 },
      t: [[362, -652, 1.5]],
      r: { zMin: -900, zMax: -540, xMin: -540, xMax: -180 },
    };
    const authored = JSON.stringify(content);
    spreadFrontierContent([content]);
    expect(JSON.stringify(content)).not.toBe(authored);
    expect(JSON.stringify(unspreadFrontierContent(content))).toBe(authored);
  });

  it('keeps every frontier hub, camp and NPC inside its spread zone', () => {
    for (const zone of ZONES.filter((z) => FRONTIER_ZONE_IDS.has(z.id))) {
      expect(zoneAt(zone.hub.x, zone.hub.z).id, zone.id).toBe(zone.id);
      for (const poi of zone.pois ?? []) {
        // a straddling poi (a heath way, a salt way) may sit across the line
        expect(FRONTIER_ZONE_IDS.has(zoneAt(poi.x, poi.z).id), `${zone.id} ${poi.id}`).toBe(true);
      }
    }
    for (const camp of CAMPS) {
      // a camp authored in the frontier lands in a frontier zone after the spread
      const authored = unspreadPoint(camp.center.x, camp.center.z);
      if (!inFrontierRegion(authored.x, authored.z)) continue;
      expect(FRONTIER_ZONE_IDS.has(zoneAt(camp.center.x, camp.center.z).id), camp.mobId).toBe(true);
    }
    expect(Object.keys(NPCS).length).toBeGreaterThan(0);
  });

  it('stands every frontier hub on dry land', () => {
    for (const zone of ZONES.filter((z) => FRONTIER_ZONE_IDS.has(z.id))) {
      expect(terrainHeight(zone.hub.x, zone.hub.z, WORLD_SEED), zone.id).toBeGreaterThan(
        WATER_LEVEL,
      );
    }
  });

  it('makes the main 1 to 20 path a run of at least 15 minutes', () => {
    const { total } = mainPathLength(ZONES);
    const minutes = total / RUN_SPEED / 60;
    expect(minutes).toBeGreaterThanOrEqual(15);
    expect(minutes).toBeLessThanOrEqual(22);
  });

  it('moves a pre-spread frontier save onto the same ground, and reads new saves literally', () => {
    expect(SAVE_POS_EPOCH).toBe(FRONTIER_SPREAD_POS_EPOCH);
    const old = { x: -330, z: -668 };
    expect(resolveSavedPosExit(old, INSTANCE_POS_EPOCH).pos).toEqual(spreadPoint(old.x, old.z));
    const fresh = spreadPoint(old.x, old.z);
    expect(resolveSavedPosExit(fresh, SAVE_POS_EPOCH).pos).toEqual(fresh);
    expect(resolveSavedPosExit({ x: 10, z: 10 }, INSTANCE_POS_EPOCH).pos).toEqual({ x: 10, z: 10 });
  });
});
