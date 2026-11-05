// Quest catches: a fishing quest's specific catch, landed only at the quest's
// own fishing spot while the quest still wants it (the owner's "catch 4 Shore
// Minnows at the jetty"). The catch item is an ordinary quest item; the quest
// counts it through its plain `collect` objective, so the turn-in, the
// tracker and the online mirror need nothing new.
//
// Hooked at the top of the landed-reel path (professions/fishing.ts
// completeFishing), beside the Codfather precedent: when it lands, the catch
// table is NOT rolled, so it draws no rng, pays no proficiency and mints no
// material provenance (a quest token, never a gathered material). A cast
// anywhere else, or after the objective is full, falls through to the ordinary
// table untouched.

import { QUESTS } from '../data';
import { PLAYER_SWIM_DEPTH } from '../pathfind';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { type Entity, questObjectiveRequired } from '../types';
import { groundHeight, waterLevel, waterLevelAt } from '../world';
import { questUseItemNeed } from './quest_object_use';

/** The ring the quest-water probe walks ahead of the angler (the cast ring of
 *  professions/fishing.ts FISHING_SAMPLE_DISTANCES, restated here so this
 *  module does not import its own caller). */
const QUEST_WATER_SAMPLE_DISTANCES = [4, 8, 12, 16, 20, 24] as const;

export interface QuestCatchSpot {
  /** The quest item the spot yields. */
  readonly itemId: string;
  /** Where the cast must stand (the angler's position, yards). */
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** Whether the player stands inside the spot's ring. */
export function standsAtCatchSpot(spot: QuestCatchSpot, pos: { x: number; z: number }): boolean {
  const dx = pos.x - spot.x;
  const dz = pos.z - spot.z;
  return dx * dx + dz * dz <= spot.radius * spot.radius;
}

/** The quest catch this cast should land, or null for the ordinary table:
 *  an active quest still short on a collect objective whose item is the
 *  spot's catch, with the angler inside that spot. */
export function questCatchFor(
  meta: PlayerMeta,
  pos: { x: number; z: number },
  spots: readonly QuestCatchSpot[],
  carried: (itemId: string) => number,
): string | null {
  for (const spot of spots) {
    if (!standsAtCatchSpot(spot, pos)) continue;
    for (const qp of meta.questLog.values()) {
      if (qp.state !== 'active') continue;
      const quest = QUESTS[qp.questId];
      if (!quest) continue;
      const have = carried(spot.itemId);
      const wanted =
        quest.objectives.some(
          (objective, index) =>
            objective.type === 'collect' &&
            objective.itemId === spot.itemId &&
            have < questObjectiveRequired(quest, qp, index),
        ) ||
        // A catch the quest spends (the keep-net, the stew pot) rather than
        // collects: wanted while the pending uses still need more of it.
        have < questUseItemNeed(qp.questId, qp, spot.itemId);
      if (wanted) return spot.itemId;
    }
  }
  return null;
}

/** The cast probe for a quest spot on open sea water. Ordinary fishing reads
 *  declared water bodies only (the sea stays unfishable, fishing.ts
 *  firstFishableSampleAhead), but a quest spot is authored at a jetty or the
 *  town steps that face the sea: while the spot's catch is still wanted, deep
 *  sea water ahead accepts the cast, and the landed reel is the quest catch
 *  (landQuestCatch), never a roll on any table. Null everywhere else, so the
 *  sea's ordinary deny is unchanged for every other cast. Pure state. */
export function questCatchWaterAhead(
  ctx: SimContext,
  p: Entity,
  meta: PlayerMeta,
  spots: readonly QuestCatchSpot[],
): { x: number; z: number; water: number } | null {
  if (questCatchFor(meta, p.pos, spots, (id) => ctx.countItem(id, meta.entityId)) === null) {
    return null;
  }
  const sin = Math.sin(p.facing);
  const cos = Math.cos(p.facing);
  for (const d of QUEST_WATER_SAMPLE_DISTANCES) {
    const sx = p.pos.x + sin * d;
    const sz = p.pos.z + cos * d;
    if (!Number.isFinite(waterLevelAt(sx, sz, ctx.cfg.seed))) continue;
    const water = waterLevel();
    if (groundHeight(sx, sz, ctx.cfg.seed) < water - PLAYER_SWIM_DEPTH)
      return { x: sx, z: sz, water };
  }
  return null;
}

/** Land a quest catch when one is due; true when it landed (the caller then
 *  skips the catch table). Quest items are force-added like the Codfather: a
 *  full bag must never strand the quest. */
export function landQuestCatch(
  ctx: SimContext,
  p: Entity,
  meta: PlayerMeta,
  spots: readonly QuestCatchSpot[],
): boolean {
  const itemId = questCatchFor(meta, p.pos, spots, (id) => ctx.countItem(id, meta.entityId));
  if (itemId === null) return false;
  ctx.addItem(itemId, 1, meta.entityId);
  return true;
}
