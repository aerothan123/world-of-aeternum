// The shared content suite for Wyndlewood Chapters Three to Seven
// (src/sim/content/story_chapters.ts). Each chapter's test file calls
// describeStoryChapter once; the checks mirror tests/chapter_two_content.test.ts
// (merge, resolution, dry open ground, XP sizes, clean prose) and add the
// chapter obligations: the chain from the previous chapter, the dungeon
// tie-in, the closing chronicle deed and the ground-pickup proof list.
import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { type ChapterTwoBundle, chapterTwoBundleLive } from '../src/sim/content/chapter_two';
import { DEEDS } from '../src/sim/content/deeds';
import { STORY_CHAPTERS_ART_PENDING_ITEM_IDS } from '../src/sim/content/story_chapters';
import {
  CAMPS,
  DUNGEONS,
  ESCORTS,
  GROUND_OBJECTS,
  ITEMS,
  MOBS,
  NPCS,
  QUESTS,
  ZONES,
  zoneAt,
} from '../src/sim/data';
import { FINAL_BOSS_DUNGEONS, GROUND_PICKUP_PROVING_QUESTS } from '../src/sim/deeds';
import { XP_TABLE } from '../src/sim/types';
import { groundHeight, isInWaterBody, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const dryAndOpen = (x: number, z: number) =>
  !isInWaterBody(x, z) &&
  groundHeight(x, z, WORLD_SEED) > waterLevelAt(x, z, WORLD_SEED) + 0.4 &&
  !isBlocked(WORLD_SEED, x, z, 0.5);

const DASH_OR_EMOJI = /[–—]|\p{Extended_Pictographic}/u;

export interface StoryChapterSpec {
  /** 3 to 7: quest ids are c<number>_<nn>_<slug>. */
  readonly number: number;
  readonly bundle: ChapterTwoBundle;
  /** The quest the chapter's first quest follows (the previous chapter's close). */
  readonly opensAfter: string;
  readonly closingQuest: string;
  /** The chronicle deed the closing quest earns. */
  readonly closingDeed: string;
  /** The shipped instance the chapter ties into. */
  readonly dungeonId: string;
  /** First reserved ground-object entity id. */
  readonly firstEntityId: number;
  readonly levels: readonly [number, number];
}

export function describeStoryChapter(spec: StoryChapterSpec): void {
  const { bundle } = spec;
  const quests = Object.values(bundle.quests);
  const prefix = `c${spec.number}_`;

  describe(`Wyndlewood Chapter ${spec.number}`, () => {
    it('is live, and merged into the shared tables, posted on its NPCs', () => {
      expect(
        chapterTwoBundleLive(
          bundle,
          ZONES.map((z) => z.id),
        ),
      ).toBe(true);
      for (const quest of quests) {
        expect(QUESTS[quest.id], quest.id).toBe(quest);
        expect(NPCS[quest.giverNpcId].questIds, quest.id).toContain(quest.id);
        expect(NPCS[quest.turnInNpcId].questIds, quest.id).toContain(quest.id);
        for (const o of quest.objectives)
          if (o.type === 'interact' && o.targetNpcId)
            expect(NPCS[o.targetNpcId].questIds, quest.id).toContain(quest.id);
      }
      for (const id of Object.keys(bundle.items)) expect(ITEMS[id], id).toBe(bundle.items[id]);
      for (const id of Object.keys(bundle.mobs)) expect(MOBS[id], id).toBe(bundle.mobs[id]);
      for (const id of Object.keys(bundle.npcs)) expect(NPCS[id], id).toBe(bundle.npcs[id]);
      for (const def of bundle.objects) expect(GROUND_OBJECTS).toContain(def);
      for (const camp of bundle.camps) {
        expect(CAMPS).toContain(camp);
        expect(camp.offStream, camp.mobId).toBe(true);
        expect(bundle.mobs[camp.mobId], camp.mobId).toBeDefined();
      }
    });

    it('names its quests c<chapter>_ and keeps every id its own', () => {
      for (const quest of quests) expect(quest.id.startsWith(prefix), quest.id).toBe(true);
      for (const id of Object.keys(bundle.items)) expect(id.startsWith(prefix), id).toBe(true);
      const entityIds = bundle.objects.flatMap((g) => g.entityIds ?? []);
      expect(new Set(entityIds).size).toBe(entityIds.length);
      for (const id of entityIds) {
        expect(id).toBeGreaterThanOrEqual(spec.firstEntityId);
        expect(id).toBeLessThan(spec.firstEntityId + 10_000);
      }
      const others = GROUND_OBJECTS.filter((g) => !bundle.objects.includes(g)).flatMap(
        (g) => g.entityIds ?? [],
      );
      for (const id of entityIds) expect(others.includes(id), String(id)).toBe(false);
    });

    it('resolves every giver, target, item, source and prerequisite', () => {
      const problems: string[] = [];
      for (const quest of quests) {
        if (!NPCS[quest.giverNpcId]) problems.push(`${quest.id} giver`);
        if (!NPCS[quest.turnInNpcId]) problems.push(`${quest.id} turn-in`);
        if (quest.requiresQuest && !QUESTS[quest.requiresQuest])
          problems.push(`${quest.id} requires ${quest.requiresQuest}`);
        for (const id of quest.requiredItems ?? [])
          if (!ITEMS[id]) problems.push(`${quest.id} ${id}`);
        for (const o of quest.objectives) {
          if (o.type === 'kill' && !MOBS[o.targetMobId])
            problems.push(`${quest.id} ${o.targetMobId}`);
          if (o.type === 'escort' && !ESCORTS[o.escortId])
            problems.push(`${quest.id} ${o.escortId}`);
          if (o.type === 'collect') {
            if (!ITEMS[o.itemId]) problems.push(`${quest.id} ${o.itemId}`);
            const source =
              GROUND_OBJECTS.some((g) => g.itemId === o.itemId) ||
              Object.values(MOBS).some((m) => (m.loot ?? []).some((l) => l.itemId === o.itemId)) ||
              (quest.requiredItems ?? []).includes(o.itemId) ||
              Object.values(DUNGEONS).some((d) =>
                (d.objects ?? []).some((g) => g.itemId === o.itemId),
              );
            if (!source) problems.push(`${quest.id} ${o.itemId} has no source`);
          }
          if (o.type === 'interact') {
            if (o.targetNpcId && !NPCS[o.targetNpcId])
              problems.push(`${quest.id} ${o.targetNpcId}`);
            if (o.usesItemId && !ITEMS[o.usesItemId]) problems.push(`${quest.id} ${o.usesItemId}`);
            if (o.yieldsItemId && !ITEMS[o.yieldsItemId])
              problems.push(`${quest.id} ${o.yieldsItemId}`);
            if (
              o.targetObjectItemId &&
              !GROUND_OBJECTS.some(
                (g) =>
                  g.itemId === o.targetObjectItemId &&
                  g.positions.length >= (o.station ? 1 : o.count),
              )
            )
              problems.push(`${quest.id} ${o.targetObjectItemId} positions`);
          }
        }
        if (!quest.standingReward) problems.push(`${quest.id} standing`);
      }
      expect(problems).toEqual([]);
    });

    it('follows the previous chapter and runs as one chain to its close', () => {
      const first = quests[0];
      expect(first.requiresQuest).toBe(spec.opensAfter);
      for (const quest of quests.slice(1))
        expect(
          quests.some((q) => q.id === quest.requiresQuest),
          quest.id,
        ).toBe(true);
      expect(quests.at(-1)?.id).toBe(spec.closingQuest);
      for (const quest of quests) {
        expect(quest.minLevel ?? 0, quest.id).toBeGreaterThanOrEqual(spec.levels[0]);
        expect(quest.minLevel ?? 99, quest.id).toBeLessThanOrEqual(spec.levels[1]);
      }
    });

    it('ties into its dungeon', () => {
      const dungeon = DUNGEONS[spec.dungeonId];
      expect(dungeon, spec.dungeonId).toBeDefined();
      const tied = quests.some((q) =>
        q.objectives.some(
          (o) =>
            (o.type === 'kill' && FINAL_BOSS_DUNGEONS[o.targetMobId] === spec.dungeonId) ||
            (o.type === 'collect' && (dungeon.objects ?? []).some((g) => g.itemId === o.itemId)),
        ),
      );
      expect(tied).toBe(true);
    });

    it('stands every object, person and camp on dry open ground in its zones', () => {
      const points: [string, number, number][] = [];
      for (const def of bundle.objects)
        for (const p of def.positions) points.push([def.itemId, p.x, p.z]);
      for (const npc of Object.values(bundle.npcs)) points.push([npc.id, npc.pos.x, npc.pos.z]);
      for (const camp of bundle.camps) points.push([camp.mobId, camp.center.x, camp.center.z]);
      expect(
        points.filter(([, x, z]) => !dryAndOpen(x, z)).map(([id, x, z]) => `${id}@${x},${z}`),
      ).toEqual([]);
      for (const [id, x, z] of points) expect(bundle.zoneIds, id).toContain(zoneAt(x, z).id);
    });

    it('pays the plan XP sizes on the quest level bar, and coin', () => {
      for (const quest of quests) {
        const bar = XP_TABLE[(quest.minLevel ?? 1) - 1];
        expect(quest.xpReward, quest.id).toBeGreaterThanOrEqual(bar * 0.06);
        expect(quest.xpReward, quest.id).toBeLessThanOrEqual(bar * 0.21);
        expect(quest.copperReward, quest.id).toBeGreaterThan(0);
        expect(Object.keys(quest.itemRewards ?? {}), quest.id).toEqual([]);
      }
    });

    it('writes no em dash, en dash or emoji into its prose and names', () => {
      for (const q of quests) {
        for (const text of [q.name, q.text, q.completionText, ...q.objectives.map((o) => o.label)])
          expect(text, q.id).not.toMatch(DASH_OR_EMOJI);
      }
      for (const npc of Object.values(bundle.npcs))
        expect(`${npc.name} ${npc.title} ${npc.greeting}`).not.toMatch(DASH_OR_EMOJI);
      for (const mob of Object.values(bundle.mobs)) expect(mob.name).not.toMatch(DASH_OR_EMOJI);
      for (const item of Object.values(bundle.items)) expect(item.name).not.toMatch(DASH_OR_EMOJI);
    });

    it('records its close as a cosmetic chronicle deed', () => {
      const deed = DEEDS[spec.closingDeed];
      expect(deed).toBeDefined();
      expect(deed.category).toBe('chronicle');
      expect(deed.trigger).toEqual({ kind: 'quest', questId: spec.closingQuest });
      expect(deed.reward).toBeUndefined();
    });

    it('lists each ground-only collect quest as a pickup proof', () => {
      for (const quest of quests) {
        const groundOnly = quest.objectives.some(
          (o) =>
            o.type === 'collect' &&
            bundle.objects.some((g) => g.itemId === o.itemId) &&
            !Object.values(MOBS).some((m) => (m.loot ?? []).some((l) => l.itemId === o.itemId)),
        );
        expect(GROUND_PICKUP_PROVING_QUESTS.includes(quest.id), quest.id).toBe(groundOnly);
      }
    });

    it('lists every item as pending art (no new painted icons needed to ship)', () => {
      for (const id of Object.keys(bundle.items))
        expect(STORY_CHAPTERS_ART_PENDING_ITEM_IDS, id).toContain(id);
      for (const item of Object.values(bundle.items)) expect(item.kind, item.id).toBe('quest');
    });

    it('gives its new people names no shipped NPC already uses', () => {
      const words = (name: string) => name.toLowerCase().split(/\s+/);
      const shipped = Object.values(NPCS)
        .filter((n) => !bundle.npcs[n.id])
        .flatMap((n) => words(n.name));
      for (const npc of Object.values(bundle.npcs))
        for (const word of words(npc.name))
          expect(shipped, `${npc.id} ${word}`).not.toContain(word);
    });
  });
}
