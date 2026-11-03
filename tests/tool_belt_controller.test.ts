// @vitest-environment happy-dom
// The character sheet's Tools section, DOM half (src/ui/hud/professions/
// tool_belt_controller.ts): one equipment-slot cell per gathering profession,
// right-click and the corner x unequip through IWorld, a tool dropped from the
// bags equips that exact copy through the ordinary equip command, and a drop
// of the wrong kind of tool is refused with the sim's own wording.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatherToolSlots } from '../src/sim/professions/gather_tool_slots';
import type { InvSlot } from '../src/sim/types';
import {
  paintToolBelt,
  type ToolBeltPainterDeps,
  toolBeltSectionHtml,
} from '../src/ui/hud/professions/tool_belt_controller';
import { ItemDragState } from '../src/ui/item_drag_state';
import type { IWorld } from '../src/world_api';

vi.mock('../src/game/audio', () => ({ audio: { click: () => {} } }));
// The empty-slot socket icon is canvas-drawn; happy-dom has no 2D context.
vi.mock('../src/ui/icons', async (original) => ({
  ...(await original<typeof import('../src/ui/icons')>()),
  iconDataUrl: () => 'data:,',
}));

function harness(belt: GatherToolSlots, inventory: InvSlot[] = []) {
  const calls: unknown[][] = [];
  const errors: string[] = [];
  const tooltips = new Map<HTMLElement, () => string>();
  let refreshed = 0;
  const world = {
    gatherToolSlots: belt,
    inventory,
    unequipGatherTool: (id: string) => calls.push(['unequip', id]),
    equipItem: (id: string, target?: { slotIndex: number }) => calls.push(['equip', id, target]),
  } as unknown as IWorld;
  const dragState = new ItemDragState();
  const deps: ToolBeltPainterDeps = {
    world: () => world,
    itemIcon: (item) => `<img class="item-icon" data-icon="${item.id}">`,
    attachTooltip: (el, html) => tooltips.set(el, html),
    wornItemTooltip: (item) => `<b>${item.name}</b>`,
    hideTooltip: () => {},
    dragState,
    showError: (text) => errors.push(text),
    refresh: () => {
      refreshed++;
    },
  };
  document.body.innerHTML = toolBeltSectionHtml();
  const host = document.getElementById('char-tool-belt-row');
  paintToolBelt(host, deps);
  return { calls, errors, tooltips, dragState, refreshed: () => refreshed, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('paintToolBelt', () => {
  it('paints a titled section with one cell per gathering slot', () => {
    const h = harness({ mining: { itemId: 'copper_mining_pick', count: 1 } });
    const cells = [...document.querySelectorAll<HTMLElement>('.tool-belt-slot')];
    expect(cells.map((c) => c.dataset.toolSlot)).toEqual([
      'mining',
      'logging',
      'herbalism',
      'fishing',
      'farming',
    ]);
    expect(document.querySelector('.char-tool-belt .cp-title')?.textContent).toBe('Tools');
    // Only the filled cell carries an unequip x.
    expect(cells[0].querySelector('.equip-unequip-btn')).not.toBeNull();
    expect(cells[1].querySelector('.equip-unequip-btn')).toBeNull();
    // The empty cell says what goes there.
    expect(h.tooltips.get(cells[1])?.()).toContain('Logging');
    expect(h.tooltips.get(cells[0])?.()).toContain('right-click to unequip');
  });

  it('right-click and the corner x unequip through IWorld and refresh', () => {
    const h = harness({ mining: { itemId: 'copper_mining_pick', count: 1 } });
    const cell = document.getElementById('tool-slot-mining');
    cell?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    cell?.querySelector<HTMLButtonElement>('.equip-unequip-btn')?.click();
    expect(h.calls).toEqual([
      ['unequip', 'mining'],
      ['unequip', 'mining'],
    ]);
    expect(h.refreshed()).toBe(2);
  });

  it('a dropped bag tool of the slot profession equips that exact copy', () => {
    const inventory: InvSlot[] = [
      { itemId: 'linen_cloth', count: 2 },
      { itemId: 'felling_axe', count: 1 },
    ];
    const h = harness({}, inventory);
    h.dragState.begin({ itemId: 'felling_axe', count: 1, index: 1, copyPin: '' });
    const cell = document.getElementById('tool-slot-logging');
    cell?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(h.calls).toEqual([['equip', 'felling_axe', { slotIndex: 1 }]]);
    expect(h.dragState.get()).toBeNull();
  });

  it('a tool of another profession is refused with the sim wording', () => {
    const h = harness({}, [{ itemId: 'felling_axe', count: 1 }]);
    h.dragState.begin({ itemId: 'felling_axe', count: 1, index: 0, copyPin: '' });
    document
      .getElementById('tool-slot-mining')
      ?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(h.calls).toEqual([]);
    expect(h.errors).toEqual(['That does not go in that slot.']);
  });
});
