// The current versions of Wyndlewood's player agreements, in ONE place, shared
// by the client EULA gate (src/ui/eula_gate_core.ts, src/ui/eula_prompt.ts) and
// the server acceptance record (server/eula.ts). Bump EULA_VERSION whenever the
// End User License Agreement (docs/legal/eula.md, public/eula.html) changes in a
// way players must accept again: every account is then asked once more on its
// next world entry, and the new acceptance is recorded per account.
//
// The value is an opaque token (date plus a short tag), compared for equality
// only. The current drafts are TEMPLATES awaiting lawyer review.
//
// Host-agnostic: no imports, no DOM.

/** The EULA version a player must have accepted to enter the world. */
export const EULA_VERSION = '2026-11-04-draft';

/** Shape check for a version token arriving over the wire. */
export function isEulaVersionToken(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,24}$/.test(raw);
}
