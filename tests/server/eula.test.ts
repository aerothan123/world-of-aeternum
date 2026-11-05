// EULA acceptance API (server/eula.ts): per-account, versioned, current-only.

process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_eula_units';

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/eula_db', async (importOriginal) => ({
  ACCOUNT_EULA_SCHEMA: (await importOriginal<typeof import('../../server/eula_db')>())
    .ACCOUNT_EULA_SCHEMA,
  acceptedEulaVersion: vi.fn(async () => null),
  recordEulaAcceptance: vi.fn(async () => {}),
}));

import { routes } from '../../server/eula';
import { ACCOUNT_EULA_SCHEMA, acceptedEulaVersion, recordEulaAcceptance } from '../../server/eula_db';
import { EULA_VERSION } from '../../src/legal_versions';
import { type FakeRes, fakeCtx } from './helpers';

const readMock = vi.mocked(acceptedEulaVersion);
const writeMock = vi.mocked(recordEulaAcceptance);

function handler(method: 'GET' | 'POST') {
  const route = routes.find((r) => r.method === method);
  if (!route) throw new Error(`no ${method} route`);
  return route.handler;
}

function captured(ctx: ReturnType<typeof fakeCtx>): { status: number; body: unknown } {
  const res = ctx.res as unknown as FakeRes;
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
}

afterEach(() => {
  readMock.mockReset();
  readMock.mockImplementation(async () => null);
  writeMock.mockClear();
});

describe('eula route table', () => {
  it('a read-tier GET and a mutation-tier POST, both authenticated', () => {
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/eula',
      'POST /api/eula/accept',
    ]);
    expect(routes[0].middleware).toHaveLength(1);
    expect(routes[1].middleware).toHaveLength(2);
    const src = readFileSync(new URL('../../server/eula.ts', import.meta.url), 'utf8');
    expect(src).toContain("const readAccount = requireAccount({ scope: 'read' });");
    expect(src).toContain("const activeAccount = requireAccount({ scope: 'active' });");
  });

  it('the table is one row per account and goes with the account', () => {
    expect(ACCOUNT_EULA_SCHEMA).toContain('account_id INT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE');
  });
});

describe('GET /api/eula', () => {
  it('reports the current version and the AUTHENTICATED account record', async () => {
    readMock.mockImplementation(async () => '2025-01-01-old');
    const ctx = fakeCtx({ method: 'GET', account: { accountId: 9, scope: 'read' } });
    await handler('GET')(ctx);
    expect(readMock).toHaveBeenCalledWith(9);
    expect(captured(ctx)).toEqual({
      status: 200,
      body: { current: EULA_VERSION, accepted: '2025-01-01-old' },
    });
  });
});

describe('POST /api/eula/accept', () => {
  it('records the current version for the authenticated account', async () => {
    const ctx = fakeCtx({
      method: 'POST',
      account: { accountId: 9, scope: 'full' },
      body: { version: EULA_VERSION },
    });
    await handler('POST')(ctx);
    expect(writeMock).toHaveBeenCalledWith(9, EULA_VERSION);
    expect(captured(ctx)).toEqual({ status: 200, body: { accepted: EULA_VERSION } });
  });

  it('refuses a stale or malformed version without writing', async () => {
    for (const version of ['2025-01-01-old', 'junk', 7, undefined]) {
      const ctx = fakeCtx({
        method: 'POST',
        account: { accountId: 9, scope: 'full' },
        body: { version },
      });
      await expect(handler('POST')(ctx)).rejects.toMatchObject({
        status: 400,
        code: 'validation.failed',
      });
    }
    expect(writeMock).not.toHaveBeenCalled();
  });
});
