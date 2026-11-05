// Opt-in REAL-Postgres proof for the launch wipe (server/launch_wipe_db.ts):
// a seeded realm (accounts with cosmetics and Steam links, veteran characters
// with deeds, a market book, mail partitions, a guild bank, live leases) is
// dry-run, refused, then wiped, and every kept and cleared store is checked.
//
// DISPOSABLE DATABASE, NEVER A SHARED ONE (the account_wealth_pg_integration
// discipline): DROP and CREATE a private database on the server
// TEST_DATABASE_URL points at and boot the real ensureSchema() into it. Without
// TEST_DATABASE_URL the file skips green.

import type { Pool as PgPool } from 'pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const VERIFY_DB = 'wocc_launch_wipe_verify';
const REALM = 'WipeTest';

function verifyUrl(admin: string): string {
  const u = new URL(admin);
  u.pathname = `/${VERIFY_DB}`;
  return u.toString();
}
if (ADMIN_URL) process.env.DATABASE_URL = verifyUrl(ADMIN_URL);

const describeDb = ADMIN_URL ? describe : describe.skip;

describeDb('launch wipe against a seeded realm (REAL Postgres)', () => {
  let admin: PgPool;
  let pool: PgPool;
  let wipe: typeof import('../server/launch_wipe_db');
  let newborn: typeof import('../server/character_newborn');
  let ids: { veteran: number; fresh: number; other: number; account: number; guild: number };

  const fresh = (row: { cls: string; name: string }) =>
    newborn.initialCharacterState(row.cls as 'warrior', row.name, 0) as unknown as Record<
      string,
      unknown
    >;

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL, max: 1 });
    await admin.query(`DROP DATABASE IF EXISTS ${VERIFY_DB}`);
    await admin.query(`CREATE DATABASE ${VERIFY_DB}`);
    const db = await import('../server/db');
    await db.ensureSchema();
    pool = db.pool;
    wipe = await import('../server/launch_wipe_db');
    newborn = await import('../server/character_newborn');

    const acct = await pool.query(
      `INSERT INTO accounts (username, password_hash, cosmetics)
       VALUES ('veteran', 'x', '{"mechChromaIds":["gold"]}') RETURNING id`,
    );
    const account = Number(acct.rows[0].id);
    await pool.query('INSERT INTO steam_links (account_id, steam_id) VALUES ($1, $2)', [
      account,
      '76561198000000042',
    ]);
    const veteranState = {
      ...fresh({ cls: 'warrior', name: 'Veteran' }),
      level: 20,
      copper: 999999,
      deeds: { first_blood: '2026-10-01' },
      renown: 10,
      activeTitle: 'the Dauntless',
      skin: 2,
    };
    const mk = async (name: string, realm: string, level: number, state: unknown) =>
      Number(
        (
          await pool.query(
            `INSERT INTO characters (account_id, name, class, realm, level, state)
             VALUES ($1, $2, 'warrior', $3, $4, $5) RETURNING id`,
            [account, name, realm, level, JSON.stringify(state)],
          )
        ).rows[0].id,
      );
    const veteran = await mk('Veteran', REALM, 20, veteranState);
    const freshId = await mk('Newcomer', REALM, 1, fresh({ cls: 'warrior', name: 'Newcomer' }));
    const other = await mk('Elsewhere', 'OtherRealm', 15, { ...veteranState, level: 15 });
    await pool.query(
      `INSERT INTO character_deeds (realm, character_id, account_id, deed_id)
       VALUES ($1, $2, $3, 'first_blood')`,
      [REALM, veteran, account],
    );
    for (const key of [
      `market:${REALM}`,
      `mail:${REALM}`,
      `mail:${REALM}:r:veteran`,
      `rifts:${REALM}`,
      'market:OtherRealm',
    ]) {
      await pool.query(
        `INSERT INTO world_state (key, data, updated_at) VALUES ($1, '{"x":1}', now())`,
        [key],
      );
    }
    const g = await pool.query(
      `INSERT INTO guilds (name, realm) VALUES ('Wipers', $1) RETURNING id`,
      [REALM],
    );
    const guild = Number(g.rows[0].id);
    await pool.query(
      `INSERT INTO guild_banks (guild_id, realm, data) VALUES ($1, $2, '{"tabs":[]}')`,
      [guild, REALM],
    );
    ids = { veteran, fresh: freshId, other, account, guild };
  }, 60_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${VERIFY_DB}`).catch(() => undefined);
    await admin?.end();
  });

  it('dry run reports the plan and changes nothing but its audit row', async () => {
    const r = await wipe.runLaunchWipe(pool, {
      realm: REALM,
      operator: 'test',
      dryRun: true,
      freshStateFor: fresh,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.characters).toBe(2);
    expect(r.plan.confirmation).toBe(`WIPE ${REALM} 2 CHARACTERS`);
    const lvl = await pool.query('SELECT level FROM characters WHERE id = $1', [ids.veteran]);
    expect(lvl.rows[0].level).toBe(20);
  });

  it('refuses a live realm and a wrong confirmation', async () => {
    await pool.query(
      `INSERT INTO character_leases (character_id, realm, holder, nonce, expires_at)
       VALUES ($1, $2, 'proc', 'n', now() + interval '90 seconds')`,
      [ids.veteran, REALM],
    );
    const live = await wipe.runLaunchWipe(pool, {
      realm: REALM,
      operator: 'test',
      dryRun: false,
      confirmation: `WIPE ${REALM} 2 CHARACTERS`,
      freshStateFor: fresh,
    });
    expect(live).toMatchObject({ ok: false, reason: 'realm_live' });
    await pool.query('DELETE FROM character_leases');
    const wrong = await wipe.runLaunchWipe(pool, {
      realm: REALM,
      operator: 'test',
      dryRun: false,
      confirmation: `WIPE ${REALM} 3 CHARACTERS`,
      freshStateFor: fresh,
    });
    expect(wrong).toMatchObject({ ok: false, reason: 'confirmation_mismatch' });
  });

  it('wipes progress, keeps deeds, cosmetics, accounts and other realms, once', async () => {
    const r = await wipe.runLaunchWipe(pool, {
      realm: REALM,
      operator: 'test',
      dryRun: false,
      confirmation: `WIPE ${REALM} 2 CHARACTERS`,
      freshStateFor: fresh,
    });
    expect(r).toMatchObject({ ok: true, dryRun: false });

    const vet = await pool.query('SELECT level, state FROM characters WHERE id = $1', [
      ids.veteran,
    ]);
    expect(vet.rows[0].level).toBe(1);
    const st = vet.rows[0].state;
    expect(st.level).toBe(1);
    expect(st.copper).not.toBe(999999);
    expect(st.deeds).toEqual({ first_blood: '2026-10-01' });
    expect(st.renown).toBe(10);
    expect(st.activeTitle).toBe('the Dauntless');
    expect(st.skin).toBe(2);

    const other = await pool.query('SELECT level FROM characters WHERE id = $1', [ids.other]);
    expect(other.rows[0].level).toBe(15);

    const acct = await pool.query('SELECT cosmetics FROM accounts WHERE id = $1', [ids.account]);
    expect(acct.rows[0].cosmetics).toEqual({ mechChromaIds: ['gold'] });
    const link = await pool.query('SELECT steam_id FROM steam_links WHERE account_id = $1', [
      ids.account,
    ]);
    expect(link.rows[0].steam_id).toBe('76561198000000042');

    const keys = (await pool.query('SELECT key FROM world_state ORDER BY key')).rows.map(
      (row) => row.key,
    );
    expect(keys).toContain('market:OtherRealm');
    for (const gone of [
      `market:${REALM}`,
      `mail:${REALM}`,
      `mail:${REALM}:r:veteran`,
      `rifts:${REALM}`,
    ]) {
      expect(keys).not.toContain(gone);
    }
    const banks = await pool.query('SELECT count(*)::int AS n FROM guild_banks WHERE realm = $1', [
      REALM,
    ]);
    expect(banks.rows[0].n).toBe(0);
    const guild = await pool.query('SELECT count(*)::int AS n FROM guilds WHERE id = $1', [
      ids.guild,
    ]);
    expect(guild.rows[0].n).toBe(1);
    const deeds = await pool.query(
      'SELECT count(*)::int AS n FROM character_deeds WHERE character_id = $1',
      [ids.veteran],
    );
    expect(deeds.rows[0].n).toBe(1);

    const runs = await pool.query(
      'SELECT dry_run FROM launch_wipe_runs WHERE realm = $1 ORDER BY id',
      [REALM],
    );
    expect(runs.rows.map((row) => row.dry_run)).toEqual([true, false]);

    const again = await wipe.runLaunchWipe(pool, {
      realm: REALM,
      operator: 'test',
      dryRun: false,
      confirmation: `WIPE ${REALM} 2 CHARACTERS`,
      freshStateFor: fresh,
    });
    expect(again).toMatchObject({ ok: false, reason: 'already_wiped' });
  });
});
