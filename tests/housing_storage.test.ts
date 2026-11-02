// Player housing (Project H), phase 3: the storage chests. Capacity grows per
// placed chest, deposit and withdraw round-trip through the bank's container
// move, a chest in use cannot be taken back, the gate is shut outside the
// house and away from a chest, the save round trip stays byte-equal for a
// phase-2 house, the `hst` self key rides the wire and decodes onto the
// ClientWorld mirror, and the HUD's pure view.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => {}),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  releaseCharacterLease: vi.fn(async () => true),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  loadAccountFlair: vi.fn(async () => ({ titleId: null, cosmetics: [] })),
  insertBankLedgerRow: vi.fn(async () => {}),
  insertBankLedgerRows: vi.fn(async () => {}),
}));

import { GameServer } from '../server/game';
import { emitHouseStorageSelfKey } from '../server/house_storage_wire';
import { decodeHouseStorageWire } from '../src/net/house_storage_wire';
import { HOUSE_STORAGE_CHEST_ITEM_ID } from '../src/sim/content/furniture';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import { DUNGEON_X_THRESHOLD } from '../src/sim/data';
import { sanitizeHouseState, savedHouseState } from '../src/sim/housing/house_state';
import {
  HOUSE_STORAGE_RANGE,
  houseStorageFor,
  houseStorageWireRevFor,
  isHouseChestEntity,
  nearHouseChest,
} from '../src/sim/housing/house_storage';
import {
  HOUSE_CHEST_SLOTS,
  houseStorageCapacity,
  sanitizeHouseStorage,
  storageRemovalBlocked,
} from '../src/sim/housing/house_storage_state';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { houseFeedbackPlan } from '../src/ui/hud/housing/house_feedback_view';
import {
  buildHouseStorageView,
  houseStorageSignature,
} from '../src/ui/hud/housing/house_storage_view';
import { bareClient, broadcast, fakeWs, joinServer, lastSnap } from './helpers/bare_client';

const LOT = HOUSE_LOTS[0];
const CHEST = HOUSE_STORAGE_CHEST_ITEM_ID;
const ANCHOR_A = 'hearth_floor_1';
const ANCHOR_B = 'hearth_floor_2';

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

function chestEntities(sim: Sim): Entity[] {
  return [...((sim as any).entities.values() as Iterable<Entity>)].filter(isHouseChestEntity);
}

/** Stacks as [itemId, count] pairs (provenance rides along on the real rows). */
function stacks(slots: readonly { itemId: string; count: number }[]): [string, number][] {
  return slots.map((s) => [s.itemId, s.count]);
}

function slotOf(sim: Sim, pid: number, itemId: string): number {
  return metaOf(sim, pid).inventory.findIndex((s: { itemId: string }) => s.itemId === itemId);
}

