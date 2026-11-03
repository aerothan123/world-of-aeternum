import { describe, expect, it } from 'vitest';
import {
  type CorpseLootPressInput,
  corpseLootPressPlan,
  pressTakesLootDirectly,
} from '../src/ui/hud/loot/auto_loot_core';

// The Auto Loot decision for a pointer press on a corpse: the option XOR Shift
// picks take or window, a body with nothing to take always opens the window
// (Harvest is a choice), and soulbound loot takes through the bind confirm.
describe('auto loot press decision', () => {
  it('the option decides, and Shift inverts it for the press', () => {
    expect(pressTakesLootDirectly(false, false)).toBe(false);
    expect(pressTakesLootDirectly(false, true)).toBe(true);
    expect(pressTakesLootDirectly(true, false)).toBe(true);
    expect(pressTakesLootDirectly(true, true)).toBe(false);
  });

  const base: CorpseLootPressInput = {
    autoLootEnabled: false,
    shiftHeld: false,
    hasLoot: true,
    bindsOnPickup: false,
  };

  it.each([
    [false, false, 'window'],
    [false, true, 'take'],
    [true, false, 'take'],
    [true, true, 'window'],
  ] as const)('option %s with Shift %s plans %s', (autoLootEnabled, shiftHeld, plan) => {
    expect(corpseLootPressPlan({ ...base, autoLootEnabled, shiftHeld })).toBe(plan);
  });

  it('a body with nothing to take opens the window whatever the option and Shift say', () => {
    for (const autoLootEnabled of [false, true]) {
      for (const shiftHeld of [false, true]) {
        expect(corpseLootPressPlan({ ...base, autoLootEnabled, shiftHeld, hasLoot: false })).toBe(
          'window',
        );
      }
    }
  });

  it('soulbound loot takes behind the bind confirm, and only when the press takes', () => {
    expect(corpseLootPressPlan({ ...base, autoLootEnabled: true, bindsOnPickup: true })).toBe(
      'confirmTake',
    );
    expect(corpseLootPressPlan({ ...base, bindsOnPickup: true })).toBe('window');
  });
});
