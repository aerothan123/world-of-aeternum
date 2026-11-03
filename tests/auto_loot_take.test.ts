import { describe, expect, it } from 'vitest';
import { bagCapacity } from '../src/sim/bags';
import { ITEMS, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// Auto Loot's take (src/ui/hud/loot/auto_loot_core.ts) is the loot window's own
// Take Loot command, IWorld.lootCorpse, sent without the window. These pin what
// that one authoritative command does for the auto path, on the real sim: the
// coins and the items the player is entitled to go to the bags, an item the
// group's loot rules route to a need/greed roll starts that roll instead of
// landing in anyone's bags (the normal flow), and what does not fit stays on the
// corpse with the sim's full-bags error.

const COMMON = 'worn_sword'; // common: never opens a group roll
const PREMIUM = 'greyjaw_hide_boots'; // uncommon: opens a need/greed roll under default rules
const FRESH_CORPSE_TIMER = 60;

function teleportTo(sim: Sim, x: number, z: number, pid: number) {
  const p = sim.entities.get(pid)!;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = groundHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

function corpseFor(
  sim: Sim,
  tapper: number,
  loot: { copper: number; items: { itemId: string; count: number }[] },
) {
  const mob = createMob(990700, MOBS.forest_wolf, 2, { x: 20, y: 0, z: 22 });
  mob.dead = true;
  mob.corpseTimer = FRESH_CORPSE_TIMER;
  mob.lootable = true;
  mob.tappedById = tapper;
  mob.loot = loot;
  sim.entities.set(mob.id, mob);
  return mob;
}

function fillBags(sim: Sim, pid: number): void {
  const m = sim.meta(pid)!;
  const cap = bagCapacity(m.bags);
  const gearIds = Object.values(ITEMS)
    .filter((d) => (d.kind === 'weapon' || d.kind === 'armor') && d.id !== COMMON)
    .map((d) => d.id);
  let i = 0;
  while (m.inventory.length < cap) {
    sim.addItem(gearIds[i % gearIds.length], 1, pid);
    i++;
  }
}

describe('Auto Loot take (the Take Loot command, no window)', () => {
  it('puts the coins and the entitled items straight into the bags and empties the corpse', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: false });
    const a = sim.playerId;
    teleportTo(sim, 20, 20, a);
    const mob = corpseFor(sim, a, { copper: 57, items: [{ itemId: COMMON, count: 1 }] });
    const copperBefore = sim.meta(a)!.copper;
    const swordsBefore = sim.countItem(COMMON, a);

    sim.events.length = 0;
    sim.lootCorpse(mob.id, a);

    expect(sim.meta(a)!.copper - copperBefore).toBe(57);
    expect(sim.countItem(COMMON, a) - swordsBefore).toBe(1);
    expect(mob.loot).toBeNull();
    expect(sim.events.some((e) => e.type === 'error')).toBe(false);
  });

  it('leaves an item that does not fit on the corpse with the full-bags error, coins still taken', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: false });
    const a = sim.playerId;
    teleportTo(sim, 20, 20, a);
    fillBags(sim, a);
    const mob = corpseFor(sim, a, { copper: 30, items: [{ itemId: COMMON, count: 1 }] });
    const copperBefore = sim.meta(a)!.copper;

    sim.events.length = 0;
    sim.lootCorpse(mob.id, a);

    expect(sim.meta(a)!.copper - copperBefore).toBe(30);
    expect(sim.countItem(COMMON, a)).toBe(0);
    expect(mob.loot?.items).toEqual([expect.objectContaining({ itemId: COMMON, count: 1 })]);
    expect(mob.lootable).toBe(true);
    expect(
      sim.events.some((e) => e.type === 'error' && e.pid === a && e.text === 'Your bags are full.'),
    ).toBe(true);
  });

  it('hands a group-roll item to its need/greed roll instead of the looter, taking the rest', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: false });
    const a = sim.playerId;
    const b = sim.addPlayer('mage', 'Bert');
    sim.partyInvite(b, a);
    sim.partyAccept(b);
    teleportTo(sim, 20, 20, a);
    teleportTo(sim, 21, 20, b);
    const mob = corpseFor(sim, a, {
      copper: 0,
      items: [
        { itemId: PREMIUM, count: 1 },
        { itemId: COMMON, count: 1 },
      ],
    });
    const swordsBefore = sim.countItem(COMMON, a) + sim.countItem(COMMON, b);

    sim.events.length = 0;
    sim.lootCorpse(mob.id, a);

    // The roll opened for the party; nobody holds the item until it resolves.
    expect(
      sim.events.some((e) => e.type === 'lootRoll' && 'itemId' in e && e.itemId === PREMIUM),
    ).toBe(true);
    expect(sim.countItem(PREMIUM, a) + sim.countItem(PREMIUM, b)).toBe(0);
    // The common item still went to someone's bags on this one press.
    expect(sim.countItem(COMMON, a) + sim.countItem(COMMON, b) - swordsBefore).toBe(1);
  });
});
