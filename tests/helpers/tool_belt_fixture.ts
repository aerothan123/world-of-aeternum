// A fixture world's carried tools as a worn tool belt: the best tool of each
// gathering profession in the given slots, placed in its tool slot (what the
// one-time migration does for a pre-belt character, minus the starter grant).
// Suites written before the belt modelled "the viewer carries this pick" with
// an inventory; the belt is where a tool works now, so their fixtures wear it.

import { GATHERING_PROFESSION_IDS } from '../../src/sim/content/professions';
import { ITEMS } from '../../src/sim/data';
import {
  bestBagToolIndex,
  type GatherToolSlots,
  gatherToolSlotFor,
} from '../../src/sim/professions/gather_tool_slots';
import type { Sim } from '../../src/sim/sim';
import type { InvSlot } from '../../src/sim/types';

export function beltFromCarried(inventory: readonly InvSlot[]): GatherToolSlots {
  const belt: GatherToolSlots = {};
  for (const id of GATHERING_PROFESSION_IDS) {
    const index = bestBagToolIndex(inventory, id, ITEMS);
    if (index >= 0) belt[id] = { ...inventory[index], count: 1 };
  }
  return belt;
}

/** Empty a character's tool belt: the bare-handed shape suites written before
 *  the starter belt (every new character starts with a pick, axe and sickle
 *  equipped) took for granted. */
export function emptyToolBelt(meta: { gatherTools?: GatherToolSlots } | undefined): void {
  if (meta) meta.gatherTools = {};
}

/**
 * Lose one copy of a tool the way a pre-belt suite did with `removeItem`
 * (traded, banked, dropped): out of its tool slot when it is the one worn
 * there, else out of the bags.
 */
export function loseTool(sim: Sim, itemId: string, pid: number = sim.playerId): void {
  const meta = sim.players.get(pid);
  const slot = gatherToolSlotFor(ITEMS[itemId]);
  if (slot && meta?.gatherTools?.[slot]?.itemId === itemId) {
    delete meta.gatherTools[slot];
    return;
  }
  sim.removeItem(itemId, 1, pid);
}

/** Put a tool straight into the BAGS, the way a pre-belt suite's grant did:
 *  an ordinary grant would fill an empty (or weaker) tool slot instead, and
 *  the bags are where a vendor, the market or a trade takes it from. */
export function bagTool(sim: Sim, itemId: string, pid: number = sim.playerId): void {
  sim.players.get(pid)?.inventory.push({ itemId, count: 1 });
}
