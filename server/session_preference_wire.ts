// The player-preference commands: each stores one setting of the authenticated
// player on the authoritative sim, which validates it. Command bodies live here
// so the dispatch switch in server/game.ts keeps only the labels (the
// command-schema suite scans that switch for them).
//   stopAutoAttackOnTargetSwitch: session state on PlayerMeta (issue #1358).
//   set_auto_loot: the kill-time Auto Loot option, session state on PlayerMeta
//     (src/sim/loot/auto_loot_on_kill.ts); the client re-pushes it on entry.
//   set_harvest_preference: the persisted corpse-harvest preference (PR3).
import type { Sim } from '../src/sim/sim';

export function dispatchPreferenceCommand(
  sim: Sim,
  command: string,
  msg: Record<string, unknown>,
  pid: number,
): void {
  switch (command) {
    case 'stopAutoAttackOnTargetSwitch':
      sim.setStopAutoAttackOnTargetSwitch(!!msg.enabled, pid);
      break;
    case 'set_auto_loot':
      // Strictly boolean: a malformed payload never arms it.
      sim.setAutoLoot(msg.enabled === true, pid);
      break;
    case 'set_harvest_preference':
      if (typeof msg.raw === 'string') sim.setHarvestPreference(msg.raw, pid);
      break;
  }
}
