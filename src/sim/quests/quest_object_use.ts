// Use an item on an object or a person: an `interact` objective that names
// `usesItemId` asks the player to bring that item (bait the crab pot, set bread
// on the pantry saucer, pour oil in a lamp, hand a parcel to its addressee).
// The interact is refused without `usesCount` of the item (default 1) and of
// every `alsoUses` input, spends them on success unless `keepsUsedItem` is set
// (one damp cloth laid on each patch in turn; `alsoUses` inputs are always
// spent), and may hand back what the object gives up (`yieldsItemId`, times
// `yieldsCount`: the crab's stolen hat, the pantry spirit's key, the two
// walkway panels a workbench turns out).
//
// Hooked into both shared interact credit paths after their own once-only
// checks (encounters/nythraxis.ts interactObjectForQuests for objects,
// quest_npc_interaction.ts interactNpcForQuests for people), and into the
// ground pickup gate (interaction.ts pickUpObject), which lets a player pick
// up exactly as many of a used item as the quest still needs. Pure state; no rng.

import { QUESTS } from '../data';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { type QuestObjective, type QuestProgress, questObjectiveRequired } from '../types';

type InteractObjective = Extract<QuestObjective, { type: 'interact' }>;

export function questUseCount(objective: InteractObjective): number {
  return Math.max(1, objective.usesCount ?? 1);
}

/** Every input one credit of the objective needs, usesItemId first. */
export function questUseInputs(
  objective: InteractObjective,
): { itemId: string; count: number; kept: boolean }[] {
  const inputs: { itemId: string; count: number; kept: boolean }[] = [];
  if (objective.usesItemId) {
    inputs.push({
      itemId: objective.usesItemId,
      count: questUseCount(objective),
      kept: objective.keepsUsedItem === true,
    });
  }
  for (const extra of objective.alsoUses ?? []) {
    inputs.push({ itemId: extra.itemId, count: Math.max(1, extra.count), kept: false });
  }
  return inputs;
}

/** False (with the player's refusal line) when the objective needs an item the
 *  player does not carry enough of; true when it needs none or the bags hold it. */
export function questObjectUseReady(
  ctx: SimContext,
  meta: PlayerMeta,
  objective: InteractObjective,
): boolean {
  for (const input of questUseInputs(objective)) {
    if (ctx.countItem(input.itemId, meta.entityId) < input.count) {
      ctx.error(meta.entityId, 'You need the right item to use on that.');
      return false;
    }
  }
  return true;
}

/** Spend the used items and grant the yield (on the credit). The yield is
 *  force-added: a full bag must never strand the quest. */
export function applyQuestObjectUse(
  ctx: SimContext,
  meta: PlayerMeta,
  objective: InteractObjective,
): void {
  for (const input of questUseInputs(objective)) {
    if (!input.kept) ctx.removeItem(input.itemId, input.count, meta.entityId);
  }
  if (objective.yieldsItemId) {
    ctx.addItem(objective.yieldsItemId, Math.max(1, objective.yieldsCount ?? 1), meta.entityId);
  }
}

/** How many credits one hand-over to a person pays: a counted delivery
 *  (a spent usesItemId, no other inputs) takes every unit carried up to
 *  `remaining`; anything else credits once. Call after questObjectUseReady. */
export function questDeliveryUnits(
  ctx: SimContext,
  meta: PlayerMeta,
  objective: InteractObjective,
  remaining: number,
): number {
  if (!objective.usesItemId || objective.keepsUsedItem || objective.alsoUses?.length) return 1;
  const per = questUseCount(objective);
  const carried = Math.floor(ctx.countItem(objective.usesItemId, meta.entityId) / per);
  return Math.max(1, Math.min(remaining, carried));
}

/** How many of `itemId` the quest still needs carried for its pending uses:
 *  the pickup gate's limit for a used item with no collect objective of its
 *  own, and the quest catch's limit for a used catch. Counts only what the
 *  quest's own yields do not already supply. */
export function questUseItemNeed(questId: string, qp: QuestProgress, itemId: string): number {
  const quest = QUESTS[questId];
  if (!quest) return 0;
  let need = 0;
  quest.objectives.forEach((objective, index) => {
    if (objective.type !== 'interact') return;
    const remaining = questObjectiveRequired(quest, qp, index) - qp.counts[index];
    if (remaining <= 0) return;
    for (const input of questUseInputs(objective)) {
      if (input.itemId !== itemId) continue;
      // A kept item (the reusable cloth, the loaned axe) is needed once.
      need += input.kept ? input.count : remaining * input.count;
    }
  });
  return need;
}
