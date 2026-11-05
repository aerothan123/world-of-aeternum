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

import { gunzipSync } from 'node:zlib';
import { vi } from 'vitest';
import type { ClientWorld } from '../../src/net/online';
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
  };
  held: string[];
  changed: Record<string, unknown>;
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

const n = (v: unknown, d: number): unknown => (v === undefined ? d : v);

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
        },
        held: [...held.keys()].sort(),
        changed,
      });
    });
  } finally {
    spy.mockRestore();
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
