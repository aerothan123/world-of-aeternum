// Faction standing from ACTIVITIES, not zones (Wyndlewood owner decision):
// each allied faction is earned by the kind of thing a player does, wherever
// they do it.
//
//   Lanternwardens        combat, patrols, escorts, protecting roads, Pale Accord kills
//   Hearthwright Compact  crafting, building, housing, town restoration, crafted deliveries
//   Bracken Circle        gathering (herbs, wood, fishing), wildlife and corruption cleansing
//   Gilt Measure          trading, market sales, delivery and commerce work, buy orders
//
// This module is the ONE seam every system calls to pay activity standing
// (recordFactionActivity): the kill credit and the gathering and fishing
// completions here (world quests pick their faction by objective type,
// factions.ts worldQuestFaction); crafting, housing, market
// and life-skill systems on other branches call the same function with their
// own activity id, so no system depends on another's internals. Quests and
// board dailies keep their authored faction (quests/quest_standing_reward.ts).
//
// Formula-driven and server-authoritative: a fixed amount per activity event,
// paid only for content that is not trivial to the player (the classic grey
// cutoff: nothing below the player's level minus GREY_LEVEL_GAP), through
// awardFactionReputation (the shared low-level cap). Pure state; no rng, no clock.

import {
  awardFactionReputation,
  type FactionId,
  factionDisplayName,
  HOSTILE_FACTIONS,
} from './factions';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';

export type FactionActivity =
  | 'combat'
  | 'patrol'
  | 'escort'
  | 'road_protection'
  | 'pale_accord_kill'
  | 'craft'
  | 'build'
  | 'housing'
  | 'town_restoration'
  | 'crafted_delivery'
  | 'gather'
  | 'fishing'
  | 'cleansing'
  | 'trade'
  | 'market_sale'
  | 'commerce'
  | 'buy_order';

/** Which faction each activity serves. */
export const FACTION_ACTIVITY_SOURCES: Readonly<Record<FactionActivity, FactionId>> = {
  combat: 'lanternwardens',
  patrol: 'lanternwardens',
  escort: 'lanternwardens',
  road_protection: 'lanternwardens',
  pale_accord_kill: 'lanternwardens',
  craft: 'hearthwright_compact',
  build: 'hearthwright_compact',
  housing: 'hearthwright_compact',
  town_restoration: 'hearthwright_compact',
  crafted_delivery: 'hearthwright_compact',
  gather: 'bracken_circle',
  fishing: 'bracken_circle',
  cleansing: 'bracken_circle',
  trade: 'gilt_measure',
  market_sale: 'gilt_measure',
  commerce: 'gilt_measure',
  buy_order: 'gilt_measure',
};

/** Standing per single activity event (a kill, a node, a catch, a craft, a
 *  sale). Faction-mob kills pay the classic 5; the steady trades pay 1 or 2
 *  per action. World quests use worldQuestActivityStanding instead. */
export const FACTION_ACTIVITY_STANDING: Readonly<Record<FactionActivity, number>> = {
  combat: 1,
  patrol: 2,
  escort: 10,
  road_protection: 2,
  pale_accord_kill: 5,
  craft: 2,
  build: 2,
  housing: 2,
  town_restoration: 5,
  crafted_delivery: 5,
  gather: 1,
  fishing: 1,
  cleansing: 2,
  trade: 1,
  market_sale: 1,
  commerce: 5,
  buy_order: 2,
};

/** Content this many levels under the player is grey and pays no standing. */
export const GREY_LEVEL_GAP = 5;

/** The standing one event pays: the activity's amount, or 0 when the content
 *  is grey to the player. `contentLevel` null means level-free content (a
 *  sale, a craft): always paid. */
export function factionActivityStanding(
  activity: FactionActivity,
  playerLevel: number,
  contentLevel: number | null,
): number {
  if (contentLevel !== null && contentLevel < playerLevel - GREY_LEVEL_GAP) return 0;
  return FACTION_ACTIVITY_STANDING[activity] ?? 0;
}

/**
 * THE seam: pay `meta` the standing one activity event earns, with the
 * player's own loot line. Returns the standing actually gained (the shared
 * caps may clip it). `amount` overrides the per-event table (world quests).
 */
export function recordFactionActivity(
  ctx: SimContext,
  meta: PlayerMeta,
  activity: FactionActivity,
  contentLevel: number | null,
  amount?: number,
): number {
  const player = ctx.entities.get(meta.entityId);
  if (!player) return 0;
  const award = amount ?? factionActivityStanding(activity, player.level, contentLevel);
  if (award <= 0) return 0;
  const factionId = FACTION_ACTIVITY_SOURCES[activity];
  const result = awardFactionReputation(meta, factionId, award, player.level);
  if (result.gained <= 0) return 0;
  ctx.markDeedsDirty(meta.entityId);
  ctx.emit({
    type: 'loot',
    text: `+${result.gained} ${factionDisplayName(factionId)} Standing.`,
    pid: meta.entityId,
  });
  return result.gained;
}

/** The activity a mob kill counts as: Pale Accord cultists for the Lanternwardens. */
export function killActivity(mobTemplateId: string | undefined): FactionActivity | null {
  if (!mobTemplateId) return null;
  return HOSTILE_FACTIONS.pale_accord.mobIds.includes(mobTemplateId) ? 'pale_accord_kill' : null;
}

/** The activity a gathered node counts as (ore is a trade input, not the
 *  Circle's stewardship). */
export function gatherActivity(nodeType: string): FactionActivity | null {
  return nodeType === 'herb' || nodeType === 'wood' ? 'gather' : null;
}
