// The tree Chop prompt (src/game/chop_prompt_core.ts + the painter and the
// composition under src/ui/hud/professions/): the chip names exactly the tree
// the interact press would start chopping, it follows the press's own
// priority, it never stands over a felled or a town tree, it hides in every
// refusal state, and it anchors through the shared world_prompt_anchor_core.

import { afterEach, describe, expect, it } from 'vitest';
import {
  CHOP_PROMPT_LIFT,
  type ChopPromptTarget,
  type ChopPromptWorld,
  chopPromptPlayerBlocked,
  resolveChopPromptTarget,
} from '../src/game/chop_prompt_core';
import { interactKeyNodes } from '../src/game/interact_key_gather';
import { ZONES } from '../src/sim/data';
import { TURNKEY_CAGED } from '../src/sim/encounters/sunken_bastion/ids';
import { Sim } from '../src/sim/sim';
import { clearFelledTreeBodies } from '../src/sim/trees/tree_fell_collision';
import {
  choppableTreesNear,
  treeAnchorId,
  treeInSettlement,
  treeNodeId,
} from '../src/sim/trees/tree_registry';
import {
  type Entity,
  INTERACT_RANGE,
  type QuestProgress,
  TREE_CHOP_CAST_ID,
} from '../src/sim/types';
import { generateDecorationsInBounds, groundHeight } from '../src/sim/world';
import { CHOP_PROMPT_TOP_CLEARANCE_PX } from '../src/ui/hud/professions/chop_prompt_painter';
import { type WorldPromptAnchor, worldPromptAnchor } from '../src/ui/world_prompt_anchor_core';
import type { IWorld } from '../src/world_api';

const SEED = 42;
// A standing tier-1 Eastbrook tree (the interact_key_gather fixture's pick).
const TREE = choppableTreesNear(SEED, -62, 8, 40)[0];
const TREE_NODE = treeNodeId(TREE.id);

function entity(overrides: Partial<Entity> & Pick<Entity, 'id' | 'kind'>): Entity {
  return {
    templateId: 'test',
    name: 'Test',
    pos: { x: 0, y: 0, z: 0 },
    dead: false,
    ghost: false,
    lootable: false,
    loot: null,
    harvestClaimedBy: null,
    dungeonId: null,
    inCombat: false,
    castingAbility: null,
    eating: null,
    drinking: null,
    auras: [],
    ...overrides,
  } as Entity;
}

interface Fixture {
  world: ChopPromptWorld & Pick<IWorld, 'felledTrees'>;
  player: Entity;
}

function standingBy(
  x: number,
  z: number,
  opts: { others?: Entity[]; felled?: number[]; player?: Partial<Entity> } = {},
): Fixture {
  const player = entity({
    id: 1,
    kind: 'player',
    pos: { x, y: groundHeight(x, z, SEED), z },
    ...opts.player,
  });
  const felled = new Map((opts.felled ?? []).map((id) => [id, { regrowAt: 999 }]));
  const world = {
    player,
    playerId: 1,
    cfg: { seed: SEED },
    entities: new Map<number, Entity>([
      [1, player],
      ...(opts.others ?? []).map((e): [number, Entity] => [e.id, e]),
    ]),
    questLog: new Map<string, QuestProgress>(),
    farmPatches: [],
    felledTrees: () => ({ rev: felled.size, trees: felled }),
    nodeHarvestableByMe: (id: string) => !(id === TREE_NODE && felled.has(TREE.id)),
  } as unknown as Fixture['world'];
  return { world, player };
}

/** Beside the trunk, well inside interact reach. */
const besideTree = (opts?: Parameters<typeof standingBy>[2]) =>
  standingBy(TREE.x, TREE.z - 1.5, opts);

function resolve(f: Fixture): ChopPromptTarget | null {
  const out: ChopPromptTarget = { nodeId: '', x: 0, y: 0, z: 0 };
  return resolveChopPromptTarget(f.world, interactKeyNodes(f.world as unknown as IWorld), out)
    ? out
    : null;
}

