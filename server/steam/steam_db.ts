// SQL boundary for the Steam link domain (the *_db.ts convention: every
// steam_links query lives here, parameterized, and no other module carries raw
// SQL for the table). The DDL is in server/db.ts SCHEMA. Imports the pool
// ONLY, deliberately mirroring server/deeds_db.ts: modules that stub the db
// module in tests never need fakes for these functions.
//
// A steam_links row says which Steam account belongs to this account: the
// deeds achievement mirror reads it, and since Wyndlewood's Steam login the
// login route (server/steam_login.ts, deliberately outside this directory)
// resolves a verified Steam id to its account through accountForSteamId.
// Nothing in this module (or anywhere in server/steam/) reads or writes
// auth_tokens or mints credentials; the forbidden-mint scan pins that.

import { pool } from '../db';
import { isUniqueViolation } from '../http_util';

/** One account-to-Steam link. steamId is Steam's 64-bit id as a decimal string. */
export interface SteamLinkRow {
  accountId: number;
  steamId: string;
  createdAt: string;
}

/** The caller's link, or null when the account has none. */
export async function steamLinkForAccount(accountId: number): Promise<SteamLinkRow | null> {
  const res = await pool.query(
    'SELECT account_id, steam_id, created_at FROM steam_links WHERE account_id = $1',
    [accountId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    accountId: row.account_id,
    steamId: row.steam_id,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/** The account a Steam id is linked to, or null. */
export async function accountForSteamId(steamId: string): Promise<number | null> {
  const res = await pool.query('SELECT account_id FROM steam_links WHERE steam_id = $1', [steamId]);
  return res.rows[0]?.account_id ?? null;
}

/**
 * How an insert attempt resolved. Both conflict arms are terminal 409s for the
 * caller: 'account_linked' (this account already has a link; account_id is the
 * PK) and 'steam_taken' (this Steam id belongs to another account; steam_id is
 * UNIQUE). The route pre-checks both for the friendly ordering, but a
 * concurrent racer can still land first, so the insert itself classifies the
 * 23505 by constraint instead of surfacing a 500.
 */
export type SteamLinkInsert = 'ok' | 'account_linked' | 'steam_taken';

/** Insert the caller's link. Plain INSERT, never an upsert: replacing a link
 *  is an explicit unlink-then-link so the mirror's reconcile always runs
 *  against exactly one Steam id. */
export async function insertSteamLink(
  accountId: number,
  steamId: string,
): Promise<SteamLinkInsert> {
  try {
    await pool.query('INSERT INTO steam_links (account_id, steam_id) VALUES ($1, $2)', [
      accountId,
      steamId,
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      // TOCTOU: a concurrent request beat the route's pre-checks. Re-read to
      // classify which uniqueness lost the race. The re-read is itself
      // non-atomic, so a same-account relink racing an unlink can misattribute
      // WHICH constraint lost; that is accepted, since both arms are terminal
      // 409s and nothing is written on either.
      const mine = await steamLinkForAccount(accountId);
      return mine ? 'account_linked' : 'steam_taken';
    }
    throw err;
  }
  return 'ok';
}

/** Delete the caller's link. Idempotent: deleting a non-existent row is a no-op. */
export async function deleteSteamLink(accountId: number): Promise<void> {
  await pool.query('DELETE FROM steam_links WHERE account_id = $1', [accountId]);
}

/** How a displace attempt resolved: the same insert taxonomy plus the account
 *  whose link was displaced (null when the Steam id was actually free), so the
 *  caller can flip that account's cached mirror view in-request. */
export interface SteamLinkDisplaceResult {
  /** 'holder_protected': the current holder has characters, so the link is
   *  never taken from it (decided INSIDE the transaction, under the row lock). */
  result: SteamLinkInsert | 'holder_protected';
  displacedAccountId: number | null;
}

/**
 * Reclaim-by-proof: hand steamId's link to newAccountId, displacing whatever
 * OTHER account currently holds it, in ONE transaction. A caller reaching here
 * has proven CURRENT control of the Steam account with a fresh verified ticket,
 * strictly stronger evidence than the stale (possibly stolen) ticket the
 * displaced owner linked with, so the true owner always wins in steady state.
 *
 * The transaction locks the steam_id row (FOR UPDATE), deletes the old owner's
 * row if a DIFFERENT account holds it, then inserts the caller's, so a
 * concurrent reclaim serializes instead of racing. The final INSERT can still
 * lose a 23505 to a racer that beat the lock's window; it is re-classified by
 * constraint exactly like insertSteamLink (account_id PK -> 'account_linked',
 * steam_id UNIQUE -> 'steam_taken'), both terminal 409s, nothing written on
 * either. The route pre-checks already answer the same-account already-linked
 * case, so displacedAccountId is only ever a genuinely different account.
 */
export async function displaceSteamLink(
  newAccountId: number,
  steamId: string,
): Promise<SteamLinkDisplaceResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT account_id FROM steam_links WHERE steam_id = $1 FOR UPDATE',
      [steamId],
    );
    const oldOwner: number | null = existing.rows[0]?.account_id ?? null;
    const displaced = oldOwner !== null && oldOwner !== newAccountId ? oldOwner : null;
    if (displaced !== null) {
      // Never take a link from an account that holds progress, whatever other
      // logins it has: a fresh ticket proves control of the Steam account, not
      // that the realm account is the caller's. Checked here, under the
      // steam_id row lock, so no check-then-act gap separates the decision
      // from the delete.
      const holder = await client.query(
        'SELECT EXISTS (SELECT 1 FROM characters WHERE account_id = $1) AS has_characters',
        [displaced],
      );
      if (holder.rows[0]?.has_characters === true) {
        await client.query('ROLLBACK');
        return { result: 'holder_protected', displacedAccountId: null };
      }
      await client.query('DELETE FROM steam_links WHERE steam_id = $1 AND account_id <> $2', [
        steamId,
        newAccountId,
      ]);
    }
    await client.query('INSERT INTO steam_links (account_id, steam_id) VALUES ($1, $2)', [
      newAccountId,
      steamId,
    ]);
    await client.query('COMMIT');
    return { result: 'ok', displacedAccountId: displaced };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (isUniqueViolation(err)) {
      // A concurrent request beat this transaction to the INSERT. Classify which
      // uniqueness lost the race the same way insertSteamLink does; nothing was
      // written, so no link was displaced either.
      //
      // Classify on the ALREADY-HELD client, never a fresh pool.query: this arm
      // is only reached on a clean server-side 23505 followed by a successful
      // ROLLBACK, so the connection is healthy and idle. Riding the pool here
      // (steamLinkForAccount is pool.query) would check out a SECOND connection
      // while this one is still held until the finally; two concurrent identical
      // reclaims drive the second into this catch, and ~10 concurrent conflicters
      // would then hold one connection each while waiting for another, exhausting
      // the shared max-10 pool (no connection timeout) and wedging the realm.
      const mine = await client.query('SELECT 1 FROM steam_links WHERE account_id = $1', [
        newAccountId,
      ]);
      return {
        result: mine.rows.length > 0 ? 'account_linked' : 'steam_taken',
        displacedAccountId: null,
      };
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Whether an account can still sign in WITHOUT its Steam link, and whether it
 *  holds any characters. Since Steam login (server/steam_login.ts), an account
 *  provisioned by a first Steam sign-in has NO other credential: no chosen
 *  password, no email to reset one with, no Discord or Apple link. Its
 *  steam_links row is then its only way in, so the link routes must never strip
 *  that row from an account that holds progress (unlink refuses, displacement
 *  refuses). An empty Steam-only account (no characters) may still be displaced:
 *  nothing is lost, and that is exactly the "I clicked Continue with Steam
 *  before linking my old account" path. */
/** A recovery email counts as another login only once VERIFIED: an
 *  unverified address cannot receive a reset the account owner can trust. */
const VERIFIED_EMAIL_SQL =
  "(COALESCE(btrim(a.email), '') <> '' AND a.email_verified_at IS NOT NULL)";

/** The same "another way in" predicate as steamLinkOwnerStanding, for the
 *  single-statement unlink below (alias a = accounts). */
const OTHER_LOGIN_SQL = `(a.password_set
  OR ${VERIFIED_EMAIL_SQL}
  OR EXISTS (SELECT 1 FROM discord_links d WHERE d.account_id = a.id)
  OR EXISTS (SELECT 1 FROM apple_auth_links l WHERE l.account_id = a.id))`;

/** How an unlink resolved: 'none' (no link, idempotent), 'deleted', or
 *  'last_login' (refused: the link is the account's only way in). */
export type SteamUnlinkResult = 'none' | 'deleted' | 'last_login';

/** Check-and-delete in ONE statement, so no concurrent change to the
 *  account's other logins can slip between the check and the delete. */
export async function deleteSteamLinkIfReachable(accountId: number): Promise<SteamUnlinkResult> {
  const res = await pool.query(
    `WITH had AS (SELECT 1 FROM steam_links WHERE account_id = $1),
          del AS (
            DELETE FROM steam_links s USING accounts a
             WHERE s.account_id = $1 AND a.id = s.account_id AND ${OTHER_LOGIN_SQL}
         RETURNING 1)
     SELECT (SELECT count(*) FROM had)::int AS had, (SELECT count(*) FROM del)::int AS deleted`,
    [accountId],
  );
  const row = res.rows[0] ?? { had: 0, deleted: 0 };
  if (Number(row.deleted) > 0) return 'deleted';
  return Number(row.had) > 0 ? 'last_login' : 'none';
}

export interface SteamLinkOwnerStanding {
  hasOtherLogin: boolean;
  hasCharacters: boolean;
}

export async function steamLinkOwnerStanding(accountId: number): Promise<SteamLinkOwnerStanding> {
  const res = await pool.query(
    `SELECT (a.password_set
             OR ${VERIFIED_EMAIL_SQL}
             OR EXISTS (SELECT 1 FROM discord_links d WHERE d.account_id = a.id)
             OR EXISTS (SELECT 1 FROM apple_auth_links l WHERE l.account_id = a.id)) AS has_other_login,
            EXISTS (SELECT 1 FROM characters c WHERE c.account_id = a.id) AS has_characters
       FROM accounts a WHERE a.id = $1`,
    [accountId],
  );
  const row = res.rows[0];
  // A vanished account has nothing to protect: read it as fully protected-free.
  if (!row) return { hasOtherLogin: true, hasCharacters: false };
  return {
    hasOtherLogin: row.has_other_login === true,
    hasCharacters: row.has_characters === true,
  };
}
