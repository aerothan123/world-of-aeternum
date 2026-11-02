// The player-visible product name, in ONE place.
//
// "Project H" is a working title that will change again, so every code path
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
// admin dashboard catalog (src/admin/i18n.en.ts). Identifiers, ids, URLs,
// domains, the worldofclaudecraft:// protocol, and asset file names keep the
// upstream name and never change with it.
//
// Host-agnostic: no imports, no DOM, so src/sim, server/, bot/, and the client
// can all import it.

/** The product name players see. */
export const GAME_NAME = 'Project H';

/** The open-source project this game is built on (attribution copy only). */
export const UPSTREAM_NAME = 'World of ClaudeCraft';
