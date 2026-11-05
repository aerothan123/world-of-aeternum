// Life skills as a path to the cap (src/sim/life_skills/): the formula-driven
// gather and craft XP, the anti-bot fatigue on trivial content, the standing
// seam (ladder formula, faction by role, daily caps), the town restoration
// projects (contribute, stage roll-over, persistence) and the pacing target:
// about 1.5x the questing time to the cap.
import { describe, expect, it } from 'vitest';
import { TownProjectsStore } from '../server/town_projects_store';
import { TOWN_PROJECTS } from '../src/sim/content/town_projects';
import { FACTION_IDS } from '../src/sim/factions';
import {
  FATIGUE_FLOOR,
  factionForRole,
  isTrivialTask,
  lifeSkillDailyRoom,
  lifeSkillFatigueMult,
  lifeSkillGatherXp,
  lifeSkillStandingAmount,
  loadTownProjects,
  recordLifeSkillStanding,
  sanitizeLifeSkillStanding,
  serializeTownProjects,
  standingLevelFactor,
  townProjectBundleXp,
  townProjectProgress,
  townProjectStageDone,
  townProjectsRev,
  tryContributeAtTownProject,
} from '../src/sim/life_skills';
import { gatherActionXp } from '../src/sim/professions/profession_xp';
import { QUEST_XP_BAR_SHARE } from '../src/sim/quests/quest_xp';
import { Sim } from '../src/sim/sim';
import { MAX_LEVEL, xpForLevel } from '../src/sim/types';

describe('anti-bot fatigue on trivial content', () => {
  it('leaves on-level work untouched and tires an unbroken trivial loop', () => {
    expect(isTrivialTask(10, 10)).toBe(false);
    expect(isTrivialTask(7, 10)).toBe(true);
    const human: { lifeSkillFatigue?: { value: number; at: number } } = {};
    for (let i = 0; i < 100; i++) expect(lifeSkillFatigueMult(human, i * 30, false)).toBe(1);
    expect(human.lifeSkillFatigue).toBeUndefined();
    const bot: typeof human = {};
    const mults: number[] = [];
    for (let i = 0; i < 120; i++) mults.push(lifeSkillFatigueMult(bot, i * 30, true)); // 1 hour
    expect(mults[0]).toBe(1);
    for (let i = 1; i < mults.length; i++) expect(mults[i]).toBeLessThanOrEqual(mults[i - 1]);
    expect(mults[119]).toBeLessThan(0.4);
    expect(mults[119]).toBeGreaterThanOrEqual(FATIGUE_FLOOR);
    // Rest drains it: an hour away and the loop pays nearly full again.
    expect(lifeSkillFatigueMult(bot, 120 * 30 + 3600, true)).toBeGreaterThan(0.9);
  });

  it('reduces a trivial harvest but never a gray or on-level one', () => {
    const holder = {};
    expect(lifeSkillGatherXp(holder, 0, 10, 1, 10)).toBe(gatherActionXp(10, 10));
    expect(lifeSkillGatherXp(holder, 0, 1, 1, 20)).toBe(0); // gray
    const farmer = {};
    let last = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 60; i++) {
      const xp = lifeSkillGatherXp(farmer, i * 10, 6, 1, 10);
      expect(xp).toBeLessThanOrEqual(last);
      last = xp;
    }
    expect(last).toBeLessThan(gatherActionXp(6, 10));
  });
});

describe('pacing: life skills reach the cap at about 1.5x questing', () => {
  it('on-level gathering at 100 harvests an hour lands near 45 hours, questing near 30', () => {
    let gatherHours = 0;
    for (let level = 1; level < MAX_LEVEL; level++) {
      gatherHours += xpForLevel(level) / (gatherActionXp(level, level) * 100);
    }
    // Gathering alone: 2.5 hours a level. Work orders and town projects bring
    // a mixed life-skill hour to the 45 hour target (the module header).
    expect(gatherHours).toBeGreaterThan(40);
    expect(gatherHours).toBeLessThan(52);
    // The questing reference: five 10%-bar quests a level plus their kills
    // at the progression plan's 1.3 to 1.8 hours a level.
    expect(QUEST_XP_BAR_SHARE).toBe(0.1);
  });
});

