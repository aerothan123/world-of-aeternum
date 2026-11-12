// A mob's way round a wall (src/sim/mob/chase_route.ts, mob/route_search.ts):
// in a real claimed Sunken Bastion a Drowned Thrall whose target stands across
// the Sea Gate's curtain wall walks through the gate instead of standing
// against the wall until the instance hold phases it through. With the gate
// shut (a Tidal Flats pack still standing) there is no way round, and the
// stall, the hold and the phase rule exactly as before. (These cases drove the
// Hollow Crypt's Undercroft Grille until the crypt retired, 2026-11-11.)
//
// Costs are read off the sim's own per-tick tallies (Sim.mobScanCounters),
// never a clock.

import { describe, expect, it, vi } from 'vitest';
import { MOBS } from '../src/sim/data';
import { DAWNHOLD, DAWNHOLD_GATES } from '../src/sim/dawnhold_layout';
import { createMob } from '../src/sim/entity';
import { isPinnedInPlace } from '../src/sim/instances/instance_combat_hold';
import { ROUTE_MAX_TRIES, routeSearchOpts } from '../src/sim/mob/chase_route';
import { CHASE_STALL_TIMEOUT } from '../src/sim/mob/reachability';
import { searchRoute } from '../src/sim/mob/route_search';
import { Sim } from '../src/sim/sim';
import { addThreat } from '../src/sim/threat';
import { DT, dist2d, type Entity } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';
import { type Fight, fight, put, tick } from './helpers/bastion_fight';

vi.setConfig({ testTimeout: 240_000 });
/** The Sea Gate's curtain walls run along x at this instance-local z. */
const CURTAIN_Z = -130;
/** Half the curtain's depth, and the half-width of the gate gap between them. */
const CURTAIN_HALF_DEPTH = 1.3;
const GATE_HALF_GAP = 7;
/** South of the curtain (the Sea-Gate Landing) and north of it (the bailey). */
const SOUTH = { x: 12, z: -140 };
const NORTH = { x: 12, z: -120 };

/** A cleared Bastion; `standing` keeps those templates alive (a pack holds a gate). */
function bastion(standing: readonly string[] = []): Fight {
  const f = fight('normal', 0, new Set(standing));
  // One tick so a cleared pack's gate stands open to collision.
  tick(f);
  put(f, f.tank, NORTH.x, NORTH.z);
  return f;
}

function chaser(f: Fight, id: string, at: { x: number; z: number }): Entity {
  const mob = createMob(
    f.sim.ctx.nextId++,
    MOBS[id],
    12,
    f.sim.ctx.groundPos(f.ox + at.x, f.oz + at.z),
  );
  mob.hostile = true;
  mob.maxHp = 1e7;
  mob.hp = 1e7;
  f.sim.ctx.addEntity(mob);
  f.inst.mobIds.push(mob.id);
  mob.aggroTargetId = f.tank.id;
  mob.inCombat = true;
  mob.aiState = 'chase';
  mob.leashAnchor = { ...mob.pos };
  addThreat(mob, f.tank.id, 100);
  return mob;
}

/** Inside the curtain's footprint, outside the gate gap. */
function inWall(f: Fight, e: Entity): boolean {
  return (
    Math.abs(e.pos.z - (f.oz + CURTAIN_Z)) < CURTAIN_HALF_DEPTH &&
    Math.abs(e.pos.x - f.ox) > GATE_HALF_GAP
  );
}

interface Chase {
  plans: number;
  pinned: boolean;
  walled: number;
  reached: boolean;
  trace: string[];
}

function chase(f: Fight, mob: Entity, ticks: number): Chase {
  const out: Chase = { plans: 0, pinned: false, walled: 0, reached: false, trace: [] };
  for (let i = 0; i < ticks; i++) {
    tick(f);
    out.plans += f.sim.mobScanCounters.routePlans;
    if (isPinnedInPlace(mob)) out.pinned = true;
    if (inWall(f, mob)) out.walled++;
    if (mob.aiState === 'attack' && dist2d(mob.pos, f.tank.pos) < 6) out.reached = true;
    if (i % 20 === 0) out.trace.push(`${mob.pos.x.toFixed(3)},${mob.pos.z.toFixed(3)}`);
  }
  return out;
}

