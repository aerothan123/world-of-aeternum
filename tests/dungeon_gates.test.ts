// In-dungeon gates and encounter seals (src/sim/instances/dungeon_gates.ts)
// driven through a real Sim claim of the Sunken Bastion: closed until their
// packs and bosses die, sealed once the named boss has fought for the seal
// delay (the delay's own cases: tests/dungeon_gate_seal_delay.test.ts),
// reopened on the wipe, closed again when the instance resets, and mirrored to
// collision per slot. These cases ran on the Hollow Crypt until it was retired
// (2026-11-11); the multi-boss gate case moved to the Wildheart Basin's
// Sunbone Causeway, the one gate left that waits on several bosses.

import { afterEach, describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { SUNKEN_BASTION_GATES } from '../src/sim/content/sunken_bastion';
import { BUILTIN_WORLD, DUNGEONS, instanceOrigin } from '../src/sim/data';
import { clearDungeonGateStateForTest } from '../src/sim/instances/dungeon_gate_state';
import {
  BOSS_ROOM_SEAL_DELAY_TICKS,
  DUNGEON_GATE_TEMPLATES,
  dungeonGateEntity,
  dungeonGateState,
  dungeonGateStateOf,
} from '../src/sim/instances/dungeon_gates';
import { enterDungeon, freeInstance } from '../src/sim/instances/dungeons';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import type { Entity, WorldContent } from '../src/sim/types';
import { localizeSimText } from '../src/ui/sim_i18n';

const WORLD: WorldContent = { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] };
const BASTION = 'sunken_bastion';
/** Every pack the Sea Gate, the Bailey Drawbridge and the Rampart Door wait on. */
const ROUTE_TO_OLEN = [
  ...['f1', 'f2', 'fa', 'fb', 'f3'],
  ...['b1', 'b2', 'hermit', 'bc'],
  ...['r1', 'r2', 'rc'],
];

function setup(seed = 11, dungeonId = BASTION): { sim: Sim; pid: number; inst: InstanceSlot } {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true, world: WORLD });
  const pid = sim.addPlayer('warrior', 'Gatewalker');
  expect(enterDungeon(sim.ctx, dungeonId, pid)).toBe(true);
  const inst = sim.ctx.instances.find(
    (i) => i.dungeonId === dungeonId && i.partyKey !== null,
  ) as InstanceSlot;
  sim.tick();
  return { sim, pid, inst };
}

function gate(id: string, dungeonId = BASTION) {
  const g = (DUNGEONS[dungeonId].gates ?? []).find((x) => x.id === id);
  if (!g) throw new Error(id);
  return g;
}

/** Kill every claim mob of the listed packs or templates (instant, no loot). */
function kill(sim: Sim, inst: InstanceSlot, ids: string[]): void {
  const spawns = DUNGEONS[inst.dungeonId].spawns;
  spawns.forEach((s, i) => {
    if (!ids.includes(s.packId ?? '') && !ids.includes(s.mobId)) return;
    const mob = sim.ctx.entities.get(inst.mobIds[i]) as Entity;
    mob.hp = 0;
    mob.dead = true;
    mob.aiState = 'dead';
    mob.inCombat = false;
  });
}

function blockedAt(sim: Sim, inst: InstanceSlot, id: string): boolean {
  const g = gate(id, inst.dungeonId);
  const o = instanceOrigin(DUNGEONS[inst.dungeonId].index, inst.slot);
  return isBlocked(sim.cfg.seed, o.x + g.x, o.z + g.z, 0.5);
}

function mob(sim: Sim, inst: InstanceSlot, templateId: string): Entity {
  const i = DUNGEONS[inst.dungeonId].spawns.findIndex((s) => s.mobId === templateId);
  return sim.ctx.entities.get(inst.mobIds[i]) as Entity;
}

