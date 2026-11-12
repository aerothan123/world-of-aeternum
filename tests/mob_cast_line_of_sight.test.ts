// Mob casts and line of sight (src/sim/mob/cast_sight.ts, mob/chase_route.ts,
// mob/trash_kit/kit_cast_sight.ts), in a real claimed Sunken Bastion with its
// real caster trash: the Mistweaver's Chilling Mist (its petSpell bolt), and a
// lent Glimmer Venom (the Drowned Temple's kit cast bar). Full Sim ticks,
// seeded. (These cases drove the Hollow Crypt's Gravecaller Adept round the
// Ossuary Monument until the crypt retired, 2026-11-11.)
//
// The wall is the Bastion's own: the Drowning Winch in the middle of the open
// Drowning Yard (a 4.2 yd drum the party hides behind).
//
// Every cost claim is read off the sim's own per-tick tallies
// (Sim.mobScanCounters: sight queries, route searches, cells judged), which
// are the same on every machine; nothing here asserts wall time.

import { describe, expect, it, vi } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { DELVES, isDelvePos, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import {
  applyDungeonMobTuning,
  mobLevelForDungeonDifficulty,
  mobTemplateForDungeonDifficulty,
} from '../src/sim/instances/difficulty';
import { isPinnedInPlace, PIN_PHASE_SECONDS } from '../src/sim/instances/instance_combat_hold';
import {
  CAST_SIGHT_RETRY_SECONDS,
  casterObeysSight,
  casterSightBlocked,
  lastSightBlocked,
  SIGHT_QUERIES_PER_TICK,
  SIGHT_RECHECK_TICKS,
} from '../src/sim/mob/cast_sight';
import {
  ROUTE_MAX_TRIES,
  ROUTE_NODES_PER_TICK,
  ROUTE_TRY_FORGIVE_TICKS,
} from '../src/sim/mob/chase_route';
import { mobCombatProfile } from '../src/sim/mob/combat_profile';
import { CHASE_STALL_TIMEOUT } from '../src/sim/mob/reachability';
import { BASTION_KIT_EXTENSION } from '../src/sim/mob/trash_kit/bastion_extension';
import {
  KIT_SIGHT_KEYS,
  KIT_SIGHT_REDRAWS,
  KIT_SIGHT_RETRY,
  kitSightRetry,
  pickSeenVictim,
} from '../src/sim/mob/trash_kit/kit_cast_sight';
import { TEMPLE_LULLABY_SLEEP } from '../src/sim/mob/trash_kit/temple_cast_ids';
import { TEMPLE_KIT_EXTENSION } from '../src/sim/mob/trash_kit/temple_extension';
import { WILDHEART_KIT_EXTENSION } from '../src/sim/mob/trash_kit/wildheart_extension';
import { Sim } from '../src/sim/sim';
import { addThreat } from '../src/sim/threat';
import { DT, dist2d, type Entity, LEASH_DISTANCE } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { boss, type Fight, fight, put, tick } from './helpers/bastion_fight';

vi.setConfig({ testTimeout: 240_000 });
const WINCH = { x: -2, z: 24, r: 4.2 };
/** South of the winch: where the caster stands. */
const CASTER_SPOT = { x: -2, z: 10 };
/** North of it, dead behind it from the caster: out of sight. */
const HIDDEN = { x: -2, z: 36 };
/** North of it and well to one side: in plain sight of the caster. */
const SEEN = { x: 11, z: 31 };
const MIST = MOBS.mistweaver.petSpell?.name ?? 'missing petSpell';
function engage(mob: Entity, victim: Entity): void {
  mob.aggroTargetId = victim.id;
  mob.inCombat = true;
  mob.aiState = 'chase';
  mob.leashAnchor = { ...mob.pos };
  addThreat(mob, victim.id, 100);
}

/** A cleared Bastion with the tank on `at` and a lone Mistweaver on its spot. */
function yard(at: { x: number; z: number }): { f: Fight; caster: Entity } {
  const f = fight('normal', 0, new Set());
  tick(f);
  put(f, f.tank, at.x, at.z);
  const caster = createMob(
    f.sim.ctx.nextId++,
    MOBS.mistweaver,
    12,
    f.sim.ctx.groundPos(f.ox + CASTER_SPOT.x, f.oz + CASTER_SPOT.z),
  );
  caster.hostile = true;
  caster.maxHp = 1e7;
  caster.hp = 1e7;
  f.sim.ctx.addEntity(caster);
  f.inst.mobIds.push(caster.id);
  // No kit: the only cast in the yard is the petSpell.
  caster.devTrashKit = {};
  engage(caster, f.tank);
  return { f, caster };
}

/** The tank steps to the far side of the winch from wherever the caster stands. */
function hideFrom(f: Fight, caster: Entity): boolean {
  const wx = f.ox + WINCH.x;
  const wz = f.oz + WINCH.z;
  const dx = wx - caster.pos.x;
  const dz = wz - caster.pos.z;
  const d = Math.hypot(dx, dz);
  put(f, f.tank, wx + (dx / d) * 12 - f.ox, wz + (dz / d) * 12 - f.oz);
  return !f.sim.ctx.hasLineOfSight(caster, f.tank);
}

describe('the scene: the winch really breaks the line', () => {
  it('hides the far side and shows the flank', () => {
    const { f, caster } = yard(HIDDEN);
    expect(f.sim.ctx.hasLineOfSight(caster, f.tank)).toBe(false);
    put(f, f.tank, SEEN.x, SEEN.z);
    expect(f.sim.ctx.hasLineOfSight(caster, f.tank)).toBe(true);
    // In spell range either way: only the winch stands between them.
    expect(dist2d(caster.pos, f.tank.pos)).toBeLessThan(MOBS.mistweaver.petSpell?.range ?? 0);
  });
});

describe('a caster with no line of sight', () => {
  it('casts nothing, walks round the winch until it sees its target, and casts from there', () => {
    const { f, caster } = yard(HIDDEN);
    expect(f.sim.ctx.hasLineOfSight(caster, f.tank)).toBe(false);
    let plans = 0;
    let landed = 0;
    let blind = 0;
    for (let i = 0; i < 400; i++) {
      const hidden = !f.sim.ctx.hasLineOfSight(caster, f.tank);
      const from = f.hits.length;
      tick(f);
      plans += f.sim.mobScanCounters.routePlans;
      const now = f.hits
        .slice(from)
        .filter((h) => h.targetId === f.tank.id && h.ability === MIST).length;
      landed += now;
      if (hidden) blind += now;
    }
    expect(plans).toBeGreaterThanOrEqual(1);
    expect(plans).toBeLessThanOrEqual(ROUTE_MAX_TRIES);
    expect(landed).toBeGreaterThan(0);
    expect(blind).toBe(0);
    expect(f.sim.ctx.hasLineOfSight(caster, f.tank)).toBe(true);
    // It never walked through the drum.
    expect(
      Math.hypot(caster.pos.x - f.ox - WINCH.x, caster.pos.z - f.oz - WINCH.z),
    ).toBeGreaterThan(WINCH.r);
  });

  it('a dead caster keeps no route', () => {
    const { f, caster } = yard(HIDDEN);
    for (let i = 0; i < 200 && !caster.chaseRoute; i++) tick(f);
    expect(caster.chaseRoute).toBeDefined();
    f.sim.ctx.handleDeath(caster, f.tank);
    tick(f);
    expect(caster.chaseRoute).toBeUndefined();
  });
});

describe('a target that hides while the cast is in flight', () => {
  it('Chilling Mist: the windup runs out, nothing leaves its hand, nothing lands', () => {
    const { f, caster } = yard(SEEN);
    let ticks = 0;
    while (caster.rangedWindupReleaseTick == null && ticks++ < 200) tick(f);
    expect(caster.rangedWindupReleaseTick).not.toBeNull();
    const release = caster.rangedWindupReleaseTick ?? -1;
    expect(hideFrom(f, caster)).toBe(true);
    const from = f.hits.length;
    const cues = f.cues.length;
    for (let i = 0; i < 60 && f.sim.tickCount <= release; i++) tick(f, () => hideFrom(f, caster));
    expect(f.sim.tickCount).toBeGreaterThan(release);
    expect(
      f.hits.slice(from).filter((h) => h.targetId === f.tank.id && h.ability === MIST),
    ).toEqual([]);
    expect(f.cues.slice(cues).filter((c) => c.sourceId === caster.id)).toEqual([]);
    expect(caster.rangedWindupReleaseTick ?? null).toBeNull();
  });

  it('a lent Glimmer Venom: the bar runs out with its victim hidden, and nothing lands', () => {
    const venom = MOBS.glimmerscale_lurker.trashKit?.bolt;
    if (!venom) throw new Error('Glimmer Venom');
    const { f, caster } = yard(SEEN);
    caster.devTrashKit = { bolt: { ...venom } };
    const casting = () => caster.castingAbility === venom.castId;
    let ticks = 0;
    while (!casting() && ticks++ < 600) tick(f);
    expect(casting()).toBe(true);
    expect(hideFrom(f, caster)).toBe(true);
    const from = f.hits.length;
    let ran = 0;
    while (casting() && ran < Math.round(venom.castTime / DT) + 20) {
      tick(f, () => hideFrom(f, caster));
      ran++;
    }
    expect(casting()).toBe(false);
    expect(
      f.hits.slice(from).filter((h) => h.targetId === f.tank.id && h.ability === venom.name),
    ).toEqual([]);
  });
});

// The same sight rule in the open world, on a world caster (Corrupted Priest
// Malric's Mindfracture, an instant petSpell) with one of the world's own
// props between him and his target: the authored quay watch tower (zone1
// decorProp hexWatchtower at (-89, -41), r 2.4, h 12) stands 5 yd east of the
// player's spot. The pair has moved twice: the prop 5 yd east of the origin
// went when #4525 moved Eastbrook, and the Wolf Run garrison watch tower at
// (27, -13) that replaced it went with the genshin artstyle merge
// (8bff2cec638), so the pair now uses the same model on the quay. Out here no
// route is planned (chase_route.ts keeps routes to instances): he closes
// straight, the slide fan rounds the prop, and the leash and the stall are
// what they always were.
describe('in the open world', () => {
  const WORLD_SEED_WITH_PROP = 7788;
  const SPOT = { x: -94, z: -41 };

  function field(dist: number): { sim: Sim; player: Entity; caster: Entity } {
    const sim = new Sim({ seed: WORLD_SEED_WITH_PROP, playerClass: 'warrior' });
    const player = sim.player;
    player.pos = sim.ctx.groundPos(SPOT.x, SPOT.z);
    player.prevPos = { ...player.pos };
    player.maxHp = 1e7;
    player.hp = 1e7;
    sim.ctx.rebucket(player);
    const template = MOBS.corrupted_priest_malric;
    const caster = createMob(
      sim.ctx.nextId++,
      template,
      5,
      sim.ctx.groundPos(SPOT.x + dist, SPOT.z),
    );
    caster.hostile = true;
    caster.maxHp = 1e7;
    caster.hp = 1e7;
    sim.ctx.addEntity(caster);
    engage(caster, player);
    return { sim, player, caster };
  }

  it('closes round a world prop to its sight line and casts, with no search, no evade and no stall', () => {
    const { sim, player, caster } = field(20);
    expect(sim.ctx.hasLineOfSight(caster, player)).toBe(false);
    const spell = MOBS.corrupted_priest_malric.petSpell?.name;
    let landed = 0;
    let landedUnseen = 0;
    let worstStall = 0;
    let plans = 0;
    for (let i = 0; i < 12 / DT && landed === 0; i++) {
      player.hp = player.maxHp;
      const events = sim.tick();
      plans += sim.mobScanCounters.routePlans;
      // Judged on the tick it fired: caster and target as the cast left them.
      // (His melee swing, should he close that far, is not a cast and asks for
      // no line of sight, as before.)
      const seen = sim.ctx.hasLineOfSight(caster, player);
      for (const ev of events) {
        if (ev.type !== 'damage' || ev.sourceId !== caster.id || ev.targetId !== player.id)
          continue;
        if (ev.ability !== spell) continue;
        landed++;
        if (!seen) landedUnseen++;
      }
      worstStall = Math.max(worstStall, caster.chaseStall);
      expect(caster.aiState).not.toBe('evade');
      expect(isBlocked(WORLD_SEED_WITH_PROP, caster.pos.x, caster.pos.z, 0.35)).toBe(false);
    }
    expect(landed).toBeGreaterThan(0);
    expect(landedUnseen).toBe(0);
    expect(plans).toBe(0);
    expect(worstStall).toBeLessThan(CHASE_STALL_TIMEOUT / 2);
    expect(caster.aggroTargetId).toBe(player.id);
  });

  it('the leash still sends a caster home while it is looking for its line', () => {
    const { sim, caster } = field(20);
    // Dragged far past its leash: the first engaged tick ends the pull.
    caster.spawnPos = { x: caster.pos.x + LEASH_DISTANCE + 10, y: caster.pos.y, z: caster.pos.z };
    caster.leashAnchor = null;
    sim.tick();
    expect(caster.aiState).toBe('evade');
    expect(caster.aggroTargetId).toBeNull();
    expect(caster.chaseRoute).toBeUndefined();
  });
});

describe('who obeys the rule', () => {
  it('no boss and no unleashed template carries a petSpell today', () => {
    const casters = Object.keys(MOBS).filter((id) => MOBS[id].petSpell !== undefined);
    expect(casters.length).toBeGreaterThan(10);
    for (const id of casters) {
      expect(MOBS[id].boss, id).not.toBe(true);
      const probe = createMob(1, MOBS[id], MOBS[id].minLevel, { x: 0, y: 0, z: 0 });
      expect(mobCombatProfile(probe).canLeash, id).toBe(true);
    }
  });
});

describe('what the rule leaves alone', () => {
  it('lists the driver casts that are bound by sight', () => {
    expect([...KIT_SIGHT_KEYS].sort()).toEqual(['bolt', 'column', 'eye', 'lullaby']);
    // The dungeons' own blocks name theirs (kit_extension.ts sightKeys).
    expect(TEMPLE_KIT_EXTENSION.sightKeys).toEqual(['spark']);
    expect(WILDHEART_KIT_EXTENSION.sightKeys).toEqual(['hex', 'mark']);
    expect(BASTION_KIT_EXTENSION.sightKeys).toBeUndefined();
  });
});
