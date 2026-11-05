// The first-launch player-agreements gate: before world entry, the player must
// have accepted the CURRENT Terms of Service, Privacy Policy and EULA
// (src/legal_versions.ts). Acceptance is recorded per account on the server
// (GET/POST /api/legal-acceptance, server/legal_acceptance.ts), so a changed
// version of any document re-prompts on the next entry from any install, and
// per install locally (the offline world's record, and a cache for an
// unreachable server). The decision and the view model are the pure
// legal_acceptance_core.ts; the dialog is legal_acceptance_controller.ts; this
// module is the thin network + storage glue between them.

import { apiUrl } from '../client_origin';
import { CURRENT_LEGAL_VERSIONS, type LegalDocId, parseLegalVersions } from '../legal_versions';
import {
  type AcceptedVersions,
  LEGAL_LOCAL_KEY,
  legalAcceptanceView,
  legalGateDecision,
  localLegalRecord,
  parseLocalLegalRecord,
} from './legal_acceptance_core';
import { showLegalAcceptanceDialog } from './legal_acceptance_controller';
import { eulaUrlFor, privacyUrlFor, termsUrlFor } from './terms_link';

function readLocal(): AcceptedVersions | null {
  try {
    return parseLocalLegalRecord(localStorage.getItem(LEGAL_LOCAL_KEY));
  } catch {
    return null;
  }
}

function writeLocal(): void {
  try {
    localStorage.setItem(LEGAL_LOCAL_KEY, localLegalRecord(CURRENT_LEGAL_VERSIONS));
  } catch {
    // Private mode or blocked storage: the server record still holds it.
  }
}

/** The account's record, null when it never accepted, undefined when unknown. */
async function fetchServerAccepted(
  token: string | null,
): Promise<AcceptedVersions | null | undefined> {
  if (!token) return undefined;
  try {
    const res = await fetch(apiUrl('/api/legal-acceptance'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { accepted?: unknown };
    return data.accepted && typeof data.accepted === 'object'
      ? parseLegalVersions(data.accepted)
      : null;
  } catch {
    return undefined;
  }
}

async function recordServerAcceptance(token: string | null): Promise<void> {
  if (!token) return;
  try {
    await fetch(apiUrl('/api/legal-acceptance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(CURRENT_LEGAL_VERSIONS),
    });
  } catch {
    // Kept locally; the next entry's 'pass-sync' records it on the server.
  }
}

function urlFor(doc: LegalDocId): string {
  const origin = location.origin;
  if (doc === 'terms') return termsUrlFor(origin);
  if (doc === 'privacy') return privacyUrlFor(origin);
  return eulaUrlFor(origin);
}

let pending: Promise<boolean> | null = null;

/**
 * Resolve true when world entry may proceed (every current agreement is
 * accepted, now or before), false when the player declined. `token` is the
 * signed-in bearer (null for offline play, which records acceptance locally).
 */
export function ensureLegalAccepted(token: string | null): Promise<boolean> {
  if (pending) return pending;
  pending = (async () => {
    const serverAccepted = await fetchServerAccepted(token);
    const localAccepted = readLocal();
    const decision = legalGateDecision({
      current: CURRENT_LEGAL_VERSIONS,
      serverAccepted,
      localAccepted,
    });
    if (decision === 'pass') return true;
    if (decision === 'pass-sync') {
      void recordServerAcceptance(token);
      return true;
    }
    const accepted = await showLegalAcceptanceDialog(
      legalAcceptanceView(serverAccepted ?? localAccepted),
      { urlFor },
    );
    if (!accepted) return false;
    writeLocal();
    await recordServerAcceptance(token);
    return true;
  })().finally(() => {
    pending = null;
  });
  return pending;
}
