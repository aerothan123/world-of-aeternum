// Tree chopping (docs/design/tree-chopping.md): the sim half. Covers the
// registry (stable ids, exclusions), the chop channel through the gathering
// cast, the felled state and its regrow queue, the collision view, the skill
// and tool gates, the deed and gather marks, determinism, and the retirement
// of the wood-stand nodes.

import { afterEach, describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import {
  GATHER_NODE_SITES_AS_SHIPPED,
  RETIRED_WOOD_NODE_SITES,
} from '../src/sim/content/gather_nodes';
import { TOWN_TREE_CLEARANCE, TREE_REGROW_SECONDS } from '../src/sim/content/tree_chopping';
import { GATHER_NODES, ZONES } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { treeChopSwings, treeRequiredToolTier } from '../src/sim/trees/tree_chop';
import { clearFelledTreeBodies, isTreeBodyFelled } from '../src/sim/trees/tree_fell_collision';
import { treeFallYaw } from '../src/sim/trees/tree_felling';
import {
  type ChoppableTree,
  choppableTreeById,
  choppableTreesNear,
  parseTreeNodeId,
  treeAnchorId,
  treeBodyKey,
  treeNodeId,
} from '../src/sim/trees/tree_registry';
import { type SimEvent, TICK_RATE, TREE_CHOP_CAST_ID } from '../src/sim/types';
import { generateDecorations, terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const SEED = 42;

afterEach(() => clearFelledTreeBodies());

function makeWorld(seed = SEED): Sim {
  return new Sim({ seed, playerClass: 'warrior', noPlayer: true });
}

function despawnMobs(sim: Sim): void {
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob') continue;
    e.dead = true;
    e.hp = 0;
    e.aiState = 'dead';
    e.respawnTimer = 1e9;
    e.corpseTimer = 1e9;
    e.inCombat = false;
  }
}

function zoneHub(zoneId: string) {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) throw new Error(`no zone ${zoneId}`);
  return zone.hub;
}

/** A tree of `tier` in `zoneId` whose chop spot (1.6 yd south of the trunk) is
 *  open, dry ground. */
function findTree(seed: number, zoneId: string, tier: number): ChoppableTree {
  const hub = zoneHub(zoneId);
  for (const tree of choppableTreesNear(seed, hub.x, hub.z, 400)) {
    if (tree.zoneId !== zoneId || tree.tier !== tier) continue;
    if (isBlocked(seed, tree.x, tree.z - 1.6, 0.4)) continue;
    return tree;
  }
  throw new Error(`no tier ${tier} tree in ${zoneId}`);
}

