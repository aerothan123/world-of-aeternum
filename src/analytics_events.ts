// The first-party analytics vocabulary, shared by the client sender
// (src/game/first_party_analytics.ts) and the server ingest
// (server/client_analytics.ts), so the two can never drift apart.
//
// Wyndlewood's analytics are STRICTLY OPT-IN (the consent record and the
// settings toggle live in src/game/analytics_consent.ts) and deliberately
// coarse: an event name from a fixed list, the host platform, and an fps
// bucket. No account, character, session, device, IP, or free text is ever
// part of a payload, and the server only turns events into bounded /metrics
// counters (it stores no rows). The privacy policy draft
// (docs/legal/privacy-policy.md, "Optional analytics") documents exactly this
// list; change both together.
//
// Host-agnostic: no imports, no DOM, so the server and the client share it.

/** Bumped whenever the payload shape changes; the server refuses other versions. */
export const ANALYTICS_SCHEMA_VERSION = 1;

/** Every event the client may send. Coarse session and performance counters only. */
export const ANALYTICS_EVENTS = [
  // The client finished booting to the start screen.
  'session_start',
  // The player entered the world with a character.
  'world_enter',
  // One more five-minute stretch of play (a coarse session-length counter).
  'play_interval',
  // The window is closing (best effort).
  'session_end',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** The host the client runs in. */
export const ANALYTICS_PLATFORMS = ['desktop', 'web'] as const;
export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORMS)[number];

/** Average frame-rate buckets ('none' when the event carries no frame data). */
export const ANALYTICS_FPS_BUCKETS = ['none', 'lt20', '20to40', '40to60', '60plus'] as const;
export type AnalyticsFpsBucket = (typeof ANALYTICS_FPS_BUCKETS)[number];

/** The whole wire payload. Nothing else is ever sent. */
export interface AnalyticsEventBody {
  v: typeof ANALYTICS_SCHEMA_VERSION;
  event: AnalyticsEventName;
  platform: AnalyticsPlatform;
  fps: AnalyticsFpsBucket;
}

/** Collapse an average fps reading into its bucket; null or non-finite reads 'none'. */
export function analyticsFpsBucket(fps: number | null | undefined): AnalyticsFpsBucket {
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) return 'none';
  if (fps < 20) return 'lt20';
  if (fps < 40) return '20to40';
  if (fps < 60) return '40to60';
  return '60plus';
}

function oneOf<T extends string>(values: readonly T[], raw: unknown): T | null {
  return typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as T) : null;
}

/**
 * Strictly parse a payload. Returns null for anything that is not exactly the
 * current shape: a wrong version, an unknown event, platform, or bucket, or any
 * extra field (an extra field is refused rather than ignored, so a future
 * client can never quietly start sending more than this module documents).
 */
export function parseAnalyticsEventBody(raw: unknown): AnalyticsEventBody | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'event,fps,platform,v') return null;
  if (record.v !== ANALYTICS_SCHEMA_VERSION) return null;
  const event = oneOf(ANALYTICS_EVENTS, record.event);
  const platform = oneOf(ANALYTICS_PLATFORMS, record.platform);
  const fps = oneOf(ANALYTICS_FPS_BUCKETS, record.fps);
  if (event === null || platform === null || fps === null) return null;
  return { v: ANALYTICS_SCHEMA_VERSION, event, platform, fps };
}