describe('a melee mob whose target stands across a wall with a doorway', () => {
  it('walks through the doorway and fights, never held and never through the wall', () => {
    const f = bastion();
    const mob = chaser(f, 'drowned_thrall', SOUTH);
    // The straight line is walled off: the gate gap is 5 yd to the west.
    expect(f.sim.ctx.hasLineOfSight(mob, f.tank)).toBe(false);
    const run = chase(f, mob, 400);
    expect(run.reached).toBe(true);
    expect(run.plans).toBeGreaterThanOrEqual(1);
    expect(run.plans).toBeLessThanOrEqual(ROUTE_MAX_TRIES);
    expect(run.pinned).toBe(false);
    expect(run.walled).toBe(0);
    // It came through: it stands on the bailey side now.
    expect(mob.pos.z - f.oz).toBeGreaterThan(CURTAIN_Z + CURTAIN_HALF_DEPTH);
  });

  it('is deterministic from the seed', () => {
    const runs = [0, 1].map(() => {
      const f = bastion();
      return chase(f, chaser(f, 'drowned_thrall', SOUTH), 300);
    });
    expect(runs[1].trace).toEqual(runs[0].trace);
    expect(runs[1].plans).toBe(runs[0].plans);
  });
});

describe('a melee mob with open ground ahead', () => {
  it('chases straight and never plans a route', () => {
    const f = bastion();
    // Both on the bailey side, nothing between them.
    const mob = chaser(f, 'drowned_thrall', { x: NORTH.x, z: NORTH.z + 16 });
    expect(f.sim.ctx.hasLineOfSight(mob, f.tank)).toBe(true);
    const run = chase(f, mob, 200);
    expect(run.reached).toBe(true);
    expect(run.plans).toBe(0);
    expect(mob.chaseRoute).toBeUndefined();
  });
});

describe('a melee mob with no way round', () => {
  it('stalls, holds immune and phases exactly as before, on a few bounded searches', () => {
    // A Tidal Flats pack still stands (far off on the landing), so the Sea Gate
    // stays shut and the curtain has no gap.
    const f = bastion(['barnacle_crawler']);
    const mob = chaser(f, 'drowned_thrall', SOUTH);
    let pinnedAt = -1;
    let throughAt = -1;
    let plans = 0;
    const limit = Math.ceil((CHASE_STALL_TIMEOUT + 20) / DT);
    for (let i = 0; i < limit && throughAt < 0; i++) {
      tick(f);
      plans += f.sim.mobScanCounters.routePlans;
      if (pinnedAt < 0 && isPinnedInPlace(mob)) pinnedAt = i;
      if (mob.pos.z - f.oz > CURTAIN_Z + CURTAIN_HALF_DEPTH) throughAt = i;
    }
    expect(plans).toBeGreaterThanOrEqual(1);
    expect(plans).toBeLessThanOrEqual(ROUTE_MAX_TRIES);
    // The hold pinned it before anything brought it across: the phase did.
    expect(pinnedAt).toBeGreaterThanOrEqual(0);
    expect(throughAt).toBeGreaterThan(pinnedAt);
  });
});

describe('the search itself', () => {
  it('finds the doorway, and the same route every time', () => {
    const f = bastion();
    const mob = chaser(f, 'drowned_thrall', SOUTH);
    const opts = routeSearchOpts(f.sim.ctx, mob);
    const from = { x: mob.pos.x, z: mob.pos.z };
    const to = { x: f.tank.pos.x, z: f.tank.pos.z };
    const a = searchRoute(from, to, opts);
    expect(a.attempted).toBe(true);
    expect(a.found).toBe(true);
    expect(a.nodes).toBeLessThanOrEqual(opts.maxNodes);
    // Every waypoint inside the curtain's band sits in the gate gap.
    const crossing = a.path.filter((p) => Math.abs(p.z - (f.oz + CURTAIN_Z)) < 4);
    expect(crossing.length).toBeGreaterThan(0);
    for (const p of crossing) expect(Math.abs(p.x - f.ox)).toBeLessThan(GATE_HALF_GAP);
    const b = searchRoute(from, to, opts);
    expect(b).toEqual(a);
  });

  it('stops at its node cap, found or not', () => {
    const f = bastion();
    const mob = chaser(f, 'drowned_thrall', SOUTH);
    const opts = { ...routeSearchOpts(f.sim.ctx, mob), maxNodes: 12 };
    const r = searchRoute(
      { x: mob.pos.x, z: mob.pos.z },
      { x: f.tank.pos.x, z: f.tank.pos.z },
      opts,
    );
    expect(r.attempted).toBe(true);
    expect(r.found).toBe(false);
    expect(r.nodes).toBeLessThanOrEqual(12);
    expect(r.path).toEqual([]);
  });
});

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
