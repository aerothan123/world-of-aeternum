// The protocol export for the native (Unreal) client: every wire constant a
// non-JS client must agree with, read straight from the TypeScript sources so
// the C++ side is generated, never hand-copied (docs/unreal/wire-protocol.md,
// section 10). `buildProtocolExport` is pure (it only reads source files);
// scripts/unreal/export_protocol.ts writes its output and
// tests/unreal_protocol_export.test.ts fails when the committed copy is stale.
//
// Values are read with the TypeScript parser rather than imported, because
// several of them are module-private (the WS auth rejection table, the despawn
// grace, the delta-key pin that lives in a test file) and importing server
// modules would pull in the database layer. The evaluator accepts only literal
// initializers (strings, numbers, arrays, objects, simple arithmetic) and
// throws on anything else, so a refactor that hides a constant behind a call
// fails the export loudly instead of exporting a guess.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import ts from 'typescript';

export type ConstValue = string | number | boolean | ConstValue[] | { [key: string]: ConstValue };

type Resolve = (name: string) => ConstValue;

function evaluate(node: ts.Expression, where: string, resolve: Resolve): ConstValue {
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  ) {
    return evaluate(node.expression, where, resolve);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text.replace(/_/g, ''));
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const v = evaluate(node.operand, where, resolve);
    if (typeof v !== 'number') throw new Error(`${where}: unary minus on a non-number`);
    return -v;
  }
  if (ts.isBinaryExpression(node)) {
    const l = evaluate(node.left, where, resolve);
    const r = evaluate(node.right, where, resolve);
    if (typeof l !== 'number' || typeof r !== 'number') {
      throw new Error(`${where}: arithmetic on a non-number`);
    }
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.AsteriskToken:
        return l * r;
      case ts.SyntaxKind.PlusToken:
        return l + r;
      case ts.SyntaxKind.MinusToken:
        return l - r;
      default:
        throw new Error(`${where}: unsupported operator`);
    }
  }
  if (ts.isArrayLiteralExpression(node))
    return node.elements.map((e) => evaluate(e, where, resolve));
  if (ts.isObjectLiteralExpression(node)) {
    const out: { [key: string]: ConstValue } = {};
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
        throw new Error(`${where}: unsupported object member`);
      }
      out[p.name.text] = evaluate(p.initializer, where, resolve);
    }
    return out;
  }
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'Set'
  ) {
    const arg = node.arguments?.[0];
    if (!arg) return [];
    return evaluate(arg, where, resolve);
  }
  if (ts.isIdentifier(node)) return resolve(node.text);
  throw new Error(`${where}: initializer is not a literal (${ts.SyntaxKind[node.kind]})`);
}

/** Reads one top-level `const NAME = <literal>` from a source file. An
 *  identifier inside the literal resolves to another top-level const of the
 *  same file, or to a named import from a relative module (followed the same
 *  way), so `{ incompatible: ONLINE_WORLD_INCOMPATIBLE_MESSAGE }` exports the
 *  real string. */
export function readConst(root: string, file: string, name: string, depth = 0): ConstValue {
  if (depth > 8) throw new Error(`${file}:${name}: import chain too deep`);
  const text = readFileSync(join(root, file), 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = new Map<string, { from: string; name: string }>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    const bindings = stmt.importClause?.namedBindings;
    if (!spec.startsWith('.') || !bindings || !ts.isNamedImports(bindings)) continue;
    const from = normalize(join(dirname(file), spec)).replace(/\\/g, '/');
    for (const el of bindings.elements) {
      imports.set(el.name.text, { from: `${from}.ts`, name: (el.propertyName ?? el.name).text });
    }
  }
  const resolve: Resolve = (id) => {
    const imp = imports.get(id);
    if (imp) return readConst(root, imp.from, imp.name, depth + 1);
    return readConst(root, file, id, depth + 1);
  };
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
        return evaluate(decl.initializer, `${file}:${name}`, resolve);
      }
    }
  }
  throw new Error(`${file}: no top-level const ${name}`);
}

function str(v: ConstValue, what: string): string {
  if (typeof v !== 'string') throw new Error(`${what} is not a string`);
  return v;
}
function num(v: ConstValue, what: string): number {
  if (typeof v !== 'number') throw new Error(`${what} is not a number`);
  return v;
}
function strList(v: ConstValue, what: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new Error(`${what} is not a string list`);
  }
  return v as string[];
}
function strMap(v: ConstValue, what: string): Record<string, string> {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new Error(`${what} is not a map`);
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) out[k] = str(x, `${what}.${k}`);
  return out;
}

