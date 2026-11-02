// Player housing (Project H), phase 2: the furniture item's tooltip lines.
// Pure string-builder composed inside Hud.itemTooltip (the
// mobile_station_tooltip.ts pattern): t() plus the shared tooltip_line_core
// builder (which owns the esc), no DOM, no Hud state. '' for every other item,
// so bags, bank, crafting and market all show the same card.

import { furnitureDefFor } from '../../../sim/content/furniture';
import type { ItemDef } from '../../../sim/types';
import type { TranslationKey } from '../../i18n';
import { t } from '../../i18n';
import { tooltipLine } from '../../tooltip_line_core';

const KIND_KEY: Record<NonNullable<ReturnType<typeof furnitureDefFor>>['kind'], TranslationKey> = {
  floor: 'hudChrome.housing.anchorKind.floor',
  wall: 'hudChrome.housing.anchorKind.wall',
  rug: 'hudChrome.housing.anchorKind.rug',
  table: 'hudChrome.housing.anchorKind.table',
};

/** The tooltip lines for one furniture item, or '' for any other item. */
export function furnitureTooltipLines(item: Pick<ItemDef, 'id'>): string {
  const def = furnitureDefFor(item.id);
  if (!def) return '';
  return (
    tooltipLine('tt-sub', t('hudChrome.housing.furnitureTooltip.kind')) +
    tooltipLine(
      'tt-green',
      t('hudChrome.housing.furnitureTooltip.use', { kind: t(KIND_KEY[def.kind]) }),
    ) +
    tooltipLine('tt-desc', t('hudChrome.housing.furnitureTooltip.how'))
  );
}
