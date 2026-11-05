// The first-launch EULA gate's decision core: given what the server says this
// account accepted (when an account is signed in) and what this install
// accepted locally, decide whether world entry may proceed, may proceed after
// a silent server sync, or must show the agreement first.
//
// Acceptance is versioned (src/legal_versions.ts EULA_VERSION) and stored PER
// ACCOUNT on the server (server/eula.ts); the local record is the offline-play
// record and a resilience cache, so a player who accepted on this install while
// the server was unreachable is not asked again and the server copy catches up.
//
// Pure: no DOM, no storage, no network (registered in UI_PURE_CORES).

/** The local record key (one per install; the server holds the per-account record). */
export const EULA_LOCAL_KEY = 'wynd_eula_accepted';

export type EulaGateDecision =
  /** Already accepted the current version: enter. */
  | 'pass'
  /** Accepted locally but the account record is missing or stale: enter, and record it. */
  | 'pass-sync'
  /** Show the agreement; entry waits on the answer. */
  | 'prompt';

export interface EulaGateInputs {
  current: string;
  /** The account's accepted version: a string, null (never accepted), or
   *  undefined when there is no signed-in account or the server was unreachable. */
  serverAccepted: string | null | undefined;
  /** This install's accepted version, or null. */
  localAccepted: string | null;
}

export function eulaGateDecision(inputs: EulaGateInputs): EulaGateDecision {
  if (inputs.serverAccepted === inputs.current) return 'pass';
  if (inputs.localAccepted === inputs.current) {
    return inputs.serverAccepted === undefined ? 'pass' : 'pass-sync';
  }
  return 'prompt';
}

/** Parse the stored local record ({ v: version }); anything else reads as never accepted. */
export function parseLocalEulaRecord(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown };
    return typeof parsed?.v === 'string' && parsed.v !== '' ? parsed.v : null;
  } catch {
    return null;
  }
}

/** Serialize the local record for a version. */
export function localEulaRecord(version: string): string {
  return JSON.stringify({ v: version });
}
