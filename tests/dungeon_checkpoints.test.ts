import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as colliders from '../src/sim/colliders';
import { isBlocked } from '../src/sim/colliders';
import { handleDeath } from '../src/sim/combat/damage';
import { DROWNED_TEMPLE_FIELD } from '../src/sim/content/drowned_temple_layout';
import {
  DUNGEON_CHECKPOINTS,
  type DungeonCheckpoint,
} from '../src/sim/content/dungeon_checkpoints';
import { GRAVEWYRM_SANCTUM_FIELD } from '../src/sim/content/gravewyrm_sanctum_layout';
import {
  BREACH_BASTION,
  SUNKEN_BASTION_ANCHORS,
  SUNKEN_BASTION_FIELD,
} from '../src/sim/content/sunken_bastion_layout';
import { WILDHEART_BASIN_FIELD } from '../src/sim/content/wildheart_basin_layout';
import { BUILTIN_WORLD, DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { dropEncounterBody } from '../src/sim/encounters/sunken_bastion/claim';
import { createMob } from '../src/sim/entity';
import { dungeonReentryPoint } from '../src/sim/instances/dungeon_checkpoints';
import {
  clearDungeonGateStateForTest,
  setOpenDungeonGates,
} from '../src/sim/instances/dungeon_gate_state';
import { dungeonGateState, setDungeonGatesDevOpen } from '../src/sim/instances/dungeon_gates';
import { freeInstance, updateDoorTriggers } from '../src/sim/instances/dungeons';
import { MAX_AGGRO_RADIUS, MAX_WANDER_RADIUS } from '../src/sim/mob/aggro_ranges';
import { PATROL_REJOIN_DISTANCE } from '../src/sim/mob/patrol';
import { PLAYER_BODY_RADIUS } from '../src/sim/pathfind';
import { RIFT_ENTRY_CLEAR_RADIUS } from '../src/sim/rift/entry_clearance';
import { type InstanceSlot, Sim } from '../src/sim/sim';
import { RES_HP_FRACTION, RESURRECTION_SICKNESS_ID } from '../src/sim/spirit';
import { type Entity, PLAYER_INTEREST_DROP_RADIUS } from '../src/sim/types';

const CASES = [
  ['drowned_temple', ['choirmother_selthe'], 0, 0],
  ['drowned_temple', ['choirmother_selthe', 'tideglass_colossus'], 86, 208],
  ['sunken_bastion', ['knight_commander_olen'], 57, 130],
  ['sunken_bastion', ['knight_commander_olen', 'gaoler_ossick'], -2, 12],
  ['gravewyrm_sanctum', ['korgath_the_bound'], 0, -22],
  ['gravewyrm_sanctum', ['korgath_the_bound', 'grand_necromancer_velkhar'], 0, 107],
  ['wildheart_basin', ['wildheart_beastmaster', 'fanglord_jaguar'], -86, 40],
  ['wildheart_basin', ['the_gorgebloom'], 84, 42],
] as const;

// The shared fixture is the Sunken Bastion: the Hollow Crypt that used to carry
// these cases was retired (2026-11-11). Olen's Breach Bastion is its first
// checkpoint (ARENA) and the Drowning Yard after Olen and Ossick its second
// (YARD); CASES pins both points against the table.
const FIXTURE = 'sunken_bastion';
const OLEN = 'knight_commander_olen';
const OSSICK = 'gaoler_ossick';
const ENTRY = DUNGEONS.sunken_bastion.entry;
const ARENA = { x: 57, z: 130 };
const YARD = { x: -2, z: 12 };

// The open gate sets are a process-wide collision view keyed by slot: no test
// inherits the one an earlier sim (or an earlier flood fill) published.
beforeEach(() => clearDungeonGateStateForTest());

const FIELDS = {
  drowned_temple: DROWNED_TEMPLE_FIELD,
  sunken_bastion: SUNKEN_BASTION_FIELD,
  gravewyrm_sanctum: GRAVEWYRM_SANCTUM_FIELD,
  wildheart_basin: WILDHEART_BASIN_FIELD,
} as const;

function setup(dungeonId: string = FIXTURE, heroic = false, idleMobTickRadius = 0) {
  const sim = new Sim({
    seed: 99,
    playerClass: 'warrior',
    noPlayer: true,
    idleMobTickRadius,
    world: { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] },
  });
  const pid = sim.addPlayer('warrior', 'Runner');
  if (heroic) {
    sim.setPlayerLevel(20, pid);
    sim.setDungeonDifficulty('heroic', pid);
  }
  expect(sim.enterDungeon(dungeonId, pid)).toBe(true);
  const inst = sim.instances.find((i) => i.dungeonId === dungeonId && i.partyKey !== null)!;
  expect(inst.difficulty).toBe(heroic ? 'heroic' : 'normal');
  return { sim, pid, inst, player: sim.entities.get(pid)! };
}

function slay(sim: Sim, inst: InstanceSlot, mob: Entity) {
  // Exercise the authoritative death path, including loot and encounter cleanup.
  if (!mob.dead) handleDeath(sim.ctx, mob, sim.entities.get([...inst.enteredBy][0]) ?? null);
}

function rosterMob(sim: Sim, inst: InstanceSlot, templateId: string): Entity {
  const mob = inst.mobIds
    .map((id) => sim.entities.get(id))
    .find((e) => e?.templateId === templateId);
  if (!mob) throw new Error(`Missing ${templateId}`);
  return mob;
}

function kill(sim: Sim, inst: InstanceSlot, ...bosses: string[]) {
  for (const bossId of bosses) slay(sim, inst, rosterMob(sim, inst, bossId));
}

/** Every living mob of the listed placement packs, by the claim's spawn ordinals. */
function packMobs(sim: Sim, inst: InstanceSlot, packIds: readonly string[]): Entity[] {
  const out: Entity[] = [];
  DUNGEONS[inst.dungeonId].spawns.forEach((spawn, i) => {
    if (!spawn.packId || !packIds.includes(spawn.packId)) return;
    const mob = sim.entities.get(inst.mobIds[i]);
    if (mob && !mob.dead) out.push(mob);
  });
  return out;
}

function killPacks(sim: Sim, inst: InstanceSlot, ...packIds: string[]) {
  for (const mob of packMobs(sim, inst, packIds)) slay(sim, inst, mob);
}

function gateOf(dungeonId: string, gateId: string) {
  const gate = DUNGEONS[dungeonId].gates?.find((g) => g.id === gateId);
  if (!gate) throw new Error(`Missing gate ${gateId}`);
  return gate;
}

