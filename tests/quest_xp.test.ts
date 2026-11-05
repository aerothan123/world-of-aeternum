// Quest reward XP formula (src/sim/quests/quest_xp.ts): a typical one-time
// quest pays 10% of its level's bar, repeatables 4%, an authored 0 opts out,
// and the classic out-level reduction applies at turn-in.
import { describe, expect, it } from 'vitest';
import { QUESTS } from '../src/sim/data';
import { turnInQuestCore } from '../src/sim/quests/quest_commands';
import {
  outLevelXpFactor,
  QUEST_XP_BAR_SHARE,
  questBaseXp,
  questIsRepeatable,
  questLevelOf,
  questRewardXp,
  REPEATABLE_QUEST_XP_BAR_SHARE,
} from '../src/sim/quests/quest_xp';
import { Sim } from '../src/sim/sim';
import { MAX_LEVEL, type QuestDef, xpForLevel } from '../src/sim/types';

function fixture(over: Partial<QuestDef> = {}): QuestDef {
  return {
    id: 'q_fixture_xp',
    name: 'Fixture',
    giverNpcId: 'none',
    turnInNpcId: 'none',
    text: '',
    completionText: '',
    objectives: [],
    xpReward: 1,
    copperReward: 0,
    itemRewards: {},
    minLevel: 8,
    ...over,
  };
}

describe('quest XP formula', () => {
  it('pays 10% of the quest level bar, snapped to 5', () => {
    const q = fixture();
    expect(questLevelOf(q)).toBe(8);
    expect(questBaseXp(q)).toBe(Math.round((QUEST_XP_BAR_SHARE * xpForLevel(8)) / 5) * 5);
    expect(questBaseXp(q)).toBe(540);
  });

  it('ignores the authored amount but honors an authored 0 as no XP', () => {
    expect(questBaseXp(fixture({ xpReward: 99999 }))).toBe(questBaseXp(fixture()));
    expect(questBaseXp(fixture({ xpReward: 0 }))).toBe(0);
    expect(questRewardXp(fixture({ xpReward: 0 }), 8)).toBe(0);
  });

  it('prices repeatables at the smaller share', () => {
    const q = fixture({ repeatable: true, repeatCadenceTicks: 100 });
    expect(questIsRepeatable(q)).toBe(true);
    expect(questBaseXp(q)).toBe(
      Math.round((REPEATABLE_QUEST_XP_BAR_SHARE * xpForLevel(8)) / 5) * 5,
    );
  });

  it('applies the classic out-level reduction', () => {
    expect([0, 5, 6, 7, 8, 9, 10, 15].map(outLevelXpFactor)).toEqual([
      1, 1, 0.8, 0.6, 0.4, 0.2, 0.1, 0.1,
    ]);
    const q = fixture({ minLevel: 3 });
    expect(questRewardXp(q, 1)).toBe(questBaseXp(q));
    expect(questRewardXp(q, 8)).toBe(questBaseXp(q));
    expect(questRewardXp(q, 13)).toBe(Math.round((questBaseXp(q) * 0.1) / 5) * 5);
  });

  it('gives every shipped quest a level in range and XP near 10% of its bar', () => {
    for (const q of Object.values(QUESTS)) {
      const lvl = questLevelOf(q);
      expect(lvl, q.id).toBeGreaterThanOrEqual(1);
      expect(lvl, q.id).toBeLessThanOrEqual(MAX_LEVEL);
      const xp = questBaseXp(q);
      if (q.xpReward <= 0) {
        expect(xp, q.id).toBe(0);
        continue;
      }
      const share = questIsRepeatable(q) ? REPEATABLE_QUEST_XP_BAR_SHARE : QUEST_XP_BAR_SHARE;
      expect(Math.abs(xp - share * xpForLevel(lvl)), q.id).toBeLessThanOrEqual(5);
    }
  });

  it('about five one-time quests at level fill a bar together with their kills', () => {
    // Model from the progression plan: quests supply about 65% of the XP, so
    // completions per level = 0.65 / share, about 6.5, and about 5 once
    // dungeon, gathering and crafting XP is counted.
    expect(0.65 / QUEST_XP_BAR_SHARE).toBeGreaterThan(5);
    expect(0.65 / QUEST_XP_BAR_SHARE).toBeLessThan(8);
  });

  it('the turn-in grants the formula amount (server-authoritative sim path)', () => {
    const sim = new Sim({ seed: 1, playerClass: 'warrior' });
    const quest = Object.values(QUESTS).find(
      (q) => q.xpReward > 0 && !questIsRepeatable(q) && !q.requiresQuest && questLevelOf(q) <= 3,
    ) as QuestDef;
    expect(quest).toBeDefined();
    const meta = sim.players.get(sim.playerId)!;
    meta.questLog.set(quest.id, {
      questId: quest.id,
      counts: quest.objectives.map(() => 0),
      state: 'ready',
    });
    const before = meta.lifetimeXp;
    expect(turnInQuestCore(sim.ctx, quest.id, quest, meta)).toBe(true);
    expect(meta.lifetimeXp - before).toBe(questRewardXp(quest, 1));
    expect(meta.lifetimeXp - before).toBe(questBaseXp(quest));
  });
});
