// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEMS, QUESTS } from '../src/sim/data';
import { defaultRewardChoice } from '../src/sim/quests/quest_reward_choice';
import type { ItemDef } from '../src/sim/types';
import {
  questFixedRewardRowHtml,
  questRewardChoiceHtml,
  questRewardChoiceModel,
} from '../src/ui/hud/quest/quest_reward_choice_view';

const QUEST = 'q_wolves';
const offered = QUESTS[QUEST].choiceRewards ?? [];
const itemIcon = (item: ItemDef) => `<img alt="" data-icon="${item.id}">`;

describe('quest reward choice view', () => {
  it('models the cards the class can wear and checks the spec default', () => {
    const warrior = questRewardChoiceModel(QUEST, 'warrior', null);
    expect(warrior?.itemIds).toEqual(offered);
    expect(warrior?.selected).toBe(defaultRewardChoice(QUESTS[QUEST], 'warrior', null));
    const mage = questRewardChoiceModel(QUEST, 'mage', 'frost');
    expect(mage?.itemIds).toHaveLength(1);
    expect(mage?.selected).toBe(mage?.itemIds[0]);
  });

  it('keeps a pick only while it is offered', () => {
    const other = offered.find((id) => id !== defaultRewardChoice(QUESTS[QUEST], 'warrior', null));
    expect(questRewardChoiceModel(QUEST, 'warrior', null, other)?.selected).toBe(other);
    const notOffered = Object.keys(ITEMS).find((id) => !offered.includes(id));
    expect(questRewardChoiceModel(QUEST, 'warrior', null, notOffered)?.selected).toBe(
      defaultRewardChoice(QUESTS[QUEST], 'warrior', null),
    );
  });

  it('is null for an unknown quest or one without choices', () => {
    expect(questRewardChoiceModel('no_such_quest', 'warrior', null)).toBeNull();
    const plain = Object.values(QUESTS).find((q) => !q.choiceRewards?.length);
    expect(plain && questRewardChoiceModel(plain.id, 'warrior', null)).toBeNull();
  });

  it('paints radio cards with one tab stop at turn-in and a static preview elsewhere', () => {
    const model = questRewardChoiceModel(QUEST, 'warrior', null);
    if (!model) throw new Error('q_wolves offers no choice');
    const host = document.createElement('div');
    host.innerHTML = questRewardChoiceHtml(model, { itemIcon }, true);
    const cards = [...host.querySelectorAll<HTMLElement>('[data-reward-choice]')];
    expect(host.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(cards.every((c) => c.tagName === 'BUTTON' && c.getAttribute('role') === 'radio')).toBe(
      true,
    );
    const checked = cards.filter((c) => c.getAttribute('aria-checked') === 'true');
    expect(checked.map((c) => c.dataset.rewardChoice)).toEqual([model.selected]);
    expect(cards.filter((c) => c.tabIndex === 0)).toEqual(checked);
    expect(cards.every((c) => c.dataset.focusKey === `reward:${c.dataset.rewardChoice}`)).toBe(
      true,
    );

    host.innerHTML = questRewardChoiceHtml(model, { itemIcon }, false);
    expect(host.querySelector('[role="radiogroup"]')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(host.querySelectorAll('[data-reward-choice]')).toHaveLength(model.itemIds.length);
  });

  it('escapes an item id and name into the markup', () => {
    const hostile = 'x"><img src=x onerror=alert(1)>';
    ITEMS[hostile] = { ...ITEMS[offered[0]], id: hostile, name: '<b>bold</b>' };
    try {
      const html = questRewardChoiceHtml(
        { itemIds: [hostile], selected: hostile },
        { itemIcon: () => '' },
        true,
      );
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('<b>bold</b>');
    } finally {
      delete ITEMS[hostile];
    }
  });
});

// The reward-slot family: the NPC quest dialog and the quest log paint the
// SAME socket (the dialog once minted its own row with a bare .ui-socket, so
// the generic 28px .item-icon sat tiny inside its 40px frame).
describe('quest reward slot family (dialog and log share it)', () => {
  const SOCKET_CLASSES = ['qd-reward-socket', 'ui-socket', 'ui-socket--bag'];

  it('the fixed Item reward row carries the bag socket, the card, and the quality name', () => {
    const item = ITEMS[offered[0]];
    const host = document.createElement('div');
    host.innerHTML = questFixedRewardRowHtml(item, { itemIcon });
    const row = host.querySelector<HTMLElement>('[data-reward]');
    expect(row?.classList.contains('qd-reward-row')).toBe(true);
    expect(row?.classList.contains('qd-reward-fixed')).toBe(true);
    expect(row?.classList.contains('ui-card')).toBe(true);
    const socket = row?.querySelector<HTMLElement>('.qd-reward-socket');
    for (const cls of SOCKET_CLASSES) expect(socket?.classList.contains(cls)).toBe(true);
    expect(socket?.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe(item.id);
    expect(row?.querySelector('.qd-reward-label')?.textContent).toBe('Item reward:');
    expect(row?.querySelector('.qd-reward-name')?.classList.contains(`q-${item.quality}`)).toBe(
      true,
    );
  });

  it('every choice card wears the same socket as the fixed row', () => {
    const model = questRewardChoiceModel(QUEST, 'warrior', null);
    if (!model) throw new Error('q_wolves offers no choice');
    for (const interactive of [true, false]) {
      const host = document.createElement('div');
      host.innerHTML = questRewardChoiceHtml(model, { itemIcon }, interactive);
      const sockets = host.querySelectorAll<HTMLElement>(
        '[data-reward-choice] > .qd-reward-socket',
      );
      expect(sockets).toHaveLength(model.itemIds.length);
      for (const socket of sockets) {
        for (const cls of SOCKET_CLASSES) expect(socket.classList.contains(cls)).toBe(true);
      }
    }
  });

  it('both windows mint the fixed row through the shared painter, never their own markup', () => {
    for (const file of [
      'src/ui/hud/quest/quest_dialog_controller.ts',
      'src/ui/hud/quest/questlog_window.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src, file).toContain('questFixedRewardRowHtml(');
      expect(src, file).not.toContain("t('questUi.detail.itemReward')");
      expect(src, file).not.toContain('ui-socket--bag');
    }
  });

  it("the socket sizing rules are unscoped, so the dialog gets the log's frame", () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/components.css'), 'utf8');
    const rule = (selector: string) => {
      const m = css.match(new RegExp(`\\n  ${selector.replace(/[.-]/g, '\\$&')} \\{([^}]*)\\}`));
      return m?.[1] ?? null;
    };
    expect(rule('.qd-reward-socket')).toContain('flex: 0 0 var(--socket-size-bag)');
    expect(rule('.qd-reward-socket .item-icon')).toMatch(/width: 100%;\s+height: 100%;/);
    expect(rule('.qd-reward-fixed')).toContain('padding: var(--spacing-sm)');
    expect(css).not.toMatch(/#quest-log-window \.qd-reward-(socket|row)/);
  });
});
