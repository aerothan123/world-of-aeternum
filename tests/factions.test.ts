import { describe, expect, it } from 'vitest';
import { WORLD_QUESTS, WORLD_QUESTS_BY_ID } from '../src/sim/content/world_quests';
import {
  awardFactionReputation,
  FACTION_IDS,
  FACTIONS,
  factionForZone,
  factionTierTitle,
  freshFactionReputation,
  LOW_LEVEL_MAX_STANDING,
  MAX_STANDING,
  maxStandingForLevel,
  STANDING_THRESHOLDS,
  STANDING_TIERS,
  sanitizeFactionReputation,
  standingProgress,
  standingTierForReputation,
  worldQuestFaction,
  worldQuestStandingReward,
} from '../src/sim/factions';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import {
  freshWorldQuestPlayerState,
  restoreWorldQuestState,
  savedWorldQuestState,
} from '../src/sim/world_quest_state';
import {
  worldQuestFactionLine,
  worldQuestFactionName,
  worldQuestRewardLine,
  worldQuestStandingRewardText,
} from '../src/ui/world_quest_view';

describe('factions and zone distribution', () => {
  it('defines the four Wyndlewood allied factions and their hubs', () => {
    expect(FACTION_IDS).toEqual([
      'gilt_measure',
      'lanternwardens',
      'hearthwright_compact',
      'bracken_circle',
    ]);

    expect(FACTIONS.gilt_measure.name).toBe('Gilt Measure');
    expect(FACTIONS.gilt_measure.hub.name).toBe('Drifthaven');
    expect(FACTIONS.gilt_measure.hub.zoneId).toBe('palmreach');

    expect(FACTIONS.lanternwardens.name).toBe('Lanternwardens');
    expect(FACTIONS.lanternwardens.hub.name).toBe('Eastbrook');
    expect(FACTIONS.lanternwardens.hub.zoneId).toBe('eastbrook_vale');

    expect(FACTIONS.hearthwright_compact.name).toBe('Hearthwright Compact');
    expect(FACTIONS.hearthwright_compact.hub.name).toBe('Wyrmwatch');
    expect(FACTIONS.hearthwright_compact.hub.zoneId).toBe('drakelands');

    expect(FACTIONS.bracken_circle.name).toBe('Bracken Circle');
    expect(FACTIONS.bracken_circle.hub.name).toBe('Fenbridge');
    expect(FACTIONS.bracken_circle.hub.zoneId).toBe('mirefen_marsh');
  });

  it('maps all 14 non-tutorial overworld zones to the 4 factions', () => {
    for (const z of ['palmreach', 'farshore', 'farshore_isle', 'evergarden'])
      expect(factionForZone(z), z).toBe('gilt_measure');
    for (const z of ['eastbrook_vale', 'zone1', 'frostveil', 'veiled_hollow', 'wraithwood'])
      expect(factionForZone(z), z).toBe('lanternwardens');
    for (const z of ['thornpeak_heights', 'zone3', 'drakelands', 'galecrest'])
      expect(factionForZone(z), z).toBe('hearthwright_compact');
    for (const z of ['mirefen_marsh', 'zone2', 'amberfall', 'willowfen', 'nightbloom'])
      expect(factionForZone(z), z).toBe('bracken_circle');

    // Proving Shore (tutorial) is excluded
    expect(factionForZone('proving_shore')).toBeNull();
  });

  it('attributes every authored World Quest to a valid faction', () => {
    expect(WORLD_QUESTS.length).toBeGreaterThanOrEqual(14);
    for (const quest of WORLD_QUESTS) {
      const faction = worldQuestFaction(quest);
      expect(FACTION_IDS).toContain(faction);
    }
  });
});

