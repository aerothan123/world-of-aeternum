// Early Access monetization switches (owner decision, 2026-11): membership and
// the Claudium store are OFF unless a build or a realm turns them on. Nothing is
// deleted: the code and every stored membership, ledger and Claudium row stay
// untouched, and flipping a switch back on restores today's behavior.
//
// One parser, two readers:
// - the client reads the Vite build env (VITE_MEMBERSHIP_ENABLED,
//   VITE_CLAUDIUM_ENABLED), replaced statically at build time, so a Steam
//   build made without them dead-codes every guarded branch;
// - the server reads process.env (MEMBERSHIP_ENABLED, CLAUDIUM_ENABLED) through
//   server/early_access_flags.ts.
// The value '1' (and only '1') turns a switch on; absent, empty or anything
// else is off. Host-agnostic: no DOM, no Node imports.

export interface EarlyAccessFlags {
  /** The membership subscription, its token and every member perk (gear at
   *  level + 5, the XP bonus, the half market fee, member bag, courier,
   *  member bank, member character slots gating). */
  membership: boolean;
  /** The Claudium soft currency store and its /api/claudium/* routes (card
   *  checkout, store spends, the subscription checkout it fronts). */
  claudium: boolean;
}

export function parseEarlyAccessFlags(
  env: Readonly<Record<string, string | boolean | undefined>>,
  prefix = '',
): EarlyAccessFlags {
  return {
    membership: env[`${prefix}MEMBERSHIP_ENABLED`] === '1',
    claudium: env[`${prefix}CLAUDIUM_ENABLED`] === '1',
  };
}

// Literal reads (never through a variable) so Vite replaces each at build time
// and the bundler folds the guarded branches away.
/** Client build switch: membership offers and perks UI. */
export const MEMBERSHIP_ENABLED: boolean = import.meta.env.VITE_MEMBERSHIP_ENABLED === '1';
/** Client build switch: the Claudium store and every surface it fronts. */
export const CLAUDIUM_ENABLED: boolean = import.meta.env.VITE_CLAUDIUM_ENABLED === '1';
