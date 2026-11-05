// Classic gear durability and repair (src/sim/durability/): a death to the
// world costs every worn piece 10% of its maximum, combat wears gear a little
// (deterministic counters, no rng), a broken piece grants nothing, and armorers,
// weapon vendors and the forge masters at the anvils repair for copper scaled
// by item level and quality. Runs the real dealDamage / recalcPlayerStats /
// buyItem paths on a real Sim.
import { describe, expect, it } from 'vitest';
import { dealDamage } from '../src/sim/combat/damage';
import { BUILTIN_WORLD, ITEMS, NPCS } from '../src/sim/data';
import {
  DURABILITY_SLOTS,
  deathWearFor,
  durabilityState,
  HITS_TAKEN_PER_POINT,
  isBroken,
  maxDurabilityFor,
  npcRepairs,
  onPlayerDeathForDurability,
  REPAIR_ALL_SERVICE_ID,
  repairAllCost,
  repairCost,
} from '../src/sim/durability';
import { recalcPlayerStats } from '../src/sim/entity';
import { sanitizeItemInstancePayloadOnLoad } from '../src/sim/item_instance_load';
import { npcRoleFor } from '../src/sim/npc_role';
import { Sim } from '../src/sim/sim';
import type { Entity, ItemDef, WorldContent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { sellJunkButtonState } from '../src/ui/hud/vendor/vendor_view';
import { itemDurabilityLine } from '../src/ui/item_instance_tooltip';

const REPAIR_NPC = Object.keys(NPCS).find((id) => npcRepairs(id) && !NPCS[id].dynamic);
// Any other merchant (a food, potion or general vendor): sells, never repairs.
const FOOD_NPC = Object.keys(NPCS).find((id) => {
  const def = NPCS[id];
  const role = npcRoleFor(def);
  return !def.dynamic && (def.vendorItems?.length ?? 0) > 0 && !npcRepairs(id) && role !== null;
});
if (!REPAIR_NPC || !FOOD_NPC) throw new Error('missing a repairing or a plain merchant NPC');

const WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: BUILTIN_WORLD.camps.slice(0, 1),
  npcs: { [REPAIR_NPC]: NPCS[REPAIR_NPC], [FOOD_NPC]: NPCS[FOOD_NPC] },
  groundObjects: [],
};

const CHEST = 'recruit_tunic';

function makeSim(): Sim {
  const sim = new Sim({ seed: 7, playerClass: 'warrior', world: WORLD, autoEquip: true });
  sim.setPlayerLevel(10);
  meta(sim).equipment.chest = CHEST;
  delete meta(sim).equipmentInstance.chest;
  recalc(sim);
  return sim;
}

function meta(sim: Sim) {
  const m = sim.players.get(sim.playerId);
  if (!m) throw new Error('missing meta');
  return m;
}

function recalc(sim: Sim): void {
  const m = meta(sim);
  recalcPlayerStats(sim.player, m.cls, m.equipment, sim.ctx.playerMods(m), m.equipmentInstance);
}

function npcEntity(sim: Sim, templateId: string): Entity {
  const npc = [...sim.entities.values()].find(
    (e) => e.kind === 'npc' && e.templateId === templateId,
  );
  if (!npc) throw new Error(`missing npc ${templateId}`);
  return npc;
}

function standAt(sim: Sim, npc: Entity): void {
  const { x, z } = npc.pos;
  sim.player.pos.x = x;
  sim.player.pos.z = z;
  sim.player.pos.y = terrainHeight(x, z, sim.cfg.seed);
  sim.player.prevPos = { ...sim.player.pos };
}

const mobLike = (sim: Sim): Entity => {
  const mob = [...sim.entities.values()].find((e) => e.kind === 'mob' && !e.dead);
  if (!mob) throw new Error('missing mob');
  return mob;
};

