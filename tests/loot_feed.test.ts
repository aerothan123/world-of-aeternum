import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import type { SimEvent } from '../src/sim/types';
import { LootFeedController, lootFeedItemInfo } from '../src/ui/hud/loot/loot_feed_controller';
import {
  LOOT_FEED_FADE_MS,
  LOOT_FEED_MAX_LINES,
  LOOT_FEED_STAY_MS,
  LootFeedCore,
  lootFeedPushEvent,
} from '../src/ui/hud/loot/loot_feed_core';
import { LootFeedPainter } from '../src/ui/hud/loot/loot_feed_painter';
import { setLanguage, t } from '../src/ui/i18n';
import { makeWriterFacet } from '../src/ui/painter_host';
import { FakeDocument, type FakeElement } from './helpers/fake_dom';

// The Loot Feed (src/ui/hud/loot/loot_feed_*): the pure core's merge window,
// caps and expiry, the pooled painter's reuse and write elision, and the
// controller's event routing and setting gate.

const COMMON = { itemId: 'worn_sword', quality: 'common' as const };
const RARE = { itemId: 'greyjaw_hide_boots', quality: 'uncommon' as const };

describe('LootFeedCore', () => {
  it('merges a repeat of the same item inside the window into one line with a summed count', () => {
    const core = new LootFeedCore();
    core.pushItem(COMMON, 2, 0);
    core.pushItem(COMMON, 3, 1000);
    const lines = core.frame(1000);
    expect(lines).toHaveLength(1);
    expect(lines[0].count).toBe(5);
  });

  it('a merge refreshes the timer; past the window the same item starts a fresh line', () => {
    const core = new LootFeedCore();
    core.pushItem(COMMON, 1, 0);
    core.pushItem(COMMON, 1, LOOT_FEED_STAY_MS - 10);
    expect(core.frame(LOOT_FEED_STAY_MS + 100)).toHaveLength(1);
    const first = core.frame(LOOT_FEED_STAY_MS + 100)[0].id;
    core.pushItem(COMMON, 1, 3 * LOOT_FEED_STAY_MS);
    const lines = core.frame(3 * LOOT_FEED_STAY_MS);
    expect(lines).toHaveLength(1);
    expect(lines[0].id).not.toBe(first);
    expect(lines[0].count).toBe(1);
  });

  it('keeps a different rarity of the same item apart', () => {
    const core = new LootFeedCore();
    core.pushItem(COMMON, 1, 0);
    core.pushItem({ itemId: COMMON.itemId, quality: 'rare' }, 1, 0);
    expect(core.frame(0)).toHaveLength(2);
  });

  it('caps the visible lines; the oldest drops first', () => {
    const core = new LootFeedCore();
    const ids = Object.keys(ITEMS).slice(0, LOOT_FEED_MAX_LINES + 2);
    for (let i = 0; i < ids.length; i++) core.pushItem({ itemId: ids[i], quality: 'common' }, 1, i);
    const lines = core.frame(ids.length);
    expect(lines).toHaveLength(LOOT_FEED_MAX_LINES);
    expect(lines.map((l) => l.itemId)).toEqual(ids.slice(2));
  });

  it('expires by time and flags the final fade window', () => {
    const core = new LootFeedCore();
    core.pushItem(COMMON, 1, 0);
    expect(core.frame(LOOT_FEED_STAY_MS - LOOT_FEED_FADE_MS - 1)[0].fading).toBe(false);
    expect(core.frame(LOOT_FEED_STAY_MS - LOOT_FEED_FADE_MS)[0].fading).toBe(true);
    expect(core.frame(LOOT_FEED_STAY_MS)).toHaveLength(0);
  });

  it('sums coins into one coin line', () => {
    const core = new LootFeedCore();
    core.pushCoins(250, 0);
    core.pushCoins(5, 10);
    const lines = core.frame(10);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'coins', copper: 255 });
  });

  it('a roll win upgrades its own receipt line instead of adding a second', () => {
    const core = new LootFeedCore();
    core.pushItem(RARE, 1, 0);
    core.markWon(RARE, 0);
    const lines = core.frame(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ won: true, count: 1 });
  });

  it('frame() reuses one array and allocates no line records', () => {
    const core = new LootFeedCore();
    core.pushItem(COMMON, 1, 0);
    const a = core.frame(1);
    const lineRef = a[0];
    const b = core.frame(2);
    expect(b).toBe(a);
    expect(b[0]).toBe(lineRef);
  });

  it('parses the sim receipt, coin and roll-award events', () => {
    const core = new LootFeedCore();
    const byName = (name: string) =>
      name === ITEMS.worn_sword.name ? lootFeedItemInfo('worn_sword') : null;
    expect(
      lootFeedPushEvent(
        core,
        { type: 'loot', text: `You receive: ${ITEMS.worn_sword.name} x2.` },
        0,
        byName,
        lootFeedItemInfo,
      ),
    ).toBe(true);
    lootFeedPushEvent(core, { type: 'loot', text: 'You loot 1s 5c.' }, 0, byName, lootFeedItemInfo);
    lootFeedPushEvent(core, { type: 'loot', text: 'You receive 2c.' }, 0, byName, lootFeedItemInfo);
    expect(
      lootFeedPushEvent(
        core,
        { type: 'loot', text: 'Rolling for [[i:x]].' },
        0,
        byName,
        lootFeedItemInfo,
      ),
    ).toBe(false);
    expect(
      lootFeedPushEvent(
        core,
        { type: 'loot', text: 'You receive: Nothing Known.' },
        0,
        byName,
        lootFeedItemInfo,
      ),
    ).toBe(false);
    lootFeedPushEvent(
      core,
      { type: 'lootRollAwarded', itemId: 'greyjaw_hide_boots' },
      0,
      byName,
      lootFeedItemInfo,
    );
    const lines = core.frame(0);
    expect(lines.map((l) => [l.kind, l.itemId, l.count, l.copper, l.won])).toEqual([
      ['item', 'worn_sword', 2, 0, false],
      ['coins', '', 0, 107, false],
      ['item', 'greyjaw_hide_boots', 1, 0, true],
    ]);
  });

  it('resolves rarity from the item and quest items to the quest colour', () => {
    expect(lootFeedItemInfo('greyjaw_hide_boots')?.quality).toBe('uncommon');
    const quest = Object.values(ITEMS).find((d) => d.kind === 'quest')!;
    expect(lootFeedItemInfo(quest.id)?.quality).toBe('quest');
    expect(lootFeedItemInfo('no_such_item')).toBeNull();
  });
});

