// One house per ACCOUNT (Wyndlewood owner decision): the pure merge plan
// (server/account_house_merge.ts) and the sim-side refusal of a second house.
// The seeded multi-character suite builds whole accounts of saved houses from a
// fixed Rng seed and proves the plan is lossless: every stored item and every
// placed piece of a released house reappears in the kept house's storage, and
// the kept record still loads through the one sim load path.
import { describe, expect, it } from 'vitest';
import {
  furnishedCount,
  houseItemTotal,
  isHouseRecord,
  planAccountHouseMerge,
} from '../server/account_house_merge';
import { FURNITURE_DEFS, HOUSE_STORAGE_CHEST_ITEM_ID } from '../src/sim/content/furniture';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import { ITEMS } from '../src/sim/data';
import { HOUSE_COTTAGE_ANCHORS } from '../src/sim/housing/cottage_layout';
import { sanitizeHouseState } from '../src/sim/housing/house_state';
import { buyHouse, houseEntryKey } from '../src/sim/housing/ownership';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';

const LOT_A = HOUSE_LOTS[0].id;
const LOT_B = HOUSE_LOTS[1].id;
const STORABLE = ['copper_ore', 'iron_ore', 'ashwood_log', 'spider_silk', 'rough_hide'].filter(
  (id) => ITEMS[id] !== undefined,
);

/** A random saved house: some anchors furnished (a chest first when any), some
 *  stored stacks. Deterministic from the Rng. */
function seededHouse(rng: Rng, lot: string, boughtDay: string): Record<string, unknown> {
  const furniture: Record<string, string> = {};
  for (const anchor of HOUSE_COTTAGE_ANCHORS) {
    if (!rng.chance(0.5)) continue;
    const fits = FURNITURE_DEFS.filter((def) => def.kind === anchor.kind);
    if (fits.length === 0) continue;
    furniture[anchor.id] = fits[rng.int(0, fits.length - 1)].itemId;
  }
  const storage: { itemId: string; count: number }[] = [];
  const stacks = rng.int(0, 6);
  for (let i = 0; i < stacks; i++) {
    storage.push({ itemId: STORABLE[rng.int(0, STORABLE.length - 1)], count: rng.int(1, 5) });
  }
  return {
    lot,
    ...(boughtDay ? { boughtDay } : {}),
    ...(Object.keys(furniture).length ? { furniture } : {}),
    ...(storage.length ? { storage } : {}),
  };
}

describe('planAccountHouseMerge', () => {
  it('leaves an account with one house (or none) alone', () => {
    expect(planAccountHouseMerge([])).toBeNull();
    expect(planAccountHouseMerge([{ characterId: 1, house: { lot: LOT_A } }])).toBeNull();
    expect(
      planAccountHouseMerge([
        { characterId: 1, house: { lot: LOT_A } },
        { characterId: 2, house: 'junk' },
      ]),
    ).toBeNull();
  });

  it('keeps the most-furnished house and moves everything else into its storage', () => {
    const rich = {
      lot: LOT_A,
      boughtDay: '2026-11-03',
      furniture: { hearth_floor_1: 'furn_wooden_chair', hearth_rug_1: 'furn_woven_rug' },
    };
    const poor = {
      lot: LOT_B,
      boughtDay: '2026-11-01',
      furniture: { bedroom_wall_1: 'furn_bookcase' },
      storage: [{ itemId: 'linen_cloth', count: 4, instance: { signer: 'Ada' } }],
    };
    const plan = planAccountHouseMerge([
      { characterId: 7, house: poor },
      { characterId: 9, house: rich },
    ]);
    expect(plan?.keptCharacterId).toBe(9);
    expect(plan?.released.map((r) => r.characterId)).toEqual([7]);
    expect(plan?.released[0].originalHouse).toEqual(poor);
    expect(plan?.keptHouse).toEqual({
      ...rich,
      storage: [
        { itemId: 'linen_cloth', count: 4, instance: { signer: 'Ada' } },
        { itemId: 'furn_bookcase', count: 1 },
      ],
    });
  });

  it('breaks a furnishing tie by the oldest house, then the oldest character', () => {
    const a = { lot: LOT_A, boughtDay: '2026-11-04' };
    const b = { lot: LOT_B, boughtDay: '2026-10-30' };
    const undated = { lot: LOT_B };
    expect(
      planAccountHouseMerge([
        { characterId: 1, house: a },
        { characterId: 2, house: b },
      ])?.keptCharacterId,
    ).toBe(2);
    expect(
      planAccountHouseMerge([
        { characterId: 1, house: undated },
        { characterId: 2, house: a },
      ])?.keptCharacterId,
    ).toBe(2);
    expect(
      planAccountHouseMerge([
        { characterId: 5, house: { lot: LOT_A } },
        { characterId: 3, house: { lot: LOT_B } },
      ])?.keptCharacterId,
    ).toBe(3);
  });
});

