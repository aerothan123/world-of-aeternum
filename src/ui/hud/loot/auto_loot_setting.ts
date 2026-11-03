import { Settings } from '../../../game/settings';

// The live Auto Loot option, read fresh on each corpse press. A press is a
// deliberate click, never a per-frame path, so a fresh read is cheap and always
// sees a write the options window made through its own Settings instance (every
// consumer holds its own, see Settings.save). Wrapped so a host with no storage
// (a Node test, a private window) falls back to the default (off), which is the
// shipped behavior: the press opens the loot window.
export function autoLootEnabled(): boolean {
  try {
    return new Settings().get('autoLoot');
  } catch {
    return false;
  }
}