/** An owner standing inside their own house with two chests in the bags. */
function ownerInside(sim = makeSim()): { sim: Sim; pid: number } {
  const pid = sim.player.id;
  metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
  sim.addItem(CHEST, 2, pid);
  place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
  sim.tick();
  expect(sim.player.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
  return { sim, pid };
}

/** Places a chest on `anchorId` and walks the owner up to it. */
function placeChestAndApproach(sim: Sim, pid: number, anchorId: string): Entity {
  sim.placeFurniture(anchorId, slotOf(sim, pid, CHEST), pid);
  sim.tick();
  const chest = chestEntities(sim).find((e) => e.name === anchorId)!;
  expect(chest).toBeDefined();
  place(sim, pid, chest.pos.x + 1, chest.pos.z);
  sim.tick();
  return chest;
}

describe('house storage capacity (pure)', () => {
  it('grows by HOUSE_CHEST_SLOTS per placed chest and refuses a removal that would strand a slot', () => {
    expect(HOUSE_CHEST_SLOTS).toBe(12);
    const house = {
      furniture: {} as Record<string, string>,
      storage: [] as { itemId: string; count: number }[],
    };
    expect(houseStorageCapacity(house)).toBe(0);
    house.furniture[ANCHOR_A] = CHEST;
    house.furniture.hearth_rug_1 = 'furn_woven_rug';
    expect(houseStorageCapacity(house)).toBe(12);
    house.furniture[ANCHOR_B] = CHEST;
    expect(houseStorageCapacity(house)).toBe(24);
    // twelve stacks fit one chest: taking either chest back is refused
    for (let i = 0; i < 12; i++) house.storage.push({ itemId: 'minor_healing_potion', count: 1 });
    expect(storageRemovalBlocked(house, ANCHOR_A)).toBe(false);
    house.storage.push({ itemId: 'minor_healing_potion', count: 1 });
    expect(storageRemovalBlocked(house, ANCHOR_A)).toBe(true);
    expect(storageRemovalBlocked(house, ANCHOR_B)).toBe(true);
    // a non-chest anchor never blocks
    expect(storageRemovalBlocked(house, 'hearth_rug_1')).toBe(false);
  });

  it('the load path keeps every stack, clamps counts, and drops only junk payload keys', () => {
    expect(sanitizeHouseStorage(undefined)).toEqual([]);
    expect(sanitizeHouseStorage('nope')).toEqual([]);
    const dropped: string[] = [];
    const loaded = sanitizeHouseStorage(
      [
        { itemId: 'minor_healing_potion', count: 3 },
        { itemId: 'minor_healing_potion', count: -4 },
        { itemId: 'unknown_but_string', count: 2 },
        { itemId: '', count: 1 },
        null,
        { itemId: 'minor_healing_potion', count: 1, instance: { guid: 'not-a-guid' } },
      ],
      dropped,
    );
    expect(loaded.map((s) => [s.itemId, s.count])).toEqual([
      ['minor_healing_potion', 3],
      ['minor_healing_potion', 1],
      ['unknown_but_string', 2],
      ['minor_healing_potion', 1],
    ]);
    expect(dropped).toContain('house.minor_healing_potion.guid');
  });

  it('a phase-2 house saves byte-equal (no storage key) and a stocked one round-trips', () => {
    const empty = { lot: LOT.id, boughtDay: '', furniture: { [ANCHOR_A]: CHEST }, storage: [] };
    expect(savedHouseState(empty)).toEqual({ lot: LOT.id, furniture: { [ANCHOR_A]: CHEST } });
    const stocked = { ...empty, storage: [{ itemId: 'minor_healing_potion', count: 2 }] };
    const saved = savedHouseState(stocked);
    expect(stacks(saved.storage ?? [])).toEqual([['minor_healing_potion', 2]]);
    expect(saved.storage).not.toBe(stocked.storage);
    expect(stacks(sanitizeHouseState(saved)?.storage ?? [])).toEqual([['minor_healing_potion', 2]]);
    expect(sanitizeHouseState({ lot: LOT.id })?.storage).toEqual([]);
  });
});

describe('the storage chest inside the house (sim)', () => {
  it('is reachable only inside the own house near a placed chest', () => {
    const { sim, pid } = ownerInside();
    const meta = metaOf(sim, pid);
    const ctx = (sim as any).ctx;
    const e = (sim as any).entities.get(pid);
    expect(sim.houseStorage).toBeNull();
    expect(nearHouseChest(ctx, meta, e)).toBe(false);
    const chest = placeChestAndApproach(sim, pid, ANCHOR_A);
    expect(nearHouseChest(ctx, meta, e)).toBe(true);
    expect(sim.houseStorage).toEqual({ slots: [], capacity: 12, chests: 1 });
    expect(houseStorageWireRevFor(ctx, pid)).toBe(meta.houseStorageRev);
    // step out of reach
    place(sim, pid, chest.pos.x + HOUSE_STORAGE_RANGE + 1, chest.pos.z);
    sim.tick();
    expect(houseStorageFor(ctx, pid)).toBeNull();
    expect(houseStorageWireRevFor(ctx, pid)).toBeNull();
    // back near it, then leave the house entirely
    place(sim, pid, chest.pos.x + 1, chest.pos.z);
    sim.tick();
    expect(sim.houseStorage).not.toBeNull();
    sim.leaveDungeon(pid);
    sim.tick();
    expect(sim.player.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
    expect(sim.houseStorage).toBeNull();
  });

  it('deposits and withdraws whole stacks through the chest, bumping the wire revision', () => {
    const { sim, pid } = ownerInside();
    const meta = metaOf(sim, pid);
    placeChestAndApproach(sim, pid, ANCHOR_A);
    sim.addItem('minor_healing_potion', 3, pid);
    const revBefore = meta.houseStorageRev;
    sim.houseStorageDeposit(slotOf(sim, pid, 'minor_healing_potion'), pid);
    expect(eventsOfType(sim.tick(), 'houseDenied')).toEqual([]);
    expect(sim.countItem('minor_healing_potion', pid)).toBe(0);
    expect(stacks(meta.house.storage)).toEqual([['minor_healing_potion', 3]]);
    expect(meta.houseStorageRev).toBe(revBefore + 1);
    expect(stacks(sim.houseStorage?.slots ?? [])).toEqual([['minor_healing_potion', 3]]);
    // the view is a boundary clone
    sim.houseStorage!.slots[0].count = 99;
    expect(meta.house.storage[0].count).toBe(3);
    sim.houseStorageWithdraw(0, pid);
    sim.tick();
    expect(sim.countItem('minor_healing_potion', pid)).toBe(3);
    expect(meta.house.storage).toEqual([]);
    expect(meta.houseStorageRev).toBe(revBefore + 2);
  });

  it('refuses a deposit past the pooled capacity and a quest or locked copy', () => {
    const { sim, pid } = ownerInside();
    const meta = metaOf(sim, pid);
    placeChestAndApproach(sim, pid, ANCHOR_A);
    // fill the one chest with twelve distinct non-stacking slots
    for (let i = 0; i < 12; i++)
      meta.house.storage.push({ itemId: 'minor_healing_potion', count: 1 });
    sim.addItem('minor_mana_potion', 1, pid);
    sim.houseStorageDeposit(slotOf(sim, pid, 'minor_mana_potion'), pid);
    expect(eventsOfType(sim.tick(), 'houseDenied').map((e) => e.reason)).toEqual(['storage_full']);
    expect(sim.countItem('minor_mana_potion', pid)).toBe(1);
    // a second chest makes room
    placeChestAndApproach(sim, pid, ANCHOR_B);
    expect(sim.houseStorage?.capacity).toBe(24);
    sim.houseStorageDeposit(slotOf(sim, pid, 'minor_mana_potion'), pid);
    expect(eventsOfType(sim.tick(), 'houseDenied')).toEqual([]);
    expect(sim.countItem('minor_mana_potion', pid)).toBe(0);
    // a locked copy stays in the bags
    sim.addItem('minor_healing_potion', 1, pid);
    const slot = slotOf(sim, pid, 'minor_healing_potion');
    meta.inventory[slot].instance = { locked: true };
    sim.houseStorageDeposit(slot, pid);
    expect(eventsOfType(sim.tick(), 'houseDenied').map((e) => e.reason)).toEqual(['storage_item']);
  });

  it('refuses taking back a chest the storage still needs, and allows it once emptied', () => {
    const { sim, pid } = ownerInside();
    const meta = metaOf(sim, pid);
    placeChestAndApproach(sim, pid, ANCHOR_A);
    sim.addItem('minor_healing_potion', 2, pid);
    sim.houseStorageDeposit(slotOf(sim, pid, 'minor_healing_potion'), pid);
    sim.tick();
    sim.removeFurniture(ANCHOR_A, pid);
    const denied = eventsOfType(sim.tick(), 'houseDenied');
    expect(denied).toEqual([
      { type: 'houseDenied', pid, lotId: LOT.id, reason: 'storage_in_use', anchorId: ANCHOR_A },
    ]);
    expect(meta.house.furniture[ANCHOR_A]).toBe(CHEST);
    expect(chestEntities(sim)).toHaveLength(1);
    // a second chest covers the stored stack, so the first can go
    placeChestAndApproach(sim, pid, ANCHOR_B);
    sim.removeFurniture(ANCHOR_A, pid);
    expect(eventsOfType(sim.tick(), 'houseFurniture').map((e) => e.action)).toEqual(['removed']);
    expect(sim.countItem(CHEST, pid)).toBe(1);
    expect(stacks(meta.house.storage)).toEqual([['minor_healing_potion', 2]]);
    expect(houseFeedbackPlan(denied[0])).toEqual({
      kind: 'error',
      key: 'hudChrome.housing.denied.storageInUse',
      house: expect.any(String),
    });
  });

  it('refuses the moves away from a chest and interacting with the chest opens the window', () => {
    const { sim, pid } = ownerInside();
    const chest = placeChestAndApproach(sim, pid, ANCHOR_A);
    sim.addItem('minor_healing_potion', 1, pid);
    // the interact press (no target) with the chest in reach
    sim.interact(pid);
    expect(eventsOfType(sim.tick(), 'houseStorage')).toEqual([{ type: 'houseStorage', pid }]);
    // targeted press on the chest entity
    (sim as any).entities.get(pid).targetId = chest.id;
    sim.interact(pid);
    expect(eventsOfType(sim.tick(), 'houseStorage')).toEqual([{ type: 'houseStorage', pid }]);
    (sim as any).entities.get(pid).targetId = null;
    place(sim, pid, chest.pos.x + HOUSE_STORAGE_RANGE + 2, chest.pos.z);
    sim.tick();
    sim.houseStorageDeposit(slotOf(sim, pid, 'minor_healing_potion'), pid);
    sim.houseStorageWithdraw(0, pid);
    const events = sim.tick();
    expect(eventsOfType(events, 'houseDenied').map((e) => e.reason)).toEqual([
      'storage_far',
      'storage_far',
    ]);
    expect(eventsOfType(events, 'houseStorage')).toEqual([]);
  });

  it('is a no-op for a player with no house', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    sim.addItem('minor_healing_potion', 1, pid);
    sim.houseStorageDeposit(0, pid);
    expect(eventsOfType(sim.tick(), 'houseDenied').map((e) => e.reason)).toEqual(['no_house']);
    expect(sim.houseStorage).toBeNull();
  });

  it('the stored stacks persist inside the character save and reload at the chest', () => {
    const { sim, pid } = ownerInside();
    placeChestAndApproach(sim, pid, ANCHOR_A);
    sim.addItem('minor_healing_potion', 4, pid);
    sim.houseStorageDeposit(slotOf(sim, pid, 'minor_healing_potion'), pid);
    sim.tick();
    const saved = sim.serializeCharacter(pid)!;
    expect(stacks(saved.house?.storage ?? [])).toEqual([['minor_healing_potion', 4]]);
    const fresh = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const fpid = fresh.addPlayer('warrior', 'Reload', { state: saved });
    expect(stacks(metaOf(fresh, fpid).house.storage)).toEqual([['minor_healing_potion', 4]]);
    expect(metaOf(fresh, fpid).houseStorageRev).toBe(0);
  });
});

describe('the hst self key (wire)', () => {
  it('the decoder adopts a sound frame, nulls the gate, and retains on a malformed one', () => {
    expect(decodeHouseStorageWire(null)).toBeNull();
    expect(decodeHouseStorageWire({ slots: [], capacity: 12, chests: 1 })).toEqual({
      slots: [],
      capacity: 12,
      chests: 1,
    });
    expect(
      decodeHouseStorageWire({
        slots: [{ itemId: 'minor_healing_potion', count: 2 }],
        capacity: 24,
        chests: 2,
      }),
    ).toEqual({ slots: [{ itemId: 'minor_healing_potion', count: 2 }], capacity: 24, chests: 2 });
    expect(decodeHouseStorageWire({ slots: [], capacity: 13, chests: 1 })).toBeUndefined();
    expect(
      decodeHouseStorageWire({ slots: [{ itemId: '' }], capacity: 12, chests: 1 }),
    ).toBeUndefined();
    expect(decodeHouseStorageWire({ slots: [], capacity: 0, chests: 0, extra: 1 })).toBeUndefined();
    expect(decodeHouseStorageWire('x')).toBeUndefined();
  });

  it('the emitter is revision-gated and re-emits on reach lost', () => {
    const emits: [string, unknown][] = [];
    let rev: number | null = 3;
    const sim = {
      houseStorageWireRevFor: () => rev,
      houseStorageInfoFor: () => ({ slots: [], capacity: 12, chests: 1 }),
    };
    const session = {
      lastSent: {} as Record<string, string>,
      lastHouseStorageWirePid: null as number | null,
      lastHouseStorageWireRev: null as number | null,
    };
    const emit = (key: string, value: unknown) => {
      emits.push([key, value]);
      session.lastSent = { ...session.lastSent, [key]: JSON.stringify(value) };
    };
    emitHouseStorageSelfKey(emit, sim, session, 7);
    emitHouseStorageSelfKey(emit, sim, session, 7);
    expect(emits).toHaveLength(1);
    rev = 4;
    emitHouseStorageSelfKey(emit, sim, session, 7);
    expect(emits).toHaveLength(2);
    rev = null;
    emitHouseStorageSelfKey(emit, sim, session, 7);
    expect(emits[2]).toEqual(['hst', null]);
  });

  describe('end to end through the server', () => {
    let server: GameServer;
    beforeEach(() => {
      server = new GameServer();
    });

    it('rides the snapshot at a chest and decodes onto the ClientWorld mirror', () => {
      const fc = fakeWs();
      const session = joinServer(server, fc, 1, 'Owner');
      const sim = server.sim;
      const pid = session.pid;
      metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
      sim.addItem(CHEST, 1, pid);
      sim.addItem('minor_healing_potion', 2, pid);
      place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
      sim.tick();
      broadcast(server);
      const client = bareClient(pid);
      (client as any).applySnapshot(lastSnap(fc.sent));
      expect(lastSnap(fc.sent).self.hst).toBeNull();
      expect(client.houseStorage).toBeNull();
      placeChestAndApproach(sim, pid, ANCHOR_A);
      server.handleMessage(
        session,
        JSON.stringify({
          t: 'cmd',
          cmd: 'house_storage_deposit',
          slot: slotOf(sim, pid, 'minor_healing_potion'),
        }),
      );
      sim.tick();
      fc.sent.length = 0;
      broadcast(server);
      const snap = lastSnap(fc.sent);
      expect(snap.self.hst).toMatchObject({ capacity: 12, chests: 1 });
      expect(stacks(snap.self.hst.slots)).toEqual([['minor_healing_potion', 2]]);
      (client as any).applySnapshot(snap);
      expect(client.houseStorage).toMatchObject({ capacity: 12, chests: 1 });
      expect(stacks(client.houseStorage?.slots ?? [])).toEqual([['minor_healing_potion', 2]]);
      // unchanged: the key elides
      fc.sent.length = 0;
      broadcast(server);
      expect(lastSnap(fc.sent).self).not.toHaveProperty('hst');
      // the withdraw command moves it back and the mirror follows
      server.handleMessage(
        session,
        JSON.stringify({ t: 'cmd', cmd: 'house_storage_withdraw', slot: 0 }),
      );
      sim.tick();
      fc.sent.length = 0;
      broadcast(server);
      (client as any).applySnapshot(lastSnap(fc.sent));
      expect(client.houseStorage?.slots).toEqual([]);
      expect(sim.countItem('minor_healing_potion', pid)).toBe(2);
    });
  });
});

describe('the house storage view (HUD pure core)', () => {
  it('maps the mirror and the bags to two grids with the deposit admission', () => {
    expect(buildHouseStorageView(null, [])).toEqual({ kind: 'away' });
    const model = buildHouseStorageView(
      { slots: [{ itemId: 'minor_healing_potion', count: 2 }], capacity: 24, chests: 2 },
      [
        { itemId: 'minor_mana_potion', count: 1 },
        { itemId: 'minor_healing_potion', count: 1, instance: { locked: true } },
      ],
    );
    expect(model.kind).toBe('storage');
    if (model.kind !== 'storage') return;
    expect(model.stored.map((s) => [s.slotIndex, s.itemId, s.showCount])).toEqual([
      [0, 'minor_healing_potion', true],
    ]);
    expect(model.carried.map((s) => [s.slotIndex, s.allowed])).toEqual([
      [0, true],
      [1, false],
    ]);
    expect([model.used, model.total, model.chests, model.emptyCells, model.full]).toEqual([
      1,
      24,
      2,
      23,
      false,
    ]);
    const sig = houseStorageSignature({ slots: [], capacity: 12, chests: 1 }, []);
    expect(sig).toBe(houseStorageSignature({ slots: [], capacity: 12, chests: 1 }, []));
    expect(sig).not.toBe(houseStorageSignature({ slots: [], capacity: 24, chests: 2 }, []));
    expect(houseStorageSignature(null, [])).toBe('away');
  });
});
