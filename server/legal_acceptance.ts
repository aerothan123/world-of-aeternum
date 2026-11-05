// Player-agreement acceptance API (scaffolded by `npm run new:endpoint`): the
// per-account, versioned record the client's first-launch gate
// (src/ui/legal_acceptance_prompt.ts) reads and writes before world entry. Three
// documents are accepted together: the Terms of Service, the Privacy Policy and
// the EULA (src/legal_versions.ts). Registry-only RouteDefs: a read-tier GET
// and a mutation-tier POST, both bearer-authenticated through requireAccount.
//
//   GET  /api/legal-acceptance -> { current: Versions, accepted: Versions | null }
//   POST /api/legal-acceptance { terms, privacy, eula } -> { accepted: Versions }
//
// The POST accepts ONLY the current version of every document: a client built
// before a document changed cannot record acceptance of text the server no
// longer offers, and answers the stable `legal_acceptance.invalid_input` code
// (the client re-prompts with the new text). A malformed body is the shared
// `validation.failed`. The write is an idempotent overwrite of the account's one
// row, so it needs no per-action limiter beyond the bearer guard.

import {
  CURRENT_LEGAL_VERSIONS,
  LEGAL_DOC_IDS,
  type LegalDocId,
  legalVersionsCurrent,
  parseLegalVersions,
} from '../src/legal_versions';
import {
  type AcceptedLegalVersions,
  acceptedLegalVersions,
  recordLegalAcceptance,
} from './eula_db';
import { ctxAccountId } from './http/context';
import { HttpError } from './http/errors';
import { withBody } from './http/middleware/body';
import { requireAccount } from './http/middleware/require_account';
import type { Ctx, RouteDef } from './http/types';
import { json } from './http_util';

const INVALID_INPUT_CODE = 'legal_acceptance.invalid_input';

/** The persistence seam (server/eula_db.ts); a test swaps in a fake, no Postgres. */
export interface LegalAcceptanceDb {
  accepted(accountId: number): Promise<AcceptedLegalVersions | null>;
  record(accountId: number, versions: Readonly<Record<LegalDocId, string>>): Promise<void>;
}

const REAL_DB: LegalAcceptanceDb = {
  accepted: acceptedLegalVersions,
  record: recordLegalAcceptance,
};
let db: LegalAcceptanceDb = REAL_DB;

/** Override the db seam (test-only). */
export function setLegalAcceptanceDbForTests(fake: LegalAcceptanceDb): void {
  db = fake;
}

/** Restore the real db seam (test-only). */
export function resetLegalAcceptanceDbForTests(): void {
  db = REAL_DB;
}

/** GET /api/legal-acceptance: the current versions and what this account accepted. */
async function statusHandler(ctx: Ctx): Promise<void> {
  json(ctx.res, 200, {
    current: CURRENT_LEGAL_VERSIONS,
    accepted: await db.accepted(ctxAccountId(ctx)),
  });
}

/** POST /api/legal-acceptance: record acceptance of the CURRENT version of every document. */
async function acceptHandler(ctx: Ctx): Promise<void> {
  const body = ctx.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'validation.failed', { issues: 'body' });
  }
  const claimed = parseLegalVersions(body);
  const malformed = LEGAL_DOC_IDS.filter((id) => claimed[id] === null);
  if (malformed.length > 0) {
    throw new HttpError(400, 'validation.failed', { issues: malformed.join(',') });
  }
  if (!legalVersionsCurrent(claimed)) {
    json(ctx.res, 400, { error: 'stale agreement version', code: INVALID_INPUT_CODE });
    return;
  }
  await db.record(ctxAccountId(ctx), CURRENT_LEGAL_VERSIONS);
  json(ctx.res, 200, { accepted: CURRENT_LEGAL_VERSIONS });
}

const readAccount = requireAccount({ scope: 'read' });
const activeAccount = requireAccount({ scope: 'active' });

export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/legal-acceptance',
    surface: 'api',
    middleware: [readAccount],
    handler: statusHandler,
  },
  {
    method: 'POST',
    path: '/api/legal-acceptance',
    surface: 'api',
    middleware: [activeAccount, withBody()],
    handler: acceptHandler,
  },
];
