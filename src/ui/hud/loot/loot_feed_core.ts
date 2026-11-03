// The Loot Feed's pure core: a short stacked list of what the player just
// received (items with their stack count and rarity, coins, roll wins), each
// line living LOOT_FEED_STAY_MS from its last update and fading over the final
// LOOT_FEED_FADE_MS. A repeat of the same item (same id and rarity) or more
// coins while its line is still up MERGES into that line (count or copper
// summed, timer refreshed, position kept); past LOOT_FEED_MAX_LINES the oldest
// line drops. DOM-free and clock-free: every call takes `now` (ms) from the
// caller.
//
// Allocation-light: the line records are a fixed pool built once, and
// `frame(now)` fills and returns ONE reused array, so a frame with nothing
// arriving allocates nothing. Pushes (event-rate) may build a key string.
//
// Event parsing (`lootFeedPushEvent`) reads the same English sim lines the chat
// log localizes (src/ui/loot_text_i18n_core.ts): "You receive: <name>[ xN].",
// "You receive <money>." and "You loot <money>.", plus the pid-scoped
// `lootRollAwarded` event for a roll win. The chat lines are untouched; the feed
// is a second, decorative view of the same events.

import type { ItemDef } from '../../../sim/types';
import { parseSimMoney } from '../../entity_display_core';

export const LOOT_FEED_MAX_LINES = 6;
export const LOOT_FEED_STAY_MS = 4500;
export const LOOT_FEED_FADE_MS = 700;

export type LootFeedQuality = NonNullable<ItemDef['quality']> | 'quest';

export interface LootFeedLine {
  /** Stable identity of this line while it is up (painter keys its node on it). */
  id: number;
  kind: 'item' | 'coins';
  itemId: string;
  quality: LootFeedQuality;
  count: number;
  copper: number;
  /** A roll win: rendered as "You won: <item>". */
  won: boolean;
  /** Set by frame(): inside the final LOOT_FEED_FADE_MS of its life. */
  fading: boolean;
  /** Order of arrival (oldest first in frame()). */
  seq: number;
  touchedAt: number;
  live: boolean;
}

/** What the feed needs to know about an item name or id (injected, so the core
 *  never reads the content tables itself). */
export interface LootFeedItemInfo {
  itemId: string;
  quality: LootFeedQuality;
}

export class LootFeedCore {
  private readonly pool: LootFeedLine[] = [];
  private readonly out: LootFeedLine[] = [];
  private nextId = 1;
  private nextSeq = 1;

  constructor(readonly maxLines = LOOT_FEED_MAX_LINES) {
    for (let i = 0; i < maxLines; i++) {
      this.pool.push({
        id: 0,
        kind: 'item',
        itemId: '',
        quality: 'common',
        count: 0,
        copper: 0,
        won: false,
        fading: false,
        seq: 0,
        touchedAt: 0,
        live: false,
      });
    }
  }

  pushItem(info: LootFeedItemInfo, count: number, now: number): void {
    if (count <= 0) return;
    const line = this.find('item', info.itemId, info.quality, now);
    if (line) {
      line.count += count;
      line.touchedAt = now;
      return;
    }
    this.claim(now, 'item', info.itemId, info.quality, count, 0);
  }

  pushCoins(copper: number, now: number): void {
    if (copper <= 0) return;
    const line = this.find('coins', '', 'common', now);
    if (line) {
      line.copper += copper;
      line.touchedAt = now;
      return;
    }
    this.claim(now, 'coins', '', 'common', 0, copper);
  }

  /** A roll win. The award's own receipt usually arrived just before it in the
   *  same batch: that line becomes the win line rather than a second one. */
  markWon(info: LootFeedItemInfo, now: number): void {
    const line = this.find('item', info.itemId, info.quality, now);
    if (line) {
      line.won = true;
      line.touchedAt = now;
      return;
    }
    const claimed = this.claim(now, 'item', info.itemId, info.quality, 1, 0);
    claimed.won = true;
  }

