// The analytics consent policy: the one place that decides whether Wyndlewood may
// send ANY telemetry (the opt-in first-party counters in first_party_analytics.ts
// and the periodic performance report in perf_reporter.ts).
//
// Strictly opt-in. Both inputs live in the player's settings store
// (src/game/settings.ts BOOL_SETTINGS): `shareAnalytics` (default OFF, the toggle
// in Options and the "Share" answer of the first-launch prompt) and
// `analyticsPromptAnswered` (whether the first-launch prompt has been answered).
// Sending requires BOTH: an answered prompt and the toggle on. A fresh install,
// a store that predates these keys, a declined prompt, and Reset to Defaults all
// read as "do not send".
//
// Pure: no DOM, no storage access of its own; callers pass the two settings in.

/** The two settings this policy reads. */
export interface AnalyticsConsentInputs {
  shareAnalytics: boolean;
  analyticsPromptAnswered: boolean;
}

/** True only when the player explicitly opted in. Every sender checks this at send time. */
export function analyticsAllowed(inputs: AnalyticsConsentInputs): boolean {
  return inputs.analyticsPromptAnswered === true && inputs.shareAnalytics === true;
}

/** Whether the first-launch consent prompt should be shown. */
export function shouldPromptAnalyticsConsent(
  inputs: AnalyticsConsentInputs,
  env: { automated: boolean },
): boolean {
  // Automated browsers (E2E, benches) never see the modal and never send: the
  // prompt stays unanswered, so analyticsAllowed stays false.
  if (env.automated) return false;
  return inputs.analyticsPromptAnswered !== true;
}

/** The settings patch one prompt answer persists. */
export function analyticsConsentPatch(share: boolean): AnalyticsConsentInputs {
  return { shareAnalytics: share === true, analyticsPromptAnswered: true };
}
