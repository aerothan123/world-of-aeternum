// Steam login (POST /api/auth/steam, server/steam_login.ts) against a MOCKED
// Steam endpoint: the real fetch shell (server/steam/web_api.ts
// verifyLinkTicket) runs over a fake fetch that answers like
// ISteamUserAuth/AuthenticateUserTicket, and accounts live in an in-memory
// store. Covers first-login provisioning, returning login, the identity
// binding, replay refusal, bans, moderation, the env gates and the race arm.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_steam_login_units';

import type * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx, RouteDef } from '../../server/http/types';
import { resetRateLimitClock, resetRateLimits, setRateLimitClock } from '../../server/ratelimit';
import { LOGIN_TICKET_IDENTITY, TICKET_IDENTITY } from '../../server/steam/ticket';
import { verifyLinkTicket } from '../../server/steam/web_api';
import {
  configureSteamLoginRuntime,
  routes,
  type SteamLoginDeps,
  setSteamLoginDepsForTests,
} from '../../server/steam_login';
import {
  createTicketReplayGuard,
  steamUsernameBase,
  ticketDigest,
} from '../../server/steam_login_core';
import { type FakeRes, fakeCtx } from './helpers';

const STEAM_ID = '76561198000000042';
const TICKET = 'ab'.repeat(60);

interface SteamCall {
  url: URL;
}

