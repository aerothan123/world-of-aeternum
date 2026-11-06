// Steam login: POST /api/auth/steam { ticket, personaName? }.
//
// The Wyndlewood Steam build signs a player in with nothing but their Steam
// session: the desktop shell mints a web-api auth ticket bound to
// LOGIN_TICKET_IDENTITY (electron/steam.cjs), this route proves it upstream
// with the publisher key (ISteamUserAuth/AuthenticateUserTicket, the same
// verifier the link route uses), and the VERIFIED Steam id resolves to an
// account through steam_links. A Steam id with no link yet provisions a fresh
// account (no password, no email) plus its link on the spot, so the player
// never creates a separate account. Existing email/Discord accounts keep their
// login and gain Steam login by linking from the account panel
// (POST /api/steam/link, unchanged).
//
// Lives OUTSIDE server/steam/ on purpose: that directory is pinned credential-
// free (tests/server/steam_routes.test.ts scans it for the token surface), and
// this is the one module that mints a session from a Steam proof.
//
// Trust: the client never names its Steam id; the persona name it may send is
// an untrusted hint that only seeds the provisioned username. Tickets are
// single-use per process (steam_login_core.ts createTicketReplayGuard), the
// route is per-IP rate limited and IP-block gated, the shared Turnstile gate
// is declared (desktop origins pass it by Origin, the documented softening),
// and banned or suspended accounts are refused like every other login.

import { randomBytes } from 'node:crypto';
import type * as http from 'node:http';
import { verifyLoginTwoFactor } from './account';
import { hashPassword, newToken, offensiveName } from './auth';
import {
  accountById,
  createAccount,
  findAccount,
  moderationStatusForAccount,
  pool,
  saveToken,
  touchLogin,
} from './db';
import { deleteUnusedFederatedProvision } from './federated_auth_db';
import { HttpError } from './http/errors';
import { withBody } from './http/middleware/body';
import { turnstile } from './http/middleware/turnstile';
import type { Ctx, Middleware, RouteDef } from './http/types';
import { isUniqueViolation, json, moderationErrorBody } from './http_util';
import { createSuspiciousRegistrationReport } from './moderation_db';
import {
  authThrottled,
  clearAuthFailures,
  rateLimited,
  recordAuthFailure,
  requestIp,
} from './ratelimit';
import { steamAppId, steamLoginEnabled, steamWebApiKey } from './steam/config';
import { accountForSteamId, insertSteamLink } from './steam/steam_db';
import { isTicketShape, LOGIN_TICKET_IDENTITY } from './steam/ticket';
import {
  checkAppOwnership,
  type OwnershipOutcome,
  type VerifyOutcome,
  verifyLinkTicket,
} from './steam/web_api';
import {
  createTicketReplayGuard,
  createWindowBudget,
  STEAM_NEW_ACCOUNT_WINDOW_MS,
  STEAM_NEW_ACCOUNTS_PER_IP,
  STEAM_TICKET_CLAIM_WINDOW_MS,
  STEAM_TICKET_CLAIMS_PER_IP,
  steamUsernameBase,
  ticketDigest,
} from './steam_login_core';

/** Every IO edge the handler touches, injectable so the route tests run with
 *  a mocked Steam endpoint and an in-memory account store (no pg, no network). */
export interface SteamLoginDeps {
  verify(opts: {
    key: string;
    appId: number;
    ticket: string;
    identity: string;
  }): Promise<VerifyOutcome>;
  accountForSteamId(steamId: string): Promise<number | null>;
  insertSteamLink(
    accountId: number,
    steamId: string,
  ): Promise<'ok' | 'account_linked' | 'steam_taken'>;
  provisionAccount(
    username: string,
    meta: { ip: string; userAgent: string },
  ): Promise<{ id: number }>;
  usernameTaken(username: string): Promise<boolean>;
  discardProvision(accountId: number): Promise<void>;
  moderationStatus(
    accountId: number,
  ): Promise<Parameters<typeof moderationErrorBody>[0] & { locked: boolean }>;
  issueSession(
    accountId: number,
    meta: { ip: string; userAgent: string },
  ): Promise<{ token: string; username: string; emailMissing: boolean }>;
  /** Whether the verified Steam id owns the app (asked only before a NEW account). */
  ownsApp(opts: { key: string; appId: number; steamId: string }): Promise<OwnershipOutcome>;
  /** The account's login name and whether it has two-factor on. */
  twoFactorStanding(accountId: number): Promise<{ username: string; enabled: boolean }>;
  /** Verify a TOTP or recovery code (replay-guarded, server/account.ts). */
  verifyTwoFactor(accountId: number, code: string, recoveryCode: string): Promise<boolean>;
  /** The registration abuse signals every fresh account gets (fire-and-forget). */
  reportRegistration(input: {
    accountId: number;
    username: string;
    ip: string;
    userAgent: string;
  }): void;
  randomHex(bytes: number): string;
  now(): number;
}

