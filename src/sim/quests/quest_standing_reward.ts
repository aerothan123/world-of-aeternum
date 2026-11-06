// Faction standing on a quest turn-in (QuestDef.standingReward): the
// Wyndlewood story and board quests each name the allied faction they serve
// (docs/narrative/chapter_one_quests.txt "Reward faction"). The award rides
// awardFactionReputation, so the level cap, the tier deeds, the chat receipt
// and the tier banner all behave exactly as for a world quest. Pure state on
// the authoritative turn-in path (quest_commands.ts turnInQuestCore); no rng.

import { awardFactionReputation, type FactionId, factionDisplayName } from '../factions';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { QuestDef } from '../types';

/** Standing a Chapter One story or side quest pays: the classic short-quest
 *  reputation step (a quarter of the classic 250-point full quest). */
export const STORY_QUEST_STANDING = 75;
/** Standing a town-board daily pays: the low-level world quest's figure
 *  (factions.ts worldQuestStandingReward, levels 5 to 15). */
export const BOARD_DAILY_STANDING = 30;

export function questStandingReward(
  factionId: FactionId,
  amount: number = STORY_QUEST_STANDING,
): NonNullable<QuestDef['standingReward']> {
  return { factionId, amount };
}

/** Grant a turned-in quest's standing. Returns the standing actually gained. */
export function grantQuestStandingReward(
  ctx: SimContext,
  quest: QuestDef,
  meta: PlayerMeta,
): number {
  const reward = quest.standingReward;
  if (!reward || reward.amount <= 0) return 0;
  const level = ctx.entities.get(meta.entityId)?.level ?? 1;
  const result = awardFactionReputation(meta, reward.factionId, reward.amount, level);
  if (result.gained <= 0) return 0;
  // The prog_<faction>_* meter deeds read PlayerMeta.factions with no narrow key.
  ctx.markDeedsDirty(meta.entityId);
  // fac rides the heavy owner snapshot: re-diff it this tick.
  meta.wireRev++;
  ctx.emit({
    type: 'loot',
    text: `+${result.gained} ${factionDisplayName(reward.factionId)} Standing.`,
    pid: meta.entityId,
  });
  return result.gained;
}
