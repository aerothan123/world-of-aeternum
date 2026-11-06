// Realm process heartbeat + the launch wipe's boot fence.
//
// The launch wipe (server/launch_wipe_db.ts) must only ever run against a
// STOPPED realm: a live process holds the World Market, mail and character
// state in memory and would save it back over a wiped row. Character leases
// only prove players are online, not that the process is down, so each realm
// process also stamps one heartbeat row (realm_process_heartbeats, one row
// per realm, bounded by the realm count: no retention job needed).
//
// The fence, race-free by ordering:
//   - the SERVER, at boot, writes its first heartbeat and only THEN try-locks
//     the wipe's advisory key (launchWipeLockSql); a held key means a wipe is
//     running, and the boot refuses;
//   - the WIPE takes that advisory key first (pg_advisory_xact_lock) and only
//     THEN reads the heartbeat; a fresh one refuses the wipe.
// Whichever side reaches the shared step second sees the first's mark, so a
// wipe and a booting server can never both proceed. The beat repeats every
// HEARTBEAT_INTERVAL_MS; a wipe treats a beat younger than
// HEARTBEAT_STALE_SECONDS as a live process (wait that long after a stop).

import type { Pool } from 'pg';

export const REALM_HEARTBEAT_SCHEMA = `
CREATE TABLE IF NOT EXISTS realm_process_heartbeats (
  realm TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  beat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_STALE_SECONDS = 120;

/** The advisory key the wipe holds for its whole transaction. One SQL
 *  expression shared by both sides so they can never hash different keys. */
export const LAUNCH_WIPE_LOCK_KEY_SQL = "hashtext('launch_wipe:' || $1)";

export async function beatRealmHeartbeat(pool: Pool, realm: string, holder: string): Promise<void> {
  await pool.query(
    `INSERT INTO realm_process_heartbeats (realm, holder, beat_at) VALUES ($1, $2, now())
     ON CONFLICT (realm) DO UPDATE SET holder = EXCLUDED.holder, beat_at = now()`,
    [realm, holder],
  );
}

/** Boot: stamp the first beat, refuse when a launch wipe holds the realm's
 *  key, then keep beating. Returns the stop function (tests). */
export async function startRealmHeartbeat(
  pool: Pool,
  realm: string,
  holder: string,
  opts: { intervalMs?: number } = {},
): Promise<() => void> {
  await pool.query(REALM_HEARTBEAT_SCHEMA);
  await beatRealmHeartbeat(pool, realm, holder);
  // The xact variant in an autocommit statement takes and drops the key at
  // statement end: it only asks "is a wipe holding it right now".
  const res = await pool.query(
    `SELECT pg_try_advisory_xact_lock(${LAUNCH_WIPE_LOCK_KEY_SQL}) AS free`,
    [realm],
  );
  if (res.rows[0]?.free !== true) {
    throw new Error(
      `refusing to boot: a launch wipe of realm ${realm} is running (scripts/launch_wipe.ts). Wait for it to finish.`,
    );
  }
  const timer = setInterval(() => {
    void beatRealmHeartbeat(pool, realm, holder).catch((err) =>
      console.error('[heartbeat] realm heartbeat write failed', err),
    );
  }, opts.intervalMs ?? HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
