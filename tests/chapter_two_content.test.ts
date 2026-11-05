// Wyndlewood Chapter Two (content/chapter_two.ts): the core bundle merges and
// resolves, stands on dry open ground, and never depends on the Southern
// Reaches bundle, which merges only when its zones are live.
import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import {
  applyChapterTwoReaches,
  CHAPTER_TWO_CATCH_SPOTS,
  CHAPTER_TWO_ITEMS,
  CHAPTER_TWO_OBJECTS,
  CHAPTER_TWO_QUESTS,
  CHAPTER_TWO_REACHES,
  type ChapterTwoReachesTables,
  chapterTwoXp,
} from '../src/sim/content/chapter_two';
import { GROUND_OBJECTS, ITEMS, MOBS, NPCS, QUESTS, ZONES, zoneAt } from '../src/sim/data';
import type { QuestDef } from '../src/sim/types';
import { XP_TABLE } from '../src/sim/types';
import { groundHeight, isInWaterBody, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const dryAndOpen = (x: number, z: number) =>
  !isInWaterBody(x, z) &&
  groundHeight(x, z, WORLD_SEED) > waterLevelAt(x, z, WORLD_SEED) + 0.4 &&
  !isBlocked(WORLD_SEED, x, z, 0.5);

const reachesLive = CHAPTER_TWO_REACHES.zoneIds.every((id) => ZONES.some((z) => z.id === id));

function resolves(quest: QuestDef, npcs: Record<string, unknown>, items: Record<string, unknown>) {
  const problems: string[] = [];
  if (!npcs[quest.giverNpcId]) problems.push(`${quest.id} giver`);
  if (!npcs[quest.turnInNpcId]) problems.push(`${quest.id} turn-in`);
  for (const id of quest.requiredItems ?? []) if (!items[id]) problems.push(`${quest.id} ${id}`);
  for (const o of quest.objectives) {
    if (o.type === 'kill' && !MOBS[o.targetMobId] && !CHAPTER_TWO_REACHES.mobs[o.targetMobId])
      problems.push(`${quest.id} ${o.targetMobId}`);
    if (o.type === 'collect' && !items[o.itemId]) problems.push(`${quest.id} ${o.itemId}`);
    if (o.type === 'interact') {
      if (o.targetNpcId && !npcs[o.targetNpcId]) problems.push(`${quest.id} ${o.targetNpcId}`);
      if (o.usesItemId && !items[o.usesItemId]) problems.push(`${quest.id} ${o.usesItemId}`);
      if (o.yieldsItemId && !items[o.yieldsItemId]) problems.push(`${quest.id} ${o.yieldsItemId}`);
    }
  }
  return problems;
}

describe('Chapter Two core bundle', () => {
  it('merges every record into the shared tables, listed on its NPCs', () => {
    for (const [id, quest] of Object.entries(CHAPTER_TWO_QUESTS)) {
      expect(QUESTS[id], id).toBe(quest);
      expect(NPCS[quest.giverNpcId].questIds, id).toContain(id);
      expect(NPCS[quest.turnInNpcId].questIds, id).toContain(id);
    }
    for (const id of Object.keys(CHAPTER_TWO_ITEMS)) expect(ITEMS[id], id).toBeDefined();
    for (const def of CHAPTER_TWO_OBJECTS) expect(GROUND_OBJECTS).toContain(def);
  });

  it('resolves every giver, target, item and prerequisite', () => {
    const problems = Object.values(CHAPTER_TWO_QUESTS).flatMap((q) => resolves(q, NPCS, ITEMS));
    expect(problems).toEqual([]);
    for (const quest of Object.values(CHAPTER_TWO_QUESTS)) {
      if (quest.requiresQuest) expect(QUESTS[quest.requiresQuest], quest.id).toBeDefined();
      for (const o of quest.objectives) {
        if (o.type === 'interact' && o.targetObjectItemId) {
          expect(
            GROUND_OBJECTS.some(
              (g) =>
                g.itemId === o.targetObjectItemId &&
                g.positions.length >= (o.station ? 1 : o.count),
            ),
            `${quest.id} ${o.targetObjectItemId}`,
          ).toBe(true);
        }
      }
      expect(quest.standingReward, quest.id).toBeDefined();
    }
  });

  it('puts every core object and catch spot on dry open ground in Eastbrook or Mirefen', () => {
    const points: [string, number, number][] = [];
    for (const def of CHAPTER_TWO_OBJECTS)
      for (const p of def.positions) points.push([def.itemId, p.x, p.z]);
    expect(
      points.filter(([, x, z]) => !dryAndOpen(x, z)).map(([id, x, z]) => `${id}@${x},${z}`),
    ).toEqual([]);
    for (const [id, x, z] of points) {
      expect(['eastbrook_vale', 'mirefen_marsh'], id).toContain(zoneAt(x, z).id);
    }
    for (const spot of CHAPTER_TWO_CATCH_SPOTS) {
      expect(dryAndOpen(spot.x, spot.z), spot.itemId).toBe(true);
    }
  });

  it('pays the outline XP sizes on the quest level bar', () => {
    expect(chapterTwoXp(6, 'medium')).toBe(Math.round((XP_TABLE[5] * 0.1) / 10) * 10);
    expect(chapterTwoXp(9, 'small')).toBe(460);
    for (const quest of Object.values(CHAPTER_TWO_QUESTS)) {
      const bar = XP_TABLE[(quest.minLevel ?? 1) - 1];
      expect(quest.xpReward, quest.id).toBeGreaterThanOrEqual(bar * 0.06);
      expect(quest.xpReward, quest.id).toBeLessThanOrEqual(bar * 0.21);
    }
  });

  it('never depends on the Southern Reaches bundle', () => {
    const reachesIds = new Set(Object.keys(CHAPTER_TWO_REACHES.quests));
    for (const quest of Object.values(QUESTS)) {
      if (reachesIds.has(quest.id)) continue;
      expect(reachesIds.has(quest.requiresQuest ?? ''), quest.id).toBe(false);
    }
  });

  it('writes no em dash, en dash or emoji into the chapter prose', () => {
    const all = [
      ...Object.values(CHAPTER_TWO_QUESTS),
      ...Object.values(CHAPTER_TWO_REACHES.quests),
    ];
    for (const q of all) {
      for (const text of [q.name, q.text, q.completionText]) {
        expect(text, q.id).not.toMatch(/[–—]|\p{Extended_Pictographic}/u);
      }
    }
  });
});

describe('Chapter Two Southern Reaches bundle', () => {
  const fresh = (zoneIds: string[]): ChapterTwoReachesTables => ({
    zoneIds,
    items: { ...ITEMS },
    mobs: { ...MOBS },
    npcs: Object.fromEntries(
      Object.entries(NPCS).map(([id, npc]) => [id, { ...npc, questIds: [...npc.questIds] }]),
    ),
    quests: { ...QUESTS },
    questOrder: [],
    camps: [],
    objects: [],
  });

  it('merges only when its zones are live, and the live tables match that', () => {
    expect(applyChapterTwoReaches(fresh(['eastbrook_vale']))).toBe(false);
    for (const id of Object.keys(CHAPTER_TWO_REACHES.quests)) {
      expect(Object.hasOwn(QUESTS, id), id).toBe(reachesLive);
    }
  });

  it('resolves every reference once merged, posting on its NPCs', () => {
    const tables = fresh([...CHAPTER_TWO_REACHES.zoneIds]);
    expect(applyChapterTwoReaches(tables)).toBe(true);
    expect(applyChapterTwoReaches(tables)).toBe(true);
    expect(tables.questOrder).toEqual(Object.keys(CHAPTER_TWO_REACHES.quests));
    const problems = Object.values(CHAPTER_TWO_REACHES.quests).flatMap((q) =>
      resolves(q, tables.npcs, tables.items),
    );
    expect(problems).toEqual([]);
    for (const quest of Object.values(CHAPTER_TWO_REACHES.quests)) {
      expect(tables.npcs[quest.giverNpcId].questIds, quest.id).toContain(quest.id);
      if (quest.requiresQuest) expect(tables.quests[quest.requiresQuest], quest.id).toBeDefined();
    }
    for (const camp of tables.camps) expect(tables.mobs[camp.mobId], camp.mobId).toBeDefined();
  });

  it.runIf(reachesLive)('stands on dry open ground in its zones once live', () => {
    const points: [string, number, number][] = [];
    for (const def of CHAPTER_TWO_REACHES.objects)
      for (const p of def.positions) points.push([def.itemId, p.x, p.z]);
    for (const npc of Object.values(CHAPTER_TWO_REACHES.npcs))
      points.push([npc.id, npc.pos.x, npc.pos.z]);
    expect(
      points.filter(([, x, z]) => !dryAndOpen(x, z)).map(([id, x, z]) => `${id}@${x},${z}`),
    ).toEqual([]);
  });
});
