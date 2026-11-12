// Mob casts and line of sight (src/sim/mob/cast_sight.ts, mob/chase_route.ts,
// mob/trash_kit/kit_cast_sight.ts), in a real claimed HEROIC Hollow Crypt with
// its real caster trash: the Gravecaller Adept's Grave Spark (its petSpell
// bolt), its Grave Bolt (a kit cast bar) and its Gravespark Volley (the
// line-of-sight nova that was already right). Full Sim ticks, seeded.
//
// The walls are the crypt's own: the Ossuary Monument in the Cloister (a 5 yd
// pillar of bone the party hides behind) and the Undercroft Grille's curtain
// wall, whose only way through is its gate.
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
import { CRYPT_GRAVE_BOLT, CRYPT_GRAVESPARK_VOLLEY } from '../src/sim/mob/trash_kit/cast_ids';
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

// COVERAGE GAP (2026-11-11): the cases that drove a real claimed Hollow Crypt
// (its walls, trash and bosses) were removed with the retired dungeon and
// still need a port onto the Sunken Bastion's geometry. What remains below
// never depended on the crypt.

vi.setConfig({ testTimeout: 240_000 });
const SPARK = 'Grave Spark';
const BOLT = 'Grave Bolt';
const MONUMENT = { x: 0, z: -30, r: 5 };
/** South of the monument: where the caster stands. */
const CASTER_SPOT = { x: 0, z: -44 };
/** North of it, dead behind it from the caster: out of sight. */
const HIDDEN = { x: 0, z: -18 };
/** North of it and well to one side: in plain sight of the caster. */
const SEEN = { x: 13, z: -23 };
function engage(mob: Entity, victim: Entity): void {
  mob.aggroTargetId = victim.id;
  mob.inCombat = true;
  mob.aiState = 'chase';
  mob.leashAnchor = { ...mob.pos };
  addThreat(mob, victim.id, 100);
}

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