  clear(): void {
    for (const line of this.pool) line.live = false;
  }

  /** The visible lines, oldest first, with expiry applied and `fading` set.
   *  Returns the same array instance every call. */
  frame(now: number): readonly LootFeedLine[] {
    const out = this.out;
    out.length = 0;
    for (const line of this.pool) {
      if (!line.live) continue;
      const age = now - line.touchedAt;
      if (age >= LOOT_FEED_STAY_MS) {
        line.live = false;
        continue;
      }
      line.fading = age >= LOOT_FEED_STAY_MS - LOOT_FEED_FADE_MS;
      // Insertion by seq keeps the pool order irrelevant (at most maxLines).
      let i = out.length;
      out.push(line);
      while (i > 0 && out[i - 1].seq > line.seq) {
        out[i] = out[i - 1];
        i--;
      }
      out[i] = line;
    }
    return out;
  }

  private find(
    kind: LootFeedLine['kind'],
    itemId: string,
    quality: LootFeedQuality,
    now: number,
  ): LootFeedLine | null {
    for (const line of this.pool) {
      if (!line.live || line.kind !== kind) continue;
      if (now - line.touchedAt >= LOOT_FEED_STAY_MS) continue;
      if (kind === 'coins' || (line.itemId === itemId && line.quality === quality)) return line;
    }
    return null;
  }

  private claim(
    now: number,
    kind: LootFeedLine['kind'],
    itemId: string,
    quality: LootFeedQuality,
    count: number,
    copper: number,
  ): LootFeedLine {
    let slot: LootFeedLine | null = null;
    for (const line of this.pool) {
      if (!line.live || now - line.touchedAt >= LOOT_FEED_STAY_MS) {
        slot = line;
        break;
      }
    }
    if (!slot) {
      // Full: the oldest line drops.
      slot = this.pool[0];
      for (const line of this.pool) if (line.seq < slot.seq) slot = line;
    }
    slot.id = this.nextId++;
    slot.kind = kind;
    slot.itemId = itemId;
    slot.quality = quality;
    slot.count = count;
    slot.copper = copper;
    slot.won = false;
    slot.fading = false;
    slot.seq = this.nextSeq++;
    slot.touchedAt = now;
    slot.live = true;
    return slot;
  }
}

/** The event shapes the feed reads (a structural subset of SimEvent). */
export type LootFeedEvent =
  | { type: 'loot'; text: string; itemId?: string; count?: number }
  | { type: 'lootRollAwarded'; itemId: string };

const RECEIVE_ITEM = /^You receive: (.+?)(?: x(\d+))?\.$/;
const RECEIVE_MONEY = /^You receive (.+)\.$/;
const LOOT_MONEY = /^You loot (.+)\.$/;

/** Route one event into the feed. `byName` resolves the sim's English item
 *  name, `byId` an item id; either returns null for an unknown item, which the
 *  feed then skips (a raw internal id is never shown). Returns whether the event
 *  produced a line. */
export function lootFeedPushEvent(
  core: LootFeedCore,
  ev: LootFeedEvent,
  now: number,
  byName: (name: string) => LootFeedItemInfo | null,
  byId: (itemId: string) => LootFeedItemInfo | null,
): boolean {
  if (ev.type === 'lootRollAwarded') {
    const info = byId(ev.itemId);
    if (!info) return false;
    core.markWon(info, now);
    return true;
  }
  const item = RECEIVE_ITEM.exec(ev.text);
  if (item) {
    const info = (ev.itemId ? byId(ev.itemId) : null) ?? byName(item[1]);
    if (!info) return false;
    const count = ev.count ?? (item[2] ? Number(item[2]) : 1);
    core.pushItem(info, count, now);
    return true;
  }
  const money = RECEIVE_MONEY.exec(ev.text) ?? LOOT_MONEY.exec(ev.text);
  if (money) {
    const copper = parseSimMoney(money[1]);
    if (copper === null || copper <= 0) return false;
    core.pushCoins(copper, now);
    return true;
  }
  return false;
}