describe('standing tiers and thresholds', () => {
  it('implements the exact 6 cumulative standing tiers', () => {
    expect(STANDING_TIERS).toEqual([
      'unknown',
      'recognized',
      'trusted',
      'proven',
      'vanguard',
      'champion',
    ]);
    expect(STANDING_THRESHOLDS.unknown).toBe(0);
    expect(STANDING_THRESHOLDS.recognized).toBe(1_000);
    expect(STANDING_THRESHOLDS.trusted).toBe(3_000);
    expect(STANDING_THRESHOLDS.proven).toBe(7_000);
    expect(STANDING_THRESHOLDS.vanguard).toBe(13_000);
    expect(STANDING_THRESHOLDS.champion).toBe(20_000);
  });

  it('evaluates standing tiers accurately at boundaries', () => {
    expect(standingTierForReputation(0)).toBe('unknown');
    expect(standingTierForReputation(999)).toBe('unknown');
    expect(standingTierForReputation(1_000)).toBe('recognized');
    expect(standingTierForReputation(2_999)).toBe('recognized');
    expect(standingTierForReputation(3_000)).toBe('trusted');
    expect(standingTierForReputation(6_999)).toBe('trusted');
    expect(standingTierForReputation(7_000)).toBe('proven');
    expect(standingTierForReputation(12_999)).toBe('proven');
    expect(standingTierForReputation(13_000)).toBe('vanguard');
    expect(standingTierForReputation(19_999)).toBe('vanguard');
    expect(standingTierForReputation(20_000)).toBe('champion');
    expect(standingTierForReputation(50_000)).toBe('champion');
  });

  it('provides thematic faction flavor titles for each standing rank', () => {
    const ladder = (id: Parameters<typeof factionTierTitle>[0]) =>
      [0, 1_000, 3_000, 7_000, 13_000, 20_000].map((rep) => factionTierTitle(id, rep));
    expect(ladder('gilt_measure')).toEqual([
      'Outsider',
      'Client',
      'Associate',
      'Factor',
      'Magnate',
      'Champion',
    ]);
    expect(ladder('lanternwardens')).toEqual([
      'Outsider',
      'Lamplighter',
      'Lanternbearer',
      'Warden',
      'Lanternwarden',
      'Champion',
    ]);
    expect(ladder('hearthwright_compact')).toEqual([
      'Outsider',
      'Hand',
      'Journeyman',
      'Hearthwright',
      'Master Hearthwright',
      'Champion',
    ]);
    expect(ladder('bracken_circle')).toEqual([
      'Outsider',
      'Seedling',
      'Grovefriend',
      'Greenkeeper',
      'Circle Elder',
      'Champion',
    ]);
  });

  it('computes standingProgress percentage and remaining points within a tier', () => {
    // 1,500 rep: in Recognized (starts at 1,000, next is 3,000 -> 500 of 2,000 = 25%)
    const p1 = standingProgress(1_500);
    expect(p1.tier).toBe('recognized');
    expect(p1.tierStart).toBe(1_000);
    expect(p1.tierNext).toBe(3_000);
    expect(p1.tierProgress).toBe(500);
    expect(p1.tierRequired).toBe(2_000);
    expect(p1.percent).toBe(25);

    // At Champion: 100% complete
    const pChamp = standingProgress(20_000);
    expect(pChamp.tier).toBe('champion');
    expect(pChamp.tierNext).toBeNull();
    expect(pChamp.percent).toBe(100);
  });
});

