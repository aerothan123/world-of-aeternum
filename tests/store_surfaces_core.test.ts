// Early Access store gating, client side (src/ui/store_surfaces_core.ts): with
// the Claudium and membership switches off, no store, membership or
// cosmetic-shop window, tab, advert or menu entry is reachable. The vitest env
// turns both switches ON (vite.config.ts) so the inherited store suites keep
// running; every OFF case here passes the flags explicitly.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEarlyAccessFlags } from '../src/early_access_flags';
import { MOUNT_SKIN_IDS as STORE_MOUNT_SKIN_IDS } from '../src/sim/content/mount_skins';
import { WEAPON_SKINS } from '../src/sim/content/weapon_skins';
import { wocStoreTabsHtml } from '../src/ui/daily_rewards_chrome_view';
import { type CosmeticsSnapshot, mountSkinCards } from '../src/ui/hud/cosmetics/cosmetics_view';
import { storePromoSlides } from '../src/ui/store_promo_card';
import {
  BUILD_STORE_FLAGS,
  glossaryTermListed,
  storeCatalogListed,
  storeLauncherLive,
  storePromoAllowed,
  storeTabAllowed,
  storeTabs,
} from '../src/ui/store_surfaces_core';

const OFF = parseEarlyAccessFlags({});
const STORE_ONLY = { membership: false, claudium: true };
const ALL_ON = { membership: true, claudium: true };

describe('store surfaces core', () => {
  it('the build answer mirrors the Vite switches', () => {
    expect(BUILD_STORE_FLAGS).toEqual({
      membership: import.meta.env.VITE_MEMBERSHIP_ENABLED === '1',
      claudium: import.meta.env.VITE_CLAUDIUM_ENABLED === '1',
    });
  });

  it('switched off, no tab, launcher, catalog or advert is reachable', () => {
    expect(storeTabs(OFF)).toEqual([]);
    expect(storeTabAllowed('store', OFF)).toBe(false);
    expect(storeTabAllowed('memberships', OFF)).toBe(false);
    // Even with economy hooks somehow attached, the switch wins.
    expect(storeLauncherLive(true, OFF)).toBe(false);
    expect(storeCatalogListed(OFF)).toBe(false);
    for (const id of ['armory', 'membership', 'referral'] as const) {
      expect(storePromoAllowed(id, OFF), id).toBe(false);
    }
    expect(glossaryTermListed('claudium', OFF)).toBe(false);
    expect(glossaryTermListed('mount', OFF)).toBe(true);
  });

  it('store on, membership off: the store sells, the Memberships tab and advert stay closed', () => {
    expect(storeTabs(STORE_ONLY)).toEqual(['store']);
    expect(storeTabAllowed('memberships', STORE_ONLY)).toBe(false);
    expect(storePromoAllowed('membership', STORE_ONLY)).toBe(false);
    expect(storePromoAllowed('armory', STORE_ONLY)).toBe(true);
    expect(storeLauncherLive(false, STORE_ONLY)).toBe(false);
    expect(storeLauncherLive(true, STORE_ONLY)).toBe(true);
  });

  it('both on restores today', () => {
    expect(storeTabs(ALL_ON)).toEqual(['store', 'memberships']);
    expect(storeCatalogListed(ALL_ON)).toBe(true);
    expect(glossaryTermListed('claudium', ALL_ON)).toBe(true);
  });
});

describe('store surfaces consumers', () => {
  it('the Store tab strip omits a closed tab', () => {
    const storeOnly = wocStoreTabsHtml(storeTabs(STORE_ONLY));
    expect(storeOnly).toContain('data-woc-store-tab="store"');
    expect(storeOnly).not.toContain('data-woc-store-tab="memberships"');
    expect(wocStoreTabsHtml(storeTabs(OFF))).not.toContain('data-woc-store-tab=');
    expect(wocStoreTabsHtml(storeTabs(ALL_ON))).toContain('data-woc-store-tab="memberships"');
  });

  it('the promo card drops every advert for a closed surface', () => {
    const deps = {
      openStore: () => {},
      openMemberships: () => {},
      openReferralCards: () => {},
      membershipActive: () => false,
    };
    expect(storePromoSlides(deps, OFF)).toEqual([]);
    expect(storePromoSlides(deps, STORE_ONLY).map((s) => s.id)).toEqual(['armory', 'referral']);
    expect(storePromoSlides(deps, ALL_ON).map((s) => s.id)).toEqual([
      'armory',
      'membership',
      'referral',
    ]);
  });

  it('the Cosmetics window lists owned skins only while the store is off', () => {
    const snap = (ownedMountSkins: readonly string[]): CosmeticsSnapshot =>
      ({ ownedMountSkins, wornMountSkin: null }) as unknown as CosmeticsSnapshot;
    const storeIds = STORE_MOUNT_SKIN_IDS as readonly string[];
    expect(storeIds.length).toBeGreaterThan(0);
    const offCards = mountSkinCards(snap([]), false);
    expect(offCards.filter((c) => storeIds.includes(c.id))).toEqual([]);
    expect(offCards.every((c) => c.owned || !storeIds.includes(c.id))).toBe(true);
    // An owned store skin stays wearable: the wardrobe keeps what was bought.
    const owned = storeIds[0]!;
    const kept = mountSkinCards(snap([owned]), false);
    expect(kept.find((c) => c.id === owned)?.action).toBe('wear');
    // Store on: the unowned catalog lists again.
    expect(mountSkinCards(snap([]), true).some((c) => storeIds.includes(c.id))).toBe(true);
  });

  it('the Season 1 Armory data is kept, only the shop is gated', () => {
    expect(Object.keys(WEAPON_SKINS).length).toBeGreaterThan(0);
  });

  it('the HUD launcher and the store window consult the gate', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('dailyRewardsEnabled: CLAUDIUM_ENABLED,');
    expect(main).not.toContain('dailyRewardsEnabled: true');
    const hud = readFileSync('src/ui/hud.ts', 'utf8');
    expect(hud).toContain('storeLauncherLive(this.claudiumHooks !== null)');
    expect(hud).toContain('!storeTabAllowed(tab)');
    const win = readFileSync('src/ui/daily_rewards_window.ts', 'utf8');
    expect(win).toContain('storeTabs().length === 0');
    expect(win).toContain('!storeTabAllowed(tab)');
  });
});
