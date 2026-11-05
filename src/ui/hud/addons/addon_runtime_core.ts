// Pure decisions behind the add-on runtime controller: the error budget and
// auto-disable rule, the heartbeat watchdog, stats smoothing, the boot
// sentinel / safe-mode decision, the persisted per-add-on state, saved-variable
// keys and caps, and validation of the non-UI worker messages. No DOM, no
// storage access (storage is passed in), no clock (time is passed in).

import { ADDON_LIMITS } from './addon_manifest_core';

export const ADDON_BUDGET = {
  /** Errors inside the window that auto-disable an add-on. */
  errorLimit: 25,
  errorWindowMs: 60_000,
  /** Heartbeat: ping cadence and how long a worker may stay silent. */
  pingEveryMs: 1000,
  hangAfterMs: 3000,
  /** Host-side op application budget per add-on per frame. */
  hostMsPerFrame: 2,
  /** Boot sentinel: how long add-ons must run before the launch counts as safe. */
  stableAfterMs: 10_000,
  /** Saved variables are auto-flushed by the worker at most this often. */
  savedFlushMs: 10_000,
  /** Kept error lines per add-on for the Addons window. */
  keptErrors: 8,
  maxPrintChars: 400,
  maxCommBytes: 16 * 1024,
  printsPerSecond: 10,
} as const;

export type AddonStatus =
  | 'disabled'
  | 'loading'
  | 'running'
  | 'error'
  | 'stopped'
  | 'blocked'
  | 'tooNew'
  | 'outdated'
  | 'invalid';

/** Why an add-on was stopped by the runtime (persisted with autoDisabled). */
export type AddonStopReason = 'errors' | 'hang' | 'flood' | 'load';

export class AddonErrorBudget {
  private stamps: number[] = [];
  readonly recent: string[] = [];
  total = 0;

  /** Record one error; returns true when the add-on crossed the limit. */
  record(message: string, now: number): boolean {
    this.total++;
    this.recent.push(message.slice(0, 300));
    if (this.recent.length > ADDON_BUDGET.keptErrors) this.recent.shift();
    this.stamps.push(now);
    const cutoff = now - ADDON_BUDGET.errorWindowMs;
    while (this.stamps.length > 0 && this.stamps[0] < cutoff) this.stamps.shift();
    return this.stamps.length >= ADDON_BUDGET.errorLimit;
  }
}

/** Heartbeat bookkeeping for one worker. */
export class AddonHeartbeat {
  private lastPingAt = -Infinity;
  private lastPongAt: number;
  private outstanding = false;

  constructor(now: number) {
    this.lastPongAt = now;
  }

  /** Whether a ping should be sent now. */
  shouldPing(now: number): boolean {
    if (now - this.lastPingAt < ADDON_BUDGET.pingEveryMs) return false;
    this.lastPingAt = now;
    if (!this.outstanding) this.outstanding = true;
    return true;
  }

  pong(now: number): void {
    this.outstanding = false;
    this.lastPongAt = now;
  }

  /** True once the worker has not answered for longer than the hang limit. */
  hung(now: number): boolean {
    return this.outstanding && now - this.lastPongAt > ADDON_BUDGET.hangAfterMs;
  }
}

/** Per-add-on stats for the Addons window. cpuMs is worker-measured handler +
 *  timer time over the last reported second; msgs counts worker messages. */
export interface AddonStats {
  cpuMsPerSec: number;
  msgsPerSec: number;
  widgets: number;
  savedBytes: number;
  errors: number;
  hostMsPerSec: number;
}

export function emptyStats(): AddonStats {
  return { cpuMsPerSec: 0, msgsPerSec: 0, widgets: 0, savedBytes: 0, errors: 0, hostMsPerSec: 0 };
}

