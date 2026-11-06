// POST /api/telemetry (server/client_analytics.ts): the opt-in analytics ingest
// counts valid events on the exporter sink, refuses anything else with the
// shared validation code, and takes the per-IP public budget.

import { Registry } from 'prom-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../server/client_analytics';
import {
  noopClientAnalyticsMetricsSink,
  registerClientAnalyticsMetrics,
  setClientAnalyticsMetricsSink,
  WYND_CLIENT_ANALYTICS_EVENTS_TOTAL,
} from '../../server/http/client_analytics_metrics';
import {
  PUBLIC_READ_MAX_PER_MINUTE,
  publicReadRateLimited,
  resetPublicReadRateLimits,
} from '../../server/ratelimit';
import { type FakeRes, fakeCtx, makeReq } from './helpers';

const handler = routes[0].handler;
const valid = { v: 1, event: 'world_enter', platform: 'desktop', fps: 'none' };

afterEach(() => {
  setClientAnalyticsMetricsSink(noopClientAnalyticsMetricsSink);
  resetPublicReadRateLimits();
});

describe('client analytics route table', () => {
  it('registers exactly one anonymous POST with a body parser', () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ method: 'POST', path: '/api/telemetry', surface: 'api' });
    expect(routes[0].middleware).toHaveLength(1);
  });
});

describe('telemetry handler', () => {
  it('counts a valid event and answers 204 with no body', async () => {
    const eventAccepted = vi.fn();
    setClientAnalyticsMetricsSink({ eventAccepted });
    const ctx = fakeCtx({ method: 'POST', url: '/api/telemetry', body: valid });
    await handler(ctx);
    expect((ctx.res as unknown as FakeRes).statusCode).toBe(204);
    expect(eventAccepted).toHaveBeenCalledWith(valid);
  });

  it('refuses an extra field (no identifier can ride along) without counting', async () => {
    const eventAccepted = vi.fn();
    setClientAnalyticsMetricsSink({ eventAccepted });
    const ctx = fakeCtx({ method: 'POST', body: { ...valid, accountId: 7 } });
    await expect(handler(ctx)).rejects.toMatchObject({ status: 400, code: 'validation.failed' });
    expect(eventAccepted).not.toHaveBeenCalled();
  });

  it('answers 429 once the per-IP public budget is spent', async () => {
    for (let i = 0; i < PUBLIC_READ_MAX_PER_MINUTE + 1; i++) {
      publicReadRateLimited(makeReq({ method: 'POST', url: '/api/telemetry' }));
    }
    const ctx = fakeCtx({ method: 'POST', body: valid });
    await expect(handler(ctx)).rejects.toMatchObject({ status: 429, code: 'rate_limit.exceeded' });
  });

  it('the exporter series carries only the bounded labels', async () => {
    const registry = new Registry();
    const sink = registerClientAnalyticsMetrics(registry);
    sink.eventAccepted({ v: 1, event: 'session_start', platform: 'web', fps: 'none' });
    const text = await registry.metrics();
    expect(text).toContain(
      `${WYND_CLIENT_ANALYTICS_EVENTS_TOTAL}{event="session_start",platform="web",fps="none"} 1`,
    );
  });
});
