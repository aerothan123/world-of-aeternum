// The Quest Workshop pure core (src/quest_editor/quest_editor_core.ts): the
// slug/id rule, every validation issue class, the prerequisite cycle check, the
// JSON round trip, and the deterministic, biome-clean emitter for
// src/sim/content/workshop_quests.generated.ts. Drives the core over a
// hand-built ContentIndex so no shipped content moves these assertions.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ContentIndex } from '../src/quest_editor/content_index_core';
import {
  emitWorkshopModule,
  fromQuestDef,
  prerequisiteCycle,
  slugify,
  suggestQuestId,
  toQuestDef,
  validateWorkshopQuest,
  validateWorkshopSet,
  type WorkshopQuest,
  workshopNpcQuestIds,
  workshopQuestFromJson,
} from '../src/quest_editor/quest_editor_core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeIndex(): ContentIndex {
  return {
    zones: [{ id: 'zone1', name: 'Eastbrook Vale' }],
    npcs: {
      elder_rowan: {
        id: 'elder_rowan',
        name: 'Elder Rowan',
        title: 'Village Elder',
        zoneId: 'zone1',
        zoneName: 'Eastbrook Vale',
        questIds: ['q_wolves'],
      },
      smith_hal: {
        id: 'smith_hal',
        name: 'Hal',
        title: 'Blacksmith',
        zoneId: 'zone1',
        zoneName: 'Eastbrook Vale',
        questIds: [],
      },
    },
    mobs: {
      forest_wolf: {
        id: 'forest_wolf',
        name: 'Forest Wolf',
        minLevel: 1,
        maxLevel: 3,
        zoneId: 'zone1',
        zoneName: 'Eastbrook Vale',
      },
    },
    items: {
      wolf_pelt: {
        id: 'wolf_pelt',
        name: 'Wolf Pelt',
        kind: 'quest',
        quality: 'common',
        requiredLevel: null,
        requiredClass: null,
      },
      moon_dust: {
        id: 'moon_dust',
        name: 'Moon Dust',
        kind: 'misc',
        quality: 'rare',
        requiredLevel: null,
        requiredClass: null,
      },
      copper_ore: {
        id: 'copper_ore',
        name: 'Copper Ore',
        kind: 'misc',
        quality: 'common',
        requiredLevel: null,
        requiredClass: null,
      },
      iron_sword: {
        id: 'iron_sword',
        name: 'Iron Sword',
        kind: 'weapon',
        quality: 'uncommon',
        requiredLevel: 5,
        requiredClass: null,
      },
      old_crate: {
        id: 'old_crate',
        name: 'Old Crate',
        kind: 'quest',
        quality: 'common',
        requiredLevel: null,
        requiredClass: null,
      },
    },
    recipes: {
      r_iron_sword: {
        id: 'r_iron_sword',
        professionId: 'blacksmithing',
        resultItemId: 'iron_sword',
        resultName: 'Iron Sword',
      },
    },
    quests: {
      q_wolves: {
        id: 'q_wolves',
        name: 'Wolves at the Door',
        giverNpcId: 'elder_rowan',
        requiresQuest: null,
      },
      q_greyjaw: {
        id: 'q_greyjaw',
        name: 'Greyjaw',
        giverNpcId: 'elder_rowan',
        requiresQuest: 'q_wolves',
      },
    },
    nodeTypes: ['herb', 'ore', 'wood'],
    acquirableItemIds: new Set(['wolf_pelt', 'copper_ore', 'iron_sword']),
    groundObjectItemIds: new Set(['old_crate']),
    nodeItemIds: new Set(['copper_ore']),
  };
}

function goodQuest(over: Partial<WorkshopQuest> = {}): WorkshopQuest {
  return {
    id: 'q_ws_wolf_pelts',
    name: 'Wolf Pelts',
    giverNpcId: 'elder_rowan',
    turnInNpcId: 'elder_rowan',
    text: "The wolves won't stop. Bring me their pelts, $N.",
    completionText: 'Fine pelts. The village thanks you.',
    objectives: [
      { type: 'kill', targetMobId: 'forest_wolf', count: 6, label: 'Forest Wolves slain' },
      { type: 'collect', itemId: 'wolf_pelt', count: 4, label: 'Wolf Pelts' },
    ],
    xpReward: 250,
    copperReward: 1250,
    itemRewards: { warrior: 'iron_sword' },
    choiceRewards: [],
    recipeReward: null,
    requiresQuest: 'q_wolves',
    minLevel: 2,
    maxLevel: null,
    requiredClass: [],
    ...over,
  };
}

function codes(quest: WorkshopQuest, siblings: WorkshopQuest[] = [quest]): string[] {
  return validateWorkshopQuest(quest, makeIndex(), siblings).map((i) => i.code);
}

