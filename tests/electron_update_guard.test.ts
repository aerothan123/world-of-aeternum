import { describe, expect, it } from 'vitest';
import {
  apiOriginKey,
  evaluateUpdateOffer,
  isProductionApiOrigin,
  PRODUCTION_API_ORIGIN,
  updateChannelForOrigin,
} from '../electron/update_guard.cjs';

// The prod/dev update-track split (desktop auto-update). One origin rule is
// shared by the build (scripts/electron-builder-config.mjs decides which feed
// files a build emits) and the runtime (electron/desktop_config.cjs decides
// which feed a build reads; electron/updater.cjs refuses cross-origin
// artifacts), so these pins protect both sides at once.

// A sample production origin for the track-split pins: Wyndlewood has none
// provisioned yet (electron/brand.cjs PRODUCTION_API_ORIGIN is empty), so the
// rule is exercised through the explicit `production` parameter.
const PROD = 'https://wyndlewood.example';

describe('PRODUCTION_API_ORIGIN', () => {
  it('is unprovisioned: never an upstream domain, and every build reads the dev track', () => {
    expect(PRODUCTION_API_ORIGIN).toBe('');
    expect(isProductionApiOrigin('https://wyndlewood.example')).toBe(false);
    expect(updateChannelForOrigin('https://wyndlewood.example')).toBe('dev');
  });
});

describe('apiOriginKey', () => {
  it('normalizes equivalent spellings to one origin', () => {
    expect(apiOriginKey('https://wyndlewood.example')).toBe('https://wyndlewood.example');
    expect(apiOriginKey('https://wyndlewood.example/')).toBe('https://wyndlewood.example');
    expect(apiOriginKey('HTTPS://Wyndlewood.EXAMPLE')).toBe('https://wyndlewood.example');
    expect(apiOriginKey('http://localhost:8787')).toBe('http://localhost:8787');
  });

  it('returns null for garbage, empty, non-string, and non-http values', () => {
    expect(apiOriginKey('')).toBeNull();
    expect(apiOriginKey('wyndlewood.example')).toBeNull();
    expect(apiOriginKey('not a url')).toBeNull();
    expect(apiOriginKey(42)).toBeNull();
    expect(apiOriginKey(undefined)).toBeNull();
    expect(apiOriginKey('ftp://wyndlewood.example')).toBeNull();
  });
});

describe('isProductionApiOrigin', () => {
  it('accepts only the production origin (slash and case tolerant)', () => {
    expect(isProductionApiOrigin('https://wyndlewood.example', PROD)).toBe(true);
    expect(isProductionApiOrigin('https://wyndlewood.example/', PROD)).toBe(true);
  });

  it('rejects dev, staging, localhost, http, subdomains, and garbage', () => {
    expect(isProductionApiOrigin('https://dev.wyndlewood.example', PROD)).toBe(false);
    expect(isProductionApiOrigin('http://wyndlewood.example', PROD)).toBe(false);
    expect(isProductionApiOrigin('http://localhost:8787', PROD)).toBe(false);
    expect(isProductionApiOrigin('https://wyndlewood.example.evil.example', PROD)).toBe(false);
    expect(isProductionApiOrigin('', PROD)).toBe(false);
    expect(isProductionApiOrigin(undefined, PROD)).toBe(false);
  });
});

describe('updateChannelForOrigin (the track split)', () => {
  it('production origin publishes and reads the latest channel', () => {
    expect(updateChannelForOrigin('https://wyndlewood.example', PROD)).toBe('latest');
    expect(updateChannelForOrigin('https://wyndlewood.example/', PROD)).toBe('latest');
  });

  it('every non-production origin fails safe onto the dev channel', () => {
    expect(updateChannelForOrigin('https://dev.wyndlewood.example', PROD)).toBe('dev');
    expect(updateChannelForOrigin('http://localhost:8787', PROD)).toBe('dev');
    expect(updateChannelForOrigin('', PROD)).toBe('dev');
    expect(updateChannelForOrigin('garbage', PROD)).toBe('dev');
    expect(updateChannelForOrigin(undefined, PROD)).toBe('dev');
  });
});

describe('evaluateUpdateOffer (the runtime cross-track refusal)', () => {
  const own = 'https://wyndlewood.example';

  it('accepts an offer stamped with the same origin, slash tolerant', () => {
    expect(
      evaluateUpdateOffer({ apiOrigin: own, info: { version: '0.23.0', wocApiOrigin: own } }),
    ).toEqual({ ok: true, stamped: true });
    expect(
      evaluateUpdateOffer({
        apiOrigin: own,
        info: { wocApiOrigin: 'https://wyndlewood.example/' },
      }),
    ).toEqual({ ok: true, stamped: true });
  });

  it('accepts a pre-split feed file with no stamp (back compat), flagged unstamped', () => {
    expect(evaluateUpdateOffer({ apiOrigin: own, info: { version: '0.23.0' } })).toEqual({
      ok: true,
      stamped: false,
    });
    expect(evaluateUpdateOffer({ apiOrigin: own, info: { wocApiOrigin: '' } })).toEqual({
      ok: true,
      stamped: false,
    });
    // A valueless `wocApiOrigin:` yml line parses to null; same back-compat arm.
    expect(evaluateUpdateOffer({ apiOrigin: own, info: { wocApiOrigin: null } })).toEqual({
      ok: true,
      stamped: false,
    });
    expect(evaluateUpdateOffer({ apiOrigin: own })).toEqual({ ok: true, stamped: false });
  });

  it('refuses an offer baked for another backend (the issue 1537 flip)', () => {
    const verdict = evaluateUpdateOffer({
      apiOrigin: own,
      info: { version: '0.23.0', wocApiOrigin: 'https://dev.wyndlewood.example' },
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.offeredOrigin).toBe('https://dev.wyndlewood.example');
    expect(verdict.expectedOrigin).toBe(own);
  });

  it('refuses a localhost smoke-test artifact offered to a production install', () => {
    expect(
      evaluateUpdateOffer({ apiOrigin: own, info: { wocApiOrigin: 'http://localhost:8787' } }).ok,
    ).toBe(false);
  });

  it('refuses rather than guesses when either side is unverifiable', () => {
    // Present-but-garbage stamp: suspicious artifact, never install it.
    expect(evaluateUpdateOffer({ apiOrigin: own, info: { wocApiOrigin: 'garbage' } }).ok).toBe(
      false,
    );
    const numeric = evaluateUpdateOffer({ apiOrigin: own, info: { wocApiOrigin: 42 } });
    expect(numeric.ok).toBe(false);
    expect(numeric.offeredOrigin).toBe('42');
    // Own origin unverifiable: cannot prove the offer matches, so refuse.
    expect(evaluateUpdateOffer({ apiOrigin: 'garbage', info: { wocApiOrigin: own } }).ok).toBe(
      false,
    );
  });

  it('a dev install accepts its own dev-track artifact', () => {
    expect(
      evaluateUpdateOffer({
        apiOrigin: 'https://dev.wyndlewood.example',
        info: { wocApiOrigin: 'https://dev.wyndlewood.example' },
      }),
    ).toEqual({ ok: true, stamped: true });
  });
});
