// Realm maintenance mode: an in-game broadcast countdown, then a login gate.
//
// Operators start it over the secret-gated internal surface
// (POST /internal/maintenance, server/internal.ts) or boot a realm straight
// into it (MAINTENANCE_MODE=1). While the gate is active the WS handshake
// (server/ws_auth.ts) refuses every non-staff entry with the byte-exact
// MAINTENANCE_REJECTION literal, which the client localizes
// (src/ui/api_error_i18n.ts, loading.maintenance). Staff stay admitted so they
// can verify the realm before reopening it. Already-connected players are not
// kicked by the gate: a maintenance that needs the realm empty ends in the
// usual stop (DEPLOY.md "Updating the game"), which the countdown has warned
// everyone about.
//
// The broadcast lines are English at the source like every server emit and
// re-localize on the client through src/ui/maintenance_text_i18n.ts; the
// exact text lives ONLY in maintenanceStepText below, so the matcher and the
// emitter cannot drift (tests/server/maintenance.test.ts round-trips both).
//
// The controller is IO-free: the clock, the timers and the broadcast are
// injected, so the countdown tests run without a server or a real wall clock.

/** Byte-exact WS refusal literal (wire contract with src/ui/api_error_i18n.ts). */
export const MAINTENANCE_REJECTION = 'realm is under maintenance';

export const MAINTENANCE_MIN_MINUTES = 1;
export const MAINTENANCE_MAX_MINUTES = 120;
export const MAINTENANCE_DEFAULT_MINUTES = 10;

/** One countdown announcement: `atSeconds` after the start, with what is left. */
export type MaintenanceStep =
  | { atSeconds: number; kind: 'minutes'; left: number }
  | { atSeconds: number; kind: 'seconds'; left: number }
  | { atSeconds: number; kind: 'begun' };

/** The announcement ladder for an N-minute countdown: the start, then every
 *  milestone of 60/30/15/10/5/2/1 minutes and 30/10 seconds that fits, then
 *  the gate closing at T=0. */
export function planMaintenanceSteps(minutes: number): MaintenanceStep[] {
  const total = minutes * 60;
  const steps: MaintenanceStep[] = [{ atSeconds: 0, kind: 'minutes', left: minutes }];
  for (const left of [60, 30, 15, 10, 5, 2, 1]) {
    if (left < minutes) steps.push({ atSeconds: total - left * 60, kind: 'minutes', left });
  }
  for (const left of [30, 10]) steps.push({ atSeconds: total - left, kind: 'seconds', left });
  steps.push({ atSeconds: total, kind: 'begun' });
  return steps;
}

/** The English broadcast for a step (the client matcher reads exactly these). */
export function maintenanceStepText(step: MaintenanceStep): string {
  if (step.kind === 'begun') return 'Realm maintenance has begun. New logins are closed.';
  if (step.kind === 'seconds') return `Realm maintenance begins in ${step.left} seconds.`;
  return step.left === 1
    ? 'Realm maintenance begins in 1 minute.'
    : `Realm maintenance begins in ${step.left} minutes.`;
}

export const MAINTENANCE_CANCELLED_TEXT = 'Realm maintenance was cancelled.';
export const MAINTENANCE_ENDED_TEXT = 'Realm maintenance is over. Logins are open again.';

export type MaintenancePhase = 'off' | 'countdown' | 'active';

export interface MaintenanceStatus {
  phase: MaintenancePhase;
  /** Seconds until the gate closes (countdown only; 0 otherwise). */
  remainingSeconds: number;
}

export interface MaintenanceDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  broadcast(text: string): void;
}

export interface MaintenanceController {
  start(minutes: number): { started: boolean; status: MaintenanceStatus };
  cancel(): { cancelled: boolean; status: MaintenanceStatus };
  end(): { ended: boolean; status: MaintenanceStatus };
  /** True while non-staff entries must be refused. */
  gateActive(): boolean;
  status(): MaintenanceStatus;
}

/** Clamp an operator-supplied minute count; null for garbage. */
export function parseMaintenanceMinutes(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return MAINTENANCE_DEFAULT_MINUTES;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < MAINTENANCE_MIN_MINUTES || n > MAINTENANCE_MAX_MINUTES) {
    return null;
  }
  return n;
}

export function createMaintenanceController(
  deps: MaintenanceDeps,
  opts: { startActive?: boolean } = {},
): MaintenanceController {
  let phase: MaintenancePhase = opts.startActive ? 'active' : 'off';
  let gateAtMs = 0;
  let timers: unknown[] = [];

  const clearAll = () => {
    for (const t of timers) deps.clearTimer(t);
    timers = [];
  };
  const status = (): MaintenanceStatus => ({
    phase,
    remainingSeconds:
      phase === 'countdown' ? Math.max(0, Math.ceil((gateAtMs - deps.now()) / 1000)) : 0,
  });

  return {
    start(minutes) {
      if (phase !== 'off') return { started: false, status: status() };
      phase = 'countdown';
      gateAtMs = deps.now() + minutes * 60_000;
      for (const step of planMaintenanceSteps(minutes)) {
        const fire = () => {
          if (step.kind === 'begun') {
            phase = 'active';
            timers = [];
          }
          deps.broadcast(maintenanceStepText(step));
        };
        if (step.atSeconds === 0) fire();
        else timers.push(deps.setTimer(fire, step.atSeconds * 1000));
      }
      return { started: true, status: status() };
    },
    cancel() {
      if (phase !== 'countdown') return { cancelled: false, status: status() };
      clearAll();
      phase = 'off';
      deps.broadcast(MAINTENANCE_CANCELLED_TEXT);
      return { cancelled: true, status: status() };
    },
    end() {
      if (phase === 'off') return { ended: false, status: status() };
      clearAll();
      phase = 'off';
      deps.broadcast(MAINTENANCE_ENDED_TEXT);
      return { ended: true, status: status() };
    },
    gateActive: () => phase === 'active',
    status,
  };
}

/** Boot flag: a realm can start already closed (MAINTENANCE_MODE=1). */
export function maintenanceModeAtBoot(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.MAINTENANCE_MODE ?? '').trim() === '1';
}

// The process-wide controller, built lazily on first use from the injected
// broadcast (server/main.ts configureMaintenance at boot). Until configured,
// broadcasts are dropped but the boot flag still closes the gate.
let controller: MaintenanceController | null = null;
let broadcastSink: (text: string) => void = () => {};

export function configureMaintenance(broadcast: (text: string) => void): void {
  broadcastSink = broadcast;
}

export function maintenance(): MaintenanceController {
  if (controller === null) {
    controller = createMaintenanceController(
      {
        now: () => Date.now(),
        setTimer: (fn, ms) => {
          const t = setTimeout(fn, ms);
          t.unref?.();
          return t;
        },
        clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
        broadcast: (text) => broadcastSink(text),
      },
      { startActive: maintenanceModeAtBoot() },
    );
  }
  return controller;
}

/** Tests only: drop the singleton so the next read rebuilds from env. */
export function resetMaintenanceForTests(): void {
  controller = null;
  broadcastSink = () => {};
}