describe('quest_editor_core: slug and id', () => {
  it('slugifies a name into the id alphabet', () => {
    expect(slugify('Wolves at the Door!')).toBe('wolves_at_the_door');
    expect(slugify("  Ol' Greyjaw's  Den ")).toBe('ol_greyjaw_s_den');
    expect(slugify('Fenbridge: The Return')).toBe('fenbridge_the_return');
  });

  it('suggests q_ws_<slug> and numbers past taken ids', () => {
    expect(suggestQuestId('Wolf Pelts', new Set())).toBe('q_ws_wolf_pelts');
    expect(suggestQuestId('Wolf Pelts', new Set(['q_ws_wolf_pelts']))).toBe('q_ws_wolf_pelts_2');
    expect(suggestQuestId('Wolf Pelts', new Set(['q_ws_wolf_pelts', 'q_ws_wolf_pelts_2']))).toBe(
      'q_ws_wolf_pelts_3',
    );
    expect(suggestQuestId('', new Set())).toBe('q_ws_quest');
  });
});

describe('quest_editor_core: validation', () => {
  it('a good quest passes clean', () => {
    expect(codes(goodQuest())).toEqual([]);
    const set = validateWorkshopSet([goodQuest()], makeIndex());
    expect(set).toEqual({ ok: true, issues: {}, setIssue: null });
  });

  it.each<[string, Partial<WorkshopQuest>, string]>([
    ['missing name', { name: '  ' }, 'name_missing'],
    ['bad id', { id: 'wolf-pelts' }, 'id_invalid'],
    ['id of a shipped quest', { id: 'q_wolves' }, 'id_taken'],
    ['unknown giver', { giverNpcId: 'nobody' }, 'giver_unknown'],
    ['giver with no quests', { giverNpcId: 'smith_hal' }, 'giver_not_quest_giver'],
    ['unknown turn-in', { turnInNpcId: 'nobody' }, 'turn_in_unknown'],
    ['missing text', { text: '' }, 'text_missing'],
    ['missing completion', { completionText: '' }, 'completion_missing'],
    ['no objectives', { objectives: [] }, 'objectives_empty'],
    [
      'unknown mob',
      { objectives: [{ type: 'kill', targetMobId: 'dragon', count: 1, label: 'x' }] },
      'mob_unknown',
    ],
    [
      'zero count',
      { objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 0, label: 'x' }] },
      'objective_count',
    ],
    [
      'fractional count',
      { objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 1.5, label: 'x' }] },
      'objective_count',
    ],
    [
      'missing label',
      { objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 1, label: '' }] },
      'objective_label_missing',
    ],
    [
      'unknown item',
      { objectives: [{ type: 'collect', itemId: 'nothing', count: 1, label: 'x' }] },
      'item_unknown',
    ],
    [
      'unobtainable item',
      { objectives: [{ type: 'collect', itemId: 'moon_dust', count: 1, label: 'x' }] },
      'item_unobtainable',
    ],
    [
      'interact with no target',
      { objectives: [{ type: 'interact', count: 1, label: 'x' }] },
      'interact_target_missing',
    ],
    [
      'interact unknown npc',
      { objectives: [{ type: 'interact', targetNpcId: 'ghost', count: 1, label: 'x' }] },
      'interact_npc_unknown',
    ],
    [
      'interact unknown object',
      { objectives: [{ type: 'interact', targetObjectItemId: 'wolf_pelt', count: 1, label: 'x' }] },
      'interact_object_unknown',
    ],
    [
      'gather nothing',
      { objectives: [{ type: 'gather', itemId: '', count: 1, label: 'x' }] },
      'gather_target_missing',
    ],
    [
      'gather unknown node',
      { objectives: [{ type: 'gather', nodeType: 'fish' as 'ore', count: 1, label: 'x' }] },
      'gather_node_unknown',
    ],
    [
      'gather item no node',
      { objectives: [{ type: 'gather', itemId: 'wolf_pelt', count: 1, label: 'x' }] },
      'gather_item_no_node',
    ],
    [
      'unknown recipe',
      { objectives: [{ type: 'craft', recipeId: 'r_nothing', count: 1, label: 'x' }] },
      'recipe_unknown',
    ],
    ['negative xp', { xpReward: -5 }, 'xp_invalid'],
    ['fractional copper', { copperReward: 2.5 }, 'copper_invalid'],
    ['unknown reward item', { itemRewards: { mage: 'nothing' } }, 'reward_item_unknown'],
    ['unknown choice item', { choiceRewards: ['nothing'] }, 'choice_item_unknown'],
    ['unknown recipe reward', { recipeReward: 'r_nothing' }, 'recipe_reward_unknown'],
    ['unknown prerequisite', { requiresQuest: 'q_nothing' }, 'prerequisite_unknown'],
    ['self prerequisite', { requiresQuest: 'q_ws_wolf_pelts' }, 'prerequisite_self'],
    ['bad level', { minLevel: 0 }, 'level_invalid'],
    ['inverted levels', { minLevel: 10, maxLevel: 5 }, 'level_range'],
    ['unknown class', { requiredClass: ['bard' as 'mage'] }, 'class_unknown'],
  ])('fails on %s', (_label, over, code) => {
    expect(codes(goodQuest(over))).toContain(code);
  });

  it('accepts a giver that is also the turn-in, and every authored objective kind', () => {
    const quest = goodQuest({
      turnInNpcId: 'elder_rowan',
      objectives: [
        { type: 'kill', targetMobId: 'forest_wolf', count: 1, label: 'a' },
        { type: 'collect', itemId: 'copper_ore', count: 1, label: 'b' },
        { type: 'interact', targetNpcId: 'smith_hal', count: 1, label: 'c' },
        { type: 'interact', targetObjectItemId: 'old_crate', count: 2, label: 'd' },
        { type: 'gather', nodeType: 'ore', count: 3, label: 'e' },
        { type: 'gather', nodeType: 'ore', itemId: 'copper_ore', count: 3, label: 'f' },
        { type: 'craft', recipeId: 'r_iron_sword', count: 1, label: 'g' },
      ],
    });
    expect(codes(quest)).toEqual([]);
  });

  it('reports the objective row an issue is about', () => {
    const issues = validateWorkshopQuest(
      goodQuest({
        objectives: [
          { type: 'kill', targetMobId: 'forest_wolf', count: 1, label: 'ok' },
          { type: 'kill', targetMobId: 'nope', count: 1, label: 'bad' },
        ],
      }),
      makeIndex(),
      [],
    );
    expect(issues).toEqual([{ code: 'mob_unknown', objectiveIndex: 1, value: 'nope' }]);
  });

  it('flags duplicate ids across the workshop set, once per row', () => {
    const a = goodQuest();
    const b = goodQuest({ name: 'Other' });
    expect(codes(a, [a, b])).toContain('id_duplicate');
    const set = validateWorkshopSet([a, b], makeIndex());
    expect(set.ok).toBe(false);
    expect(set.issues.q_ws_wolf_pelts.filter((i) => i.code === 'id_duplicate')).toHaveLength(2);
  });

  it('detects a prerequisite cycle through workshop siblings and shipped quests', () => {
    const index = makeIndex();
    const a = goodQuest({ id: 'q_ws_a', requiresQuest: 'q_ws_b' });
    const b = goodQuest({ id: 'q_ws_b', name: 'B', requiresQuest: 'q_ws_c' });
    const c = goodQuest({ id: 'q_ws_c', name: 'C', requiresQuest: 'q_ws_a' });
    expect(prerequisiteCycle(a, index, [a, b, c])).toBe(true);
    expect(codes(a, [a, b, c])).toContain('prerequisite_cycle');
    // A chain that ends in shipped content is not a cycle.
    const d = goodQuest({ id: 'q_ws_d', requiresQuest: 'q_greyjaw' });
    expect(prerequisiteCycle(d, index, [d])).toBe(false);
    expect(codes(d, [d])).toEqual([]);
    // A chain through a sibling that ends in shipped content is not a cycle either.
    const e = goodQuest({ id: 'q_ws_e', name: 'E', requiresQuest: 'q_ws_d' });
    expect(prerequisiteCycle(e, index, [d, e])).toBe(false);
  });

  it('rejects an unknown objective kind arriving as JSON instead of coercing it', () => {
    const { quest, rawObjectiveKinds } = workshopQuestFromJson({
      ...goodQuest(),
      objectives: [{ type: 'escort', escortId: 'x', count: 1, label: 'walk' }],
    });
    const issues = validateWorkshopQuest(quest, makeIndex(), [quest], rawObjectiveKinds);
    expect(issues).toEqual([
      { code: 'objective_kind_unknown', objectiveIndex: 0, value: 'escort' },
    ]);
  });

  it('refuses a set over the cap', () => {
    const many = Array.from({ length: 501 }, (_, i) => goodQuest({ id: `q_ws_${i}` }));
    expect(validateWorkshopSet(many, makeIndex()).setIssue).toBe('too_many_quests');
  });
});