function rowOf(dungeonId: string, bosses: readonly string[]): DungeonCheckpoint {
  const row = DUNGEON_CHECKPOINTS[dungeonId].find(
    (c) => c.bosses.length === bosses.length && c.bosses.every((b) => bosses.includes(b)),
  );
  if (!row) throw new Error(`No checkpoint for ${bosses.join(', ')}`);
  return row;
}

/**
 * Earn checkpoints the way a group does: clear the packs every gate on the way
 * in waits on, then kill the bosses. Everything else in the dungeon stays alive.
 */
function earn(sim: Sim, inst: InstanceSlot, ...bosses: string[]) {
  for (const row of DUNGEON_CHECKPOINTS[inst.dungeonId]) {
    if (!row.bosses.every((b) => bosses.includes(b))) continue;
    for (const gateId of row.gates)
      killPacks(sim, inst, ...(gateOf(inst.dungeonId, gateId).packs ?? []));
  }
  kill(sim, inst, ...bosses);
}

/** The first living mob of the claim's roster (the cleared route's are dead). */
function livingMob(sim: Sim, inst: InstanceSlot): Entity {
  const mob = inst.mobIds.map((id) => sim.entities.get(id)).find((e) => e && !e.dead);
  if (!mob) throw new Error('No living mob');
  return mob;
}

function doorOf(sim: Sim, dungeonId: string): Entity {
  return [...sim.entities.values()].find(
    (e) => e.templateId === 'dungeon_door' && e.dungeonId === dungeonId,
  )!;
}

function standAt(sim: Sim, e: Entity, x: number, z: number) {
  e.pos = sim.ctx.groundPos(x, z);
  e.prevPos = { ...e.pos };
  sim.ctx.rebucket(e);
}

/** Re-home a mob: its body AND the spawn point its wander ring is centred on. */
function moveHome(sim: Sim, mob: Entity, x: number, z: number) {
  standAt(sim, mob, x, z);
  mob.spawnPos = { ...mob.pos };
}

/** A released spirit whose body lies where the player stands (no door crossed). */
function release(sim: Sim, pid: number) {
  const player = sim.entities.get(pid)!;
  player.dead = true;
  sim.releaseSpirit(pid);
  expect(player.ghost).toBe(true);
}

/** Walk a released spirit through the dungeon's outside door. */
function crossDoor(sim: Sim, pid: number, dungeonId: string) {
  const player = sim.entities.get(pid)!;
  const door = doorOf(sim, dungeonId);
  player.pos = { ...door.pos };
  player.prevPos = { ...player.pos };
  sim.ctx.rebucket(player);
  updateDoorTriggers(sim.ctx, player);
}

function reenter(sim: Sim, pid: number, dungeonId: string) {
  release(sim, pid);
  crossDoor(sim, pid, dungeonId);
}

