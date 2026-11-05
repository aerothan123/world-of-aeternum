// Pure (IO-free apart from node:crypto hashing) core of Steam login
// (POST /api/auth/steam, server/steam_login.ts): the provisioned-username
// derivation and the per-process ticket replay guard. Kept beside the route
// shell so every branch unit-tests without a database or a network, the
// discord_oauth.ts versus discord.ts split.

import { createHash } from 'node:crypto';

/** Usernames are [A-Za-z0-9_]{3,24} (server/auth.ts validUsernameShape). The
 *  provisioned base stays at 18 so a 4-hex collision suffix still fits. */
export const STEAM_USERNAME_BASE_MAX = 18;

/**
 * The username base for an account a first Steam sign-in provisions. The
 * persona name is an UNTRUSTED hint from the desktop shell (the player's
 * public Steam display name): it only seeds the account's login name, never
 * a character name, and the Steam id always comes from the verified ticket.
 * Anything that does not survive the charset clamp, is too short, or trips
 * the profanity matcher falls back to `steam` plus random hex.
 */
export function steamUsernameBase(
  personaHint: unknown,
  randomHex: string,
  isOffensive: (name: string) => boolean,
): string {
  const raw = typeof personaHint === 'string' ? personaHint.slice(0, 64) : '';
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '').slice(0, STEAM_USERNAME_BASE_MAX);
  if (cleaned.length >= 3 && !isOffensive(cleaned)) return cleaned;
  return `steam${randomHex.replace(/[^0-9a-f]/gi, '').slice(0, 8)}`;
}

/** A stable digest of a ticket for the replay guard (never the ticket itself:
 *  the guard must hold nothing a heap dump could replay). */
export function ticketDigest(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}

/** How long a used login ticket stays refused. Steam web-api tickets live for
 *  minutes, so ten covers the whole window with margin. */
export const LOGIN_TICKET_REPLAY_TTL_MS = 10 * 60 * 1000;
/** Hard bound on remembered digests: a flood can never grow the map without
 *  limit (oldest entries are evicted first; the per-IP auth limiter in front
 *  keeps a legitimate realm far below this). */
export const LOGIN_TICKET_REPLAY_MAX = 20_000;

export interface TicketReplayGuard {
  /** Claim a digest. False when it was already claimed inside the TTL. */
  claim(digest: string): boolean;
  /** Release a claim (the verify never reached Steam, so the ticket was not
   *  spent and the player may retry with it). */
  release(digest: string): void;
  size(): number;
}

/**
 * Single-use login tickets, per process. A web-api ticket can be presented to
 * AuthenticateUserTicket more than once inside its lifetime, so without this a
 * ticket captured in transit (or replayed from a compromised client log) would
 * mint a second session. The guard is per process: Wyndlewood runs ONE realm
 * process, so this covers the whole login surface; a multi-realm deploy must
 * move it into Postgres (named in server/steam/CLAUDE.md).
 */
export function createTicketReplayGuard(opts: {
  now: () => number;
  ttlMs?: number;
  maxEntries?: number;
}): TicketReplayGuard {
  const ttl = opts.ttlMs ?? LOGIN_TICKET_REPLAY_TTL_MS;
  const max = opts.maxEntries ?? LOGIN_TICKET_REPLAY_MAX;
  // Insertion-ordered: the first key is always the oldest claim.
  const seen = new Map<string, number>();

  function sweep(nowMs: number): void {
    for (const [digest, expiresAt] of seen) {
      if (expiresAt > nowMs) break;
      seen.delete(digest);
    }
  }

  return {
    claim(digest) {
      const nowMs = opts.now();
      sweep(nowMs);
      const expiresAt = seen.get(digest);
      if (expiresAt !== undefined && expiresAt > nowMs) return false;
      seen.delete(digest);
      seen.set(digest, nowMs + ttl);
      while (seen.size > max) {
        const oldest = seen.keys().next().value;
        if (oldest === undefined) break;
        seen.delete(oldest);
      }
      return true;
    },
    release(digest) {
      seen.delete(digest);
    },
    size() {
      return seen.size;
    },
  };
}
