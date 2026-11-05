// Desktop far-zone eviction (src/render/zone_eviction_core.ts pickZoneToEvict):
// a full-memory host keeps every zone until it holds more than the resident
// budget, then sheds the farthest zone past the eviction radius; constrained
// hosts keep their old behaviour exactly.
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_RESIDENT_ZONE_BUDGET,
  pickZoneToEvict,
  ZONE_EVICTION_RADIUS,
  zonesEligibleForEviction,
} from '../src/render/zone_eviction_core';
import { distanceSqToZone } from '../src/render/zone_streaming';
import { ZONES } from '../src/sim/data';

const all = new Set(ZONES.map((z) => z.id));
// a player at the far south-west of the world (or Eastbrook when the world is small)
const far = ZONES.reduce((a, b) => (b.zMin + (b.xMin ?? 0) < a.zMin + (a.xMin ?? 0) ? b : a));
const px = ((far.xMin ?? -180) + (far.xMax ?? 180)) / 2;
const pz = (far.zMin + far.zMax) / 2;

describe('pickZoneToEvict', () => {
  it('keeps every zone on desktop while residency is inside the budget', () => {
    const few = new Set([...all].slice(0, DESKTOP_RESIDENT_ZONE_BUDGET));
    expect(pickZoneToEvict(ZONES, few, far.id, px, pz, false)).toBeUndefined();
  });

  it('sheds the farthest zone past the radius once desktop residency exceeds the budget', () => {
    expect(all.size).toBeGreaterThan(DESKTOP_RESIDENT_ZONE_BUDGET);
    const picked = pickZoneToEvict(ZONES, all, far.id, px, pz, false);
    const eligible = zonesEligibleForEviction(ZONES, all, far.id, px, pz);
    expect(picked).toBe(eligible[0]);
    if (picked) {
      const zone = ZONES.find((z) => z.id === picked);
      expect(zone).toBeDefined();
      if (zone) {
        expect(Math.sqrt(distanceSqToZone(zone, px, pz))).toBeGreaterThan(ZONE_EVICTION_RADIUS);
      }
      expect(picked).not.toBe(far.id);
    }
  });

  it('never evicts a zone inside the radius, even far over budget', () => {
    for (const zone of ZONES) {
      const zx = ((zone.xMin ?? -180) + (zone.xMax ?? 180)) / 2;
      const zz = (zone.zMin + zone.zMax) / 2;
      const picked = pickZoneToEvict(ZONES, all, zone.id, zx, zz, false);
      if (!picked) continue;
      const pickedZone = ZONES.find((z) => z.id === picked);
      if (pickedZone) {
        expect(distanceSqToZone(pickedZone, zx, zz)).toBeGreaterThan(ZONE_EVICTION_RADIUS ** 2);
      }
    }
  });

  it('leaves constrained hosts on the original rule regardless of budget', () => {
    const one = new Set([...all].slice(0, 3));
    expect(pickZoneToEvict(ZONES, one, far.id, px, pz, true)).toBe(
      zonesEligibleForEviction(ZONES, one, far.id, px, pz)[0],
    );
  });
});
