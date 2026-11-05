// Freshness and fidelity pin for the native-client protocol export
// (scripts/unreal/protocol_export.ts). The committed JSON and C++ header must
// equal a fresh build from the sources, and the parsed values must agree with
// the live exports and the real auth-frame builder, so the Unreal client can
// never drift from the TypeScript wire.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildProtocolExport,
  PROTOCOL_EXPORT_DIR,
  PROTOCOL_HEADER_FILE,
  PROTOCOL_JSON_FILE,
  readProtocol,
} from '../scripts/unreal/protocol_export';
import { MOVEMENT_FRAME_V2_PENDING_CAP } from '../src/net/movement_frame_v2_wire';
import {
  MAX_CONFLICT_REJECTIONS,
  MAX_TIMEOUT_REJECTIONS,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_CONFLICT_ERROR,
  RECONNECT_MAX_ATTEMPTS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_TIMEOUT_ERROR,
} from '../src/net/reconnect_policy';
import { buildWebSocketAuthMessage } from '../src/net/world_auth_message';
import {
  COMMAND_NAMES,
  DISPATCH_ONLY_COMMANDS,
  ONLINE_WORLD_AUTH_TYPE,
  ONLINE_WORLD_INCOMPATIBLE_MESSAGE,
} from '../src/world_api';

const ROOT = resolve(import.meta.dirname, '..');

describe('unreal protocol export', () => {
  it('committed export is fresh (run npm run unreal:protocol)', () => {
    const fresh = buildProtocolExport(ROOT);
    const dir = join(ROOT, PROTOCOL_EXPORT_DIR);
    // The JSON is compared structurally: the committed copy is biome-formatted.
    expect(JSON.parse(readFileSync(join(dir, PROTOCOL_JSON_FILE), 'utf8'))).toEqual(
      JSON.parse(fresh.json),
    );
    expect(readFileSync(join(dir, PROTOCOL_HEADER_FILE), 'utf8')).toBe(fresh.header);
  });

  it('parsed values agree with the live TypeScript exports', () => {
    const p = readProtocol(ROOT);
    expect(p.authType).toBe(ONLINE_WORLD_AUTH_TYPE);
    expect(p.incompatibleMessage).toBe(ONLINE_WORLD_INCOMPATIBLE_MESSAGE);
    expect(p.commandNames).toEqual([...COMMAND_NAMES]);
    expect(p.dispatchOnlyCommands).toEqual([...DISPATCH_ONLY_COMMANDS]);
    expect(p.reconnect).toEqual({
      baseDelayMs: RECONNECT_BASE_DELAY_MS,
      maxDelayMs: RECONNECT_MAX_DELAY_MS,
      maxAttempts: RECONNECT_MAX_ATTEMPTS,
      conflictError: RECONNECT_CONFLICT_ERROR,
      maxConflictRejections: MAX_CONFLICT_REJECTIONS,
      timeoutError: RECONNECT_TIMEOUT_ERROR,
      maxTimeoutRejections: MAX_TIMEOUT_REJECTIONS,
    });
    expect(p.movementFramePendingCap).toBe(MOVEMENT_FRAME_V2_PENDING_CAP);
  });

  it('every capability the export names is one the real auth frame sends', () => {
    const p = readProtocol(ROOT);
    const auth = buildWebSocketAuthMessage('t', 1);
    expect(auth.t).toBe(p.authType);
    expect(auth.timerWire).toBe(p.capabilities.timerWire);
    expect(auth.petSpecialWire).toBe(p.capabilities.petSpecialWire);
    expect(auth.dungeonEntryFacingWire).toBe(p.capabilities.dungeonEntryFacingWire);
    expect(auth.movementWire).toBe(p.capabilities.movementWire);
    // The C++ builder emits exactly these keys in this order (WyndWire::BuildAuthMessage).
    expect(Object.keys(auth)).toEqual([
      't',
      'token',
      'character',
      'clientSeed',
      'dungeonEntryFacingWire',
      'timerWire',
      'petSpecialWire',
      'movementWire',
    ]);
  });

  it('delta keys are unique and every dispatch-only command is a command', () => {
    const p = readProtocol(ROOT);
    expect(new Set(p.allDeltaKeys).size).toBe(p.allDeltaKeys.length);
    for (const c of p.dispatchOnlyCommands) expect(p.commandNames).toContain(c);
    for (const k of p.capabilityDeltaKeys) expect(p.allDeltaKeys).toContain(k);
  });
});
