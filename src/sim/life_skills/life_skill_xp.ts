// Life skills as a path to the cap (Wyndlewood owner decision, 2026-11): the
// character-XP grants for gathering and crafting with ANTI-BOT diminishing
// returns on trivial tasks. The curves themselves are
// src/sim/professions/profession_xp.ts (formula-driven from the XP bar); this
// module wraps them with the per-character fatigue on TRIVIAL content.
//
// Fatigue, stated once:
// - Content TRIVIAL_LEVEL_GAP or more levels below the player is trivial
//   (still green, not yet gray, which pays nothing already).
// - Every trivial task adds one point of fatigue; fatigue drains at
//   FATIGUE_DRAIN_PER_SECOND of sim time, so a human's mixed play barely
//   builds any, while an unbroken loop on trivial content (the bot pattern)
//   climbs steadily.
// - A trivial task's XP is multiplied by 1 / (1 + fatigue / FATIGUE_HALF_POINT),
//   floored at FATIGUE_FLOOR: about half after 30 back-to-back trivial tasks,
//   and an hour of one-every-30-seconds farming ends near a quarter.
// - On-level and harder content is never reduced and builds no fatigue.
// Runtime-only state (never saved): a relog clears it, which costs a bot the
// login rather than buying it anything.
//
// Deterministic: reads ctx.time (the sim clock) only; no rng.

import { craftActionXp, gatherActionXp } from '../professions/profession_xp';

/** Levels below the player at which content counts as trivial. */
export const TRIVIAL_LEVEL_GAP = 3;
/** Fatigue points drained per second of sim time. */
export const FATIGUE_DRAIN_PER_SECOND = 1 / 60;
/** Fatigue at which a trivial task pays half. */
export const FATIGUE_HALF_POINT = 30;
/** The lowest multiplier fatigue can reach. */
export const FATIGUE_FLOOR = 0.1;

/** Runtime-only per-character fatigue (PlayerMeta, via LifeSkillPlayerState). */
export interface LifeSkillFatigue {
  value: number;
  at: number;
}

export interface LifeSkillFatigueHolder {
  lifeSkillFatigue?: LifeSkillFatigue;
}

export function isTrivialTask(contentLevel: number, playerLevel: number): boolean {
  return playerLevel - contentLevel >= TRIVIAL_LEVEL_GAP;
}

/** The multiplier for this task, recording it. Non-trivial tasks read 1 and
 *  leave the fatigue untouched (it still drains with time). */
export function lifeSkillFatigueMult(
  holder: LifeSkillFatigueHolder,
  now: number,
  trivial: boolean,
): number {
  if (!trivial) return 1;
  const prev = holder.lifeSkillFatigue;
  const drained = prev ? Math.max(0, prev.value - (now - prev.at) * FATIGUE_DRAIN_PER_SECOND) : 0;
  const mult = Math.max(FATIGUE_FLOOR, 1 / (1 + drained / FATIGUE_HALF_POINT));
  holder.lifeSkillFatigue = { value: drained + 1, at: now };
  return mult;
}

/** Character XP for one harvest, fatigue applied. */
export function lifeSkillGatherXp(
  holder: LifeSkillFatigueHolder,
  now: number,
  nodeLevel: number,
  nodeTier: number,
  playerLevel: number,
): number {
  const base = gatherActionXp(nodeLevel, playerLevel, nodeTier);
  if (base === 0) return 0;
  const mult = lifeSkillFatigueMult(holder, now, isTrivialTask(nodeLevel, playerLevel));
  return Math.round(base * mult);
}

/** Character XP for one craft, scaled by the skill it taught (0..1) and
 *  fatigue applied. A craft that teaches nothing pays nothing and builds no
 *  fatigue. */
export function lifeSkillCraftXp(
  holder: LifeSkillFatigueHolder,
  now: number,
  recipeLevel: number,
  playerLevel: number,
  skillFraction: number,
): number {
  const base = Math.round(craftActionXp(recipeLevel, playerLevel) * skillFraction);
  if (base <= 0) return 0;
  const mult = lifeSkillFatigueMult(holder, now, isTrivialTask(recipeLevel, playerLevel));
  return Math.round(base * mult);
}