describe('seeded multi-character accounts (lossless)', () => {
  it('conserves every item across 200 seeded accounts and loads the kept house', () => {
    const rng = new Rng(20261104);
    let merged = 0;
    for (let account = 0; account < 200; account++) {
      const characters = rng.int(1, 5);
      const rows = [];
      for (let c = 0; c < characters; c++) {
        const hasHouse = rng.chance(0.7);
        const day = rng.chance(0.8) ? `2026-10-${String(rng.int(10, 28))}` : '';
        rows.push({
          characterId: account * 10 + c + 1,
          house: hasHouse ? seededHouse(rng, HOUSE_LOTS[rng.int(0, 2)].id, day) : undefined,
        });
      }
      const houses = rows.filter((r) => isHouseRecord(r.house));
      const plan = planAccountHouseMerge(rows);
      if (houses.length < 2) {
        expect(plan).toBeNull();
        continue;
      }
      merged++;
      if (!plan) throw new Error('expected a plan');
      const before = houses.reduce((n, r) => n + houseItemTotal(r.house), 0);
      expect(houseItemTotal(plan.keptHouse)).toBe(before);
      expect(plan.released).toHaveLength(houses.length - 1);
      const kept = houses.find((r) => r.characterId === plan.keptCharacterId)!;
      for (const r of houses) {
        expect(furnishedCount(kept.house as never)).toBeGreaterThanOrEqual(
          furnishedCount(r.house as never),
        );
      }
      // The kept record loads through the ONE sim load path with nothing lost.
      const dropped: unknown[] = [];
      const loaded = sanitizeHouseState(plan.keptHouse, dropped as never);
      expect(dropped).toEqual([]);
      expect(loaded?.lot).toBe((kept.house as { lot: string }).lot);
      const storedCount = loaded!.storage.reduce((n, s) => n + s.count, 0);
      const placed = Object.keys(loaded!.furniture).length;
      expect(storedCount + placed).toBe(before);
      // Re-planning the merged account (one house left) is a no-op.
      expect(
        planAccountHouseMerge([{ characterId: plan.keptCharacterId, house: plan.keptHouse }]),
      ).toBeNull();
    }
    expect(merged).toBeGreaterThan(20);
    expect(HOUSE_STORAGE_CHEST_ITEM_ID).toBe('furn_storage_chest');
  });
});

describe('the sim refuses a second house on the account', () => {
  function simAtDoor(holder?: string): Sim {
    const sim = new Sim({ seed: 3, playerClass: 'warrior' });
    const meta = sim.players.get(sim.playerId)!;
    meta.copper = 100_000_000;
    meta.accountHouseHolder = holder;
    const lot = HOUSE_LOTS[0];
    sim.player.pos.x = lot.doorPos.x;
    sim.player.pos.z = lot.doorPos.z;
    sim.player.prevPos = { ...sim.player.pos };
    return sim;
  }
  const denials = (events: readonly SimEvent[]) =>
    events.filter((e) => e.type === 'houseDenied').map((e) => (e as { reason: string }).reason);

  it('buyHouse denies account_owned and charges nothing', () => {
    const sim = simAtDoor('Elderalt');
    sim.drainEvents();
    expect(buyHouse(sim.ctx, LOT_A)).toBe(false);
    expect(denials(sim.drainEvents())).toEqual(['account_owned']);
    expect(sim.players.get(sim.playerId)!.house).toBeUndefined();
    expect(sim.players.get(sim.playerId)!.copper).toBe(100_000_000);
  });

  it('a character with no holder still buys, and the door explains instead of offering', () => {
    const free = simAtDoor();
    expect(buyHouse(free.ctx, LOT_A)).toBe(true);
    const held = simAtDoor('Elderalt');
    held.drainEvents();
    const meta = held.players.get(held.playerId)!;
    expect(houseEntryKey(held.ctx, meta, held.player, HOUSE_LOTS[0].dungeonId, false)).toBeNull();
    const events = held.drainEvents();
    expect(denials(events)).toEqual(['account_owned']);
    expect(events.some((e) => e.type === 'houseOffer')).toBe(false);
  });
});
