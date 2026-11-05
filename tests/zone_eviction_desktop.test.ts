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
import { distanceSqToZone, MAX_OUTDOOR_FOG_FAR } from '../src/render/zone_streaming';
import { ZONES, zoneContaining } from '../src/sim/data';

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

// The long-session check: a scripted grand tour of the expanded world (every
// zone hub, south-west corner to the far north and back, several laps), with a
// streaming model that prepares every zone within the widest fog reach of the
// player and a desktop host that evicts one zone per step the way
// Renderer.evictFarZoneIfConstrained does. Residency must stay bounded by the
// budget or by what the radius rule is obliged to keep, the tour must shed
// zones (the frontier makes the full set larger than the budget), and a zone
// must never thrash (evicted and re-prepared while the player walks away).
describe('desktop residency over a long session', () => {
  const hubs = ZONES.map((z) => z.hub).sort((a, b) => a.z - b.z || a.x - b.x);
  const route = [...hubs, ...[...hubs].reverse()];
  const keepRadiusSq = ZONE_EVICTION_RADIUS * ZONE_EVICTION_RADIUS;
  const prepareRadiusSq = MAX_OUTDOOR_FOG_FAR * MAX_OUTDOOR_FOG_FAR;

  it('stays bounded, sheds far zones and never thrashes', () => {
    const resident = new Set<string>();
    let evictions = 0;
    let worstExcess = 0;
    const evictedAt = new Map<string, number>();
    let thrash = 0;
    let step = 0;
    for (let lap = 0; lap < 4; lap++) {
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1];
        const b = route[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 20));
        for (let s = 0; s <= n; s++, step++) {
          const x = a.x + ((b.x - a.x) * s) / n;
          const z = a.z + ((b.z - a.z) * s) / n;
          const here = zoneContaining(x, z)?.id ?? null;
          for (const zone of ZONES) {
            if (distanceSqToZone(zone, x, z) <= prepareRadiusSq && !resident.has(zone.id)) {
              const last = evictedAt.get(zone.id);
              if (last !== undefined && step - last < 3) thrash++;
              resident.add(zone.id);
            }
          }
          const id = pickZoneToEvict(ZONES, resident, here, x, z, false);
          if (id) {
            resident.delete(id);
            evictedAt.set(id, step);
            evictions++;
          }
          const mustKeep = ZONES.filter(
            (zone) => resident.has(zone.id) && distanceSqToZone(zone, x, z) <= keepRadiusSq,
          ).length;
          // one eviction per step: residency may lead the bound by one step's
          // worth of newly prepared zones, never more
          const bound = Math.max(DESKTOP_RESIDENT_ZONE_BUDGET, mustKeep);
          worstExcess = Math.max(worstExcess, resident.size - bound);
        }
      }
    }
    expect(ZONES.length).toBeGreaterThan(DESKTOP_RESIDENT_ZONE_BUDGET);
    expect(evictions).toBeGreaterThan(0);
    expect(worstExcess).toBeLessThanOrEqual(2);
    expect(thrash).toBe(0);
  });
});
