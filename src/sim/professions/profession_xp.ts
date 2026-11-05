// Character XP for gathering and crafting actions (Wyndlewood owner decision,
// 2026-11: life skills are a path to the cap at about 1.5x the questing time,
// about 45 hours against questing's 30). Both curves are FORMULA-DRIVEN from
// the classic XP_TABLE, the way quest XP is (src/sim/quests/quest_xp.ts):
// one action pays a fixed share of the content level's XP bar, so every new
// node and recipe inherits the pacing without hand numbers.
//
// The shape is the classic green/gray falloff of combat XP (types.ts
// mobXpValue/zeroDiff): +5% per level for content above the player (capped
// at +4 levels), linearly reduced below it, and zero once the content is
// zeroDiff(playerLevel) or more levels below (the gray band). The access tier
// adds TIER_XP_BONUS per tier above 1, so the tool ladder still pays.
//
// The shares are DESIGN TARGETS (there is no classic gathering XP table), and
// the arithmetic behind them is stated once:
// - Questing pays about 0.65 bars an hour (progression plan: 1.3 to 1.8 hours
//   a level). Life skills at 1.5x the time pay about 0.43 bars an hour.
// - Steady gathering is about 100 harvests an hour (cast plus travel), so one
//   on-level harvest pays 1/250 of the bar: 2.5 hours a level on gathering
//   alone.
// - Crafting is gated by materials and by the skill a craft teaches (the
//   caller scales by the skill actually learned), so a full-gain craft pays
//   1/100 of the bar.
// - Work orders and town restoration contributions pay repeatable-quest XP
//   (quest_xp.ts) on top, which brings a mixed life-skill hour to the target.
// Anti-bot diminishing returns on trivial content live in
// src/sim/life_skills/life_skill_xp.ts, which wraps these curves.
//
// Pure, no randomness, zero DOM/browser/Three.js imports (src/sim/ purity,
// guarded by tests/architecture.test.ts).

import { MAX_LEVEL, xpForLevel, zeroDiff } from '../types';

/** Share of the node level's bar one harvest pays. */
export const GATHER_XP_BAR_SHARE = 1 / 250;
/** Share of the recipe level's bar one full-skill-gain craft pays. */
export const CRAFT_XP_BAR_SHARE = 1 / 100;
/** Extra XP per access tier above 1 (a tier 3 node pays +20%). */
export const TIER_XP_BONUS = 0.1;

function barFor(contentLevel: number): number {
  const level = Math.max(1, Math.min(MAX_LEVEL - 1, Math.round(contentLevel)));
  return xpForLevel(level);
}

function professionActionXp(base: number, contentLevel: number, playerLevel: number): number {
  const diff = contentLevel - playerLevel;
  if (diff >= 0) {
    return Math.max(1, Math.round(base * (1 + 0.05 * Math.min(diff, 4))));
  }
  const zd = zeroDiff(playerLevel);
  if (-diff >= zd) return 0; // gray: no XP from trivial content
  return Math.max(1, Math.round(base * (1 - -diff / zd)));
}

function tierMult(tier: number): number {
  return 1 + TIER_XP_BONUS * Math.max(0, Math.floor(tier) - 1);
}

// XP for one gathering-node harvest (gathering.ts harvestNode).
export function gatherActionXp(nodeLevel: number, playerLevel: number, tier = 1): number {
  return professionActionXp(
    GATHER_XP_BAR_SHARE * barFor(nodeLevel) * tierMult(tier),
    nodeLevel,
    playerLevel,
  );
}

// XP for one successful craft at full skill gain (crafting.ts
// resolveCraftForRecipe scales it by the skill actually learned).
export function craftActionXp(recipeLevel: number, playerLevel: number): number {
  return professionActionXp(CRAFT_XP_BAR_SHARE * barFor(recipeLevel), recipeLevel, playerLevel);
}