export interface ProtocolExport {
  layoutVersion: number;
  authType: string;
  capabilities: {
    timerWire: number;
    petSpecialWire: number;
    dungeonEntryFacingWire: number;
    movementWire: number;
  };
  incompatibleMessage: string;
  wsUpgradePath: string;
  wsMaxPayloadBytes: number;
  authTimeoutMs: number;
  keepalivePingMs: number;
  linkdeadGraceMs: number;
  tickRate: number;
  desktopAppOrigins: string[];
  authErrors: Record<string, string>;
  reconnect: {
    baseDelayMs: number;
    maxDelayMs: number;
    maxAttempts: number;
    conflictError: string;
    maxConflictRejections: number;
    timeoutError: string;
    maxTimeoutRejections: number;
  };
  movementFramePendingCap: number;
  despawnGraceMs: number;
  despawnGraceMinDistSq: number;
  commandNames: string[];
  dispatchOnlyCommands: string[];
  allDeltaKeys: string[];
  capabilityDeltaKeys: string[];
  persistentEngineAuraIds: string[];
}

export function readProtocol(root: string): ProtocolExport {
  const wa = 'src/world_api.ts';
  const layoutVersion = num(readConst(root, wa, 'ONLINE_WORLD_LAYOUT_VERSION'), 'layout');
  const rp = 'src/net/reconnect_policy.ts';
  const out: ProtocolExport = {
    layoutVersion,
    authType: `auth-world-${layoutVersion}`,
    capabilities: {
      timerWire: num(readConst(root, wa, 'STABLE_TIMER_WIRE_VERSION'), 'timerWire'),
      petSpecialWire: num(readConst(root, wa, 'PET_SPECIAL_WIRE_VERSION'), 'petSpecialWire'),
      dungeonEntryFacingWire: num(
        readConst(root, wa, 'DUNGEON_ENTRY_FACING_WIRE_VERSION'),
        'dungeonEntryFacingWire',
      ),
      // buildWebSocketAuthMessage mints the literal 2; negotiateMovementWireVersion
      // accepts exactly 2. Pinned by the export test against the builder.
      movementWire: 2,
    },
    incompatibleMessage: str(readConst(root, wa, 'ONLINE_WORLD_INCOMPATIBLE_MESSAGE'), 'incompat'),
    wsUpgradePath: str(readConst(root, 'server/ws_auth.ts', 'WS_UPGRADE_PATH'), 'ws path'),
    wsMaxPayloadBytes: num(readConst(root, 'server/main.ts', 'WS_MAX_PAYLOAD_BYTES'), 'payload'),
    authTimeoutMs: num(readConst(root, 'server/ws_auth.ts', 'AUTH_TIMEOUT_MS'), 'auth timeout'),
    keepalivePingMs: num(
      readConst(root, 'server/keepalive_sweep.ts', 'WS_KEEPALIVE_PING_MS'),
      'keepalive',
    ),
    linkdeadGraceMs: num(readConst(root, 'server/linkdead.ts', 'LINKDEAD_GRACE_MS'), 'linkdead'),
    tickRate: num(readConst(root, 'src/sim/types.ts', 'TICK_RATE'), 'tick rate'),
    desktopAppOrigins: strList(
      readConst(root, 'server/web_login_guard.ts', 'DESKTOP_APP_ORIGINS'),
      'origins',
    ),
    authErrors: strMap(readConst(root, 'server/ws_auth.ts', 'WS_AUTH_ERROR'), 'WS_AUTH_ERROR'),
    reconnect: {
      baseDelayMs: num(readConst(root, rp, 'RECONNECT_BASE_DELAY_MS'), 'base'),
      maxDelayMs: num(readConst(root, rp, 'RECONNECT_MAX_DELAY_MS'), 'max'),
      maxAttempts: num(readConst(root, rp, 'RECONNECT_MAX_ATTEMPTS'), 'attempts'),
      conflictError: str(readConst(root, rp, 'RECONNECT_CONFLICT_ERROR'), 'conflict'),
      maxConflictRejections: num(readConst(root, rp, 'MAX_CONFLICT_REJECTIONS'), 'maxConflict'),
      timeoutError: str(readConst(root, rp, 'RECONNECT_TIMEOUT_ERROR'), 'timeout'),
      maxTimeoutRejections: num(readConst(root, rp, 'MAX_TIMEOUT_REJECTIONS'), 'maxTimeout'),
    },
    movementFramePendingCap: num(
      readConst(root, 'src/net/movement_frame_v2_wire.ts', 'MOVEMENT_FRAME_V2_PENDING_CAP'),
      'pending cap',
    ),
    despawnGraceMs: num(readConst(root, 'src/net/online.ts', 'DESPAWN_GRACE_MS'), 'grace'),
    despawnGraceMinDistSq: num(
      readConst(root, 'src/net/online.ts', 'DESPAWN_GRACE_MIN_DIST_SQ'),
      'grace dist',
    ),
    commandNames: strList(readConst(root, wa, 'COMMAND_NAMES'), 'COMMAND_NAMES'),
    dispatchOnlyCommands: strList(readConst(root, wa, 'DISPATCH_ONLY_COMMANDS'), 'DISPATCH_ONLY'),
    allDeltaKeys: strList(readConst(root, 'tests/snapshots.test.ts', 'ALL_DELTA_KEYS'), 'delta'),
    capabilityDeltaKeys: strList(
      readConst(root, 'tests/snapshots.test.ts', 'CAPABILITY_DELTA_KEYS'),
      'capability delta',
    ),
    persistentEngineAuraIds: strList(
      readConst(root, 'src/sim/persistent_aura.ts', 'PERSISTENT_ENGINE_AURA_IDS'),
      'persistent auras',
    ),
  };
  return out;
}