describe('dungeon gates: the Sunken Bastion claim', () => {
  afterEach(() => clearDungeonGateStateForTest());

  it('spawns one closed gate object per gate and blocks every passage', () => {
    const { sim, inst } = setup();
    for (const g of SUNKEN_BASTION_GATES) {
      const e = dungeonGateEntity(sim.ctx, inst, g);
      expect(e, g.id).not.toBeNull();
      expect(e?.templateId, g.id).toBe(DUNGEON_GATE_TEMPLATES.closed);
      expect(blockedAt(sim, inst, g.id), g.id).toBe(true);
    }
  });

  it('the Sea Gate opens once every flats pack is dead, and says so', () => {
    const { sim, pid, inst } = setup();
    const line = 'Chains shriek in the fog. The Sea Gate grinds open.';
    kill(sim, inst, ['f1', 'f2', 'fa', 'fb']);
    sim.tick();
    expect(dungeonGateState(sim.ctx, inst, gate('sea_gate'))).toBe('closed');
    expect(blockedAt(sim, inst, 'sea_gate')).toBe(true);
    kill(sim, inst, ['f3']);
    const events = sim.tick() as { type: string; text?: string; pid?: number }[];
    expect(dungeonGateState(sim.ctx, inst, gate('sea_gate'))).toBe('open');
    expect(dungeonGateEntity(sim.ctx, inst, gate('sea_gate'))?.templateId).toBe(
      'dungeon_gate_open',
    );
    expect(blockedAt(sim, inst, 'sea_gate')).toBe(false);
    const logs = events.filter((e) => e.type === 'log' && e.pid === pid);
    expect(logs.map((l) => l.text)).toContain(line);
    // Announced once: a later tick does not repeat it.
    expect((sim.tick() as { type: string; text?: string }[]).some((e) => e.text === line)).toBe(
      false,
    );
  });

  it('an arena seals once its boss has fought for the delay and reopens when it resets', () => {
    const { sim, pid, inst } = setup();
    kill(sim, inst, ROUTE_TO_OLEN);
    sim.tick();
    expect(dungeonGateState(sim.ctx, inst, gate('rampart_door'))).toBe('open');
    const olen = mob(sim, inst, 'knight_commander_olen');
    olen.maxHp = 1e6;
    olen.hp = olen.maxHp;
    // A real pull, driven through full sim ticks: the player stands on him and
    // is kept on their feet for the length of the delay.
    const player = sim.ctx.entities.get(pid) as Entity;
    const stand = (): void => {
      player.pos = sim.ctx.groundPos(olen.spawnPos.x, olen.spawnPos.z - 2.5);
      player.prevPos = { ...player.pos };
      player.maxHp = 1e7;
      player.hp = 1e7;
      sim.ctx.rebucket(player);
    };
    stand();
    expect(sim.ctx.aggroMob(olen, player, false)).toBe(true);
    stand();
    sim.tick();
    // The pull alone seals nothing: the terrace stays open for the delay.
    expect(olen.inCombat).toBe(true);
    expect(dungeonGateState(sim.ctx, inst, gate('rampart_door'))).toBe('open');
    expect(blockedAt(sim, inst, 'rampart_door')).toBe(false);
    for (let i = 0; i < BOSS_ROOM_SEAL_DELAY_TICKS; i++) {
      stand();
      sim.tick();
    }
    expect(dungeonGateState(sim.ctx, inst, gate('rampart_door'))).toBe('sealed');
    expect(dungeonGateEntity(sim.ctx, inst, gate('rampart_door'))?.templateId).toBe(
      'dungeon_gate_sealed',
    );
    expect(blockedAt(sim, inst, 'rampart_door')).toBe(true);
    // The wipe: the boss walks home and goes idle again.
    sim.ctx.handleDeath(player, olen);
    for (let i = 0; i < 20 * 20 && (olen.aiState !== 'idle' || olen.inCombat); i++) sim.tick();
    sim.tick();
    expect(olen.aiState).toBe('idle');
    expect(dungeonGateState(sim.ctx, inst, gate('rampart_door'))).toBe('open');
    expect(blockedAt(sim, inst, 'rampart_door')).toBe(false);
  });

  it('the Postern Fog Wall opens on Olen death, not before', () => {
    const { sim, inst } = setup();
    kill(sim, inst, ROUTE_TO_OLEN);
    sim.tick();
    expect(blockedAt(sim, inst, 'postern_fog')).toBe(true);
    kill(sim, inst, ['knight_commander_olen']);
    sim.tick();
    expect(blockedAt(sim, inst, 'postern_fog')).toBe(false);
  });

  it('the Gaol Grate needs every one of its packs, the Turnkey miniboss included', () => {
    const { sim, inst } = setup();
    kill(sim, inst, [...ROUTE_TO_OLEN, 'knight_commander_olen', 'g1', 'g2', 'g3', 'gd']);
    sim.tick();
    // The Turnkey still stands: the grate holds.
    expect(dungeonGateState(sim.ctx, inst, gate('gaol_grate'))).toBe('closed');
    kill(sim, inst, ['turnkey']);
    sim.tick();
    expect(dungeonGateState(sim.ctx, inst, gate('gaol_grate'))).toBe('open');
    expect(blockedAt(sim, inst, 'gaol_grate')).toBe(false);
  });

  it('a gate that waits on several bosses needs every one of them (the Sunbone Causeway)', () => {
    const { sim, inst } = setup(11, 'wildheart_basin');
    const causeway = gate('sunbone_causeway_thorns', 'wildheart_basin');
    const bosses = causeway.bosses ?? [];
    expect(bosses.length).toBeGreaterThan(1);
    for (const missing of bosses) {
      // Every boss but one dead: the thorns hold.
      kill(
        sim,
        inst,
        bosses.filter((b) => b !== missing),
      );
      sim.tick();
      expect(dungeonGateState(sim.ctx, inst, causeway), missing).toBe('closed');
    }
    kill(sim, inst, [...bosses]);
    sim.tick();
    expect(dungeonGateState(sim.ctx, inst, causeway)).toBe('open');
    expect(blockedAt(sim, inst, 'sunbone_causeway_thorns')).toBe(false);
  });

  it('a reset re-closes every gate for the fresh claim', () => {
    const { sim, pid, inst } = setup();
    kill(sim, inst, ['f1', 'f2', 'fa', 'fb', 'f3']);
    sim.tick();
    expect(blockedAt(sim, inst, 'sea_gate')).toBe(false);
    // Leave, free the claim, and claim again from the door.
    sim.leaveDungeon(pid);
    freeInstance(sim.ctx, inst);
    sim.tick();
    expect(blockedAt(sim, inst, 'sea_gate')).toBe(true);
    expect(enterDungeon(sim.ctx, BASTION, pid)).toBe(true);
    const fresh = sim.ctx.instances.find(
      (i) => i.dungeonId === BASTION && i.partyKey !== null,
    ) as InstanceSlot;
    sim.tick();
    expect(dungeonGateState(sim.ctx, fresh, gate('sea_gate'))).toBe('closed');
    expect(blockedAt(sim, fresh, 'sea_gate')).toBe(true);
  });

  it('every gate announcement is a known client line (i18n EXACT matcher)', () => {
    for (const g of SUNKEN_BASTION_GATES) {
      if (!g.openText) continue;
      expect(localizeSimText(g.openText), g.id).not.toBeNull();
    }
  });

  it('gate template ids round-trip through the wire decoder', () => {
    for (const state of ['open', 'closed', 'sealed'] as const) {
      expect(dungeonGateStateOf(DUNGEON_GATE_TEMPLATES[state])).toBe(state);
    }
    expect(dungeonGateStateOf('dungeon_door')).toBeNull();
  });

  it('is deterministic: two worlds from one seed derive identical gate states', () => {
    const run = (): string[] => {
      const { sim, inst } = setup(21);
      kill(sim, inst, ['f1', 'f2', 'fa', 'fb', 'f3', 'b1']);
      for (let i = 0; i < 5; i++) sim.tick();
      return SUNKEN_BASTION_GATES.map((g) => dungeonGateState(sim.ctx, inst, g));
    };
    expect(run()).toEqual(run());
  });
});
