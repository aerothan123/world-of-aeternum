// The Currencies tab's thin painter: the pure view rendered as the character
// window's sidebar HTML. Cold chrome; a string builder over esc() and t(). Every
// icon is the committed currency art.
import { FACTION_CURRENCY_IDS, type FactionId } from '../../../sim/factions';
import type { IWorld } from '../../../world_api';
import { currencyIconHtml, heroicMarkIconHtml } from '../../currency_art';
import { esc } from '../../esc';
import { formatNumber, type TranslationKey, t } from '../../i18n';
import {
  type ActivityCurrencyId,
  type ActivityCurrencyRow,
  buildCurrenciesView,
  type FactionCurrencyRow,
} from './currencies_view';

const whole = (value: number): string => formatNumber(value, { maximumFractionDigits: 0 });

const NAME_KEY: Record<ActivityCurrencyId, TranslationKey> = {
  heroic_mark: 'entities.items.heroic_mark.name' as TranslationKey,
  honor: 'hudChrome.currencies.honor',
  delve_mark: 'hudChrome.currencies.delveMark',
};
const NOTE_KEY: Record<ActivityCurrencyId, TranslationKey> = {
  heroic_mark: 'hudChrome.currencies.heroicMarkNote',
  honor: 'hudChrome.currencies.honorNote',
  delve_mark: 'hudChrome.currencies.delveMarkNote',
};

const FACTION_CURRENCY_NAME_KEY: Record<FactionId, TranslationKey> = {
  rift_watch: 'hudChrome.currencies.riftWatchMark',
  church_order: 'hudChrome.currencies.churchOrderCrest',
  automatons: 'hudChrome.currencies.automatonCog',
};
const FACTION_CURRENCY_NOTE_KEY: Record<FactionId, TranslationKey> = {
  rift_watch: 'hudChrome.currencies.riftWatchMarkNote',
  church_order: 'hudChrome.currencies.churchOrderCrestNote',
  automatons: 'hudChrome.currencies.automatonCogNote',
};

function icon(id: ActivityCurrencyId): string {
  return id === 'heroic_mark' ? heroicMarkIconHtml() : currencyIconHtml(id);
}

function activityRow(row: ActivityCurrencyRow): string {
  const amount = `<span class="char-cur-amount">${esc(whole(row.amount))}</span>`;
  const lifetime =
    row.lifetime === null
      ? ''
      : `<span class="char-cur-lifetime">${esc(t('hudChrome.currencies.lifetime', { amount: whole(row.lifetime) }))}</span>`;
  return `<div class="char-cur-row is-${esc(row.id)}"><span class="char-cur-icon">${icon(row.id)}</span><span class="char-cur-copy"><b>${esc(t(NAME_KEY[row.id]))}</b><span class="char-cur-note">${esc(t(NOTE_KEY[row.id]))}</span></span><span class="char-cur-value">${amount}${lifetime}</span></div>`;
}

function factionRow(row: FactionCurrencyRow): string {
  const curId = FACTION_CURRENCY_IDS[row.factionId];
  return `<div class="char-cur-row is-faction is-${esc(row.factionId)}"><span class="char-cur-icon">${currencyIconHtml(curId)}</span><span class="char-cur-copy"><b>${esc(t(FACTION_CURRENCY_NAME_KEY[row.factionId]))}</b><span class="char-cur-note">${esc(t(FACTION_CURRENCY_NOTE_KEY[row.factionId]))}</span></span><span class="char-cur-value"><span class="char-cur-amount">${esc(whole(row.amount))}</span></span></div>`;
}

/** The whole sidebar body for the Currencies tab. */
export function currenciesTabHtml(world: IWorld): string {
  const view = buildCurrenciesView({
    heroicMarks: world.heroicMarks,
    honor: world.honor,
    lifetimeHonor: world.lifetimeHonor,
    delveMarks: world.delveMarks,
    factionCurrencies: world.factionCurrencies,
  });
  const group = (titleKey: TranslationKey, rows: string): string =>
    `<section class="char-cur-group ui-card"><h3>${esc(t(titleKey))}</h3>${rows}</section>`;
  return `<div class="char-cur"><p class="char-cur-intro">${esc(t('hudChrome.currencies.intro'))}</p>${group('hudChrome.currencies.activities', view.activities.map(activityRow).join(''))}${group('hudChrome.currencies.factions', view.factions.map(factionRow).join(''))}</div>`;
}
