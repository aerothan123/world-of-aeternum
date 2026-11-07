// POST /api/telemetry: the ingest for Wyndlewood's opt-in first-party analytics
// (src/game/first_party_analytics.ts). The client only sends after the player
// opted in (src/game/analytics_consent.ts); the server accepts exactly the
// AnalyticsEventBody shape (src/analytics_events.ts, strict: unknown fields are
// refused), counts it on the /metrics exporter, and STORES NOTHING: no row, no
// account, no IP, no log line per event. Anonymous on purpose (the counters
// carry no identity), so it takes the per-IP public budget in-handler, the
// deeds rarity read's shape.

import { parseAnalyticsEventBody } from '../src/analytics_events';
import { clientAnalyticsMetricsSink } from './http/client_analytics_metrics';
import { HttpError } from './http/errors';
import { withBody } from './http/middleware/body';
import type { Ctx, RouteDef } from './http/types';
import { publicReadRateLimited } from './ratelimit';

async function telemetryHandler(ctx: Ctx): Promise<void> {
  if (!publicReadRateLimited(ctx.req).allowed) {
    throw new HttpError(429, 'rate_limit.exceeded', { retryAfterSeconds: 60 });
  }
  const body = parseAnalyticsEventBody(ctx.body);
  if (body === null) throw new HttpError(400, 'validation.failed', { issues: 'body' });
  clientAnalyticsMetricsSink().eventAccepted(body);
  ctx.res.writeHead(204);
  ctx.res.end();
}

export const routes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/telemetry',
    surface: 'api',
    middleware: [withBody()],
    handler: telemetryHandler,
  },
];
