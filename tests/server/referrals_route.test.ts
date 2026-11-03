// Unit coverage for GET /api/referrals (server/card_routes.ts): the referral
// count + card slug read behind the shared activeGuard. Recovered from the
// retired wallet-route suite when the wallet surface left the game; the card
// upload route has its own suite (tests/server/card_route.test.ts).
//
// server/db.ts builds a pg Pool at module load and throws if DATABASE_URL is
// unset, so set a dummy URL. The pool never connects: the guard's db reads are
// a fake supplied via setCardDbForTests, and the referral reads are mocked.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_referrals_route_units';

import { readFileSync } from 'node:fs';
import type * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetCardDbForTests, routes, setCardDbForTests } from '../../server/card_routes';
import type { AccountModerationStatus } from '../../server/db';
import { compose } from '../../server/http/compose';
import { withErrors } from '../../server/http/middleware/with_errors';
import type { Method, Middleware } from '../../server/http/types';
import { type FakeRes, fakeCtx, stableStringify } from './helpers';

vi.mock('../../server/db', async (importActual) => {
  const actual = await importActual<typeof import('../../server/db')>();
  return {
    ...actual,
    referralCountForAccount: vi.fn(async () => 3),
    primarySlugForAccount: vi.fn(async () => 'abc'),
  };
});

const BEARER = `Bearer ${'a'.repeat(64)}`;

/** A not-locked moderation status (the AccountModerationStatus happy-path shape). */
function modStatus(): AccountModerationStatus {
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

function routeFor(method: Method, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`no route ${method} ${path}`);
  return route;
}

/** Load a characterization golden (status + raw body string) by its main-surface name. */
function fixture(name: string): { status: number; body: string } {
  const url = new URL(`./fixtures/main/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** Drive the full route chain (its real middleware + handler) under withErrors. */
async function runRoute(method: Method, path: string, headers: Record<string, string> = {}) {
  const route = routeFor(method, path);
  let reached = false;
  const terminal: Middleware = async (c) => {
    reached = true;
    await route.handler(c);
  };
  const ctx = fakeCtx({ method, url: path, headers });
  await compose([withErrors({ surface: 'problem+json' }), ...(route.middleware ?? []), terminal])(
    ctx,
  );
  const fake = ctx.res as unknown as FakeRes & http.ServerResponse;
  return {
    reached,
    status: fake.statusCode,
    raw: fake.body,
    body: fake.body ? JSON.parse(fake.body) : undefined,
    contentType: fake.headers['content-type'] as string | undefined,
  };
}

afterEach(() => {
  resetCardDbForTests();
  vi.restoreAllMocks();
});

describe('GET /api/referrals (activeGuard)', () => {
  it('mounts exactly the shared active guard', () => {
    expect(routeFor('GET', '/api/referrals').middleware).toHaveLength(1);
  });

  it('401s a request with no bearer, byte-identical to the golden fixture', async () => {
    const r = await runRoute('GET', '/api/referrals');
    const fx = fixture('referrals_get_noauth_401');
    expect(r.status).toBe(fx.status);
    // The golden body canonicalizes key order; canonicalize the raw emit the same way.
    expect(stableStringify(JSON.parse(r.raw))).toBe(fx.body);
    expect(r.contentType).toBe('application/json');
    // A missing bearer short-circuits at the guard: the handler never runs.
    expect(r.reached).toBe(false);
  });

  it('200s { count, slug } for a full bearer + passing guard seam', async () => {
    setCardDbForTests({
      accountAndScopeForToken: async () => ({ accountId: 7, scope: 'full' as const }),
      moderationStatusForAccount: async () => modStatus(),
    });
    const r = await runRoute('GET', '/api/referrals', { authorization: BEARER });
    expect(r.reached).toBe(true);
    expect(r.status).toBe(200);
    expect(r.contentType).toBe('application/json');
    expect(r.body).toEqual({ count: 3, slug: 'abc' });
  });
});