describe('durability rules (classic values)', () => {
  it('maxima follow the classic slot table, scaled by quality', () => {
    const chest = (quality: ItemDef['quality']) =>
      ({ id: 'x', name: 'x', kind: 'armor', slot: 'chest', quality }) as ItemDef;
    expect(maxDurabilityFor(chest('uncommon'))).toBe(100);
    expect(maxDurabilityFor(chest('common'))).toBe(80);
    expect(maxDurabilityFor(chest('rare'))).toBe(120);
    expect(maxDurabilityFor({ id: 'r', name: 'r', kind: 'armor', slot: 'ring' } as ItemDef)).toBe(
      0,
    );
    expect(maxDurabilityFor(undefined)).toBe(0);
    expect(maxDurabilityFor(ITEMS[CHEST])).toBe(80);
  });

  it('a death costs 10% (at least one point); a broken piece is the max', () => {
    expect(deathWearFor(ITEMS[CHEST])).toBe(8);
    expect(isBroken(ITEMS[CHEST], 79)).toBe(false);
    expect(isBroken(ITEMS[CHEST], 80)).toBe(true);
    expect(isBroken(ITEMS[CHEST], 999)).toBe(true);
    expect(durabilityState(ITEMS[CHEST], 0)).toBe('ok');
    expect(durabilityState(ITEMS[CHEST], 70)).toBe('low');
    expect(durabilityState(ITEMS[CHEST], 80)).toBe('broken');
  });

  it('repair cost scales with item level and quality, zero when undamaged', () => {
    expect(repairCost(ITEMS[CHEST], 0)).toBe(0);
    const per = repairCost(ITEMS[CHEST], 1);
    expect(per).toBeGreaterThan(0);
    expect(repairCost(ITEMS[CHEST], 10)).toBe(per * 10);
    const base = { id: 'y', name: 'y', kind: 'armor', slot: 'chest', requiredLevel: 10 } as ItemDef;
    const low = { ...base, requiredLevel: 2, quality: 'uncommon' } as ItemDef;
    const uncommon = { ...base, quality: 'uncommon' } as ItemDef;
    const rare = { ...base, quality: 'rare' } as ItemDef;
    expect(repairCost(rare, 10)).toBeGreaterThan(repairCost(uncommon, 10));
    expect(repairCost(uncommon, 10)).toBeGreaterThanOrEqual(repairCost(low, 10));
  });
});

describe('wear on death', () => {
  it('a death to a mob costs every worn piece with durability 10%', () => {
    const sim = makeSim();
    const mob = mobLike(sim);
    onPlayerDeathForDurability(sim.ctx, sim.player, mob);
    expect(meta(sim).equipmentInstance.chest?.wear).toBe(8);
    for (const slot of DURABILITY_SLOTS) {
      const id = meta(sim).equipment[slot];
      if (!id || maxDurabilityFor(ITEMS[id]) === 0) {
        expect(meta(sim).equipmentInstance[slot]?.wear).toBeUndefined();
      } else {
        expect(meta(sim).equipmentInstance[slot]?.wear).toBe(deathWearFor(ITEMS[id]));
      }
    }
  });

  it('a real lethal hit runs the hook once', () => {
    const sim = makeSim();
    dealDamage(sim.ctx, mobLike(sim), sim.player, 1_000_000, false, 'physical', null, 'hit');
    expect(sim.player.dead).toBe(true);
    expect(meta(sim).equipmentInstance.chest?.wear).toBe(8);
  });

  it('dying to a player (or a player pet) costs nothing', () => {
    const sim = makeSim();
    const otherId = sim.addPlayer('rogue', 'Duelist');
    const other = sim.entities.get(otherId) as Entity;
    onPlayerDeathForDurability(sim.ctx, sim.player, other);
    const pet = mobLike(sim);
    const ownerBefore = pet.ownerId;
    pet.ownerId = otherId;
    onPlayerDeathForDurability(sim.ctx, sim.player, pet);
    pet.ownerId = ownerBefore;
    expect(meta(sim).equipmentInstance.chest?.wear).toBeUndefined();
  });
});

describe('combat wear (deterministic, no rng)', () => {
  it('one armor point per HITS_TAKEN_PER_POINT landed mob hits, the same on every run', () => {
    const run = () => {
      const sim = makeSim();
      sim.player.hp = sim.player.maxHp = 1_000_000;
      const mob = mobLike(sim);
      for (let i = 0; i < HITS_TAKEN_PER_POINT * 3; i++) {
        dealDamage(sim.ctx, mob, sim.player, 1, false, 'physical', null, 'hit');
      }
      return DURABILITY_SLOTS.map((s) => meta(sim).equipmentInstance[s]?.wear ?? 0);
    };
    const a = run();
    expect(a.reduce((x, y) => x + y, 0)).toBe(3);
    expect(run()).toEqual(a);
  });
});

