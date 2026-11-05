// The opt-in first-party analytics half of the /metrics exporter: one counter
// fed by POST /api/telemetry (server/client_analytics.ts). The ingest stores no
// rows; these bounded series ARE the whole record.
//
// CARDINALITY IS BOUNDED BY DESIGN: every label value comes from the fixed
// vocabularies in src/analytics_events.ts, already enforced by the strict
// parser before a value reaches here. Nothing per-player, per-session, or
// per-device is ever a label. Client-attested numbers, same caveat as
// client_perf_metrics.ts: a hand-rolled beacon can skew a count (bounded by the
// per-IP public budget), never mint a series.

import { Counter, type Registry } from 'prom-client';
import type { AnalyticsEventBody } from '../../src/analytics_events';

export const WYND_CLIENT_ANALYTICS_EVENTS_TOTAL = 'wynd_client_analytics_events_total';

export interface ClientAnalyticsMetricsSink {
  eventAccepted(body: AnalyticsEventBody): void;
}

export const noopClientAnalyticsMetricsSink: ClientAnalyticsMetricsSink = {
  eventAccepted() {},
};

let activeSink: ClientAnalyticsMetricsSink = noopClientAnalyticsMetricsSink;

/** Install the process-wide sink (main.ts at boot; tests install a recording fake). */
export function setClientAnalyticsMetricsSink(sink: ClientAnalyticsMetricsSink): void {
  activeSink = sink;
}

/** The current sink. Read at emission time, never captured at import. */
export function clientAnalyticsMetricsSink(): ClientAnalyticsMetricsSink {
  return activeSink;
}

/** Register the counter on the one exporter registry and return the live sink. */
export function registerClientAnalyticsMetrics(registry: Registry): ClientAnalyticsMetricsSink {
  const events = new Counter({
    name: WYND_CLIENT_ANALYTICS_EVENTS_TOTAL,
    help: 'Opt-in first-party client analytics events, by event, platform, and fps bucket.',
    labelNames: ['event', 'platform', 'fps'] as const,
    registers: [registry],
  });
  return {
    eventAccepted(body) {
      events.inc({ event: body.event, platform: body.platform, fps: body.fps });
    },
  };
}
