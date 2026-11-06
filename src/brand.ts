// The player-visible product name, in ONE place.
//
// The game is Wyndlewood (renamed from the working title "Project H"). Every code path
// that prints the game's name to a player (server-sent chat lines, transactional
// email, OAuth and wallet pages, the authenticator issuer, JSON-LD, the Discord
// bot) reads this constant instead of spelling the name out. The realm name
// (server/realm.ts DEFAULT_REALM_NAME) is a separate knob on purpose: a realm
// can be called something other than the product.
//
// What this constant cannot reach, and must be renamed by hand alongside it:
// the English i18n catalogs (src/ui/i18n.catalog/*.ts, plain values), the
// static site pages (index.html, play.html, public/*.html, the PWA manifest),
// the Electron shell strings (electron/shell_strings.cjs, CommonJS), and the
// admin dashboard catalog (src/admin/i18n.en.ts). The desktop shell's packaging
// identity (product name, appId, deep-link scheme) lives in electron/brand.cjs,
// pinned against this file by tests/electron_brand.test.ts. Internal
// identifiers, save keys, storage keys, the app:// renderer origin, and asset
// file names keep the upstream name: renaming them would break saves.
//
// Host-agnostic: no imports, no DOM, so src/sim, server/, bot/, and the client
// can all import it.

/** The product name players see. */
export const GAME_NAME = 'Wyndlewood';

/** The open-source project this game is built on (attribution copy only). */
export const UPSTREAM_NAME = 'World of ClaudeCraft';

/** The custom URL scheme the desktop app registers for the browser sign-in
 *  handoff (twin of electron/brand.cjs DEEP_LINK_SCHEME). */
export const DESKTOP_DEEP_LINK_SCHEME = 'wyndlewood';

/**
 * The community Discord invite every "Join our Discord" link opens.
 * OWNER ACTION: set this to the Wyndlewood server's permanent invite. Until then
 * the links open Discord's home page, never the upstream project's server.
 * (A live server can still override it at runtime: server/discord.ts reads
 * DISCORD_INVITE_URL and the client prefers the server-fed invite.)
 */
export const COMMUNITY_DISCORD_INVITE_URL = 'https://discord.com/';

/**
 * The Wyndlewood Steam store page the wishlist reminder links to, or '' while
 * the store page does not exist yet (every wishlist surface then stays hidden,
 * src/ui/steam_wishlist.ts). OWNER ACTION: set once the Steamworks app exists.
 */
export const STEAM_STORE_URL = '';
