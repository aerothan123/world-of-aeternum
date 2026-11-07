// Early Access store gating, server side: with the Claudium or membership
// switch off, every store, membership and cosmetic-shop route rejects with the
// stable `store.disabled` code before auth, rate limits or the economy service
// run, on BOTH the RouteDef arm and the legacy /api/claudium prefix arm.

import { readFileSync } from 'node:fs';
import type * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../server/http/error_codes';
import { API_ERROR_KEYS } from '../../src/ui/api_error_i18n';
import { type FakeRes, fakeCtx } from './helpers';

function captured(res: http.ServerResponse): { status: number; body: unknown } {
  const fake = res as unknown as FakeRes;
  return { status: fake.statusCode, body: fake.body ? JSON.parse(fake.body) : undefined };
}

async function loadClaudium(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v ?? '');
  return import('../../server/claudium');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('store.disabled', () => {
  it('is an appended catalog code with a client key', () => {
    expect(ERROR_CODES['store.disabled']).toEqual({ params: [] });
    expect((API_ERROR_KEYS as Record<string, string>)['store.disabled']).toBe(
      'apiError.store.disabled',
    );
  });

  it('every /api/claudium route rejects on a realm with the store off', async () => {
    const { routes } = await loadClaudium({ CLAUDIUM_ENABLED: '', MEMBERSHIP_ENABLED: '' });
    expect(routes.length).toBeGreaterThan(10);
    for (const route of routes) {
      const gate = route.middleware?.[0];
      expect(gate, route.path).toBeTypeOf('function');
      const ctx = fakeCtx({ method: route.method, url: route.path.replace(':rail', 'card') });
      let reached = false;
      await gate!(ctx, async () => {
        reached = true;
      });
      expect(reached, route.path).toBe(false);
      expect(captured(ctx.res), route.path).toEqual({
        status: 404,
        body: { error: 'store disabled', code: 'store.disabled' },
      });
    }
  });

  it('store on, membership off: only the membership routes reject', async () => {
    const { routes } = await loadClaudium({ CLAUDIUM_ENABLED: '1', MEMBERSHIP_ENABLED: '' });
    for (const route of routes) {
      const ctx = fakeCtx({ method: route.method, url: route.path.replace(':rail', 'card') });
      let reached = false;
      await route.middleware![0]!(ctx, async () => {
        reached = true;
      });
      const membership = /^\/api\/claudium\/(subscription|membership)/.test(route.path);
      expect(reached, route.path).toBe(!membership);
      if (membership)
        expect(captured(ctx.res).body, route.path).toMatchObject({ code: 'store.disabled' });
    }
  });

  it('the legacy prefix arm answers with the same helper', () => {
    const main = readFileSync('server/main.ts', 'utf8');
    expect(main).toMatch(
      /url\.startsWith\('\/api\/claudium'\) && !claudiumPathEnabled\(url\.split\('\?'\)\[0\]\)\) \{\s*return sendStoreDisabled\(res\);/,
    );
  });
});
