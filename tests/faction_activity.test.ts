// Faction standing from activities, not zones (src/sim/faction_activity.ts and
// factions.ts worldQuestFaction): each faction is paid by what the player does.
import { describe, expect, it } from 'vitest';
import { WORLD_QUESTS } from '../src/sim/content/world_quests';
import {
  FACTION_ACTIVITY_SOURCES,
  FACTION_ACTIVITY_STANDING,
  factionActivityStanding,
  gatherActivity,
  GREY_LEVEL_GAP,
  killActivity,
  recordFactionActivity,
} from '../src/sim/faction_activity';
import { FACTION_IDS, HOSTILE_FACTIONS, worldQuestFaction } from '../src/sim/factions';
import { onMobKilledForQuests } from '../src/sim/quests/quest_credit';
import { Sim } from '../src/sim/sim';
import { WORLD_SEED } from '../src/sim/world_seed';

function sim(level = 10): Sim {
  const s = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
  s.player.level = level;
  return s;
}

describe('activity sources', () => {
  it('maps every activity to an allied faction, and every faction has activities', () => {
    for (const factionId of Object.values(FACTION_ACTIVITY_SOURCES)) {
      expect(FACTION_IDS).toContain(factionId);
    }
    for (const factionId of FACTION_IDS) {
      expect(Object.values(FACTION_ACTIVITY_SOURCES), factionId).toContain(factionId);
    }
    expect(FACTION_ACTIVITY_SOURCES.pale_accord_kill).toBe('lanternwardens');
    expect(FACTION_ACTIVITY_SOURCES.craft).toBe('hearthwright_compact');
    expect(FACTION_ACTIVITY_SOURCES.gather).toBe('bracken_circle');
    expect(FACTION_ACTIVITY_SOURCES.fishing).toBe('bracken_circle');
    expect(FACTION_ACTIVITY_SOURCES.market_sale).toBe('gilt_measure');
  });

  it('pays nothing for grey content, the table amount otherwise', () => {
    expect(factionActivityStanding('pale_accord_kill', 20, 20 - GREY_LEVEL_GAP - 1)).toBe(0);
    expect(factionActivityStanding('pale_accord_kill', 20, 20 - GREY_LEVEL_GAP)).toBe(
      FACTION_ACTIVITY_STANDING.pale_accord_kill,
    );
    expect(factionActivityStanding('craft', 20, null)).toBe(FACTION_ACTIVITY_STANDING.craft);
  });

  it('classifies kills and nodes', () => {
    expect(killActivity(HOSTILE_FACTIONS.pale_accord.mobIds[0])).toBe('pale_accord_kill');
    expect(killActivity('forest_wolf')).toBeNull();
    expect(gatherActivity('herb')).toBe('gather');
    expect(gatherActivity('wood')).toBe('gather');
    expect(gatherActivity('ore')).toBeNull();
  });
});

describe('the seam', () => {
  it('awards the activity faction with the player loot line', () => {
    const s = sim();
    const meta = s.players.get(s.player.id)!;
    s.drainEvents();
    expect(recordFactionActivity(s.ctx, meta, 'market_sale', null)).toBe(1);
    expect(meta.factions.gilt_measure).toBe(1);
    const loot = s.drainEvents().filter((e) => e.type === 'loot');
    expect(loot.map((e) => (e as { text: string }).text)).toContain('+1 Gilt Measure Standing.');
  });

  it('pays the Lanternwardens for a Pale Accord kill through the kill credit', () => {
    const s = sim(4);
    const meta = s.players.get(s.player.id)!;
    const cultist = {
      ...s.player,
      kind: 'mob',
      templateId: 'veiled_rite_tender',
      level: 4,
    } as unknown as Parameters<typeof onMobKilledForQuests>[1];
    onMobKilledForQuests(s.ctx, cultist, meta);
    expect(meta.factions.lanternwardens).toBe(FACTION_ACTIVITY_STANDING.pale_accord_kill);
  });
});

describe('world quests pick their faction by activity, never by zone', () => {
  it('maps objective types onto the four factions', () => {
    const byType = new Map<string, Set<string>>();
    for (const quest of WORLD_QUESTS) {
      const set = byType.get(quest.objective.type) ?? new Set<string>();
      set.add(worldQuestFaction(quest));
      byType.set(quest.objective.type, set);
    }
    // One faction per activity type, whatever zones the quests stand in.
    for (const [type, factions] of byType) expect(factions.size, type).toBe(1);
    expect([...(byType.get('kill') ?? [])]).toEqual(['lanternwardens']);
    if (byType.has('gather')) expect([...byType.get('gather')!]).toEqual(['bracken_circle']);
    if (byType.has('delivery')) expect([...byType.get('delivery')!]).toEqual(['gilt_measure']);
  });
});
