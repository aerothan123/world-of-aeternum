// The current versions of Wyndlewood's player agreements, in ONE place, shared
// by the client first-launch acceptance gate (src/ui/legal_acceptance_core.ts,
// src/ui/legal_acceptance_prompt.ts) and the server acceptance record
// (server/legal_acceptance.ts). Three documents are accepted together: the
// Terms of Service (docs/legal/terms-of-service.md, public/terms.html), the
// Privacy Policy (docs/legal/privacy-policy.md, public/privacy.html) and the
// End User License Agreement (docs/legal/eula.md, public/eula.html).
//
// Bump a document's version whenever its text changes in a way players must
// accept again: the server (GET /api/legal-acceptance) then reports that
// document as outdated for every account, so any client (the web client and
// the future Unreal client alike) asks once more on the next world entry and
// the new acceptance is recorded per account. The server copy of these values
// is the authority; a client shows and posts the versions the server reported.
// The values are opaque tokens (date plus a short tag), compared for equality
// only. The current drafts are TEMPLATES awaiting lawyer
// review, and the publisher entity is still the [PUBLISHER LEGAL NAME]
// placeholder.
//
// Host-agnostic: no imports, no DOM.

/** The EULA version a player must have accepted to enter the world. */
export const EULA_VERSION = '2026-11-04-draft';
/** The Terms of Service version a player must have accepted. */
export const TERMS_VERSION = '2026-11-05-draft';
/** The Privacy Policy version a player must have acknowledged. */
export const PRIVACY_VERSION = '2026-11-05-draft';

/** The documents accepted together, in the order the prompt shows them. */
export const LEGAL_DOC_IDS = ['terms', 'privacy', 'eula'] as const;
export type LegalDocId = (typeof LEGAL_DOC_IDS)[number];

/** The site path of each document's full text (server/static_fallback.ts serves
 *  them; a client resolves them against its realm origin). */
export const LEGAL_DOC_PATHS: Readonly<Record<LegalDocId, string>> = Object.freeze({
  terms: '/terms',
  privacy: '/privacy',
  eula: '/eula',
});

/** One version token per document. */
export type LegalVersions = Readonly<Record<LegalDocId, string>>;

/** What a player must have accepted to enter the world. */
export const CURRENT_LEGAL_VERSIONS: LegalVersions = Object.freeze({
  terms: TERMS_VERSION,
  privacy: PRIVACY_VERSION,
  eula: EULA_VERSION,
});

/** Shape check for a version token arriving over the wire or from storage. */
export function isLegalVersionToken(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,24}$/.test(raw);
}

/** Read a { terms, privacy, eula } record; a missing or malformed field reads as null. */
export function parseLegalVersions(raw: unknown): Record<LegalDocId, string | null> {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { terms: null, privacy: null, eula: null } as Record<LegalDocId, string | null>;
  for (const id of LEGAL_DOC_IDS) out[id] = isLegalVersionToken(v[id]) ? (v[id] as string) : null;
  return out;
}

/** True when `accepted` names exactly the current version of every document. */
export function legalVersionsCurrent(
  accepted: Readonly<Record<LegalDocId, string | null>> | null | undefined,
  current: LegalVersions = CURRENT_LEGAL_VERSIONS,
): boolean {
  if (!accepted) return false;
  return LEGAL_DOC_IDS.every((id) => accepted[id] === current[id]);
}

/** The documents whose current version `accepted` does not name, in prompt order. */
export function outdatedLegalDocs(
  accepted: Readonly<Record<LegalDocId, string | null>> | null | undefined,
  current: LegalVersions = CURRENT_LEGAL_VERSIONS,
): LegalDocId[] {
  return LEGAL_DOC_IDS.filter((id) => accepted?.[id] !== current[id]);
}
