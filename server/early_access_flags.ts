// The realm's Early Access monetization switches (src/early_access_flags.ts
// owns the parser and the policy): MEMBERSHIP_ENABLED=1 and CLAUDIUM_ENABLED=1
// turn the inherited membership and the Claudium store back on. Unset, both are
// OFF: no member perk reaches the sim, no membership-slot character is locked,
// and no /api/claudium/* route is registered. Stored membership, ledger and
// Claudium rows are never touched by either switch.

import { type EarlyAccessFlags, parseEarlyAccessFlags } from '../src/early_access_flags';

export const SERVER_EARLY_ACCESS: EarlyAccessFlags = parseEarlyAccessFlags(process.env);
