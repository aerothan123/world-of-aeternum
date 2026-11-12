// The online client's gate mirror (src/net/dungeon_gate_wire.ts): the
// ClientWorld rebuilds each slot's open set from the gate entities it holds,
// so its local movement prediction walls exactly where the server does.
// Driven on the Sunken Bastion's gates since the Hollow Crypt that used to
// carry it was retired (2026-11-11).

import { afterEach, describe, expect, it } from 'vitest';
import { syncClientDungeonGates } from '../src/net/dungeon_gate_wire';
import { isBlocked } from '../src/sim/colliders';
import { SUNKEN_BASTION_GATES } from '../src/sim/content/sunken_bastion';
import { BUILTIN_WORLD, DUNGEONS, instanceOrigin } from '../src/sim/data';
import { clearDungeonGateStateForTest } from '../src/sim/instances/dungeon_gate_state';
import { enterDungeon } from '../src/sim/instances/dungeons';
import { Sim } from '../src/sim/sim';
import type { Entity, WorldContent } from '../src/sim/types';

const WORLD: WorldContent = { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] };
const SEED = 13;

function gateEntity(id: number, slot: number, gateId: string, templateId: string): Entity {
  const g = SUNKEN_BASTION_GATES.find((x) => x.id === gateId);
  if (!g) throw new Error(gateId);
  const o = instanceOrigin(DUNGEONS.sunken_bastion.index, slot);
  return {
    id,
    kind: 'object',
    templateId,
    dungeonId: 'sunken_bastion',
    pos: { x: o.x + g.x, y: 0, z: o.z + g.z },
  } as Entity;
}

describe('client dungeon gate mirror', () => {
  afterEach(() => clearDungeonGateStateForTest());

  it('opens the collision of exactly the gates its mirrored entities say are open', () => {
    const slot = 6;
    const o = instanceOrigin(DUNGEONS.sunken_bastion.index, slot);
    const player = { id: 1, kind: 'player', pos: { x: o.x - 10, y: 0, z: o.z - 230 } } as Entity;
    const at = (id: string): [number, number] => {
      const g = SUNKEN_BASTION_GATES.find((x) => x.id === id);
      if (!g) throw new Error(id);
      return [o.x + g.x, o.z + g.z];
    };
    const entities = new Map<number, Entity>([
      [1, player],
      [2, gateEntity(2, slot, 'sea_gate', 'dungeon_gate_open')],
      [3, gateEntity(3, slot, 'bailey_drawbridge', 'dungeon_gate_closed')],
      [4, gateEntity(4, slot, 'rampart_door', 'dungeon_gate_sealed')],
    ]);
    syncClientDungeonGates({ entities, player });
    expect(isBlocked(SEED, ...at('sea_gate'), 0.5)).toBe(false);
    expect(isBlocked(SEED, ...at('bailey_drawbridge'), 0.5)).toBe(true);
    expect(isBlocked(SEED, ...at('rampart_door'), 0.5)).toBe(true);
    // The Sea Gate shuts again the moment the mirror says so.
    entities.set(2, gateEntity(2, slot, 'sea_gate', 'dungeon_gate_sealed'));
    syncClientDungeonGates({ entities, player });
    expect(isBlocked(SEED, ...at('sea_gate'), 0.5)).toBe(true);
  });

  it('does nothing outside a gated dungeon', () => {
    const o = instanceOrigin(DUNGEONS.sunken_bastion.index, 2);
    const seaGate = SUNKEN_BASTION_GATES.find((x) => x.id === 'sea_gate');
    if (!seaGate) throw new Error('sea_gate');
    const player = { id: 1, kind: 'player', pos: { x: 0, y: 0, z: 0 } } as Entity;
    const entities = new Map<number, Entity>([
      [2, gateEntity(2, 2, 'sea_gate', 'dungeon_gate_open')],
    ]);
    syncClientDungeonGates({ entities, player });
    expect(isBlocked(SEED, o.x + seaGate.x, o.z + seaGate.z, 0.5)).toBe(true);
  });

  it('mirrors a live server claim: same walls from the same gate entities', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior', noPlayer: true, world: WORLD });
    const pid = sim.addPlayer('warrior', 'Mirror');
    expect(enterDungeon(sim.ctx, 'sunken_bastion', pid)).toBe(true);
    const inst = sim.ctx.instances.find((i) => i.dungeonId === 'sunken_bastion' && i.partyKey);
    if (!inst) throw new Error('no claim');
    DUNGEONS.sunken_bastion.spawns.forEach((s, i) => {
      if (!['f1', 'f2', 'fa', 'fb', 'f3'].includes(s.packId ?? '')) return;
      const mob = sim.ctx.entities.get(inst.mobIds[i]) as Entity;
      mob.dead = true;
      mob.hp = 0;
    });
    sim.tick();
    const o = instanceOrigin(DUNGEONS.sunken_bastion.index, inst.slot);
    const serverView = SUNKEN_BASTION_GATES.map((g) => isBlocked(SEED, o.x + g.x, o.z + g.z, 0.5));
    // A fresh client with only the mirrored entities rebuilds the same view.
    clearDungeonGateStateForTest();
    const mirrored = new Map<number, Entity>();
    for (const id of inst.objectIds) {
      const e = sim.ctx.entities.get(id);
      if (e) mirrored.set(id, { ...e });
    }
    const player = sim.ctx.entities.get(pid) as Entity;
    syncClientDungeonGates({ entities: mirrored, player });
    const clientView = SUNKEN_BASTION_GATES.map((g) => isBlocked(SEED, o.x + g.x, o.z + g.z, 0.5));
    expect(clientView).toEqual(serverView);
    expect(serverView[0]).toBe(false); // the Sea Gate is open on both
  });
});