/** Ground-plane distance between two points. */
function gap(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function localOf(inst: InstanceSlot, x: number, z: number) {
  const origin = instanceOrigin(DUNGEONS[inst.dungeonId].index, inst.slot);
  return { x: origin.x + x, z: origin.z + z };
}

function expectLocal(sim: Sim, pid: number, inst: InstanceSlot, x: number, z: number) {
  const player = sim.entities.get(pid)!;
  const at = localOf(inst, x, z);
  expect(player.pos.x).toBe(at.x);
  expect(player.pos.z).toBe(at.z);
  expect(player.prevPos).toEqual(player.pos);
}

/** Tick `seconds` of sim time: did anything in the claim ever come for `player`? */
function tickAndWatch(sim: Sim, inst: InstanceSlot, player: Entity, seconds: number): boolean {
  let pulled = false;
  for (let i = 0; i < 20 * seconds; i++) {
    sim.tick();
    if (player.inCombat || player.dead) pulled = true;
    for (const id of inst.mobIds) {
      const mob = sim.entities.get(id);
      if (mob && !mob.dead && (mob.aggroTargetId === player.id || mob.inCombat)) pulled = true;
    }
  }
  return pulled;
}

describe('dungeon death checkpoints', () => {
  it.each([false, true])(
    'returns to the cleared Olen arena through the door (heroic=%s)',
    (heroic) => {
      const { sim, pid, inst, player } = setup(FIXTURE, heroic);
      earn(sim, inst, OLEN);
      reenter(sim, pid, inst.dungeonId);
      expectLocal(sim, pid, inst, ARENA.x, ARENA.z);
      expect(player.dead).toBe(false);
      expect(player.ghost).toBe(false);
      expect(player.corpsePos).toBeNull();
      expect(player.corpseInstanceId).toBeNull();
      expect(player.hp).toBe(Math.max(1, Math.round(player.maxHp * RES_HP_FRACTION)));
      expect(player.auras.some((a) => a.id === RESURRECTION_SICKNESS_ID)).toBe(false);
    },
  );

  it('keeps the entrance until a checkpoint is earned', () => {
    const { sim, pid, inst } = setup();
    reenter(sim, pid, inst.dungeonId);
    const entry = DUNGEONS[inst.dungeonId].entry;
    expectLocal(sim, pid, inst, entry.x, entry.z);
  });

  for (const heroic of [false, true]) {
    it.each(CASES)(`safe %s checkpoint after %s (heroic=${heroic})`, (dungeonId, bosses, x, z) => {
      const { sim, pid, inst, player } = setup(dungeonId, heroic);
      // Only the packs the route's gates wait on die, with the bosses. Every other
      // pack, patrol and boss of the dungeon is alive when the ghost arrives.
      earn(sim, inst, ...bosses);
      const trashAlive = inst.mobIds
        .map((id) => sim.entities.get(id))
        .filter((mob) => mob && !mob.dead && !MOBS[mob.templateId].boss);
      expect(trashAlive.length).toBeGreaterThan(0);
      reenter(sim, pid, dungeonId);
      expectLocal(sim, pid, inst, x, z);
      expect(isBlocked(sim.cfg.seed, player.pos.x, player.pos.z, PLAYER_BODY_RADIUS)).toBe(false);
      expect(player.pos.y).toBeGreaterThan(-10);
      // Safe means left alone: nothing in the living dungeon comes for the arrival.
      expect(tickAndWatch(sim, inst, player, 10)).toBe(false);
      expectLocal(sim, pid, inst, x, z);
    });
  }

  it('lists one row per pinned case, at the pinned point', () => {
    const rows = Object.values(DUNGEON_CHECKPOINTS).reduce((n, list) => n + list.length, 0);
    expect(rows).toBe(CASES.length);
    for (const [dungeonId, bosses, x, z] of CASES) {
      expect(rowOf(dungeonId, bosses).pos, `${dungeonId} ${bosses.join(',')}`).toEqual({ x, z });
    }
  });

  it('does not bypass a living predecessor when a later boss dies out of order', () => {
    const { sim, pid, inst } = setup();
    // Every gate reads open and the Drowning Yard's own gate packs are dead, so
    // only the boss order can refuse it.
    setDungeonGatesDevOpen(inst, true);
    for (const gateId of rowOf(FIXTURE, [OLEN, OSSICK]).gates)
      killPacks(sim, inst, ...(gateOf(FIXTURE, gateId).packs ?? []));
    kill(sim, inst, OSSICK);
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, ENTRY.x, ENTRY.z);
    // Positive control: the living predecessor was all that refused it.
    kill(sim, inst, OLEN);
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, YARD.x, YARD.z);
  });
  it('requires both the Beastmaster and his Jaguar to finish their checkpoint', () => {
    const { sim, pid, inst } = setup('wildheart_basin');
    const row = rowOf('wildheart_basin', ['wildheart_beastmaster', 'fanglord_jaguar']);
    for (const gateId of row.gates)
      killPacks(sim, inst, ...(gateOf('wildheart_basin', gateId).packs ?? []));
    kill(sim, inst, 'wildheart_beastmaster');
    // The Jaguar lives, far from the pits: only the boss list can refuse them now,
    // not a living body standing on the point.
    const far = localOf(inst, 0, -150);
    moveHome(sim, rosterMob(sim, inst, 'fanglord_jaguar'), far.x, far.z);
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, 0, -217);
    kill(sim, inst, 'fanglord_jaguar');
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, -86, 40);
  });

  it('ordinary living entries still arrive at the entrance', () => {
    const { sim, pid, inst } = setup();
    earn(sim, inst, OLEN);
    sim.leaveDungeon(pid);
    sim.enterDungeon(inst.dungeonId, pid);
    expectLocal(sim, pid, inst, ENTRY.x, ENTRY.z);
  });

  it('falls back during combat and recovers the checkpoint after the fight stops', () => {
    const { sim, pid, inst } = setup();
    earn(sim, inst, OLEN);
    const enemy = livingMob(sim, inst);
    enemy.inCombat = true;
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, ENTRY.x, ENTRY.z);
    enemy.inCombat = false;
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, ARENA.x, ARENA.z);
  });

  it('falls back to an earlier safe checkpoint if a live enemy occupies the latest one', () => {
    const { sim, pid, inst } = setup();
    earn(sim, inst, OLEN, OSSICK);
    const web = localOf(inst, YARD.x, YARD.z);
    standAt(sim, livingMob(sim, inst), web.x, web.z);
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, ARENA.x, ARENA.z);
  });

  it('cannot borrow progress from another solo claim or a missing boss entity', () => {
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN);
    release(sim, pid);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(ARENA);
    const secondPid = sim.addPlayer('warrior', 'Other');
    sim.enterDungeon(inst.dungeonId, secondPid);
    const other = sim.instances.find(
      (i) => i.dungeonId === inst.dungeonId && i.partyKey === `solo:${secondPid}`,
    )!;
    expect(dungeonReentryPoint(sim.ctx, other, player)).toEqual(DUNGEONS[inst.dungeonId].entry);
    sim.ctx.dropEntity(rosterMob(sim, inst, OLEN).id);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(DUNGEONS[inst.dungeonId].entry);
  });

  it('shares earned progress with party members who die in the same claim', () => {
    const { sim, pid } = setup();
    sim.leaveDungeon(pid);
    const secondPid = sim.addPlayer('warrior', 'PartyRunner');
    sim.partyInvite(secondPid, pid);
    sim.partyAccept(secondPid);
    sim.enterDungeon(FIXTURE, pid);
    sim.enterDungeon(FIXTURE, secondPid);
    const inst = sim.instances.find(
      (i) => i.dungeonId === FIXTURE && i.partyKey?.startsWith('party:'),
    )!;
    earn(sim, inst, OLEN);
    reenter(sim, secondPid, inst.dungeonId);
    expectLocal(sim, secondPid, inst, ARENA.x, ARENA.z);
  });

  it('resetting and reclaiming a slot discards its recovery progress', () => {
    const { sim, pid, inst } = setup();
    earn(sim, inst, OLEN);
    sim.leaveDungeon(pid);
    freeInstance(sim.ctx, inst);
    sim.enterDungeon(FIXTURE, pid);
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, ENTRY.x, ENTRY.z);
  });

  it('retains progress after the defeated boss corpse decays', () => {
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN);
    const boss = rosterMob(sim, inst, OLEN);
    boss.corpseTimer = 0;
    release(sim, pid);
    sim.tick();
    expect(sim.entities.get(boss.id)?.dead).toBe(true);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(ARENA);
  });

  it('uses the previous safe arena while a lingering ground zone covers the latest checkpoint', () => {
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN, OSSICK);
    release(sim, pid);
    const origin = instanceOrigin(DUNGEONS[inst.dungeonId].index, inst.slot);
    const ctx = sim.ctx;
    ctx.groundAoEs.push({
      sourceId: inst.mobIds[0],
      pos: { x: origin.x + YARD.x, y: 1, z: origin.z + YARD.z },
      radius: 5,
      remaining: 10,
      min: 1,
      max: 1,
      interval: 1,
      tickTimer: 1,
      school: 'shadow',
      ability: 'Test hazard',
      abilityId: 'test_hazard',
    });
    expect(dungeonReentryPoint(ctx, inst, player)).toEqual(ARENA);
    ctx.groundAoEs[0].remaining = 0;
    expect(dungeonReentryPoint(ctx, inst, player)).toEqual(YARD);
    ctx.groundAoEs[0].remaining = 10;
    ctx.groundAoEs[0].pos.z = origin.z + YARD.z + 5 + PLAYER_BODY_RADIUS;
    expect(dungeonReentryPoint(ctx, inst, player)).toEqual(ARENA);
    ctx.groundAoEs[0].pos.z += 0.01;
    expect(dungeonReentryPoint(ctx, inst, player)).toEqual(YARD);
  });

  it('does not apply a reclaimed slot checkpoint to a corpse from its previous claim', () => {
    const { sim, pid, inst, player } = setup();
    release(sim, pid);
    const oldClaimId = player.corpseInstanceId;
    freeInstance(sim.ctx, inst);
    const secondPid = sim.addPlayer('warrior', 'NewOwner');
    sim.enterDungeon(FIXTURE, secondPid);
    earn(sim, inst, OLEN);
    expect(inst.exitId).not.toBe(oldClaimId);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(DUNGEONS[inst.dungeonId].entry);
    // The new owner's own corpse does earn it, so only the claim id refused the old one.
    release(sim, secondPid);
    expect(dungeonReentryPoint(sim.ctx, inst, sim.entities.get(secondPid)!)).toEqual(ARENA);
  });

  it.each(['chase', 'evade'] as const)(
    'keeps the entrance while a living actor is in %s',
    (aiState) => {
      const { sim, pid, inst } = setup();
      earn(sim, inst, OLEN);
      livingMob(sim, inst).aiState = aiState;
      reenter(sim, pid, inst.dungeonId);
      expectLocal(sim, pid, inst, ENTRY.x, ENTRY.z);
    },
  );

  it('counts an engaged encounter add appended after the static spawns', () => {
    const { sim, pid, inst } = setup();
    earn(sim, inst, OLEN);
    const add = createMob(sim.ctx.nextId++, MOBS.drowned_watchman, 8, livingMob(sim, inst).pos);
    add.inCombat = true;
    sim.ctx.addEntity(add);
    inst.mobIds.push(add.id);
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, ENTRY.x, ENTRY.z);
  });

  it.each([
    ['wildheart_basin', 'fanglord_jaguar'],
    ['sunken_bastion', 'gaoler_ossick'],
    ['drowned_temple', 'tideglass_colossus'],
    ['gravewyrm_sanctum', 'grand_necromancer_velkhar'],
  ])('cannot unlock %s by killing only %s', (dungeonId, successor) => {
    const { sim, pid, inst } = setup(dungeonId);
    // Every gate reads open and every living boss stands far from every point, so
    // only the missing predecessor can refuse the successor's row.
    setDungeonGatesDevOpen(inst, true);
    kill(sim, inst, successor);
    const row = DUNGEON_CHECKPOINTS[dungeonId].find((c) => c.bosses.includes(successor))!;
    const entry = DUNGEONS[dungeonId].entry;
    const far = localOf(inst, entry.x, entry.z + 40);
    const predecessors = row.bosses.filter((boss) => boss !== successor);
    expect(predecessors.length).toBeGreaterThan(0);
    for (const boss of predecessors) moveHome(sim, rosterMob(sim, inst, boss), far.x, far.z);
    release(sim, pid);
    const player = sim.entities.get(pid)!;
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(entry);
    // The predecessors were all that stood in the way.
    kill(sim, inst, ...predecessors);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(row.pos);
  });

  it('resolves identical recoveries on a replay without drawing rng', () => {
    const run = () => {
      const { sim, pid, inst, player } = setup();
      earn(sim, inst, OLEN);
      const draws: number[] = [];
      sim.ctx.rng.setObserver((value) => draws.push(value));
      reenter(sim, pid, inst.dungeonId);
      expect(draws).toEqual([]);
      const nextDraw = sim.ctx.rng.next();
      // The observer was listening all along: it hears the very next draw.
      expect(draws).toEqual([nextDraw]);
      return { pos: player.pos, hp: player.hp, nextDraw };
    };
    const first = run();
    expect(first).toEqual(run());
    const origin = instanceOrigin(DUNGEONS.sunken_bastion.index, 0);
    expect(first.pos.x).toBe(origin.x + ARENA.x);
    expect(first.pos.z).toBe(origin.z + ARENA.z);
  });

  // The crypt's two loft cases (each wing boss required independently, Cantor
  // required while her body stood far away) went with the dungeon. The
  // Bastion's chain is linear; the predecessor rule they pinned is still
  // covered above ("does not bypass a living predecessor" and "cannot unlock
  // %s by killing only %s", which re-homes the living predecessors far away).
  it('a same-template summoned corpse cannot replace the living authored boss', () => {
    const { sim, pid, inst, player } = setup();
    setDungeonGatesDevOpen(inst, true);
    // The authored Olen lives, far from his terrace, so his body cannot be what
    // refuses the point: only his own spawn ordinal still reading alive can.
    const olen = rosterMob(sim, inst, OLEN);
    const far = localOf(inst, ENTRY.x, ENTRY.z + 40);
    moveHome(sim, olen, far.x, far.z);
    const summon = createMob(sim.ctx.nextId++, MOBS.knight_commander_olen, 8, { ...olen.pos });
    sim.ctx.addEntity(summon);
    inst.mobIds.push(summon.id);
    handleDeath(sim.ctx, summon, sim.entities.get(pid) ?? null);
    expect(summon.dead).toBe(true);
    release(sim, pid);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(DUNGEONS.sunken_bastion.entry);
    // The authored one dies and the same scene offers the terrace.
    kill(sim, inst, OLEN);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(ARENA);
  });

  it('falls back to the previous arena if the latest point becomes obstructed', () => {
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN, OSSICK);
    release(sim, pid);
    const origin = instanceOrigin(DUNGEONS[inst.dungeonId].index, inst.slot);
    const original = colliders.isBlocked;
    // A changing collider can obstruct an otherwise valid authored point.
    // Keep all other probes on the real collision path.
    const probe = vi
      .spyOn(colliders, 'isBlocked')
      .mockImplementation((seed, x, z, radius) =>
        x === origin.x + YARD.x && z === origin.z + YARD.z ? true : original(seed, x, z, radius),
      );
    try {
      expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(ARENA);
    } finally {
      probe.mockRestore();
    }
  });

  it('keeps the static boss ordinals when an appended encounter body is dropped', () => {
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN);
    const spawns = DUNGEONS[inst.dungeonId].spawns;
    const far = localOf(inst, 0, 60);
    const bodies = [0, 1].map(() => {
      const body = createMob(
        sim.ctx.nextId++,
        MOBS.drowned_watchman,
        8,
        sim.ctx.groundPos(far.x, far.z),
      );
      sim.ctx.addEntity(body);
      inst.mobIds.push(body.id);
      return body;
    });
    expect(inst.mobIds.length).toBe(spawns.length + 2);
    // The first of two appended bodies goes, so the second one shifts down a slot.
    dropEncounterBody(sim.ctx, inst, null, bodies[0].id);
    expect(sim.entities.has(bodies[0].id)).toBe(false);
    expect(inst.mobIds.length).toBe(spawns.length + 1);
    expect(inst.mobIds[spawns.length]).toBe(bodies[1].id);
    spawns.forEach((spawn, i) => {
      expect(sim.entities.get(inst.mobIds[i])?.templateId, `ordinal ${i}`).toBe(spawn.mobId);
    });
    dropEncounterBody(sim.ctx, inst, null, bodies[1].id);
    release(sim, pid);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(ARENA);
    // A dead boss that left its own ordinal is no longer proof of anything.
    dropEncounterBody(sim.ctx, inst, null, rosterMob(sim, inst, OLEN).id);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(DUNGEONS[inst.dungeonId].entry);
  });
});

