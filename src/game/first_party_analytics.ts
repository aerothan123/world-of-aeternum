// Wyndlewood's first-party analytics sender: coarse, opt-in session and
// performance counters posted to the game's OWN API origin (POST /api/telemetry,
// server/client_analytics.ts). No third-party host, no identifiers: the whole
// payload is the AnalyticsEventBody in src/analytics_events.ts (an event name,
// the platform, an fps bucket). The server turns it into bounded /metrics
// counters and stores no rows.
//
// Consent is re-checked at EVERY send through the injected `allowed` probe
// (analytics_consent.ts reading the live settings), so turning the Options toggle
// off stops the very next event; nothing is queued while consent is off.

import { apiUrl } from '../client_origin';
import { isDesktopAppRuntime } from '../runtime';
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsEventBody,
  type AnalyticsEventName,
  type AnalyticsFpsBucket,
  type AnalyticsPlatform,
  analyticsFpsBucket,
} from '../analytics_events';
import { analyticsAllowed } from './analytics_consent';
import { Settings } from './settings';

/** One play_interval event per this much continuous session time. */
export const ANALYTICS_PLAY_INTERVAL_MS = 5 * 60_000;
/** How long the coarse fps sample watches frames before bucketing them. */
export const ANALYTICS_FPS_SAMPLE_MS = 3_000;

export interface FirstPartyAnalyticsDeps {
  /** Live consent probe, read at every send. */
  allowed: () => boolean;
  /** Fire-and-forget transport for one serialized body. */
  post: (body: string) => void;
  platform: AnalyticsPlatform;
}

export interface FirstPartyAnalytics {
  /** Send one event when (and only when) consent allows it. Returns whether it was sent. */
  record(event: AnalyticsEventName, fps?: AnalyticsFpsBucket): boolean;
}

/** Build the event body. Exported for the tests that pin the wire shape. */
export function analyticsEventBody(
  event: AnalyticsEventName,
  platform: AnalyticsPlatform,
  fps: AnalyticsFpsBucket = 'none',
): AnalyticsEventBody {
  return { v: ANALYTICS_SCHEMA_VERSION, event, platform, fps };
}

export function createFirstPartyAnalytics(deps: FirstPartyAnalyticsDeps): FirstPartyAnalytics {
  return {
    record(event, fps = 'none') {
      if (!deps.allowed()) return false;
      try {
        deps.post(JSON.stringify(analyticsEventBody(event, deps.platform, fps)));
      } catch {
        // Analytics must never break the game; a failed send is simply dropped.
        return false;
      }
      return true;
    },
  };
}

/** The live consent probe: a fresh settings read, so another tab's change is honored. */
export function liveAnalyticsAllowed(): boolean {
  try {
    const settings = new Settings();
    return analyticsAllowed({
      shareAnalytics: settings.get('shareAnalytics'),
      analyticsPromptAnswered: settings.get('analyticsPromptAnswered'),
    });
  } catch {
    return false;
  }
}

function postToOwnOrigin(body: string): void {
  void fetch(apiUrl('/api/telemetry'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

/** Average fps over a short window, from animation frames; resolves null off-screen. */
function sampleFps(windowMs = ANALYTICS_FPS_SAMPLE_MS): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve(null);
      return;
    }
    let frames = 0;
    let start = -1;
    const step = (now: number): void => {
      if (start < 0) start = now;
      frames++;
      if (now - start >= windowMs) {
        resolve(frames > 1 ? ((frames - 1) * 1000) / (now - start) : null);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

let liveSender: FirstPartyAnalytics | null = null;
let sessionStarted = false;

function sender(): FirstPartyAnalytics {
  liveSender ??= createFirstPartyAnalytics({
    allowed: liveAnalyticsAllowed,
    post: postToOwnOrigin,
    platform: isDesktopAppRuntime() ? 'desktop' : 'web',
  });
  return liveSender;
}

/**
 * Called on every world entry (src/ui/world_entry_legal.ts). The first entry of
 * a page session also sends session_start and arms the play_interval timer and
 * the session_end hook; both re-check consent at send time.
 */
export function noteWorldEntryForAnalytics(): void {
  const analytics = sender();
  if (!sessionStarted) {
    sessionStarted = true;
    analytics.record('session_start');
    setInterval(() => {
      if (!liveAnalyticsAllowed()) return;
      void sampleFps().then((fps) => analytics.record('play_interval', analyticsFpsBucket(fps)));
    }, ANALYTICS_PLAY_INTERVAL_MS);
    addEventListener('pagehide', () => analytics.record('session_end'), { once: true });
  }
  analytics.record('world_enter');
}
