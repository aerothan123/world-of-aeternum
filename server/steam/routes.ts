// The Steam link surface: three registry-only RouteDefs (no legacy-ladder
// twin, by design, like server/deeds.ts). Everything answers steam.disabled
// until STEAM_ENABLED=1.
//
// THE HARD RULE, pinned by tests/server/steam_routes.test.ts: nothing in
// server/steam/ calls newToken, reads or writes auth_tokens, or mints any
// credential. Steam LOGIN exists since the Wyndlewood Early Access decision,
// but it lives OUTSIDE this directory (server/steam_login.ts) so the link
// surface stays credential-free. What changed for these routes: a
// steam_links row can now be the ONLY way into an account, so the link is
// itself a login credential, and these routes guard it like one:
//   - a link ticket is single-use (its own replay guard, per-IP claim cap);
//   - linking needs the account password and, with two-factor on, a code
//     (a stolen bearer token alone can never plant a lasting Steam login that
//     skips two-factor);
//   - reclaim-by-proof never takes a link from an account holding characters
//     (decided inside the displace transaction), and the displaced account is
//     emailed;
//   - unlink is one check-and-delete statement that refuses to strip the last
//     way in (a verified email counts, an unverified one does not).
//
// POST /api/steam/link { ticket }: the client (desktop shell only in v1)
// obtains a Steam session ticket bound to the wocc-link identity and posts
// its hex form; the SERVER verifies it upstream with the publisher key and
// extracts the Steam id from the verified response. The client is never
// trusted to name its own Steam id. VAC/publisher-banned accounts are
// refused. On success the reconcile job pushes every already-earned mapped
// deed to Steam, fire-and-forget.

import { ctxAccountId } from '../http/context';
import { HttpError } from '../http/errors';
import { withBody } from '../http/middleware/body';
import { rateLimit, STEAM_LINK_POLICY } from '../http/middleware/rate_limit';
import { requireAccount } from '../http/middleware/require_account';
import type { Ctx, Middleware, RouteDef } from '../http/types';
import { json } from '../http_util';
import { authThrottled, clearAuthFailures, recordAuthFailure, requestIp } from '../ratelimit';
import {
  createTicketReplayGuard,
  createWindowBudget,
  STEAM_TICKET_CLAIM_WINDOW_MS,
  STEAM_TICKET_CLAIMS_PER_IP,
  ticketDigest,
} from '../steam_login_core';
import { steamAppId, steamEnabled, steamWebApiKey } from './config';
import { onLinkChanged, reconcileLink } from './mirror';
import {
  accountForSteamId,
  deleteSteamLinkIfReachable,
  displaceSteamLink,
  insertSteamLink,
  steamLinkForAccount,
} from './steam_db';
import { isTicketShape } from './ticket';
import { verifyLinkTicket } from './web_api';

/** The account-security edges the link route needs (step-up and the
 *  displaced-account notice), injectable so the route tests run without a
 *  database. The defaults import lazily, keeping this directory's import
 *  graph free of the account/auth modules (and of any credential mint). */
export interface SteamLinkRouteDeps {
  /** What the account must prove to link: its password (when it has one) and
   *  a two-factor code (when two-factor is on). */
  stepUpNeeds(accountId: number): Promise<{ username: string; password: boolean; code: boolean }>;
  verifyPassword(accountId: number, password: string): Promise<boolean>;
  verifyTwoFactor(accountId: number, code: string, recoveryCode: string): Promise<boolean>;
  throttled(username: string): boolean;
  recordFailure(username: string): void;
  clearFailures(username: string): void;
  notifyDisplaced(accountId: number): Promise<void>;
  now(): number;
}

const defaultDeps: SteamLinkRouteDeps = {
  stepUpNeeds: async (accountId) => {
    const db = await import('../db');
    const info = await db.accountById(accountId);
    if (!info) return { username: '', password: false, code: false };
    const full = await db.findAccount(info.username);
    return {
      username: info.username,
      password: info.password_set === true,
      code: Boolean(full && full.id === accountId && full.totp_enabled_at),
    };
  },
  verifyPassword: async (accountId, password) => {
    const [{ accountById }, { verifyPassword }] = await Promise.all([
      import('../db'),
      import('../auth'),
    ]);
    const info = await accountById(accountId);
    return info ? verifyPassword(password, info.password_hash) : false;
  },
  verifyTwoFactor: async (accountId, code, recoveryCode) => {
    const [db, { verifyLoginTwoFactor }] = await Promise.all([
      import('../db'),
      import('../account'),
    ]);
    const info = await db.accountById(accountId);
    const full = info ? await db.findAccount(info.username) : null;
    return full && full.id === accountId ? verifyLoginTwoFactor(full, code, recoveryCode) : false;
  },
  throttled: (username) => !authThrottled(username).allowed,
  recordFailure: (username) => recordAuthFailure(username),
  clearFailures: (username) => clearAuthFailures(username),
  notifyDisplaced: async (accountId) => {
    const [{ accountById }, { emailSteamLinkMoved }] = await Promise.all([
      import('../db'),
      import('../email'),
    ]);
    const info = await accountById(accountId);
    if (info?.email?.trim()) emailSteamLinkMoved(info);
  },
  now: () => Date.now(),
};

