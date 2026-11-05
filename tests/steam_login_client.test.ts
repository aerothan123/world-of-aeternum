// The client half of Steam sign-in: src/net/steam_login_client.ts (the POST and
// the Api session hand-off) and src/ui/steam_login.ts steamLoginErrorText (the
// error line the login panel shows).
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/net/api_error';
import { Api } from '../src/net/online';
import { steamLogin, steamLoginAdvertised } from '../src/net/steam_login_client';
import { steamLoginErrorText } from '../src/ui/steam_login';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe('steamLogin', () => {
  it('posts the ticket and persona hint, then adopts the returned session', async () => {
    const api = new Api();
    const { calls, impl } = fakeFetch(200, {
      token: 't'.repeat(64),
      username: 'Bramble',
      emailMissing: true,
      created: true,
    });
    await expect(steamLogin(api, 'abcd', 'Bramble', impl)).resolves.toEqual({ created: true });
    expect(calls[0].url).toMatch(/\/api\/auth\/steam$/);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      ticket: 'abcd',
      personaName: 'Bramble',
    });
    expect(api.token).toBe('t'.repeat(64));
    expect(api.username).toBe('Bramble');
    expect(api.emailMissing).toBe(true);
  });

  it('throws the server code and leaves the session untouched on failure', async () => {
    const api = new Api();
    const { impl } = fakeFetch(400, { code: 'steam.invalid_ticket' });
    await expect(steamLogin(api, 'abcd', '', impl)).rejects.toBeInstanceOf(ApiError);
    expect(api.token).toBeNull();
  });

  it('reads the status advert fail-closed', () => {
    expect(steamLoginAdvertised({ steam: { enabled: true, login: true } })).toBe(true);
    expect(steamLoginAdvertised({ steam: { enabled: true } })).toBe(false);
    expect(steamLoginAdvertised({ steam: { enabled: false, login: true } })).toBe(false);
    expect(steamLoginAdvertised(null)).toBe(false);
  });
});

describe('steamLoginErrorText', () => {
  it('uses Steam sign-in wording for steam.* codes, not the link wording', () => {
    expect(steamLoginErrorText({ code: 'steam.invalid_ticket' })).toBe(
      'Could not sign in with Steam. Please try again.',
    );
    expect(steamLoginErrorText({ code: 'steam.disabled' })).toBe(
      'Steam sign-in is not available right now.',
    );
  });
});
