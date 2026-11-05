// The client half of Steam sign-in: src/net/steam_login_client.ts (the POST and
// the Api session hand-off) and src/ui/steam_login.ts steamLoginErrorText (the
// error line the login panel shows).
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/net/api_error';
import { Api } from '../src/net/online';
import { linkStepUpNeeds, steamLinkWithProof } from '../src/net/steam_link_client';
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

  it('a two-factor challenge signs nothing in; the retry carries the code', async () => {
    const api = new Api();
    const challenge = fakeFetch(200, { twoFactorRequired: true });
    await expect(steamLogin(api, 'abcd', 'Bramble', challenge.impl)).resolves.toEqual({
      created: false,
      twoFactorRequired: true,
    });
    expect(api.token).toBeNull();
    const retry = fakeFetch(200, { token: 't'.repeat(64), username: 'Bramble', created: false });
    await steamLogin(api, 'ef01', 'Bramble', retry.impl, { code: '123456', recoveryCode: '' });
    expect(JSON.parse(String(retry.calls[0].init.body))).toEqual({
      ticket: 'ef01',
      personaName: 'Bramble',
      code: '123456',
    });
    expect(api.token).toBe('t'.repeat(64));
  });

  it('the link client sends the step-up proof and reads which proofs are owed', async () => {
    const api = new Api();
    api.token = 'b'.repeat(64);
    const owed = fakeFetch(401, { code: 'steam.reauth_required', needPassword: 1, needCode: 0 });
    const err = await steamLinkWithProof(api, 'abcd', {}, owed.impl).catch((e: unknown) => e);
    expect(linkStepUpNeeds(err)).toEqual({ password: true, code: false });
    expect(linkStepUpNeeds(new ApiError('x', 409, 'steam.account_taken'))).toBeNull();
    const ok = fakeFetch(200, { linked: true, steamId: '1' });
    await steamLinkWithProof(api, 'abcd', { password: 'hunter2' }, ok.impl);
    expect(JSON.parse(String(ok.calls[0].init.body))).toEqual({
      ticket: 'abcd',
      password: 'hunter2',
    });
    expect((ok.calls[0].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${'b'.repeat(64)}`,
    );
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