/** Exponential smoothing so the CPU column does not flicker. */
export function smooth(prev: number, next: number): number {
  return Math.round((prev * 0.6 + next * 0.4) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Persisted state (one JSON blob, injected storage)
// ---------------------------------------------------------------------------

export const ADDON_STATE_KEY = 'woc_addons_state_v1';
export const ADDON_SENTINEL_KEY = 'woc_addons_boot_sentinel_v1';
export const ADDON_SAFE_ONCE_KEY = 'woc_addons_safe_once_v1';
export const ADDON_LAYOUT_KEY = 'woc_addon_layout_v1';

export interface AddonPersistedState {
  /** Master toggle ("Load add-ons"). Undefined = the build default. */
  enabled?: boolean;
  loadOutdated?: boolean;
  /** Per add-on: enabled flag and an auto-disable reason. */
  addons: Record<string, { enabled?: boolean; autoDisabled?: AddonStopReason }>;
}

export function parseAddonState(raw: string | null): AddonPersistedState {
  if (!raw) return { addons: {} };
  try {
    const v = JSON.parse(raw) as Partial<AddonPersistedState>;
    if (!v || typeof v !== 'object') return { addons: {} };
    const addons: AddonPersistedState['addons'] = {};
    if (v.addons && typeof v.addons === 'object') {
      for (const [id, s] of Object.entries(v.addons)) {
        if (!s || typeof s !== 'object') continue;
        const rec: { enabled?: boolean; autoDisabled?: AddonStopReason } = {};
        if (typeof s.enabled === 'boolean') rec.enabled = s.enabled;
        if (s.autoDisabled && ['errors', 'hang', 'flood', 'load'].includes(s.autoDisabled)) {
          rec.autoDisabled = s.autoDisabled;
        }
        addons[id] = rec;
      }
    }
    return {
      enabled: typeof v.enabled === 'boolean' ? v.enabled : undefined,
      loadOutdated: v.loadOutdated === true,
      addons,
    };
  } catch {
    return { addons: {} };
  }
}

/** An add-on is enabled unless the player turned it off or the runtime stopped it. */
export function addonEnabled(state: AddonPersistedState, id: string): boolean {
  const s = state.addons[id];
  if (!s) return true;
  if (s.autoDisabled) return false;
  return s.enabled !== false;
}

export type SafeModeReason = 'crash' | 'requested' | 'url' | null;

/** Decide safe mode at boot. A sentinel still set from the previous launch means
 *  the game died while add-ons were starting. */
export function decideSafeMode(input: {
  sentinel: string | null;
  safeOnce: string | null;
  urlFlag: boolean;
  shellFlag: boolean;
}): SafeModeReason {
  if (input.urlFlag || input.shellFlag) return 'url';
  if (input.safeOnce === '1') return 'requested';
  if (input.sentinel === '1') return 'crash';
  return null;
}

// ---------------------------------------------------------------------------
// Saved variables
// ---------------------------------------------------------------------------

export type SavedScope = 'account' | 'character';

/** Storage key for one add-on scope. Character keys include realm + name so two
 *  characters (or the same name on two realms) never share data. */
export function savedVariableKey(
  addonId: string,
  scope: SavedScope,
  character: { realm: string; name: string },
): string {
  if (scope === 'account') return `woc_addon_sv_v1:${addonId}:account`;
  const realm = character.realm || 'offline';
  return `woc_addon_sv_v1:${addonId}:char:${realm}:${character.name}`;
}

/** Validate a saved-variable write from the worker: a JSON object string under
 *  the cap. Returns the string to store or null to reject. */
export function validateSavedWrite(json: unknown): string | null {
  if (typeof json !== 'string' || json.length > ADDON_LIMITS.savedBytesPerScope) return null;
  try {
    const v = JSON.parse(json);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  } catch {
    return null;
  }
  return json;
}

// ---------------------------------------------------------------------------
// Worker message validation (non-UI)
// ---------------------------------------------------------------------------

export type WorkerMessage =
  | { t: 'ui'; ops: unknown[] }
  | { t: 'sv'; scope: SavedScope; json: string }
  | { t: 'slash'; name: string }
  | { t: 'print'; text: string; color: unknown }
  | { t: 'err'; where: string; message: string }
  | { t: 'stats'; cpuMs: number }
  | { t: 'pong' }
  | { t: 'ready' }
  | { t: 'loadError'; message: string }
  | { t: 'comm'; to: string; json: string };

/** Shape-check a raw worker message; anything else is an error for the sender. */
export function parseWorkerMessage(raw: unknown): WorkerMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);
  switch (m.t) {
    case 'ui':
      return Array.isArray(m.ops) ? { t: 'ui', ops: m.ops } : null;
    case 'sv': {
      const json = s(m.json, ADDON_LIMITS.savedBytesPerScope);
      if ((m.scope !== 'account' && m.scope !== 'character') || json === null) return null;
      return { t: 'sv', scope: m.scope, json };
    }
    case 'slash': {
      const name = s(m.name, 24);
      return name ? { t: 'slash', name } : null;
    }
    case 'print': {
      const text = s(m.text, 4000);
      return text !== null
        ? { t: 'print', text: text.slice(0, ADDON_BUDGET.maxPrintChars), color: m.color }
        : null;
    }
    case 'err': {
      const message = s(m.message, 4000);
      const where = s(m.where, 64);
      return message !== null && where !== null ? { t: 'err', where, message } : null;
    }
    case 'stats':
      return typeof m.cpuMs === 'number' && Number.isFinite(m.cpuMs) && m.cpuMs >= 0
        ? { t: 'stats', cpuMs: m.cpuMs }
        : null;
    case 'pong':
      return { t: 'pong' };
    case 'ready':
      return { t: 'ready' };
    case 'loadError': {
      const message = s(m.message, 4000);
      return message !== null ? { t: 'loadError', message: message.slice(0, 300) } : null;
    }
    case 'comm': {
      const to = s(m.to, 48);
      const json = s(m.json, ADDON_BUDGET.maxCommBytes);
      return to && json !== null ? { t: 'comm', to, json } : null;
    }
    default:
      return null;
  }
}

/** Whether `from` may message `to`: one must list the other as a dependency. */
export function commAllowed(
  from: { id: string; dependencies: string[]; optionalDependencies: string[] },
  to: { id: string; dependencies: string[]; optionalDependencies: string[] },
): boolean {
  const lists = (a: typeof from, b: string) =>
    a.dependencies.includes(b) || a.optionalDependencies.includes(b);
  return lists(from, to.id) || lists(to, from.id);
}

/** Slash command parse: `/name rest` -> { name, args } (name lowercased). */
export function parseSlashLine(raw: string): { name: string; args: string } | null {
  const m = /^\/([A-Za-z][A-Za-z0-9]{0,23})(?:\s+([\s\S]*))?$/.exec(raw.trim());
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: (m[2] ?? '').trim() };
}
