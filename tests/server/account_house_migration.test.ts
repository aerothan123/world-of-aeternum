// One house per ACCOUNT: the boot consolidation (server/account_house_migration.ts)
// against an in-memory fake of the three tables it reads and writes. Pins the
// migration-safety contract: lossless (audit row with the whole original before
// the clear, every item conserved in the kept house), idempotent (a second boot
// changes nothing), never racing a live save (a leased account is skipped and
// retried), one transaction per account, and the join-time holder lookup.
import { describe, expect, it } from 'vitest';
import { houseItemTotal } from '../../server/account_house_merge';
import {
  ACCOUNT_HOUSE_MIGRATION_SCHEMA,
  accountHouseForJoin,
  annotateAccountHouse,
  migrateAccountHouses,
  upsertAccountHouseFromSave,
} from '../../server/account_house_migration';

interface Char {
  id: number;
  account_id: number;
  realm: string;
  name: string;
  state: Record<string, unknown>;
}

/** A tiny fake of characters + character_leases + account_house_migrations,
 *  answering exactly the statements the module sends (matched by shape). */
class FakeDb {
  chars: Char[] = [];
  leases: { character_id: number; live: boolean }[] = [];
  audit: Record<string, unknown>[] = [];
  /** account_houses, keyed `${account}:${realm}`. */
  accountHouses = new Map<string, unknown>();
  log: string[] = [];
  private snapshot: string | null = null;

