// Profession quest objectives (#1292): successful authoritative craft and
// gather actions credit matching objectives exactly once. Denied and
// nonmatching actions never advance quest state.

import { afterEach, describe, expect, it } from 'vitest';
import { GATHER_NODES, QUESTS } from '../src/sim/data';
import { nodeMaterialFor } from '../src/sim/professions/gathering';
import { TIER2_TOOL_WIELD_PROFICIENCY } from '../src/sim/professions/wield_gate';
import { Sim } from '../src/sim/sim';
import { choppableTreesNear } from '../src/sim/trees/tree_registry';
import type { QuestDef, QuestObjective, QuestProgress } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { runCraft } from './helpers/enchant_family_cast';

const TEST_QUEST_ID = 'q_test_profession_objectives';
const originalQuest = QUESTS[TEST_QUEST_ID];

afterEach(() => {
  if (originalQuest) QUESTS[TEST_QUEST_ID] = originalQuest;
  else delete QUESTS[TEST_QUEST_ID];
});

function installQuest(objectives: QuestObjective[]): void {
  const quest: QuestDef = {
    id: TEST_QUEST_ID,
    name: 'Test Profession Actions',
    giverNpcId: 'foreman_odell',
    turnInNpcId: 'foreman_odell',
    text: 'Test only.',
    completionText: 'Test complete.',
    objectives,
    xpReward: 0,
    copperReward: 0,
    itemRewards: {},
    retired: true,
  };
  QUESTS[TEST_QUEST_ID] = quest;
}

function trackedSim(objectives: QuestObjective[]): { sim: Sim; pid: number; qp: QuestProgress } {
  installQuest(objectives);
  const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Artisan');
  const qp: QuestProgress = {
    questId: TEST_QUEST_ID,
    counts: objectives.map(() => 0),
    state: 'active',
  };
  sim.meta(pid)!.questLog.set(TEST_QUEST_ID, qp);
  return { sim, pid, qp };
}

function teleportOntoNode(sim: Sim, pid: number, nodeId: string): void {
  const node = GATHER_NODES.find((candidate) => candidate.id === nodeId)!;
  const player = sim.entities.get(pid)!;
  player.pos.x = node.pos.x;
  player.pos.z = node.pos.z;
  player.pos.y = terrainHeight(node.pos.x, node.pos.z, sim.cfg.seed);
  player.prevPos = { ...player.pos };
}

describe('craft quest objectives', () => {
  it('credits only a successful craft of the matching recipe', () => {
    const { sim, pid, qp } = trackedSim([
      {
        type: 'craft',
        recipeId: 'recipe_minor_healing_potion',
        count: 1,
        label: 'Minor Healing Potion crafted',
      },
    ]);

    // A denied matching attempt has no quest side effect.
    runCraft(sim, 'recipe_minor_healing_potion', false, pid);
    expect(sim.meta(pid)!.lastCraftResult?.reason).toBe('insufficient_materials');
    expect(qp.counts).toEqual([0]);

    // A successful but different recipe does not count.
    sim.addItem('spider_leg', 1, pid);
    runCraft(sim, 'recipe_tough_jerky', false, pid);
    expect(sim.meta(pid)!.lastCraftResult?.ok).toBe(true);
    expect(qp.counts).toEqual([0]);

    sim.addItem('linen_scrap', 1, pid);
    sim.addItem('spider_leg', 1, pid);
    sim.addItem('silverleaf_herb', 2, pid); // the reworked recipe's herb reagent
    runCraft(sim, 'recipe_minor_healing_potion', false, pid);

    expect(sim.meta(pid)!.lastCraftResult?.ok).toBe(true);
    expect(qp.counts).toEqual([1]);
    expect(qp.state).toBe('ready');
  });
});

// harvestNode STARTS a gather cast; quest credit lands at
// completion. Mirror the lifecycle completion arm synchronously (the
// gather_rare_events.test.ts completeCastNow idiom) so these seed-stable
// drives stay free of world-tick noise. Only called after a GRANTED start
// (a denied attempt starts no cast).
function completeCastNow(sim: Sim, pid: number): void {
  const p = sim.entities.get(pid);
  const meta = sim.players.get(pid);
  if (!p || !meta) throw new Error('missing player');
  p.castingAbility = null;
  p.castRemaining = 0;
  sim.ctx.completeGatherCast(p, meta);
}

