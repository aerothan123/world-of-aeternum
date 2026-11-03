// The character sheet's Tools section, pure half (src/ui/hud/professions/
// tool_belt_view.ts): every gathering slot present in content order, the
// equipped tool and its tier, the drop rule, the change signature, and the
// char-sheet refresh signature arm that repaints the sheet when the belt moves.

import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { charSheetRefreshSig, toolBeltSig } from '../src/ui/char_sheet_sig_core';
import {
  buildToolBeltView,
  toolBeltDropAccepts,
  toolBeltSignature,
} from '../src/ui/hud/professions/tool_belt_view';

describe('buildToolBeltView', () => {
  it('lists all five slots in profession order, empty ones included', () => {
    const cells = buildToolBeltView(
      {
        logging: { itemId: 'felling_axe', count: 1 },
        fishing: { itemId: 'simple_fishing_pole', count: 1 },
      },
      ITEMS,
    );
    expect(cells.map((c) => c.professionId)).toEqual([
      'mining',
      'logging',
      'herbalism',
      'fishing',
      'farming',
    ]);
    expect(cells.map((c) => c.item?.id ?? null)).toEqual([
      null,
      'felling_axe',
      null,
      'simple_fishing_pole',
      null,
    ]);
    expect(cells.map((c) => c.tier)).toEqual([0, 2, 0, 1, 0]);
  });

  it('reads an absent belt (a fixture) and an unknown item id as empty cells', () => {
    expect(buildToolBeltView(undefined, ITEMS).every((c) => c.item === null)).toBe(true);
    const cells = buildToolBeltView({ mining: { itemId: 'retired_pick', count: 1 } }, ITEMS);
    expect(cells[0]).toEqual({ professionId: 'mining', item: null, instance: null, tier: 0 });
  });

  it('carries a signed tool payload through to the cell', () => {
    const instance = { signer: 'Brannoc' };
    const cells = buildToolBeltView(
      { mining: { itemId: 'iron_mining_pick', count: 1, instance } },
      ITEMS,
    );
    expect(cells[0].instance).toEqual(instance);
  });
});

describe('toolBeltDropAccepts', () => {
  it('takes only a tool of the cell profession', () => {
    expect(toolBeltDropAccepts(ITEMS.copper_mining_pick, 'mining')).toBe(true);
    expect(toolBeltDropAccepts(ITEMS.copper_mining_pick, 'logging')).toBe(false);
    expect(toolBeltDropAccepts(ITEMS.simple_fishing_pole, 'fishing')).toBe(true);
    expect(toolBeltDropAccepts(ITEMS.garden_hoe, 'farming')).toBe(true);
    expect(toolBeltDropAccepts(ITEMS.copper_ore, 'mining')).toBe(false);
    expect(toolBeltDropAccepts(undefined, 'mining')).toBe(false);
  });
});

describe('signatures', () => {
  it('the belt signature moves with an equip and not otherwise', () => {
    const a = toolBeltSignature(buildToolBeltView({}, ITEMS));
    const b = toolBeltSignature(
      buildToolBeltView({ mining: { itemId: 'copper_mining_pick', count: 1 } }, ITEMS),
    );
    expect(a).not.toBe(b);
    expect(toolBeltSignature(buildToolBeltView({}, ITEMS))).toBe(a);
  });

  it('the sheet refresh signature folds the belt in, insertion order aside', () => {
    const base = {
      activeTitle: null,
      activeBorder: null,
      deedsEarned: 0,
      itemsDiscovered: 0,
      marks: 0,
      mounts: 0,
    };
    // No belt signs byte-identically to the pre-belt signature.
    expect(charSheetRefreshSig({ ...base, tools: '' })).toBe(charSheetRefreshSig(base));
    const one = toolBeltSig({
      mining: { itemId: 'copper_mining_pick' },
      logging: { itemId: 'handaxe' },
    });
    const two = toolBeltSig({
      logging: { itemId: 'handaxe' },
      mining: { itemId: 'copper_mining_pick' },
    });
    expect(one).toBe(two);
    expect(charSheetRefreshSig({ ...base, tools: one })).not.toBe(charSheetRefreshSig(base));
  });
});
