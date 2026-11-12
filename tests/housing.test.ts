// Player housing (Project H), phase 1: house lots, buying a house, the
// owner-only front door into a private interior, and persistence.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTHORED_TOWN_BUILDINGS } from '../src/sim/authored_town_registry';
import { isBlocked } from '../src/sim/colliders';
import {
  HOUSE_LOT_DUNGEON_DEFS,
  HOUSE_LOT_IDS,
  HOUSE_LOTS,
  houseLotById,
  houseLotForDungeon,
} from '../src/sim/content/house_lots';
import { DUNGEON_X_THRESHOLD, DUNGEONS, dungeonAt } from '../src/sim/data';
import { INTERIOR_LAYOUTS } from '../src/sim/dungeon_floor';
import { ebv2Point } from '../src/sim/eastbrook_v2';
import { ebv2LotBuildingId, ebv2LotDoorPointOf } from '../src/sim/eastbrook_v2/lots';
import { ebv2Site } from '../src/sim/eastbrook_v2/sites';
import { HOUSE_COTTAGE_LAYOUT, HOUSE_ENTRY, HOUSE_EXIT } from '../src/sim/housing/cottage_layout';
import {
  type HousingPlayerState,
  sanitizeHouseState,
  savedHouseState,
} from '../src/sim/housing/house_state';
import {
  HOUSE_OFFER_NOTICE_SECONDS,
  HOUSE_PURCHASE_RANGE,
  houseInstanceKey,
  houseOfferDue,
} from '../src/sim/housing/ownership';
import { enterDungeon, leaveDungeon } from '../src/sim/instances/dungeons';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const LOT = HOUSE_LOTS[0];

function makeSim(): Sim {
  return new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
}

function place(sim: Sim, pid: number, x: number, z: number): void {
  const e = (sim as any).entities.get(pid);
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = terrainHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  (sim as any).ctx.rebucket(e);
}

function metaOf(sim: Sim, pid: number) {
  return (sim as any).players.get(pid);
}

function eventsOfType<T extends SimEvent['type']>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

/** Stand just outside the door's walk-in trigger (in the leave direction). */
function standBeside(sim: Sim, pid: number, lot = LOT): void {
  place(sim, pid, lot.doorPos.x + lot.leaveOffset.x, lot.doorPos.z + lot.leaveOffset.z);
}

// Eastbrook Vale v2: a lot whose house the design rebuilt takes the design's front
// door (eastbrook_v2/sites.ts `lot:<id>`, a clear spot within 3 yd of the design's
// lot point) and a 3 yd step out of it; the rest keep their authored doors.
const V2_LOTS: Record<string, string> = JSON.parse(
  readFileSync(new URL('../data/eastbrook_v2/sites_config.json', import.meta.url), 'utf8'),
).lots;
const onV2 = (lot: { id: string }) => ebv2Site(`lot:${lot.id}`) !== undefined;

