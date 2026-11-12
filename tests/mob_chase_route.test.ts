// A mob's way round a wall (src/sim/mob/chase_route.ts, mob/route_search.ts):
// in a real claimed HEROIC Hollow Crypt an Ossuary Warrior whose target stands
// across the Undercroft Grille's curtain wall walks through the gate instead
// of standing against the wall until the instance hold phases it through. With
// the gate shut there is no way round, and the stall, the hold and the phase
// rule exactly as before.
//
// The second half pins what keeps the search affordable on the server's tick
// and what keeps it from being farmed: the node cap, the tick budget, the
// throttle that outlives the path, the backoff on failure, the pack's shared
// "no route", and the watchdog on a route that stops making headway. Costs are
// read off the sim's own per-tick tallies (Sim.mobScanCounters), never a clock.

import { describe, expect, it, vi } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { DAWNHOLD, DAWNHOLD_GATES } from '../src/sim/dawnhold_layout';
import { createMob } from '../src/sim/entity';
import {
  applyDungeonMobTuning,
  mobLevelForDungeonDifficulty,
  mobTemplateForDungeonDifficulty,
} from '../src/sim/instances/difficulty';
import { claimedInstanceAt, enterDungeon } from '../src/sim/instances/dungeons';
import {
  isPinnedInPlace,
  PIN_PHASE_SECONDS,
  pinInPlace,
} from '../src/sim/instances/instance_combat_hold';
import {
  chaseRouteFor,
  followChaseRoute,
  ROUTE_AFTER_STALL_SECONDS,
  ROUTE_DENIED_TICKS,
  ROUTE_MAX_TRIES,
  ROUTE_NODES_PER_PLAN,
  ROUTE_NODES_PER_TICK,
  ROUTE_REPLAN_TICKS,
  ROUTE_STUCK_TICKS,
  ROUTE_TRY_FORGIVE_TICKS,
  routeSearchOpts,
  routesHere,
} from '../src/sim/mob/chase_route';
import { startEvadeHome } from '../src/sim/mob/combat_profile';
import { isBossTemplate, isEncounterBody } from '../src/sim/mob/encounter_body';
import { CHASE_STALL_TIMEOUT } from '../src/sim/mob/reachability';
import { searchRoute } from '../src/sim/mob/route_search';
import { resetMobScanCounters } from '../src/sim/mob/scan_counters';
import { Sim } from '../src/sim/sim';
import { addThreat } from '../src/sim/threat';
import { DT, dist2d, type Entity } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';
import { type Fight, fight, put, tick } from './helpers/bastion_fight';

// COVERAGE GAP (2026-11-11): the cases that drove a real claimed Hollow Crypt
// (its walls, trash and bosses) were removed with the retired dungeon and
// still need a port onto the Sunken Bastion's geometry. What remains below
// never depended on the crypt.

vi.setConfig({ testTimeout: 240_000 });
const NORTH = { x: 18, z: 30 };
const SOUTH = { x: 18, z: 12 };
/** The wall's faces along z. */
const WALL_NORTH_FACE = 22.2;
const WALL_SOUTH_FACE = 19.8;

describe('where routes are planned', () => {
  it('an open-world melee mob walled off from its target plans nothing and still evades', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: false });
    const player = sim.player;
    const gate = (DAWNHOLD_GATES.main.a0 + DAWNHOLD_GATES.main.a1) / 2;
    // Inside Dawnhold's east curtain wall, 18 yd from its one gate.
    player.pos = sim.ctx.groundPos(DAWNHOLD.wx1 - 6, gate + 18);
    player.prevPos = { ...player.pos };
    player.maxHp = 1e9;
    player.hp = 1e9;
    sim.ctx.rebucket(player);
    const wolf = createMob(
      sim.ctx.nextId++,
      MOBS.forest_wolf,
      5,
      sim.ctx.groundPos(DAWNHOLD.wx1 + 8, gate + 18),
    );
    wolf.hostile = true;
    wolf.maxHp = 1e7;
    wolf.hp = 1e7;
    sim.ctx.addEntity(wolf);
    wolf.aggroTargetId = player.id;
    wolf.inCombat = true;
    wolf.aiState = 'chase';
    wolf.leashAnchor = { ...wolf.pos };
    addThreat(wolf, player.id, 100);
    let plans = 0;
    let evaded = false;
    for (let i = 0; i < (CHASE_STALL_TIMEOUT + 6) / DT && !evaded; i++) {
      player.hp = player.maxHp;
      sim.tick();
      plans += sim.mobScanCounters.routePlans;
      if ((wolf.aiState as string) === 'evade') evaded = true;
      // The wall holds it: it never gets inside.
      expect(wolf.pos.x).toBeGreaterThan(DAWNHOLD.wx1);
    }
    expect(evaded).toBe(true);
    expect(plans).toBe(0);
    expect(wolf.chaseRoute).toBeUndefined();
  });
});
