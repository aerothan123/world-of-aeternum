import { describe, expect, it } from 'vitest';
import {
  BRACKEN_CIRCLE_QUARTERMASTER_ID,
  FACTION_HUB_LANDINGS,
  FACTION_VENDOR_STOCK,
  vendorFactionForNpc,
} from '../src/sim/content/faction_vendors';
import { WEEKLY_QUESTS } from '../src/sim/content/weekly_quests';
import { WORLD_QUESTS } from '../src/sim/content/world_quests';
import { MOBS, NPCS } from '../src/sim/data';
import {
  FACTION_CURRENCY_IDS,
  FACTION_IDS,
  FACTIONS,
  factionForZone,
  HOSTILE_FACTIONS,
  hostileFactionForMob,
  LEGACY_FACTION_IDS,
  migrateFactionId,
  sanitizeAlliedHearthstoneAttunement,
  sanitizeFactionCurrencies,
  sanitizeFactionReputation,
  WORLD_QUEST_STANDING_AT_CAP,
  worldQuestFaction,
  worldQuestStandingReward,
} from '../src/sim/factions';
import { sanitizeWeeklyQuestProgress } from '../src/sim/weekly_quests';
import { WORLD_QUEST_ZONES } from '../src/sim/world_quest_rotation';
import { CURRENCY_IMAGE_IDS } from '../src/ui/currency_art';

// The Wyndlewood factions (docs/narrative/wyndlewood_decisions.md section 3):
// four allied standing factions plus the hostile Pale Accord, with every save
// written under the provisional ids carried onto the successors.
describe('Wyndlewood factions', () => {
  it('adopts the four allied factions and the hostile Pale Accord', () => {
    expect([...FACTION_IDS]).toEqual([
      'gilt_measure',
      'lanternwardens',
      'hearthwright_compact',
      'bracken_circle',
    ]);
    expect(Object.keys(HOSTILE_FACTIONS)).toEqual(['pale_accord']);
    expect(HOSTILE_FACTIONS.pale_accord.name).toBe('Pale Accord');
  });

  it('names only shipped mobs as Pale Accord agents', () => {
    for (const id of HOSTILE_FACTIONS.pale_accord.mobIds) {
      expect(MOBS[id], id).toBeDefined();
      expect(hostileFactionForMob(id)).toBe('pale_accord');
    }
    expect(hostileFactionForMob('forest_wolf')).toBeNull();
  });

  it('assigns every rotating world-quest zone to exactly one faction', () => {
    const owned = FACTION_IDS.flatMap((id) => FACTIONS[id].worldQuestZones);
    expect([...owned].sort()).toEqual([...WORLD_QUEST_ZONES].sort());
    for (const id of FACTION_IDS) {
      for (const zoneId of FACTIONS[id].worldQuestZones) {
        expect(FACTIONS[id].zones).toContain(zoneId);
        expect(factionForZone(zoneId)).toBe(id);
      }
    }
  });

  it('pays world quests a flat bracket amount, owned by activity not zone', () => {
    const owners = new Set(WORLD_QUESTS.map((q) => worldQuestFaction(q)));
    for (const id of FACTION_IDS) expect(owners.has(id), id).toBe(true);
    for (const quest of WORLD_QUESTS) {
      expect(worldQuestStandingReward(quest, 20)).toBe(WORLD_QUEST_STANDING_AT_CAP);
      expect(worldQuestStandingReward(quest, 15)).toBe(30);
    }
  });

  it('migrates legacy faction ids onto their successors', () => {
    expect(LEGACY_FACTION_IDS).toEqual({
      church_order: 'lanternwardens',
      automatons: 'hearthwright_compact',
      rift_watch: 'gilt_measure',
    });
    expect(migrateFactionId('church_order')).toBe('lanternwardens');
    expect(migrateFactionId('bracken_circle')).toBe('bracken_circle');
    expect(migrateFactionId('pale_accord')).toBeUndefined();
    expect(migrateFactionId(7)).toBeUndefined();
  });

  it('restores legacy saved standing and marks, a successor key winning', () => {
    expect(
      sanitizeFactionReputation({ rift_watch: 1200, church_order: 3400, automatons: 50 }),
    ).toEqual({
      lanternwardens: 3400,
      hearthwright_compact: 50,
      bracken_circle: 0,
      gilt_measure: 1200,
    });
    expect(
      sanitizeFactionReputation({ church_order: 900, lanternwardens: 1500 }).lanternwardens,
    ).toBe(1500);
    expect(sanitizeFactionCurrencies({ automatons: 12, rift_watch: -3 })).toEqual({
      lanternwardens: 0,
      hearthwright_compact: 12,
      bracken_circle: 0,
      gilt_measure: 0,
    });
    expect(sanitizeAlliedHearthstoneAttunement('rift_watch')).toBe('gilt_measure');
    expect(sanitizeAlliedHearthstoneAttunement('nowhere')).toBeUndefined();
  });

  it('restores a legacy weekly commendation as its successor', () => {
    const quest = WEEKLY_QUESTS[0];
    const row = sanitizeWeeklyQuestProgress({
      questId: quest.id,
      week: 'wk_10',
      count: quest.count,
      state: 'completed',
      commended: 'automatons',
    });
    expect(row?.commended).toBe('hearthwright_compact');
  });

  it('gives the Bracken Circle a quartermaster, a hub and a mark', () => {
    expect(vendorFactionForNpc(BRACKEN_CIRCLE_QUARTERMASTER_ID)).toBe('bracken_circle');
    expect(NPCS[BRACKEN_CIRCLE_QUARTERMASTER_ID].vendorItems).toEqual([
      ...FACTION_VENDOR_STOCK.bracken_circle,
    ]);
    for (const id of FACTION_IDS) {
      expect(FACTION_HUB_LANDINGS[id], id).toBeDefined();
      expect(CURRENCY_IMAGE_IDS.has(FACTION_CURRENCY_IDS[id]), id).toBe(true);
    }
  });
});
