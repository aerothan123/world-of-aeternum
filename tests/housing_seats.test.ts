// Player housing (Project H): placed house chairs, stools and benches are seats
// (src/sim/housing/house_seats.ts) through the ordinary sit command.
import { describe, expect, it } from 'vitest';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import { furnitureItemOf, isFurnitureTemplateId } from '../src/sim/housing/furniture_template';
import {
  HOUSE_SEAT_PIECES,
  HOUSE_SEAT_STAND,
  houseSeatFromPiece,
  houseSeatId,
  isHouseSeatPiece,
} from '../src/sim/housing/house_seats';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const LOT = HOUSE_LOTS[0];

function setPos(sim: Sim, pid: number, x: number, z: number, y?: number): void {
  const e = (sim as any).entities.get(pid);
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = y ?? terrainHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  (sim as any).ctx.rebucket(e);
}

function furnished(pieces: Record<string, string>): {
  sim: Sim;
  pid: number;
  byItem: Map<string, Entity>;
} {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
  const pid = sim.player.id;
  const meta = (sim as any).players.get(pid);
  meta.house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
  for (const item of Object.values(pieces)) sim.addItem(item, 1, pid);
  setPos(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
  sim.tick();
  for (const [anchor, item] of Object.entries(pieces)) {
    const slot = meta.inventory.findIndex((s: { itemId: string } | null) => s && s.itemId === item);
    sim.placeFurniture(anchor, slot, pid);
    sim.tick();
  }
  const byItem = new Map<string, Entity>();
  for (const e of (sim as any).entities.values() as Iterable<Entity>) {
    if (isFurnitureTemplateId(e.templateId)) byItem.set(furnitureItemOf(e.templateId) as string, e);
  }
  return { sim, pid, byItem };
}

describe('house seats', () => {
  it('only chairs, stools and benches are seat pieces', () => {
    expect(Object.keys(HOUSE_SEAT_PIECES).sort()).toEqual([
      'furn_oak_bench',
      'furn_wooden_chair',
      'furn_wooden_stool',
    ]);
    expect(isHouseSeatPiece('furn_keg')).toBe(false);
    expect(houseSeatFromPiece(1, 'furn_keg', { x: 0, y: 0, z: 0 }, 0)).toBeNull();
  });

  it('the stand spot lies in front of the piece along its facing', () => {
    const s = houseSeatFromPiece(7, 'furn_wooden_chair', { x: 10, y: 2, z: 20 }, Math.PI / 2)!;
    expect(s.id).toBe('house:7');
    expect(s.standX).toBeCloseTo(10 + HOUSE_SEAT_STAND);
    expect(s.standZ).toBeCloseTo(20);
    expect(s.floorY).toBe(2);
  });

  it('the owner sits on a placed chair from its stand spot', () => {
    const { sim, pid, byItem } = furnished({ hearth_floor_2: 'furn_wooden_chair' });
    const chair = byItem.get('furn_wooden_chair')!;
    expect(chair).toBeDefined();
    const seat = houseSeatFromPiece(chair.id, 'furn_wooden_chair', chair.pos, chair.facing)!;
    setPos(sim, pid, seat.standX + 0.5, seat.standZ, chair.pos.y);
    sim.sitOnSeat(houseSeatId(chair.id), pid);
    const me = (sim as any).entities.get(pid) as Entity;
    expect(me.sitting).toBe(true);
    expect(me.pos.x).toBeCloseTo(seat.standX);
    expect(me.pos.z).toBeCloseTo(seat.standZ);
    expect(me.facing).toBeCloseTo(chair.facing);
  });

  it('refuses a piece that is not a seat, a forged id and a far body', () => {
    const { sim, pid, byItem } = furnished({
      hearth_floor_2: 'furn_wooden_chair',
      hearth_floor_3: 'furn_keg',
    });
    const me = (sim as any).entities.get(pid) as Entity;
    const keg = byItem.get('furn_keg')!;
    setPos(sim, pid, keg.pos.x, keg.pos.z, keg.pos.y);
    for (const id of [houseSeatId(keg.id), 'house:abc', 'house:999999']) {
      sim.sitOnSeat(id, pid);
      expect(me.sitting, id).toBeFalsy();
    }
    const chair = byItem.get('furn_wooden_chair')!;
    setPos(sim, pid, chair.pos.x + 6, chair.pos.z, chair.pos.y);
    sim.sitOnSeat(houseSeatId(chair.id), pid);
    expect(me.sitting).toBeFalsy();
  });

  it('the seat goes when the piece is taken back', () => {
    const { sim, pid, byItem } = furnished({ hearth_floor_2: 'furn_wooden_chair' });
    const chair = byItem.get('furn_wooden_chair')!;
    sim.removeFurniture('hearth_floor_2', pid);
    sim.tick();
    setPos(sim, pid, chair.pos.x, chair.pos.z, chair.pos.y);
    sim.sitOnSeat(houseSeatId(chair.id), pid);
    expect(((sim as any).entities.get(pid) as Entity).sitting).toBeFalsy();
  });
});
