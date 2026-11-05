// EULA acceptance API: the per-account, versioned record the client's
// first-launch gate (src/ui/eula_prompt.ts) reads and writes before world
// entry. Registry-only RouteDefs on the deeds broadcast shape: a read-tier GET
// and a mutation-tier POST, both bearer-authenticated through requireAccount.
//
//   GET  /api/eula         -> { current, accepted }  (accepted: string | null)
//   POST /api/eula/accept  { version } -> { accepted }
//
// The POST accepts ONLY the current version (src/legal_versions.ts): a stale
// client cannot record acceptance of an agreement text the server no longer
// offers. A wrong or malformed version answers the shared validation code.

import { EULA_VERSION, isEulaVersionToken } from '../src/legal_versions';
import { acceptedEulaVersion, recordEulaAcceptance } from './eula_db';
import { ctxAccountId } from './http/context';
import { HttpError } from './http/errors';
import { withBody } from './http/middleware/body';
import { requireAccount } from './http/middleware/require_account';
import type { Ctx, RouteDef } from './http/types';
import { json } from './http_util';

/** GET /api/eula: the current version and what this account last accepted. */
async function eulaStatusHandler(ctx: Ctx): Promise<void> {
  json(ctx.res, 200, {
    current: EULA_VERSION,
    accepted: await acceptedEulaVersion(ctxAccountId(ctx)),
  });
}

/** POST /api/eula/accept { version }: record acceptance of the CURRENT version. */
async function eulaAcceptHandler(ctx: Ctx): Promise<void> {
  const version = (ctx.body as Record<string, unknown> | null | undefined)?.version;
  if (!isEulaVersionToken(version) || version !== EULA_VERSION) {
    throw new HttpError(400, 'validation.failed', { issues: 'version' });
  }
  await recordEulaAcceptance(ctxAccountId(ctx), version);
  json(ctx.res, 200, { accepted: version });
}

const readAccount = requireAccount({ scope: 'read' });
const activeAccount = requireAccount({ scope: 'active' });

export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/eula',
    surface: 'api',
    middleware: [readAccount],
    handler: eulaStatusHandler,
  },
  {
    method: 'POST',
    path: '/api/eula/accept',
    surface: 'api',
    middleware: [activeAccount, withBody()],
    handler: eulaAcceptHandler,
  },
];
