'use strict';

// The desktop shell's product identity, in ONE CommonJS place (electron/main.cjs
// and its pure siblings run outside the TypeScript build, so they cannot import
// src/brand.ts). tests/electron_brand.test.ts pins every value here against its
// twin: GAME_NAME and DESKTOP_DEEP_LINK_SCHEME in src/brand.ts, and the
// electron-builder appId, productName, and protocol scheme in package.json.
//
// Display and packaging only. The renderer origin APP_ORIGIN
// (app://worldofclaudecraft in electron/main.cjs) is deliberately NOT renamed:
// Chromium keys localStorage (settings, keybinds, the session) by origin, so a
// new origin would silently reset every installed player's local data.

/** The product name players see: window title, crash dialogs, installer, taskbar. */
const PRODUCT_NAME = 'Wyndlewood';

/** The electron-builder appId (Windows AppUserModelID, installer identity). */
const DESKTOP_APP_ID = 'com.wyndlewood.desktop';

/** The custom URL scheme that carries the browser sign-in handoff back to the app. */
const DEEP_LINK_SCHEME = 'wyndlewood';

/**
 * The production API origin, or '' until the owner provisions the Wyndlewood
 * domain. Never an upstream host. With it empty, every website build lives on
 * the 'dev' update track (electron/update_guard.cjs) and a release build must
 * name its origin explicitly (VITE_DESKTOP_API_ORIGIN, scripts/electron-build.mjs).
 * OWNER ACTION: set this once the domain exists.
 */
const PRODUCTION_API_ORIGIN = '';

/** The origin an UNCONFIGURED dev checkout talks to: the local server. */
const LOCAL_DEV_API_ORIGIN = 'http://localhost:8787';

/**
 * The user-data folder names earlier builds of this game used. Electron derives
 * the default folder from productName, so the rename to Wyndlewood would strand
 * an existing install's settings, local storage, window memory, and shader
 * cache in the old folder. resolveUserDataDir keeps using an old folder when
 * one exists and the new one does not yet.
 */
const LEGACY_USER_DATA_NAMES = Object.freeze([
  'Project H',
  'World of ClaudeCraft',
  'world-of-claudecraft',
]);

/**
 * Pick the user-data folder: the current (productName) folder when it exists or
 * when there is no legacy folder to keep; otherwise the first legacy folder that
 * exists beside it. Pure: `exists` and `join` are injected.
 */
function resolveUserDataDir({ current, appData, exists, join }) {
  if (typeof current !== 'string' || current === '') return current;
  if (exists(current)) return current;
  for (const name of LEGACY_USER_DATA_NAMES) {
    const candidate = join(appData, name);
    if (candidate !== current && exists(candidate)) return candidate;
  }
  return current;
}

module.exports = {
  PRODUCT_NAME,
  DESKTOP_APP_ID,
  DEEP_LINK_SCHEME,
  PRODUCTION_API_ORIGIN,
  LOCAL_DEV_API_ORIGIN,
  LEGACY_USER_DATA_NAMES,
  resolveUserDataDir,
};
