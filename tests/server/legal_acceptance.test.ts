process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_new_endpoint_scaffold';

import type * as http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../server/http/compose';
import { HttpError } from '../../server/http/errors';
import {
  type LegalAcceptanceDb,
  resetLegalAcceptanceDbForTests,
  routes,
  setLegalAcceptanceDbForTests,
} from '../../server/legal_acceptance';
import { CURRENT_LEGAL_VERSIONS } from '../../src/legal_versions';
import { fakeCtx } from './helpers/fake_ctx';

interface FakeResShape {
  statusCode: number;
  body: string;
}

function captured(res: http.ServerResponse): { status: number; body: unknown } {
  const fake = res as unknown as FakeResShape;
  return { status: fake.statusCode, body: fake.body ? JSON.parse(fake.body) : undefined };
}

const getRoute = routes.find((r) => r.method === 'GET');
const postRoute = routes.find((r) => r.method === 'POST');
if (!getRoute || !postRoute) throw new Error('legal-acceptance routes missing');

function fakeDb(initial: Record<string, string | null> | null = null): {
  db: LegalAcceptanceDb;
  writes: Array<{ accountId: number; versions: unknown }>;
} {
  const writes: Array<{ accountId: number; versions: unknown }> = [];
  const db: LegalAcceptanceDb = {
    accepted: async () => (initial as never) ?? null,
    record: async (accountId, versions) => {
      writes.push({ accountId, versions });
    },
  };
  return { db, writes };
}

afterEach(() => resetLegalAcceptanceDbForTests());

describe('GET /api/legal-acceptance', () => {
  it('reports the server versions and null when the account never accepted', async () => {
    setLegalAcceptanceDbForTests(fakeDb(null).db);
    const ctx = fakeCtx({ account: { accountId: 7, scope: 'full' } });
    await getRoute.handler(ctx);
    expect(captured(ctx.res)).toEqual({
      status: 200,
      body: { current: CURRENT_LEGAL_VERSIONS, accepted: null },
    });
  });

  it('echoes what the account accepted so the client can diff it', async () => {
    const old = { terms: '2025-01-01-old', privacy: CURRENT_LEGAL_VERSIONS.privacy, eula: null };
    setLegalAcceptanceDbForTests(fakeDb(old).db);
    const ctx = fakeCtx({ account: { accountId: 7, scope: 'read' } });
    await getRoute.handler(ctx);
    expect(captured(ctx.res).body).toEqual({ current: CURRENT_LEGAL_VERSIONS, accepted: old });
  });
});

describe('POST /api/legal-acceptance', () => {
  it('records the current versions for the authenticated account only', async () => {
    const { db, writes } = fakeDb();
    setLegalAcceptanceDbForTests(db);
    const ctx = fakeCtx({
      method: 'POST',
      account: { accountId: 42, scope: 'full' },
      body: { ...CURRENT_LEGAL_VERSIONS, accountId: 1 },
    });
    await postRoute.handler(ctx);
    expect(captured(ctx.res)).toEqual({ status: 200, body: { accepted: CURRENT_LEGAL_VERSIONS } });
    expect(writes).toEqual([{ accountId: 42, versions: CURRENT_LEGAL_VERSIONS }]);
  });

  it('refuses a stale version with legal_acceptance.invalid_input and writes nothing', async () => {
    const { db, writes } = fakeDb();
    setLegalAcceptanceDbForTests(db);
    const ctx = fakeCtx({
      method: 'POST',
      account: { accountId: 42, scope: 'full' },
      body: { ...CURRENT_LEGAL_VERSIONS, terms: '2020-01-01-old' },
    });
    await postRoute.handler(ctx);
    const out = captured(ctx.res);
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: 'legal_acceptance.invalid_input' });
    expect(writes).toEqual([]);
  });

  it('rejects a missing or malformed document token as validation.failed', async () => {
    setLegalAcceptanceDbForTests(fakeDb().db);
    for (const body of [null, [], 'x', { terms: 'x' }, { ...CURRENT_LEGAL_VERSIONS, eula: 5 }]) {
      const ctx = fakeCtx({ method: 'POST', account: { accountId: 1, scope: 'full' }, body });
      await expect(postRoute.handler(ctx)).rejects.toMatchObject({
        status: 400,
        code: 'validation.failed',
      });
    }
  });

  it('cannot run without an authenticated account (no body-supplied identity)', async () => {
    setLegalAcceptanceDbForTests(fakeDb().db);
    const ctx = fakeCtx({ method: 'POST', body: { ...CURRENT_LEGAL_VERSIONS } });
    await expect(postRoute.handler(ctx)).rejects.toBeInstanceOf(HttpError);
  });
});

describe('auth wiring', () => {
  it('401s both routes without a bearer token before any handler or db access', async () => {
    setLegalAcceptanceDbForTests({
      accepted: async () => {
        throw new Error('db must not be reached');
      },
      record: async () => {
        throw new Error('db must not be reached');
      },
    });
    for (const route of [getRoute, postRoute]) {
      const ctx = fakeCtx({ method: route.method, body: { ...CURRENT_LEGAL_VERSIONS } });
      await expect(
        compose([...(route.middleware ?? [])])(ctx, async () => {
          await route.handler(ctx);
        }),
      ).rejects.toMatchObject({ status: 401, code: 'auth.token_missing' });
    }
  });

  it('puts the mutation on the active tier and the read on the read tier', () => {
    expect(getRoute.middleware?.length).toBe(1);
    expect(postRoute.middleware?.length).toBe(2);
    expect(getRoute.surface).toBe('api');
    expect(postRoute.surface).toBe('api');
  });
});
