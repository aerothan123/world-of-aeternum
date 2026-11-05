# Wyndlewood rebrand: what changed, what did not, and owner actions

Branch `feature/rebrand`. Companion to `docs/launch/early-access-readiness.md`
(areas 4, 5, 7, 8) and the legal drafts in `docs/legal/`.

## Changed (display and packaging only)

- **Name.** `GAME_NAME` (`src/brand.ts`) is `Wyndlewood`; the English catalogs,
  static pages, PWA manifest, admin titles, server-sent text, Electron dialogs,
  window title, crash reporter, and installer metadata follow it.
- **Desktop identity** (`electron/brand.cjs`, pinned against `src/brand.ts` and
  `package.json` by `tests/electron_brand.test.ts`): productName `Wyndlewood`,
  appId `com.wyndlewood.desktop`, deep link `wyndlewood://`, installer names
  `wyndlewood-<version>-<os>-<arch>`.
- **Config points instead of upstream values:** the production API origin
  (`electron/brand.cjs` `PRODUCTION_API_ORIGIN`, empty: a release build must pass
  `VITE_DESKTOP_API_ORIGIN`), the Discord Rich Presence app id (build stamp from
  `WOC_DISCORD_APP_ID`, no baked id), the Discord invite
  (`COMMUNITY_DISCORD_INVITE_URL`), the Steam store page (`STEAM_STORE_URL`,
  empty: wishlist surfaces hidden), the legal page origin
  (`VITE_PUBLIC_SITE_ORIGIN`, else the API origin).
- **Brand art.** Logos, favicons, app icons, splash, and home background are
  regenerated in place from the owner's Wyndlewood crest and Vale banner by
  `scripts/brand/wyndlewood_brand_assets.mjs` (same paths and pixel sizes).
- **Trackers and payments.** Upstream Google Analytics and Meta Pixel removed;
  Ko-fi links removed; external checkout never opens on the desktop build.

## Deliberately NOT renamed (save and data compatibility)

- Internal identifiers, `woc_*` storage and save keys, wire names, ids, and
  asset file names.
- The renderer origin `app://worldofclaudecraft` (localStorage is keyed by
  origin; renaming it resets every install's settings, keybinds, and session).
- The user-data folder: the shell keeps an existing `Project H` or
  `World of ClaudeCraft` folder (`resolveUserDataDir`).
- The realm name `Project H` (`server/realm.ts` `DEFAULT_REALM_NAME`, shown on
  character select). Characters, guilds, and friends are scoped to the realm
  name, so changing it on an existing database orphans every character. Rename
  it only on a fresh database (`REALM_NAME=Wyndlewood`) or with a migration.
- The package `name` (`world-of-claudecraft`), which the Linux desktop-entry
  names derive from.
- The mobile (Capacitor) `worldofclaudecraft://discord-auth` scheme: the game is
  desktop-only and the native shells are out of scope.

## Not finished (follow-ups)

- **Locale overlays** still say "World of ClaudeCraft" or "Project H" in the 20
  non-English locales for every reworded brand key (English-only rule; the
  maintainer locale pass must refill them). The reworded keys are the
  `seo.*`, `a11y.*`, `pwa.*`, `update.*`, `mobilePreflight.*Open*`,
  `serverUnavailable.*`, `guide.brand*`, `hudChrome.wocStore.*`,
  `hudChrome.wikiConfirm.*`, `hudChrome.perfDiagnostics.*`, and
  `world.entered` server matcher rows; diff
  `src/ui/i18n.resolved.generated/en.ts` against `feature/player-housing` for the
  exact list.
- **Website-only surfaces** still point at upstream: SEO canonical and hreflang
  links, the landing desktop-download links (`updates.worldofclaudecraft.com`),
  `public/links.html`, `public/press.html`, `public/merch.html`, the sitemap,
  `public/llms.txt`, and the MediaWiki seed. They do not ship in the Steam
  depot's player flow but must be rewritten before a Wyndlewood website goes
  live.
- `build/icon.icns` (macOS) was not regenerated (desktop target is Windows).
- `$WOC` and Claudium store strings belong to the crypto removal (core-systems).

## Owner actions

1. Choose the publishing entity; fill `[PUBLISHER LEGAL NAME]` in
   `docs/legal/*`, `public/eula.html`, `public/terms.html`, `public/privacy.html`,
   `package.json` `author`, and `CREDITS.md`.
2. Lawyer review of every document in `docs/legal/`.
3. Register the domain; set `PRODUCTION_API_ORIGIN` in `electron/brand.cjs`,
   the support email (`support@wyndlewood.invalid` placeholders in
   `public/support.html`, `public/data-deletion.html`, `package.json`), and the
   update feed URL (`package.json` `build.publish.url`, a `.invalid` placeholder).
4. Create the Wyndlewood Discord application; build with
   `WOC_DISCORD_APP_ID=<id>`; set `COMMUNITY_DISCORD_INVITE_URL` and the server
   `DISCORD_INVITE_URL`.
5. Create the Steamworks app; set `STEAM_STORE_URL` and `WOC_STEAM_APP_ID`.