describe('dungeon death checkpoints: gates', () => {
  const GATED = Object.entries(DUNGEON_CHECKPOINTS).flatMap(([dungeonId, rows]) =>
    rows.flatMap((row, index) =>
      row.gates
        .filter((gateId) => (gateOf(dungeonId, gateId).packs ?? []).length > 0)
        .map((gateId) => [dungeonId, index, gateId] as const),
    ),
  );

  it('lists a pack gate on the way to every checkpoint', () => {
    for (const [dungeonId, rows] of Object.entries(DUNGEON_CHECKPOINTS)) {
      rows.forEach((_, index) => {
        expect(
          GATED.some(([d, i]) => d === dungeonId && i === index),
          `${dungeonId} ${index}`,
        ).toBe(true);
      });
    }
  });

  it.each(GATED)(
    '%s checkpoint %i stays shut while the %s packs live',
    (dungeonId, index, gateId) => {
      const { sim, pid, inst, player } = setup(dungeonId);
      const row = DUNGEON_CHECKPOINTS[dungeonId][index];
      const gate = gateOf(dungeonId, gateId);
      // The gate's own packs live. Every other pack and boss on the way in is dead,
      // and so is every boss the checkpoint asks for.
      const spared = new Set(gate.packs ?? []);
      for (const otherId of row.gates) {
        const other = gateOf(dungeonId, otherId);
        killPacks(sim, inst, ...(other.packs ?? []).filter((p) => !spared.has(p)));
      }
      kill(sim, inst, ...row.bosses);
      expect(packMobs(sim, inst, [...spared]).length).toBeGreaterThan(0);
      expect(dungeonGateState(sim.ctx, inst, gate)).toBe('closed');
      release(sim, pid);
      const refused = dungeonReentryPoint(sim.ctx, inst, player);
      expect(refused).not.toEqual(row.pos);
      // It goes to the door or to an earlier row, never anywhere else.
      const earlier = DUNGEON_CHECKPOINTS[dungeonId].slice(0, index).map((c) => c.pos);
      expect([DUNGEONS[dungeonId].entry, ...earlier]).toContainEqual(refused);
      // The gate is what refuses it, not the packs that still live behind it:
      // read the gates open with those packs untouched and the point is offered.
      setDungeonGatesDevOpen(inst, true);
      expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(row.pos);
      setDungeonGatesDevOpen(inst, false);
      expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(refused);
      // And for real: its packs die, the gate opens, the point is offered.
      killPacks(sim, inst, ...spared);
      expect(dungeonGateState(sim.ctx, inst, gate)).toBe('open');
      expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(row.pos);
    },
  );

  it('a remote boss kill cannot open a sealed arena to a returning ghost', () => {
    const { sim, pid, inst, player } = setup();
    // The boss is dead and every pack of the dungeon is alive: the Sea Gate
    // (the flats packs) and the Rampart Door before Olen are both closed.
    kill(sim, inst, OLEN);
    expect(dungeonGateState(sim.ctx, inst, gateOf(FIXTURE, 'sea_gate'))).toBe('closed');
    expect(dungeonGateState(sim.ctx, inst, gateOf(FIXTURE, 'rampart_door'))).toBe('closed');
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, ENTRY.x, ENTRY.z);
    expect(player.dead).toBe(false);
  });
  it('reads the gates through the gate module, dev override included', () => {
    const { sim, pid, inst, player } = setup();
    kill(sim, inst, OLEN);
    release(sim, pid);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(DUNGEONS.sunken_bastion.entry);
    setDungeonGatesDevOpen(inst, true);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(ARENA);
    setDungeonGatesDevOpen(inst, false);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(DUNGEONS.sunken_bastion.entry);
  });
});