  async query(text: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    const sql = text.replace(/\s+/g, ' ').trim();
    this.log.push(sql.split(' ').slice(0, 3).join(' '));
    if (sql === 'BEGIN') {
      this.snapshot = JSON.stringify([this.chars, this.audit, [...this.accountHouses]]);
      return { rows: [] };
    }
    if (sql === 'COMMIT') {
      this.snapshot = null;
      return { rows: [] };
    }
    if (sql === 'ROLLBACK') {
      if (this.snapshot) {
        const [chars, audit, rows] = JSON.parse(this.snapshot);
        this.chars = chars;
        this.audit = audit;
        this.accountHouses = new Map(rows);
      }
      this.snapshot = null;
      return { rows: [] };
    }
    if (sql.startsWith('SET LOCAL') || sql.includes('pg_advisory')) return { rows: [] };
    const has = (c: Char) => Object.hasOwn(c.state, 'house');
    const owned = (account: unknown, realm: unknown) =>
      this.accountHouses.has(`${account}:${realm}`);
    const multi = (realm: unknown) => {
      const counts = new Map<number, number>();
      for (const c of this.chars) {
        if (c.realm === realm && has(c))
          counts.set(c.account_id, (counts.get(c.account_id) ?? 0) + 1);
      }
      return counts;
    };
    if (sql.startsWith('INSERT INTO account_houses (account_id, realm, house) SELECT DISTINCT ON')) {
      const counts = multi(params[0]);
      for (const c of [...this.chars].sort((a, b) => a.id - b.id)) {
        if (c.realm !== params[0] || !has(c) || (counts.get(c.account_id) ?? 0) > 1) continue;
        if (!owned(c.account_id, c.realm)) {
          this.accountHouses.set(`${c.account_id}:${c.realm}`, structuredClone(c.state.house));
        }
      }
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO account_houses (account_id, realm, house) VALUES')) {
      this.accountHouses.set(`${params[0]}:${params[1]}`, JSON.parse(params[2] as string));
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO account_houses (account_id, realm, house, updated_at)')) {
      const c = this.chars.find((x) => x.id === params[0])!;
      this.accountHouses.set(`${c.account_id}:${c.realm}`, JSON.parse(params[1] as string));
      return { rows: [] };
    }
    if (sql.startsWith('SELECT house FROM account_houses')) {
      const row = this.accountHouses.get(`${params[0]}:${params[1]}`);
      return { rows: row === undefined ? [] : [{ house: structuredClone(row) }] };
    }
    if (sql.startsWith('SELECT c.account_id FROM characters c')) {
      const counts = multi(params[0]);
      return {
        rows: [...counts]
          .filter(([account, n]) => n > 1 && !owned(account, params[0]))
          .map(([account_id]) => ({ account_id }))
          .sort((a, b) => a.account_id - b.account_id),
      };
    }
    if (sql.startsWith('SELECT 1 FROM character_leases')) {
      const ids = new Set(this.chars.filter((c) => c.account_id === params[0]).map((c) => c.id));
      return { rows: this.leases.filter((l) => l.live && ids.has(l.character_id)).map(() => ({})) };
    }
    if (sql.startsWith("SELECT id, state->'house'")) {
      return {
        rows: this.chars
          .filter((c) => c.account_id === params[0] && c.realm === params[1] && has(c))
          .sort((a, b) => a.id - b.id)
          .map((c) => ({ id: c.id, house: structuredClone(c.state.house) })),
      };
    }
    if (sql.startsWith('INSERT INTO account_house_migrations')) {
      const [character_id, account_id, realm, kept_character_id, original_house, moved_slots] =
        params;
      this.audit.push({
        character_id,
        account_id,
        realm,
        kept_character_id,
        original_house: JSON.parse(original_house as string),
        moved_slots,
      });
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE characters SET state = state - 'house'")) {
      const c = this.chars.find((x) => x.id === params[0])!;
      delete c.state.house;
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE characters SET state = jsonb_set(state, '{house}'")) {
      const c = this.chars.find((x) => x.id === params[0])!;
      c.state.house = JSON.parse(params[1] as string);
      return { rows: [] };
    }
    if (sql.startsWith("SELECT state->'house' AS house FROM characters")) {
      const [account, realm, self] = params;
      const row = this.chars
        .filter((c) => c.account_id === account && c.realm === realm && has(c))
        .sort((a, b) => Number(b.id === self) - Number(a.id === self) || a.id - b.id)[0];
      return { rows: row ? [{ house: structuredClone(row.state.house) }] : [] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }
}

const furnished = (n: number) =>
  Object.fromEntries(
    ['hearth_floor_1', 'hearth_floor_2', 'hearth_floor_3']
      .slice(0, n)
      .map((a) => [a, 'furn_barrel']),
  );

function seeded(): FakeDb {
  const db = new FakeDb();
  db.chars = [
    // Account 1: three characters, three houses. Char 12 is the most furnished.
    {
      id: 11,
      account_id: 1,
      realm: 'r1',
      name: 'Aster',
      state: {
        level: 9,
        house: {
          lot: 'eastbrook_quay_cottage',
          boughtDay: '2026-10-01',
          furniture: furnished(1),
          storage: [{ itemId: 'copper_ore', count: 7 }],
        },
      },
    },
    {
      id: 12,
      account_id: 1,
      realm: 'r1',
      name: 'Bryn',
      state: {
        level: 14,
        house: {
          lot: 'fenbridge_warden_gatehouse',
          boughtDay: '2026-10-05',
          furniture: furnished(3),
        },
      },
    },
    {
      id: 13,
      account_id: 1,
      realm: 'r1',
      name: 'Corin',
      state: {
        level: 3,
        house: { lot: 'highwatch_watch_house', storage: [{ itemId: 'x', count: 2 }] },
      },
    },
    // Account 1 on another realm: its own economy, untouched.
    {
      id: 14,
      account_id: 1,
      realm: 'r2',
      name: 'Dell',
      state: { house: { lot: 'eastbrook_quay_cottage' } },
    },
    // Account 2: one house, untouched.
    {
      id: 21,
      account_id: 2,
      realm: 'r1',
      name: 'Esk',
      state: { house: { lot: 'eastbrook_quay_cottage' } },
    },
    { id: 22, account_id: 2, realm: 'r1', name: 'Fay', state: { level: 2 } },
    // Account 3: two houses, but one character is online (live lease).
    {
      id: 31,
      account_id: 3,
      realm: 'r1',
      name: 'Gil',
      state: { house: { lot: 'eastbrook_quay_cottage' } },
    },
    {
      id: 32,
      account_id: 3,
      realm: 'r1',
      name: 'Hob',
      state: { house: { lot: 'fenbridge_warden_gatehouse' } },
    },
  ];
  db.leases = [{ character_id: 32, live: true }];
  return db;
}

describe('migrateAccountHouses', () => {
  it('ships additive, idempotent DDL', () => {
    expect(ACCOUNT_HOUSE_MIGRATION_SCHEMA).toMatch(
      /CREATE TABLE IF NOT EXISTS account_house_migrations/,
    );
    expect(ACCOUNT_HOUSE_MIGRATION_SCHEMA).toMatch(/CREATE INDEX IF NOT EXISTS/);
    expect(ACCOUNT_HOUSE_MIGRATION_SCHEMA).not.toMatch(/DROP|ALTER/);
  });

  it('keeps the most-furnished house, releases the rest losslessly, and audits first', async () => {
    const db = seeded();
    const total = [11, 12, 13].reduce(
      (n, id) => n + houseItemTotal(db.chars.find((c) => c.id === id)!.state.house),
      0,
    );
    const originals = Object.fromEntries(
      [11, 13].map((id) => [id, structuredClone(db.chars.find((c) => c.id === id)!.state.house)]),
    );
    const report = await migrateAccountHouses(db as never, 'r1');
    expect(report).toEqual({ accounts: 1, released: 2, movedSlots: 3, skippedLeased: 1 });
    const byId = (id: number) => db.chars.find((c) => c.id === id)!;
    expect(byId(11).state.house).toBeUndefined();
    expect(byId(13).state.house).toBeUndefined();
    expect(byId(11).state.level).toBe(9); // the rest of the blob is untouched
    expect(houseItemTotal(byId(12).state.house)).toBe(total);
    expect(db.audit.map((a) => [a.character_id, a.kept_character_id])).toEqual([
      [11, 12],
      [13, 12],
    ]);
    expect(db.audit[0].original_house).toEqual(originals[11]);
    expect(db.audit[1].original_house).toEqual(originals[13]);
    // Other realm, single-house account and the leased account are untouched.
    expect(byId(14).state.house).toEqual({ lot: 'eastbrook_quay_cottage' });
    expect(byId(21).state.house).toEqual({ lot: 'eastbrook_quay_cottage' });
    expect(byId(31).state.house).toBeDefined();
    expect(byId(32).state.house).toBeDefined();
  });

  it('is idempotent at boot and picks up a leased account once it is free', async () => {
    const db = seeded();
    await migrateAccountHouses(db as never, 'r1');
    const after = JSON.stringify([db.chars, db.audit]);
    const again = await migrateAccountHouses(db as never, 'r1');
    expect(again).toEqual({ accounts: 0, released: 0, movedSlots: 0, skippedLeased: 1 });
    expect(JSON.stringify([db.chars, db.audit])).toBe(after);
    db.leases = [];
    const third = await migrateAccountHouses(db as never, 'r1');
    expect(third.accounts).toBe(1);
    expect(db.chars.filter((c) => c.account_id === 3 && c.state.house)).toHaveLength(1);
    expect(await migrateAccountHouses(db as never, 'r1')).toEqual({
      accounts: 0,
      released: 0,
      movedSlots: 0,
      skippedLeased: 0,
    });
  });

  it('rolls back the whole account when a write fails', async () => {
    const db = seeded();
    db.leases = [];
    const real = db.query.bind(db);
    db.query = async (text: string, params?: unknown[]) => {
      if (text.includes('jsonb_set')) throw new Error('boom');
      return real(text, params);
    };
    await expect(migrateAccountHouses(db as never, 'r1')).rejects.toThrow('boom');
    expect(
      db.chars.filter((c) => c.account_id === 1 && c.realm === 'r1' && c.state.house),
    ).toHaveLength(3);
    expect(db.audit).toEqual([]);
  });
});

describe('the account-owned house', () => {
  it('makes every account left with one house account-owned at boot', async () => {
    const db = seeded();
    await migrateAccountHouses(db as never, 'r1');
    expect(db.accountHouses.get('1:r1')).toEqual(db.chars.find((c) => c.id === 12)!.state.house);
    expect(db.accountHouses.get('2:r1')).toEqual({ lot: 'eastbrook_quay_cottage' });
    expect(db.accountHouses.has('3:r1')).toBe(false); // leased: still two houses
    expect(db.accountHouses.has('1:r2')).toBe(false); // another realm's boot
  });

  it('never re-merges the copies the shared house leaves in every blob', async () => {
    const db = seeded();
    db.leases = [];
    await migrateAccountHouses(db as never, 'r1');
    const shared = structuredClone(db.accountHouses.get('1:r1'));
    // Every character of the account has since joined and saved a copy.
    for (const c of db.chars.filter((x) => x.account_id === 1 && x.realm === 'r1')) {
      c.state.house = structuredClone(shared);
    }
    const before = JSON.stringify([db.chars, db.audit]);
    const report = await migrateAccountHouses(db as never, 'r1');
    expect(report.accounts).toBe(0);
    expect(JSON.stringify([db.chars, db.audit])).toBe(before);
    expect(db.accountHouses.get('1:r1')).toEqual(shared);
  });

  it('gives a joining alt the account house and its key; a failed read gives no key', async () => {
    const db = seeded();
    db.leases = [];
    await migrateAccountHouses(db as never, 'r1');
    const lookup = (a: number, c: number) => accountHouseForJoin(db as never, a, 'r1', c);
    const alt = { id: 22, state: { level: 2 } as Record<string, unknown> };
    await annotateAccountHouse(lookup, 2, alt);
    expect(alt.state.house).toEqual({ lot: 'eastbrook_quay_cottage' });
    expect(alt.state.accountHouseKey).toBe('acct:2');
    // Before any account row exists, the oldest saved house is the old-shape fallback.
    const fresh = seeded();
    expect(await accountHouseForJoin(fresh as never, 2, 'r1', 22)).toEqual({
      house: { lot: 'eastbrook_quay_cottage' },
    });
    const failing = { id: 22, state: { accountHouseKey: 'acct:2' } as Record<string, unknown> };
    await annotateAccountHouse(
      async () => {
        throw new Error('db down');
      },
      2,
      failing,
    );
    expect(failing.state.accountHouseKey).toBeUndefined();
  });

  it('writes the shared house in the save transaction only for an account-house save', async () => {
    const db = seeded();
    const house = { lot: 'eastbrook_quay_cottage', storage: [{ itemId: 'copper_ore', count: 3 }] };
    const plain = JSON.stringify({ level: 2, house });
    expect(await upsertAccountHouseFromSave(db as never, 22, plain)).toBe(false);
    expect(db.accountHouses.has('2:r1')).toBe(false);
    const marked = JSON.stringify({ level: 2, house, accountHouseKey: 'acct:2' });
    expect(await upsertAccountHouseFromSave(db as never, 22, marked)).toBe(true);
    expect(db.accountHouses.get('2:r1')).toEqual(house);
    const noHouse = JSON.stringify({ level: 2, accountHouseKey: 'acct:2' });
    expect(await upsertAccountHouseFromSave(db as never, 22, noHouse)).toBe(false);
  });
});
