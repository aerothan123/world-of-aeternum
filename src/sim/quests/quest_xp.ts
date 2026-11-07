// Quest reward XP (Wyndlewood pacing, docs/design/wyndlewood-game-plan-progression.md).
// A pure, host-agnostic leaf: it reads only static content tables and does
// arithmetic, so the turn-in (quest_commands.ts turnInQuestCore), the HUD quest
// dialogs and the wiki seed all price a quest the same way.
//
// The rule, stated once:
// - Every quest has a LEVEL (questLevelOf): the highest level its objectives
//   point at (a kill target's top level, a collected item's source level, the
//   quest's minLevel), else the median camp level of the giver's zone, else 1.
// - Its base XP is a fixed share of that level's bar (xpForLevel, the classic
//   XP_TABLE): QUEST_XP_BAR_SHARE for a one-time quest, so a typical quest pays
//   about 10% of the bar and about five completions fill a level once the kills
//   they require are counted. Repeatable quests (work orders, weeklies) pay the
//   smaller REPEATABLE_QUEST_XP_BAR_SHARE so a repeat loop never outpaces the
//   one-time story.
// - The authored `xpReward` is no longer the amount. It is kept as an opt-out:
//   an authored 0 means "this quest pays no XP" (the seasonal dailies, the
//   profession attunement quests); any positive value is superseded by the
//   formula, so new content inherits the pacing without hand numbers.
// - At turn-in the classic out-level reduction applies (outLevelXpFactor):
//   full XP up to 5 levels above the quest, then 80, 60, 40 and 20 percent,
//   and a 10 percent floor from 10 levels above.
//
// Determinism: no rng, no clock. The level index is built once, lazily, from
// the static tables (data.ts is never read at import time, so this leaf cannot
// join an init-order cycle).

import { CAMPS, MOBS, NPCS, zoneAt } from '../data';
import { itemSourceLevel } from '../item_level';
import { MAX_LEVEL, type QuestDef, xpForLevel } from '../types';

/** Share of the quest level's XP bar a one-time quest pays (owner decision,
 *  2026-11: about 30 hours to the cap, about five quests per level). */
export const QUEST_XP_BAR_SHARE = 0.1;

/** Share of the bar a repeatable quest pays (work orders, weekly and daily
 *  repeats). Matches the shipped work-order median (about 4% of the bar,
 *  measured 2026-11-04) so the repeat loops keep their pace. */
export const REPEATABLE_QUEST_XP_BAR_SHARE = 0.04;

/** Classic quest XP rounding: amounts snap to the nearest 5. */
const QUEST_XP_ROUNDING = 5;

/** Classic out-level reduction: the fraction of the quest's XP paid when the
 *  player is `levelsAbove` levels above the quest's level. */
export function outLevelXpFactor(levelsAbove: number): number {
  if (levelsAbove <= 5) return 1;
  if (levelsAbove >= 10) return 0.1;
  return OUT_LEVEL_STEPS[levelsAbove - 6];
}

/** The classic 6 to 9 levels-above steps, written exactly (no float drift). */
const OUT_LEVEL_STEPS = [0.8, 0.6, 0.4, 0.2] as const;

/** Whether a quest is a repeat loop (priced at the repeatable share). */
export function questIsRepeatable(quest: QuestDef): boolean {
  return !!(quest.repeatable || quest.dailyReset || quest.weeklyReset || quest.repeatCadenceTicks);
}

let zoneLevelIndex: Map<string, number> | null = null;

function buildZoneLevelIndex(): Map<string, number> {
  const lists = new Map<string, number[]>();
  for (const camp of CAMPS) {
    const t = MOBS[camp.mobId];
    if (!t || t.dummy || t.ambient || t.xpMult === 0) continue;
    const zoneId = zoneAt(camp.center.x, camp.center.z).id;
    const list = lists.get(zoneId) ?? [];
    list.push(t.maxLevel);
    lists.set(zoneId, list);
  }
  const out = new Map<string, number>();
  for (const [zoneId, list] of lists) {
    const sorted = [...list].sort((a, b) => a - b);
    out.set(zoneId, sorted[Math.floor(sorted.length / 2)]);
  }
  return out;
}

function giverZoneLevel(quest: QuestDef): number | undefined {
  const npc = NPCS[quest.giverNpcId] as { pos?: { x: number; z: number } } | undefined;
  if (!npc?.pos) return undefined;
  if (!zoneLevelIndex) zoneLevelIndex = buildZoneLevelIndex();
  return zoneLevelIndex.get(zoneAt(npc.pos.x, npc.pos.z).id);
}

const levelCache = new Map<QuestDef, number>();

/** The quest's level: what its objectives point at, else its giver's zone,
 *  clamped to 1..MAX_LEVEL. Cached per record. */
export function questLevelOf(quest: QuestDef): number {
  const cached = levelCache.get(quest);
  if (cached !== undefined) return cached;
  let lvl: number | undefined;
  const consider = (l: number | undefined) => {
    if (l !== undefined && Number.isFinite(l) && (lvl === undefined || l > lvl)) lvl = l;
  };
  for (const o of quest.objectives) {
    if (o.type === 'kill' && o.targetMobId) consider(MOBS[o.targetMobId]?.maxLevel);
    else if (o.type === 'collect' && o.itemId) consider(itemSourceLevel(o.itemId));
  }
  consider(quest.minLevel);
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.round(lvl ?? giverZoneLevel(quest) ?? 1)));
  levelCache.set(quest, level);
  return level;
}

function roundQuestXp(xp: number): number {
  return Math.max(QUEST_XP_ROUNDING, Math.round(xp / QUEST_XP_ROUNDING) * QUEST_XP_ROUNDING);
}

/** The quest's full XP (a player at or below its level, or up to 5 above). */
export function questBaseXp(quest: QuestDef): number {
  if (!(quest.xpReward > 0)) return 0;
  const share = questIsRepeatable(quest) ? REPEATABLE_QUEST_XP_BAR_SHARE : QUEST_XP_BAR_SHARE;
  return roundQuestXp(share * xpForLevel(questLevelOf(quest)));
}

/** The XP a player of `playerLevel` receives for turning the quest in. */
export function questRewardXp(quest: QuestDef, playerLevel: number): number {
  const base = questBaseXp(quest);
  if (base === 0) return 0;
  const factor = outLevelXpFactor(playerLevel - questLevelOf(quest));
  return factor === 1 ? base : roundQuestXp(base * factor);
}

/** Test seam: forget the cached levels (content edited in-process). */
export function resetQuestXpCache(): void {
  zoneLevelIndex = null;
  levelCache.clear();
}