describe('quest_editor_core: JSON <-> record mapping', () => {
  it('round-trips a quest through JSON, QuestDef, and back', () => {
    const quest = goodQuest({ choiceRewards: ['iron_sword'], requiredClass: ['warrior', 'rogue'] });
    const viaJson = workshopQuestFromJson(JSON.parse(JSON.stringify(quest))).quest;
    expect(viaJson).toEqual(quest);
    const def = toQuestDef(quest);
    expect(fromQuestDef(def)).toEqual(quest);
  });

  it('emits only the optional QuestDef fields that are set', () => {
    const def = toQuestDef(goodQuest({ requiresQuest: null, minLevel: null }));
    expect(def).not.toHaveProperty('choiceRewards');
    expect(def).not.toHaveProperty('recipeReward');
    expect(def).not.toHaveProperty('requiresQuest');
    expect(def).not.toHaveProperty('minLevel');
    expect(def).not.toHaveProperty('maxLevel');
    expect(def).not.toHaveProperty('requiredClass');
  });

  it('tolerates malformed JSON fields (the validator reports them)', () => {
    const { quest } = workshopQuestFromJson({ id: 7, objectives: 'nope', xpReward: 'lots' });
    expect(quest.id).toBe('');
    expect(quest.objectives).toEqual([]);
    expect(quest.xpReward).toBe(0);
    expect(quest.turnInNpcId).toBe('');
    expect(workshopQuestFromJson(null).quest.name).toBe('');
  });

  it('defaults the turn-in to the giver when the JSON omits it', () => {
    const { quest } = workshopQuestFromJson({ giverNpcId: 'elder_rowan' });
    expect(quest.turnInNpcId).toBe('elder_rowan');
  });
});

