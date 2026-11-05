// Wyndlewood Chapter One (content/chapter_one.ts): every reference resolves,
// every placement stands on dry open ground, the chain runs in the owner's
// order, and it stops at the Hollow Crypt's sealed door.
import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import {
  CHAPTER_ONE_CAMPS,
  CHAPTER_ONE_ESCORTS,
  CHAPTER_ONE_ITEMS,
  CHAPTER_ONE_MOBS,
  CHAPTER_ONE_NPCS,
  CHAPTER_ONE_OBJECTS,
  CHAPTER_ONE_QUESTS,
  TOWN_BOARD_QUESTS,
} from '../src/sim/content/chapter_one';
import { OATHLESS_KING_TITLE } from '../src/sim/content/wyndlewood_lore';
import { ESCORTS, GROUND_OBJECTS, ITEMS, MOBS, NPCS, QUESTS, zoneAt } from '../src/sim/data';
import { groundHeight, isInWaterBody, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const dryAndOpen = (x: number, z: number) =>
  !isInWaterBody(x, z) &&
  groundHeight(x, z, WORLD_SEED) > waterLevelAt(x, z, WORLD_SEED) + 0.4 &&
  !isBlocked(WORLD_SEED, x, z, 0.5);

const ALL = { ...CHAPTER_ONE_QUESTS, ...TOWN_BOARD_QUESTS };

describe('Chapter One content', () => {
  it('merges every record into the shared tables', () => {
    for (const id of Object.keys(ALL)) expect(QUESTS[id], id).toBe(ALL[id]);
    for (const id of Object.keys(CHAPTER_ONE_ITEMS)) expect(ITEMS[id], id).toBeDefined();
    for (const id of Object.keys(CHAPTER_ONE_MOBS)) expect(MOBS[id], id).toBeDefined();
    for (const id of Object.keys(CHAPTER_ONE_NPCS)) expect(NPCS[id], id).toBeDefined();
    for (const id of Object.keys(CHAPTER_ONE_ESCORTS)) expect(ESCORTS[id], id).toBeDefined();
    for (const def of CHAPTER_ONE_OBJECTS) expect(GROUND_OBJECTS).toContain(def);
  });

  it('resolves every giver, turn-in, target, item and prerequisite', () => {
    for (const quest of Object.values(ALL)) {
      expect(NPCS[quest.giverNpcId], quest.id).toBeDefined();
      expect(NPCS[quest.turnInNpcId], quest.id).toBeDefined();
      expect(NPCS[quest.turnInNpcId].questIds, quest.id).toContain(quest.id);
      if (quest.requiresQuest) expect(QUESTS[quest.requiresQuest], quest.id).toBeDefined();
      for (const id of quest.requiredItems ?? [])
        expect(ITEMS[id], `${quest.id} ${id}`).toBeDefined();
      for (const o of quest.objectives) {
        if (o.type === 'kill') expect(MOBS[o.targetMobId], quest.id).toBeDefined();
        if (o.type === 'collect') expect(ITEMS[o.itemId], quest.id).toBeDefined();
        if (o.type === 'escort') expect(ESCORTS[o.escortId]?.questId, quest.id).toBe(quest.id);
        if (o.type === 'interact') {
          if (o.targetNpcId) expect(NPCS[o.targetNpcId]?.questIds, quest.id).toContain(quest.id);
          if (o.targetObjectItemId) {
            expect(
              GROUND_OBJECTS.some(
                (g) =>
                  g.itemId === o.targetObjectItemId &&
                  // A crafting station credits every use of one object.
                  g.positions.length >= (o.station ? 1 : o.count),
              ),
              `${quest.id} ${o.targetObjectItemId}`,
            ).toBe(true);
          }
          if (o.usesItemId) expect(ITEMS[o.usesItemId], quest.id).toBeDefined();
          if (o.yieldsItemId) expect(ITEMS[o.yieldsItemId], quest.id).toBeDefined();
        }
      }
      expect(quest.standingReward, quest.id).toBeDefined();
    }
  });

  it('puts every object, camp, NPC and escort point on dry open ground in its zone', () => {
    const points: [string, number, number][] = [];
    for (const def of CHAPTER_ONE_OBJECTS)
      for (const p of def.positions) points.push([def.itemId, p.x, p.z]);
    for (const camp of CHAPTER_ONE_CAMPS) points.push([camp.mobId, camp.center.x, camp.center.z]);
    for (const npc of Object.values(CHAPTER_ONE_NPCS)) points.push([npc.id, npc.pos.x, npc.pos.z]);
    for (const esc of Object.values(CHAPTER_ONE_ESCORTS)) {
      points.push([esc.id, esc.start.x, esc.start.z]);
      for (const w of esc.waypoints) points.push([esc.id, w.x, w.z]);
    }
    const bad = points
      .filter(([, x, z]) => !dryAndOpen(x, z))
      .map(([id, x, z]) => `${id}@${x},${z}`);
    expect(bad).toEqual([]);
    for (const [id, x, z] of points) {
      expect(['proving_shore', 'eastbrook_vale'], id).toContain(zoneAt(x, z).id);
    }
  });

  it('runs the main story in the owner order and ends outside the sealed crypt', () => {
    const chain = [
      'c1_01_arrival',
      'c1_02_beacon_lied',
      'c1_07_across',
      'c1_08_vouch',
      'c1_13_flowers_down',
      'c1_14_buried_tuesday',
      'c1_15_warmth_missing',
      'c1_20_order_unsigned',
      'c1_21_watch_cannot_see',
      'c1_25_someone_teaching',
      'c1_26_promise_paint',
      'c1_28_door_left_shut',
    ];
    for (let i = 1; i < chain.length; i++)
      expect(QUESTS[chain[i]].requiresQuest).toBe(chain[i - 1]);
    // The chapter never unlocks the Hollow Crypt chain (the shipped q_hollow
    // still waits on the shipped rite).
    for (const q of Object.values(QUESTS)) {
      if (q.id.startsWith('c1_')) continue;
      expect(q.requiresQuest?.startsWith('c1_') ?? false, q.id).toBe(false);
    }
    expect(QUESTS.c1_26_promise_paint.completionText).toContain(OATHLESS_KING_TITLE);
    expect(QUESTS.q_whispers.completionText).toContain(OATHLESS_KING_TITLE);
  });

  it('writes no em dash, en dash or emoji into the chapter prose', () => {
    for (const q of Object.values(ALL)) {
      for (const text of [q.name, q.text, q.completionText]) {
        expect(text, q.id).not.toMatch(/[–—]|\p{Extended_Pictographic}/u);
      }
    }
  });
});