describe('house lots (content)', () => {
  it('stands every v2-rebuilt lot door at the design front door, stepping 3yd out onto clear ground', () => {
    const rebuilt = HOUSE_LOTS.filter(onV2);
    expect(rebuilt.map((lot) => lot.id).sort()).toEqual(Object.keys(V2_LOTS).sort());
    for (const lot of rebuilt) {
      const design = ebv2Point(V2_LOTS[lot.id]);
      expect(Math.hypot(lot.doorPos.x - design.x, lot.doorPos.z - design.z), lot.id).toBeLessThan(
        3.01,
      );
      const step = Math.hypot(lot.leaveOffset.x, lot.leaveOffset.z);
      expect(step, lot.id).toBeGreaterThan(2.9);
      expect(step, lot.id).toBeLessThan(3.1);
      expect(isBlocked(WORLD_SEED, lot.doorPos.x, lot.doorPos.z, 0.35), `${lot.id} door`).toBe(
        false,
      );
      const out = { x: lot.doorPos.x + lot.leaveOffset.x, z: lot.doorPos.z + lot.leaveOffset.z };
      expect(isBlocked(WORLD_SEED, out.x, out.z, 0.45), `${lot.id} step`).toBe(false);
    }
  });

  it('every lot door is its building front point, and leaving steps 3yd outward', () => {
    for (const lot of HOUSE_LOTS.filter((x) => !ebv2LotDoorPointOf(x.buildingId) && !onV2(x))) {
      const b = AUTHORED_TOWN_BUILDINGS.find((x) => x.id === lot.buildingId);
      expect(b, lot.buildingId).toBeDefined();
      if (!b) continue;
      // a lot is a house that was never a walk-in building
      expect(b.kind).toBe('house');
      expect(b.walkIn).not.toBe(true);
      expect(Math.abs(lot.doorPos.x - b.frontStandingPoint.x)).toBeLessThan(0.05);
      expect(Math.abs(lot.doorPos.z - b.frontStandingPoint.z)).toBeLessThan(0.05);
      const out = {
        x: b.frontStandingPoint.x - b.position.x,
        z: b.frontStandingPoint.z - b.position.z,
      };
      const len = Math.hypot(out.x, out.z);
      const dot = (lot.leaveOffset.x * out.x + lot.leaveOffset.z * out.z) / len;
      expect(dot).toBeGreaterThan(2.9); // points outward, about 3yd
      expect(Math.hypot(lot.leaveOffset.x, lot.leaveOffset.z)).toBeLessThan(3.1);
    }
  });

  // Re-keyed for the Eastbrook Vale v2 port: the old town kit houses (the row
  // terrace and the six street houses) are retired with the old town (owner
  // direction), so every Eastbrook lot is now a v2 design building at its
  // lot_door point. This replaces the kit-house door and facade pins.
  it('every Eastbrook lot is the v2 design building at its lot door', () => {
    const vale = HOUSE_LOTS.filter((x) => x.zoneId === 'eastbrook_vale');
    expect(vale.map((x) => x.id)).toEqual([
      'eastbrook_quay_cottage',
      'eastbrook_terrace_west',
      'eastbrook_terrace_middle',
      'eastbrook_terrace_east',
      'eastbrook_slate_townhouse',
      'eastbrook_corner_house',
      'eastbrook_stone_cottage',
      'eastbrook_red_roof_cottage',
      'eastbrook_timber_house',
      'eastbrook_green_townhouse',
    ]);
    const doors = new Set<string>();
    for (const lot of vale) {
      const pointId = V2_LOTS[lot.id];
      expect(pointId, lot.id).toBeDefined();
      expect(lot.buildingId).toBe(ebv2LotBuildingId({ doorPointId: pointId }));
      expect(ebv2LotDoorPointOf(lot.buildingId)).toBe(pointId);
      expect(ebv2Point(pointId).kind, lot.id).toBe('lot_door');
      doors.add(pointId);
    }
    // one lot per design house
    expect(doors.size).toBe(vale.length);
    // the lots elsewhere keep their authored town buildings
    for (const lot of HOUSE_LOTS.filter((x) => x.zoneId !== 'eastbrook_vale')) {
      expect(ebv2LotDoorPointOf(lot.buildingId), lot.id).toBeUndefined();
    }
  });

  it('every Eastbrook lot can be bought at its door and its owner walks in and back out', () => {
    for (const lot of HOUSE_LOTS.filter((x) => x.zoneId === 'eastbrook_vale')) {
      const sim = makeSim();
      const pid = sim.player.id;
      const meta = metaOf(sim, pid);
      meta.copper = lot.priceCopper;
      standBeside(sim, pid, lot);
      sim.buyHouse(lot.id, pid);
      expect(eventsOfType(sim.tick(), 'housePurchased'), lot.id).toEqual([
        { type: 'housePurchased', pid, lotId: lot.id },
      ]);
      place(sim, pid, lot.doorPos.x, lot.doorPos.z);
      sim.tick();
      expect(dungeonAt(sim.player.pos.x)?.id, `${lot.id} enters`).toBe(lot.dungeonId);
      expect(leaveDungeon((sim as any).ctx, pid)).toBe(true);
      expect(sim.player.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
      expect(
        Math.hypot(sim.player.pos.x - lot.doorPos.x, sim.player.pos.z - lot.doorPos.z),
        `${lot.id} leaves at its door`,
      ).toBeLessThan(4);
    }
  });

  it('lot ids, dungeon ids and instance indexes are unique; each lot is a walk-in def', () => {
    expect(HOUSE_LOT_IDS.size).toBe(HOUSE_LOTS.length);
    const indexes = Object.values(DUNGEONS).map((d) => d.index);
    expect(new Set(indexes).size).toBe(indexes.length);
    for (const lot of HOUSE_LOTS) {
      const def = DUNGEONS[lot.dungeonId];
      expect(def).toBe(HOUSE_LOT_DUNGEON_DEFS[lot.dungeonId]);
      expect(def.interior).toBe('house');
      expect(def.spawns).toEqual([]);
      expect(def.guideVisible).toBe(false);
      expect(houseLotForDungeon(lot.dungeonId)).toBe(lot);
      expect(houseLotById(lot.id)).toBe(lot);
      expect(lot.priceCopper).toBeGreaterThan(0);
    }
    expect(houseLotForDungeon('dawnhold_castle')).toBeUndefined();
  });

  it('the interior arrival and exit match the shared cottage plan', () => {
    expect(INTERIOR_LAYOUTS.house).toBe(HOUSE_COTTAGE_LAYOUT);
    for (const def of Object.values(HOUSE_LOT_DUNGEON_DEFS)) {
      expect(def.entry).toEqual(HOUSE_ENTRY);
      expect(def.exitOffset).toEqual(HOUSE_EXIT);
    }
    // arrival sits outside the exit portal's 2yd walk-out trigger
    expect(Math.hypot(HOUSE_ENTRY.x - HOUSE_EXIT.x, HOUSE_ENTRY.z - HOUSE_EXIT.z)).toBeGreaterThan(
      2,
    );
    // both points stand inside the hearth room
    const hearth = HOUSE_COTTAGE_LAYOUT.rooms?.find((r) => r.id === 'hearth_room');
    expect(hearth).toBeDefined();
    for (const pt of [HOUSE_ENTRY, HOUSE_EXIT]) {
      expect(pt.x).toBeGreaterThan(hearth!.x0);
      expect(pt.x).toBeLessThan(hearth!.x1);
      expect(pt.z).toBeGreaterThan(hearth!.z0);
      expect(pt.z).toBeLessThan(hearth!.z1);
    }
  });
});

describe('buying a house', () => {
  it('a buyer at the door with the price buys the house', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    const meta = metaOf(sim, pid);
    meta.copper = LOT.priceCopper + 123;
    standBeside(sim, pid);
    sim.buyHouse(LOT.id, pid);
    const events = sim.tick();
    expect(eventsOfType(events, 'housePurchased')).toEqual([
      { type: 'housePurchased', pid, lotId: LOT.id },
    ]);
    expect(meta.copper).toBe(123);
    expect(meta.house).toEqual({ lot: LOT.id, boughtDay: '', furniture: {}, storage: [] });
    expect(sim.myHouse).toEqual({ lotId: LOT.id, furniture: {} });
  });

  it('refuses an unknown lot, a second house, the out-of-range and the broke', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    const meta = metaOf(sim, pid);
    const reasonOf = (lotId: string): string | undefined => {
      sim.buyHouse(lotId, pid);
      return eventsOfType(sim.tick(), 'houseDenied')[0]?.reason;
    };
    standBeside(sim, pid);
    meta.copper = LOT.priceCopper - 1;
    expect(reasonOf('no_such_lot')).toBe('bad_lot');
    expect(reasonOf(LOT.id)).toBe('money');
    expect(meta.copper).toBe(LOT.priceCopper - 1);
    meta.copper = LOT.priceCopper * 10;
    place(sim, pid, LOT.doorPos.x + HOUSE_PURCHASE_RANGE + 5, LOT.doorPos.z);
    expect(reasonOf(LOT.id)).toBe('range');
    standBeside(sim, pid);
    expect(reasonOf(LOT.id)).toBeUndefined();
    expect(meta.house?.lot).toBe(LOT.id);
    expect(reasonOf(HOUSE_LOTS[1].id)).toBe('owned');
    expect(meta.house?.lot).toBe(LOT.id);
  });

  it('refuses a dead buyer', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    metaOf(sim, pid).copper = LOT.priceCopper;
    standBeside(sim, pid);
    sim.player.dead = true;
    sim.buyHouse(LOT.id, pid);
    expect(eventsOfType(sim.tick(), 'houseDenied')[0]?.reason).toBe('dead');
    expect(metaOf(sim, pid).house).toBeUndefined();
  });
});

