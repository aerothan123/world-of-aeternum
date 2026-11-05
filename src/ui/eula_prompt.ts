// The first-launch EULA gate: before world entry, the player must have accepted
// the CURRENT End User License Agreement (src/legal_versions.ts EULA_VERSION).
// Acceptance is recorded per account on the server (GET/POST /api/eula,
// server/eula.ts) and per install locally (the offline-play record and a cache
// for an unreachable server). The decision is the pure eula_gate_core.ts; this
// module is the thin network + DOM consumer.

import { apiUrl } from '../client_origin';
import { EULA_VERSION } from '../legal_versions';
import {
  EULA_LOCAL_KEY,
  eulaGateDecision,
  localEulaRecord,
  parseLocalEulaRecord,
} from './eula_gate_core';
import { t } from './i18n';
import { showLegalChoiceDialog } from './legal_choice_dialog';
import { eulaUrlFor, privacyUrlFor, termsUrlFor } from './terms_link';

function readLocal(): string | null {
  try {
    return parseLocalEulaRecord(localStorage.getItem(EULA_LOCAL_KEY));
  } catch {
    return null;
  }
}

function writeLocal(version: string): void {
  try {
    localStorage.setItem(EULA_LOCAL_KEY, localEulaRecord(version));
  } catch {
    // Private mode or blocked storage: the server record still holds it.
  }
}

/** The account's accepted version, null when never accepted, undefined when unknown. */
async function fetchServerAccepted(token: string | null): Promise<string | null | undefined> {
  if (!token) return undefined;
  try {
    const res = await fetch(apiUrl('/api/eula'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { accepted?: unknown };
    return typeof data.accepted === 'string' ? data.accepted : null;
  } catch {
    return undefined;
  }
}

async function recordServerAcceptance(token: string | null, version: string): Promise<void> {
  if (!token) return;
  try {
    await fetch(apiUrl('/api/eula/accept'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ version }),
    });
  } catch {
    // Kept locally; the next entry's 'pass-sync' records it on the server.
  }
}

let pending: Promise<boolean> | null = null;

/**
 * Resolve true when world entry may proceed (the current EULA is accepted, now
 * or before), false when the player declined. `token` is the signed-in bearer
 * (null for offline play, which records acceptance locally only).
 */
export function ensureEulaAccepted(token: string | null): Promise<boolean> {
  if (pending) return pending;
  pending = (async () => {
    const decision = eulaGateDecision({
      current: EULA_VERSION,
      serverAccepted: await fetchServerAccepted(token),
      localAccepted: readLocal(),
    });
    if (decision === 'pass') return true;
    if (decision === 'pass-sync') {
      void recordServerAcceptance(token, EULA_VERSION);
      return true;
    }
    const origin = location.origin;
    const accepted = await showLegalChoiceDialog({
      idStem: 'eula-gate',
      title: t('legalPrompt.title'),
      paragraphs: [t('legalPrompt.body'), t('legalPrompt.earlyAccess')],
      links: [
        { label: t('legalPrompt.eulaLink'), href: eulaUrlFor(origin) },
        { label: t('legalPrompt.termsLink'), href: termsUrlFor(origin) },
        { label: t('legalPrompt.privacyLink'), href: privacyUrlFor(origin) },
      ],
      note: t('legalPrompt.version', { version: EULA_VERSION }),
      acceptLabel: t('legalPrompt.accept'),
      declineLabel: t('legalPrompt.decline'),
    });
    if (!accepted) return false;
    writeLocal(EULA_VERSION);
    await recordServerAcceptance(token, EULA_VERSION);
    return true;
  })().finally(() => {
    pending = null;
  });
  return pending;
}
