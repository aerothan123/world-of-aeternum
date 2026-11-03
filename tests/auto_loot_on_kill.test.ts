import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bagCapacity } from '../src/sim/bags';
import { ITEMS, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, LootEntry, MobTemplate, SimEvent } from '../src/sim/types';
import { PARTY_XP_RANGE } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';

// Kill-time Auto Loot (src/sim/loot/auto_loot_on_kill.ts), on the real sim and the
// real death path (handleDeath -> rollLoot -> autoLootOnKill): an opted-in player's
// share of a fresh corpse lands in their bags with NO interaction, following the
// group's CURRENT loot rules, and nothing that belongs to anyone else.

const COMMON = 'worn_sword'; // common: round robin under the default group rules
const JUNK = 'tangled_weed'; // poor: round robin too
const PREMIUM = 'greyjaw_hide_boots'; // uncommon: need/greed under the default rules
const TEMPLATE_ID = 'test_auto_loot_on_kill_mob';
let nextMobId = 991_000;

function registerTemplate(loot: LootEntry[]): void {
  (MOBS as Record<string, MobTemplate>)[TEMPLATE_ID] = {
    ...MOBS.forest_wolf,
    id: TEMPLATE_ID,
    loot,
  };
}

beforeEach(() => {
  registerTemplate([
    { copper: 100, chance: 1 },
    { itemId: COMMON, chance: 1 },
    { itemId: PREMIUM, chance: 1 },
  ]);
});
afterEach(() => {
  delete (MOBS as Record<string, MobTemplate>)[TEMPLATE_ID];
});

function place(sim: Sim, pid: number, x: number, z: number): void {
  const e = sim.entities.get(pid)!;
  e.pos = { x, y: 0, z };
  e.prevPos = { ...e.pos };
}

function spawnMob(sim: Sim, tapper: number): Entity {
  const mob = createMob(nextMobId++, MOBS[TEMPLATE_ID], 2, { x: 0, y: 0, z: 0 });
  mob.tappedById = tapper;
  sim.entities.set(mob.id, mob);
  return mob;
}

function kill(sim: Sim, mob: Entity, killer: number): SimEvent[] {
  sim.events.length = 0;
  sim.ctx.handleDeath(mob, sim.entities.get(killer) ?? null);
  return [...sim.events];
}

function holds(sim: Sim, itemId: string, pid: number): number {
  return sim.countItem(itemId, pid);
}

function corpseCount(mob: Entity, itemId: string): number {
  return (mob.loot?.items ?? [])
    .filter((s) => s.itemId === itemId)
    .reduce((n, s) => n + s.count, 0);
}

function fillBags(sim: Sim, pid: number): void {
  const m = sim.meta(pid)!;
  const cap = bagCapacity(m.bags);
  const gear = Object.values(ITEMS)
    .filter(
      (d) => (d.kind === 'weapon' || d.kind === 'armor') && d.id !== COMMON && d.id !== PREMIUM,
    )
    .map((d) => d.id);
  let i = 0;
  while (m.inventory.length < cap) sim.addItem(gear[i++ % gear.length], 1, pid);
}

function soloSim(): { sim: Sim; a: number } {
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    noPlayer: true,
    autoEquip: false,
  });
  const a = sim.addPlayer('warrior', 'Avery');
  place(sim, a, 0, 0);
  return { sim, a };
}

function partySim(): { sim: Sim; a: number; b: number } {
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    noPlayer: true,
    autoEquip: false,
  });
  const a = sim.addPlayer('warrior', 'Avery');
  const b = sim.addPlayer('mage', 'Bryn');
  sim.tick();
  sim.partyInvite(b, a);
  sim.partyAccept(b);
  place(sim, a, 0, 0);
  place(sim, b, 2, 0);
  return { sim, a, b };
}

