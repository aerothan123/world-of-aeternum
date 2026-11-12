// Gourdlight Eve's whole-event meta (round 12): "Gourdlight, Start to Finish" and its
// title, the Gourdsworn. Every leaf is a lifetime mark in the deeds visited ledger
// (content/gourdlight_eve_deeds.ts), written by the site where the act really resolves
// (seasonal/gourdlight_deed_marks.ts). Pinned here through the real code paths: a
// turned-in errand marks the errand, the Thatchgrin kill and the pumpkin hunt mark their
// leaves; the section Feat and the meta grant the tick their last leaf lands, the meta
// carries the title and it is wearable; marks survive a save and a reload (and so a reset
// day and a new edition); the join refill credits what a save already proves; the Book
// shows progress.
//
// The owner removed trick-or-treat from the new world and overrode the deeds no-retro-edit
// rule for its deeds: the knock Feat (feat_gourdlight_doorsteps, Every Doorstep) and the
// Boo! fright Feat (feat_gourdlight_frights, Three Towns Startled) were deleted outright,
// and the knock and fright marks left the meta's checklist. The catalog test below pins
// that both are gone and that no knock or boo mark is left in the meta.
import { afterEach, describe, expect, it } from 'vitest';
import { DEEDS } from '../src/sim/content/deeds';
import {
  GOURDLIGHT_DAILY_PATCH_QUEST_ID,
  GOURDLIGHT_DAILY_POOL,
  GOURDLIGHT_KEEPER_ENTITY_ID,
} from '../src/sim/content/gourdlight_eve';
import { PATCH_PUMPKIN_ID, PATCH_PUMPKINS_WANTED } from '../src/sim/content/gourdlight_eve_dailies';
import {
  GOURDLIGHT_ERRAND_MARKS,
  GOURDLIGHT_EVE_MARKS,
  GOURDLIGHT_META_TITLE,
  GOURDLIGHT_PUMPKIN_HUNT_MARK,
  GOURDLIGHT_THATCHGRIN_MARK,
  gourdlightErrandMark,
} from '../src/sim/content/gourdlight_eve_deeds';
import { THATCHGRIN_ID } from '../src/sim/content/gourdlight_eve_scarecrow';
import { GOURDLIGHT_PUMPKINS } from '../src/sim/content/gourdlight_pumpkins';
import { RELIQUARY_HORIZON_TITLES } from '../src/sim/content/reliquary';
import { onWorldBossKilledForDeeds, VISITED_MARK_NAMESPACES } from '../src/sim/deeds';
import {
  markGourdlightErrand,
  refillGourdlightMarks,
} from '../src/sim/seasonal/gourdlight_deed_marks';
import { discoverHauntedPumpkin } from '../src/sim/seasonal/haunted_pumpkins';
import { syncSeasonalDecorColliders } from '../src/sim/seasonal_decor_colliders';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';
import { deedProgress } from '../src/ui/deeds_view';

afterEach(() => syncSeasonalDecorColliders(WORLD_SEED, null));

const META = 'feat_gourdlight_eve_complete';
const SECTIONS = ['feat_gourdlight_errands'];
/** The trick-or-treat Feats the owner removed (kept here only to pin that they are gone). */
const REMOVED = ['feat_gourdlight_doorsteps', 'feat_gourdlight_frights'];

function world(): Sim {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', devCommands: true });
  sim.resetDay = '2026-10-20';
  sim.player.level = 20;
  sim.chat('/dev season on');
  sim.tick();
  return sim;
}

// biome-ignore lint/suspicious/noExplicitAny: the sim's own player ledger, as the sibling suites read it
const metaOf = (sim: Sim) => (sim as any).players.get(sim.playerId);

function standBeside(sim: Sim, e: Entity): void {
  sim.player.pos.x = e.pos.x + 1.5;
  sim.player.pos.z = e.pos.z;
  sim.player.pos.y = e.pos.y;
}

