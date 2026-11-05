// Re-localizes the realm maintenance broadcasts (server/maintenance.ts emits
// English, like every server line). Pure: text in, localized text or null out;
// src/ui/server_i18n.ts localizeServerText consults it first. The English
// shapes here are the emitter's exact strings (maintenanceStepText and the two
// constants), pinned against it by tests/server/maintenance.test.ts.

import { formatNumber, t } from './i18n';

const MINUTES = /^Realm maintenance begins in (\d+) minutes\.$/;
const SECONDS = /^Realm maintenance begins in (\d+) seconds\.$/;

export function localizeMaintenanceText(text: string): string | null {
  if (text === 'Realm maintenance begins in 1 minute.')
    return t('hudChrome.maintenance.beginsInMinute');
  if (text === 'Realm maintenance has begun. New logins are closed.') {
    return t('hudChrome.maintenance.begun');
  }
  if (text === 'Realm maintenance was cancelled.') return t('hudChrome.maintenance.cancelled');
  if (text === 'Realm maintenance is over. Logins are open again.') {
    return t('hudChrome.maintenance.ended');
  }
  const minutes = MINUTES.exec(text);
  if (minutes) {
    return t('hudChrome.maintenance.beginsInMinutes', { count: formatNumber(Number(minutes[1])) });
  }
  const seconds = SECONDS.exec(text);
  if (seconds) {
    return t('hudChrome.maintenance.beginsInSeconds', { count: formatNumber(Number(seconds[1])) });
  }
  return null;
}