describe('kill-time Auto Loot', () => {
  it('solo: the kill puts coins and every item in the bags with no interaction', () => {
    const { sim, a } = soloSim();
    sim.setAutoLoot(true, a);
    const copper = sim.meta(a)!.copper;
    const mob = spawnMob(sim, a);
    const events = kill(sim, mob, a);
    expect(sim.meta(a)!.copper).toBeGreaterThan(copper);
    expect(holds(sim, COMMON, a)).toBe(1);
    expect(holds(sim, PREMIUM, a)).toBe(1);
    expect(mob.loot).toBeNull();
    expect(events.some((e) => e.type === 'error')).toBe(false);
    // Loot lines go to the looter only.
    const lootLines = events.filter((e) => e.type === 'loot');
    expect(lootLines.length).toBeGreaterThan(0);
    expect(lootLines.every((e) => 'pid' in e && e.pid === a)).toBe(true);
  });

  it('opted out (the default): the corpse keeps everything, exactly as before', () => {
    const { sim, a } = soloSim();
    const copper = sim.meta(a)!.copper;
    const mob = spawnMob(sim, a);
    kill(sim, mob, a);
    expect(sim.meta(a)!.copper).toBe(copper);
    expect(holds(sim, COMMON, a)).toBe(0);
    expect(corpseCount(mob, COMMON)).toBe(1);
    expect(corpseCount(mob, PREMIUM)).toBe(1);
    expect(mob.loot!.copper).toBeGreaterThan(0);
  });

  it('a solo bind-on-pickup drop is taken: the player is the sole eligible looter', () => {
    const { sim, a } = soloSim();
    const bop = Object.values(ITEMS).find((d) => d.soulbound && d.quality === 'uncommon')!;
    registerTemplate([{ itemId: bop.id, chance: 1 }]);
    sim.setAutoLoot(true, a);
    const mob = spawnMob(sim, a);
    kill(sim, mob, a);
    expect(holds(sim, bop.id, a)).toBe(1);
  });

  it('nobody opted in draws no extra rng: the stream matches a sim that never heard of it', () => {
    const run = (touch: boolean) => {
      const { sim, a, b } = partySim();
      if (touch) {
        sim.setAutoLoot(false, a);
        sim.setAutoLoot(false, b);
      }
      kill(sim, spawnMob(sim, a), a);
      return sim.rng.next();
    };
    expect(run(true)).toBe(run(false));
  });

  it('full bags: what does not fit stays on the corpse and the error fires once', () => {
    const { sim, a } = soloSim();
    fillBags(sim, a);
    sim.setAutoLoot(true, a);
    const copper = sim.meta(a)!.copper;
    const mob = spawnMob(sim, a);
    const events = kill(sim, mob, a);
    expect(sim.meta(a)!.copper).toBeGreaterThan(copper);
    expect(corpseCount(mob, COMMON)).toBe(1);
    expect(corpseCount(mob, PREMIUM)).toBe(1);
    const full = events.filter(
      (e) => e.type === 'error' && 'text' in e && e.text === 'Your bags are full.',
    );
    expect(full).toHaveLength(1);
    expect(full[0]).toMatchObject({ pid: a });
  });

  it('party: coins split, each member takes only their own round-robin turn', () => {
    registerTemplate([
      { copper: 101, chance: 1 },
      { itemId: COMMON, chance: 1 },
      { itemId: JUNK, chance: 1 },
    ]);
    const { sim, a, b } = partySim();
    sim.setAutoLoot(true, a);
    sim.setAutoLoot(true, b);
    const ca = sim.meta(a)!.copper;
    const cb = sim.meta(b)!.copper;
    const mob = spawnMob(sim, a);
    kill(sim, mob, a);
    const ga = sim.meta(a)!.copper - ca;
    const gb = sim.meta(b)!.copper - cb;
    expect(ga).toBeGreaterThan(0);
    expect(gb).toBeGreaterThan(0);
    expect(Math.abs(ga - gb)).toBeLessThanOrEqual(1);
    // One drop each: the rotation handed each member exactly their own turn.
    expect(holds(sim, COMMON, a) + holds(sim, JUNK, a)).toBe(1);
    expect(holds(sim, COMMON, b) + holds(sim, JUNK, b)).toBe(1);
    expect(mob.loot).toBeNull();
  });

  it("an opted-out member's turn stays on the corpse; only the opted-in turn is taken", () => {
    registerTemplate([
      { itemId: COMMON, chance: 1 },
      { itemId: JUNK, chance: 1 },
    ]);
    const { sim, a, b } = partySim();
    sim.setAutoLoot(true, b);
    const party = sim.ctx.partyOf(a)!;
    // Point the cursor at Avery (opted out): the first kill-time recipient.
    party.lootTurn = 0;
    const mob = spawnMob(sim, a);
    kill(sim, mob, a);
    const order = mob.lootRecipientIds!;
    expect(order[0]).toBe(a);
    // Avery holds the turn, so Bryn's pass takes nothing and leaves both drops.
    expect(holds(sim, COMMON, b) + holds(sim, JUNK, b)).toBe(0);
    expect(holds(sim, COMMON, a) + holds(sim, JUNK, a)).toBe(0);
    expect(corpseCount(mob, COMMON) + corpseCount(mob, JUNK)).toBe(2);
  });

  it('a threshold item starts the need/greed roll; only the winner receives it', () => {
    registerTemplate([{ itemId: PREMIUM, chance: 1 }]);
    const { sim, a, b } = partySim();
    sim.setAutoLoot(true, a);
    sim.setAutoLoot(true, b);
    const mob = spawnMob(sim, a);
    const events = kill(sim, mob, a);
    const prompts = events.filter((e) => e.type === 'lootRoll');
    expect(prompts.map((e) => ('pid' in e ? e.pid : null)).sort()).toEqual([a, b].sort());
    // Nobody holds it while the roll is open.
    expect(holds(sim, PREMIUM, a) + holds(sim, PREMIUM, b)).toBe(0);
    const rollId = (prompts[0] as { rollId: number }).rollId;
    sim.submitLootRoll(rollId, 'pass', a);
    sim.submitLootRoll(rollId, 'need', b);
    for (let i = 0; i < 3; i++) sim.tick();
    expect(holds(sim, PREMIUM, b)).toBe(1);
    expect(holds(sim, PREMIUM, a)).toBe(0);
  });

  it('an opted-in member out of kill range gets nothing', () => {
    const { sim, a, b } = partySim();
    place(sim, b, PARTY_XP_RANGE + 50, 0);
    sim.setAutoLoot(true, b);
    const cb = sim.meta(b)!.copper;
    const mob = spawnMob(sim, a);
    kill(sim, mob, a);
    expect(sim.meta(b)!.copper).toBe(cb);
    expect(holds(sim, COMMON, b) + holds(sim, PREMIUM, b)).toBe(0);
    expect(corpseCount(mob, COMMON)).toBe(1);
  });

  it('master loot keeps the master looter assignment: the drop stays on the corpse', () => {
    registerTemplate([{ itemId: PREMIUM, chance: 1 }]);
    const { sim, a, b } = partySim();
    sim.setPartyLootMaster(true, a, 'uncommon', a);
    sim.setAutoLoot(true, a);
    sim.setAutoLoot(true, b);
    const mob = spawnMob(sim, a);
    const events = kill(sim, mob, a);
    expect(holds(sim, PREMIUM, a) + holds(sim, PREMIUM, b)).toBe(0);
    expect(corpseCount(mob, PREMIUM)).toBe(1);
    expect(events.some((e) => e.type === 'masterLoot' || e.type === 'lootRoll')).toBe(false);
  });
});
