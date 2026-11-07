// Shared shell markup for the Store window. Kept outside the coordinator so
// title, tabs, persistent live region, and first-load state remain one cold,
// localized view builder.

import { esc } from './esc';
import { t } from './i18n';
import { type StoreTab, storeTabs } from './store_surfaces_core';
import { svgIcon } from './ui_icons';

export function dailyRewardsTitleHtml(): string {
  return (
    `<div class="panel-title ui-win-head"><span id="daily-rewards-title" class="ui-win-title">${esc(t('hudChrome.wocStore.title'))}</span>` +
    `<button type="button" class="x-btn ui-x-btn" data-close aria-label="${esc(t('hudChrome.wocStore.close'))}">${svgIcon('close')}</button></div>`
  );
}

/** The tab strip offers only the tabs this build sells (store_surfaces_core.ts):
 *  with membership switched off there is no Memberships tab to select. */
export function wocStoreTabsHtml(tabs: readonly StoreTab[] = storeTabs()): string {
  const label = {
    store: 'hudChrome.wocStore.storeTab',
    memberships: 'hudChrome.wocStore.membershipsTab',
  } as const;
  return (
    '<div class="woc-store-tabs">' +
    `<div class="woc-store-tablist ui-seg" role="tablist" aria-label="${esc(t('hudChrome.wocStore.tabsLabel'))}">` +
    tabs
      .map(
        (tab) =>
          `<button id="woc-store-tab-${tab}" class="ui-seg-tab" type="button" role="tab" aria-controls="woc-store-panel" data-woc-store-tab="${tab}">${esc(t(label[tab]))}</button>`,
      )
      .join('') +
    '</div>' +
    `<span class="woc-store-loading" data-woc-store-loading role="status" aria-live="polite" aria-label="${esc(t('hudChrome.wocStore.loading'))}" aria-busy="false"><i aria-hidden="true"></i></span>` +
    '<span class="visually-hidden" data-membership-announcement role="status" aria-live="polite" aria-atomic="true"></span>' +
    `<span class="visually-hidden" data-charter-live role="status" aria-live="polite" aria-atomic="true"></span></div>`
  );
}

export function dailyRewardsLoadingHtml(): string {
  return (
    `<div id="woc-store-panel" class="dr-body woc-store-body" role="tabpanel" aria-labelledby="woc-store-tab-store">` +
    '<div class="cl-loading" aria-hidden="true"><span class="cl-spinner" aria-hidden="true"></span>' +
    `<span>${esc(t('hudChrome.wocStore.loading'))}</span></div></div>`
  );
}