function take(sim: Sim, questId: string): void {
  sim.chat(`/dev season daily ${questId}`);
  standBeside(sim, sim.entities.get(GOURDLIGHT_KEEPER_ENTITY_ID) as Entity);
  sim.acceptQuest(questId);
  sim.tick();
  expect(sim.questState(questId)).toBe('active');
}

/** The patch errand end to end: take it, gather the pumpkins, turn it in. */
function doPatchErrand(sim: Sim): void {
  take(sim, GOURDLIGHT_DAILY_PATCH_QUEST_ID);
  const pumpkins = [...sim.entities.values()].filter(
    (e) => e.kind === 'object' && e.objectItemId === PATCH_PUMPKIN_ID,
  );
  for (const p of pumpkins.slice(0, PATCH_PUMPKINS_WANTED)) {
    standBeside(sim, p);
    sim.pickUpObject(p.id);
    sim.tick();
  }
  standBeside(sim, sim.entities.get(GOURDLIGHT_KEEPER_ENTITY_ID) as Entity);
  sim.turnInQuest(GOURDLIGHT_DAILY_PATCH_QUEST_ID);
  sim.tick();
}

describe('the catalog', () => {
  it('is a section Feat and a meta, cosmetic only, with the one title on the meta', () => {
    for (const id of REMOVED) expect(DEEDS[id], id).toBeUndefined();
    for (const id of [...SECTIONS, META]) {
      const def = DEEDS[id];
      expect(def, id).toBeDefined();
      expect(def.feat).toBe(true);
      expect(def.renown).toBe(0);
      expect(def.category).toBe('feat');
      expect(def.trigger.kind).toBe('visits');
    }
    expect(DEEDS[META].reward).toEqual({ kind: 'title', text: 'the Gourdsworn' });
    expect(GOURDLIGHT_META_TITLE).toBe('the Gourdsworn');
    for (const id of SECTIONS) expect(DEEDS[id].reward).toBeUndefined();
    // the meta's title pages on the Reliquary's titles page (the locked rule)
    expect(RELIQUARY_HORIZON_TITLES as readonly string[]).toContain(META);
  });

  it('builds every leaf from the event tables: 4 errands, the boss, the hunt', () => {
    expect(GOURDLIGHT_ERRAND_MARKS).toEqual(GOURDLIGHT_DAILY_POOL.map(gourdlightErrandMark));
    expect(GOURDLIGHT_ERRAND_MARKS).toHaveLength(4);
    expect(GOURDLIGHT_EVE_MARKS).toHaveLength(1 + 1 + 4);
    // no trick-or-treat leaf is left (owner removal): no knock, no fright
    for (const mark of GOURDLIGHT_EVE_MARKS) {
      expect(mark.startsWith('gourdlight:knock:'), mark).toBe(false);
      expect(mark.startsWith('gourdlight:boo:'), mark).toBe(false);
    }
    expect(new Set(GOURDLIGHT_EVE_MARKS).size).toBe(GOURDLIGHT_EVE_MARKS.length);
    // the meta is exactly its sections plus the two existing Feats' acts
    expect(new Set(GOURDLIGHT_EVE_MARKS)).toEqual(
      new Set([
        GOURDLIGHT_THATCHGRIN_MARK,
        GOURDLIGHT_PUMPKIN_HUNT_MARK,
        ...GOURDLIGHT_ERRAND_MARKS,
      ]),
    );
    expect(VISITED_MARK_NAMESPACES).toContain('gourdlight');
    for (const mark of GOURDLIGHT_EVE_MARKS) expect(mark.startsWith('gourdlight:')).toBe(true);
  });
});

