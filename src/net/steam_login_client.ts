// POST /api/auth/steam from the desktop shell's Steam login ticket. A sibling of
// online.ts (a monolith under the line ratchet) that drives the shared Api's
// public session fields, the same way the Api's own login methods set them.
// The server verifies the ticket upstream and answers the session; the client
// never names a Steam id.

import { apiUrl } from '../client_origin';
import { apiErrorFromBody } from './api_error';
import type { Api } from './online';

export interface SteamLoginResult {
  /** True when this sign-in created the account (a first Steam login). */
  created: boolean;
}

export async function steamLogin(
  api: Api,
  ticket: string,
  personaName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamLoginResult> {
  const res = await fetchImpl(apiUrl('/api/auth/steam', api.base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket, personaName }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw apiErrorFromBody(data, res.status);
  if (typeof data.token !== 'string' || typeof data.username !== 'string') {
    throw apiErrorFromBody(data, 502);
  }
  api.token = data.token;
  api.username = data.username;
  api.emailMissing = data.emailMissing === true;
  return { created: data.created === true };
}

/** The status advert's Steam login capability. Fails closed. */
export function steamLoginAdvertised(statusDoc: unknown): boolean {
  const steam = (statusDoc as { steam?: { enabled?: unknown; login?: unknown } } | null)?.steam;
  return steam?.enabled === true && steam?.login === true;
}
