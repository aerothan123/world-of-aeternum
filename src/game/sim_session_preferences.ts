// The stored options that are AUTHORITATIVE on the sim as per-player session
// state (never in the character save): the offline sim and the online server
// each start a fresh player without them, so main.ts pushes every one on world
// entry and mirrors a toggle the moment it changes. (ClientWorld re-pushes the
// last value itself after a reconnect: src/net/session_preferences.ts.)
//   stopAutoAttackOnTargetSwitch: issue #1358.
//   autoLoot: kill-time Auto Loot (src/sim/loot/auto_loot_on_kill.ts); the HUD
//     still reads it live for the corpse click (src/ui/hud/loot/auto_loot_core.ts).

import type { GameSettings } from './settings';

export const SIM_SESSION_PREFERENCE_KEYS = ['stopAutoAttackOnTargetSwitch', 'autoLoot'] as const;
export type SimSessionPreferenceKey = (typeof SIM_SESSION_PREFERENCE_KEYS)[number];

export interface SimSessionPreferenceWorld {
  setStopAutoAttackOnTargetSwitch(enabled: boolean): void;
  setAutoLoot(enabled: boolean): void;
}

export function isSimSessionPreferenceKey(key: string): key is SimSessionPreferenceKey {
  return (SIM_SESSION_PREFERENCE_KEYS as readonly string[]).includes(key);
}

/** Mirror one preference's live value onto the player. */
export function applySimSessionPreference(
  world: SimSessionPreferenceWorld,
  key: SimSessionPreferenceKey,
  enabled: boolean,
): void {
  if (key === 'stopAutoAttackOnTargetSwitch') world.setStopAutoAttackOnTargetSwitch(enabled);
  else world.setAutoLoot(enabled);
}

/** Push every stored preference (world entry). */
export function pushSimSessionPreferences(
  world: SimSessionPreferenceWorld,
  settings: { get<K extends SimSessionPreferenceKey>(key: K): GameSettings[K] },
): void {
  for (const key of SIM_SESSION_PREFERENCE_KEYS) {
    applySimSessionPreference(world, key, settings.get(key) === true);
  }
}
