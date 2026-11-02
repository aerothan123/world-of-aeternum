// The Quest Workshop save pipeline's server-side half
// (src/quest_editor/workshop_save.ts): what the dev server's loopback endpoint
// runs over a POST body before anything is written. Driven over a hand-built
// ContentIndex so the verdicts never depend on shipped content.

import { describe, expect, it } from 'vitest';
import type { ContentIndex } from '../src/quest_editor/content_index_core';
import { prepareWorkshopSave } from '../src/quest_editor/workshop_save';

const index: ContentIndex = {
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
  items: {},
  recipes: {},
  quests: {
    q_wolves: { id: 'q_wolves', name: 'Wolves', giverNpcId: 'elder_rowan', requiresQuest: null },
  },
  nodeTypes: ['herb', 'ore', 'wood'],
  acquirableItemIds: new Set(),
  groundObjectItemIds: new Set(),
  nodeItemIds: new Set(),
};

const good = {
  id: 'q_ws_tally',
  name: 'Wolf Tally',
  giverNpcId: 'elder_rowan',
  turnInNpcId: 'elder_rowan',
  text: 'Count them.',
  completionText: 'Counted.',
  objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 3, label: 'Wolves' }],
  xpReward: 10,
  copperReward: 5,
  itemRewards: {},
};

describe('workshop_save: prepareWorkshopSave', () => {
  it('rejects malformed bodies by class', () => {
    expect(prepareWorkshopSave('nope', index)).toEqual({ ok: false, error: 'bad_json' });
    expect(prepareWorkshopSave('{"quests":{}}', index)).toEqual({ ok: false, error: 'bad_shape' });
    expect(prepareWorkshopSave('[]', index)).toEqual({ ok: false, error: 'bad_shape' });
  });

  it('refuses an invalid set with the per-quest issues and writes nothing', () => {
    const bad = { ...good, id: 'q_wolves', objectives: [] };
    const result = prepareWorkshopSave(JSON.stringify({ quests: [bad] }), index);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid');
    expect(result.issues?.q_wolves.map((i) => i.code)).toEqual(['id_taken', 'objectives_empty']);
    expect(result).not.toHaveProperty('module');
  });

  it('refuses a set over the cap before validating a single row', () => {
    const many = Array.from({ length: 501 }, () => good);
    expect(prepareWorkshopSave(JSON.stringify({ quests: many }), index)).toMatchObject({
      ok: false,
      error: 'invalid',
      setIssue: 'too_many_quests',
    });
  });

  it('emits the generated module for a valid set', () => {
    const result = prepareWorkshopSave(JSON.stringify({ quests: [good] }), index);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(1);
    expect(result.module).toContain(
      "export const WORKSHOP_QUEST_IDS: readonly string[] = ['q_ws_tally'];",
    );
    expect(result.module).toContain("elder_rowan: ['q_ws_tally'],");
  });
});