describe('dungeon death checkpoints: arrival clearance', () => {
  it('clears the wander ring round every home and the aggro ceiling round every body', () => {
    expect(MAX_AGGRO_RADIUS).toBe(20);
    expect(MAX_WANDER_RADIUS).toBe(9);
    expect(RIFT_ENTRY_CLEAR_RADIUS).toBe(29);
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN);
    release(sim, pid);
    const at = localOf(inst, ARENA.x, ARENA.z);
    const yard = ARENA;
    const door = DUNGEONS[inst.dungeonId].entry;
    // Unrostered on purpose: a hazard nobody added to the claim is still seen.
    const add = createMob(sim.ctx.nextId++, MOBS.drowned_watchman, 8, {
      x: at.x + 28.99,
      y: BREACH_BASTION.h,
      z: at.z,
    });
    sim.ctx.addEntity(add);
    expect(inst.mobIds).not.toContain(add.id);
    const place = (home: number, body: number) => {
      add.spawnPos = { x: at.x + home, y: BREACH_BASTION.h, z: at.z };
      add.pos = { x: at.x + body, y: BREACH_BASTION.h, z: at.z };
      add.prevPos = { ...add.pos };
      sim.ctx.rebucket(add);
      return dungeonReentryPoint(sim.ctx, inst, player);
    };
    // Standing on its home: refused a hair inside the clearance, offered on it.
    expect(place(28.99, 28.99)).toEqual(door);
    expect(place(29, 29)).toEqual(yard);
    // A wanderer is judged by its home, not by where it is right now: at the far
    // edge of a ring that reaches well inside the ceiling it still refuses...
    expect(place(20, 29)).toEqual(door);
    expect(place(28.99, 37.9)).toEqual(door);
    // ...and at the near edge of a ring that stops on the ceiling it does not.
    expect(place(29, 20)).toEqual(yard);
    // A body inside the ceiling right now refuses, however far its home.
    expect(place(60, 19.99)).toEqual(door);
    expect(place(60, 20)).toEqual(yard);
  });

  it('measures a patrol by its loop, with room for the corner it cuts', () => {
    expect(PATROL_REJOIN_DISTANCE).toBe(4);
    const reach = MAX_AGGRO_RADIUS + PATROL_REJOIN_DISTANCE;
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN);
    release(sim, pid);
    const at = localOf(inst, ARENA.x, ARENA.z);
    const yard = ARENA;
    const door = DUNGEONS[inst.dungeonId].entry;
    // The patroller itself stands far off: only its loop comes near the yard.
    const walker = createMob(sim.ctx.nextId++, MOBS.drowned_watchman, 8, {
      x: at.x + 70,
      y: BREACH_BASTION.h,
      z: at.z,
    });
    sim.ctx.addEntity(walker);
    inst.mobIds.push(walker.id);
    const loopAt = (d: number) => ({
      points: [
        { x: at.x + d, z: at.z - 40 },
        { x: at.x + d, z: at.z + 40 },
        { x: at.x + 70, z: at.z + 40 },
        { x: at.x + 70, z: at.z - 40 },
      ],
      offset: 0,
      pace: 0.4,
    });
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(yard);
    walker.dungeonPatrol = loopAt(reach - 0.01);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(door);
    walker.dungeonPatrol = loopAt(reach);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(yard);
    // A patrol has no wander ring: its spawn point inside the home clearance
    // does not refuse a point its loop stays clear of.
    walker.spawnPos = { x: at.x + reach, y: BREACH_BASTION.h, z: at.z };
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(yard);
    // The same mob without a loop, standing in the ring round that spawn point,
    // is a wanderer homed too close.
    walker.dungeonPatrol = undefined;
    walker.pos = { x: at.x + reach + MAX_WANDER_RADIUS, y: BREACH_BASTION.h, z: at.z };
    sim.ctx.rebucket(walker);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(door);
    // A loop that only a dead patroller walked refuses nothing.
    walker.dungeonPatrol = loopAt(reach - 0.01);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(door);
    handleDeath(sim.ctx, walker, null);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(yard);
  });

  it('a wanderer on the edge of the clearance never reaches an arrival', () => {
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN);
    const at = localOf(inst, ARENA.x, ARENA.z);
    const home = sim.ctx.groundPos(at.x, at.z - RIFT_ENTRY_CLEAR_RADIUS);
    const wanderer = createMob(sim.ctx.nextId++, MOBS.drowned_watchman, 8, home);
    sim.ctx.addEntity(wanderer);
    inst.mobIds.push(wanderer.id);
    // The worst arrival: low enough that the wanderer sees it from the full ceiling.
    sim.setPlayerLevel(1, pid);
    expect(
      MOBS.drowned_watchman.aggroRadius + (wanderer.level - player.level) * 1.5,
    ).toBeGreaterThanOrEqual(MAX_AGGRO_RADIUS);
    reenter(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, ARENA.x, ARENA.z);
    let nearest = Infinity;
    let strayed = 0;
    for (let i = 0; i < 20 * 60; i++) {
      sim.tick();
      nearest = Math.min(nearest, gap(wanderer.pos, player.pos));
      strayed = Math.max(strayed, gap(wanderer.pos, home));
      expect(player.inCombat).toBe(false);
      expect(wanderer.inCombat).toBe(false);
    }
    // It did wander, inside the ring the clearance allows for, so it never came
    // inside the ceiling.
    expect(strayed).toBeGreaterThan(1);
    expect(strayed).toBeLessThanOrEqual(MAX_WANDER_RADIUS + 0.5);
    expect(nearest).toBeGreaterThanOrEqual(MAX_AGGRO_RADIUS);
  });

  // The idle-cull patrol case ran on the crypt's aisle patrol q2, whose loop
  // turned 18 yd short of the Choir Loft. It left with the dungeon (2026-11-11):
  // no remaining dungeon has a live, off-route patrol inside the aggro ceiling
  // of a checkpoint. The loop rule itself stays pinned by "measures a patrol
  // by its loop" above.
  it('lands beside a living patrol whose loop stays outside the aggro ceiling', () => {
    const { sim, pid, inst, player } = setup('gravewyrm_sanctum');
    earn(sim, inst, 'korgath_the_bound', 'grand_necromancer_velkhar');
    // The shore patrol pd lives: its loop passes 28 yd from the Vault's point.
    const patrol = packMobs(sim, inst, ['pd']);
    expect(patrol.length).toBeGreaterThan(0);
    const vault = localOf(inst, 0, 107);
    // The point is offered at every phase of the lap, the nearest included: the
    // answer does not turn on where the patrol happens to be.
    release(sim, pid);
    let nearest = Infinity;
    for (let i = 0; i < 20 * 120; i++) {
      sim.tick();
      expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual({ x: 0, z: 107 });
      for (const mob of patrol) nearest = Math.min(nearest, gap(mob.pos, vault));
    }
    expect(nearest).toBeLessThan(RIFT_ENTRY_CLEAR_RADIUS);
    expect(nearest).toBeGreaterThanOrEqual(MAX_AGGRO_RADIUS + PATROL_REJOIN_DISTANCE);
    // And the arrival is left alone for another lap and more.
    crossDoor(sim, pid, inst.dungeonId);
    expectLocal(sim, pid, inst, 0, 107);
    for (let i = 0; i < 20 * 120; i++) {
      sim.tick();
      expect(player.inCombat).toBe(false);
      for (const mob of patrol) expect(mob.inCombat).toBe(false);
    }
    expectLocal(sim, pid, inst, 0, 107);
  });

  // The crypt-only Chorister case (a pack member outliving its boss beside the
  // loft) went with the dungeon; "counts only the mobs that can pull the
  // arriving player" below still pins that a living hostile elite beside a
  // point refuses it.
  it('counts only the mobs that can pull the arriving player', () => {
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN);
    release(sim, pid);
    const at = localOf(inst, ARENA.x, ARENA.z);
    const yard = ARENA;
    const door = DUNGEONS[inst.dungeonId].entry;
    const prop = createMob(
      sim.ctx.nextId++,
      MOBS.drowned_watchman,
      8,
      sim.ctx.groundPos(at.x + 4, at.z),
    );
    sim.ctx.addEntity(prop);
    expect(MOBS.drowned_watchman.elite).toBe(true);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(door);
    // An inert, non-hostile body (a candle, a cage, a scripted entrance) pulls nobody.
    prop.hostile = false;
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(yard);
    // A flying patrol on the wing is not hostile either, and it still stoops on
    // whoever it sees.
    prop.dungeonPatrol = { points: [{ x: at.x + 4, z: at.z }], offset: 0, pace: 0.4, flightY: 40 };
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(door);
    prop.dungeonPatrol = undefined;
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(yard);
    // Somebody's pet is nobody's threat, hostile flag or not.
    prop.hostile = true;
    prop.ownerId = pid;
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(yard);
    prop.ownerId = null;
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(door);
    prop.hostile = false;
    // Ordinary (non-elite) trash counts while the arrival is near its level...
    expect(MOBS.barnacle_crawler.elite).toBeFalsy();
    const plain = createMob(
      sim.ctx.nextId++,
      MOBS.barnacle_crawler,
      8,
      sim.ctx.groundPos(at.x - 4, at.z),
    );
    sim.ctx.addEntity(plain);
    expect(player.level).toBeLessThan(10);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(door);
    // ...and never aggroes on sight once it is trivial to them.
    sim.setPlayerLevel(20, pid);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(yard);
    // An elite does, at any level.
    prop.hostile = true;
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(door);
    // A dead one does not.
    handleDeath(sim.ctx, prop, null);
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(yard);
  });

  it('a member who dies at depth is delivered to the cleared arena and left alone', () => {
    const { sim, pid, inst, player } = setup();
    earn(sim, inst, OLEN);
    // Die for real, deep in the dungeon, to a living mob of the route.
    const killer = livingMob(sim, inst);
    const deep = localOf(inst, 0, 60);
    standAt(sim, player, deep.x, deep.z);
    handleDeath(sim.ctx, player, killer);
    expect(player.dead).toBe(true);
    expect(player.ghost).toBe(false);
    sim.releaseSpirit(pid);
    expect(player.ghost).toBe(true);
    expect(player.corpseInstanceId).toBe(inst.exitId);
    expect(player.corpsePos!.x).toBe(deep.x);
    expect(player.corpsePos!.z).toBe(deep.z);
    // The spirit rose at the outdoor graveyard and runs back to the door.
    expect(sim.instanceSlotAt(player.pos)).toBeNull();
    const door = doorOf(sim, inst.dungeonId);
    standAt(sim, player, door.pos.x, door.pos.z);
    // The ghost arm of the real tick carries it through.
    sim.tick();
    expect(player.ghost).toBe(false);
    expect(player.dead).toBe(false);
    expect(player.corpsePos).toBeNull();
    expectLocal(sim, pid, inst, ARENA.x, ARENA.z);
    expect(tickAndWatch(sim, inst, player, 10)).toBe(false);
    expectLocal(sim, pid, inst, ARENA.x, ARENA.z);
  });
});

