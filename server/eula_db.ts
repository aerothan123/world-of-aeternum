// The per-account EULA acceptance record behind GET/POST /api/eula
// (server/eula.ts): one row per account holding the LATEST version that account
// accepted and when. Bounded by the account count (a re-acceptance overwrites
// the row, it never appends), so the table needs no retention sweep, and the
// row goes with the account (ON DELETE CASCADE), so account deletion
// (server/account_export_state.ts and the deletion flow) removes it too.

import { pool } from './db';

export const ACCOUNT_EULA_SCHEMA = `
CREATE TABLE IF NOT EXISTS account_eula_acceptances (
  account_id INT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  eula_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/** The latest EULA version this account accepted, or null when it never did. */
export async function acceptedEulaVersion(accountId: number): Promise<string | null> {
  const res = await pool.query(
    'SELECT eula_version FROM account_eula_acceptances WHERE account_id = $1',
    [accountId],
  );
  return res.rows[0]?.eula_version ?? null;
}

/** Record (or overwrite) this account's acceptance of `version`, stamped now. */
export async function recordEulaAcceptance(accountId: number, version: string): Promise<void> {
  await pool.query(
    `INSERT INTO account_eula_acceptances (account_id, eula_version, accepted_at)
     VALUES ($1, $2, now())
     ON CONFLICT (account_id) DO UPDATE SET eula_version = EXCLUDED.eula_version,
       accepted_at = EXCLUDED.accepted_at`,
    [accountId, version],
  );
}
