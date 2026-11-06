// Craft at a station: a quest `interact` objective flagged `station` is a
// workbench, furnace or hearth the player works at, so EVERY use of the one
// object credits (smelt two ingots at the same furnace), where a plain
// interact objective credits once per DISTINCT object (the three-bells rule,
// quests/interact_object_credit.ts). The inputs and the output ride the shared
// use-item seam (quest_object_use.ts: usesItemId / alsoUses / yieldsItemId /
// yieldsCount), so a station recipe is pure data on the objective: no recipe
// row, no profession skill, no economy entry (the output is a quest item or a
// story reward the quest itself hands over, never a tradeable craft).
//
// Hooked into encounters/nythraxis.ts interactObjectForQuests: the distinct-
// object ledger key is null for a station, which skips the ledger. Pure; no rng.

import type { QuestObjective } from '../types';
import { interactObjectCreditKey } from './interact_object_credit';

type InteractObjective = Extract<QuestObjective, { type: 'interact' }>;

/** Whether the objective is a crafting station (repeat uses credit). */
export function isQuestStation(objective: InteractObjective): boolean {
  return objective.station === true;
}

/** The distinct-object ledger key for this credit, or null for a station
 *  (whose repeat uses of one object all credit). */
export function questObjectCreditKey(
  objective: InteractObjective,
  objectiveIndex: number,
  pos: { x: number; z: number },
): string | null {
  return isQuestStation(objective) ? null : interactObjectCreditKey(objectiveIndex, pos);
}
