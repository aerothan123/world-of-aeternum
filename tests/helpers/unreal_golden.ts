// Golden-frame digest for the Unreal client decoder (docs/unreal/wire-protocol.md
// section 10, "the C++ twin of the W0a round trip"). Real frames recorded from a
// local server session (scripts/unreal/golden_session.mjs) are replayed through
// the TypeScript ClientWorld.applySnapshot, and after every snapshot the
// mirrored state the native client must reproduce is reduced to one canonical
// row. The C++ automation test Wyndlewood.Net.GoldenFrames replays the SAME
// frames through FWyndWorldMirror and compares against these rows field by
// field (numbers exactly), so this file defines the shared contract:
//
//   ents  [id, kind, tid, name, level, x, y, z, f, hp, mhp, flags, cast,
//          castRem, castTot, tgt, rtype, res, mres] sorted by id, self included
//          (flags: dead 1, ghost 2, lootable 4, hostile 8, sitting 16; tgt is
//          null for the self row, whose target goes through the echo guard)
//   self  { pid, ack, recon: [rpx, rpy, rpz, rpf, ackCt, ovE, ovA, msm] | null,
//           copper, xp }
//   held  the self delta keys whose last value is retained (keep-prior rule)
//   changed  { key: value } for each delta key this snapshot's self carried
//   self.lxp, self.rxp, self.inv [[itemId, count]], self.qlog [[questId, state, counts]]
//            (sorted), self.qdone (sorted), self.cds [[ability, remaining]] (sorted),
//            self.timer [mode, time] (the prepareSnapshotTimers result for this frame)
//   auras    [[entityId, [[id, name, kind, remaining, duration, perm, value, stacks,
//            charges, src, school]]]] for every entity wearing any, by id
//   events   the SimEvents ClientWorld queued since the previous snapshot (drainEvents)
//   Timer values encode +inf (permanent) as -1 and NaN or absent as null.
//   Sorts are plain code-unit order (Array.prototype.sort), never locale order.

import { gunzipSync } from 'node:zlib';
import { vi } from 'vitest';
import type { ClientWorld } from '../../src/net/online';
import { snapshotTimerWireMode } from '../../src/net/snapshot_timer_wire';
import { bareClient } from './bare_client';

export interface RecordedFrame {
  ms: number;
  text: string;
}

export interface GoldenRow {
  i: number;
  tick: number;
  ents: unknown[][];
  self: {
    pid: number;
    ack: number;
    recon: number[] | null;
    copper: number;
    xp: number;
    lxp: number;
    rxp: number;
    timer: [string, number | null];
    inv: unknown[];
    qlog: unknown[];
    qdone: string[];
    cds: unknown[];
  };
  held: string[];
  changed: Record<string, unknown>;
  auras: unknown[];
  events: unknown[];
}

