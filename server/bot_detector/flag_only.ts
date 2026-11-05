// The open-build bot detector: it only FLAGS. Every `handleTick` answers 'none'
// whatever the evidence and whatever `enforce` says, so this detector can never
// kick, mute or ban anyone; a flag lands in the admin Flagged queue
// (server/suspicion_flags.ts via the BotDetectorHost) and a human decides.
//
// It is the fallback behind the `#bot-detector` alias when the private clone is
// absent (vite.config.ts, scripts/build_server.mjs, tsconfig.json); the private
// detector, when present, replaces it. The no-op stub (stub.ts) stays as the
// reference for a detector that does nothing at all.
//
// Three deliberately coarse, hard-to-hit-by-accident signals, all computed from
// the traffic SHAPE alone (no payload contents are stored, no IP is read):
//   command_flood    sustained command rate far above a human's
//   protocol_noise   repeated malformed or unknown frames (a hand-rolled client)
//   no_breaks        hours of play with no pause of a couple of minutes
// Each signal carries a weight; the account is flagged only when the weights
// add up to the threshold, so one noisy signal alone does not flag by default.
// All state is per live session, in memory, and dropped on release.

import type {
  BotDetector,
  BotDetectorHost,
  BotTrackingContext,
  ConfigApplyResult,
  ConfigField,
  PlayerSessionRef,
  ProtocolAnomaly,
  SuspiciousEvidence,
  SuspiciousPlayer,
} from './contract';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** A pause this long in commands ends a "run" for the no_breaks signal. */
const BREAK_GAP_MS = 2 * MINUTE_MS;
/** How long a signal stays on the evidence list after it last held. */
/** Longer than the host's refresh floor (suspicion_flags.ts), so a re-offer is admitted. */
const REFRESH_CONFIRM_MS = 15_000;
const EVIDENCE_TTL_MS = 30 * MINUTE_MS;

export const FLAG_ONLY_DEFAULTS = Object.freeze({
  enabled: true,
  floodCommandsPerMinute: 300,
  floodMinutes: 5,
  anomalyCount: 5,
  noBreakHours: 6,
  floodWeight: 60,
  anomalyWeight: 50,
  noBreakWeight: 50,
  flagThreshold: 100,
});
type Settings = {
  -readonly [K in keyof typeof FLAG_ONLY_DEFAULTS]: (typeof FLAG_ONLY_DEFAULTS)[K];
};

interface SessionState {
  ref: PlayerSessionRef;
  minute: number;
  minuteCommands: number;
  hotMinutes: number;
  anomalies: number;
  runStartAt: number;
  lastCommandAt: number;
  evidence: Map<string, SuspiciousEvidence>;
  /** The details text last accepted by the host, null before the first flag. */
  recordedDetails: string | null;
  /** A host write is awaiting its answer; one write at a time per session. */
  inFlight: boolean;
  /** A refresh text offered but not yet confirmed, and when it was first offered. */
  offered: string | null;
  offeredAt: number;
}

const CONFIG_META: ReadonlyArray<{
  id: keyof Settings;
  label: string;
  min?: number;
  max?: number;
  unit?: string;
  help: string;
}> = [
  {
    id: 'enabled',
    label: 'Flag suspicious sessions',
    help: 'Off stops new flags; nothing else ever happens automatically.',
  },
  {
    id: 'floodCommandsPerMinute',
    label: 'Command flood rate',
    min: 60,
    max: 6000,
    unit: '/min',
    help: 'Commands per minute that count as a hot minute.',
  },
  {
    id: 'floodMinutes',
    label: 'Command flood minutes',
    min: 1,
    max: 120,
    unit: 'min',
    help: 'Consecutive hot minutes before the signal holds.',
  },
  {
    id: 'anomalyCount',
    label: 'Malformed frames',
    min: 1,
    max: 1000,
    help: 'Malformed or unknown frames in one session before the signal holds.',
  },
  {
    id: 'noBreakHours',
    label: 'Hours without a break',
    min: 1,
    max: 72,
    unit: 'h',
    help: 'Hours of play with no 2 minute pause in commands.',
  },
  {
    id: 'floodWeight',
    label: 'Command flood weight',
    min: 0,
    max: 1000,
    help: 'Score added while the command flood signal holds.',
  },
  {
    id: 'anomalyWeight',
    label: 'Malformed frames weight',
    min: 0,
    max: 1000,
    help: 'Score added while the malformed frames signal holds.',
  },
  {
    id: 'noBreakWeight',
    label: 'No breaks weight',
    min: 0,
    max: 1000,
    help: 'Score added while the no breaks signal holds.',
  },
  {
    id: 'flagThreshold',
    label: 'Flag threshold',
    min: 1,
    max: 3000,
    help: 'Total score at which the account is flagged for a human to review.',
  },
];

