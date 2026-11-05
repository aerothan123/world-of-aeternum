// The Wyndlewood desktop identity (electron/brand.cjs) stays in lockstep with its
// twins (src/brand.ts, package.json build config), carries no upstream domain or
// id, and keeps an existing install's user-data folder across the rename (save
// and settings compatibility).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEEP_LINK_SCHEME,
  DESKTOP_APP_ID,
  LEGACY_USER_DATA_NAMES,
  PRODUCT_NAME,
  PRODUCTION_API_ORIGIN,
  resolveUserDataDir,
} from '../electron/brand.cjs';
import { DEFAULT_DISCORD_APP_ID, resolveDiscordClientId } from '../electron/discord_presence.cjs';
import { DESKTOP_DEEP_LINK_SCHEME, GAME_NAME, STEAM_STORE_URL } from '../src/brand';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('desktop brand identity', () => {
  it('matches src/brand.ts and the electron-builder config', () => {
    expect(PRODUCT_NAME).toBe('Wyndlewood');
    expect(GAME_NAME).toBe(PRODUCT_NAME);
    expect(DEEP_LINK_SCHEME).toBe(DESKTOP_DEEP_LINK_SCHEME);
    expect(pkg.build.appId).toBe(DESKTOP_APP_ID);
    expect(pkg.build.productName).toBe(PRODUCT_NAME);
    expect(pkg.build.protocols[0].schemes).toEqual([DEEP_LINK_SCHEME]);
  });

  it('ships no upstream identifier or domain in the packaging identity', () => {
    for (const value of [DESKTOP_APP_ID, DEEP_LINK_SCHEME, PRODUCTION_API_ORIGIN]) {
      expect(value.toLowerCase()).not.toContain('claudecraft');
    }
    expect(JSON.stringify(pkg.build).toLowerCase()).not.toContain('worldofclaudecraft');
    expect(STEAM_STORE_URL).not.toContain('4897790');
  });

  it('the main process reads the scheme and name from the brand module', () => {
    const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
    expect(main).toContain('const deepLinkProtocol = DEEP_LINK_SCHEME;');
    expect(main).toContain('title: PRODUCT_NAME,');
    expect(main).not.toContain("'worldofclaudecraft:'");
    // The renderer origin keeps the upstream name ON PURPOSE: localStorage is
    // keyed by origin, so renaming it would reset every install's local data.
    expect(main).toContain("const APP_ORIGIN = 'app://worldofclaudecraft';");
  });
});

describe('user-data folder across the rename', () => {
  const appData = '/home/p/.config';
  const join = (...parts: string[]) => path.posix.join(...parts);
  const current = join(appData, 'Wyndlewood');

  it('keeps an existing legacy folder when the new one does not exist yet', () => {
    for (const legacy of LEGACY_USER_DATA_NAMES) {
      const old = join(appData, legacy);
      const exists = (p: string) => p === old;
      expect(resolveUserDataDir({ current, appData, exists, join })).toBe(old);
    }
  });

  it('uses the new folder once it exists, or on a fresh install', () => {
    const legacy = join(appData, 'Project H');
    expect(
      resolveUserDataDir({ current, appData, exists: (p) => p === current || p === legacy, join }),
    ).toBe(current);
    expect(resolveUserDataDir({ current, appData, exists: () => false, join })).toBe(current);
  });

  it('main.cjs applies the resolution before the first user-data read', () => {
    const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
    const set = main.indexOf("app.setPath(\n  'userData',");
    const firstRead = main.indexOf('const desktopPrefsPath = path.join(app.getPath');
    expect(set).toBeGreaterThan(-1);
    expect(set).toBeLessThan(firstRead);
  });
});

describe('Discord Rich Presence id is config-driven', () => {
  it('bakes no application id', () => {
    expect(DEFAULT_DISCORD_APP_ID).toBeNull();
    expect(resolveDiscordClientId({})).toBeNull();
  });

  it('uses the build stamp, and the env overrides it (off keeps it inert)', () => {
    const stamped = '123456789012345678';
    expect(resolveDiscordClientId({}, stamped)).toBe(stamped);
    expect(resolveDiscordClientId({ WOC_DISCORD_APP_ID: '987654321098765432' }, stamped)).toBe(
      '987654321098765432',
    );
    expect(resolveDiscordClientId({ WOC_DISCORD_APP_ID: 'off' }, stamped)).toBeNull();
    expect(resolveDiscordClientId({}, 'not-an-id')).toBeNull();
  });
});