/** Parses the recorder's `<arrival ms>\t<raw frame>` lines (optionally gzipped). */
export function parseRecordedFrames(buf: Buffer): RecordedFrame[] {
  const text = (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString('utf8');
  const out: RecordedFrame[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    out.push({ ms: Number(line.slice(0, tab)), text: line.slice(tab + 1) });
  }
  return out;
}

const n = (v: unknown, d: number | null): unknown => (v === undefined ? d : v);

/** A timer value as the digest encodes it: -1 for an infinite (permanent) one, null for NaN or absent. */
function enc(v: unknown): number | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  return Number.isFinite(v) ? v : -1;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function goldenDigest(frames: RecordedFrame[], deltaKeys: readonly string[]): GoldenRow[] {
  const hello = frames.map((f) => JSON.parse(f.text)).find((m) => m.t === 'hello');
  if (!hello) throw new Error('recording has no hello frame');
  const pid = hello.pid as number;
  // biome-ignore lint/suspicious/noExplicitAny: applySnapshot is private; the bareClient idiom
  const client: any = bareClient(pid, { movementWireVersion: hello.movementWire === 2 ? 2 : 1 });
  let clock = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const held = new Map<string, unknown>();
  const rows: GoldenRow[] = [];
  try {
    frames.forEach((frame, i) => {
      const msg = JSON.parse(frame.text);
      if (msg.t === 'events') {
        clock = frame.ms;
        client.onMessage(frame.text);
        return;
      }
      if (msg.t !== 'snap') return;
      clock = frame.ms;
      client.applySnapshot(msg);
      const changed: Record<string, unknown> = {};
      const s = msg.self ?? {};
      for (const k of deltaKeys) {
        if (s[k] !== undefined) {
          held.set(k, s[k]);
          changed[k] = s[k];
        }
      }
      rows.push({
        i,
        tick: msg.tick,
        ents: entityRows(client as ClientWorld, pid),
        self: {
          pid,
          ack: client.ackedInputSeq,
          recon:
            client.reconAuthoritativeX === null
              ? null
              : [
                  client.reconAuthoritativeX,
                  client.reconAuthoritativeY,
                  client.reconAuthoritativeZ,
                  client.reconAuthoritativeFacing,
                  client.reconAckClientTick,
                  client.reconOverrideEpoch,
                  client.reconOverrideActive ? 1 : 0,
                  client.reconMoveSpeedMult,
                ],
          copper: client.copper,
          xp: client.xp,
          lxp: client.lifetimeXp,
          rxp: client.restedXp,
          timer: timerOf(msg),
          inv: (client.inventory as { itemId?: string; count?: number }[]).map((slot) => [
            slot.itemId ?? null,
            slot.count ?? null,
          ]),
          qlog: [
            ...(
              client.questLog as Map<string, { questId: string; state: string; counts: number[] }>
            ).values(),
          ]
            .sort((a, b) => byCodeUnit(a.questId, b.questId))
            .map((q) => [q.questId, q.state, [...q.counts]]),
          qdone: [...(client.questsDone as Set<string>)].sort(byCodeUnit),
          cds: [
            ...(
              (client.entities.get(pid)?.cooldowns ?? new Map()) as Map<string, number>
            ).entries(),
          ]
            .sort((a, b) => byCodeUnit(a[0], b[0]))
            .map(([k, v]) => [k, enc(v)]),
        },
        held: [...held.keys()].sort(byCodeUnit),
        changed,
        auras: auraRows(client as ClientWorld),
        events: JSON.parse(JSON.stringify(client.drainEvents())),
      });
    });
  } finally {
    spy.mockRestore();
  }
  return rows;
}

/** prepareSnapshotTimers' answer for one frame: the mode and the stable clock, if any. */
function timerOf(snap: { tw?: unknown; time?: unknown }): [string, number | null] {
  const mode = snapshotTimerWireMode(snap.tw);
  const t = snap.time;
  const time =
    mode === 'stable' && typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : null;
  return [mode, time];
}

function auraRows(client: ClientWorld): unknown[] {
  const rows: unknown[] = [];
  const ids = [...client.entities.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const e = client.entities.get(id);
    if (!e || !e.auras || e.auras.length === 0) continue;
    rows.push([
      id,
      e.auras.map((a) => [
        a.id ?? null,
        a.name ?? null,
        a.kind ?? null,
        enc(a.remaining),
        enc(a.duration),
        a.permanent ? 1 : 0,
        a.value ?? null,
        a.stacks ?? null,
        a.charges ?? null,
        a.sourceId ?? null,
        a.school ?? null,
      ]),
    ]);
  }
  return rows;
}

function entityRows(client: ClientWorld, pid: number): unknown[][] {
  const rows: unknown[][] = [];
  for (const e of client.entities.values()) {
    const flags =
      (e.dead ? 1 : 0) |
      (e.ghost ? 2 : 0) |
      (e.lootable ? 4 : 0) |
      (e.hostile ? 8 : 0) |
      (e.sitting ? 16 : 0);
    rows.push([
      e.id,
      e.kind ?? null,
      e.templateId === undefined || e.templateId === null ? null : String(e.templateId),
      e.name ?? null,
      n(e.level, null),
      e.pos.x,
      e.pos.y,
      e.pos.z,
      e.facing,
      n(e.hp, null),
      n(e.maxHp, null),
      flags,
      e.castingAbility ?? null,
      e.castRemaining ?? 0,
      e.castTotal ?? 0,
      e.id === pid ? null : (e.targetId ?? null),
      e.resourceType ?? null,
      n(e.resource, null),
      n(e.maxResource, null),
    ]);
  }
  rows.sort((a, b) => (a[0] as number) - (b[0] as number));
  return rows;
}
