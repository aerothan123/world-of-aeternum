// The legal steps of world entry, composed in one call so src/main.ts (a
// firewall, not a home) adds a single line: the EULA gate first (it can stop
// entry), then the once-per-install analytics consent question (it never can),
// then the opt-in analytics world_enter event (sent only with consent).

import { noteWorldEntryForAnalytics } from '../game/first_party_analytics';
import { promptAnalyticsConsentOnce } from './analytics_consent_prompt';
import { ensureEulaAccepted } from './eula_prompt';

/** Resolve false when the player declined the EULA (entry must stop), else true. */
export async function runWorldEntryLegalSteps(token: string | null): Promise<boolean> {
  // A decline leaves the player where they were (character select or the offline
  // menu); the agreement itself says acceptance is required to play.
  if (!(await ensureEulaAccepted(token))) return false;
  await promptAnalyticsConsentOnce();
  noteWorldEntryForAnalytics();
  return true;
}