let deps: SteamLinkRouteDeps = defaultDeps;

function newLinkGuards() {
  return {
    replay: createTicketReplayGuard({ now: () => deps.now() }),
    claims: createWindowBudget({
      now: () => deps.now(),
      windowMs: STEAM_TICKET_CLAIM_WINDOW_MS,
      max: STEAM_TICKET_CLAIMS_PER_IP,
    }),
  };
}
// A link ticket is single-use like a login ticket, in its OWN guard (the two
// identities never share digests, so a link claim can never block a login).
let linkGuards = newLinkGuards();

/** Swap in fakes (tests only); nothing restores the real deps. Always resets
 *  the link replay guard so cases never share claimed tickets. */
export function setSteamLinkRouteDepsForTests(overrides?: Partial<SteamLinkRouteDeps>): void {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps;
  linkGuards = newLinkGuards();
}

/** Step-up before linking: a bearer token is not enough to plant a lasting
 *  login. Answers the stable steam.reauth_required 401 (with which proofs are
 *  owed) until the body carries them, and the shared auth failure throttle
 *  counts wrong answers like a failed password login. */
async function requireLinkStepUp(accountId: number, body: Record<string, unknown>): Promise<void> {
  const needs = await deps.stepUpNeeds(accountId);
  if (!needs.password && !needs.code) return;
  if (needs.username && deps.throttled(needs.username)) {
    throw new HttpError(429, 'auth.too_many_failed_attempts');
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const code = typeof body.code === 'string' ? body.code : '';
  const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode : '';
  if ((needs.password && !password) || (needs.code && !code && !recoveryCode)) {
    // Param names avoid `code`: problem bodies spread params beside the
    // reserved `code` member, which would overwrite it.
    throw new HttpError(401, 'steam.reauth_required', {
      needPassword: needs.password ? 1 : 0,
      needCode: needs.code ? 1 : 0,
    });
  }
  if (needs.password && !(await deps.verifyPassword(accountId, password))) {
    if (needs.username) deps.recordFailure(needs.username);
    throw new HttpError(401, 'auth.password_incorrect');
  }
  if (needs.code && !(await deps.verifyTwoFactor(accountId, code, recoveryCode))) {
    if (needs.username) deps.recordFailure(needs.username);
    throw new HttpError(401, 'two_factor.code_invalid');
  }
  if (needs.username) deps.clearFailures(needs.username);
}

/** The feature gate, FIRST on every route (before auth): with the flag off
 *  the whole surface answers the stable steam.disabled 503, bearer or not. */
const steamDisabledGuard: Middleware = async (_ctx, next) => {
  if (!steamEnabled()) throw new HttpError(503, 'steam.disabled');
  await next();
};

/** POST /api/steam/link { ticket }: verify and store the caller's link. */
async function linkHandler(ctx: Ctx): Promise<void> {
  const accountId = ctxAccountId(ctx);
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const ticket = body.ticket;
  if (!isTicketShape(ticket)) throw new HttpError(400, 'steam.invalid_ticket');

  // Enabled but not provisioned (no app id or publisher key yet) reads as the
  // upstream being unreachable: a 503 the player can retry, never a 500.
  const appId = steamAppId();
  const key = steamWebApiKey();
  if (appId === null || key === null) throw new HttpError(503, 'steam.upstream');

  // Cheap conflict first: an already-linked account never burns an upstream
  // verification call.
  if ((await steamLinkForAccount(accountId)) !== null) {
    throw new HttpError(409, 'steam.already_linked');
  }
  await requireLinkStepUp(accountId, body);

  // Claim only after the shape and step-up checks, capped per address.
  if (!linkGuards.claims.take(requestIp(ctx.req))) {
    throw new HttpError(429, 'auth.too_many_attempts');
  }
  const digest = ticketDigest(`link:${ticket.toLowerCase()}`);
  if (!linkGuards.replay.claim(digest)) throw new HttpError(400, 'steam.invalid_ticket');
  const outcome = await verifyLinkTicket({ key, appId, ticket });
  if (outcome.kind === 'upstream') {
    // Steam was never asked successfully: the ticket is unspent.
    linkGuards.replay.release(digest);
    throw new HttpError(503, 'steam.upstream');
  }
  if (outcome.kind === 'invalid' || outcome.kind === 'malformed') {
    throw new HttpError(400, 'steam.invalid_ticket');
  }
  if (outcome.kind === 'banned') throw new HttpError(403, 'steam.banned');
  const steamId = outcome.steamId;

  const owner = await accountForSteamId(steamId);
  if (owner !== null && owner !== accountId) {
    // Reclaim-by-proof, NOT a 409: this Steam id is currently linked to a
    // DIFFERENT WoCC account, but the caller just proved CURRENT control of the
    // Steam account with a fresh verified ticket, strictly stronger evidence
    // than the stale (possibly stolen) ticket the squatter linked with. Displace
    // the old row and hand the link to the true owner, so the account that
    // controls the Steam login always wins in steady state. (The server-issued
    // identity-challenge in ticket.ts is the stronger future design; today the
    // fresh-ticket displacement is the reclaim path.)
    // Never take a link from an account that holds characters, whatever other
    // logins it has (displaceSteamLink decides under its row lock and answers
    // holder_protected). Only an EMPTY holder (the "clicked Continue with
    // Steam before linking my old account" path) may be displaced, and it is
    // emailed when it has an address.
    const displaced = await displaceSteamLink(accountId, steamId);
    if (displaced.result === 'account_linked') throw new HttpError(409, 'steam.already_linked');
    if (displaced.result === 'steam_taken' || displaced.result === 'holder_protected') {
      throw new HttpError(409, 'steam.account_taken');
    }
    // Flip the displaced account's cached mirror view in-request so its
    // in-flight pushes revalidate against a now-empty link and drop, exactly as
    // unlink does. A peer realm process still heals via its own push-time read.
    if (displaced.displacedAccountId !== null) {
      onLinkChanged(displaced.displacedAccountId, null);
      void deps
        .notifyDisplaced(displaced.displacedAccountId)
        .catch((err) => console.error('[steam] displaced-link notice failed', err));
    }
  } else {
    // The Steam id is free. Plain insert; it re-classifies a 23505 in case a
    // concurrent request beat the pre-checks, both arms the same 409s the
    // pre-checks answer.
    const inserted = await insertSteamLink(accountId, steamId);
    if (inserted === 'account_linked') throw new HttpError(409, 'steam.already_linked');
    if (inserted === 'steam_taken') throw new HttpError(409, 'steam.account_taken');
  }

  reconcileLink(accountId, steamId);
  json(ctx.res, 200, { linked: true, steamId });
}

/** DELETE /api/steam/link: drop the caller's link. Idempotent (refused only
 *  when the link is the account's last way to sign in). */
async function unlinkHandler(ctx: Ctx): Promise<void> {
  const accountId = ctxAccountId(ctx);
  // A Steam-only account (no password, verified email, Discord or Apple) would
  // become unreachable without its link: refuse until the player adds another
  // login. Check and delete are one statement (deleteSteamLinkIfReachable).
  const result = await deleteSteamLinkIfReachable(accountId);
  if (result === 'last_login') throw new HttpError(409, 'steam.unlink_last_login');
  onLinkChanged(accountId, null);
  json(ctx.res, 200, { unlinked: true });
}

/** GET /api/steam/status: the caller's link state (enabled is always true
 *  here; with the flag off the guard answered first). */
async function statusHandler(ctx: Ctx): Promise<void> {
  const row = await steamLinkForAccount(ctxAccountId(ctx));
  json(ctx.res, 200, {
    enabled: true,
    linked: row !== null,
    ...(row === null ? {} : { steamId: row.steamId }),
  });
}

/** Mutation-tier bearer gate for link/unlink. */
const activeAccount = requireAccount({ scope: 'active' });
/** Read-tier bearer gate for the status read. */
const readAccount = requireAccount({ scope: 'read' });

export const routes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/steam/link',
    surface: 'api',
    // Order matters: the feature gate answers before auth (steam.disabled on
    // every call while dark), the limiter needs ctx.account so it mounts
    // behind the guard, and the body reader feeds the handler last.
    middleware: [steamDisabledGuard, activeAccount, rateLimit(STEAM_LINK_POLICY), withBody()],
    handler: linkHandler,
  },
  {
    method: 'DELETE',
    path: '/api/steam/link',
    surface: 'api',
    middleware: [steamDisabledGuard, activeAccount],
    handler: unlinkHandler,
  },
  {
    method: 'GET',
    path: '/api/steam/status',
    surface: 'api',
    middleware: [steamDisabledGuard, readAccount],
    handler: statusHandler,
  },
];