describe('level brackets and synchronized daily reward math', () => {
  it('awards 30 reputation per WQ for level 5-15 characters', () => {
    const eastbrookQuest = WORLD_QUESTS_BY_ID.wq_eastbrook_bandits;
    expect(worldQuestStandingReward(eastbrookQuest, 5)).toBe(30);
    expect(worldQuestStandingReward(eastbrookQuest, 10)).toBe(30);
    expect(worldQuestStandingReward(eastbrookQuest, 15)).toBe(30);
  });

  it('caps level 5-15 characters at Trusted (3,000 standing)', () => {
    expect(maxStandingForLevel(5)).toBe(LOW_LEVEL_MAX_STANDING);
    expect(maxStandingForLevel(15)).toBe(3_000);
    expect(maxStandingForLevel(16)).toBe(MAX_STANDING);
    expect(maxStandingForLevel(20)).toBe(20_000);

    const meta = {
      ...freshWorldQuestPlayerState(),
    } as unknown as PlayerMeta;

    // Advance to 2,980
    meta.factions.lanternwardens = 2_980;
    const r1 = awardFactionReputation(meta, 'lanternwardens', 30, 10);
    expect(r1.gained).toBe(20);
    expect(r1.total).toBe(3_000);
    expect(r1.tier).toBe('trusted');
    expect(r1.capped).toBe(true);

    // Cannot exceed 3,000 while level <= 15
    const r2 = awardFactionReputation(meta, 'lanternwardens', 30, 15);
    expect(r2.gained).toBe(0);
    expect(r2.total).toBe(3_000);
    expect(r2.capped).toBe(true);

    // Leveling up to 16 lifts the cap!
    const r3 = awardFactionReputation(meta, 'lanternwardens', 80, 16);
    expect(r3.gained).toBe(80);
    expect(r3.total).toBe(3_080);
    expect(r3.capped).toBe(false);
  });

  it('reports the tier before the award so a caller can tell a tier from a plain gain', () => {
    const meta = { ...freshWorldQuestPlayerState() } as unknown as PlayerMeta;
    meta.factions = freshFactionReputation();
    meta.factions.gilt_measure = 980;
    const crossed = awardFactionReputation(meta, 'gilt_measure', 30, 16);
    expect(crossed.previousTier).toBe('unknown');
    expect(crossed.tier).toBe('recognized');
    const plain = awardFactionReputation(meta, 'gilt_measure', 30, 16);
    expect(plain.previousTier).toBe('recognized');
    expect(plain.tier).toBe('recognized');
    // A capped award that lands exactly on the threshold still reports the tier.
    meta.factions.gilt_measure = 2_990;
    const capped = awardFactionReputation(meta, 'gilt_measure', 500, 10);
    expect(capped.capped).toBe(true);
    expect(capped.previousTier).toBe('recognized');
    expect(capped.tier).toBe('trusted');
    // Nothing gained, nothing crossed.
    const stuck = awardFactionReputation(meta, 'gilt_measure', 500, 10);
    expect(stuck.gained).toBe(0);
    expect(stuck.previousTier).toBe(stuck.tier);
  });

  it('pays world quests a flat amount per bracket, the faction chosen by activity', () => {
    // Activities, not zones (faction_activity.ts): the objective type picks the
    // faction and the bracket alone sets the amount.
    for (const quest of WORLD_QUESTS) {
      expect(worldQuestStandingReward(quest, 10), quest.id).toBe(30);
      expect(worldQuestStandingReward(quest, 16), quest.id).toBe(100);
      expect(worldQuestStandingReward(quest, 20), quest.id).toBe(100);
      const byType: Record<string, string> = {
        kill: 'lanternwardens',
        escort: 'lanternwardens',
        gather: 'bracken_circle',
        delivery: 'gilt_measure',
        salvage: 'hearthwright_compact',
        forging: 'hearthwright_compact',
      };
      const expected = byType[quest.objective.type];
      if (expected) expect(worldQuestFaction(quest), quest.id).toBe(expected);
    }
  });
});

describe('faction state persistence and invariants', () => {
  it('starts fresh players with 0 reputation across all four factions', () => {
    const state = freshWorldQuestPlayerState();
    expect(state.factions).toEqual({
      gilt_measure: 0,
      lanternwardens: 0,
      hearthwright_compact: 0,
      bracken_circle: 0,
    });
  });

  it('persists and restores earned standing cleanly', () => {
    const meta = {
      ...freshWorldQuestPlayerState(),
      unlockedMilestones: new Set<string>(),
      worldQuestCycle: 'wq1_10',
    } as unknown as PlayerMeta;

    meta.factions.gilt_measure = 1_400;
    meta.factions.lanternwardens = 3_200;
    meta.factions.hearthwright_compact = 800;

    const saved = savedWorldQuestState(meta);
    expect(saved.worldQuests?.factions).toEqual({
      gilt_measure: 1_400,
      lanternwardens: 3_200,
      hearthwright_compact: 800,
      bracken_circle: 0,
    });
    expect(saved.factions).toEqual({
      gilt_measure: 1_400,
      lanternwardens: 3_200,
      hearthwright_compact: 800,
      bracken_circle: 0,
    });

    const targetMeta = {
      ...freshWorldQuestPlayerState(),
      unlockedMilestones: new Set<string>(),
    } as unknown as PlayerMeta;

    restoreWorldQuestState(targetMeta, saved.worldQuests, saved.factions);
    expect(targetMeta.factions).toEqual({
      gilt_measure: 1_400,
      lanternwardens: 3_200,
      hearthwright_compact: 800,
      bracken_circle: 0,
    });
  });

  it('clamps invalid or corrupted save values', () => {
    const sanitized = sanitizeFactionReputation({
      gilt_measure: -500,
      lanternwardens: 999_999,
      hearthwright_compact: 12.7,
      unknown_faction: 1_000,
    });
    expect(sanitized.gilt_measure).toBe(0);
    expect(sanitized.lanternwardens).toBe(MAX_STANDING);
    expect(sanitized.hearthwright_compact).toBe(12);
  });
});

