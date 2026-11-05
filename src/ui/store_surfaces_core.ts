// Which store, membership and cosmetic-shop surfaces the client may reach
// (Wyndlewood Early Access: membership and the Claudium store are OFF unless a
// build turns them on, src/early_access_flags.ts). One pure answer every
// surface consults, so a switched-off build cannot leave a stray launcher, tab,
// advert, wallet chip or "sold in the store" card behind.
//
// The rules:
// - Nothing store-shaped is reachable while the Claudium switch is off: the
//   Store window and its launchers, the Claudium wallet window, the promo card,
//   the store-only cosmetic cards (the catalog a player has not bought into)
//   and the glossary's Claudium entry.
// - The Memberships tab and the membership advert also need the membership
//   switch: a realm can sell cosmetics without selling membership.
// - The Season 1 Armory data stays in src/sim/content/weapon_skins.ts and owned
//   skins stay wearable from the Cosmetics window; only the place that SELLS
//   them closes.
// Host-agnostic and DOM-free: callers pass the flags (the live build answer is
// BUILD_STORE_FLAGS) so the OFF branch is pinned directly by a unit test.

import { CLAUDIUM_ENABLED, type EarlyAccessFlags, MEMBERSHIP_ENABLED } from '../early_access_flags';

/** The live build's switches (Vite replaces both at build time). */
export const BUILD_STORE_FLAGS: EarlyAccessFlags = Object.freeze({
  membership: MEMBERSHIP_ENABLED,
  claudium: CLAUDIUM_ENABLED,
});

export type StoreTab = 'store' | 'memberships';

/** The Store window tabs this build offers, in strip order ([] when the store is off). */
export function storeTabs(flags: EarlyAccessFlags = BUILD_STORE_FLAGS): StoreTab[] {
  if (!flags.claudium) return [];
  return flags.membership ? ['store', 'memberships'] : ['store'];
}

/** Whether a Store tab may be opened or selected. */
export function storeTabAllowed(
  tab: StoreTab,
  flags: EarlyAccessFlags = BUILD_STORE_FLAGS,
): boolean {
  return storeTabs(flags).includes(tab);
}

/** Whether the Store launcher (the chest button, the mobile tray row, the
 *  wallet chip in the bags footer) is live: the build switch AND the online
 *  economy hooks, which only attach in an online session of a store build. */
export function storeLauncherLive(
  hooksAttached: boolean,
  flags: EarlyAccessFlags = BUILD_STORE_FLAGS,
): boolean {
  return flags.claudium && hooksAttached;
}

/** Whether a cosmetic the store SELLS may be listed before the player owns it
 *  (the Cosmetics window doubles as the store catalog only while it is open). */
export function storeCatalogListed(flags: EarlyAccessFlags = BUILD_STORE_FLAGS): boolean {
  return flags.claudium;
}

/** The store advert ids this build may show. */
export type StorePromoId = 'armory' | 'membership' | 'referral';
export function storePromoAllowed(
  id: StorePromoId,
  flags: EarlyAccessFlags = BUILD_STORE_FLAGS,
): boolean {
  if (!flags.claudium) return false;
  if (id === 'membership') return flags.membership;
  return true;
}

/** Glossary terms that describe the store, hidden while it is off. */
const STORE_GLOSSARY_SLUGS: ReadonlySet<string> = new Set(['claudium']);
export function glossaryTermListed(
  slug: string,
  flags: EarlyAccessFlags = BUILD_STORE_FLAGS,
): boolean {
  return flags.claudium || !STORE_GLOSSARY_SLUGS.has(slug);
}
