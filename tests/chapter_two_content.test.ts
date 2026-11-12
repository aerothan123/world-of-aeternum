// Wyndlewood Chapter Two (content/chapter_two.ts and its gated siblings): the
// core bundle merges and resolves, stands on dry open ground, and never depends
// on a gated bundle (the Applewold, the Kindlemoor, the Chalkbarrow Coast),
// each of which merges only when its zones are live. The shipped quests the
// outline reframes pay its XP sizes.
import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import {
  applyChapterTwoBundle,
  applyChapterTwoReaches,
  CHAPTER_TWO_CATCH_SPOTS,
  CHAPTER_TWO_ITEMS,
  CHAPTER_TWO_OBJECTS,
  CHAPTER_TWO_QUESTS,
  CHAPTER_TWO_REACHES,
  CHAPTER_TWO_RETUNED_SHIPPED_QUESTS,
  type ChapterTwoBundle,
  type ChapterTwoGatedTables,
  chapterTwoBundleLive,
  chapterTwoXp,
} from '../src/sim/content/chapter_two';
import {
  applyChapterTwoGatedBundles,
  CHAPTER_TWO_GATED_ART_PENDING_ITEM_IDS,
  CHAPTER_TWO_GATED_BUNDLES,
  CHAPTER_TWO_GATED_CATCH_SPOTS,
} from '../src/sim/content/chapter_two_bundles';
import { C2_ORWIN, CHAPTER_TWO_KINDLEMOOR } from '../src/sim/content/chapter_two_kindlemoor';
import { ESCORTS, GROUND_OBJECTS, ITEMS, MOBS, NPCS, QUESTS, ZONES, zoneAt } from '../src/sim/data';
import { ebv2SiteOr, objectSiteKey } from '../src/sim/eastbrook_v2/sites';
import type { QuestDef } from '../src/sim/types';
import { XP_TABLE } from '../src/sim/types';
import { groundHeight, isInWaterBody, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const dryAndOpen = (x: number, z: number) =>
  !isInWaterBody(x, z) &&
  groundHeight(x, z, WORLD_SEED) > waterLevelAt(x, z, WORLD_SEED) + 0.4 &&
  !isBlocked(WORLD_SEED, x, z, 0.5);

const zoneIds = ZONES.map((z) => z.id);
const BUNDLE_NAMES = new Map<ChapterTwoBundle, string>(
  CHAPTER_TWO_GATED_BUNDLES.map((b) => [b, b.zoneIds.join('+')]),
);

function resolves(
  quest: QuestDef,
  npcs: Record<string, unknown>,
  items: Record<string, unknown>,
  mobs: Record<string, unknown>,
  escorts: Record<string, unknown>,
) {
  const problems: string[] = [];
  if (!npcs[quest.giverNpcId]) problems.push(`${quest.id} giver`);
  if (!npcs[quest.turnInNpcId]) problems.push(`${quest.id} turn-in`);
  for (const id of quest.requiredItems ?? []) if (!items[id]) problems.push(`${quest.id} ${id}`);
  for (const o of quest.objectives) {
    if (o.type === 'kill' && !mobs[o.targetMobId]) problems.push(`${quest.id} ${o.targetMobId}`);
    if (o.type === 'collect' && !items[o.itemId]) problems.push(`${quest.id} ${o.itemId}`);
    if (o.type === 'escort' && !escorts[o.escortId]) problems.push(`${quest.id} ${o.escortId}`);
    if (o.type === 'interact') {
      if (o.targetNpcId && !npcs[o.targetNpcId]) problems.push(`${quest.id} ${o.targetNpcId}`);
      if (o.usesItemId && !items[o.usesItemId]) problems.push(`${quest.id} ${o.usesItemId}`);
      if (o.yieldsItemId && !items[o.yieldsItemId]) problems.push(`${quest.id} ${o.yieldsItemId}`);
      for (const extra of o.alsoUses ?? [])
        if (!items[extra.itemId]) problems.push(`${quest.id} ${extra.itemId}`);
    }
  }
  return problems;
}

// The live tables already carry every bundle whose zones are in ZONES (data.ts
// merges them at load), so a "fresh" table set strips the gated records first:
// the merge under test must start from the tables as they stand without them.
const without = <T>(table: Record<string, T>, ids: ReadonlySet<string>): Record<string, T> =>
  Object.fromEntries(Object.entries(table).filter(([id]) => !ids.has(id)));
const gatedIds = (pick: (b: ChapterTwoBundle) => Record<string, unknown> | undefined) =>
  new Set(CHAPTER_TWO_GATED_BUNDLES.flatMap((b) => Object.keys(pick(b) ?? {})));

const fresh = (ids: readonly string[]): ChapterTwoGatedTables => {
  const gatedQuestIds = gatedIds((b) => b.quests);
  const gatedNpcIds = gatedIds((b) => b.npcs);
  return {
    zoneIds: ids,
    items: without(
      ITEMS,
      gatedIds((b) => b.items),
    ),
    mobs: without(
      MOBS,
      gatedIds((b) => b.mobs),
    ),
    npcs: Object.fromEntries(
      Object.entries(NPCS)
        .filter(([id]) => !gatedNpcIds.has(id))
        .map(([id, npc]) => [
          id,
          { ...npc, questIds: npc.questIds.filter((q) => !gatedQuestIds.has(q)) },
        ]),
    ),
    quests: without(QUESTS, gatedQuestIds),
    questOrder: [],
    camps: [],
    objects: [],
    escorts: without(
      ESCORTS,
      gatedIds((b) => b.escorts),
    ),
  };
};

const allGatedQuests = CHAPTER_TWO_GATED_BUNDLES.flatMap((b) => Object.values(b.quests));

describe('Chapter Two core bundle', () => {
  it('merges every record into the shared tables, listed on its NPCs', () => {
    for (const [id, quest] of Object.entries(CHAPTER_TWO_QUESTS)) {
      expect(QUESTS[id], id).toBe(quest);
      expect(NPCS[quest.giverNpcId].questIds, id).toContain(id);
      expect(NPCS[quest.turnInNpcId].questIds, id).toContain(id);
    }
    for (const id of Object.keys(CHAPTER_TWO_ITEMS)) expect(ITEMS[id], id).toBeDefined();
    // Re-sited for Eastbrook Vale v2: an object the resite moved onto its v2
    // design site (eastbrook_v2/sites.ts applyEbv2Sites) is merged as a copy
    // there (was: the authored record itself).
    for (const def of CHAPTER_TWO_OBJECTS) {
      const live = {
        ...def,
        positions: def.positions.map((p) => ({
          ...p,
          ...ebv2SiteOr(objectSiteKey(def.itemId, p), p),
        })),
      };
      expect(GROUND_OBJECTS).toContainEqual(live);
    }
  });

  it('resolves every giver, target, item and prerequisite', () => {
    const problems = Object.values(CHAPTER_TWO_QUESTS).flatMap((q) =>
      resolves(q, NPCS, ITEMS, MOBS, ESCORTS),
    );
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
    // Eastbrook Vale v2: where each object lives (its design site, else as
    // authored), through the same site keys data.ts applies.
    const points: [string, number, number][] = [];
    for (const def of CHAPTER_TWO_OBJECTS)
      for (const p of def.positions) {
        const at = ebv2SiteOr(objectSiteKey(def.itemId, p), p);
        points.push([def.itemId, at.x, at.z]);
      }
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
    for (const quest of [...Object.values(CHAPTER_TWO_QUESTS), ...allGatedQuests]) {
      const bar = XP_TABLE[(quest.minLevel ?? 1) - 1];
      expect(quest.xpReward, quest.id).toBeGreaterThanOrEqual(bar * 0.06);
      expect(quest.xpReward, quest.id).toBeLessThanOrEqual(bar * 0.21);
    }
  });

  it('retunes the reframed shipped quests to the outline sizes, keeping their ids', () => {
    for (const [id, [level, size]] of Object.entries(CHAPTER_TWO_RETUNED_SHIPPED_QUESTS)) {
      expect(QUESTS[id], id).toBeDefined();
      expect(QUESTS[id].xpReward, id).toBe(chapterTwoXp(level, size));
    }
  });

  it('never depends on a gated bundle', () => {
    const gatedIds = new Set(allGatedQuests.map((q) => q.id));
    for (const quest of Object.values(QUESTS)) {
      if (gatedIds.has(quest.id)) continue;
      expect(gatedIds.has(quest.requiresQuest ?? ''), quest.id).toBe(false);
    }
  });

  it('writes no em dash, en dash or emoji into the chapter prose', () => {
    const all = [
      ...Object.values(CHAPTER_TWO_QUESTS),
      ...allGatedQuests,
      ...Object.keys(CHAPTER_TWO_RETUNED_SHIPPED_QUESTS).map((id) => QUESTS[id]),
    ];
    for (const q of all) {
      for (const text of [q.name, q.text, q.completionText]) {
        expect(text, q.id).not.toMatch(/[\u2013\u2014]|\p{Extended_Pictographic}/u);
      }
    }
    for (const bundle of CHAPTER_TWO_GATED_BUNDLES) {
      for (const npc of Object.values(bundle.npcs))
        expect(`${npc.name} ${npc.title} ${npc.greeting}`).not.toMatch(
          /[\u2013\u2014]|\p{Extended_Pictographic}/u,
        );
      for (const escort of Object.values(bundle.escorts ?? {}))
        expect(`${escort.startText} ${escort.successText} ${escort.failText}`).not.toMatch(
          /[\u2013\u2014]|\p{Extended_Pictographic}/u,
        );
    }
  });
});

describe('Chapter Two gated bundles', () => {
  it('keeps the Applewold merge entry point working', () => {
    expect(applyChapterTwoReaches(fresh(['eastbrook_vale']))).toBe(false);
    expect(CHAPTER_TWO_GATED_BUNDLES).toContain(CHAPTER_TWO_REACHES);
  });

  it('merges nothing on a build without the frontier zones', () => {
    expect(applyChapterTwoGatedBundles(fresh(['eastbrook_vale', 'mirefen_marsh']))).toEqual([]);
  });

  it('owns distinct quest, item, mob, NPC and object ids that no shipped table uses', () => {
    const seen = new Set<string>();
    for (const bundle of CHAPTER_TWO_GATED_BUNDLES) {
      const live = chapterTwoBundleLive(bundle, zoneIds);
      for (const id of [
        ...Object.keys(bundle.quests),
        ...Object.keys(bundle.items),
        ...Object.keys(bundle.mobs),
        ...Object.keys(bundle.npcs),
      ]) {
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
        if (!live) {
          expect(Object.hasOwn(QUESTS, id) || Object.hasOwn(ITEMS, id), id).toBe(false);
          expect(Object.hasOwn(MOBS, id) || Object.hasOwn(NPCS, id), id).toBe(false);
        }
      }
    }
    const entityIds = new Set(GROUND_OBJECTS.flatMap((g) => g.entityIds));
    for (const bundle of CHAPTER_TWO_GATED_BUNDLES)
      for (const def of bundle.objects)
        for (const id of def.entityIds ?? []) {
          expect(seen.has(`e${id}`), String(id)).toBe(false);
          seen.add(`e${id}`);
          if (!chapterTwoBundleLive(bundle, zoneIds))
            expect(entityIds.has(id), String(id)).toBe(false);
        }
  });

  it('lists every gated item as pending art until it is painted', () => {
    for (const bundle of CHAPTER_TWO_GATED_BUNDLES)
      for (const id of Object.keys(bundle.items))
        expect(CHAPTER_TWO_GATED_ART_PENDING_ITEM_IDS, id).toContain(id);
  });

  for (const bundle of CHAPTER_TWO_GATED_BUNDLES) {
    const name = BUNDLE_NAMES.get(bundle) ?? '?';
    const live = chapterTwoBundleLive(bundle, zoneIds);

    describe(name, () => {
      it('merges only when its zones are live, and the live tables match that', () => {
        expect(applyChapterTwoBundle(bundle, fresh(['eastbrook_vale']))).toBe(false);
        for (const id of Object.keys(bundle.quests)) {
          expect(Object.hasOwn(QUESTS, id), id).toBe(live);
        }
      });

      it('resolves every reference once merged, posting on its NPCs', () => {
        const tables = fresh([...bundle.zoneIds]);
        expect(applyChapterTwoBundle(bundle, tables)).toBe(true);
        expect(applyChapterTwoBundle(bundle, tables)).toBe(true);
        expect(tables.questOrder).toEqual(Object.keys(bundle.quests));
        const problems = Object.values(bundle.quests).flatMap((q) =>
          resolves(q, tables.npcs, tables.items, tables.mobs, tables.escorts ?? {}),
        );
        expect(problems).toEqual([]);
        for (const quest of Object.values(bundle.quests)) {
          expect(tables.npcs[quest.giverNpcId].questIds, quest.id).toContain(quest.id);
          expect(tables.npcs[quest.turnInNpcId].questIds, quest.id).toContain(quest.id);
          expect(quest.standingReward, quest.id).toBeDefined();
          // A gated quest may follow the core chapter or its own bundle, never
          // another gated bundle (each zone may land on its own).
          if (quest.requiresQuest) {
            expect(
              Object.hasOwn(QUESTS, quest.requiresQuest) ||
                Object.hasOwn(bundle.quests, quest.requiresQuest),
              quest.id,
            ).toBe(true);
          }
          for (const o of quest.objectives) {
            if (o.type === 'interact' && o.targetObjectItemId) {
              expect(
                tables.objects.some(
                  (g) =>
                    g.itemId === o.targetObjectItemId &&
                    g.positions.length >= (o.station ? 1 : o.count),
                ),
                `${quest.id} ${o.targetObjectItemId}`,
              ).toBe(true);
            }
            if (o.type === 'collect') {
              const source =
                tables.objects.some((g) => g.itemId === o.itemId) ||
                Object.values(bundle.mobs).some((m) => m.loot.some((l) => l.itemId === o.itemId)) ||
                (bundle.catchSpots ?? []).some((s) => s.itemId === o.itemId) ||
                (quest.requiredItems ?? []).includes(o.itemId);
              expect(source, `${quest.id} ${o.itemId} has a source`).toBe(true);
            }
          }
        }
        for (const camp of tables.camps) {
          expect(tables.mobs[camp.mobId], camp.mobId).toBeDefined();
          expect(camp.offStream, camp.mobId).toBe(true);
        }
        for (const escort of Object.values(bundle.escorts ?? {})) {
          expect(tables.escorts?.[escort.id], escort.id).toBe(escort);
          expect(tables.mobs[escort.npcMobId], escort.id).toBeDefined();
          expect(escort.questId && bundle.quests[escort.questId], escort.id).toBeDefined();
          for (const ambush of escort.ambushes) expect(tables.mobs[ambush.mobId]).toBeDefined();
        }
      });

      it.runIf(live)('stands on dry open ground in its zones once live', () => {
        const points: [string, number, number][] = [];
        for (const def of bundle.objects)
          for (const p of def.positions) points.push([def.itemId, p.x, p.z]);
        for (const npc of Object.values(bundle.npcs)) points.push([npc.id, npc.pos.x, npc.pos.z]);
        for (const spot of bundle.catchSpots ?? []) points.push([spot.itemId, spot.x, spot.z]);
        for (const escort of Object.values(bundle.escorts ?? {}))
          for (const p of [escort.start, ...escort.waypoints]) points.push([escort.id, p.x, p.z]);
        expect(
          points.filter(([, x, z]) => !dryAndOpen(x, z)).map(([id, x, z]) => `${id}@${x},${z}`),
        ).toEqual([]);
      });
    });
  }

  it('stands its records on shipped ground already on dry open ground today', () => {
    // Orwin (Eastbrook), Yara's mixing table (Fenbridge) and the pickers' trout
    // spot (Eastbrook's town steps) are the gated records outside a frontier zone.
    const orwin = CHAPTER_TWO_KINDLEMOOR.npcs[C2_ORWIN];
    expect(dryAndOpen(orwin.pos.x, orwin.pos.z)).toBe(true);
    expect(zoneAt(orwin.pos.x, orwin.pos.z).id).toBe('eastbrook_vale');
    const table = CHAPTER_TWO_KINDLEMOOR.objects.find((g) => g.itemId === 'c2_fen_mixing_table');
    expect(table).toBeDefined();
    for (const p of table?.positions ?? []) {
      expect(dryAndOpen(p.x, p.z)).toBe(true);
      expect(zoneAt(p.x, p.z).id).toBe('mirefen_marsh');
    }
    const trout = CHAPTER_TWO_GATED_CATCH_SPOTS.find((s) => s.itemId === 'c2_pickers_trout');
    expect(trout).toBeDefined();
    if (trout) {
      expect(dryAndOpen(trout.x, trout.z)).toBe(true);
      expect(zoneAt(trout.x, trout.z).id).toBe('eastbrook_vale');
    }
  });
});