describe('the front door', () => {
  it('offers the house to a non-owner instead of letting them in, once per approach', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
    const first = sim.tick();
    expect(sim.player.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
    expect(eventsOfType(first, 'houseOffer')).toEqual([
      { type: 'houseOffer', pid, lotId: LOT.id, priceCopper: LOT.priceCopper },
    ]);
    // Standing in the trigger never re-prompts, however long the stand lasts
    // (the reported bug: a prompt every notice period, stacking on screen).
    // Declining is client-side, so this is also what keeps a declined offer
    // from coming back while the player stays put.
    let repeats = 0;
    for (let i = 0; i < 20 * (HOUSE_OFFER_NOTICE_SECONDS * 3); i++) {
      repeats += eventsOfType(sim.tick(), 'houseOffer').length;
    }
    expect(repeats).toBe(0);
    // Leaving the trigger and coming back is a fresh approach: offered again.
    standBeside(sim, pid);
    for (let i = 0; i < 20; i++) expect(eventsOfType(sim.tick(), 'houseOffer')).toEqual([]);
    place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
    expect(eventsOfType(sim.tick(), 'houseOffer')).toHaveLength(1);
  });

  it('houseOfferDue: a continuing stand owes nothing, a re-approach owes one, floored', () => {
    const meta: HousingPlayerState = { furnishingSkill: 0, houseStorageRev: 0 };
    const DT = 1 / 20;
    expect(houseOfferDue(meta, LOT.id, 10)).toBe(true);
    // the next ticks of the same stand
    expect(houseOfferDue(meta, LOT.id, 10 + DT)).toBe(false);
    expect(houseOfferDue(meta, LOT.id, 10 + 2 * DT)).toBe(false);
    // a gap of two ticks breaks the stand, but the notice floor still holds
    expect(houseOfferDue(meta, LOT.id, 10 + 4 * DT)).toBe(false);
    // a re-approach past the floor is offered again
    const later = 10 + HOUSE_OFFER_NOTICE_SECONDS + 1;
    expect(houseOfferDue(meta, LOT.id, later)).toBe(true);
    expect(houseOfferDue(meta, LOT.id, later + DT)).toBe(false);
    // a different lot's door is its own approach once the floor has passed
    const other = later + HOUSE_OFFER_NOTICE_SECONDS;
    expect(houseOfferDue(meta, HOUSE_LOTS[1].id, other)).toBe(true);
    expect(meta.houseDoorStand).toEqual({ lotId: HOUSE_LOTS[1].id, at: other });
  });

  it('tells an owner of another house which house they own', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    metaOf(sim, pid).house = { lot: HOUSE_LOTS[1].id, boughtDay: '', furniture: {}, storage: [] };
    place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
    expect(eventsOfType(sim.tick(), 'houseOffer')[0]?.ownedLotId).toBe(HOUSE_LOTS[1].id);
  });

  it('lets the owner walk into a private copy of the cottage and back out', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
    place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
    sim.tick();
    expect(sim.player.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    expect(dungeonAt(sim.player.pos.x)?.id).toBe(LOT.dungeonId);
    const inst = (sim as any).ctx.instances.find(
      (i: { dungeonId: string; partyKey: string | null }) =>
        i.dungeonId === LOT.dungeonId && i.partyKey !== null,
    );
    expect(inst.partyKey).toBe(houseInstanceKey(metaOf(sim, pid)));
    expect(inst.mobIds).toEqual([]);
    // the arrival is not inside the exit trigger: another tick stays inside
    sim.tick();
    expect(sim.player.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    expect(leaveDungeon((sim as any).ctx, pid)).toBe(true);
    expect(sim.player.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
    expect(
      Math.hypot(sim.player.pos.x - LOT.doorPos.x, sim.player.pos.z - LOT.doorPos.z),
    ).toBeLessThan(4);
  });

  it('gives two owners of the same lot two separate copies, even in one party', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const a = sim.addPlayer('warrior', 'Alda');
    const b = sim.addPlayer('mage', 'Brenn');
    for (const pid of [a, b])
      metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
    sim.partyInvite(b, a);
    sim.partyAccept(b);
    expect((sim as any).ctx.partyOf(a)?.members).toContain(b);
    for (const pid of [a, b]) place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
    sim.tick();
    const ea = (sim as any).entities.get(a);
    const eb = (sim as any).entities.get(b);
    expect(ea.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    expect(eb.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    const claims = (sim as any).ctx.instances.filter(
      (i: { dungeonId: string; partyKey: string | null }) =>
        i.dungeonId === LOT.dungeonId && i.partyKey !== null,
    );
    expect(claims).toHaveLength(2);
    expect(Math.abs(ea.pos.z - eb.pos.z)).toBeGreaterThan(100);
  });

  it('admits a non-owner only through the dev-command bypass, into their own copy', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true, devCommands: true });
    const pid = sim.player.id;
    const ctx = (sim as any).ctx;
    expect(enterDungeon(ctx, LOT.dungeonId, pid)).toBe(false);
    expect(enterDungeon(ctx, LOT.dungeonId, pid, true)).toBe(true);
    expect(dungeonAt(sim.player.pos.x)?.id).toBe(LOT.dungeonId);
    expect(metaOf(sim, pid).house).toBeUndefined();
    // without dev commands the bypass flag is inert
    const prod = makeSim();
    expect(enterDungeon((prod as any).ctx, LOT.dungeonId, prod.player.id, true)).toBe(false);
  });

  it('never lets a released spirit in (a house is not a place to resurrect)', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
    sim.player.ghost = true;
    place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
    sim.tick();
    expect(sim.player.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
  });
});