describe('the leaves, through the real sites', () => {
  it('a turned-in errand marks the errand (the patch errand end to end)', () => {
    const sim = world();
    const meta = metaOf(sim);
    take(sim, GOURDLIGHT_DAILY_PATCH_QUEST_ID);
    const pumpkins = [...sim.entities.values()].filter(
      (e) => e.kind === 'object' && e.objectItemId === PATCH_PUMPKIN_ID,
    );
    for (const p of pumpkins.slice(0, PATCH_PUMPKINS_WANTED)) {
      standBeside(sim, p);
      sim.pickUpObject(p.id);
      sim.tick();
    }
    const mark = gourdlightErrandMark(GOURDLIGHT_DAILY_PATCH_QUEST_ID);
    expect(meta.deedStats.visited.has(mark)).toBe(false);
    standBeside(sim, sim.entities.get(GOURDLIGHT_KEEPER_ENTITY_ID) as Entity);
    sim.turnInQuest(GOURDLIGHT_DAILY_PATCH_QUEST_ID);
    sim.tick();
    expect(meta.deedStats.visited.has(mark)).toBe(true);
  });

  it("only the pool errands mark, and all four grant At Hester's Beck and Call", () => {
    const sim = world();
    const meta = metaOf(sim);
    markGourdlightErrand(sim.ctx, meta, 'q_wolves');
    expect([...meta.deedStats.visited].some((m: string) => m.startsWith('gourdlight:'))).toBe(
      false,
    );
    for (const [i, q] of GOURDLIGHT_DAILY_POOL.entries()) {
      markGourdlightErrand(sim.ctx, meta, q);
      sim.tick();
      expect(meta.deedsEarned.has('feat_gourdlight_errands')).toBe(
        i === GOURDLIGHT_DAILY_POOL.length - 1,
      );
    }
  });

  it('the Thatchgrin kill marks its leaf for every contributor', () => {
    const sim = world();
    const meta = metaOf(sim);
    const boss = [...sim.entities.values()].find((e) => e.templateId === THATCHGRIN_ID) as Entity;
    onWorldBossKilledForDeeds(sim.ctx, boss, [meta]);
    expect(meta.deedStats.visited.has(GOURDLIGHT_THATCHGRIN_MARK)).toBe(true);
    expect(meta.deedStats.counters.thatchgrinKills).toBe(1);
  });

  it('the hunt leaf lands with the Pumpkin Hunter feat on the last pumpkin', () => {
    const sim = world();
    const meta = metaOf(sim);
    for (const p of GOURDLIGHT_PUMPKINS.slice(0, -1)) meta.hauntedPumpkins.add(p.id);
    const last = GOURDLIGHT_PUMPKINS[GOURDLIGHT_PUMPKINS.length - 1];
    // the hunt's own site (the interact path's call), on the last pumpkin's object
    const obj = sim.entities.get(-910000 - (GOURDLIGHT_PUMPKINS.length - 1)) as Entity;
    expect(obj).toBeDefined();
    expect(discoverHauntedPumpkin(sim.ctx, obj, meta)).toBe(true);
    expect(last).toBeDefined();
    sim.tick();
    expect(meta.deedsEarned.has('feat_pumpkin_hunter')).toBe(true);
    expect(meta.deedStats.visited.has(GOURDLIGHT_PUMPKIN_HUNT_MARK)).toBe(true);
  });
});