function painterRig() {
  const doc = new FakeDocument();
  const root = doc.element('loot-feed');
  let writes = 0;
  const facet = makeWriterFacet(
    new WeakMap(),
    new WeakMap(),
    new WeakMap(),
    new WeakMap(),
    () => {
      writes++;
    },
    () => {},
  );
  const resolves = { name: 0, icon: 0 };
  const painter = new LootFeedPainter(
    root as unknown as HTMLElement,
    doc as unknown as Document,
    facet,
    {
      itemName: (id) => {
        resolves.name++;
        return `name:${id}`;
      },
      stackSuffix: (n) => `x${n}`,
      money: (c) => `${c}c`,
      won: (name) => `won ${name}`,
      iconSrc: (key) => {
        resolves.icon++;
        return `icon:${key}`;
      },
    },
  );
  const rows = root.children as FakeElement[];
  return { root, rows, painter, writes: () => writes, resolves };
}

describe('LootFeedPainter', () => {
  it('mints a fixed pool once and shows a line in its rarity class', () => {
    const { rows, painter } = painterRig();
    expect(rows).toHaveLength(LOOT_FEED_MAX_LINES);
    const core = new LootFeedCore();
    core.pushItem(RARE, 2, 0);
    painter.paint(core.frame(0), true);
    const live = rows.filter((r) => r.classList.contains('is-live'));
    expect(live).toHaveLength(1);
    const [icon, name, count] = live[0].children;
    expect(icon.getAttribute('src')).toBe('icon:greyjaw_hide_boots');
    expect(name.textContent).toBe('name:greyjaw_hide_boots');
    expect(name.classList.contains('q-uncommon')).toBe(true);
    expect(count.textContent).toBe('x2');
  });

  it('an identical frame writes nothing and resolves nothing', () => {
    const { painter, writes, resolves } = painterRig();
    const core = new LootFeedCore();
    core.pushItem(COMMON, 1, 0);
    core.pushCoins(30, 0);
    painter.paint(core.frame(10), true);
    const w = writes();
    const r = { ...resolves };
    painter.paint(core.frame(20), true);
    painter.paint(core.frame(30), true);
    expect(writes()).toBe(w);
    expect(resolves).toEqual(r);
  });

  it('a merged count rewrites only that line, on the same row', () => {
    const { rows, painter, resolves } = painterRig();
    const core = new LootFeedCore();
    core.pushItem(COMMON, 1, 0);
    painter.paint(core.frame(0), true);
    const row = rows.find((r) => r.classList.contains('is-live'))!;
    const icons = resolves.icon;
    core.pushItem(COMMON, 1, 5);
    painter.paint(core.frame(5), true);
    expect(rows.find((r) => r.classList.contains('is-live'))).toBe(row);
    expect(row.children[2].textContent).toBe('x2');
    expect(resolves.icon).toBe(icons);
  });

  it('reuses pooled rows as lines expire and fades before hiding', () => {
    const { rows, painter } = painterRig();
    const core = new LootFeedCore();
    core.pushItem(COMMON, 1, 0);
    painter.paint(core.frame(LOOT_FEED_STAY_MS - LOOT_FEED_FADE_MS), true);
    expect(rows.some((r) => r.classList.contains('is-fading'))).toBe(true);
    painter.paint(core.frame(LOOT_FEED_STAY_MS), true);
    expect(rows.some((r) => r.classList.contains('is-live'))).toBe(false);
    for (let i = 0; i < 20; i++)
      core.pushItem({ itemId: Object.keys(ITEMS)[i], quality: 'common' }, 1, 10_000 + i);
    painter.paint(core.frame(10_020), true);
    expect(rows).toHaveLength(LOOT_FEED_MAX_LINES);
    expect(rows.filter((r) => r.classList.contains('is-live'))).toHaveLength(LOOT_FEED_MAX_LINES);
  });

  it('hides the whole feed when not shown', () => {
    const { root, painter } = painterRig();
    const core = new LootFeedCore();
    core.pushItem(COMMON, 1, 0);
    painter.paint(core.frame(0), false);
    expect(root.classList.contains('is-hidden')).toBe(true);
  });
});