function placeBy(sim: Sim, pid: number, tree: ChoppableTree, dz = -1.6): void {
  const p = sim.entities.get(pid);
  if (!p) throw new Error('no entity');
  p.pos.x = tree.x;
  p.pos.z = tree.z + dz;
  p.pos.y = terrainHeight(p.pos.x, p.pos.z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

function runTicks(sim: Sim, n: number, sink?: SimEvent[]): void {
  for (let i = 0; i < n; i++) {
    const evs = sim.tick();
    if (sink) sink.push(...evs);
  }
}

function chopToEnd(sim: Sim, pid: number, sink?: SimEvent[]): void {
  const p = sim.entities.get(pid);
  for (let i = 0; i < 20 * TICK_RATE && p?.castingAbility; i++) runTicks(sim, 1, sink);
  if (p?.castingAbility) throw new Error('chop never finished');
  runTicks(sim, 1, sink);
}

describe('tree registry', () => {
  it('every scatter tree has a unique anchor id that resolves back to itself', () => {
    const decorations = generateDecorations(WORLD_SEED).filter((d) => d.kind !== 'rock');
    const ids = new Set<number>();
    let choppable = 0;
    for (const d of decorations) {
      const id = treeAnchorId(d.x, d.z);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
      const tree = choppableTreeById(WORLD_SEED, id);
      if (!tree) continue;
      choppable++;
      expect(tree.x).toBe(d.x);
      expect(tree.z).toBe(d.z);
      expect(tree.node.id).toBe(treeNodeId(id));
      expect(parseTreeNodeId(tree.node.id)).toBe(id);
      expect(tree.node.type).toBe('wood');
    }
    // The shipped world is a forest: well over a thousand choppable trees.
    expect(choppable).toBeGreaterThan(1500);
    expect(choppable).toBeLessThan(decorations.length + 1);
  });

  it('keeps every town standing: no choppable tree inside a hub clearance', () => {
    for (const zone of ZONES) {
      const r = zone.hub.radius + TOWN_TREE_CLEARANCE;
      for (const tree of choppableTreesNear(WORLD_SEED, zone.hub.x, zone.hub.z, r - 0.01)) {
        throw new Error(`tree ${tree.id} stands inside ${zone.id}'s town`);
      }
    }
  });

  it('rejects malformed and unknown ids', () => {
    expect(parseTreeNodeId('wood_eastbrook_1')).toBeNull();
    expect(parseTreeNodeId('tree:')).toBeNull();
    expect(parseTreeNodeId('tree:-1')).toBeNull();
    expect(parseTreeNodeId('tree:1e3')).toBeNull();
    expect(choppableTreeById(WORLD_SEED, -5)).toBeNull();
    expect(choppableTreeById(WORLD_SEED, 1.5)).toBeNull();
  });

  it('tiers follow the zone ladder the wood stands taught', () => {
    const tiersIn = (zoneId: string) => {
      const hub = zoneHub(zoneId);
      return new Set(
        choppableTreesNear(WORLD_SEED, hub.x, hub.z, 600)
          .filter((t) => t.zoneId === zoneId)
          .map((t) => t.tier),
      );
    };
    expect([...tiersIn('eastbrook_vale')]).toEqual([1]);
    expect(tiersIn('mirefen_marsh').has(2)).toBe(true);
    expect(tiersIn('thornpeak_heights').has(3)).toBe(true);
  });
});

describe('chop pacing and access', () => {
  it('takes three to six swings by tier, tool and band', () => {
    expect(treeChopSwings(1, 0, 0)).toBe(4);
    expect(treeChopSwings(3, 3, 0)).toBe(6);
    expect(treeChopSwings(1, 3, 2)).toBe(3);
    expect(treeChopSwings(3, 3, 2)).toBe(4);
    expect(treeRequiredToolTier(1)).toBe(0);
    expect(treeRequiredToolTier(2)).toBe(2);
  });

  it('fall yaw points away from the feller', () => {
    expect(treeFallYaw({ x: 0, z: 0 }, { x: 0, z: -2 })).toBeCloseTo(0);
    expect(treeFallYaw({ x: 0, z: 0 }, { x: -2, z: 0 })).toBeCloseTo(Math.PI / 2);
  });
});

describe('chopping a tree', () => {
  it('a bare-handed new player fells a tier-1 tree: logs, fall event, stump, regrow', () => {
    const sim = makeWorld();
    despawnMobs(sim);
    const pid = sim.addPlayer('warrior', 'Feller');
    const tree = findTree(SEED, 'eastbrook_vale', 1);
    placeBy(sim, pid, tree);
    const events: SimEvent[] = [];
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, pid)).toBe(true);
    const p = sim.entities.get(pid);
    expect(p?.castingAbility).toBe(TREE_CHOP_CAST_ID);
    expect(p?.castTotal).toBe(4);
    chopToEnd(sim, pid, events);
    expect(sim.countItem('ironbark_log', pid)).toBeGreaterThan(0);
    const fell = events.find((e) => e.type === 'treeFelled');
    expect(fell).toMatchObject({ type: 'treeFelled', treeId: tree.id, fellerId: pid });
    if (fell?.type === 'treeFelled') expect(fell.yaw).toBeCloseTo(0, 2);
    expect(sim.felledTrees().trees.has(tree.id)).toBe(true);
    expect(sim.nodeHarvestableByMeFor(treeNodeId(tree.id), pid)).toBe(false);
    expect(sim.nodeRespawnSecondsFor(treeNodeId(tree.id), pid)).toBeGreaterThan(
      TREE_REGROW_SECONDS - 2,
    );
    // Collision opened: the trunk centre is walkable while the stump stands.
    expect(isTreeBodyFelled(treeBodyKey(tree))).toBe(true);
    expect(isBlocked(SEED, tree.x, tree.z, 0.4)).toBe(false);
    // The gather marks and the first-felling deed mark.
    const meta = sim.players.get(pid);
    expect(meta?.deedStats.visited.has('gather:eastbrook_vale:wood')).toBe(true);
    expect(meta?.deedStats.visited.has('felling:tree')).toBe(true);
    // A felled tree refuses the next chopper.
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, pid)).toBe(false);
    // Regrow after five minutes of sim time, collision restored.
    runTicks(sim, (TREE_REGROW_SECONDS - 5) * TICK_RATE);
    expect(sim.felledTrees().trees.has(tree.id)).toBe(true);
    runTicks(sim, 6 * TICK_RATE);
    expect(sim.felledTrees().trees.has(tree.id)).toBe(false);
    expect(isBlocked(SEED, tree.x, tree.z, 0.4)).toBe(true);
    expect(sim.nodeHarvestableByMeFor(treeNodeId(tree.id), pid)).toBe(true);
    // No per-player timer leaked into the save shape.
    expect(meta?.nodeHarvestReadyAt[treeNodeId(tree.id)]).toBeUndefined();
  }, 180_000);

  it('first to finish fells it; the other chopper is stopped with the felled line', () => {
    const sim = makeWorld();
    despawnMobs(sim);
    const a = sim.addPlayer('warrior', 'Alpha');
    const b = sim.addPlayer('warrior', 'Bravo');
    const tree = findTree(SEED, 'eastbrook_vale', 1);
    placeBy(sim, a, tree);
    placeBy(sim, b, tree, -2.2);
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, a)).toBe(true);
    runTicks(sim, TICK_RATE);
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, b)).toBe(true);
    const events: SimEvent[] = [];
    chopToEnd(sim, a, events);
    expect(sim.entities.get(b)?.castingAbility).toBeNull();
    expect(
      events.some(
        (e) => e.type === 'error' && e.pid === b && e.text === 'The tree is already felled.',
      ),
    ).toBe(true);
    expect(events.filter((e) => e.type === 'treeFelled')).toHaveLength(1);
  });

  it('a tier-2 tree asks for an axe of that tier', () => {
    const sim = makeWorld();
    despawnMobs(sim);
    const pid = sim.addPlayer('warrior', 'Novice');
    const tree = findTree(SEED, 'mirefen_marsh', 2);
    placeBy(sim, pid, tree);
    const events: SimEvent[] = [];
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, pid)).toBe(false);
    events.push(...sim.tick());
    expect(events.find((e) => e.type === 'gatherDenied')).toMatchObject({
      professionId: 'logging',
      requiredTier: 2,
    });
    // A wieldable felling axe opens it.
    const meta = sim.players.get(pid);
    if (meta) meta.gatheringProficiency.logging = 100;
    sim.addItem('felling_axe', 1, pid);
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, pid)).toBe(true);
  });

  it('is deterministic: the same commands on the same seed replay the same world', () => {
    const run = () => {
      const sim = makeWorld(7);
      despawnMobs(sim);
      const pid = sim.addPlayer('warrior', 'Replay');
      sim.gatheringProficiencyFor(pid);
      const tree = findTree(7, 'eastbrook_vale', 1);
      placeBy(sim, pid, tree);
      const events: SimEvent[] = [];
      sim.harvestNode(treeNodeId(tree.id), undefined, pid);
      chopToEnd(sim, pid, events);
      clearFelledTreeBodies();
      return JSON.stringify({
        events: events.filter((e) => e.type === 'treeFelled' || e.type === 'gatherResult'),
        rng: sim.rng.next(),
      });
    };
    expect(run()).toBe(run());
  });
});

describe('the wood stands are retired', () => {
  it('no wood node remains, and the retired sites keep the shipped order', () => {
    expect(GATHER_NODES.some((n) => n.type === 'wood')).toBe(false);
    expect(RETIRED_WOOD_NODE_SITES).toHaveLength(52);
    expect(GATHER_NODE_SITES_AS_SHIPPED).toHaveLength(GATHER_NODES.length + 52);
  });
});
