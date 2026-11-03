// Auto Loot (Interface options, Combat tab): the pure decision for a POINTER
// press on a corpse (a left or right click, or a touch tap, all of which reach
// src/game/interactions.ts handlePickedEntity). The classic rule: with the option
// on, the press takes the loot straight into the bags; with it off, the press
// opens the loot window; holding Shift on the press inverts the option for that
// one press. The interact key is NOT a pointer press and never reaches this
// table: it already takes the loot directly (src/game/nearby_interaction.ts),
// which is the shipped behavior the corpse window's footer hint describes.
//
// "Take" means the exact command the window's Take Loot button sends
// (IWorld.lootCorpse), so the authoritative sim decides everything the window
// would: coins and items the player is entitled to go to the bags, an item the
// group's loot rules hand to a need/greed roll or the master looter starts that
// roll instead (the normal flow), and anything that does not fit stays on the
// corpse with the sim's full-bags error. No new wire command exists for this.
//
// DOM-free and host-free: registered in UI_PURE_CORES (tests/architecture.test.ts),
// pinned by tests/auto_loot_core.test.ts.

/** A pointer press on a corpse, as the click path describes it. */
export interface CorpseLootPress {
  /** Shift was held on the press (inverts the Auto Loot option for it). */
  readonly shiftHeld: boolean;
}

/** What a pointer press on a corpse does:
 *  - `window`: open the loot window (the classic default);
 *  - `take`: send the Take Loot command at once, no window;
 *  - `confirmTake`: the same take, behind the bind-on-pickup confirm, because a
 *    soulbound item in the loot binds when taken, exactly as Take Loot asks. */
export type CorpseLootPressPlan = 'window' | 'take' | 'confirmTake';

/** True when this press takes the loot directly: the option XOR Shift. */
export function pressTakesLootDirectly(autoLootEnabled: boolean, shiftHeld: boolean): boolean {
  return autoLootEnabled !== shiftHeld;
}

export interface CorpseLootPressInput {
  /** The Auto Loot option as stored. */
  readonly autoLootEnabled: boolean;
  /** Shift on this press. */
  readonly shiftHeld: boolean;
  /** The corpse advertises loot this player may take (coins or items). A
   *  harvest-only body has nothing to take, so the press opens the window,
   *  where Harvest is the player's own choice. */
  readonly hasLoot: boolean;
  /** The visible loot holds an item that binds when picked up. */
  readonly bindsOnPickup: boolean;
}

export function corpseLootPressPlan(input: CorpseLootPressInput): CorpseLootPressPlan {
  if (!input.hasLoot) return 'window';
  if (!pressTakesLootDirectly(input.autoLootEnabled, input.shiftHeld)) return 'window';
  return input.bindsOnPickup ? 'confirmTake' : 'take';
}
