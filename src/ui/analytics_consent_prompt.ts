// The first-launch analytics consent prompt: asks ONCE per install whether the
// player wants to share usage and performance data, before their first world
// entry. Default is OFF: Escape and "Do not share" both record a decline, and
// nothing is sent until the player chooses Share (here or later in Options,
// the shareAnalytics toggle). Policy: src/game/analytics_consent.ts.

import { analyticsConsentPatch, shouldPromptAnalyticsConsent } from '../game/analytics_consent';
import { Settings } from '../game/settings';
import { t } from './i18n';
import { showLegalChoiceDialog } from './legal_choice_dialog';
import { privacyUrlFor } from './terms_link';

let pending: Promise<void> | null = null;

/** Resolve once the consent question has an answer (immediately when already answered). */
export function promptAnalyticsConsentOnce(): Promise<void> {
  if (pending) return pending;
  const settings = new Settings();
  const show = shouldPromptAnalyticsConsent(
    {
      shareAnalytics: settings.get('shareAnalytics'),
      analyticsPromptAnswered: settings.get('analyticsPromptAnswered'),
    },
    { automated: navigator.webdriver === true },
  );
  if (!show) return Promise.resolve();
  pending = showLegalChoiceDialog({
    idStem: 'analytics-consent',
    title: t('analyticsPrompt.title'),
    paragraphs: [t('analyticsPrompt.body'), t('analyticsPrompt.noThirdParty')],
    links: [{ label: t('analyticsPrompt.privacyLink'), href: privacyUrlFor(location.origin) }],
    note: t('analyticsPrompt.changeLater'),
    acceptLabel: t('analyticsPrompt.share'),
    declineLabel: t('analyticsPrompt.decline'),
  }).then((share) => {
    // A fresh read: another Settings instance may have written since this one loaded.
    new Settings().patch(analyticsConsentPatch(share));
    pending = null;
  });
  return pending;
}