describe('resolveChopPromptTarget: the tree the press would chop', () => {
  it('names the standing tree in reach and anchors above its trunk', () => {
    const target = resolve(besideTree());
    expect(target?.nodeId).toBe(TREE_NODE);
    expect(target?.x).toBe(TREE.x);
    expect(target?.z).toBe(TREE.z);
    // A fixed lift above the terrain at the trunk, not above the player.
    expect(target?.y).toBeCloseTo(groundHeight(TREE.x, TREE.z, SEED) + CHOP_PROMPT_LIFT);
  });

  it('offers no chip with no axe in the logging tool slot, and one with an axe there', () => {
    const bare = besideTree();
    (bare.world as { gatherToolSlots?: unknown }).gatherToolSlots = {};
    expect(resolve(bare)).toBeNull();
    const armed = besideTree();
    (armed.world as { gatherToolSlots?: unknown }).gatherToolSlots = {
      logging: { itemId: 'handaxe', count: 1 },
    };
    expect(resolve(armed)?.nodeId).toBe(TREE_NODE);
  });

  it('shows nothing out of reach', () => {
    expect(resolve(standingBy(TREE.x, TREE.z - (INTERACT_RANGE + 3)))?.nodeId).not.toBe(TREE_NODE);
  });

  it('never stands over a felled tree, from the node list or the readiness read', () => {
    expect(resolve(besideTree({ felled: [TREE.id] }))?.nodeId).not.toBe(TREE_NODE);
    // A stale node list that still holds the tree: the per-viewer read wins.
    const f = besideTree({ felled: [TREE.id] });
    const out: ChopPromptTarget = { nodeId: '', x: 0, y: 0, z: 0 };
    expect(resolveChopPromptTarget(f.world, [TREE.node], out)).toBe(false);
  });

  it('never stands over a town tree', () => {
    const hub = ZONES[0].hub;
    const r = hub.radius + 20;
    const town = generateDecorationsInBounds(SEED, {
      minX: hub.x - r,
      maxX: hub.x + r,
      minZ: hub.z - r,
      maxZ: hub.z + r,
    }).find((d) => d.kind !== 'rock' && !d.farOnly && treeInSettlement(d.x, d.z));
    expect(town, 'the hub has a scatter tree inside its settlement clearance').toBeDefined();
    if (!town) return;
    const f = standingBy(town.x, town.z - 1);
    const ids = interactKeyNodes(f.world as unknown as IWorld).map((n) => n.id);
    // The press list never carries it, so neither the press nor the chip can.
    expect(ids).not.toContain(treeNodeId(treeAnchorId(town.x, town.z)));
    const target = resolve(f);
    if (target) expect([target.x, target.z]).not.toEqual([town.x, town.z]);
  });
});

describe('resolveChopPromptTarget: the press priority', () => {
  it('an npc in range wins, as it wins the press', () => {
    const npc = entity({
      id: 7,
      kind: 'npc',
      templateId: 'elder_maren',
      pos: { x: TREE.x + 1, y: 0, z: TREE.z - 1.5 },
    });
    expect(resolve(besideTree({ others: [npc] }))).toBeNull();
  });

  it('a corpse with loot for me wins, as it wins the press', () => {
    const corpse = entity({
      id: 8,
      kind: 'mob',
      dead: true,
      lootable: true,
      loot: { copper: 5, items: [] } as unknown as Entity['loot'],
      pos: { x: TREE.x - 1, y: 0, z: TREE.z - 1.5 },
    });
    // Whatever arm the press takes here, the chip agrees: a corpse arm means
    // no chip, and only a node arm may name the tree.
    const target = resolve(besideTree({ others: [corpse] }));
    expect(target).toBeNull();
  });
});