describe('gather quest objectives', () => {
  it('matches node type and gathered material only after a granted harvest', () => {
    const { sim, pid, qp } = trackedSim([
      { type: 'gather', nodeType: 'ore', count: 1, label: 'Ore vein harvested' },
      {
        type: 'gather',
        itemId: nodeMaterialFor('ore', 'eastbrook_vale').itemId,
        count: 1,
        label: 'Ore material gathered',
      },
    ]);
    const ore = GATHER_NODES.find((node) => node.type === 'ore')!;
    const herb = GATHER_NODES.find((node) => node.type === 'herb')!;
    // #2343: every node harvest needs the matching-profession tool in bags
    // (the too-far denial below still fires before the tool gate).
    sim.addItem('copper_mining_pick', 1, pid);
    sim.addItem('gathering_sickle', 1, pid);

    // Too far away, so the server denies without quest credit.
    sim.harvestNode(ore.id, undefined, pid);
    expect(qp.counts).toEqual([0, 0]);

    // A successful nonmatching gather still does not count.
    teleportOntoNode(sim, pid, herb.id);
    sim.harvestNode(herb.id, undefined, pid);
    completeCastNow(sim, pid);
    expect(qp.counts).toEqual([0, 0]);

    teleportOntoNode(sim, pid, ore.id);
    sim.harvestNode(ore.id, undefined, pid);
    completeCastNow(sim, pid);
    expect(qp.counts).toEqual([1, 1]);
    expect(qp.state).toBe('ready');

    // The same node is now cooling down. Its denied replay cannot over-credit.
    sim.harvestNode(ore.id, undefined, pid);
    expect(qp.counts).toEqual([1, 1]);
  });
});

// D8: a harvest grants the FINE grade of the zone material once the player's
// tool outclasses it, so an objective keyed on the base item id has to accept
// the grade or it silently stops crediting for everyone who upgraded. No
// shipped quest uses the itemId arm today, which is exactly why it would rot
// unnoticed: the four live gather objectives all key on nodeType.
describe('gather quest objectives across material grades', () => {
  it('an itemId-keyed objective credits when the tool upgrades the yield', () => {
    const baseItemId = nodeMaterialFor('ore', 'eastbrook_vale').itemId;
    const { sim, pid, qp } = trackedSim([
      { type: 'gather', itemId: baseItemId, count: 1, label: 'Ore material gathered' },
    ]);
    // A tier-2 pick: eastbrook is all tier-1 veins at material tier 1, so this
    // player can no longer produce the plain grade anywhere in the zone. The
    // wield counter has to be earned first (R22): a covering tool below its
    // threshold is a denial, not a downgrade, so an unearned pick would stop
    // this harvest before the grade axis this test is about ever resolves.
    sim.addItem('iron_mining_pick', 1, pid);
    sim.meta(pid)!.gatheringProficiency.mining = TIER2_TOOL_WIELD_PROFICIENCY;
    const ore = GATHER_NODES.find(
      (node) => node.zoneId === 'eastbrook_vale' && node.type === 'ore',
    )!;
    teleportOntoNode(sim, pid, ore.id);

    expect(sim.harvestNode(ore.id, undefined, pid)).toBe(true);
    completeCastNow(sim, pid);

    // The premise: the grant really was the fine grade, not the base id.
    expect(sim.countItem(baseItemId, pid)).toBe(0);
    expect(sim.countItem(`fine_${baseItemId}`, pid)).toBeGreaterThanOrEqual(1);
    // And the objective still moved.
    expect(qp.counts).toEqual([1]);
  });

  it('an itemId-keyed objective still refuses an unrelated material', () => {
    // The negative arm: grade-awareness widens the match to the SAME material's
    // grades, not to anything a node happens to drop.
    const { sim, pid, qp } = trackedSim([
      { type: 'gather', itemId: 'copper_ore', count: 1, label: 'Ore material gathered' },
    ]);
    sim.addItem('gathering_sickle', 1, pid);
    const herb = GATHER_NODES.find(
      (node) => node.zoneId === 'eastbrook_vale' && node.type === 'herb',
    )!;
    teleportOntoNode(sim, pid, herb.id);

    expect(sim.harvestNode(herb.id, undefined, pid)).toBe(true);
    completeCastNow(sim, pid);

    expect(sim.countItem('silverleaf_herb', pid)).toBeGreaterThanOrEqual(1);
    expect(qp.counts).toEqual([0]);
  });
});

// Tree chopping (docs/design/tree-chopping.md): the wood stands retired and
// every overworld tree is the Logging source, so a nodeType 'wood' objective
// (none ships today; the arm stays live for content) credits on a FELLED tree,
// whose gather-node view carries type 'wood'.
describe('gather quest objectives on trees', () => {
  it('a wood objective credits when a tree is felled, and never on a denied chop', () => {
    const { sim, pid, qp } = trackedSim([
      { type: 'gather', nodeType: 'wood', count: 1, label: 'Tree felled' },
    ]);
    const tree = choppableTreesNear(sim.cfg.seed, -14, -100, 300).find(
      (t) => t.zoneId === 'eastbrook_vale',
    );
    if (!tree) throw new Error('no eastbrook tree');
    // Too far: denied, no credit.
    sim.harvestNode(tree.node.id, undefined, pid);
    expect(qp.counts).toEqual([0]);
    const p = sim.entities.get(pid);
    if (!p) throw new Error('missing player');
    p.pos = { x: tree.x, y: terrainHeight(tree.x, tree.z - 1.5, sim.cfg.seed), z: tree.z - 1.5 };
    p.prevPos = { ...p.pos };
    expect(sim.harvestNode(tree.node.id, undefined, pid)).toBe(true);
    completeCastNow(sim, pid);
    expect(qp.counts).toEqual([1]);
    expect(sim.countItem('ironbark_log', pid)).toBeGreaterThanOrEqual(1);
  });
});
