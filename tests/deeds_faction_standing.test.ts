// The faction standing deed ladder (prog_<faction>_trusted / _champion plus
// prog_faction_champion_all) end to end through a real Sim: the two award
// sites (the world-quest turn-in and /dev rep) mark the player dirty, the
// standing* meters read PlayerMeta.factions, the evaluator grants on the next
// tick, and the Champion deeds put their faction title on the player.
import { describe, expect, it } from 'vitest';
import { DEEDS } from '../src/sim/content/deeds';
import { WORLD_QUESTS_BY_ID } from '../src/sim/content/world_quests';
import { STANDING_THRESHOLDS, worldQuestStandingReward } from '../src/sim/factions';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { awardWorldQuest } from '../src/sim/world_quests';
import { EMPTY_TEST_WORLD } from './sim_shared';

function devSim(seed = 42): Sim {
  return new Sim({ seed, playerClass: 'warrior', devCommands: true, world: EMPTY_TEST_WORLD });
}

function unlocked(evs: SimEvent[], deedId: string): number {
  return evs.filter((ev) => ev.type === 'deedUnlocked' && ev.deedId === deedId).length;
}

describe('faction standing deeds', () => {
  it('pins the ladder to the live standing thresholds and the vanguard flavor titles', () => {
    expect(DEEDS.prog_rift_watch_trusted.trigger).toEqual({
      kind: 'meter',
      meter: 'standingRiftWatch',
      amount: STANDING_THRESHOLDS.trusted,
    });
    expect(DEEDS.prog_church_order_trusted.trigger).toEqual({
      kind: 'meter',
      meter: 'standingChurchOrder',
      amount: STANDING_THRESHOLDS.trusted,
    });
    expect(DEEDS.prog_automatons_trusted.trigger).toEqual({
      kind: 'meter',
      meter: 'standingAutomatons',
      amount: STANDING_THRESHOLDS.trusted,
    });
    expect(DEEDS.prog_rift_watch_champion.trigger).toEqual({
      kind: 'meter',
      meter: 'standingRiftWatch',
      amount: STANDING_THRESHOLDS.champion,
    });
    expect(DEEDS.prog_rift_watch_champion.reward).toEqual({ kind: 'title', text: 'Magnate' });
    expect(DEEDS.prog_church_order_champion.reward).toEqual({
      kind: 'title',
      text: 'Lanternwarden',
    });
    expect(DEEDS.prog_automatons_champion.reward).toEqual({
      kind: 'title',
      text: 'Master Hearthwright',
    });
    expect(DEEDS.prog_faction_champion_all.trigger).toEqual({
      kind: 'meta',
      // Frozen (design rule 9): the shipped three; the Bracken Circle's
      // champion deed stands on its own.
      deedIds: [
        'prog_rift_watch_champion',
        'prog_church_order_champion',
        'prog_automatons_champion',
      ],
    });
    expect(DEEDS.prog_faction_champion_all.renown).toBe(50);
  });

  it('/dev rep crossing Trusted grants the Trusted deed on the next tick, and only that one', () => {
    const sim = devSim();
    const meta = sim.players.get(sim.playerId)!;
    // Under the threshold: the award marks a pass but nothing is earned.
    sim.chat(`/dev rep gilt_measure ${STANDING_THRESHOLDS.trusted - 1}`);
    let evs = sim.tick();
    expect(meta.deedsEarned.has('prog_rift_watch_trusted')).toBe(false);
    expect(unlocked(evs, 'prog_rift_watch_trusted')).toBe(0);

    // The crossing award (level 1 sits under the 3,000 low-level cap, so the
    // final point lands whole): granted at the tick tail, exactly once.
    sim.chat('/dev rep gilt_measure 1');
    expect(meta.factions.gilt_measure).toBe(STANDING_THRESHOLDS.trusted);
    expect(meta.deedsEarned.has('prog_rift_watch_trusted')).toBe(false);
    evs = sim.tick();
    expect(meta.deedsEarned.has('prog_rift_watch_trusted')).toBe(true);
    expect(unlocked(evs, 'prog_rift_watch_trusted')).toBe(1);
    // Per faction: the other two ladders and the Champion rung stay closed.
    expect(meta.deedsEarned.has('prog_church_order_trusted')).toBe(false);
    expect(meta.deedsEarned.has('prog_automatons_trusted')).toBe(false);
    expect(meta.deedsEarned.has('prog_rift_watch_champion')).toBe(false);
    // Already earned: never re-fires.
    sim.chat('/dev rep gilt_measure 1');
    evs = sim.tick();
    expect(unlocked(evs, 'prog_rift_watch_trusted')).toBe(0);
  });

  it('Champion standing with every faction grants the titles and the all-banners meta', () => {
    const sim = devSim();
    const meta = sim.players.get(sim.playerId)!;
    // A title cannot be worn before its deed is earned.
    sim.setActiveTitle('prog_rift_watch_champion');
    expect(sim.activeTitle).toBeNull();

    sim.chat('/dev level 20'); // lifts the low-level standing cap
    sim.chat(`/dev rep all ${STANDING_THRESHOLDS.champion}`);
    const evs = sim.tick();
    // Deed ids are frozen on the legacy faction keys (rift_watch is the Gilt
    // Measure, church_order the Lanternwardens, automatons the Hearthwright
    // Compact); the Bracken Circle's are new.
    for (const faction of ['rift_watch', 'church_order', 'automatons', 'bracken_circle'] as const) {
      expect(meta.deedsEarned.has(`prog_${faction}_trusted`), faction).toBe(true);
      expect(meta.deedsEarned.has(`prog_${faction}_champion`), faction).toBe(true);
      expect(unlocked(evs, `prog_${faction}_champion`), faction).toBe(1);
    }
    // The meta closes in the same pass (its three parts precede it in
    // DEED_ORDER, and 'meta' reads deedsEarned live).
    expect(meta.deedsEarned.has('prog_faction_champion_all')).toBe(true);
    expect(unlocked(evs, 'prog_faction_champion_all')).toBe(1);

    // The Champion deed's title is now selectable and reads through IWorld.
    sim.setActiveTitle('prog_rift_watch_champion');
    expect(sim.activeTitle).toBe('prog_rift_watch_champion');
    expect(DEEDS[sim.activeTitle!].reward).toEqual({ kind: 'title', text: 'Magnate' });
    sim.setActiveTitle('prog_automatons_champion');
    expect(sim.activeTitle).toBe('prog_automatons_champion');
  });

  it('a world-quest turn-in that crosses Trusted grants the deed on the next tick', () => {
    const sim = devSim();
    const meta = sim.players.get(sim.playerId)!;
    const player = sim.entities.get(sim.playerId)!;
    sim.chat('/dev level 20');
    const quest = WORLD_QUESTS_BY_ID.wq_farshore_salvage; // a Gilt Measure zone quest
    const award = worldQuestStandingReward(quest, player.level);
    expect(award).toBeGreaterThan(0);
    // Sit one point short of Trusted, then take the real turn-in reward path.
    meta.factions.gilt_measure = STANDING_THRESHOLDS.trusted - 1;
    sim.tick();
    expect(meta.deedsEarned.has('prog_rift_watch_trusted')).toBe(false);

    awardWorldQuest(sim.ctx, meta, quest);
    expect(meta.factions.gilt_measure).toBe(STANDING_THRESHOLDS.trusted - 1 + award);
    const evs = sim.tick();
    expect(meta.deedsEarned.has('prog_rift_watch_trusted')).toBe(true);
    expect(unlocked(evs, 'prog_rift_watch_trusted')).toBe(1);
    expect(meta.deedsEarned.has('prog_church_order_trusted')).toBe(false);
  });
});
