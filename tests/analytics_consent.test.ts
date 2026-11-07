// Consent gating for Wyndlewood's opt-in analytics: the pure policy
// (src/game/analytics_consent.ts), the shared wire vocabulary
// (src/analytics_events.ts), and the sender (src/game/first_party_analytics.ts),
// which must re-check consent at EVERY send and post only the documented shape.

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_EVENTS,
  ANALYTICS_SCHEMA_VERSION,
  analyticsFpsBucket,
  parseAnalyticsEventBody,
} from '../src/analytics_events';
import {
  analyticsAllowed,
  analyticsConsentPatch,
  shouldPromptAnalyticsConsent,
} from '../src/game/analytics_consent';
import { analyticsEventBody, createFirstPartyAnalytics } from '../src/game/first_party_analytics';
import { BOOL_SETTINGS } from '../src/game/settings';

describe('analytics consent policy', () => {
  it('ships OFF: both settings default false, so a fresh install sends nothing', () => {
    expect(BOOL_SETTINGS.shareAnalytics.def).toBe(false);
    expect(BOOL_SETTINGS.analyticsPromptAnswered.def).toBe(false);
    expect(analyticsAllowed({ shareAnalytics: false, analyticsPromptAnswered: false })).toBe(false);
  });

  it('requires BOTH an answered prompt and the toggle on', () => {
    expect(analyticsAllowed({ shareAnalytics: true, analyticsPromptAnswered: true })).toBe(true);
    // A toggle value without an answered prompt (a hand-edited store) is not consent.
    expect(analyticsAllowed({ shareAnalytics: true, analyticsPromptAnswered: false })).toBe(false);
    expect(analyticsAllowed({ shareAnalytics: false, analyticsPromptAnswered: true })).toBe(false);
  });

  it('a prompt answer persists the choice and the answered marker; decline stays off', () => {
    expect(analyticsConsentPatch(true)).toEqual({
      shareAnalytics: true,
      analyticsPromptAnswered: true,
    });
    const declined = analyticsConsentPatch(false);
    expect(declined).toEqual({ shareAnalytics: false, analyticsPromptAnswered: true });
    expect(analyticsAllowed(declined)).toBe(false);
  });

  it('asks once, and never in an automated browser', () => {
    const fresh = { shareAnalytics: false, analyticsPromptAnswered: false };
    expect(shouldPromptAnalyticsConsent(fresh, { automated: false })).toBe(true);
    expect(shouldPromptAnalyticsConsent(fresh, { automated: true })).toBe(false);
    expect(shouldPromptAnalyticsConsent(analyticsConsentPatch(false), { automated: false })).toBe(
      false,
    );
  });

  it('the prompt treats Escape and the decline button as NO (never an implicit yes)', () => {
    const src = readFileSync(new URL('../src/ui/legal_choice_dialog.ts', import.meta.url), 'utf8');
    expect(src).toContain(
      "if (e.key === 'Escape') {\n        e.preventDefault();\n        close(false);",
    );
    expect(src).toContain("decline.addEventListener('click', () => close(false));");
  });
});

describe('first-party analytics sender', () => {
  it('sends nothing while consent is off, and re-checks consent at every send', () => {
    let allowed = false;
    const post = vi.fn();
    const analytics = createFirstPartyAnalytics({
      allowed: () => allowed,
      post,
      platform: 'desktop',
    });
    expect(analytics.record('session_start')).toBe(false);
    expect(post).not.toHaveBeenCalled();
    allowed = true;
    expect(analytics.record('world_enter')).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    // Turning the toggle off stops the very next event; nothing was queued.
    allowed = false;
    expect(analytics.record('play_interval', '40to60')).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('posts exactly the documented coarse shape, which the server parser accepts', () => {
    const post = vi.fn();
    createFirstPartyAnalytics({ allowed: () => true, post, platform: 'web' }).record(
      'play_interval',
      '60plus',
    );
    const body = JSON.parse(post.mock.calls[0][0] as string);
    expect(body).toEqual({
      v: ANALYTICS_SCHEMA_VERSION,
      event: 'play_interval',
      platform: 'web',
      fps: '60plus',
    });
    expect(parseAnalyticsEventBody(body)).toEqual(body);
  });

  it('a throwing transport never breaks the caller', () => {
    const analytics = createFirstPartyAnalytics({
      allowed: () => true,
      post: () => {
        throw new Error('offline');
      },
      platform: 'desktop',
    });
    expect(analytics.record('session_end')).toBe(false);
  });

  it('posts only to the game API origin, never a third-party host', () => {
    const src = readFileSync(
      new URL('../src/game/first_party_analytics.ts', import.meta.url),
      'utf8',
    );
    expect(src).toContain("fetch(apiUrl('/api/telemetry')");
    expect(src).not.toMatch(/https?:\/\//);
  });

  it('the perf report is gated on the same consent (strictly opt-in telemetry)', () => {
    const src = readFileSync(new URL('../src/game/perf_reporter.ts', import.meta.url), 'utf8');
    expect(src).toContain("skip('no-consent'");
    expect(src).toContain('(options.analyticsAllowed ?? liveAnalyticsAllowed)()');
  });
});

describe('analytics wire vocabulary', () => {
  it('buckets fps coarsely', () => {
    expect(analyticsFpsBucket(null)).toBe('none');
    expect(analyticsFpsBucket(Number.NaN)).toBe('none');
    expect(analyticsFpsBucket(12)).toBe('lt20');
    expect(analyticsFpsBucket(30)).toBe('20to40');
    expect(analyticsFpsBucket(59.9)).toBe('40to60');
    expect(analyticsFpsBucket(144)).toBe('60plus');
  });

  it('refuses any other version, unknown values, and every extra field', () => {
    const ok = analyticsEventBody('session_start', 'desktop');
    expect(parseAnalyticsEventBody(ok)).toEqual(ok);
    expect(parseAnalyticsEventBody({ ...ok, v: 2 })).toBeNull();
    expect(parseAnalyticsEventBody({ ...ok, event: 'purchase' })).toBeNull();
    expect(parseAnalyticsEventBody({ ...ok, platform: 'ios' })).toBeNull();
    expect(parseAnalyticsEventBody({ ...ok, fps: '120' })).toBeNull();
    expect(parseAnalyticsEventBody({ ...ok, accountId: 7 })).toBeNull();
    expect(parseAnalyticsEventBody(null)).toBeNull();
    expect(parseAnalyticsEventBody([ok])).toBeNull();
  });

  it('the event list is the coarse session and perf set the privacy draft documents', () => {
    expect([...ANALYTICS_EVENTS]).toEqual([
      'session_start',
      'world_enter',
      'play_interval',
      'session_end',
    ]);
    const policy = readFileSync(
      new URL('../docs/legal/privacy-policy.md', import.meta.url),
      'utf8',
    );
    for (const event of ANALYTICS_EVENTS) expect(policy).toContain(`\`${event}\``);
  });
});