/** A fake partner.steam-api.com: answers by the ticket and identity it receives. */
function fakeSteam(opts: { steamId?: string; banned?: boolean; down?: boolean } = {}) {
  const calls: SteamCall[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push({ url });
    if (opts.down) throw new Error('ECONNRESET');
    if (url.searchParams.get('identity') !== LOGIN_TICKET_IDENTITY) {
      return new Response(JSON.stringify({ response: { error: { errorcode: 101 } } }), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({
        response: {
          params: {
            result: 'OK',
            steamid: opts.steamId ?? STEAM_ID,
            ownersteamid: opts.steamId ?? STEAM_ID,
            vacbanned: opts.banned === true,
            publisherbanned: false,
          },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/** In-memory accounts + steam_links. */
function fakeStore() {
  let nextId = 100;
  const accounts = new Map<number, { username: string; locked: boolean }>();
  const links = new Map<string, number>();
  const sessions: { accountId: number; token: string }[] = [];
  const discarded: number[] = [];
  const reports: { accountId: number; username: string; ip: string }[] = [];
  const twoFactor = new Map<number, string>();
  const ownership: { answer: 'owned' | 'not_owned' | 'upstream' } = { answer: 'owned' };
  const deps: Partial<SteamLoginDeps> = {
    accountForSteamId: async (steamId) => links.get(steamId) ?? null,
    insertSteamLink: async (accountId, steamId) => {
      if (links.has(steamId)) return 'steam_taken';
      links.set(steamId, accountId);
      return 'ok';
    },
    usernameTaken: async (username) =>
      [...accounts.values()].some((a) => a.username.toLowerCase() === username.toLowerCase()),
    provisionAccount: async (username) => {
      const id = nextId++;
      accounts.set(id, { username, locked: false });
      return { id };
    },
    discardProvision: async (accountId) => {
      discarded.push(accountId);
      accounts.delete(accountId);
    },
    moderationStatus: async (accountId) => ({
      locked: accounts.get(accountId)?.locked === true,
      banned: accounts.get(accountId)?.locked === true,
      suspendedUntil: null,
      deactivated: false,
      message: 'banned',
    }),
    issueSession: async (accountId) => {
      const token = `tok-${accountId}-${sessions.length}`;
      sessions.push({ accountId, token });
      return { token, username: accounts.get(accountId)?.username ?? 'player', emailMissing: true };
    },
    ownsApp: async () => ownership.answer,
    twoFactorStanding: async (accountId) => ({
      username: accounts.get(accountId)?.username ?? '',
      enabled: twoFactor.has(accountId),
    }),
    verifyTwoFactor: async (accountId, code) => twoFactor.get(accountId) === code,
    reportRegistration: (input) => {
      reports.push(input);
    },
    randomHex: (bytes) => 'c'.repeat(bytes * 2),
    now: () => 1_000_000,
  };
  return { accounts, links, sessions, discarded, reports, twoFactor, ownership, deps };
}

function route(): RouteDef {
  const r = routes.find((x) => x.method === 'POST' && x.path === '/api/auth/steam');
  if (!r) throw new Error('route missing');
  return r;
}

async function runRoute(ctx: Ctx): Promise<void> {
  const r = route();
  const chain = r.middleware ?? [];
  let i = -1;
  const next = async (): Promise<void> => {
    i++;
    if (i < chain.length) await chain[i](ctx, next);
    else await r.handler(ctx);
  };
  await next();
}

function loginCtx(body: unknown): Ctx {
  return fakeCtx({
    method: 'POST',
    url: '/api/auth/steam',
    headers: { 'content-type': 'application/json', origin: 'app://worldofclaudecraft' },
    body,
  });
}

function captured(res: http.ServerResponse): { status: number; body: Record<string, unknown> } {
  const fake = res as unknown as FakeRes;
  return { status: fake.statusCode, body: fake.body ? JSON.parse(fake.body) : {} };
}

const ENV_KEYS = ['STEAM_ENABLED', 'STEAM_APP_ID', 'STEAM_WEB_API_KEY', 'STEAM_LOGIN_ENABLED'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.STEAM_ENABLED = '1';
  process.env.STEAM_APP_ID = '480';
  process.env.STEAM_WEB_API_KEY = 'raw-test-publisher-value';
  delete process.env.STEAM_LOGIN_ENABLED;
  configureSteamLoginRuntime({ isIpBlocked: () => false, passesTurnstile: async () => true });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  setSteamLoginDepsForTests();
  resetRateLimits();
});

function install(steam = fakeSteam(), store = fakeStore()) {
  setSteamLoginDepsForTests({
    ...store.deps,
    verify: (opts) => verifyLinkTicket(opts, steam.fetchImpl),
  });
  return { steam, store };
}

describe('POST /api/auth/steam (mocked Steam endpoint)', () => {
  it('first login provisions an account from the persona hint, links it, and signs in', async () => {
    const { steam, store } = install();
    const ctx = loginCtx({ ticket: TICKET, personaName: 'Bramble Fox!' });
    await runRoute(ctx);
    const res = captured(ctx.res);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'BrambleFox', created: true });
    expect(typeof res.body.token).toBe('string');
    expect(store.links.get(STEAM_ID)).toBe(100);
    // The server, not the client, chose the id: it came from the verified response.
    const call = steam.calls[0].url;
    expect(call.origin).toBe('https://partner.steam-api.com');
    expect(call.searchParams.get('identity')).toBe(LOGIN_TICKET_IDENTITY);
    expect(call.searchParams.get('appid')).toBe('480');
    expect(call.searchParams.get('ticket')).toBe(TICKET);
  });

  it('a returning Steam id signs in to the SAME account without provisioning', async () => {
    const { store } = install();
    store.accounts.set(7, { username: 'OldHand', locked: false });
    store.links.set(STEAM_ID, 7);
    const ctx = loginCtx({ ticket: TICKET });
    await runRoute(ctx);
    expect(captured(ctx.res).body).toMatchObject({ username: 'OldHand', created: false });
    expect(store.accounts.size).toBe(1);
  });

  it('a first login reports the new account to the registration abuse signals', async () => {
    const { store } = install();
    await runRoute(loginCtx({ ticket: TICKET, personaName: 'Bramble' }));
    expect(store.reports).toHaveLength(1);
    expect(store.reports[0]).toMatchObject({ username: 'Bramble' });
    // A returning login is not a registration.
    await runRoute(loginCtx({ ticket: 'cd'.repeat(60) }));
    expect(store.reports).toHaveLength(1);
  });

  it('refuses to provision for a Steam account that does not own the game', async () => {
    const store = fakeStore();
    store.ownership.answer = 'not_owned';
    install(fakeSteam(), store);
    await expect(runRoute(loginCtx({ ticket: TICKET }))).rejects.toMatchObject({
      status: 403,
      code: 'steam.not_owned',
    });
    expect(store.accounts.size).toBe(0);
    store.ownership.answer = 'upstream';
    await expect(runRoute(loginCtx({ ticket: 'cd'.repeat(60) }))).rejects.toMatchObject({
      status: 503,
      code: 'steam.upstream',
    });
    expect(store.accounts.size).toBe(0);
  });

  it('caps new accounts per IP per day (a Steam account farm cannot mint unbounded accounts)', async () => {
    let n = 0;
    const steam = {
      calls: [] as SteamCall[],
      fetchImpl: (async (input: string | URL) => {
        const url = new URL(String(input));
        const id = `7656119800000${String(1000 + n++)}`;
        return new Response(
          JSON.stringify({
            response: {
              params: {
                result: 'OK',
                steamid: id,
                ownersteamid: id,
                vacbanned: false,
                publisherbanned: false,
              },
            },
          }),
          { status: url ? 200 : 500 },
        );
      }) as typeof fetch,
    };
    const { store } = install(steam);
    for (let i = 0; i < 3; i++) await runRoute(loginCtx({ ticket: `${i}a`.repeat(60) }));
    expect(store.accounts.size).toBe(3);
    await expect(runRoute(loginCtx({ ticket: '9a'.repeat(60) }))).rejects.toMatchObject({
      status: 429,
      code: 'auth.too_many_attempts',
    });
    expect(store.accounts.size).toBe(3);
  });

  it('caps ticket claims per IP, so a flood cannot evict real claims from the guard', async () => {
    install();
    // Step the per-IP auth limiter's clock a minute per request so only the
    // claim budget (on the fixed deps clock, one 10-minute window) can refuse.
    let clock = 0;
    setRateLimitClock(() => (clock += 61_000));
    try {
      for (let i = 0; i < 30; i++) {
        await runRoute(loginCtx({ ticket: i.toString(16).padStart(2, '0').repeat(60) }));
      }
      await expect(runRoute(loginCtx({ ticket: 'ef'.repeat(60) }))).rejects.toMatchObject({
        status: 429,
        code: 'auth.too_many_attempts',
      });
    } finally {
      resetRateLimitClock();
    }
  });

  it('a two-factor account answers twoFactorRequired, then needs a FRESH ticket plus the code', async () => {
    const { store } = install();
    await runRoute(loginCtx({ ticket: TICKET }));
    const accountId = store.links.get(STEAM_ID) as number;
    store.twoFactor.set(accountId, '123456');
    const sessionsBefore = store.sessions.length;

    const challenge = loginCtx({ ticket: 'd1'.repeat(60) });
    await runRoute(challenge);
    expect(captured(challenge.res)).toEqual({ status: 200, body: { twoFactorRequired: true } });
    expect(store.sessions).toHaveLength(sessionsBefore);

    await expect(
      runRoute(loginCtx({ ticket: 'd2'.repeat(60), code: '000000' })),
    ).rejects.toMatchObject({ status: 401, code: 'two_factor.code_invalid' });
    // The spent challenge ticket cannot be reused with the code.
    await expect(
      runRoute(loginCtx({ ticket: 'd1'.repeat(60), code: '123456' })),
    ).rejects.toMatchObject({ status: 400, code: 'steam.invalid_ticket' });

    const ok = loginCtx({ ticket: 'd3'.repeat(60), code: '123456' });
    await runRoute(ok);
    expect(captured(ok.res).status).toBe(200);
    expect(store.sessions).toHaveLength(sessionsBefore + 1);
  });

  it('the login identity is not the link identity (a link ticket cannot sign in)', () => {
    expect(LOGIN_TICKET_IDENTITY).toBe('wyndlewood-login');
    expect(LOGIN_TICKET_IDENTITY).not.toBe(TICKET_IDENTITY);
  });

  it('refuses a replayed ticket even though Steam would accept it again', async () => {
    const { steam } = install();
    await runRoute(loginCtx({ ticket: TICKET }));
    await expect(runRoute(loginCtx({ ticket: TICKET }))).rejects.toMatchObject({
      status: 400,
      code: 'steam.invalid_ticket',
    });
    expect(steam.calls).toHaveLength(1);
  });

  it('an upstream outage is 503 and does NOT spend the ticket', async () => {
    install(fakeSteam({ down: true }));
    await expect(runRoute(loginCtx({ ticket: TICKET }))).rejects.toMatchObject({
      status: 503,
      code: 'steam.upstream',
    });
    const { store } = install();
    const ctx = loginCtx({ ticket: TICKET });
    await runRoute(ctx);
    expect(captured(ctx.res).status).toBe(200);
    expect(store.links.size).toBe(1);
  });

  it('refuses a VAC-banned Steam account 403 steam.banned and provisions nothing', async () => {
    const { store } = install(fakeSteam({ banned: true }));
    await expect(runRoute(loginCtx({ ticket: TICKET }))).rejects.toMatchObject({
      status: 403,
      code: 'steam.banned',
    });
    expect(store.accounts.size).toBe(0);
  });

  it('a banned game account gets the moderation body, never a session', async () => {
    const { store } = install();
    store.accounts.set(7, { username: 'Griefer', locked: true });
    store.links.set(STEAM_ID, 7);
    const ctx = loginCtx({ ticket: TICKET });
    await runRoute(ctx);
    expect(captured(ctx.res)).toMatchObject({ status: 403, body: { code: 'moderation.banned' } });
    expect(store.sessions).toHaveLength(0);
  });

  it('rejects a malformed ticket without asking Steam', async () => {
    const { steam } = install();
    await expect(runRoute(loginCtx({ ticket: 'not-hex' }))).rejects.toMatchObject({
      status: 400,
      code: 'steam.invalid_ticket',
    });
    expect(steam.calls).toHaveLength(0);
  });

  it('is dark unless STEAM_ENABLED=1, and STEAM_LOGIN_ENABLED=0 keeps link-only', async () => {
    install();
    delete process.env.STEAM_ENABLED;
    await expect(runRoute(loginCtx({ ticket: TICKET }))).rejects.toMatchObject({
      code: 'steam.disabled',
    });
    process.env.STEAM_ENABLED = '1';
    process.env.STEAM_LOGIN_ENABLED = '0';
    await expect(runRoute(loginCtx({ ticket: TICKET }))).rejects.toMatchObject({
      code: 'steam.disabled',
    });
  });

  it('enabled but unprovisioned (no publisher key) answers 503 steam.upstream', async () => {
    install();
    delete process.env.STEAM_WEB_API_KEY;
    await expect(runRoute(loginCtx({ ticket: TICKET }))).rejects.toMatchObject({
      status: 503,
      code: 'steam.upstream',
    });
  });

  it('an IP-blocked or Turnstile-failing caller is stopped before Steam is asked', async () => {
    const { steam } = install();
    configureSteamLoginRuntime({ isIpBlocked: () => true, passesTurnstile: async () => true });
    const blocked = loginCtx({ ticket: TICKET });
    await runRoute(blocked);
    expect(captured(blocked.res).status).toBe(429);
    configureSteamLoginRuntime({ isIpBlocked: () => false, passesTurnstile: async () => false });
    const bot = loginCtx({ ticket: TICKET });
    await runRoute(bot);
    expect(captured(bot.res).status).toBe(403);
    expect(steam.calls).toHaveLength(0);
  });

  it('a concurrent first login losing the link race discards its account and joins the winner', async () => {
    const store = fakeStore();
    const realInsert = store.deps.insertSteamLink;
    store.deps.insertSteamLink = async (accountId, steamId) => {
      // Another request linked this Steam id between our lookup and insert.
      store.accounts.set(55, { username: 'Winner', locked: false });
      store.links.set(steamId, 55);
      return realInsert?.(accountId, steamId) ?? 'steam_taken';
    };
    install(fakeSteam(), store);
    const ctx = loginCtx({ ticket: TICKET });
    await runRoute(ctx);
    expect(captured(ctx.res).body).toMatchObject({ username: 'Winner', created: false });
    expect(store.discarded).toEqual([100]);
  });

  it('a successful response carries no Steam id or publisher key', async () => {
    install();
    const ctx = loginCtx({ ticket: TICKET });
    await runRoute(ctx);
    const raw = (ctx.res as unknown as FakeRes).body;
    expect(raw).not.toContain(STEAM_ID);
    expect(raw).not.toContain('raw-test-publisher-value');
  });
});

describe('steam_login_core', () => {
  const never = () => false;

  it('derives a clean username from the persona hint', () => {
    expect(steamUsernameBase('Bramble Fox!', 'abcd1234', never)).toBe('BrambleFox');
    expect(steamUsernameBase('x'.repeat(40), 'abcd1234', never)).toHaveLength(18);
  });

  it('falls back to steam+hex for empty, short, non-string or offensive hints', () => {
    expect(steamUsernameBase('', 'abcd1234', never)).toBe('steamabcd1234');
    expect(steamUsernameBase('ab', 'abcd1234', never)).toBe('steamabcd1234');
    expect(steamUsernameBase(42, 'abcd1234', never)).toBe('steamabcd1234');
    expect(steamUsernameBase('rude', 'abcd1234', () => true)).toBe('steamabcd1234');
  });

  it('the replay guard is single-use inside the TTL, then forgets', () => {
    let now = 0;
    const guard = createTicketReplayGuard({ now: () => now, ttlMs: 1000 });
    const d = ticketDigest('aa');
    expect(guard.claim(d)).toBe(true);
    expect(guard.claim(d)).toBe(false);
    now = 1001;
    expect(guard.claim(d)).toBe(true);
    guard.release(d);
    expect(guard.claim(d)).toBe(true);
  });

  it('the replay guard is bounded (oldest evicted first)', () => {
    const guard = createTicketReplayGuard({ now: () => 0, ttlMs: 1000, maxEntries: 3 });
    for (const t of ['a', 'b', 'c', 'd']) guard.claim(ticketDigest(t));
    expect(guard.size()).toBe(3);
    expect(guard.claim(ticketDigest('a'))).toBe(true);
    expect(guard.claim(ticketDigest('d'))).toBe(false);
  });

  it('a digest never holds the ticket itself', () => {
    expect(ticketDigest(TICKET)).not.toContain(TICKET);
    expect(ticketDigest(TICKET)).toMatch(/^[0-9a-f]{64}$/);
  });
});
