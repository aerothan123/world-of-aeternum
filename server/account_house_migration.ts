// One house per ACCOUNT, shared by all its characters (Wyndlewood owner
// decision, 2026-11): the boot consolidation, the account_houses row (the
// house's one home, written inside each character save's transaction), and
// the join-time read. The merge rule itself is the
// pure plan in ./account_house_merge.ts.
//
// Migration safety (.claude/agents/migration-safety.md):
// - Additive DDL only: one audit table, CREATE ... IF NOT EXISTS, applied from
//   ensureSchema under the schema advisory lock (ACCOUNT_HOUSE_MIGRATION_SCHEMA).
// - The saved house shape is unchanged and read forever: a released character
//   simply has no `house` key, the same shape as a character who never bought
//   one, and the kept house only gains storage rows.
// - Lossless and reversible: every released record is written whole to
//   account_house_migrations BEFORE it is cleared, in the same transaction as
//   the kept house's update. No FK, so the audit outlives a character delete.
// - Idempotent at boot: it runs on every boot, but it only touches an account
//   that holds two or more houses in this realm, and after one pass that
//   account holds one, so a second boot finds nothing to do.
// - Never races a live save: an account with ANY character holding an
//   unexpired lease (online somewhere, or a lease not yet expired after a
//   crash) is skipped this boot and retried at the next.
// - One bounded transaction per account (statement and lock timeouts), on the
//   dedicated boot client after the schema COMMIT, under its own session
//   advisory lock: the account_social_migration.ts shape.
// - Growth: the audit table gains one row per released house, ever. Released
//   houses are bounded by the characters that bought one, so no retention
//   sweep is needed.

import type { Client } from 'pg';
import { type AccountHouseRow, planAccountHouseMerge } from './account_house_merge';

const MIGRATION_LOCK = 1742389077;