describe('the standing seam', () => {
  it('resolves factions by role against the live ids', () => {
    const live = FACTION_IDS as readonly string[];
    const hw = factionForRole('hearthwright');
    expect(hw === undefined || live.includes(hw)).toBe(true);
    expect(live.includes('automatons') || live.includes('hearthwright_compact')).toBe(true);
    expect(hw).toBeDefined();
    const br = factionForRole('bracken');
    expect(br === undefined || live.includes(br)).toBe(true);
  });

  it('follows the ladder formula: bracket and a 0.2 level-factor floor', () => {
    expect(lifeSkillStandingAmount('workOrder', 18, 18)).toBe(100);
    expect(lifeSkillStandingAmount('workOrder', 10, 10)).toBe(30);
    expect(standingLevelFactor(2, 20)).toBe(0.2);
    expect(lifeSkillStandingAmount('townProject', 5, 20)).toBe(5);
  });

  it('caps each activity per reset day on a ledger that persists sparsely', () => {
    const holder: Parameters<typeof recordLifeSkillStanding>[0] = {};
    expect(lifeSkillDailyRoom(holder, 'gather', 150, 'd1')).toBe(150);
    recordLifeSkillStanding(holder, 'gather', 140, 'd1');
    expect(lifeSkillDailyRoom(holder, 'gather', 150, 'd1')).toBe(10);
    expect(lifeSkillDailyRoom(holder, 'gather', 150, 'd2')).toBe(150);
    expect(sanitizeLifeSkillStanding(holder.lifeSkillStanding)).toEqual({
      day: 'd1',
      earned: { gather: 140 },
    });
    expect(sanitizeLifeSkillStanding('junk')).toBeUndefined();
    expect(sanitizeLifeSkillStanding({ day: 'd', earned: { a: -1, b: 2.7 } })).toEqual({
      day: 'd',
      earned: { b: 2 },
    });
  });
});

