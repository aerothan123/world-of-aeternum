// Pack cast stagger (src/sim/mob/pack_cast_stagger.ts): a pack pulled together
// no longer raises every same-type cast bar on the same tick. The first cast of
// each ability spreads over one interval in pull order; the cadence and a lone
// mob's timing are unchanged. Driven through the real trash kit driver and the
// real breath-cone seeding inside a claimed Drowned Temple.

import { describe, expect, it } from 'vitest';
import { DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { applyDungeonMobTuning } from '../src/sim/instances/difficulty';
import { claimedInstanceAt } from '../src/sim/instances/dungeons';
import {
  packBreathStagger,
  packPeerRank,
  packStaggerOffset,
} from '../src/sim/mob/pack_cast_stagger';
import { tickTrashKits } from '../src/sim/mob/trash_kit';
import { TEMPLE_GLIMMER_VENOM } from '../src/sim/mob/trash_kit/temple_cast_ids';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { DT, type Entity } from '../src/sim/types';

interface Room {
  sim: Sim;
  inst: InstanceSlot;
  me: Entity;
}

function room(): Room {
  const sim = new Sim({ seed: 91, playerClass: 'warrior', autoEquip: false, devCommands: true });
  sim.chat('/dev level 20', sim.player.id);
  // The Drowned Temple's lurker pair at g3 (the Hollow Crypt bench retired
  // with the dungeon): open causeway floor with room for a pack of three.
  sim.chat('/dev temple enter', sim.player.id);
  const inst = claimedInstanceAt(sim.ctx, sim.player.pos);
  if (!inst) throw new Error('no temple claim');
  const me = sim.player;
  me.maxHp = 1e6;
  me.hp = 1e6;
  const o = instanceOrigin(DUNGEONS.drowned_temple.index, inst.slot);
  me.pos = sim.ctx.groundPos(o.x + 5, o.z - 104);
  me.prevPos = { ...me.pos };
  sim.drainEvents();
  return { sim, inst, me };
}

function engage(r: Room, templateId: string, dx: number, dz = 0): Entity {
  const mob = createMob(r.sim.ctx.nextId++, MOBS[templateId], MOBS[templateId].minLevel, {
    ...r.sim.ctx.groundPos(r.me.pos.x + dx, r.me.pos.z + dz),
  });
  applyDungeonMobTuning(mob, 'drowned_temple', r.inst.difficulty);
  r.sim.ctx.addEntity(mob);
  r.inst.mobIds.push(mob.id);
  mob.inCombat = true;
  mob.aiState = 'attack';
  mob.aggroTargetId = r.me.id;
  // The lurkers fight with their Glimmer Venom alone: the bolt shares the bar
  // with Pounce and the Dazzle, so the stagger is read on a lent bolt-only kit
  // (Entity.devTrashKit, the same bolt record).
  const bolt = MOBS.glimmerscale_lurker.trashKit?.bolt;
  if (templateId === 'glimmerscale_lurker' && bolt)
    mob.devTrashKit = { bolt: { ...bolt, heroicOnly: undefined } };
  return mob;
}

/** Tick only the kit for `seconds`, recording the sim time each mob starts a
 *  Glimmer Venom bar. */
function boltStarts(r: Room, mobs: Entity[], seconds: number): Map<number, number[]> {
  const starts = new Map<number, number[]>(mobs.map((m) => [m.id, []]));
  const was = new Map<number, string | null>();
  let t = 0;
  for (; t < seconds - DT * 0.5; t += DT) {
    for (const m of mobs) {
      m.inCombat = true;
      m.aiState = 'attack';
      m.aggroTargetId = r.me.id;
    }
    tickTrashKits(r.sim.ctx);
    r.sim.drainEvents();
    for (const m of mobs) {
      if (m.castingAbility === TEMPLE_GLIMMER_VENOM && was.get(m.id) !== TEMPLE_GLIMMER_VENOM)
        starts.get(m.id)?.push(Math.round((t + DT) * 100) / 100);
      was.set(m.id, m.castingAbility);
    }
  }
  return starts;
}

/** Within one tick: cast starts land on the 20 Hz grid. */
function near(got: number, want: number): void {
  expect(Math.abs(got - want)).toBeLessThanOrEqual(DT + 1e-6);
}

describe('pack cast stagger: the pure offsets', () => {
  it('spreads a pack evenly over one interval and never offsets rank 0 or a lone mob', () => {
    expect(packStaggerOffset(0, 3, 9)).toBe(0);
    expect(packStaggerOffset(1, 3, 9)).toBe(3);
    expect(packStaggerOffset(2, 3, 9)).toBe(6);
    expect(packStaggerOffset(1, 2, 9)).toBe(4.5);
    expect(packStaggerOffset(0, 1, 9)).toBe(0);
    expect(packStaggerOffset(3, 1, 9)).toBe(0);
    expect(packStaggerOffset(1, 3, 0)).toBe(0);
  });

  it('ranks by peers of the same template that already began their pull', () => {
    const r = room();
    const a = engage(r, 'glimmerscale_lurker', 8);
    const b = engage(r, 'glimmerscale_lurker', 10);
    const other = engage(r, 'lagoon_snapper', 12);
    const roster = r.inst.mobIds.map((id) => r.sim.ctx.entities.get(id));
    const none = () => false;
    expect(packPeerRank(roster, a, none)).toEqual({ rank: 0, size: 2 });
    const aStarted = (p: Entity) => p.id === a.id;
    expect(packPeerRank(roster, b, aStarted)).toEqual({ rank: 1, size: 2 });
    // A different template and an unengaged peer never count.
    expect(packPeerRank(roster, other, () => true)).toEqual({ rank: 0, size: 1 });
    b.inCombat = false;
    expect(packPeerRank(roster, a, () => true)).toEqual({ rank: 0, size: 1 });
  });
});

describe('pack cast stagger: the trash kit', () => {
  it('a pack of three lurkers pulled together spits one after another, never together', () => {
    const r = room();
    const lurkers = [8, 10, 12].map((dx) => engage(r, 'glimmerscale_lurker', dx));
    const def = MOBS.glimmerscale_lurker.trashKit?.bolt;
    if (!def) throw new Error('lurker bolt');
    const starts = boltStarts(r, lurkers, 40);
    const firsts = lurkers.map((m) => starts.get(m.id)?.[0] ?? -1);
    // First bars at first, first + every/3, first + 2*every/3: alternating.
    near(firsts[0], def.first);
    near(firsts[1], def.first + def.every / 3);
    near(firsts[2], def.first + (2 * def.every) / 3);
    // No two bars ever start on the same tick.
    const all = [...starts.values()].flat().sort((x, y) => x - y);
    for (let i = 1; i < all.length; i++) expect(all[i] - all[i - 1]).toBeGreaterThan(DT);
    // Same cadence as before: every mob recasts exactly `every + castTime` later.
    for (const m of lurkers) {
      const s = starts.get(m.id) ?? [];
      expect(s.length).toBeGreaterThanOrEqual(2);
      near(s[1] - s[0], def.every + def.castTime);
    }
  });

  it('a lone lurker keeps its authored first bolt', () => {
    const r = room();
    const lurker = engage(r, 'glimmerscale_lurker', 8);
    const def = MOBS.glimmerscale_lurker.trashKit?.bolt;
    if (!def) throw new Error('lurker bolt');
    const s = boltStarts(r, [lurker], 20).get(lurker.id) ?? [];
    near(s[0], def.first);
  });

  it('staggers the same way on every run (deterministic)', () => {
    const once = () => {
      const r = room();
      const lurkers = [8, 10].map((dx) => engage(r, 'glimmerscale_lurker', dx));
      return [...boltStarts(r, lurkers, 30).values()];
    };
    expect(once()).toEqual(once());
  });
});

describe('pack cast stagger: the breath cone', () => {
  it('offsets a claim pack of snappers and leaves an open-world mob untouched', () => {
    const r = room();
    const every = MOBS.lagoon_snapper.breathCone?.every ?? 0;
    const a = engage(r, 'lagoon_snapper', 8);
    const b = engage(r, 'lagoon_snapper', 10);
    expect(packBreathStagger(r.sim.ctx, a, every)).toBe(0);
    a.breathTimer = every;
    expect(packBreathStagger(r.sim.ctx, b, every)).toBe(every / 2);
    // Outside any claim: no offset.
    const wild = createMob(r.sim.ctx.nextId++, MOBS.lagoon_snapper, 8, { x: 0, y: 0, z: 0 });
    r.sim.ctx.addEntity(wild);
    wild.inCombat = true;
    wild.aggroTargetId = r.me.id;
    expect(packBreathStagger(r.sim.ctx, wild, every)).toBe(0);
  });
});