export const ACCOUNT_HOUSE_MIGRATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS account_house_migrations (
  id BIGSERIAL PRIMARY KEY,
  character_id INT NOT NULL,
  account_id INT NOT NULL,
  realm TEXT NOT NULL,
  kept_character_id INT NOT NULL,
  original_house JSONB NOT NULL,
  moved_slots INT NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_house_migrations_account ON account_house_migrations(account_id);
-- One house per ACCOUNT: the live record every character of the account shares,
-- one row per account and realm, written in the same transaction as each save
-- of a character using it (upsertAccountHouseFromSave). Bounded by accounts.
CREATE TABLE IF NOT EXISTS account_houses (
  account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  house JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, realm)
);
`;

/** Accounts holding two or more houses in this realm that are not yet
 *  account-owned. Once an account_houses row exists, every character of the
 *  account carries a COPY of the one shared house in its blob, which must
 *  never be merged again (that would duplicate the storage). */
export const MULTI_HOUSE_ACCOUNTS_SQL = `SELECT c.account_id FROM characters c
WHERE c.realm = $1 AND c.state ? 'house'
AND NOT EXISTS (SELECT 1 FROM account_houses ah WHERE ah.account_id = c.account_id AND ah.realm = c.realm)
GROUP BY c.account_id HAVING count(*) > 1 ORDER BY c.account_id`;

/** Seed the account row for every single-house account (idempotent). */
export const SEED_ACCOUNT_HOUSES_SQL = `INSERT INTO account_houses (account_id, realm, house)
SELECT DISTINCT ON (c.account_id) c.account_id, c.realm, c.state->'house' FROM characters c
WHERE c.realm = $1 AND c.state ? 'house' AND jsonb_typeof(c.state->'house') = 'object'
AND c.account_id NOT IN (
  SELECT account_id FROM characters WHERE realm = $1 AND state ? 'house'
  GROUP BY account_id HAVING count(*) > 1
)
ORDER BY c.account_id, c.id
ON CONFLICT (account_id, realm) DO NOTHING`;

const KEEP_ACCOUNT_ROW_SQL = `INSERT INTO account_houses (account_id, realm, house) VALUES ($1, $2, $3::jsonb)
ON CONFLICT (account_id, realm) DO UPDATE SET house = EXCLUDED.house, updated_at = now()`;

const ACCOUNT_ROW_SQL = `SELECT house FROM account_houses WHERE account_id = $1 AND realm = $2`;

const FALLBACK_HOUSE_SQL = `SELECT state->'house' AS house FROM characters
WHERE account_id = $1 AND realm = $2 AND state ? 'house'
ORDER BY (id = $3) DESC, id LIMIT 1`;

/** The save-transaction write: the account's row takes the saving
 *  character's (shared, live) house. */
export const UPSERT_ACCOUNT_HOUSE_SQL = `INSERT INTO account_houses (account_id, realm, house, updated_at)
SELECT account_id, realm, $2::jsonb, now() FROM characters WHERE id = $1
ON CONFLICT (account_id, realm) DO UPDATE SET house = EXCLUDED.house, updated_at = now()`;

const ACCOUNT_HOUSES_SQL = `SELECT id, state->'house' AS house FROM characters
WHERE account_id = $1 AND realm = $2 AND state ? 'house' ORDER BY id FOR UPDATE`;

const ACCOUNT_LEASED_SQL = `SELECT 1 FROM character_leases l JOIN characters c ON c.id = l.character_id
WHERE c.account_id = $1 AND l.expires_at > now() LIMIT 1`;

const AUDIT_INSERT_SQL = `INSERT INTO account_house_migrations
(character_id, account_id, realm, kept_character_id, original_house, moved_slots)
VALUES ($1, $2, $3, $4, $5::jsonb, $6)`;

const RELEASE_SQL = `UPDATE characters SET state = state - 'house', updated_at = now() WHERE id = $1`;

const KEEP_SQL = `UPDATE characters SET state = jsonb_set(state, '{house}', $2::jsonb), updated_at = now()
WHERE id = $1`;

export interface AccountHouseMigrationReport {
  accounts: number;
  released: number;
  movedSlots: number;
  skippedLeased: number;
}

type Queryable = Pick<Client, 'query'>;

/** Consolidate this realm's multi-house accounts. The caller owns a connected
 *  client outside any transaction (ensureSchema's boot client, after COMMIT). */
export async function migrateAccountHouses(
  client: Queryable,
  realm: string,
  log: (line: string) => void = () => {},
): Promise<AccountHouseMigrationReport> {
  const report: AccountHouseMigrationReport = {
    accounts: 0,
    released: 0,
    movedSlots: 0,
    skippedLeased: 0,
  };
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
  try {
    const candidates = await client.query(MULTI_HOUSE_ACCOUNTS_SQL, [realm]);
    for (const { account_id: accountId } of (candidates?.rows ?? []) as { account_id: number }[]) {
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '1s'");
        const leased = await client.query(ACCOUNT_LEASED_SQL, [accountId]);
        if ((leased?.rows?.length ?? 0) > 0) {
          report.skippedLeased++;
          await client.query('ROLLBACK');
          continue;
        }
        const houses = await client.query(ACCOUNT_HOUSES_SQL, [accountId, realm]);
        const rows: AccountHouseRow[] = (
          (houses?.rows ?? []) as { id: number; house: unknown }[]
        ).map((row) => ({ characterId: row.id, house: row.house }));
        const plan = planAccountHouseMerge(rows);
        if (!plan) {
          await client.query('ROLLBACK');
          continue;
        }
        for (const released of plan.released) {
          await client.query(AUDIT_INSERT_SQL, [
            released.characterId,
            accountId,
            realm,
            plan.keptCharacterId,
            JSON.stringify(released.originalHouse),
            released.movedSlots,
          ]);
          await client.query(RELEASE_SQL, [released.characterId]);
          report.released++;
          report.movedSlots += released.movedSlots;
        }
        await client.query(KEEP_SQL, [plan.keptCharacterId, JSON.stringify(plan.keptHouse)]);
        await client.query(KEEP_ACCOUNT_ROW_SQL, [accountId, realm, JSON.stringify(plan.keptHouse)]);
        await client.query('COMMIT');
        report.accounts++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    // Every account left with one house becomes account-owned (idempotent).
    await client.query(SEED_ACCOUNT_HOUSES_SQL, [realm]);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
  }
  if (report.accounts > 0 || report.skippedLeased > 0) {
    log(
      `[account-house] realm ${realm}: merged ${report.accounts} account(s), released ` +
        `${report.released} house(s), moved ${report.movedSlots} slot(s), ` +
        `skipped ${report.skippedLeased} account(s) with a live lease (retried next boot)`,
    );
  }
  return report;
}

/** What a joining character receives: the account's one house (the account
 *  row, else the oldest character's saved house as the old-shape fallback). */
export interface AccountHouseForJoin {
  house: unknown | null;
}

/** The join-time read (the ws_auth `accountHouse` dep). */
export async function accountHouseForJoin(
  client: Queryable,
  accountId: number,
  realm: string,
  characterId: number,
): Promise<AccountHouseForJoin> {
  const row = await client.query(ACCOUNT_ROW_SQL, [accountId, realm]);
  const owned = (row?.rows?.[0] as { house?: unknown } | undefined)?.house;
  if (owned !== undefined && owned !== null) return { house: owned };
  const fallback = await client.query(FALLBACK_HOUSE_SQL, [accountId, realm, characterId]);
  const house = (fallback?.rows?.[0] as { house?: unknown } | undefined)?.house;
  return { house: house ?? null };
}

/** The account key every character of an account shares its house under. */
export function accountHouseKeyFor(accountId: number): string {
  return `acct:${accountId}`;
}

/** Annotate a joining character's loaded state: the account house key and the
 *  account's house (src/sim/character_state.ts accountHouseKey). Fails open
 *  WITHOUT the key: a failed read leaves the character on its own saved copy
 *  and keeps its saves from writing the account row. */
export async function annotateAccountHouse(
  lookup: ((accountId: number, characterId: number) => Promise<AccountHouseForJoin>) | undefined,
  accountId: number,
  row: { id: number; state: object | null },
): Promise<void> {
  if (!lookup || !row.state) return;
  const state = row.state as { accountHouseKey?: string; house?: unknown };
  delete state.accountHouseKey;
  try {
    const { house } = await lookup(accountId, row.id);
    if (house !== null && typeof house === 'object') state.house = house;
    state.accountHouseKey = accountHouseKeyFor(accountId);
  } catch (error) {
    console.error('account house lookup failed:', error);
  }
}

const ACCOUNT_HOUSE_SAVE_MARKER = '"accountHouseKey":"acct:';

/** Inside a character save's transaction (server/character_save_statement.ts):
 *  a character on an account house writes that house to the account row in the
 *  same transaction as its own row, so a storage deposit or withdrawal can
 *  never land in one and miss the other. The full state is parsed only for a
 *  save that carries the marker (characters using an account house). */
export async function upsertAccountHouseFromSave(
  tx: { query(text: string, values?: unknown[]): Promise<unknown> },
  characterId: number,
  stateJson: string,
): Promise<boolean> {
  if (!stateJson.includes(ACCOUNT_HOUSE_SAVE_MARKER)) return false;
  const house = (JSON.parse(stateJson) as { house?: unknown }).house;
  if (house === null || typeof house !== 'object') return false;
  await tx.query(UPSERT_ACCOUNT_HOUSE_SQL, [characterId, JSON.stringify(house)]);
  return true;
}
