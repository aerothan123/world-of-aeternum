// Wyndlewood Chapter One (content/chapter_one.ts): every reference resolves,
// every placement stands on dry open ground, the chain runs in the owner's
// order, and it stops at the Hollow Crypt's sealed door.
import fs from 'node:fs';
import path from 'node:path';
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
import { campSiteKey, ebv2SiteOr, objectSiteKey } from '../src/sim/eastbrook_v2/sites';
import { groundHeight, isInWaterBody, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const dryAndOpen = (x: number, z: number) =>
  !isInWaterBody(x, z) &&
  groundHeight(x, z, WORLD_SEED) > waterLevelAt(x, z, WORLD_SEED) + 0.4 &&
  !isBlocked(WORLD_SEED, x, z, 0.5);

const ALL = { ...CHAPTER_ONE_QUESTS, ...TOWN_BOARD_QUESTS };

// Eastbrook Vale v2: data.ts stands the authored objects, camps and NPCs on
// their v2 design sites (eastbrook_v2/sites.ts applyEbv2Sites). The placement
// checks below read where each one LIVES, through the same site keys.
const liveObjectPos = (itemId: string, p: { x: number; z: number }) =>
  ebv2SiteOr(objectSiteKey(itemId, p), p);
const liveObject = (def: (typeof CHAPTER_ONE_OBJECTS)[number]) => ({
  ...def,
  positions: def.positions.map((p) => ({ ...p, ...liveObjectPos(def.itemId, p) })),
});

describe('Chapter One content', () => {
  it('merges every record into the shared tables', () => {
    for (const id of Object.keys(ALL)) expect(QUESTS[id], id).toBe(ALL[id]);
    for (const id of Object.keys(CHAPTER_ONE_ITEMS)) expect(ITEMS[id], id).toBeDefined();
    for (const id of Object.keys(CHAPTER_ONE_MOBS)) expect(MOBS[id], id).toBeDefined();
    for (const id of Object.keys(CHAPTER_ONE_NPCS)) expect(NPCS[id], id).toBeDefined();
    for (const id of Object.keys(CHAPTER_ONE_ESCORTS)) expect(ESCORTS[id], id).toBeDefined();
    // Re-sited for Eastbrook Vale v2: an object the resite moved is merged as a
    // copy at its design site (was: the authored record itself).
    for (const def of CHAPTER_ONE_OBJECTS) expect(GROUND_OBJECTS).toContainEqual(liveObject(def));
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
    // Eastbrook Vale v2: where each one lives (its design site, else as authored).
    const points: [string, number, number][] = [];
    for (const def of CHAPTER_ONE_OBJECTS)
      for (const p of def.positions) {
        const at = liveObjectPos(def.itemId, p);
        points.push([def.itemId, at.x, at.z]);
      }
    for (const camp of CHAPTER_ONE_CAMPS) {
      const at = ebv2SiteOr(campSiteKey(camp), camp.center);
      points.push([camp.mobId, at.x, at.z]);
    }
    for (const npc of Object.values(CHAPTER_ONE_NPCS))
      points.push([npc.id, NPCS[npc.id].pos.x, NPCS[npc.id].pos.z]);
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

  // Retired with the Eastbrook Vale v2 port: 'keeps clear of the town layout
  // lots (houses, terrace, cottages, well)' pinned chapter points against the
  // OLD town's building centres (meadow houses, row terrace, cottages, well)
  // and Pella's old yard at (-45, -87). None of those stand in v2; the v2
  // houses are design solids, which the dry-open-ground check above already
  // keeps every live chapter point out of (eastbrook_v2_world.test.ts pins the
  // same for every vale spawn).

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
    // The chapter never unlocks a shipped chain (the Hollow Crypt chain and
    // its q_whispers retired with the crypt).
    // (Wyndlewood Chapter Two, content/chapter_two.ts, follows on from it.)
    for (const q of Object.values(QUESTS)) {
      if (q.id.startsWith('c1_') || q.id.startsWith('c2_')) continue;
      expect(q.requiresQuest?.startsWith('c1_') ?? false, q.id).toBe(false);
    }
    expect(QUESTS.c1_26_promise_paint.completionText).toContain(OATHLESS_KING_TITLE);
    expect(QUESTS.q_whispers).toBeUndefined();
  });

  it('gives no new townsfolk a shipped first name, nor one a letter off the known clashes', () => {
    // The clash rule (docs/narrative/wyndlewood_decisions.md): Pella beside
    // the five shipped Pells and Holven beside Brother Halven read as one
    // person, so those newcomers ship under different first names (ids
    // unchanged); and no newcomer reuses a word of any shipped NPC's name.
    const oneOff = (a: string, b: string): boolean => {
      if (a === b) return true;
      if (Math.abs(a.length - b.length) > 1) return false;
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      const tail = (x: string, n: number) => x.slice(i + n);
      return tail(a, 1) === tail(b, 1) || tail(a, 1) === tail(b, 0) || tail(a, 0) === tail(b, 1);
    };
    const chapter = new Set(Object.keys(CHAPTER_ONE_NPCS));
    const shippedWords = new Set<string>();
    for (const npc of Object.values(NPCS)) {
      if (chapter.has(npc.id)) continue;
      for (const word of npc.name.toLowerCase().split(/[^a-z]+/)) {
        if (word.length >= 3) shippedWords.add(word);
      }
    }
    const clashes: string[] = [];
    for (const npc of Object.values(CHAPTER_ONE_NPCS)) {
      const first = npc.name.toLowerCase().split(' ')[0];
      if (shippedWords.has(first)) clashes.push(`${npc.name} reuses a shipped name`);
      for (const known of ['pell', 'halven']) {
        if (oneOff(first, known)) clashes.push(`${npc.name} ~ ${known}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('keeps the Oathless King in its one constant', () => {
    // wyndlewood_lore.ts is the only source that spells the title out.
    const roots = ['src/sim', 'src/ui', 'src/guide', 'server'];
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (/\.ts$/.test(ent.name) && !/generated/.test(p)) {
          const text = fs.readFileSync(p, 'utf8');
          if (text.includes('Oathless King')) hits.push(p.replace(/\\/g, '/'));
        }
      }
    };
    for (const root of roots) if (fs.existsSync(root)) walk(root);
    expect(hits).toEqual(['src/sim/content/wyndlewood_lore.ts']);
  });

  it('writes no em dash, en dash or emoji into the chapter prose', () => {
    for (const q of Object.values(ALL)) {
      for (const text of [q.name, q.text, q.completionText]) {
        expect(text, q.id).not.toMatch(/[\u2013\u2014]|\p{Extended_Pictographic}/u);
      }
    }
  });
});
