// The Claudium store wiring (the card-checkout soft currency, the membership
// subscription and token offers, and the store promo card), extracted from
// src/main.ts so a build with the store switched off never loads it: main.ts
// reaches this module only through a dynamic import behind CLAUDIUM_ENABLED
// (src/early_access_flags.ts), so a Steam build made with the switch off
// carries none of this code or its economy SDK in its entry chunk.
//
// Claudium store, online only. The client SDK hits the game server's
// same-origin /api/claudium/* routes, which proxy to the economy service and
// fail closed; the SDK itself returns typed unavailable states, never throws.
// The game therefore boots and plays with the service OFF: snapshot() resolves
// to the disabled state and the window renders its empty notice.

import type { ClaudiumHooks, Hud } from '../ui/hud';
import { t } from '../ui/i18n';
import { shouldShowStorePromo } from '../ui/store_promo_card';
import { EconomyClient, newIdempotencyKey, startClaudiumPurchase } from './economy_sdk';
import type { Api } from './online';
import { openStripeCheckout } from './stripe_checkout';
import { createSubscriptionStoreHooks, storeSnapshotForHud } from './subscription_sdk';

export interface ClaudiumStoreWiringDeps {
  api: Api;
  hud: Hud;
  nativeApp: boolean;
  desktopApp: boolean;
}

export function wireClaudiumStore({
  api,
  hud,
  nativeApp,
  desktopApp,
}: ClaudiumStoreWiringDeps): void {
  const economy = new EconomyClient({
    token: () => api.token,
    base: api.base,
  });
  const claudiumHooks: ClaudiumHooks = {
    balance: async () => (await economy.balance()).balance,
    subscription: createSubscriptionStoreHooks({ token: () => api.token, base: api.base }),
    storeSnapshot: () => storeSnapshotForHud(economy),
    snapshot: async () => {
      const pack = await economy.packSnapshot();
      return { available: pack.available, balance: pack.balance, skus: pack.skus };
    },
    buy: async (rail, sku) => {
      await (async () => {
        const refreshClaudiumLater = () => {
          void hud.refreshClaudium();
        };
        const result = await startClaudiumPurchase(economy, rail, sku, {
          stripe: (intent) =>
            openStripeCheckout(
              intent,
              {
                title: t('hudChrome.claudium.checkoutTitle'),
                close: t('hudChrome.claudium.checkoutClose'),
                loading: t('hudChrome.claudium.checkoutLoading'),
                failed: t('hudChrome.claudium.checkoutFailed'),
              },
              {
                onComplete: () => {
                  refreshClaudiumLater();
                  window.setTimeout(refreshClaudiumLater, 1500);
                  window.setTimeout(refreshClaudiumLater, 4000);
                  window.setTimeout(refreshClaudiumLater, 8000);
                },
              },
            ),
        });
        if (!result.ok) {
          throw new Error(t('hudChrome.claudium.checkoutUnavailable'));
        }
      })().catch((err) => {
        // The checkout throws its own localized sentences; anything else
        // (a provider failure) falls back to the generic line. Raw log for devs.
        console.warn('[claudium] checkout failed', err);
        const message = err instanceof Error ? err.message : '';
        throw new Error(message || t('hudChrome.claudium.checkoutFailed'));
      });
    },
    spend: async (itemId, kind, expectedCostClaudium, idempotencyKey) => {
      const result = await economy.spend({
        itemId,
        kind,
        expectedCostClaudium,
        idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
      });
      return {
        granted: result.granted,
        balance: result.balance,
        costClaudium: result.costClaudium,
        reason: result.reason,
      };
    },
  };
  // Native iOS and Android do not expose the store: every Claudium purchase
  // surface stays absent until native billing is implemented.
  if (nativeApp) return;
  hud.attachClaudium(claudiumHooks);
  if (
    shouldShowStorePromo({
      nativeApp,
      desktopApp,
      mobileTouch: document.body.classList.contains('mobile-touch'),
    })
  ) {
    hud.attachStorePromoCard();
  }
}