describe('resolveChopPromptTarget: refusal states', () => {
  const cases: Array<[string, Partial<Entity>]> = [
    ['dead', { dead: true }],
    ['in combat', { inCombat: true }],
    ['chopping (the chop is a cast)', { castingAbility: TREE_CHOP_CAST_ID }],
    ['casting anything', { castingAbility: 'fireball' }],
    ['drinking', { drinking: {} as Entity['drinking'] }],
    [
      'shapeshifted into an action-locked form',
      {
        auras: [{ id: 'bear', kind: 'form_bear' }] as unknown as Entity['auras'],
      },
    ],
    [
      'caged by the Gaol Turnkey',
      {
        auras: [{ id: TURNKEY_CAGED, kind: 'stun' }] as unknown as Entity['auras'],
      },
    ],
  ];
  for (const [name, player] of cases) {
    it(`hides while ${name}`, () => {
      const f = besideTree({ player });
      expect(chopPromptPlayerBlocked(f.player)).toBe(true);
      expect(resolve(f)).toBeNull();
    });
  }

  it('shows again once the state clears (the cheap gate is per frame)', () => {
    const f = besideTree();
    expect(chopPromptPlayerBlocked(f.player)).toBe(false);
    f.player.castingAbility = TREE_CHOP_CAST_ID;
    expect(chopPromptPlayerBlocked(f.player)).toBe(true);
    f.player.castingAbility = null;
    expect(resolve(f)?.nodeId).toBe(TREE_NODE);
  });
});

describe('the chip anchor through world_prompt_anchor_core', () => {
  const viewport = { width: 1600, height: 900 };
  it('divides the projected point by the UI Scale and hides behind the camera', () => {
    const out: WorldPromptAnchor = { left: -1, top: -1 };
    for (const scale of [0.8, 1, 1.25, 1.5]) {
      expect(
        worldPromptAnchor(
          { x: 800, y: 300, behind: false },
          viewport,
          scale,
          CHOP_PROMPT_TOP_CLEARANCE_PX,
          out,
        ),
      ).toBe(true);
      expect(out.left).toBeCloseTo(800 / scale, 0);
      expect(out.top).toBeCloseTo(300 / scale, 0);
    }
    expect(worldPromptAnchor({ x: 800, y: 300, behind: true }, viewport, 1, 40, out)).toBe(false);
    // Too near the top edge: no room for the chip to draw upward.
    expect(
      worldPromptAnchor(
        { x: 800, y: CHOP_PROMPT_TOP_CLEARANCE_PX - 1, behind: false },
        viewport,
        1,
        CHOP_PROMPT_TOP_CLEARANCE_PX,
        out,
      ),
    ).toBe(false);
  });
});

describe('against the live Sim (the press, the cast and the fell, end to end)', () => {
  afterEach(() => clearFelledTreeBodies());

  it('names the tree, hides through the chop, and never returns over the stump', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior' });
    for (const e of sim.entities.values()) {
      if (e.kind !== 'mob') continue;
      e.dead = true;
      e.hp = 0;
      e.aiState = 'dead';
      e.respawnTimer = 1e9;
      e.corpseTimer = 1e9;
      e.inCombat = false;
    }
    const p = sim.player;
    p.pos.x = TREE.x;
    p.pos.z = TREE.z - 1.5;
    p.pos.y = groundHeight(p.pos.x, p.pos.z, SEED);
    p.prevPos = { ...p.pos };
    const resolveLive = () => {
      const out: ChopPromptTarget = { nodeId: '', x: 0, y: 0, z: 0 };
      return resolveChopPromptTarget(sim, interactKeyNodes(sim), out) ? out : null;
    };
    expect(resolveLive()?.nodeId).toBe(TREE_NODE);
    // The press the chip promised starts the chop on exactly that node.
    expect(sim.harvestNode(TREE_NODE)).toBe(true);
    expect(chopPromptPlayerBlocked(p)).toBe(true);
    expect(resolveLive()).toBeNull();
    for (let i = 0; i < 20 * 30 && p.castingAbility; i++) sim.tick();
    sim.tick();
    expect(sim.felledTrees().trees.has(TREE.id)).toBe(true);
    expect(resolveLive()?.nodeId).not.toBe(TREE_NODE);
  });
});