function cppString(s: string): string {
  if (!/^[\x20-\x7e]*$/.test(s)) throw new Error(`non-ASCII or control text in export: ${s}`);
  return `TEXT("${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
}

function cppIdent(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function cppList(name: string, items: readonly string[]): string {
  const body = items.map((s) => `\t${cppString(s)},`).join('\n');
  return `inline constexpr const TCHAR* ${name}[] = {\n${body}\n};\ninline constexpr int32 Num${name} = ${items.length};\n`;
}

export function renderHeader(p: ProtocolExport, hash: string): string {
  const errs = Object.entries(p.authErrors)
    .map(([k, v]) => `\tinline constexpr const TCHAR* ${cppIdent(k)} = ${cppString(v)};`)
    .join('\n');
  return `// GENERATED by scripts/unreal/export_protocol.ts in the TypeScript repo from its
// sources (see scripts/unreal/protocol_export.ts). Do not edit by hand: rerun
// \`npm run unreal:protocol\` and copy this file into
// Source/WyndlewoodCore/Public/Generated/ of the Unreal project.
#pragma once

#include "CoreMinimal.h"

namespace WyndProtocol
{
inline constexpr const TCHAR* ExportHash = ${cppString(hash)};
inline constexpr int32 OnlineWorldLayoutVersion = ${p.layoutVersion};
inline constexpr const TCHAR* AuthType = ${cppString(p.authType)};
inline constexpr int32 StableTimerWireVersion = ${p.capabilities.timerWire};
inline constexpr int32 PetSpecialWireVersion = ${p.capabilities.petSpecialWire};
inline constexpr int32 DungeonEntryFacingWireVersion = ${p.capabilities.dungeonEntryFacingWire};
inline constexpr int32 MovementWireVersion = ${p.capabilities.movementWire};
inline constexpr const TCHAR* IncompatibleMessage = ${cppString(p.incompatibleMessage)};
inline constexpr const TCHAR* WsUpgradePath = ${cppString(p.wsUpgradePath)};
inline constexpr int32 WsMaxPayloadBytes = ${p.wsMaxPayloadBytes};
inline constexpr int32 AuthTimeoutMs = ${p.authTimeoutMs};
inline constexpr int32 KeepalivePingMs = ${p.keepalivePingMs};
inline constexpr int32 LinkdeadGraceMs = ${p.linkdeadGraceMs};
inline constexpr int32 TickRate = ${p.tickRate};
inline constexpr int32 ReconnectBaseDelayMs = ${p.reconnect.baseDelayMs};
inline constexpr int32 ReconnectMaxDelayMs = ${p.reconnect.maxDelayMs};
inline constexpr int32 ReconnectMaxAttempts = ${p.reconnect.maxAttempts};
inline constexpr const TCHAR* ReconnectConflictError = ${cppString(p.reconnect.conflictError)};
inline constexpr int32 MaxConflictRejections = ${p.reconnect.maxConflictRejections};
inline constexpr const TCHAR* ReconnectTimeoutError = ${cppString(p.reconnect.timeoutError)};
inline constexpr int32 MaxTimeoutRejections = ${p.reconnect.maxTimeoutRejections};
inline constexpr int32 MovementFramePendingCap = ${p.movementFramePendingCap};
inline constexpr double DespawnGraceMs = ${p.despawnGraceMs};
inline constexpr double DespawnGraceMinDistSq = ${p.despawnGraceMinDistSq};

namespace AuthError
{
${errs}
}

${cppList('DesktopAppOrigins', p.desktopAppOrigins)}
${cppList('CommandNames', p.commandNames)}
${cppList('DispatchOnlyCommands', p.dispatchOnlyCommands)}
${cppList('AllDeltaKeys', p.allDeltaKeys)}
${cppList('CapabilityDeltaKeys', p.capabilityDeltaKeys)}
${cppList('PersistentEngineAuraIds', p.persistentEngineAuraIds)}
} // namespace WyndProtocol
`;
}

export interface ProtocolExportFiles {
  json: string;
  header: string;
}

export function buildProtocolExport(root: string): ProtocolExportFiles {
  const p = readProtocol(root);
  const json = `${JSON.stringify(p, null, 2)}\n`;
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 16);
  return { json, header: renderHeader(p, hash) };
}

export const PROTOCOL_EXPORT_DIR = 'scripts/unreal/protocol';
export const PROTOCOL_JSON_FILE = 'wyndlewood_protocol.json';
export const PROTOCOL_HEADER_FILE = 'WyndProtocol.generated.h';
