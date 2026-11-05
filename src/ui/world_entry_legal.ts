// The legal steps of world entry, composed in one call so src/main.ts (a
// firewall, not a home) adds a single line: the once-per-install analytics
// consent question, then the opt-in analytics world_enter event (sent only
// with consent).

import { noteWorldEntryForAnalytics } from '../game/first_party_analytics';
import { promptAnalyticsConsentOnce } from './analytics_consent_prompt';

/** Resolve false when entry must stop, else true. */
export async function runWorldEntryLegalSteps(_token: string | null): Promise<boolean> {
  await promptAnalyticsConsentOnce();
  noteWorldEntryForAnalytics();
  return true;
}