describe('broken gear grants nothing', () => {
  it('a broken chest stops adding armor until repaired', () => {
    const sim = makeSim();
    const whole = sim.player.stats.armor;
    meta(sim).equipmentInstance.chest = { wear: 80 };
    recalc(sim);
    expect(sim.player.stats.armor).toBeLessThan(whole);
    meta(sim).equipmentInstance.chest = { wear: 79 };
    recalc(sim);
    expect(sim.player.stats.armor).toBe(whole);
  });
});

describe('repair all', () => {
  it('repairs worn and bagged copies at a repairing vendor for the quoted price', () => {
    const sim = makeSim();
    const m = meta(sim);
    m.equipmentInstance.chest = { wear: 80 };
    m.inventory.push({ itemId: CHEST, count: 1, instance: { wear: 10, signer: 'Ada' } });
    recalc(sim);
    const cost = repairAllCost(m);
    expect(cost).toBe(repairCost(ITEMS[CHEST], 80) + repairCost(ITEMS[CHEST], 10));
    m.copper = cost + 5;
    const npc = npcEntity(sim, REPAIR_NPC);
    standAt(sim, npc);
    const armorBroken = sim.player.stats.armor;
    sim.buyItem(npc.id, REPAIR_ALL_SERVICE_ID);
    expect(m.copper).toBe(5);
    expect(m.equipmentInstance.chest).toBeUndefined();
    const bagged = m.inventory.find((s) => s.itemId === CHEST && s.instance?.signer === 'Ada');
    expect(bagged?.instance).toEqual({ signer: 'Ada' });
    expect(sim.player.stats.armor).toBeGreaterThan(armorBroken);
    expect(repairAllCost(m)).toBe(0);
  });

  it('refuses at a food vendor, with nothing to repair, and without the copper', () => {
    const sim = makeSim();
    const m = meta(sim);
    const food = npcEntity(sim, FOOD_NPC);
    const smith = npcEntity(sim, REPAIR_NPC);
    m.equipmentInstance.chest = { wear: 40 };
    m.copper = 1_000_000;
    standAt(sim, food);
    sim.buyItem(food.id, REPAIR_ALL_SERVICE_ID);
    expect(m.equipmentInstance.chest?.wear).toBe(40);
    standAt(sim, smith);
    m.copper = 0;
    sim.buyItem(smith.id, REPAIR_ALL_SERVICE_ID);
    expect(m.equipmentInstance.chest?.wear).toBe(40);
    m.copper = 1_000_000;
    sim.buyItem(smith.id, REPAIR_ALL_SERVICE_ID);
    const after = m.copper;
    sim.buyItem(smith.id, REPAIR_ALL_SERVICE_ID);
    expect(m.copper).toBe(after);
  });

  it('the vendor window offers Repair All only at a repairing NPC, quoting the full cost', () => {
    const sim = makeSim();
    meta(sim).equipmentInstance.chest = { wear: 8 };
    const gear = { equipment: sim.equipment, equipmentInstances: sim.equipmentInstances };
    const at = sellJunkButtonState(sim.inventory, ITEMS, gear, { templateId: REPAIR_NPC });
    expect(at.repair).toEqual({ cost: repairCost(ITEMS[CHEST], 8) });
    const food = sellJunkButtonState(sim.inventory, ITEMS, gear, { templateId: FOOD_NPC });
    expect(food.repair).toBeUndefined();
    expect(sellJunkButtonState(sim.inventory, ITEMS).repair).toBeUndefined();
  });
});

describe('persistence and tooltip', () => {
  it('the load sanitizer keeps a legal wear and drops a bad one alone', () => {
    expect(sanitizeItemInstancePayloadOnLoad({ wear: 12 }).dropped).toEqual([]);
    for (const bad of [-1, 1.5, '3', 20_000]) {
      const out = sanitizeItemInstancePayloadOnLoad({ wear: bad, signer: 'Ada' });
      expect(out.dropped).toContain('wear');
      expect(out.payload).toEqual({ signer: 'Ada' });
    }
  });

  it('the item card shows Durability current / max, red when broken', () => {
    expect(itemDurabilityLine(ITEMS[CHEST])).toContain('80 / 80');
    expect(itemDurabilityLine(ITEMS[CHEST], { wear: 30 })).toContain('50 / 80');
    expect(itemDurabilityLine(ITEMS[CHEST], { wear: 80 })).toContain('tt-red');
    expect(itemDurabilityLine({ id: 'r', name: 'r', kind: 'armor', slot: 'ring' } as ItemDef)).toBe(
      '',
    );
  });
});
