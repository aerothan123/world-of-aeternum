// One house per ACCOUNT (Wyndlewood owner decision, 2026-11): the boot
// consolidation and the join-time holder lookup. The merge rule itself is the
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
`;

/** Accounts holding two or more houses in this realm. */
export const MULTI_HOUSE_ACCOUNTS_SQL = `SELECT account_id FROM characters
WHERE realm = $1 AND state ? 'house'
GROUP BY account_id HAVING count(*) > 1 ORDER BY account_id`;

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

/** The join-time lookup: another character on this account and realm who
 *  holds a house, or null. */
export const ACCOUNT_HOUSE_HOLDER_SQL = `SELECT name FROM characters
WHERE account_id = $1 AND realm = $2 AND id <> $3 AND state ? 'house'
ORDER BY id LIMIT 1`;

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
        const rows: AccountHouseRow[] = ((houses?.rows ?? []) as { id: number; house: unknown }[]).map(
          (row) => ({ characterId: row.id, house: row.house }),
        );
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
        await client.query('COMMIT');
        report.accounts++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
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

/** The join-time holder lookup (the ws_auth `accountHouseHolder` dep). */
export async function accountHouseHolderName(
  client: Queryable,
  accountId: number,
  realm: string,
  characterId: number,
): Promise<string | null> {
  const result = await client.query(ACCOUNT_HOUSE_HOLDER_SQL, [accountId, realm, characterId]);
  const name = (result?.rows?.[0] as { name?: unknown } | undefined)?.name;
  return typeof name === 'string' ? name : null;
}

/** Annotate a joining character's loaded state with the account's house
 *  holder (src/sim/character_state.ts accountHouseHolder). Only when the
 *  character holds no house itself. Fails open: a failed read logs and leaves
 *  the state alone (the next boot's consolidation still enforces the rule). */
export async function annotateAccountHouseHolder(
  lookup: ((accountId: number, characterId: number) => Promise<string | null>) | undefined,
  accountId: number,
  row: { id: number; state: object | null },
): Promise<void> {
  if (!lookup || !row.state || 'house' in row.state) return;
  try {
    const holder = await lookup(accountId, row.id);
    if (holder) (row.state as { accountHouseHolder?: string }).accountHouseHolder = holder;
  } catch (error) {
    console.error('account house holder lookup failed:', error);
  }
}
