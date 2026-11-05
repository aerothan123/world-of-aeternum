// The SQL half of the Early Access launch wipe (policy and the kept keys:
// server/launch_wipe_core.ts; operator entry: scripts/launch_wipe.ts; runbook:
// docs/launch/early-access-wipe.md).
//
// Safety rails, all enforced here (not in the CLI) so any caller gets them:
//   - ONE transaction: the whole realm wipes or nothing does. Characters are
//     locked FOR UPDATE for the duration.
//   - The realm must be EMPTY: any unexpired character lease (a live or
//     linkdead session) refuses the run, so a running server can never write
//     a pre-wipe blob back over a wiped row.
//   - Dry run by default. A real run needs the exact confirmation phrase the
//     dry run printed (realm and character count), so a count that moved
//     since the dry run refuses.
//   - ONE wipe per realm: a previous non-dry run in launch_wipe_runs refuses
//     unless the caller passes allowRepeat (a restore-then-rewipe drill).
//   - Every run, dry or real, appends an audit row to launch_wipe_runs
//     (keep forever: one row per operator run, tiny and the legal record of
//     the wipe).

import type { Pool, PoolClient } from 'pg';
import {
  planLaunchWipe,
  type WipeCharacterRow,
  type WipePlan,
  wipeCharacterState,
} from './launch_wipe_core';

/** Keep-forever audit table (one row per operator run; never pruned). */
export const LAUNCH_WIPE_SCHEMA = `
CREATE TABLE IF NOT EXISTS launch_wipe_runs (
  id SERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL,
  operator TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary JSONB NOT NULL
);`;

export type LaunchWipeResult =
  | { ok: true; dryRun: boolean; plan: WipePlan; runId: number; liveLeases?: number }
  | {
      ok: false;
      reason: 'realm_live' | 'confirmation_mismatch' | 'already_wiped' | 'no_characters';
      plan?: WipePlan;
      detail?: string;
    };

export interface LaunchWipeOptions {
  realm: string;
  operator: string;
  dryRun: boolean;
  confirmation?: string;
  allowRepeat?: boolean;
  /** The newborn state for a character (the CLI builds it with the real Sim). */
  freshStateFor(row: WipeCharacterRow): Record<string, unknown>;
}

async function audit(
  client: PoolClient,
  opts: LaunchWipeOptions,
  summary: Record<string, unknown>,
): Promise<number> {
  const res = await client.query(
    `INSERT INTO launch_wipe_runs (realm, dry_run, operator, summary)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [opts.realm, opts.dryRun, opts.operator.slice(0, 120), JSON.stringify(summary)],
  );
  return Number(res.rows[0].id);
}

/** Clear the realm-scoped progress stores (WIPE_REALM_CLEARS, in order). */
async function clearRealmStores(
  client: PoolClient,
  realm: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const run = async (label: string, sql: string, params: unknown[]) => {
    const res = await client.query(sql, params);
    counts[label] = res.rowCount ?? 0;
  };
  await run('world_state market book', 'DELETE FROM world_state WHERE key = $1', [
    `market:${realm}`,
  ]);
  // The legacy whole-book row plus every per-recipient partition
  // (mail:<realm>:r:<key>); a prefix compare, never LIKE (a realm name may
  // carry _ or %).
  await run(
    'world_state mail books',
    'DELETE FROM world_state WHERE key = $1 OR left(key, length($2)) = $2',
    [`mail:${realm}`, `mail:${realm}:r:`],
  );
  await run('world_state rifts', 'DELETE FROM world_state WHERE key = $1', [`rifts:${realm}`]);
  await run('mail_custody_parcels', 'DELETE FROM mail_custody_parcels WHERE realm = $1', [realm]);
  await run('guild_banks', 'DELETE FROM guild_banks WHERE realm = $1', [realm]);
  await run('world_quest_scores', 'DELETE FROM world_quest_scores WHERE realm = $1', [realm]);
  await run('market_sold_volume', 'DELETE FROM market_sold_volume WHERE realm = $1', [realm]);
  // Derived from character blobs; the account-wealth sweep rebuilds it.
  await run(
    'account_wealth',
    `DELETE FROM account_wealth w
      WHERE EXISTS (SELECT 1 FROM characters c WHERE c.account_id = w.account_id AND c.realm = $1)`,
    [realm],
  );
  return counts;
}

export async function runLaunchWipe(
  pool: Pool,
  opts: LaunchWipeOptions,
): Promise<LaunchWipeResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // An operator job over the whole realm: lift the per-statement cap for
    // this transaction only, but never wait long on a lock a live process holds.
    await client.query("SET LOCAL statement_timeout = '15min'; SET LOCAL lock_timeout = '5s'");
    await client.query(LAUNCH_WIPE_SCHEMA);

    const live = await client.query(
      'SELECT count(*)::int AS n FROM character_leases WHERE realm = $1 AND expires_at > now()',
      [opts.realm],
    );
    const liveCount = Number(live.rows[0]?.n ?? 0);
    // A dry run may look at a live realm (it writes nothing but its audit row);
    // a real run never may.
    if (liveCount > 0 && !opts.dryRun) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'realm_live', detail: `${liveCount} live character lease(s)` };
    }

    if (!opts.dryRun && !opts.allowRepeat) {
      const prior = await client.query(
        'SELECT id FROM launch_wipe_runs WHERE realm = $1 AND dry_run = FALSE LIMIT 1',
        [opts.realm],
      );
      if (prior.rows.length > 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'already_wiped', detail: `run #${prior.rows[0].id}` };
      }
    }

    const res = await client.query(
      `SELECT id, name, class, level, state FROM characters WHERE realm = $1 ORDER BY id${
        opts.dryRun ? '' : ' FOR UPDATE'
      }`,
      [opts.realm],
    );
    const rows: WipeCharacterRow[] = res.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      cls: String(r.class),
      level: Number(r.level),
      state: r.state,
    }));
    const plan = planLaunchWipe(opts.realm, rows);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'no_characters', plan };
    }

    if (opts.dryRun) {
      const runId = await audit(client, opts, { plan, liveLeases: liveCount });
      await client.query('COMMIT');
      return { ok: true, dryRun: true, plan, runId, liveLeases: liveCount };
    }
    if (opts.confirmation !== plan.confirmation) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'confirmation_mismatch', plan };
    }

    for (const row of rows) {
      const next = wipeCharacterState(row.state, opts.freshStateFor(row));
      const level = typeof next.level === 'number' ? next.level : 1;
      await client.query(
        'UPDATE characters SET state = $2, level = $3, updated_at = now() WHERE id = $1',
        [row.id, JSON.stringify(next), level],
      );
    }
    const cleared = await clearRealmStores(client, opts.realm);
    const runId = await audit(client, opts, { plan, cleared });
    await client.query('COMMIT');
    return { ok: true, dryRun: false, plan, runId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
