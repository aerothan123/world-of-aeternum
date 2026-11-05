// The first-launch legal acceptance gate's pure core: the DECISION (may world
// entry proceed, proceed after a silent server sync, or must the agreements be
// shown first) and the VIEW MODEL the painter renders
// (src/ui/legal_acceptance_controller.ts).
//
// Three documents are accepted together, each versioned on its own
// (src/legal_versions.ts): the Terms of Service, the Privacy Policy and the
// EULA. Acceptance is stored PER ACCOUNT on the server
// (server/legal_acceptance.ts), so a changed version of ANY document re-prompts
// on the next entry from any install. The local record is the offline world's
// store and a resilience cache: a player who accepted on this install while the
// server was unreachable is not asked again, and the server copy catches up.
//
// The shown text is a plain-language summary of each draft
// (docs/legal/terms-of-service.md, docs/legal/privacy-policy.md,
// docs/legal/eula.md; TERMS_AND_CONDITIONS.md and PRIVACY_POLICY.md point
// there) with a link to the full document. The publisher entity stays the
// clearly marked [PUBLISHER LEGAL NAME] placeholder until the owner names it.
//
// Pure: no DOM, no storage, no network (registered in UI_PURE_CORES). Keys are
// returned, never resolved text, so the painter owns every t() call.

import {
  CURRENT_LEGAL_VERSIONS,
  LEGAL_DOC_IDS,
  type LegalDocId,
  type LegalVersions,
  parseLegalVersions,
} from '../legal_versions';
import type { TranslationKey } from './i18n';

/** The local record key (one per install). Kept from the EULA-only gate so an
 *  install that accepted the old single agreement is read, not ignored. */
export const LEGAL_LOCAL_KEY = 'wynd_eula_accepted';

/** A per-document accepted record: null for a document never accepted. */
export type AcceptedVersions = Readonly<Record<LegalDocId, string | null>>;

export type LegalGateDecision =
  /** Already accepted every current version: enter. */
  | 'pass'
  /** Accepted locally but the account record is missing or stale: enter, and record it. */
  | 'pass-sync'
  /** Show the agreements; entry waits on the answer. */
  | 'prompt';

export interface LegalGateInputs {
  current: LegalVersions;
  /** The account's record, null when it never accepted, or undefined when
   *  there is no signed-in account or the server was unreachable. */
  serverAccepted: AcceptedVersions | null | undefined;
  /** This install's record, or null. */
  localAccepted: AcceptedVersions | null;
}

function allCurrent(accepted: AcceptedVersions | null | undefined, current: LegalVersions): boolean {
  return !!accepted && LEGAL_DOC_IDS.every((id) => accepted[id] === current[id]);
}

export function legalGateDecision(inputs: LegalGateInputs): LegalGateDecision {
  if (allCurrent(inputs.serverAccepted, inputs.current)) return 'pass';
  if (allCurrent(inputs.localAccepted, inputs.current)) {
    return inputs.serverAccepted === undefined ? 'pass' : 'pass-sync';
  }
  return 'prompt';
}

/** The documents whose current version this record has not accepted. */
export function documentsToAccept(
  accepted: AcceptedVersions | null | undefined,
  current: LegalVersions = CURRENT_LEGAL_VERSIONS,
): LegalDocId[] {
  return LEGAL_DOC_IDS.filter((id) => accepted?.[id] !== current[id]);
}

/** Parse the stored local record. The EULA-only gate wrote { v }; the current
 *  one writes { v, t, p } (v stays the EULA so the old record still reads). */
export function parseLocalLegalRecord(raw: string | null): AcceptedVersions | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; t?: unknown; p?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parseLegalVersions({ eula: parsed.v, terms: parsed.t, privacy: parsed.p });
    return LEGAL_DOC_IDS.some((id) => record[id] !== null) ? record : null;
  } catch {
    return null;
  }
}

/** Serialize the local record for a full set of versions. */
export function localLegalRecord(versions: LegalVersions): string {
  return JSON.stringify({ v: versions.eula, t: versions.terms, p: versions.privacy });
}

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export interface LegalSectionView {
  doc: LegalDocId;
  headingKey: TranslationKey;
  /** The summary points, in order. */
  pointKeys: readonly TranslationKey[];
  version: string;
  /** True when the player accepted an OLDER version of this document. */
  updated: boolean;
}

export interface LegalAcceptanceView {
  titleKey: TranslationKey;
  introKey: TranslationKey;
  sections: readonly LegalSectionView[];
  earlyAccessKey: TranslationKey;
  publisherKey: TranslationKey;
  readFullKey: TranslationKey;
  versionKey: TranslationKey;
  updatedKey: TranslationKey;
  acceptKey: TranslationKey;
  declineKey: TranslationKey;
}

const SECTION_KEYS: Readonly<
  Record<LegalDocId, { heading: TranslationKey; points: readonly TranslationKey[] }>
> = {
  terms: {
    heading: 'legalPrompt.termsLink',
    points: [
      'legalPrompt.terms.age',
      'legalPrompt.terms.fairPlay',
      'legalPrompt.terms.virtualItems',
      'legalPrompt.terms.enforcement',
    ],
  },
  privacy: {
    heading: 'legalPrompt.privacyLink',
    points: [
      'legalPrompt.privacy.account',
      'legalPrompt.privacy.public',
      'legalPrompt.privacy.analytics',
      'legalPrompt.privacy.rights',
    ],
  },
  eula: {
    heading: 'legalPrompt.eulaLink',
    points: ['legalPrompt.eula.license', 'legalPrompt.eula.restrictions'],
  },
};

/**
 * The dialog model. `accepted` is the best record known (the server's, else the
 * local one); a document the player accepted an older version of is flagged
 * `updated`, so a re-prompt says WHAT changed instead of looking like a first run.
 */
export function legalAcceptanceView(
  accepted: AcceptedVersions | null | undefined,
  current: LegalVersions = CURRENT_LEGAL_VERSIONS,
): LegalAcceptanceView {
  return {
    titleKey: 'legalPrompt.title',
    introKey: 'legalPrompt.body',
    sections: LEGAL_DOC_IDS.map((doc) => {
      const prior = accepted?.[doc] ?? null;
      return {
        doc,
        headingKey: SECTION_KEYS[doc].heading,
        pointKeys: SECTION_KEYS[doc].points,
        version: current[doc],
        updated: prior !== null && prior !== current[doc],
      };
    }),
    earlyAccessKey: 'legalPrompt.earlyAccess',
    publisherKey: 'legalPrompt.publisher',
    readFullKey: 'legalPrompt.readFull',
    versionKey: 'legalPrompt.version',
    updatedKey: 'legalPrompt.updated',
    acceptKey: 'legalPrompt.accept',
    declineKey: 'legalPrompt.decline',
  };
}