describe('world quest UI display lines', () => {
  it('clearly formats faction and standing reward strings', () => {
    const giltQuest = WORLD_QUESTS_BY_ID.wq_farshore_salvage;
    expect(worldQuestFactionName(giltQuest)).toBe('Gilt Measure');
    expect(worldQuestFactionLine(giltQuest)).toBe('Faction: Gilt Measure');
    expect(worldQuestStandingRewardText(giltQuest, 20)).toBe('+133 Gilt Measure standing');

    const lanternQuest = WORLD_QUESTS_BY_ID.wq_eastbrook_bandits;
    expect(worldQuestFactionName(lanternQuest)).toBe('Lanternwardens');
    expect(worldQuestFactionLine(lanternQuest)).toBe('Faction: Lanternwardens');
    expect(worldQuestStandingRewardText(lanternQuest, 10)).toBe('+30 Lanternwardens standing');

    const hearthQuest = WORLD_QUESTS_BY_ID.wq_drakelands_brood;
    expect(worldQuestFactionName(hearthQuest)).toBe('Hearthwright Compact');
    expect(worldQuestFactionLine(hearthQuest)).toBe('Faction: Hearthwright Compact');
    expect(worldQuestStandingRewardText(hearthQuest, 20)).toBe(
      '+133 Hearthwright Compact standing',
    );
  });

  it('includes standing in the unified reward line', () => {
    const hearthQuest = WORLD_QUESTS_BY_ID.wq_drakelands_brood;
    const line = worldQuestRewardLine(hearthQuest, { level: 20, cls: 'warrior', cycle: 'wq1_0' });
    expect(line).toContain('+133 Hearthwright Compact standing');
  });
});
describe('simulation WQ completion standing integration', () => {
  it('awards standing when a quest is completed in the live simulation', () => {
    const sim = new Sim({ seed: 410, playerClass: 'warrior', autoEquip: true });
    const quest = WORLD_QUESTS_BY_ID.wq_eastbrook_bandits;
    sim.setPlayerLevel(10);
    sim.utcDay = '2026-08-31';
    sim.resetDay = '2026-08-31';
    const player = sim.player;
    player.pos.x = quest.area.x;
    player.pos.z = quest.area.z;
    player.prevPos = { ...player.pos };
    sim.tick();

    const meta = sim.meta(sim.playerId);
    if (!meta) throw new Error('Missing player meta');
    expect(meta.factions.lanternwardens).toBe(0);
    expect(sim.factions.lanternwardens).toBe(0);

    const objective = quest.objective;
    if (objective.type !== 'delivery') throw new Error('Expected delivery quest');
    // Each freight crate loads once per player, so every load takes a new crate.
    const pickups = [...sim.entities.values()].filter(
      (entity) => entity.objectItemId === objective.pickupObjectItemId,
    );
    const destination = [...sim.entities.values()].find(
      (entity) => entity.objectItemId === objective.deliveryObjectItemId,
    );
    if (pickups.length < quest.count || !destination) throw new Error('Missing delivery objects');
    for (let i = 0; i < quest.count; i++) {
      const pickup = pickups[i];
      player.pos.x = pickup.pos.x;
      player.pos.z = pickup.pos.z;
      expect(sim.pickUpObject(pickup.id)).toBe(true);
      player.pos.x = destination.pos.x;
      player.pos.z = destination.pos.z;
      expect(sim.pickUpObject(destination.id)).toBe(true);
    }

    expect(meta.factions.lanternwardens).toBe(30);
    expect(sim.factions.lanternwardens).toBe(30);
  });
});