describe('quest_editor_core: emission', () => {
  const biome = path.join(root, 'node_modules', '.bin', 'biome');

  function biomeFormatted(source: string): string {
    const run = spawnSync(biome, ['format', '--stdin-file-path=workshop_quests.generated.ts'], {
      cwd: root,
      input: source,
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    return run.stdout;
  }

  it('derives the NPC quest lists from giver and turn-in, sorted', () => {
    const a = goodQuest({ id: 'q_ws_b', turnInNpcId: 'smith_hal' });
    const b = goodQuest({ id: 'q_ws_a' });
    expect(workshopNpcQuestIds([a, b])).toEqual({
      elder_rowan: ['q_ws_a', 'q_ws_b'],
      smith_hal: ['q_ws_b'],
    });
  });

  it('is byte-stable regardless of input order and biome-clean', () => {
    const a = goodQuest({
      id: 'q_ws_wolf_pelts',
      text: 'He said "go" and she said \'now\'. A long line to push past the formatter width, with a tab\tand a newline\nin it.',
      choiceRewards: [
        'iron_sword',
        'wolf_pelt',
        'copper_ore',
        'moon_dust',
        'old_crate',
        'iron_sword',
        'wolf_pelt',
      ],
      requiredClass: ['warrior', 'paladin'],
      recipeReward: 'r_iron_sword',
      maxLevel: 12,
      itemRewards: {
        warrior: 'iron_sword',
        paladin: 'iron_sword',
        hunter: 'iron_sword',
        rogue: 'iron_sword',
        priest: 'iron_sword',
      },
    });
    const b = goodQuest({
      id: 'q_ws_crates',
      name: 'Crates',
      turnInNpcId: 'smith_hal',
      objectives: [
        {
          type: 'interact',
          targetObjectItemId: 'old_crate',
          count: 3,
          label: 'Old crates searched along the north road past the mill',
        },
      ],
      itemRewards: {},
      requiresQuest: null,
      minLevel: null,
    });
    const emitted = emitWorkshopModule([a, b]);
    expect(emitWorkshopModule([b, a])).toBe(emitted);
    expect(biomeFormatted(emitted)).toBe(emitted);
    expect(emitted).toMatch(
      /^export const WORKSHOP_QUEST_IDS: readonly string\[\] = \['q_ws_crates', 'q_ws_wolf_pelts'\];$/m,
    );
    expect(emitted).toContain("text: 'He said \"go\" and she said \\'now\\'.");
    expect(emitted).toContain('\\t');
    expect(emitted).toContain('\\n');
  });

  it('emits the empty set as the committed baseline module', () => {
    const emitted = emitWorkshopModule([]);
    expect(biomeFormatted(emitted)).toBe(emitted);
    expect(emitted).toContain('export const WORKSHOP_QUESTS: Record<string, QuestDef> = {};');
    expect(emitted).toContain('export const WORKSHOP_QUEST_ORDER: readonly string[] = [];');
    expect(emitted).toContain(
      'export const WORKSHOP_NPC_QUEST_IDS: Record<string, readonly string[]> = {};',
    );
    expect(emitted).toContain('export const WORKSHOP_QUEST_IDS: readonly string[] = [];');
  });
});