describe('the meta and its title', () => {
  it('grants the tick its last leaf lands, shows progress before, and the title is wearable', () => {
    const sim = world();
    const meta = metaOf(sim);
    const last = gourdlightErrandMark(GOURDLIGHT_DAILY_PATCH_QUEST_ID);
    for (const m of GOURDLIGHT_EVE_MARKS) if (m !== last) meta.deedStats.visited.add(m);
    sim.ctx.markDeedsDirty(meta.entityId);
    sim.tick();
    expect(meta.deedsEarned.has(META)).toBe(false);
    expect(deedProgress(DEEDS[META].trigger, meta.deedStats)).toEqual({
      current: GOURDLIGHT_EVE_MARKS.length - 1,
      target: GOURDLIGHT_EVE_MARKS.length,
    });
    // the last errand, done for real
    doPatchErrand(sim);
    expect(meta.deedsEarned.has(META)).toBe(true);
    expect(meta.deedsEarned.has('feat_gourdlight_errands')).toBe(true);
    sim.setActiveTitle(META);
    expect(sim.player.title).toBe(META);
  });

  it('keeps every mark across a save and a reload, and a new day or edition clears none', () => {
    const sim = world();
    const meta = metaOf(sim);
    const some = [
      GOURDLIGHT_THATCHGRIN_MARK,
      GOURDLIGHT_ERRAND_MARKS[1],
      GOURDLIGHT_ERRAND_MARKS[2],
    ];
    for (const m of some) meta.deedStats.visited.add(m);
    sim.resetDay = '2026-10-21';
    sim.tick();
    for (const m of some) expect(meta.deedStats.visited.has(m)).toBe(true);
    const state = sim.serializeCharacter(sim.playerId);
    expect(state).toBeDefined();
    const sim2 = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    // biome-ignore lint/style/noNonNullAssertion: asserted above
    const pid = sim2.addPlayer('warrior', 'Reload', { state: state! });
    // biome-ignore lint/suspicious/noExplicitAny: the reloaded ledger
    const meta2 = (sim2 as any).players.get(pid);
    for (const m of some) expect(meta2.deedStats.visited.has(m)).toBe(true);
  });

  it('refills at join what the save already proves, and nothing it cannot', () => {
    const sim = world();
    const meta = metaOf(sim);
    meta.questsDone.add(GOURDLIGHT_DAILY_POOL[0]);
    meta.deedStats.counters.thatchgrinKills = 2;
    meta.deedsEarned.set('feat_pumpkin_hunter', '2026-10-19');
    refillGourdlightMarks(meta);
    expect(meta.deedStats.visited.has(gourdlightErrandMark(GOURDLIGHT_DAILY_POOL[0]))).toBe(true);
    expect(meta.deedStats.visited.has(gourdlightErrandMark(GOURDLIGHT_DAILY_POOL[1]))).toBe(false);
    expect(meta.deedStats.visited.has(GOURDLIGHT_THATCHGRIN_MARK)).toBe(true);
    expect(meta.deedStats.visited.has(GOURDLIGHT_PUMPKIN_HUNT_MARK)).toBe(true);
  });
});

describe('/dev season eve', () => {
  it('almost leaves the first errand for a real turn-in, and clear forgets the run', () => {
    const sim = world();
    const meta = metaOf(sim);
    sim.chat('/dev season eve almost');
    sim.tick();
    expect(meta.deedStats.visited.has(GOURDLIGHT_ERRAND_MARKS[0])).toBe(false);
    expect(GOURDLIGHT_EVE_MARKS.filter((m) => meta.deedStats.visited.has(m))).toHaveLength(
      GOURDLIGHT_EVE_MARKS.length - 1,
    );
    expect(meta.deedsEarned.has(META)).toBe(false);
    expect(meta.deedsEarned.has('feat_gourdlight_errands')).toBe(false);
    // the pool's first errand is the patch errand: one real turn-in finishes the run
    expect(GOURDLIGHT_DAILY_POOL[0]).toBe(GOURDLIGHT_DAILY_PATCH_QUEST_ID);
    doPatchErrand(sim);
    expect(meta.deedsEarned.has('feat_gourdlight_errands')).toBe(true);
    expect(meta.deedsEarned.has(META)).toBe(true);
    sim.setActiveTitle(META);
    sim.chat('/dev season eve clear');
    sim.tick();
    expect(GOURDLIGHT_EVE_MARKS.some((m) => meta.deedStats.visited.has(m))).toBe(false);
    for (const id of [...SECTIONS, META]) expect(meta.deedsEarned.has(id)).toBe(false);
    expect(meta.activeTitle).toBe(null);
  });
});
