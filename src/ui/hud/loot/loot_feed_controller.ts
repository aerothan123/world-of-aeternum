// The Loot Feed's composition point (the HUD recipe's thin consumer): owns the
// pure LootFeedCore and the pooled LootFeedPainter, takes the HUD's already
// pid-filtered SimEvents one at a time (onEvent, from Hud.handleEvents) and
// paints once per frame (update, from Hud.update). Hud supplies only the root
// element, its shared writer facet, the clock reading and the live "Show Loot
// Feed" option; it never reaches inside.
//
// Item identity: a receipt line names the item in the sim's ENGLISH (the hub
// line "You receive: <name>[ xN]."), so a lazily built name-to-id map resolves
// it; a quality-rolled copy also carries its id. Quest items (kind 'quest')
// render in the quest colour; every other item in its rarity colour, through
// the shared q-* tokens.

import { ITEMS } from '../../../sim/data';
import type { SimEvent } from '../../../sim/types';
import { itemDisplayName } from '../../entity_i18n';
import { formatMoney, formatNumber, t } from '../../i18n';
import type { PainterHostWriters } from '../../painter_host';
import { LootFeedCore, type LootFeedItemInfo, lootFeedPushEvent } from './loot_feed_core';
import { LootFeedPainter } from './loot_feed_painter';

export interface LootFeedControllerDeps {
  /** The #loot-feed frame; null (a host without the element) makes the feed inert. */
  root: HTMLElement | null;
  document: Document;
  writers: PainterHostWriters;
  /** The live "Show Loot Feed" option. */
  enabled(): boolean;
  /** The icon image source for an item id ('coins' for the coin line). */
  iconSrc(key: string): string;
}

let nameIndex: Map<string, string> | null = null;
function itemIdByEnglishName(name: string): string | null {
  if (!nameIndex) {
    nameIndex = new Map();
    for (const def of Object.values(ITEMS))
      if (!nameIndex.has(def.name)) nameIndex.set(def.name, def.id);
  }
  return nameIndex.get(name) ?? null;
}

export function lootFeedItemInfo(itemId: string): LootFeedItemInfo | null {
  const def = ITEMS[itemId];
  if (!def) return null;
  return { itemId, quality: def.kind === 'quest' ? 'quest' : (def.quality ?? 'common') };
}

export class LootFeedController {
  private readonly core = new LootFeedCore();
  private readonly painter: LootFeedPainter | null;

  constructor(private readonly deps: LootFeedControllerDeps) {
    if (!deps.root) {
      this.painter = null;
      return;
    }
    this.painter = new LootFeedPainter(deps.root, deps.document, deps.writers, {
      itemName: (itemId) => {
        const def = ITEMS[itemId];
        return def ? itemDisplayName(def) : '';
      },
      stackSuffix: (count) =>
        t('itemUi.bags.stackCount', { count: formatNumber(count, { maximumFractionDigits: 0 }) }),
      money: (copper) => formatMoney(copper),
      won: (item) => t('hudChrome.lootFeed.won', { item }),
      iconSrc: (key) => {
        try {
          return deps.iconSrc(key);
        } catch {
          return ''; // a canvas-less host: no art, never a throw
        }
      },
    });
  }

  /** One HUD event (already filtered to this player). */
  onEvent(ev: SimEvent, now: number): void {
    if (ev.type !== 'loot' && ev.type !== 'lootRollAwarded') return;
    if (!this.painter || !this.deps.enabled()) return;
    lootFeedPushEvent(
      this.core,
      ev,
      now,
      (name) => {
        const id = itemIdByEnglishName(name);
        return id ? lootFeedItemInfo(id) : null;
      },
      lootFeedItemInfo,
    );
  }

  /** Per frame. */
  update(now: number): void {
    if (!this.painter) return;
    const shown = this.deps.enabled();
    if (!shown) this.core.clear();
    this.painter.paint(this.core.frame(now), shown);
  }
}