/** The main.ts-owned pieces (cycle-free injection, like configureAppleAuthRuntime). */
export interface SteamLoginRuntime {
  isIpBlocked(ip: string): boolean;
  passesTurnstile(req: http.IncomingMessage, body: Record<string, unknown>): Promise<boolean>;
}

let runtime: SteamLoginRuntime = {
  isIpBlocked: () => false,
  // Fail closed until boot wires the real gate.
  passesTurnstile: async () => false,
};

export function configureSteamLoginRuntime(rt: SteamLoginRuntime): void {
  runtime = rt;
}

/** The full row (totp columns included) that verifyLoginTwoFactor needs:
 *  accountById's info row omits them, findAccount carries them. */
async function fullAccountRow(accountId: number) {
  const info = await accountById(accountId);
  if (!info) return null;
  const full = await findAccount(info.username);
  return full && full.id === accountId ? full : null;
}

const defaultDeps: SteamLoginDeps = {
  verify: (opts) => verifyLinkTicket(opts),
  accountForSteamId,
  insertSteamLink,
  provisionAccount: async (username, meta) =>
    createAccount(username, await hashPassword(newToken()), meta, { passwordSet: false }),
  usernameTaken: async (username) => (await findAccount(username)) !== null,
  discardProvision: async (accountId) => {
    await deleteUnusedFederatedProvision(pool, accountId);
  },
  moderationStatus: (accountId) => moderationStatusForAccount(accountId),
  issueSession: async (accountId, meta) => {
    await touchLogin(accountId, meta);
    const token = newToken();
    await saveToken(token, accountId, undefined, 'full', 'steam');
    const account = await accountById(accountId);
    return {
      token,
      username: account?.username ?? 'player',
      emailMissing: !account?.email?.trim(),
    };
  },
  ownsApp: (opts) => checkAppOwnership(opts),
  twoFactorStanding: async (accountId) => {
    const full = await fullAccountRow(accountId);
    return { username: full?.username ?? '', enabled: Boolean(full?.totp_enabled_at) };
  },
  verifyTwoFactor: async (accountId, code, recoveryCode) => {
    const full = await fullAccountRow(accountId);
    return full ? verifyLoginTwoFactor(full, code, recoveryCode) : false;
  },
  reportRegistration: (input) => {
    void createSuspiciousRegistrationReport(input).catch((err) =>
      console.error('[steam] suspicious registration report failed', err),
    );
  },
  randomHex: (bytes) => randomBytes(bytes).toString('hex'),
  now: () => Date.now(),
};

let deps: SteamLoginDeps = defaultDeps;
let replayGuard = createTicketReplayGuard({ now: () => deps.now() });
let claimBudget = newClaimBudget();
let newAccountBudget = newAccountBudgetFor();

function newClaimBudget() {
  return createWindowBudget({
    now: () => deps.now(),
    windowMs: STEAM_TICKET_CLAIM_WINDOW_MS,
    max: STEAM_TICKET_CLAIMS_PER_IP,
  });
}
function newAccountBudgetFor() {
  return createWindowBudget({
    now: () => deps.now(),
    windowMs: STEAM_NEW_ACCOUNT_WINDOW_MS,
    max: STEAM_NEW_ACCOUNTS_PER_IP,
  });
}

/** Swap in fakes (tests only). Passing nothing restores the real deps. Always
 *  resets the replay guard so cases never share claimed tickets. */
export function setSteamLoginDepsForTests(overrides?: Partial<SteamLoginDeps>): void {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps;
  replayGuard = createTicketReplayGuard({ now: () => deps.now() });
  claimBudget = newClaimBudget();
  newAccountBudget = newAccountBudgetFor();
}

/** How many provisioning attempts a username collision may take before the
 *  random fallback name (the apple_auth.ts provisionAppleAccount ladder). */
const PROVISION_ATTEMPTS = 8;

