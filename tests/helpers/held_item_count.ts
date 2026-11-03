// How many copies of an item a character HOLDS on their person: the bags plus
// the gathering tool belt (src/sim/professions/gather_tool_slots.ts). A tool a
// quest or a grant hands over lands in its empty tool slot rather than the
// bags, so suites that used to count a tool with `countItem` count it here.

import type { Sim } from '../../src/sim/sim';

export function heldItemCount(sim: Sim, itemId: string, pid: number = sim.playerId): number {
  let belt = 0;
  for (const slot of Object.values(sim.gatherToolSlotsFor(pid))) {
    if (slot?.itemId === itemId) belt += slot.count;
  }
  return sim.countItem(itemId, pid) + belt;
}
