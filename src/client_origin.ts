// Shared browser/native URL policy for public assets and REST calls. This stays
// independent of the online world client so presentation modules can use the
// configured Capacitor production origin without importing net/.

import { isDesktopAppRuntime, normalizeOrigin, runtimeApiOrigin } from './runtime';

export const NATIVE_APP = String(import.meta.env.VITE_NATIVE_APP ?? '') === '1';
export const NATIVE_API_ORIGIN = normalizeOrigin(String(import.meta.env.VITE_API_ORIGIN ?? ''));
export const DESKTOP_APP = isDesktopAppRuntime();
export const DESKTOP_API_ORIGIN = DESKTOP_APP ? runtimeApiOrigin() : '';
/** The public site that serves the legal pages, for shells whose origin is not
 *  the site. Config-driven, never a hardcoded domain: VITE_PUBLIC_SITE_ORIGIN when
 *  the site lives apart from the game API, else the build's API origin (the game
 *  server serves /terms, /privacy and /eula itself, server/static_fallback.ts). */
export const PUBLIC_SITE_ORIGIN =
  normalizeOrigin(String(import.meta.env.VITE_PUBLIC_SITE_ORIGIN ?? '')) ||
  NATIVE_API_ORIGIN ||
  DESKTOP_API_ORIGIN;
/** The public Terms of Service page (src/ui/terms_link.ts reads it). */
export const CANONICAL_TERMS_URL = `${PUBLIC_SITE_ORIGIN}/terms`;
/** The public Privacy Policy page. */
export const CANONICAL_PRIVACY_URL = `${PUBLIC_SITE_ORIGIN}/privacy`;
/** The public End User License Agreement page. */
export const CANONICAL_EULA_URL = `${PUBLIC_SITE_ORIGIN}/eula`;

export function apiUrl(path: string, base = ''): string {
  if (/^https?:\/\//.test(path)) return path;
  const origin = normalizeOrigin(base) || NATIVE_API_ORIGIN || DESKTOP_API_ORIGIN;
  return origin ? `${origin}${path}` : path;
}