describe('house persistence', () => {
  it('round-trips through the character save and is absent when never bought', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Saver');
    expect(sim.serializeCharacter(pid)?.house).toBeUndefined();
    metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '2026-11-01', furniture: {}, storage: [] };
    const saved = sim.serializeCharacter(pid)!;
    // the empty furniture map is omitted, so a phase-1 save stays byte-equal
    expect(saved.house).toEqual({ lot: LOT.id, boughtDay: '2026-11-01' });
    const sim2 = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid2 = sim2.addPlayer('warrior', 'Saver', { state: saved });
    expect(metaOf(sim2, pid2).house).toEqual({
      lot: LOT.id,
      boughtDay: '2026-11-01',
      furniture: {},
      storage: [],
    });
    expect(sim2.houseFor(pid2)).toEqual({ lotId: LOT.id, furniture: {} });
  });

  it('sanitizes: unknown lots and junk load as no house; an empty day is omitted', () => {
    expect(sanitizeHouseState(undefined)).toBeUndefined();
    expect(sanitizeHouseState('x')).toBeUndefined();
    expect(sanitizeHouseState({ lot: 'gone' })).toBeUndefined();
    expect(sanitizeHouseState({ lot: LOT.id, boughtDay: 7 })).toEqual({
      lot: LOT.id,
      boughtDay: '',
      furniture: {},
      storage: [],
    });
    expect(savedHouseState({ lot: LOT.id, boughtDay: '', furniture: {}, storage: [] })).toEqual({
      lot: LOT.id,
    });
  });
});
