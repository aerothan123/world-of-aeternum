import { apiUrl } from '../client_origin';
import type { Api } from '../net/online';
import { DESKTOP_APP } from '../net/online';
import { steamLogin, steamLoginAdvertised } from '../net/steam_login_client';
import type { DesktopBridge } from '../runtime';
import { desktopBridge } from '../runtime';
import { userFacingApiError } from './api_error_i18n';
import { t } from './i18n';
import { classifyAuthCode } from './two_factor_setup';

// "Continue with Steam" on the login panel: Steam sign-in with no separate
// account (server/steam_login.ts). Shown ONLY when the desktop shell can mint
// a Steam ticket (the Steam build, or the unpackaged WOC_STEAM_DEV=1 loop) AND
// the server advertises steam.login, so a website build or a dark server shows
// nothing. Extracted beside steam_link.ts so src/main.ts stays a firewall: main
// passes one callback (its completeOnlineAuth) and nothing else.

/** Map a failed sign-in to the line the login panel shows. Steam-family codes
 *  get Steam sign-in wording (the apiError.steam.* lines talk about linking);
 *  everything else (moderation, rate limits) keeps its own localized reason. */
export function steamLoginErrorText(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'steam.disabled') return t('hudChrome.auth.steamUnavailable');
  if (typeof code === 'string' && code.startsWith('steam.') && code !== 'steam.banned') {
    return t('hudChrome.auth.steamError');
  }
  return userFacingApiError(err);
}

async function shellCanSignIn(bridge: DesktopBridge | null): Promise<boolean> {
  if (typeof bridge?.steamLoginTicket !== 'function') return false;
  if (typeof bridge.steamLinkSupported !== 'function') return false;
  try {
    return (await bridge.steamLinkSupported()) === true;
  } catch {
    return false;
  }
}

async function serverAdvertisesLogin(api: Api): Promise<boolean> {
  try {
    const res = await fetch(apiUrl('/api/status', api.base), {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    return steamLoginAdvertised(await res.json());
  } catch {
    return false;
  }
}

function showLoginError(text: string): void {
  const el = document.getElementById('login-error');
  if (el) el.textContent = text;
}

let signInFlight = false;

async function startSteamSignIn(
  api: Api,
  bridge: DesktopBridge,
  onSignedIn: () => Promise<void>,
): Promise<void> {
  if (signInFlight) return;
  signInFlight = true;
  const button = document.getElementById('btn-login-steam') as HTMLButtonElement | null;
  if (button) button.disabled = true;
  try {
    let minted: { ticket: string; personaName: string } | null = null;
    try {
      minted = (await bridge.steamLoginTicket?.()) ?? null;
    } catch {
      minted = null;
    }
    if (!minted?.ticket) {
      showLoginError(t('hudChrome.auth.steamNoTicket'));
      return;
    }
    // Two-factor accounts: the shared login code field (#login-2fa-field) the
    // password login reveals is reused, so the second click carries the code.
    const twoFaField = document.getElementById('login-2fa-field') as HTMLElement | null;
    const twoFaInput = document.getElementById('login-2fa-code') as HTMLInputElement | null;
    const raw = twoFaField && !twoFaField.hidden ? (twoFaInput?.value ?? '') : '';
    const factor = raw ? classifyAuthCode(raw) : { code: '', recoveryCode: '' };
    try {
      const result = await steamLogin(api, minted.ticket, minted.personaName ?? '', fetch, factor);
      if (result.twoFactorRequired) {
        if (twoFaField) twoFaField.hidden = false;
        twoFaInput?.focus();
        showLoginError(t('auth.twoFactorHint'));
        return;
      }
    } catch (err) {
      console.error('[steam] sign-in failed', err);
      showLoginError(steamLoginErrorText(err));
      return;
    }
    showLoginError('');
    await onSignedIn();
  } finally {
    signInFlight = false;
    if (button) button.disabled = false;
    try {
      await bridge.steamLoginSettled?.();
    } catch {
      // A settle-signal failure must never surface to the player.
    }
  }
}

/** Reveal and wire the Steam sign-in button when both ends support it. */
export async function wireSteamLogin(api: Api, onSignedIn: () => Promise<void>): Promise<void> {
  const button = document.getElementById('btn-login-steam');
  if (!button) return;
  const bridge = DESKTOP_APP ? desktopBridge() : null;
  if (!bridge || !(await shellCanSignIn(bridge))) return;
  if (!(await serverAdvertisesLogin(api))) return;
  button.hidden = false;
  const divider = document.getElementById('auth-or-divider');
  if (divider) divider.hidden = false;
  button.addEventListener('click', (e) => {
    e.preventDefault();
    void startSteamSignIn(api, bridge, onSignedIn);
  });
}