describe('town restoration projects', () => {
  const WELL = TOWN_PROJECTS[0];

  function simAtWell(): Sim {
    const sim = new Sim({ seed: 9, playerClass: 'warrior' });
    sim.setPlayerLevel(5);
    sim.player.pos.x = WELL.site.x;
    sim.player.pos.z = WELL.site.z;
    sim.player.prevPos = { ...sim.player.pos };
    return sim;
  }
  const meta = (sim: Sim) => sim.players.get(sim.playerId)!;

  it('ships Eastbrook examples with known materials and unique stage ids', () => {
    expect(TOWN_PROJECTS.length).toBeGreaterThanOrEqual(2);
    const ids = TOWN_PROJECTS.flatMap((p) => [p.id, ...p.stages.map((s) => s.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of TOWN_PROJECTS) {
      expect(p.zoneId).toBe('eastbrook_vale');
      for (const st of p.stages) {
        expect(st.bundlesNeeded).toBeGreaterThan(0);
        for (const b of st.bundle) expect(b.count).toBeGreaterThan(0);
      }
    }
  });

  it('takes one bundle, pays XP, rolls the stage over, and is realm state', () => {
    const sim = simAtWell();
    const m = meta(sim);
    const stage = WELL.stages[0];
    // Without the materials the press explains and takes nothing.
    sim.drainEvents();
    expect(tryContributeAtTownProject(sim.ctx, m, sim.player)).toBe(true);
    expect(townProjectProgress(sim.ctx, WELL.id)).toEqual({ stage: 0, bundles: 0 });
    for (const b of stage.bundle) sim.addItem(b.itemId, b.count * stage.bundlesNeeded);
    const xpBefore = sim.xp;
    const rev = townProjectsRev(sim.ctx);
    expect(tryContributeAtTownProject(sim.ctx, m, sim.player)).toBe(true);
    expect(townProjectProgress(sim.ctx, WELL.id)).toEqual({ stage: 0, bundles: 1 });
    expect(townProjectsRev(sim.ctx)).toBe(rev + 1);
    expect(sim.xp - xpBefore).toBe(townProjectBundleXp(WELL, 5));
    for (let i = 1; i < stage.bundlesNeeded; i++)
      tryContributeAtTownProject(sim.ctx, m, sim.player);
    expect(townProjectProgress(sim.ctx, WELL.id)).toEqual({ stage: 1, bundles: 0 });
    expect(townProjectStageDone(sim.ctx, stage.id)).toBe(true);
    expect(townProjectStageDone(sim.ctx, WELL.stages[1].id)).toBe(false);
    for (const b of stage.bundle) expect(sim.countItem(b.itemId)).toBe(0);
    // Away from the site the press is not spent here.
    sim.player.pos.x += 20;
    expect(tryContributeAtTownProject(sim.ctx, m, sim.player)).toBe(false);
    // Another Sim is another realm: isolated state.
    expect(townProjectProgress(simAtWell().ctx, WELL.id)).toEqual({ stage: 0, bundles: 0 });
  });

  it('persists sparsely, clamps on load, and keeps unknown rows', () => {
    const sim = simAtWell();
    expect(serializeTownProjects(sim.ctx)).toEqual({});
    loadTownProjects(sim.ctx, {
      [WELL.id]: { stage: 99, bundles: 5 },
      eastbrook_street_lamps: { stage: 0, bundles: 9999 },
      future_project: { stage: 2, bundles: 1 },
    });
    expect(townProjectProgress(sim.ctx, WELL.id)).toEqual({
      stage: WELL.stages.length,
      bundles: 0,
    });
    const lamps = TOWN_PROJECTS[1];
    expect(townProjectProgress(sim.ctx, lamps.id).bundles).toBe(lamps.stages[0].bundlesNeeded - 1);
    expect(serializeTownProjects(sim.ctx).future_project).toEqual({ stage: 2, bundles: 1 });
  });

  it('the server store writes only when the projects changed', async () => {
    const sim = simAtWell();
    const writes: unknown[] = [];
    const store = new TownProjectsStore(sim.ctx, 'r1', {
      load: async () => ({ [WELL.id]: { stage: 0, bundles: 3 } }),
      save: async (_key, data) => {
        writes.push(data);
      },
    });
    await store.load();
    expect(townProjectProgress(sim.ctx, WELL.id).bundles).toBe(3);
    expect(await store.saveIfChanged()).toBe(false);
    const stage = WELL.stages[0];
    for (const b of stage.bundle) sim.addItem(b.itemId, b.count);
    tryContributeAtTownProject(sim.ctx, meta(sim), sim.player);
    expect(await store.saveIfChanged()).toBe(true);
    expect(await store.saveIfChanged()).toBe(false);
    expect(writes).toEqual([{ [WELL.id]: { stage: 0, bundles: 4 } }]);
  });
});

describe('town project progress event', () => {
  it('every press at a site reports the progress, contributed or not', () => {
    const sim = new Sim({ seed: 4, playerClass: 'warrior' });
    const well = TOWN_PROJECTS[0];
    sim.player.pos.x = well.site.x;
    sim.player.pos.z = well.site.z;
    const meta = sim.players.get(sim.playerId)!;
    sim.drainEvents();
    tryContributeAtTownProject(sim.ctx, meta, sim.player);
    const first = sim.drainEvents().filter((e) => e.type === 'townProject');
    expect(first).toEqual([
      {
        type: 'townProject',
        pid: sim.playerId,
        projectId: well.id,
        stage: 0,
        bundles: 0,
        contributed: false,
      },
    ]);
    for (const b of well.stages[0].bundle) sim.addItem(b.itemId, b.count);
    tryContributeAtTownProject(sim.ctx, meta, sim.player);
    const second = sim.drainEvents().filter((e) => e.type === 'townProject');
    expect(second).toEqual([
      {
        type: 'townProject',
        pid: sim.playerId,
        projectId: well.id,
        stage: 0,
        bundles: 1,
        contributed: true,
      },
    ]);
  });
});
