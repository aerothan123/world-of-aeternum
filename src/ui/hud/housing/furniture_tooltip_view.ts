// Player housing (Project H), phase 2: the furniture item's tooltip lines.
// Pure string-builder composed inside Hud.itemTooltip (the
// mobile_station_tooltip.ts pattern): t() plus the shared tooltip_line_core
// builder (which owns the esc), no DOM, no Hud state. '' for every other item,
// so bags, bank, crafting and market all show the same card.

import { furnitureDefFor, HOUSE_STORAGE_CHEST_ITEM_ID } from '../../../sim/content/furniture';
import { HOUSE_CHEST_SLOTS } from '../../../sim/housing/house_storage_state';
import type { ItemDef, StationType } from '../../../sim/types';
import type { TranslationKey } from '../../i18n';
import { formatNumber, t } from '../../i18n';
import { tooltipLine } from '../../tooltip_line_core';

const KIND_KEY: Record<NonNullable<ReturnType<typeof furnitureDefFor>>['kind'], TranslationKey> = {
  floor: 'hudChrome.housing.anchorKind.floor',
  wall: 'hudChrome.housing.anchorKind.wall',
  rug: 'hudChrome.housing.anchorKind.rug',
  table: 'hudChrome.housing.anchorKind.table',
};

const STATION_KEY: Record<StationType, TranslationKey> = {
  forge: 'hudChrome.crafting.stationName.forge',
  kitchens: 'hudChrome.crafting.stationName.kitchens',
  apothecary: 'hudChrome.crafting.stationName.apothecary',
  tannery: 'hudChrome.crafting.stationName.tannery',
  loom: 'hudChrome.crafting.stationName.loom',
  toolworks: 'hudChrome.crafting.stationName.toolworks',
};

/** The tooltip lines for one furniture item, or '' for any other item. */
export function furnitureTooltipLines(item: Pick<ItemDef, 'id'>): string {
  const def = furnitureDefFor(item.id);
  if (!def) return '';
  // Phase 3: the chest and the stations say what they DO once placed; the
  // station name is the crafting window's own station label.
  const role =
    def.itemId === HOUSE_STORAGE_CHEST_ITEM_ID
      ? tooltipLine(
          'tt-green',
          t('hudChrome.housing.furnitureTooltip.chest', {
            slots: formatNumber(HOUSE_CHEST_SLOTS),
          }),
        )
      : def.stationType
        ? tooltipLine(
            'tt-green',
            t('hudChrome.housing.furnitureTooltip.station', {
              station: t(STATION_KEY[def.stationType]),
            }),
          )
        : '';
  return (
    tooltipLine('tt-sub', t('hudChrome.housing.furnitureTooltip.kind')) +
    tooltipLine(
      'tt-green',
      t('hudChrome.housing.furnitureTooltip.use', { kind: t(KIND_KEY[def.kind]) }),
    ) +
    role +
    tooltipLine('tt-desc', t('hudChrome.housing.furnitureTooltip.how'))
  );
}
