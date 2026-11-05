// The ONE narrow seam life skills grant faction standing through
// (docs/design/wyndlewood-faction-ladder.md, sections 2 and 3).
//
// Faction identity is the story crew's (feature/wyndlewood-story renames the
// shipped factions: the Automatons' ladder becomes the Hearthwright Compact's,
// and adds the Bracken Circle). This module never hard-codes their final ids:
// an activity names its faction by ROLE, and the role resolves to the first id
// in its candidate list that the live FACTION_IDS carries. On this branch the
// Hearthwright role lands on the shipped Automatons ladder and the Bracken
// role on nothing (its grants are a no-op until the faction exists); after the
// story merge both resolve to the new ids with no edit here.
//
// The amount follows the ladder's standing formula (one pure function, never a
// per-activity rule): base x bracket(playerLevel) x levelFactor(content, player),
// with the 0.2 floor so a cap player feeding a launch-town project is still
// credited. Daily caps per activity ride the persisted per-character ledger
// (./life_skill_state.ts). Draws no rng.

import { awardFactionReputation, FACTION_IDS, type FactionId } from '../factions';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { zeroDiff } from '../types';
import { type LifeSkillStandingLedger, lifeSkillDailyRoom, recordLifeSkillStanding } from './life_skill_state';

export type LifeSkillFactionRole = 'hearthwright' | 'bracken';

const FACTION_CANDIDATES: Readonly<Record<LifeSkillFactionRole, readonly string[]>> = {
  hearthwright: ['hearthwright_compact', 'automatons'],
  bracken: ['bracken_circle'],
};

/** The activities that pay life-skill standing (ladder section 3 base values
 *  at bracket 1.0, and their daily caps). */
export const LIFE_SKILL_STANDING = {
  workOrder: { role: 'hearthwright', base: 100, dailyCap: 400 },
  townProject: { role: 'hearthwright', base: 25, dailyCap: 200 },
  gather: { role: 'bracken', base: 2, dailyCap: 150 },
} as const satisfies Record<
  string,
  { role: LifeSkillFactionRole; base: number; dailyCap: number }
>;

export type LifeSkillStandingActivity = keyof typeof LIFE_SKILL_STANDING;

export function factionForRole(role: LifeSkillFactionRole): FactionId | undefined {
  const live = FACTION_IDS as readonly string[];
  return FACTION_CANDIDATES[role].find((id) => live.includes(id)) as FactionId | undefined;
}

/** The ladder's bracket: 0.3 through level 15, 1.0 from 16. */
export function standingBracket(playerLevel: number): number {
  return playerLevel >= 16 ? 1 : 0.3;
}

/** The ladder's content-level factor, floored at 0.2. */
export function standingLevelFactor(contentLevel: number, playerLevel: number): number {
  const diff = playerLevel - contentLevel;
  if (diff <= 0) return 1;
  return Math.max(0.2, 1 - diff / zeroDiff(playerLevel));
}

/** The standing an activity pays before its daily cap. */
export function lifeSkillStandingAmount(
  activity: LifeSkillStandingActivity,
  contentLevel: number,
  playerLevel: number,
): number {
  const { base } = LIFE_SKILL_STANDING[activity];
  return Math.round(
    base * standingBracket(playerLevel) * standingLevelFactor(contentLevel, playerLevel),
  );
}

/** Grant an activity's standing through the shipped award path. Returns the
 *  standing actually gained (0 when the faction does not exist yet, the daily
 *  cap is spent, or the level cap holds it). */
export function grantLifeSkillStanding(
  ctx: SimContext,
  meta: PlayerMeta & { lifeSkillStanding?: LifeSkillStandingLedger },
  activity: LifeSkillStandingActivity,
  contentLevel: number,
): number {
  const { role, dailyCap } = LIFE_SKILL_STANDING[activity];
  const factionId = factionForRole(role);
  if (!factionId) return 0;
  const playerLevel = ctx.entities.get(meta.entityId)?.level ?? 1;
  const room = lifeSkillDailyRoom(meta, activity, dailyCap, ctx.resetDay);
  const amount = Math.min(room, lifeSkillStandingAmount(activity, contentLevel, playerLevel));
  if (amount <= 0) return 0;
  const result = awardFactionReputation(meta, factionId, amount, playerLevel);
  if (result.gained <= 0) return 0;
  recordLifeSkillStanding(meta, activity, result.gained, ctx.resetDay);
  ctx.markDeedsDirty(meta.entityId);
  meta.wireRev++;
  return result.gained;
}