describe('dungeon death checkpoints: the table', () => {
  it('names real gates, bosses of the dungeon, and unobstructed points', () => {
    for (const [dungeonId, rows] of Object.entries(DUNGEON_CHECKPOINTS)) {
      const dungeon = DUNGEONS[dungeonId];
      const origin = instanceOrigin(dungeon.index, 4);
      setOpenDungeonGates(
        origin.x,
        origin.z,
        (dungeon.gates ?? []).map((g) => g.id),
      );
      for (const row of rows) {
        expect(row.gates.length, `${dungeonId} gates`).toBeGreaterThan(0);
        expect(new Set(row.gates).size).toBe(row.gates.length);
        for (const gateId of row.gates) {
          const gate = gateOf(dungeonId, gateId);
          // A gate that waits on a boss waits only on bosses the row already asks
          // for, so the row's own pack gates are what prove the way in.
          for (const boss of gate.bosses ?? []) {
            expect(row.bosses, `${dungeonId} ${gateId}`).toContain(boss);
          }
        }
        // The route ends in the pack gate of the arena's own section.
        const last = gateOf(dungeonId, row.gates[row.gates.length - 1]);
        expect((last.packs ?? []).length, `${dungeonId} ${last.id}`).toBeGreaterThan(0);
        for (const boss of row.bosses) {
          expect(
            dungeon.spawns.some((s) => s.mobId === boss),
            `${dungeonId} ${boss}`,
          ).toBe(true);
        }
        expect(
          isBlocked(99, origin.x + row.pos.x, origin.z + row.pos.z, PLAYER_BODY_RADIUS),
          `${dungeonId} ${row.pos.x},${row.pos.z}`,
        ).toBe(false);
      }
      setOpenDungeonGates(origin.x, origin.z, []);
    }
  });

  it('lists either twin where two gates open on one condition', () => {
    const condition = (dungeonId: string, gateId: string) => {
      const gate = gateOf(dungeonId, gateId);
      return { packs: gate.packs ?? [], bosses: gate.bosses ?? [], seal: gate.sealWhileEngaged };
    };
    expect(condition('gravewyrm_sanctum', 'west_chain_stair')).toEqual(
      condition('gravewyrm_sanctum', 'east_chain_stair'),
    );
    const west = condition('drowned_temple', 'court_stair_west');
    expect(west).toEqual(condition('drowned_temple', 'court_stair_east'));
  });

  it('stands the Drowning Yard point clear of the winch that fills the yard centre', () => {
    const dungeon = DUNGEONS.sunken_bastion;
    const origin = instanceOrigin(dungeon.index, 4);
    const yard = SUNKEN_BASTION_ANCHORS.drowningYard;
    expect(isBlocked(99, origin.x + yard.x, origin.z + yard.z, PLAYER_BODY_RADIUS)).toBe(true);
    const row = rowOf('sunken_bastion', ['knight_commander_olen', 'gaoler_ossick']);
    expect(row.pos.x).toBe(yard.x);
    expect(row.pos.z).toBeLessThan(yard.z);
    expect(isBlocked(99, origin.x + row.pos.x, origin.z + row.pos.z, PLAYER_BODY_RADIUS)).toBe(
      false,
    );
  });

  it('answers only for the dungeons it lists, never for an inherited key', () => {
    expect(Object.keys(DUNGEON_CHECKPOINTS).sort()).toEqual([
      'drowned_temple',
      'gravewyrm_sanctum',
      // 'hollow_crypt' left the table with the dungeon (2026-11-11).
      'sunken_bastion',
      'wildheart_basin',
    ]);
    const sim = new Sim({
      seed: 99,
      playerClass: 'warrior',
      noPlayer: true,
      world: { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] },
    });
    const pid = sim.addPlayer('warrior', 'Runner');
    expect(sim.enterDungeon('the_last_keep', pid)).toBe(true);
    const inst = sim.instances.find((i) => i.dungeonId === 'the_last_keep' && i.partyKey !== null)!;
    const player = sim.entities.get(pid)!;
    release(sim, pid);
    expect(player.corpseInstanceId).toBe(inst.exitId);
    const entry = DUNGEONS.the_last_keep.entry;
    // A row that would apply at once. As an own key of the table it is honoured,
    // so the point itself is a good one...
    const row: DungeonCheckpoint[] = [{ bosses: [], gates: [], pos: { x: 0, z: 20 } }];
    const table = DUNGEON_CHECKPOINTS as Record<string, readonly DungeonCheckpoint[]>;
    table.the_last_keep = row;
    try {
      expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual({ x: 0, z: 20 });
    } finally {
      delete table.the_last_keep;
    }
    expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(entry);
    // ...and reachable only through the prototype chain it is not.
    Object.defineProperty(Object.prototype, 'the_last_keep', {
      value: row,
      configurable: true,
      enumerable: false,
    });
    try {
      expect(table.the_last_keep, 'the fixture is visible through the chain').toBe(row);
      expect(dungeonReentryPoint(sim.ctx, inst, player)).toEqual(entry);
    } finally {
      delete (Object.prototype as Record<string, unknown>).the_last_keep;
    }
    expect(table.the_last_keep).toBeUndefined();
  });

  // The walk is a flood fill over a one-yard grid that asks the real collision
  // seam (the same one the per-dungeon route suites walk), with exactly the listed
  // gates open: the point must be reachable from the door, and no listed gate may
  // be left out without cutting it off.
  describe.each(Object.keys(DUNGEON_CHECKPOINTS))('%s routes', (dungeonId) => {
    const dungeon = DUNGEONS[dungeonId];
    const origin = instanceOrigin(dungeon.index, 4);
    const { minX, maxX, minZ, maxZ } = FIELDS[dungeonId as keyof typeof FIELDS].bounds;
    const width = maxX - minX + 1;
    const cell = (x: number, z: number) => (Math.round(z) - minZ) * width + (Math.round(x) - minX);
    const reaches = (open: readonly string[], x: number, z: number): boolean => {
      setOpenDungeonGates(origin.x, origin.z, open);
      const seen = new Uint8Array(width * (maxZ - minZ + 1));
      const queue = [Math.round(dungeon.entry.x), Math.round(dungeon.entry.z)];
      seen[cell(queue[0], queue[1])] = 1;
      for (let q = 0; q < queue.length; q += 2) {
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = queue[q] + dx;
          const nz = queue[q + 1] + dz;
          if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
          const i = cell(nx, nz);
          if (seen[i] || isBlocked(7, origin.x + nx, origin.z + nz, 0.5)) continue;
          seen[i] = 1;
          queue.push(nx, nz);
        }
      }
      setOpenDungeonGates(origin.x, origin.z, []);
      return seen[cell(x, z)] === 1;
    };

    it.each(DUNGEON_CHECKPOINTS[dungeonId].map((row, index) => [index, row] as const))(
      'checkpoint %i is behind exactly its listed gates',
      (_, row) => {
        expect(reaches([], row.pos.x, row.pos.z)).toBe(false);
        expect(reaches(row.gates, row.pos.x, row.pos.z)).toBe(true);
        for (const gateId of row.gates) {
          const rest = row.gates.filter((id) => id !== gateId);
          expect(reaches(rest, row.pos.x, row.pos.z), `without ${gateId}`).toBe(false);
        }
      },
      120_000,
    );
  });
});