export function createBotDetector(): BotDetector {
  const settings: Settings = { ...FLAG_ONLY_DEFAULTS };
  const sessions = new Map<BotTrackingContext, SessionState>();
  let host: BotDetectorHost | null = null;

  const state = (ctx: BotTrackingContext): SessionState | undefined => sessions.get(ctx);

  function setEvidence(
    s: SessionState,
    kind: string,
    weight: number,
    detail: string,
    now: number,
  ): void {
    const prev = s.evidence.get(kind);
    s.evidence.set(kind, {
      kind,
      weight,
      detail,
      expiresAt: now + EVIDENCE_TTL_MS,
      ...(prev?.firstAt ? { firstAt: prev.firstAt } : { firstAt: now }),
      lastAt: now,
    });
  }

  function rollMinute(s: SessionState, now: number): void {
    const minute = Math.floor(now / MINUTE_MS);
    if (minute === s.minute) return;
    const consecutive = minute === s.minute + 1;
    if (s.minute >= 0 && consecutive && s.minuteCommands > settings.floodCommandsPerMinute) {
      s.hotMinutes += 1;
    } else if (
      s.minute >= 0 &&
      !consecutive &&
      s.minuteCommands > settings.floodCommandsPerMinute
    ) {
      s.hotMinutes = 1;
    } else {
      s.hotMinutes = 0;
    }
    s.minute = minute;
    s.minuteCommands = 0;
  }

  function evaluate(s: SessionState, now: number): void {
    for (const [kind, ev] of s.evidence) if (ev.expiresAt <= now) s.evidence.delete(kind);
    if (s.hotMinutes >= settings.floodMinutes) {
      setEvidence(
        s,
        'command_flood',
        settings.floodWeight,
        `Sent more than ${settings.floodCommandsPerMinute} commands a minute for ${s.hotMinutes} minutes in a row.`,
        now,
      );
    }
    if (s.anomalies >= settings.anomalyCount) {
      setEvidence(
        s,
        'protocol_noise',
        settings.anomalyWeight,
        `Sent ${s.anomalies} malformed or unknown frames this session.`,
        now,
      );
    }
    if (
      s.lastCommandAt > 0 &&
      now - s.runStartAt >= settings.noBreakHours * HOUR_MS &&
      now - s.lastCommandAt < BREAK_GAP_MS
    ) {
      setEvidence(
        s,
        'no_breaks',
        settings.noBreakWeight,
        `No pause of 2 minutes in commands for ${Math.floor((now - s.runStartAt) / HOUR_MS)} hours.`,
        now,
      );
    }
  }

  const score = (s: SessionState): number => {
    let total = 0;
    for (const ev of s.evidence.values()) total += ev.weight;
    return total;
  };

  const detailsFor = (s: SessionState): string =>
    `Automated review flag (score ${score(s)}): ${[...s.evidence.values()].map((e) => e.detail).join(' ')}`;

  /**
   * Push the current summary through the host. A refresh the host throttles is
   * acknowledged `true` without being written (the host paces refreshes and a
   * detector "may call as often as it likes"), so a `true` alone does not prove
   * the text landed. A refreshed text therefore counts as recorded only after
   * it was offered twice at least REFRESH_CONFIRM_MS apart (longer than the
   * host's refresh floor, so the second offer is admitted if the first was
   * dropped); until then it is offered again on a later tick.
   */
  function settle(s: SessionState, now: number): void {
    if (!host || s.inFlight) return;
    const details = detailsFor(s);
    const first = s.recordedDetails === null;
    if (!first && details === s.recordedDetails) return;
    const confirming = !first && s.offered === details;
    if (confirming && now - s.offeredAt < REFRESH_CONFIRM_MS) return;
    const confirmed = confirming;
    if (!first && !confirmed) {
      s.offered = details;
      s.offeredAt = now;
    }
    s.inFlight = true;
    const write = first
      ? host.recordSuspicionFlag({ accountId: s.ref.accountId, details })
      : host.refreshSuspicionFlagDetails({ accountId: s.ref.accountId, details });
    void write.then(
      (ok) => {
        s.inFlight = false;
        if (!ok) {
          s.offered = null;
          return;
        }
        if (first || confirmed) {
          s.recordedDetails = details;
          s.offered = null;
        }
      },
      () => {
        s.inFlight = false;
        s.offered = null;
      },
    );
  }

  return {
    createTrackingContext(ref) {
      const ctx = Object.freeze({}) as unknown as BotTrackingContext;
      sessions.set(ctx, {
        ref,
        minute: -1,
        minuteCommands: 0,
        hotMinutes: 0,
        anomalies: 0,
        runStartAt: 0,
        lastCommandAt: 0,
        evidence: new Map(),
        recordedDetails: null,
        inFlight: false,
        offered: null,
        offeredAt: 0,
      });
      return ctx;
    },
    setTrackingConnection() {},
    releaseTrackingContext(ctx) {
      sessions.delete(ctx);
    },
    observeCommand(ctx, _cmd, now) {
      const s = state(ctx);
      if (!s || !settings.enabled) return;
      rollMinute(s, now);
      s.minuteCommands += 1;
      if (s.lastCommandAt === 0 || now - s.lastCommandAt >= BREAK_GAP_MS) s.runStartAt = now;
      s.lastCommandAt = now;
    },
    observeEvent() {},
    observeInput() {},
    observeProtocolAnomaly(ctx, _anomaly: ProtocolAnomaly) {
      const s = state(ctx);
      if (s && settings.enabled) s.anomalies += 1;
    },
    // The enforce flag is accepted and ignored: this detector never acts.
    handleTick(ctx, now) {
      const s = state(ctx);
      if (!s || !settings.enabled) return 'none';
      rollMinute(s, now);
      evaluate(s, now);
      if (score(s) >= settings.flagThreshold) settle(s, now);
      return 'none';
    },
    listSuspiciousPlayers(): SuspiciousPlayer[] {
      const out: SuspiciousPlayer[] = [];
      for (const s of sessions.values()) {
        if (s.evidence.size === 0) continue;
        out.push({
          ref: s.ref,
          snapshot: null,
          state: 'SUSPICIOUS',
          score: score(s),
          evidence: [...s.evidence.values()],
        });
      }
      return out.sort((a, b) => b.score - a.score);
    },
    listCalibrationHistograms: () => [],
    describeConfig(): ConfigField[] {
      return CONFIG_META.map((m) => {
        const def = FLAG_ONLY_DEFAULTS[m.id];
        return {
          id: m.id,
          group: 'Flagging',
          label: m.label,
          type: typeof def === 'boolean' ? 'boolean' : 'number',
          defaultValue: def,
          value: settings[m.id],
          ...(m.min !== undefined ? { min: m.min } : {}),
          ...(m.max !== undefined ? { max: m.max } : {}),
          ...(m.unit ? { unit: m.unit } : {}),
          help: m.help,
        };
      });
    },
    applyConfig(overrides): ConfigApplyResult {
      const errors: string[] = [];
      const next: Settings = { ...FLAG_ONLY_DEFAULTS };
      const byId = new Map(CONFIG_META.map((m) => [m.id as string, m]));
      for (const [id, raw] of Object.entries(overrides)) {
        const meta = byId.get(id);
        if (!meta) {
          errors.push(`unknown field ${id}`);
          continue;
        }
        const def = FLAG_ONLY_DEFAULTS[meta.id];
        if (typeof def === 'boolean') {
          if (typeof raw !== 'boolean') {
            errors.push(`${id} must be true or false`);
            continue;
          }
          (next as Record<string, unknown>)[id] = raw;
        } else {
          if (
            typeof raw !== 'number' ||
            !Number.isFinite(raw) ||
            raw < (meta.min ?? 0) ||
            raw > (meta.max ?? Number.MAX_SAFE_INTEGER)
          ) {
            errors.push(`${id} must be a number from ${meta.min} to ${meta.max}`);
            continue;
          }
          (next as Record<string, unknown>)[id] = raw;
        }
      }
      Object.assign(settings, next);
      return { errors };
    },
    attachHost(h) {
      host = h;
    },
  };
}
