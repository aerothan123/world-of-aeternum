import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Postgres is mocked before the server import the twin runner pulls in
// (superset shape, copied from tests/movement_latency_baseline.test.ts).
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  saveMarketState: vi.fn(async () => {}),
  saveMailState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  acquireCharacterLease: vi.fn(async () => true),
  releaseCharacterLease: vi.fn(async () => {}),
  heartbeatCharacterLeases: vi.fn(async () => {}),
  releaseAllCharacterLeases: vi.fn(async () => {}),
}));

import {
  AIR_CONTROL_ACCEL,
  BACKPEDAL_MULT,
  GRAVITY,
  JUMP_VELOCITY,
} from '../src/sim/player_motion';
import { DT, emptyMoveInput, type MoveInput, RUN_SPEED, TURN_SPEED } from '../src/sim/types';
import { groundHeight, terrainHeight, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';
import {
  COLLIDER_FREE_LANE,
  type MoveScript,
  type MoveScriptEntry,
  runTwinServerTrajectory,
} from './helpers/movement_ground_truth';

// The W17 parity vectors for the Unreal client's self-prediction kernel
// (WyndMotionKernel): the tests/movement_latency_baseline.test.ts scenarios,
// plus the Unreal pawn's -WyndAutoWalk route, run through the twin GameServer
// (the authority's own kernel). Each tick records the held input, the driven
// facing, the authoritative pose after the tick, and the ground height under
// that pose (the Unreal host supplies ground from its own trace, so the
// vector carries the authority's ground as the kernel's floor provider).
//
// UNREAL_MOVEMENT_VECTORS_OUT=<path> writes the JSON; without it the test
// only checks the scenarios still run and stay deterministic.

const TICK_MS = DT * 1000;
const at = (ms: number): number => Math.round(ms / TICK_MS);
/** Facing on the wire is rounded to 1e-4 (the client's facing quantum). */
const wireFacing = (f: number): number => Math.round(f * 10000) / 10000;

interface VectorScenario {
  key: string;
  ticks: number;
  script: MoveScript;
  /** Defaults to COLLIDER_FREE_LANE (open sea: every baseline cell is a surface swim). */
  start?: { x: number; z: number };
  facing?: number;
}

/** A dry road on the Proving Shore (the Unreal AutoQuest's first leg), for the land arm. */
const SHORE_ROAD = { x: -286, z: -16 } as const;

function entries(list: Array<{ ms: number; mi?: Partial<MoveInput>; facing?: number }>) {
  return list.map(
    (e): MoveScriptEntry => ({
      tick: at(e.ms),
      mi: e.mi ?? {},
      ...(e.facing !== undefined ? { facing: e.facing } : {}),
    }),
  );
}

function withFacingTrack(
  base: MoveScriptEntry[],
  ticks: number,
  facingAt: (tMs: number) => number,
  untilTick = ticks,
): MoveScriptEntry[] {
  const out: MoveScriptEntry[] = [];
  for (let t = 0; t < ticks; t++) {
    const fromBase = base.filter((e) => e.tick === t);
    const mi = Object.assign({}, ...fromBase.map((e) => e.mi));
    if (t < untilTick) out.push({ tick: t, mi, facing: wireFacing(facingAt(t * TICK_MS)) });
    else if (fromBase.length > 0) out.push({ tick: t, mi });
  }
  return out;
}

const RUN_MS = 3000;

function scenarios(): VectorScenario[] {
  const list: VectorScenario[] = [];
  list.push({
    key: 'straight',
    ticks: at(4000),
    script: entries([
      { ms: 0, mi: { forward: true }, facing: 0 },
      { ms: RUN_MS, mi: { forward: false } },
    ]),
  });
  {
    const ticks = at(RUN_MS + 1000);
    const base = entries([
      { ms: 0, mi: { forward: true } },
      { ms: RUN_MS, mi: { forward: false } },
    ]);
    list.push({
      key: 'curved',
      ticks,
      script: withFacingTrack(
        base,
        ticks,
        (t) => (Math.PI / 4) * Math.sin((2 * Math.PI * t) / 2000),
      ),
    });
  }
  {
    const w: Array<{ ms: number; mi?: Partial<MoveInput>; facing?: number }> = [
      { ms: 0, mi: { forward: true, strafeLeft: true }, facing: 0 },
    ];
    for (let i = 1; i * 500 < RUN_MS; i++) {
      w.push({ ms: i * 500, mi: { strafeLeft: i % 2 === 0, strafeRight: i % 2 === 1 } });
    }
    w.push({ ms: RUN_MS, mi: { forward: false, strafeLeft: false, strafeRight: false } });
    list.push({ key: 'weave', ticks: at(RUN_MS + 1000), script: entries(w) });
  }
  list.push({
    key: 'jump',
    ticks: at(RUN_MS + 1000),
    script: entries([
      { ms: 0, mi: { forward: true }, facing: 0 },
      { ms: 1500, mi: { jump: true } },
      { ms: 1600, mi: { jump: false } },
      { ms: RUN_MS, mi: { forward: false } },
    ]),
  });
  {
    const tap: Array<{ ms: number; mi?: Partial<MoveInput>; facing?: number }> = [
      { ms: 0, mi: {}, facing: 0 },
    ];
    for (let i = 0; i < 5; i++) {
      tap.push({ ms: i * 600, mi: { forward: true } });
      tap.push({ ms: i * 600 + 300, mi: { forward: false } });
    }
    // Two entries can land on tick 0; merge them.
    const merged = new Map<number, MoveScriptEntry>();
    for (const e of entries(tap)) {
      const prev = merged.get(e.tick);
      merged.set(e.tick, prev ? { ...prev, ...e, mi: { ...prev.mi, ...e.mi } } : e);
    }
    list.push({ key: 'tapping', ticks: at(RUN_MS), script: [...merged.values()] });
  }
  list.push({
    key: 'turn-idle',
    ticks: at(1500),
    script: entries([
      { ms: 300, mi: { turnLeft: true } },
      { ms: 500, mi: { turnLeft: false } },
    ]),
  });
  list.push({
    key: 'turn-walking',
    ticks: at(1800),
    script: entries([
      { ms: 0, mi: { forward: true } },
      { ms: 500, mi: { turnLeft: true } },
      { ms: 700, mi: { turnLeft: false } },
      { ms: 1000, mi: { forward: false } },
    ]),
  });
  list.push({
    key: 'mouselook-release',
    ticks: at(1600),
    script: entries([
      { ms: 100, facing: 0 },
      { ms: 200, facing: 0.2 },
      { ms: 300, facing: 0.4 },
      { ms: 400, facing: 0.6 },
      { ms: 560, facing: 0.8 },
    ]),
  });
  {
    // The Unreal pawn's -WyndAutoWalk route (WyndNetPawn.cpp SampleInput), two
    // laps: 6 s forward turning 0.35 rad/s, 1 s still, 1.5 s strafing left.
    const ticks = at(17000);
    const out: MoveScriptEntry[] = [];
    let facing = 0;
    let prev: Partial<MoveInput> | null = null;
    for (let t = 0; t < ticks; t++) {
      const phase = (t * DT) % 8.5;
      const mi = { forward: phase < 6, strafeLeft: phase >= 7 };
      if (mi.forward) facing += 0.35 * DT;
      const changed = !prev || prev.forward !== mi.forward || prev.strafeLeft !== mi.strafeLeft;
      out.push({ tick: t, mi: changed ? mi : {}, facing: wireFacing(facing) });
      prev = mi;
    }
    list.push({ key: 'autowalk', ticks, script: out });
  }
  list.push({
    key: 'land-run-jump',
    ticks: at(2600),
    start: SHORE_ROAD,
    facing: -Math.PI / 2,
    script: entries([
      { ms: 0, mi: { forward: true } },
      { ms: 600, mi: { jump: true } },
      { ms: 700, mi: { jump: false } },
      { ms: 1400, mi: { strafeLeft: true } },
      { ms: 1700, mi: { strafeLeft: false, jump: true } },
      { ms: 1750, mi: { jump: false } },
      { ms: 2000, mi: { forward: false } },
    ]),
  });
  list.push({
    key: 'land-backpedal-turn',
    ticks: at(2000),
    start: SHORE_ROAD,
    facing: -Math.PI / 2,
    script: entries([
      { ms: 0, mi: { back: true } },
      { ms: 500, mi: { turnRight: true } },
      { ms: 900, mi: { turnRight: false } },
      { ms: 1500, mi: { back: false } },
    ]),
  });
  return list;
}

interface VectorTick {
  mi: MoveInput;
  facing: number | null;
  x: number;
  y: number;
  z: number;
  f: number;
  ground: number;
  /** -Infinity (serialized null) where no waterline exists. */
  water: number;
}

function heldPerTick(
  script: MoveScript,
  ticks: number,
): Array<{ mi: MoveInput; facing: number | null }> {
  const held = emptyMoveInput();
  const out: Array<{ mi: MoveInput; facing: number | null }> = [];
  for (let i = 0; i < ticks; i++) {
    let facing: number | null = null;
    for (const e of script) {
      if (e.tick !== i) continue;
      Object.assign(held, e.mi);
      if (e.facing !== undefined) facing = e.facing;
    }
    out.push({ mi: { ...held }, facing });
  }
  return out;
}

function exportScenario(s: VectorScenario) {
  const at0 = s.start ?? COLLIDER_FREE_LANE;
  const facing0 = s.facing ?? 0;
  const poses = runTwinServerTrajectory({
    script: s.script,
    ticks: s.ticks,
    start: at0,
    facing: facing0,
  });
  const held = heldPerTick(s.script, s.ticks);
  const start = {
    x: at0.x,
    z: at0.z,
    // teleportEntity seats the body on the terrain (the lane's bed).
    y: terrainHeight(at0.x, at0.z, WORLD_SEED),
    f: facing0,
    ground: groundHeight(at0.x, at0.z, WORLD_SEED),
    water: waterLevelAt(at0.x, at0.z, WORLD_SEED),
  };
  const ticks: VectorTick[] = poses.map((p, i) => ({
    mi: held[i].mi,
    facing: held[i].facing,
    x: p.x,
    y: p.y,
    z: p.z,
    f: p.facing,
    ground: groundHeight(p.x, p.z, WORLD_SEED),
    water: waterLevelAt(p.x, p.z, WORLD_SEED),
  }));
  return { key: s.key, start, ticks };
}

describe('unreal movement vectors', () => {
  it('exports the baseline scenarios through the twin server', () => {
    const doc = {
      source: 'tests/unreal_movement_vectors.test.ts',
      constants: {
        dt: DT,
        runSpeed: RUN_SPEED,
        turnSpeed: TURN_SPEED,
        backpedalMult: BACKPEDAL_MULT,
        gravity: GRAVITY,
        jumpVelocity: JUMP_VELOCITY,
        airControlAccel: AIR_CONTROL_ACCEL,
      },
      scenarios: scenarios().map(exportScenario),
    };
    for (const s of doc.scenarios) {
      expect(s.ticks.length).toBeGreaterThan(0);
      for (const t of s.ticks) expect(Number.isFinite(t.x + t.y + t.z + t.f)).toBe(true);
    }
    const out = process.env.UNREAL_MOVEMENT_VECTORS_OUT;
    if (out) {
      if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(doc)}\n`);
    }
    // Determinism: a second export of the straight run is identical.
    const again = exportScenario(scenarios()[0]);
    expect(JSON.stringify(again)).toBe(JSON.stringify(doc.scenarios[0]));
  }, 120_000);
});
