// The region slot grid (src/sim/frontier/slots.ts): every live zone sits in
// exactly its slot, slots never overlap, reserved slots hold no zone yet, and
// every frontier zone opts out of generated border ridges.
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/sim/data';
import { SLOT_CONNECTORS, slotAt, WORLD_SLOTS } from '../src/sim/frontier/slots';
import { unspreadFrontierContent } from '../src/sim/frontier/spread';
import { isFrontierZone } from '../src/sim/frontier/touchup_scope';

const overlap = (a: (typeof WORLD_SLOTS)[number], b: (typeof WORLD_SLOTS)[number]) =>
  a.xMin < b.xMax && b.xMin < a.xMax && a.zMin < b.zMax && b.zMin < a.zMax;

describe('world slot grid', () => {
  it('has unique ids and non-overlapping rects on the 10yd decoration lattice', () => {
    expect(new Set(WORLD_SLOTS.map((s) => s.id)).size).toBe(WORLD_SLOTS.length);
    for (let i = 0; i < WORLD_SLOTS.length; i++) {
      const a = WORLD_SLOTS[i];
      for (const v of [a.xMin, a.xMax, a.zMin, a.zMax]) expect(Math.abs(v % 10), a.id).toBe(0);
      for (let j = i + 1; j < WORLD_SLOTS.length; j++) {
        expect(overlap(a, WORLD_SLOTS[j]), `${a.id} x ${WORLD_SLOTS[j].id}`).toBe(false);
      }
    }
  });

  it('places every live zone in a slot of its own id and exact rect', () => {
    // slots are laid out in the AUTHORED frame; the live frontier is spread
    // (src/sim/frontier/spread.ts), so compare the zone mapped back
    for (const zone of unspreadFrontierContent(ZONES)) {
      const slot = WORLD_SLOTS.find((s) => s.zoneId === zone.id);
      expect(slot, zone.id).toBeDefined();
      if (!slot) continue;
      expect(slot.status, zone.id).not.toBe('reserved');
      expect([slot.xMin, slot.xMax, slot.zMin, slot.zMax], zone.id).toEqual([
        zone.xMin ?? -180,
        zone.xMax ?? 180,
        zone.zMin,
        zone.zMax,
      ]);
      expect(slot.levels, zone.id).toEqual(zone.levelRange);
    }
  });

  it('keeps reserved slots empty and every open slot filled', () => {
    const live = new Set(ZONES.map((z) => z.id));
    for (const slot of WORLD_SLOTS) {
      if (slot.status === 'reserved') expect(live.has(slot.zoneId), slot.id).toBe(false);
      else expect(live.has(slot.zoneId), slot.id).toBe(true);
    }
  });

  it('marks every frontier zone openBorders and every shipped one not', () => {
    for (const zone of ZONES) {
      const slot = WORLD_SLOTS.find((s) => s.zoneId === zone.id);
      const frontier = slot?.status === 'open';
      expect(isFrontierZone(zone), zone.id).toBe(frontier);
      expect(zone.openBorders === true, zone.id).toBe(frontier);
    }
  });

  it('declares connectors between real slots, standing on one of them', () => {
    for (const c of SLOT_CONNECTORS) {
      for (const id of c.slots)
        expect(
          WORLD_SLOTS.some((s) => s.id === id),
          c.id,
        ).toBe(true);
      const here = slotAt(c.x, c.z);
      expect(here && c.slots.includes(here.id), c.id).toBe(true);
    }
  });
});