describe('dungeon death checkpoints: instances outside the table', () => {
  function soloSim() {
    const sim = new Sim({
      seed: 99,
      playerClass: 'warrior',
      noPlayer: true,
      world: { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] },
    });
    return { sim, pid: sim.addPlayer('warrior', 'Runner') };
  }

  it('a ghost re-entering a dungeon with no checkpoints rises at its entrance', () => {
    const { sim, pid } = soloSim();
    expect(DUNGEON_CHECKPOINTS.the_last_keep).toBeUndefined();
    expect(sim.enterDungeon('the_last_keep', pid)).toBe(true);
    const inst = sim.instances.find((i) => i.dungeonId === 'the_last_keep' && i.partyKey !== null)!;
    const player = sim.entities.get(pid)!;
    const deep = localOf(inst, 0, 20);
    standAt(sim, player, deep.x, deep.z);
    release(sim, pid);
    expect(player.corpseInstanceId).toBe(inst.exitId);
    expect(sim.instanceSlotAt(player.pos)).toBeNull();
    expect(sim.enterDungeon('the_last_keep', pid)).toBe(true);
    const entry = DUNGEONS.the_last_keep.entry;
    expectLocal(sim, pid, inst, entry.x, entry.z);
    expect(player.ghost).toBe(false);
    expect(player.dead).toBe(false);
  });

  it('a raid ghost crosses the nested crypt as a spirit and rises at the arena entrance', () => {
    const { sim, pid: tank } = soloSim();
    sim.players.get(tank)!.questsDone.add('q_nythraxis_bound_guardian');
    const raiders = [tank];
    for (let i = 0; i < 4; i++) {
      const pid = sim.addPlayer('mage', `Dps${i}`);
      sim.players.get(pid)!.questsDone.add('q_nythraxis_bound_guardian');
      sim.partyInvite(pid, tank);
      sim.partyAccept(pid);
      raiders.push(pid);
    }
    sim.convertPartyToRaid(tank);
    for (const pid of raiders) {
      sim.enterDungeon('nythraxis_crypt', pid);
      sim.enterDungeon('nythraxis_boss_arena', pid);
    }
    expect(DUNGEON_CHECKPOINTS.nythraxis_crypt).toBeUndefined();
    expect(DUNGEON_CHECKPOINTS.nythraxis_boss_arena).toBeUndefined();
    const arena = sim.instances.find(
      (i) => i.dungeonId === 'nythraxis_boss_arena' && i.partyKey !== null,
    )!;
    const boss = arena.mobIds.map((id) => sim.entities.get(id)!)[0];
    const body = sim.entities.get(tank)!;
    const deep = { x: boss.pos.x + 6, z: boss.pos.z - 6 };
    standAt(sim, body, deep.x, deep.z);
    handleDeath(sim.ctx, body, boss);
    expect(body.dead).toBe(true);
    handleDeath(sim.ctx, boss, sim.entities.get(raiders[1])!);
    expect(boss.dead).toBe(true);
    sim.releaseSpirit(tank);
    expect(body.ghost).toBe(true);
    expect(body.corpseInstanceId).toBe(arena.exitId);
    expect(sim.instanceSlotAt(body.pos)).toBeNull();

    expect(sim.enterDungeon('nythraxis_crypt', tank)).toBe(true);
    const crypt = sim.instances.find(
      (i) => i.dungeonId === 'nythraxis_crypt' && i.partyKey !== null,
    )!;
    const cryptEntry = DUNGEONS.nythraxis_crypt.entry;
    expectLocal(sim, tank, crypt, cryptEntry.x, cryptEntry.z);
    expect(body.ghost).toBe(true);
    expect(body.dead).toBe(true);

    expect(sim.enterDungeon('nythraxis_boss_arena', tank)).toBe(true);
    const arenaEntry = DUNGEONS.nythraxis_boss_arena.entry;
    expectLocal(sim, tank, arena, arenaEntry.x, arenaEntry.z);
    expect(body.ghost).toBe(false);
    expect(body.dead).toBe(false);
    expect(body.corpsePos).toBeNull();
  });
});
