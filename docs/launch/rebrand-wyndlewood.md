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

- **Locale overlays** (the 20 non-English locales) still render the old brand
  ("World of ClaudeCraft" or "Project H") for every reworded English key: the
  English-only rule leaves overlays to the maintainer locale pass, and the
  registry does not mark a reworded row `pending`, so `npm run i18n:worklist`
  will NOT list them. The reworded keys (English changed on this branch versus
  `feature/player-housing`):
  `hudChrome.wiki.confirmBody`,
  `hudChrome.wocStore.title`,
  `hudChrome.wocStore.close`,
  `hudChrome.wocStore.tabsLabel`,
  `hudChrome.wocStore.loading`,
  `hudChrome.wocStore.error`,
  `hudChrome.wocStore.wallet.unlinked`,
  `hudChrome.wocStore.wallet.connectedUnlinked`,
  `hudChrome.wocStore.membershipPromo.open`,
  `hudChrome.nativeUpdate.body`,
  `hudChrome.nativeUpdate.bodyWithVersion`,
  `hudChrome.perf.diagnostics.panelAria`,
  `hudChrome.perf.diagnostics.title`,
  `hudChrome.perf.diagnostics.report.title`,
  `hudChrome.discord.panelTitle`,
  `hudChrome.steam.wishlistAria`,
  `hudChrome.cosmetics.storeOnly`,
  `hudChrome.cosmetics.skinsEmpty`,
  `hudChrome.reliquary.sourceStore`,
  `hudChrome.wocMarket.browserOnlyConfirmBody`,
  `guide.brand`,
  `guide.brandShort`,
  `guide.footer.rights`,
  `guide.home.title`,
  `guide.interfacePage.railBody`,
  `guide.glossary.claudiumDef`,
  `guide.worldPage.intro`,
  `footer.copyright`,
  `mode.playAria`,
  `wallet.standaloneAppHelp`,
  `wallet.manualReturnStandaloneHelp`,
  `wallet.browser.safety`,
  `wallet.browser.completeBody`,
  `playerCard.shareText`,
  `playerCard.nativeShareTitle`,
  `landing.records`,
  `landing.scout`,
  `landing.parseService`,
  `seo.title`,
  `seo.description`,
  `seo.officialLabel`,
  `seo.officialBody`,
  `a11y.githubProject`,
  `a11y.discordCommunity`,
  `a11y.donateProject`,
  `desktop.notify.updateReadyBody`,
  `desktop.crash.title`,
  `desktop.crash.fatalBody`,
  `mobilePreflight.iosOpenStep`,
  `mobilePreflight.androidOpenStep`,
  `serverUnavailable.title`,
  `serverUnavailable.logoAlt`,
  `serverUnavailable.body`.
  The server-matcher rows `world.entered` in `src/ui/server_i18n.ts` and
  `src/ui/server_i18n.newlocales.ts` were updated in place (brand token only).
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
