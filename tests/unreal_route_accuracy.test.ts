// M3 route accuracy for the Unreal client (docs/unreal/vertical-slice-plan.md): the
// authoritative pose the live local server acknowledged at each ackCt, while the Unreal
// client walked a scripted route, must sit within 0.05 yd of a TS replay of the SAME
// v2 input frames. The replay is a twin GameServer stepped by hand through the real
// v2 path (handleMessage, consumeMovementFramesV2, sim.tick, updateOverrideEpochs,
// broadcastSnapshots), started from the first acknowledged pose of the recording.
// Fixtures (recorded by the Unreal client with -WyndRecord and -WyndTrace, the auth
// frame stripped): tests/fixtures/unreal_golden/ue_route.frames.tsv.gz (received) and
// ue_route.sent.tsv.gz (sent).

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Postgres is mocked before the server/game import (tests/CLAUDE.md, Server tests).
// Superset shape, copied from tests/movement_latency_baseline.test.ts.
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

import { consumeMovementFramesV2 } from '../server/movement_input_timeline_v2';
import { updateOverrideEpochs } from '../server/movement_reconciliation_wire';
import { joinGroundTruthCharacter } from './helpers/movement_ground_truth';
import { parseRecordedFrames } from './helpers/unreal_golden';

const DIR = join(resolve(import.meta.dirname), 'fixtures/unreal_golden');
const TOLERANCE_YD = 0.05;

type Pose = [number, number, number, number];

/** ackCt -> the first acknowledged pose reported for it, skipping override-active frames. */
function ackedPoses(snaps: { self?: Record<string, unknown> }[]): Map<number, Pose> {
  const out = new Map<number, Pose>();
  for (const s of snaps) {
    const self = s.self;
    if (!self || typeof self.ackCt !== 'number' || typeof self.rpx !== 'number') continue;
    if (self.ovA === 1 || out.has(self.ackCt)) continue;
    out.set(self.ackCt, [
      self.rpx as number,
      self.rpy as number,
      self.rpz as number,
      self.rpf as number,
    ]);
  }
  return out;
}

describe('unreal route accuracy (M3)', () => {
  it('the live acked pose matches a TS replay of the same v2 frames within 0.05 yd', async () => {
    const received = parseRecordedFrames(readFileSync(join(DIR, 'ue_route.frames.tsv.gz')))
      .map((f) => JSON.parse(f.text))
      .filter((m) => m.t === 'snap');
    const sent = parseRecordedFrames(readFileSync(join(DIR, 'ue_route.sent.tsv.gz'))).map((f) =>
      JSON.parse(f.text),
    );
    const live = ackedPoses(received);
    const inputs = sent.filter((m) => m.t === 'input');
    expect(inputs.length).toBeGreaterThan(200);

    // Start from the first acknowledged pose, with every frame after it replayed in order.
    const ct0 = Math.min(...live.keys());
    const start = live.get(ct0) as Pose;
    const { server, session, client, pid } = joinGroundTruthCharacter(1, 'warrior', 2);
    const sim = server.sim;
    const e = sim.entities.get(pid);
    if (!e) throw new Error('joined character missing');
    e.pos = { x: start[0], y: start[1], z: start[2] };
    e.prevPos = { ...e.pos };
    e.facing = start[3];
    e.fallStartY = e.pos.y;
    e.onGround = true;
    e.vx = 0;
    e.vz = 0;
    e.vy = 0;

    // biome-ignore lint/suspicious/noExplicitAny: the server-loop internals a manual step drives
    const internals = server as any;
    const step = (): void => {
      internals.clearStaleInputs();
      consumeMovementFramesV2(sim, internals.clients.values());
      const events = sim.tick();
      updateOverrideEpochs(sim, internals.clients.values());
      internals.routeEvents(events);
      internals.broadcastSnapshots();
    };
    const replaySnaps: { self?: Record<string, unknown> }[] = [];
    const collect = (): void => {
      for (const raw of client.sent.splice(0)) {
        if (raw.startsWith('{"t":"snap"')) replaySnaps.push(JSON.parse(raw));
      }
    };
    let delivered = 0;
    for (const frame of sent) {
      if (frame.t === 'input' && frame.ct <= ct0) continue;
      await server.handleMessage(session, JSON.stringify(frame));
      if (frame.t !== 'input') continue;
      delivered++;
      step();
      collect();
    }
    for (let i = 0; i < 8; i++) {
      step();
      collect();
    }
    const replay = ackedPoses(replaySnaps);

    let compared = 0;
    let worst = 0;
    let worstCt = -1;
    let travel = 0;
    let prev: Pose | null = null;
    for (const [ct, p] of live) {
      if (ct <= ct0) continue;
      const q = replay.get(ct);
      if (!q) continue;
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (prev) travel += Math.hypot(p[0] - prev[0], p[2] - prev[2]);
      prev = p;
      compared++;
      if (d > worst) {
        worst = d;
        worstCt = ct;
      }
    }
    console.log(
      `route: ${delivered} frames replayed, ${compared} ackCt poses compared over ${travel.toFixed(1)} yd of travel, worst ${worst.toFixed(4)} yd at ct ${worstCt}`,
    );
    expect(compared).toBeGreaterThan(200);
    // A replay that never moved cannot pass: the compared poses must cover a real walk.
    expect(travel).toBeGreaterThan(20);
    expect(worst).toBeLessThanOrEqual(TOLERANCE_YD);
  });
});
