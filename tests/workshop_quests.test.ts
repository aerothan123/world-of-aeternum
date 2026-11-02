// The Quest Workshop's game-side half: the merge module
// (src/sim/content/workshop_merge.ts) that data.ts runs over the generated set,
// the committed generated module's shape, and the end-to-end proof that a
// merged workshop quest is a real quest in a real Sim (offered by its giver,
// accepted, credited by a kill, turned in for its rewards). The committed set is
// empty, so the Sim leg merges a fixture quest into the live tables first.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { emitWorkshopModule, fromQuestDef } from '../src/quest_editor/quest_editor_core';
import { applyWorkshopQuests } from '../src/sim/content/workshop_merge';
import {
  WORKSHOP_NPC_QUEST_IDS,
  WORKSHOP_QUEST_IDS,
  WORKSHOP_QUEST_ORDER,
  WORKSHOP_QUESTS,
} from '../src/sim/content/workshop_quests.generated';
import { BASE_WORLD, NPCS, QUEST_ORDER, QUESTS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity, NpcDef, QuestDef } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { worldTouchupBase, worldTouchupBaseWithout } from '../src/sim/world_touchup';
import { WORLD_TOUCHUP } from '../src/sim/world_touchup.generated';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(root, 'src/sim/content/workshop_quests.generated.ts');

const FIXTURE_ID = 'q_ws_test_wolf_tally';
const FIXTURE: QuestDef = {
  id: FIXTURE_ID,
  name: 'Wolf Tally',
  giverNpcId: QUESTS.q_wolves.giverNpcId,
  turnInNpcId: QUESTS.q_wolves.giverNpcId,
  text: 'Count the wolves for me, $N.',
  completionText: 'A fair tally.',
  objectives: [
    { type: 'kill', targetMobId: 'forest_wolf', count: 1, label: 'Forest Wolves slain' },
  ],
  xpReward: 120,
  copperReward: 345,
  itemRewards: {},
  minLevel: 1,
};

function npc(id: string): NpcDef {
  return {
    id,
    name: id,
    title: '',
    greeting: '',
    pos: { x: 0, z: 0 },
    facing: 0,
    color: 0,
    questIds: [],
  };
}

function quest(id: string, giver: string, turnIn = giver): QuestDef {
  return {
    id,
    name: id,
    giverNpcId: giver,
    turnInNpcId: turnIn,
    text: 't',
    completionText: 'c',
    objectives: [],
    xpReward: 0,
    copperReward: 0,
    itemRewards: {},
  };
}

describe('workshop_merge: applyWorkshopQuests', () => {
  it('adds quests, appends the order, and grows each named NPC once', () => {
    const tables = {
      quests: { q_wolves: quest('q_wolves', 'elder') },
      questOrder: ['q_wolves'],
      npcs: { elder: { ...npc('elder'), questIds: ['q_wolves'] }, smith: npc('smith') },
    };
    const source = {
      quests: { q_ws_a: quest('q_ws_a', 'elder', 'smith'), q_ws_b: quest('q_ws_b', 'elder') },
      questOrder: ['q_ws_a', 'q_ws_b'],
      npcQuestIds: { elder: ['q_ws_a', 'q_ws_b', 'q_wolves'], smith: ['q_ws_a'] },
    };
    const report = applyWorkshopQuests(tables, source);
    expect(report).toEqual({
      questsAdded: ['q_ws_a', 'q_ws_b'],
      questsSkipped: [],
      npcsMissing: [],
    });
    expect(Object.keys(tables.quests)).toEqual(['q_wolves', 'q_ws_a', 'q_ws_b']);
    expect(tables.questOrder).toEqual(['q_wolves', 'q_ws_a', 'q_ws_b']);
    expect(tables.npcs.elder.questIds).toEqual(['q_wolves', 'q_ws_a', 'q_ws_b']);
    expect(tables.npcs.smith.questIds).toEqual(['q_ws_a']);
    // Idempotent: a second pass changes nothing.
    const again = applyWorkshopQuests(tables, source);
    expect(again.questsAdded).toEqual([]);
    expect(again.questsSkipped).toEqual(['q_ws_a', 'q_ws_b']);
    expect(tables.questOrder).toEqual(['q_wolves', 'q_ws_a', 'q_ws_b']);
    expect(tables.npcs.elder.questIds).toEqual(['q_wolves', 'q_ws_a', 'q_ws_b']);
  });

  it('never overwrites a shipped quest and skips an NPC the table lacks', () => {
    const shipped = quest('q_wolves', 'elder');
    const tables = {
      quests: { q_wolves: shipped },
      questOrder: ['q_wolves'],
      npcs: { elder: npc('elder') },
    };
    const report = applyWorkshopQuests(tables, {
      quests: { q_wolves: quest('q_wolves', 'ghost') },
      questOrder: ['q_wolves'],
      npcQuestIds: { ghost: ['q_wolves'], elder: ['q_nope'] },
    });
    expect(report).toEqual({
      questsAdded: [],
      questsSkipped: ['q_wolves'],
      npcsMissing: ['ghost'],
    });
    expect(tables.quests.q_wolves).toBe(shipped);
    expect(tables.questOrder).toEqual(['q_wolves']);
    // An id the quest table does not carry is never pushed onto an NPC.
    expect(tables.npcs.elder.questIds).toEqual([]);
  });
});

