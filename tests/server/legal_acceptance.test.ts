process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_new_endpoint_scaffold';

import type * as http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../server/http/compose';
import { fakeCtx } from './helpers';
import { resetLegalAcceptanceDbForTests, routes, setLegalAcceptanceDbForTests } from '../../server/legal_acceptance';

interface FakeResShape {
  statusCode: number;
  body: string;
}

function captured(res: http.ServerResponse): { status: number; body: unknown } {
  const fake = res as unknown as FakeResShape;
  return { status: fake.statusCode, body: fake.body ? JSON.parse(fake.body) : undefined };
}

// Full AccountModerationStatus fixtures for the guard's moderation gate.
function okStatus() {
  return {
    locked: false,
    banned: false,
    suspendedUntil: null,
    reason: '',
    message: '',
    chatMutedUntil: null,
    chatStrikes: 0,
  };
}
function bannedStatus() {
  return {
    locked: true,
    banned: true,
    suspendedUntil: null,
    reason: 'banned',
    message: 'This account has been banned.',
    chatMutedUntil: null,
    chatStrikes: 0,
  };
}

const VALID_BEARER = `Bearer ${'a'.repeat(64)}`;

function runRoute(ctx: Parameters<(typeof routes)[0]['handler']>[0]): Promise<void> {
  const route = routes[0];
  return compose([...(route.middleware ?? [])])(ctx, async () => {
    await route.handler(ctx);
  });
}

afterEach(() => resetLegalAcceptanceDbForTests());

describe('legal_acceptance authenticated route', () => {
  it('serves the happy path for an authenticated caller', async () => {
    setLegalAcceptanceDbForTests({ accountAndScopeForToken: async () => ({ accountId: 1, scope: 'full' }), moderationStatusForAccount: async () => okStatus() });
    const ctx = fakeCtx({ method: 'POST', url: '/api/legal-acceptance', headers: { authorization: VALID_BEARER }, body: { name: 'Widget' } });
    await runRoute(ctx);
    expect(captured(ctx.res).status).toBe(200);
  });

  it('rejects invalid input with legal_acceptance.invalid_input', async () => {
    setLegalAcceptanceDbForTests({ accountAndScopeForToken: async () => ({ accountId: 1, scope: 'full' }), moderationStatusForAccount: async () => okStatus() });
    const ctx = fakeCtx({ method: 'POST', url: '/api/legal-acceptance', headers: { authorization: VALID_BEARER }, body: { name: ' ' } });
    await runRoute(ctx);
    expect(captured(ctx.res)).toEqual({ status: 400, body: { error: 'invalid input', code: 'legal_acceptance.invalid_input' } });
  });

  it('401s without a bearer token', async () => {
    const ctx = fakeCtx({ method: 'POST', url: '/api/legal-acceptance', body: { name: 'Widget' } });
    await runRoute(ctx);
    expect(captured(ctx.res).status).toBe(401);
  });

  it('403s a banned account (moderation gate)', async () => {
    setLegalAcceptanceDbForTests({ accountAndScopeForToken: async () => ({ accountId: 1, scope: 'full' }), moderationStatusForAccount: async () => bannedStatus() });
    const ctx = fakeCtx({ method: 'POST', url: '/api/legal-acceptance', headers: { authorization: VALID_BEARER }, body: { name: 'Widget' } });
    await runRoute(ctx);
    expect(captured(ctx.res).status).toBe(403);
  });

  it('403s a read-only token on this mutating route (scope gate)', async () => {
    setLegalAcceptanceDbForTests({ accountAndScopeForToken: async () => ({ accountId: 1, scope: 'read' }), moderationStatusForAccount: async () => okStatus() });
    const ctx = fakeCtx({ method: 'POST', url: '/api/legal-acceptance', headers: { authorization: VALID_BEARER }, body: { name: 'Widget' } });
    await runRoute(ctx);
    expect(captured(ctx.res)).toEqual({ status: 403, body: { error: 'this token is read-only', code: 'auth.forbidden' } });
  });
});
