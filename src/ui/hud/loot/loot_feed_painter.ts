// The Loot Feed's thin painter: a FIXED pool of LOOT_FEED_MAX_LINES row nodes
// minted once at construction (icon, name, count), each bound to one core line
// by its stable id. paint() is per-frame and routes EVERY write through the
// PainterHost elided writers; a row's label strings are re-resolved only when
// its bound line, count, coins or won state change, so an identical frame makes
// zero DOM writes and resolves nothing.
//
// Show/hide is a class (`is-live`), the fade a class (`is-fading`), the stacking
// order the flex `order` property: no node is ever moved, created or removed
// after construction. The slide-in is a CSS animation on `.is-live` (dropped
// under prefers-reduced-motion, where a row just appears and disappears). A
// slot freed and re-bound inside ONE frame (only when the feed is full and the
// oldest line drops) keeps its class, so that one reuse does not replay the
// slide; every other reuse does.
//
// Accessibility: the feed is DECORATIVE (aria-hidden on the root, in the HTML
// entries). Every line it shows is already printed to the chat log, whose
// #chatlog role=log region is the accessible channel; announcing both would
// read each pickup twice.

import type { PainterHostWriters } from '../../painter_host';
import { LOOT_FEED_MAX_LINES, type LootFeedLine } from './loot_feed_core';

export interface LootFeedLabels {
  /** The localized display name of an item id. */
  itemName(itemId: string): string;
  /** The localized stack suffix for a count above one ("x2"). */
  stackSuffix(count: number): string;
  /** The localized coin amount. */
  money(copper: number): string;
  /** The localized "You won: <item>" line. */
  won(itemName: string): string;
  /** The icon image source for an item id ('coins' for the coin line). */
  iconSrc(key: string): string;
}

interface Slot {
  row: HTMLElement;
  icon: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  /** The bound core line id (0 = free). */
  boundId: number;
  lastCount: number;
  lastCopper: number;
  lastWon: boolean;
  qualityClass: string;
  /** Claimed by the current paint() pass. */
  used: boolean;
}

const ORDER = Array.from({ length: LOOT_FEED_MAX_LINES }, (_, i) => String(i));
const QUALITY_CLASS: Record<string, string> = {
  poor: 'q-poor',
  common: 'q-common',
  uncommon: 'q-uncommon',
  rare: 'q-rare',
  epic: 'q-epic',
  legendary: 'q-legendary',
  quest: 'q-quest',
};
const COINS_CLASS = 'loot-feed-coins';

export class LootFeedPainter {
  private readonly slots: Slot[] = [];

  constructor(
    private readonly root: HTMLElement,
    doc: Document,
    private readonly w: PainterHostWriters,
    private readonly labels: LootFeedLabels,
  ) {
    for (let i = 0; i < LOOT_FEED_MAX_LINES; i++) {
      const row = doc.createElement('div');
      row.className = 'loot-feed-row';
      const icon = doc.createElement('img');
      icon.className = 'loot-feed-icon';
      const name = doc.createElement('span');
      name.className = 'loot-feed-name';
      const count = doc.createElement('span');
      count.className = 'loot-feed-count';
      row.append(icon, name, count);
      root.appendChild(row);
      this.slots.push({
        row,
        icon,
        name,
        count,
        boundId: 0,
        lastCount: -1,
        lastCopper: -1,
        lastWon: false,
        qualityClass: '',
        used: false,
      });
    }
  }

  /** `shown` false hides the whole feed (the option is off). */
  paint(lines: readonly LootFeedLine[], shown: boolean): void {
    this.w.toggleClass(this.root, 'is-hidden', !shown);
    for (const slot of this.slots) slot.used = false;
    if (shown) {
      // Keep existing bindings first, so a line never hops rows.
      for (let i = 0; i < lines.length; i++) {
        const slot = this.slotBoundTo(lines[i].id);
        if (slot) this.bind(slot, lines[i], i);
      }
      for (let i = 0; i < lines.length; i++) {
        if (this.slotBoundTo(lines[i].id)) continue;
        const slot = this.freeSlot();
        if (slot) this.bind(slot, lines[i], i);
      }
    }
    for (const slot of this.slots) {
      if (slot.used) continue;
      slot.boundId = 0;
      this.w.toggleClass(slot.row, 'is-live', false);
      this.w.toggleClass(slot.row, 'is-fading', false);
    }
  }

  private slotBoundTo(id: number): Slot | null {
    for (const slot of this.slots) if (slot.boundId === id) return slot;
    return null;
  }

  /** A truly free row first (hidden since an earlier frame, so its slide
   *  replays), else one whose line just ended this frame. */
  private freeSlot(): Slot | null {
    for (const slot of this.slots) if (!slot.used && slot.boundId === 0) return slot;
    for (const slot of this.slots) if (!slot.used) return slot;
    return null;
  }

  private bind(slot: Slot, line: LootFeedLine, order: number): void {
    slot.used = true;
    if (slot.boundId !== line.id) {
      slot.boundId = line.id;
      slot.lastCount = -1;
      slot.lastCopper = -1;
      slot.lastWon = !line.won;
      const qualityClass = line.kind === 'coins' ? COINS_CLASS : QUALITY_CLASS[line.quality];
      if (slot.qualityClass !== qualityClass) {
        if (slot.qualityClass) this.w.toggleClass(slot.name, slot.qualityClass, false);
        this.w.toggleClass(slot.name, qualityClass, true);
        slot.qualityClass = qualityClass;
      }
      this.w.setAttr(
        slot.icon,
        'src',
        this.labels.iconSrc(line.kind === 'coins' ? 'coins' : line.itemId),
      );
    }
    if (line.kind === 'coins') {
      if (slot.lastCopper !== line.copper) {
        slot.lastCopper = line.copper;
        this.w.setText(slot.name, this.labels.money(line.copper));
        this.w.setText(slot.count, '');
      }
    } else if (slot.lastCount !== line.count || slot.lastWon !== line.won) {
      slot.lastCount = line.count;
      slot.lastWon = line.won;
      const name = this.labels.itemName(line.itemId);
      this.w.setText(slot.name, line.won ? this.labels.won(name) : name);
      this.w.setText(slot.count, line.count > 1 ? this.labels.stackSuffix(line.count) : '');
    }
    this.w.setStyleProp(slot.row, 'order', ORDER[order]);
    this.w.toggleClass(slot.row, 'is-live', true);
    this.w.toggleClass(slot.row, 'is-fading', line.fading);
  }
}