describe('workshop_quests.generated.ts: the committed module', () => {
  it('is exactly what the emitter writes for its own set (deterministic, biome-clean)', () => {
    const onDisk = readFileSync(GENERATED, 'utf8');
    const quests = WORKSHOP_QUEST_ORDER.map((id) => fromQuestDef(WORKSHOP_QUESTS[id]));
    expect(emitWorkshopModule(quests)).toBe(onDisk);
    // biome.json ignores *.generated.ts on disk, so format the bytes over stdin.
    const biome = spawnSync(
      path.join(root, 'node_modules/.bin/biome'),
      ['format', '--stdin-file-path=workshop_quests.ts'],
      { cwd: root, input: onDisk, encoding: 'utf8' },
    );
    expect(biome.status, biome.stderr).toBe(0);
    expect(biome.stdout).toBe(onDisk);
  });

  it('keeps its four exports consistent with each other and with data.ts', () => {
    const ids = [...Object.keys(WORKSHOP_QUESTS)].sort();
    expect([...WORKSHOP_QUEST_IDS]).toEqual(ids);
    expect([...WORKSHOP_QUEST_ORDER]).toEqual(ids);
    for (const [npcId, questIds] of Object.entries(WORKSHOP_NPC_QUEST_IDS)) {
      expect(NPCS[npcId], npcId).toBeDefined();
      for (const id of questIds) {
        expect(WORKSHOP_QUESTS[id], id).toBeDefined();
        expect(NPCS[npcId].questIds, `${npcId} offers ${id}`).toContain(id);
      }
    }
    for (const id of ids) {
      expect(QUESTS[id]).toBe(WORKSHOP_QUESTS[id]);
      expect(QUEST_ORDER).toContain(id);
      expect(QUEST_ID_RE.test(id), id).toBe(true);
    }
    // The owner's text resolves through tEntity like every shipped quest: the
    // English source list carries the workshop ids.
    const source = readFileSync(path.join(root, 'src/ui/world_entity_i18n.ts'), 'utf8');
    expect(source).toContain('...WORKSHOP_QUEST_IDS]');
  });
});

const QUEST_ID_RE = /^q_[a-z0-9_]+$/;

describe('a merged workshop quest is a real quest in a real Sim', () => {
  const giverId = FIXTURE.giverNpcId;
  const giverBefore = [...NPCS[giverId].questIds];

  afterAll(() => {
    delete QUESTS[FIXTURE_ID];
    const at = QUEST_ORDER.indexOf(FIXTURE_ID);
    if (at >= 0) QUEST_ORDER.splice(at, 1);
    NPCS[giverId].questIds = giverBefore;
  });

  it('is offered by its giver, accepted, credited by a kill, and turned in for its rewards', () => {
    const baselineBefore = worldTouchupBase(BASE_WORLD);
    const report = applyWorkshopQuests(
      { quests: QUESTS, questOrder: QUEST_ORDER, npcs: NPCS },
      {
        quests: { [FIXTURE_ID]: FIXTURE },
        questOrder: [FIXTURE_ID],
        npcQuestIds: { [giverId]: [FIXTURE_ID] },
      },
    );
    expect(report.questsAdded).toEqual([FIXTURE_ID]);
    expect(NPCS[giverId].questIds).toContain(FIXTURE_ID);
    // A workshop quest on a giver never moves the live-world patch baseline
    // (world_touchup.ts strips the workshop ids), so a save never demands a
    // map rebase: with the fixture named as a workshop id the token is the
    // committed base again; counted as shipped content it would have moved.
    expect(baselineBefore).toBe(WORLD_TOUCHUP.base);
    expect(worldTouchupBaseWithout(BASE_WORLD, [FIXTURE_ID, ...WORKSHOP_QUEST_IDS])).toBe(
      baselineBefore,
    );
    expect(worldTouchupBaseWithout(BASE_WORLD, [])).not.toBe(baselineBefore);

    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true }) as Sim &
      Record<string, any>;
    const me = sim.player as Entity;
    const meta = sim.players.get(sim.playerId)!;
    const giver = [...sim.entities.values()].find(
      (e: Entity) => e.kind === 'npc' && e.templateId === giverId,
    ) as Entity;
    expect(giver).toBeDefined();
    const teleport = (x: number, z: number) => {
      me.pos.x = x;
      me.pos.z = z;
      me.pos.y = terrainHeight(x, z, sim.cfg.seed);
      me.prevPos = { ...me.pos };
      sim.rebucket(me);
    };

    teleport(giver.pos.x, giver.pos.z);
    expect(sim.questState(FIXTURE_ID)).toBe('available');
    sim.acceptQuest(FIXTURE_ID);
    expect(meta.questLog.get(FIXTURE_ID)).toMatchObject({ counts: [0], state: 'active' });
    expect(sim.drainEvents().some((e) => e.type === 'log' && /Wolf Tally/.test(e.text))).toBe(true);

    const wolf = [...sim.entities.values()].find(
      (e: Entity) => e.kind === 'mob' && e.templateId === 'forest_wolf' && e.hp > 0,
    ) as Entity;
    expect(wolf).toBeDefined();
    teleport(wolf.pos.x + 1, wolf.pos.z + 1);
    sim.dealDamage(me, wolf, wolf.hp + 1, false, 'physical', null, 'hit');
    expect(wolf.hp).toBe(0);
    expect(meta.questLog.get(FIXTURE_ID)).toMatchObject({ counts: [1], state: 'ready' });

    teleport(giver.pos.x, giver.pos.z);
    const copperBefore = meta.copper;
    const xpBefore = meta.lifetimeXp;
    sim.turnInQuest(FIXTURE_ID);
    expect(sim.questState(FIXTURE_ID)).toBe('done');
    expect(meta.questsDone.has(FIXTURE_ID)).toBe(true);
    expect(meta.copper - copperBefore).toBe(FIXTURE.copperReward);
    expect(meta.lifetimeXp - xpBefore).toBe(FIXTURE.xpReward);
  });
});
