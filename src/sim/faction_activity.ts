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
// (recordFactionActivity): the kill credit, the gathering, fishing and craft
// completions, story escorts (escort.ts) and the first house bought
// (housing/ownership.ts) here (world quests pick their faction by objective type,
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
  | 'house_founded'
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
  house_founded: 'hearthwright_compact',
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
  // Once per character (recordFactionActivityOnce): the first house bought.
  house_founded: 50,
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

/** The steady per-action trades: their standing accrues without a loot line
 *  of its own (a herb, a fish or a craft already prints its result line, and
 *  a "+1 standing" after every one would bury the log; the Reputation tab
 *  shows the total). Everything else announces its gain. */
export const QUIET_FACTION_ACTIVITIES: ReadonlySet<FactionActivity> = new Set<FactionActivity>([
  'combat',
  'gather',
  'fishing',
  'craft',
  'trade',
  'market_sale',
]);

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
 * player's own loot line (none for QUIET_FACTION_ACTIVITIES). Returns the standing actually gained (the shared
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
  if (!QUIET_FACTION_ACTIVITIES.has(activity)) {
    ctx.emit({
      type: 'loot',
      text: `+${result.gained} ${factionDisplayName(factionId)} Standing.`,
      pid: meta.entityId,
    });
  }
  return result.gained;
}

/**
 * A one-off milestone (the first house bought, a restoration finished): pays
 * like recordFactionActivity the first time `markId` is seen on this
 * character and never again (the mark lives in the persisted visited set, so
 * selling and rebuying, or a relog, never pays twice). Returns the gain.
 */
export function recordFactionActivityOnce(
  ctx: SimContext,
  meta: PlayerMeta,
  activity: FactionActivity,
  markId: string,
  contentLevel: number | null,
): number {
  const key = `faction_activity:${markId}`;
  if (meta.deedStats.visited.has(key)) return 0;
  ctx.markVisited(meta, key);
  return recordFactionActivity(ctx, meta, activity, contentLevel);
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