describe('LootFeedController wiring', () => {
  function controllerRig(enabled: { on: boolean }) {
    const doc = new FakeDocument();
    const root = doc.element('loot-feed');
    const facet = makeWriterFacet(
      new WeakMap(),
      new WeakMap(),
      new WeakMap(),
      new WeakMap(),
      () => {},
      () => {},
    );
    const controller = new LootFeedController({
      root: root as unknown as HTMLElement,
      document: doc as unknown as Document,
      writers: facet,
      enabled: () => enabled.on,
      iconSrc: (key) => `icon:${key}`,
    });
    const live = () =>
      (root.children as FakeElement[]).filter((r) => r.classList.contains('is-live'));
    return { root, controller, live };
  }

  it('routes receipts and roll wins to the feed, localized', () => {
    setLanguage('en');
    const enabled = { on: true };
    const { controller, live } = controllerRig(enabled);
    const events: SimEvent[] = [
      { type: 'loot', text: `You receive: ${ITEMS.greyjaw_hide_boots.name}.`, pid: 1 },
      {
        type: 'lootRollAwarded',
        rollId: 1,
        itemId: 'greyjaw_hide_boots',
        itemName: 'x',
        quality: 'uncommon',
        pid: 1,
      },
      { type: 'loot', text: 'You loot 3s.', pid: 1 },
      { type: 'damage', sourceId: 1, targetId: 2, amount: 3 } as unknown as SimEvent,
    ];
    for (const ev of events) controller.onEvent(ev, 0);
    controller.update(0);
    const rows = live();
    expect(rows).toHaveLength(2);
    const texts = rows.map((r) => r.children[1].textContent);
    expect(texts).toContain(t('hudChrome.lootFeed.won', { item: ITEMS.greyjaw_hide_boots.name }));
  });

  it('with the option off nothing is collected and the feed is hidden', () => {
    const enabled = { on: false };
    const { root, controller, live } = controllerRig(enabled);
    controller.onEvent({ type: 'loot', text: 'You loot 3s.' } as SimEvent, 0);
    controller.update(0);
    expect(root.classList.contains('is-hidden')).toBe(true);
    enabled.on = true;
    controller.update(1);
    expect(live()).toHaveLength(0);
  });

  it('a host without the element is inert', () => {
    const facet = makeWriterFacet(
      new WeakMap(),
      new WeakMap(),
      new WeakMap(),
      new WeakMap(),
      () => {},
      () => {},
    );
    const controller = new LootFeedController({
      root: null,
      document: new FakeDocument() as unknown as Document,
      writers: facet,
      enabled: () => true,
      iconSrc: () => '',
    });
    expect(() => {
      controller.onEvent({ type: 'loot', text: 'You loot 3s.' } as SimEvent, 0);
      controller.update(0);
    }).not.toThrow();
  });

  it('the new strings resolve through t()', () => {
    setLanguage('en');
    expect(t('hudChrome.lootFeed.title')).toBe('Loot Feed');
    expect(t('hudChrome.lootFeed.won', { item: 'Boots' })).toBe('You won: Boots');
    expect(t('hudChrome.options.showLootFeed')).toBe('Show Loot Feed');
  });
});
