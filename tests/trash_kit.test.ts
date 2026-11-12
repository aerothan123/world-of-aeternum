// The dungeon trash kit (src/sim/mob/trash_kit): the shared target pickers
// and the rule that every area cast of a reworked dungeon plants its caster.
// This suite drove the Hollow Crypt's trash (the Gravecaller Adept and
// Necromancer, the Chapel Gargoyle, the Crow Caller, the Ossuary Cutthroat,
// Drake and Warrior) until the dungeon was retired (2026-11-11); those
// crypt-only pack cases went with it. Each remaining dungeon's own trash suite
// (tests/sunken_bastion_trash_mechanics.test.ts and its siblings) pins its
// packs; the shared pieces below run in a claimed Sunken Bastion.

import { describe, expect, it } from 'vitest';
import { DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { claimedInstanceAt } from '../src/sim/instances/dungeons';
import { pickHashedTarget, pickLeapTarget } from '../src/sim/mob/trash_kit';
import { isPlantedCast } from '../src/sim/mob/trash_kit/cast_hold';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

interface Room {
  sim: Sim;
  inst: InstanceSlot;
  me: Entity;
}

function room(): Room {
  const sim = new Sim({ seed: 91, playerClass: 'warrior', autoEquip: false, devCommands: true });
  sim.chat('/dev level 20', sim.player.id);
  sim.chat('/dev bastion enter normal', sim.player.id);
  const inst = claimedInstanceAt(sim.ctx, sim.player.pos);
  if (!inst) throw new Error('no bastion claim');
  const me = sim.player;
  me.maxHp = 1e6;
  me.hp = 1e6;
  const o = instanceOrigin(DUNGEONS.sunken_bastion.index, inst.slot);
  // The Sea-Gate Landing, behind every pack: a quiet test bench.
  const { entry } = DUNGEONS.sunken_bastion;
  me.pos = sim.ctx.groundPos(o.x + entry.x, o.z + entry.z);
  me.prevPos = { ...me.pos };
  sim.drainEvents();
  return { sim, inst, me };
}

function addPlayer(r: Room, cls: 'mage' | 'priest' | 'warrior', dx: number, dz: number): Entity {
  const pid = r.sim.addPlayer(cls, `T${cls}${dx}`);
  const e = r.sim.ctx.entities.get(pid) as Entity;
  e.pos = r.sim.ctx.groundPos(r.me.pos.x + dx, r.me.pos.z + dz);
  e.prevPos = { ...e.pos };
  e.maxHp = 1e6;
  e.hp = 1e6;
  return e;
}

describe('trash kit: the target pickers', () => {
  it('picks targets by a stable hash and leaps at the farthest caster', () => {
    const r = room();
    const near = addPlayer(r, 'warrior', 10, 0);
    const mage = addPlayer(r, 'mage', 20, 0);
    const priest = addPlayer(r, 'priest', 26, 0);
    const players = [r.me, near, mage, priest];
    const a = pickHashedTarget(players, r.me.pos, 40, 77, 3);
    expect(pickHashedTarget(players, r.me.pos, 40, 77, 3)).toBe(a);
    // The farthest MANA user wins over a farther rage user.
    const farWarrior = addPlayer(r, 'warrior', 29, 0);
    expect(pickLeapTarget([...players, farWarrior], r.me.pos, 8, 30)?.id).toBe(priest.id);
    // Nobody in the band: no leap.
    expect(pickLeapTarget([r.me], r.me.pos, 8, 30)).toBeNull();
  });
});

describe('trash kit: an area cast plants its caster', () => {
  it('every area cast of the four reworked dungeons is a planted cast', () => {
    // The Hollow Crypt left this list with the dungeon (2026-11-11).
    const DUNGEON_IDS = [
      'sunken_bastion',
      'drowned_temple',
      'wildheart_basin',
      'gravewyrm_sanctum',
    ];
    const seen = new Set<string>();
    for (const id of DUNGEON_IDS) {
      const dungeon = DUNGEONS[id];
      expect(dungeon, id).toBeDefined();
      expect(dungeon.areaCastsPlant, id).toBe(true);
      for (const spawn of dungeon.spawns) {
        const template = MOBS[spawn.mobId];
        const kit = template.trashKit;
        const area = [
          kit?.screech?.castId,
          kit?.wingGust?.castId,
          kit?.tailLash?.castId,
          kit?.line?.castId,
          kit?.toss?.castId,
          template.breathCone?.castId,
        ].filter((c): c is string => c !== undefined);
        for (const castId of area) {
          seen.add(castId);
          expect(isPlantedCast(template, castId), `${template.id}: ${castId}`).toBe(true);
          // Outside those dungeons only the kit's area casts plant: a breath
          // cone is left as it was (the open world's dragonkin, the raids).
          if (castId === template.breathCone?.castId)
            expect(isPlantedCast(template, castId, false), castId).toBe(false);
        }
        // A bolt, a raise or a mend tracks its target: never planted.
        for (const castId of [kit?.bolt?.castId, kit?.raise?.castId, kit?.mend?.castId])
          if (castId) expect(isPlantedCast(template, castId), castId).toBe(false);
      }
    }
    // Anti-vacuity floor, re-measured without the crypt's casts.
    expect(seen.size).toBeGreaterThan(4);
    const others = Object.values(DUNGEONS).filter((d) => !DUNGEON_IDS.includes(d.id));
    expect(others.length).toBeGreaterThan(0);
    for (const d of others) expect(d.areaCastsPlant, d.id).toBeUndefined();
  });
});
