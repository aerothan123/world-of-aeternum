// The per-account player-agreement acceptance record behind GET/POST
// /api/legal-acceptance (server/legal_acceptance.ts): one row per account
// holding the LATEST version of each document that account accepted (the EULA,
// the Terms of Service and the Privacy Policy, src/legal_versions.ts) and when.
// Bounded by the account count (a re-acceptance overwrites the row, it never
// appends), so the table needs no retention sweep, and the row goes with the
// account (ON DELETE CASCADE), so account deletion removes it too.
//
// Inline DDL, re-applied at every boot (ensureSchema, server/db.ts): the table
// was born EULA-only, so the Terms and Privacy columns are ADDITIVE nullable
// columns (ADD COLUMN IF NOT EXISTS). A row written before they existed reads
// those documents as never accepted, so that account is asked once more.

import type { LegalDocId } from '../src/legal_versions';
import { pool } from './db';

export const ACCOUNT_EULA_SCHEMA = `
CREATE TABLE IF NOT EXISTS account_eula_acceptances (
  account_id INT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  eula_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE account_eula_acceptances ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE account_eula_acceptances ADD COLUMN IF NOT EXISTS privacy_version TEXT;
`;

export type AcceptedLegalVersions = Record<LegalDocId, string | null>;

/** The versions this account last accepted, or null when it never accepted any. */
export async function acceptedLegalVersions(
  accountId: number,
): Promise<AcceptedLegalVersions | null> {
  const res = await pool.query(
    `SELECT eula_version, terms_version, privacy_version
       FROM account_eula_acceptances WHERE account_id = $1`,
    [accountId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    eula: row.eula_version ?? null,
    terms: row.terms_version ?? null,
    privacy: row.privacy_version ?? null,
  };
}

/** Record (or overwrite) this account's acceptance of every document, stamped now. */
export async function recordLegalAcceptance(
  accountId: number,
  versions: Readonly<Record<LegalDocId, string>>,
): Promise<void> {
  await pool.query(
    `INSERT INTO account_eula_acceptances
       (account_id, eula_version, terms_version, privacy_version, accepted_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (account_id) DO UPDATE SET eula_version = EXCLUDED.eula_version,
       terms_version = EXCLUDED.terms_version, privacy_version = EXCLUDED.privacy_version,
       accepted_at = EXCLUDED.accepted_at`,
    [accountId, versions.eula, versions.terms, versions.privacy],
  );
}