async function provisionSteamAccount(
  personaHint: unknown,
  meta: { ip: string; userAgent: string },
): Promise<{ id: number; username: string }> {
  const base = steamUsernameBase(personaHint, deps.randomHex(4), offensiveName);
  for (let attempt = 0; attempt < PROVISION_ATTEMPTS; attempt++) {
    const username = attempt === 0 ? base : `${base.slice(0, 18)}${deps.randomHex(2)}`;
    if (await deps.usernameTaken(username)) continue;
    try {
      return { ...(await deps.provisionAccount(username, meta)), username };
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  const fallback = `steam${deps.randomHex(8).slice(0, 18)}`;
  return { ...(await deps.provisionAccount(fallback, meta)), username: fallback };
}

/** Resolve (or create) the account the verified Steam id signs in to. */
async function accountForVerifiedSteamId(
  steamId: string,
  personaHint: unknown,
  meta: { ip: string; userAgent: string },
): Promise<{ accountId: number; created: boolean }> {
  const existing = await deps.accountForSteamId(steamId);
  if (existing !== null) return { accountId: existing, created: false };
  // A NEW account: the registration abuse rails every signup path carries.
  // A per-IP daily budget (a Steam account farm cannot mint unbounded realm
  // accounts from one address), then proof the Steam account owns the game
  // (a free Steam account is not a customer), then the shared suspicious-
  // registration report once the account exists.
  if (!newAccountBudget.take(meta.ip)) throw new HttpError(429, 'auth.too_many_attempts');
  const appId = steamAppId();
  const key = steamWebApiKey();
  if (appId === null || key === null) throw new HttpError(503, 'steam.upstream');
  const owned = await deps.ownsApp({ key, appId, steamId });
  if (owned === 'upstream') throw new HttpError(503, 'steam.upstream');
  if (owned === 'not_owned') throw new HttpError(403, 'steam.not_owned');
  const account = await provisionSteamAccount(personaHint, meta);
  const inserted = await deps.insertSteamLink(account.id, steamId);
  if (inserted === 'ok') {
    deps.reportRegistration({ accountId: account.id, username: account.username, ...meta });
    return { accountId: account.id, created: true };
  }
  // A concurrent first sign-in for the same Steam id won the link: drop the
  // now-unreachable account we just made and sign in to the winner's.
  await deps.discardProvision(account.id);
  const winner = await deps.accountForSteamId(steamId);
  if (winner === null) throw new HttpError(503, 'steam.upstream');
  return { accountId: winner, created: false };
}

/** POST /api/auth/steam. */
async function steamLoginHandler(ctx: Ctx): Promise<void> {
  if (!steamLoginEnabled()) throw new HttpError(503, 'steam.disabled');
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const ticket = body.ticket;
  if (!isTicketShape(ticket)) throw new HttpError(400, 'steam.invalid_ticket');
  const appId = steamAppId();
  const key = steamWebApiKey();
  if (appId === null || key === null) throw new HttpError(503, 'steam.upstream');

  // Claim only after the shape check, and cap how many claims one address
  // plants (STEAM_TICKET_CLAIMS_PER_IP), so a flood cannot evict real claims.
  const ip = requestIp(ctx.req);
  if (!claimBudget.take(ip)) throw new HttpError(429, 'auth.too_many_attempts');
  const digest = ticketDigest(ticket.toLowerCase());
  if (!replayGuard.claim(digest)) throw new HttpError(400, 'steam.invalid_ticket');
  const outcome = await deps.verify({ key, appId, ticket, identity: LOGIN_TICKET_IDENTITY });
  if (outcome.kind === 'upstream') {
    // Steam was never asked successfully, so the ticket is unspent: let a retry use it.
    replayGuard.release(digest);
    throw new HttpError(503, 'steam.upstream');
  }
  if (outcome.kind === 'invalid' || outcome.kind === 'malformed') {
    throw new HttpError(400, 'steam.invalid_ticket');
  }
  if (outcome.kind === 'banned') throw new HttpError(403, 'steam.banned');

  const meta = { ip, userAgent: String(ctx.req.headers['user-agent'] ?? '') };
  const { accountId, created } = await accountForVerifiedSteamId(
    outcome.steamId,
    body.personaName,
    meta,
  );
  const status = await deps.moderationStatus(accountId);
  if (status.locked) {
    json(ctx.res, 403, moderationErrorBody(status));
    return;
  }
  // Two-factor is never skipped by Steam: an account with TOTP on answers the
  // same { twoFactorRequired } contract as /api/login, and the client retries
  // with a FRESH ticket plus the code (the first ticket is spent).
  if (!created) {
    const factor = await deps.twoFactorStanding(accountId);
    if (factor.enabled) {
      if (factor.username && !authThrottled(factor.username).allowed) {
        throw new HttpError(429, 'auth.too_many_failed_attempts');
      }
      const code = typeof body.code === 'string' ? body.code : '';
      const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode : '';
      if (!code && !recoveryCode) {
        json(ctx.res, 200, { twoFactorRequired: true });
        return;
      }
      if (!(await deps.verifyTwoFactor(accountId, code, recoveryCode))) {
        if (factor.username) recordAuthFailure(factor.username);
        throw new HttpError(401, 'two_factor.code_invalid');
      }
      if (factor.username) clearAuthFailures(factor.username);
    }
  }
  const session = await deps.issueSession(accountId, meta);
  json(ctx.res, 200, { ...session, created });
}

/** Per-IP auth limiter plus the IP-block gate, before any body work. Same
 *  legacy body the login routes answer, so the client matcher already knows it. */
const steamLoginGate: Middleware = async (ctx, next) => {
  if (!rateLimited(ctx.req).allowed || runtime.isIpBlocked(requestIp(ctx.req))) {
    json(ctx.res, 429, {
      error: 'too many attempts, wait a minute and try again',
      code: 'auth.too_many_attempts',
    });
    return;
  }
  await next();
};

const turnstileGuard: Middleware = turnstile({
  verify: (req, body) => runtime.passesTurnstile(req, body),
});

export const routes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/auth/steam',
    surface: 'api',
    middleware: [steamLoginGate, withBody(), turnstileGuard],
    handler: steamLoginHandler,
  },
];
