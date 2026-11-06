// POST /api/steam/link with the step-up proof the server may demand
// (server/steam/routes.ts requireLinkStepUp). A sibling of online.ts (a
// monolith under the line ratchet), same request shape as its private post.

import { apiUrl } from '../client_origin';
import { apiErrorFromBody } from './api_error';
import type { Api } from './online';

export interface SteamLinkProof {
  password?: string;
  code?: string;
  recoveryCode?: string;
}

export async function steamLinkWithProof(
  api: Api,
  ticket: string,
  proof: SteamLinkProof = {},
  fetchImpl: typeof fetch = fetch,
): Promise<{ linked: boolean; steamId: string }> {
  // No proof owed (the first attempt): the Api's own link call, unchanged.
  if (!proof.password && !proof.code && !proof.recoveryCode) return api.steamLink(ticket);
  const res = await fetchImpl(apiUrl('/api/steam/link', api.base), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(api.token ? { Authorization: `Bearer ${api.token}` } : {}),
    },
    body: JSON.stringify({ ticket, ...proof }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw apiErrorFromBody(data, res.status);
  return data as unknown as { linked: boolean; steamId: string };
}

/** Which proofs a steam.reauth_required refusal asks for, or null for any
 *  other error. Reads the problem params the server sends (1 = owed). */
export function linkStepUpNeeds(err: unknown): { password: boolean; code: boolean } | null {
  const e = err as { code?: unknown; params?: Record<string, unknown> } | null;
  if (e?.code !== 'steam.reauth_required') return null;
  const flag = (v: unknown) => v === 1 || v === '1' || v === true;
  return { password: flag(e.params?.needPassword), code: flag(e.params?.needCode) };
}
