// The SQL half of the Early Access launch wipe (policy and the kept keys:
// server/launch_wipe_core.ts; operator entry: scripts/launch_wipe.ts; runbook:
// docs/launch/early-access-wipe.md).
//
// Safety rails, all enforced here (not in the CLI) so any caller gets them:
//   - ONE transaction: the whole realm wipes or nothing does. Characters are
//     locked FOR UPDATE for the duration.
//   - The realm must be EMPTY and its process STOPPED: the transaction first
//     takes the realm's advisory key (server/realm_heartbeat.ts, the boot
//     fence: a server cannot boot while it is held), then refuses on a fresh
//     process heartbeat or any unexpired character lease, so a running server
//     can never write a pre-wipe blob or book back over a wiped row.
//   - In-flight paid obligations refuse the run (WIPE_BLOCKERS: open legacy
//     market rows, referral deliveries in flight, pending storage purchases);
//     the dry run counts them.
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
  WIPE_BLOCKERS,
  type WipeCharacterRow,
  type WipePlan,
  wipeCharacterState,
} from './launch_wipe_core';
import { HEARTBEAT_STALE_SECONDS, LAUNCH_WIPE_LOCK_KEY_SQL } from './realm_heartbeat';

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
      reason:
        | 'realm_live'
        | 'process_running'
        | 'open_obligations'
        | 'confirmation_mismatch'
        | 'already_wiped'
        | 'no_characters';
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

/** Whether a table exists (the legacy market and the core-systems housing
 *  table are not on every schema). */
async function tableExists(client: PoolClient, name: string): Promise<boolean> {
  const res = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [name]);
  return res.rows[0]?.present === true;
}

/** Count every WIPE_BLOCKERS obligation for the realm (WIPE_BLOCKERS order). */
async function countBlockers(client: PoolClient, realm: string): Promise<Record<string, number>> {
  const [listings, custody, bids, offers, settlements, bonds, transfers, storage] = WIPE_BLOCKERS;
  const probes: [string, string, string][] = [
    [listings, 'woc_market_listings', "realm = $1 AND status <> 'closed'"],
    [custody, 'woc_market_custody_claims', 'realm = $1 AND booked_at IS NULL'],
    [bids, 'woc_market_bids', "realm = $1 AND status IN ('pending_bond', 'active')"],
    [offers, 'woc_market_directed_offers', "realm = $1 AND status = 'pending'"],
    [
      settlements,
      'woc_market_settlements',
      "realm = $1 AND state NOT IN ('delivered', 'expired', 'failed')",
    ],
    [
      bonds,
      'referral_bond_delivery_characters',
      'character_id IN (SELECT id FROM characters WHERE realm = $1)',
    ],
    [
      transfers,
      'referral_transfer_characters',
      'character_id IN (SELECT id FROM characters WHERE realm = $1)',
    ],
    [storage, 'storage_purchases', "realm = $1 AND status IN ('pending', 'unresolved')"],
  ];
  const out: Record<string, number> = {};
  for (const [label, table, where] of probes) {
    if (!(await tableExists(client, table))) {
      out[label] = 0;
      continue;
    }
    const res = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, [
      realm,
    ]);
    out[label] = Number(res.rows[0]?.n ?? 0);
  }
  return out;
}

/** Paid bank slots per character from the applied storage receipts: the sum
 *  of after minus before, or null when any receipt lacks the pair. */
async function paidSlotsByCharacter(
  client: PoolClient,
  realm: string,
): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  if (!(await tableExists(client, 'storage_purchase_applied_receipts'))) return out;
  const res = await client.query(
    `SELECT character_id,
            sum(purchased_slots_after - purchased_slots_before)::int AS paid,
            bool_or(purchased_slots_before IS NULL OR purchased_slots_after IS NULL) AS unknown
       FROM storage_purchase_applied_receipts WHERE realm = $1 GROUP BY character_id`,
    [realm],
  );
  for (const row of res.rows) {
    out.set(Number(row.character_id), row.unknown === true ? null : Number(row.paid ?? 0));
  }
  return out;
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
  // feature/core-systems account housing: gold-bought, so progress.
  if (await tableExists(client, 'account_houses')) {
    await run('account_houses', 'DELETE FROM account_houses WHERE realm = $1', [realm]);
  }
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
    // The boot fence: while this transaction holds the realm's key, no realm
    // process can boot (server/realm_heartbeat.ts). Taken BEFORE the heartbeat
    // read below; that ordering is what makes the fence race-free.
    await client.query(`SELECT pg_advisory_xact_lock(${LAUNCH_WIPE_LOCK_KEY_SQL})`, [opts.realm]);
    let beatAgeSeconds: number | null = null;
    if (await tableExists(client, 'realm_process_heartbeats')) {
      const beat = await client.query(
        'SELECT EXTRACT(EPOCH FROM (now() - beat_at))::int AS age FROM realm_process_heartbeats WHERE realm = $1',
        [opts.realm],
      );
      if (beat.rows[0]) beatAgeSeconds = Number(beat.rows[0].age);
    }
    const processRunning = beatAgeSeconds !== null && beatAgeSeconds < HEARTBEAT_STALE_SECONDS;
    if (processRunning && !opts.dryRun) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reason: 'process_running',
        detail: `realm heartbeat ${beatAgeSeconds}s old; stop the game and wait ${HEARTBEAT_STALE_SECONDS}s`,
      };
    }

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
    const plan: WipePlan = {
      ...planLaunchWipe(opts.realm, rows),
      blockers: await countBlockers(client, opts.realm),
    };
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'no_characters', plan };
    }

    if (opts.dryRun) {
      const runId = await audit(client, opts, { plan, liveLeases: liveCount, beatAgeSeconds });
      await client.query('COMMIT');
      return { ok: true, dryRun: true, plan, runId, liveLeases: liveCount };
    }
    const open = Object.entries(plan.blockers ?? {}).filter(([, n]) => n > 0);
    if (open.length > 0) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reason: 'open_obligations',
        plan,
        detail: open.map(([label, n]) => `${label}: ${n}`).join('; '),
      };
    }
    if (opts.confirmation !== plan.confirmation) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'confirmation_mismatch', plan };
    }

    const paid = await paidSlotsByCharacter(client, opts.realm);
    for (const row of rows) {
      const next = wipeCharacterState(
        row.state,
        opts.freshStateFor(row),
        paid.has(row.id) ? (paid.get(row.id) ?? null) : null,
      );
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
