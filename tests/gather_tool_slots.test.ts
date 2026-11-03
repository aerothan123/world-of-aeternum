// The gathering tool belt (src/sim/professions/gather_tool_slots.ts and
// gather_tool_actions.ts): one slot per gathering profession, and a tool works
// only while it sits in its slot. Covers the pure leaf, the starter belt, the
// equip/unequip commands, the grant auto-fill, every gate that now reads the
// belt instead of the bags (nodes, trees including tier 1, fishing), the
// persistence round trip, the one-time migration of a pre-belt save, the quest
// re-grant arm, and determinism.

import { afterEach, describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { ITEMS, ZONES } from '../src/sim/data';
import { startFishing } from '../src/sim/professions/fishing';
import {
  gatherToolSlotFor,
  grantTakesToolSlot,
  loadGatherToolSlots,
  migrateLegacyGatherTools,
  ownedGatherTools,
  STARTER_GATHER_TOOL_IDS,
  savedGatherToolSlots,
  toolBelt,
} from '../src/sim/professions/gather_tool_slots';
import { playerHoldsQuestItem } from '../src/sim/quests/quest_item_presence';
import { type CharacterState, Sim } from '../src/sim/sim';
import { treeRequiredToolTier } from '../src/sim/trees/tree_chop';
import { clearFelledTreeBodies } from '../src/sim/trees/tree_fell_collision';
import { type ChoppableTree, choppableTreesNear, treeNodeId } from '../src/sim/trees/tree_registry';
import { type InvSlot, type SimEvent, TICK_RATE, TREE_CHOP_CAST_ID } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

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

function findTree(seed: number, zoneId: string, tier: number): ChoppableTree {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) throw new Error(`no zone ${zoneId}`);
  for (const tree of choppableTreesNear(seed, zone.hub.x, zone.hub.z, 400)) {
    if (tree.zoneId !== zoneId || tree.tier !== tier) continue;
    if (isBlocked(seed, tree.x, tree.z - 1.6, 0.4)) continue;
    return tree;
  }
  throw new Error(`no tier ${tier} tree in ${zoneId}`);
}

function placeBy(sim: Sim, pid: number, tree: ChoppableTree): void {
  const p = sim.entities.get(pid);
  if (!p) throw new Error('no entity');
  p.pos.x = tree.x;
  p.pos.z = tree.z - 1.6;
  p.pos.y = terrainHeight(p.pos.x, p.pos.z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

function meta(sim: Sim, pid: number) {
  const m = sim.players.get(pid);
  if (!m) throw new Error('no meta');
  return m;
}

function beltIds(sim: Sim, pid: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sim.gatherToolSlotsFor(pid))) if (v) out[k] = v.itemId;
  return out;
}

function bagCount(sim: Sim, pid: number, itemId: string): number {
  return sim.countItem(itemId, pid);
}

/** A save as written before the belt existed: the live save minus the key. */
function preBeltSave(sim: Sim, pid: number, inventory: InvSlot[]): CharacterState {
  const state = sim.serializeCharacter(pid);
  if (!state) throw new Error('no save');
  const { gatherTools: _dropped, ...legacy } = state;
  return { ...legacy, inventory };
}

describe('gather tool slots: the pure leaf', () => {
  it('maps every gathering tool to its profession slot, the simple pole to fishing', () => {
    expect(gatherToolSlotFor(ITEMS.copper_mining_pick)).toBe('mining');
    expect(gatherToolSlotFor(ITEMS.handaxe)).toBe('logging');
    expect(gatherToolSlotFor(ITEMS.felling_axe)).toBe('logging');
    expect(gatherToolSlotFor(ITEMS.gathering_sickle)).toBe('herbalism');
    expect(gatherToolSlotFor(ITEMS.simple_fishing_pole)).toBe('fishing');
    expect(gatherToolSlotFor(ITEMS.ironreel_fishing_rod)).toBe('fishing');
    expect(gatherToolSlotFor(ITEMS.garden_hoe)).toBe('farming');
    expect(gatherToolSlotFor(ITEMS.field_kit)).toBeNull();
    // Every shipped tool maps somewhere: no gatherTool item is left without a slot.
    for (const def of Object.values(ITEMS)) {
      if (def.use?.type === 'gatherTool') expect(gatherToolSlotFor(def)).toBe(def.use.professionId);
    }
  });

  it('the starter tools are real tier-1 tools of their own slot', () => {
    for (const [slot, id] of Object.entries(STARTER_GATHER_TOOL_IDS)) {
      const def = ITEMS[id as string];
      expect(gatherToolSlotFor(def)).toBe(slot);
      expect(def.use?.type === 'gatherTool' && def.use.tier).toBe(1);
    }
  });

  it('auto-fill takes an empty slot or a strictly better tool, never an equal or worse one', () => {
    expect(grantTakesToolSlot({}, ITEMS.copper_mining_pick, ITEMS)).toBe('mining');
    const belt = { mining: { itemId: 'iron_mining_pick', count: 1 } };
    expect(grantTakesToolSlot(belt, ITEMS.copper_mining_pick, ITEMS)).toBeNull();
    expect(grantTakesToolSlot(belt, ITEMS.iron_mining_pick, ITEMS)).toBeNull();
    expect(grantTakesToolSlot(belt, ITEMS.mithril_mining_pick, ITEMS)).toBe('mining');
    expect(grantTakesToolSlot(belt, ITEMS.field_kit, ITEMS)).toBeNull();
  });

  it('loads a belt row only into its own slot and hands every misfit back as a stray', () => {
    const { slots, strays } = loadGatherToolSlots(
      {
        mining: { itemId: 'iron_mining_pick', count: 7, slot: 3 },
        logging: { itemId: 'copper_mining_pick', count: 1 },
        herbalism: { itemId: 'no_such_item', count: 1 },
        fishing: 'junk',
      },
      ITEMS,
      () => {},
    );
    expect(slots).toEqual({ mining: { itemId: 'iron_mining_pick', count: 1 } });
    expect(strays).toEqual([{ itemId: 'copper_mining_pick', count: 1 }]);
    expect(loadGatherToolSlots('nope', ITEMS, () => {}).slots).toEqual({});
  });

  it('belt and ownership reads: the belt alone for access, bags plus belt for price', () => {
    const holder = {
      inventory: [{ itemId: 'iron_mining_pick', count: 1 }],
      gatherTools: { mining: { itemId: 'copper_mining_pick', count: 1 } },
    };
    expect(toolBelt(holder).map((s) => s.itemId)).toEqual(['copper_mining_pick']);
    expect(ownedGatherTools(holder).map((s) => s.itemId)).toEqual([
      'iron_mining_pick',
      'copper_mining_pick',
    ]);
    expect(toolBelt({})).toEqual([]);
  });

  it('migrates the best bagged tool per profession and grants the basic one where none', () => {
    const inventory: InvSlot[] = [
      { itemId: 'copper_mining_pick', count: 1 },
      { itemId: 'iron_mining_pick', count: 1 },
      { itemId: 'felling_axe', count: 1 },
      { itemId: 'simple_fishing_pole', count: 2 },
      { itemId: 'linen_cloth', count: 3 },
    ];
    const belt = migrateLegacyGatherTools(inventory, ITEMS);
    expect(Object.fromEntries(Object.entries(belt).map(([k, v]) => [k, v?.itemId]))).toEqual({
      mining: 'iron_mining_pick',
      logging: 'felling_axe',
      herbalism: 'gathering_sickle',
      fishing: 'simple_fishing_pole',
    });
    expect(inventory).toEqual([
      { itemId: 'copper_mining_pick', count: 1 },
      { itemId: 'simple_fishing_pole', count: 1 },
      { itemId: 'linen_cloth', count: 3 },
    ]);
  });
});

describe('gather tool slots: the sim', () => {
  it('a new character starts with the basic pick, axe and sickle equipped', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('mage', 'Fresh');
    expect(beltIds(sim, pid)).toEqual({
      mining: 'copper_mining_pick',
      logging: 'handaxe',
      herbalism: 'gathering_sickle',
    });
    // None of them is in the bags.
    expect(bagCount(sim, pid, 'handaxe')).toBe(0);
  });

  it('a tier-1 tree needs an EQUIPPED axe: a bagged one does not count', () => {
    expect(treeRequiredToolTier(1)).toBe(1);
    const sim = makeWorld();
    despawnMobs(sim);
    const pid = sim.addPlayer('warrior', 'Logger');
    const tree = findTree(SEED, 'eastbrook_vale', 1);
    placeBy(sim, pid, tree);
    expect(sim.unequipGatherTool('logging', pid)).toBe(true);
    expect(bagCount(sim, pid, 'handaxe')).toBe(1);
    const events: SimEvent[] = [];
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, pid)).toBe(false);
    events.push(...sim.tick());
    expect(events.find((e) => e.type === 'gatherDenied')).toMatchObject({
      surface: 'node',
      professionId: 'logging',
      requiredTier: 1,
    });
    // Using the bagged axe equips it; the chop then starts.
    sim.useItem('handaxe', pid);
    expect(beltIds(sim, pid).logging).toBe('handaxe');
    expect(bagCount(sim, pid, 'handaxe')).toBe(0);
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, pid)).toBe(true);
    expect(sim.entities.get(pid)?.castingAbility).toBe(TREE_CHOP_CAST_ID);
    // The belt is locked while the chop runs.
    const busy: SimEvent[] = [];
    expect(sim.unequipGatherTool('logging', pid)).toBe(false);
    busy.push(...sim.tick());
    expect(busy.some((e) => e.type === 'error' && e.text === 'You are busy.')).toBe(true);
  });

  it('a tier-2 tree reads the equipped axe tier, never a better axe in the bags', () => {
    const sim = makeWorld();
    despawnMobs(sim);
    const pid = sim.addPlayer('warrior', 'Climber');
    meta(sim, pid).gatheringProficiency.logging = 100;
    const tree = findTree(SEED, 'mirefen_marsh', 2);
    placeBy(sim, pid, tree);
    // The felling axe auto-equips over the handaxe (strictly better).
    sim.addItem('felling_axe', 1, pid);
    expect(beltIds(sim, pid).logging).toBe('felling_axe');
    expect(bagCount(sim, pid, 'handaxe')).toBe(1);
    // Swap the handaxe back in: the felling axe now sits in the bags and buys nothing.
    sim.equipItem('handaxe', pid);
    expect(beltIds(sim, pid).logging).toBe('handaxe');
    expect(bagCount(sim, pid, 'felling_axe')).toBe(1);
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, pid)).toBe(false);
    sim.equipItem('felling_axe', pid);
    expect(sim.harvestNode(treeNodeId(tree.id), undefined, pid)).toBe(true);
  });

  it('fishing needs a pole or rod in the fishing slot', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Angler');
    const m = meta(sim, pid);
    const p = sim.entities.get(pid);
    if (!p) throw new Error('no entity');
    const implementDenied = () => {
      const events: SimEvent[] = [];
      startFishing(sim.ctx, p, m);
      events.push(...sim.tick());
      return events.some((e) => e.type === 'gatherDenied' && e.surface === 'fishing');
    };
    expect(implementDenied()).toBe(true);
    // A granted pole fills the empty slot by itself.
    sim.addItem('simple_fishing_pole', 1, pid);
    expect(beltIds(sim, pid).fishing).toBe('simple_fishing_pole');
    expect(implementDenied()).toBe(false);
    // Back in the bags it no longer counts.
    expect(sim.unequipGatherTool('fishing', pid)).toBe(true);
    expect(implementDenied()).toBe(true);
  });

  it('refuses an unequip when the bags have no room, and keeps the tool', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Packrat');
    const m = meta(sim, pid);
    while (sim.canAddItem('linen_cloth', 1, pid))
      m.inventory.push({ itemId: 'apprentice_robe', count: 1 });
    const events: SimEvent[] = [];
    expect(sim.unequipGatherTool('mining', pid)).toBe(false);
    events.push(...sim.tick());
    expect(events.some((e) => e.type === 'error' && /bags are full/.test(e.text))).toBe(true);
    expect(beltIds(sim, pid).mining).toBe('copper_mining_pick');
  });

  it('equipping into an occupied slot trades places with the old tool in the same bag cell', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Swapper');
    const m = meta(sim, pid);
    sim.addItem('mithril_mining_pick', 1, pid);
    expect(beltIds(sim, pid).mining).toBe('mithril_mining_pick');
    const copper = m.inventory.findIndex((s) => s.itemId === 'copper_mining_pick');
    const before = m.inventory.length;
    sim.equipItem('copper_mining_pick', pid, undefined, copper);
    expect(beltIds(sim, pid).mining).toBe('copper_mining_pick');
    expect(m.inventory[copper].itemId).toBe('mithril_mining_pick');
    expect(m.inventory.length).toBe(before);
  });

  it('round-trips the belt through the save, and always writes the key', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Saver');
    sim.addItem('iron_mining_pick', 1, pid);
    sim.unequipGatherTool('herbalism', pid);
    const state = sim.serializeCharacter(pid);
    expect(state?.gatherTools).toEqual({
      mining: { itemId: 'iron_mining_pick', count: 1 },
      logging: { itemId: 'handaxe', count: 1 },
    });
    const sim2 = makeWorld();
    const pid2 = sim2.addPlayer('warrior', 'Saver', { state: state ?? undefined });
    expect(beltIds(sim2, pid2)).toEqual({ mining: 'iron_mining_pick', logging: 'handaxe' });
    // An emptied herbalism slot stays empty on reload (the key is present).
    expect(bagCount(sim2, pid2, 'gathering_sickle')).toBe(1);
    expect(savedGatherToolSlots(sim2.gatherToolSlotsFor(pid2))).toEqual(state?.gatherTools);
  });

  it('migrates a pre-belt save: best bagged tools move into the slots', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Veteran');
    const legacy = preBeltSave(sim, pid, [
      { itemId: 'copper_mining_pick', count: 1 },
      { itemId: 'mithril_mining_pick', count: 1 },
      { itemId: 'gathering_sickle', count: 1 },
      { itemId: 'garden_hoe', count: 1 },
    ]);
    const sim2 = makeWorld();
    const pid2 = sim2.addPlayer('warrior', 'Veteran', { state: legacy });
    expect(beltIds(sim2, pid2)).toEqual({
      mining: 'mithril_mining_pick',
      logging: 'handaxe',
      herbalism: 'gathering_sickle',
      farming: 'garden_hoe',
    });
    expect(bagCount(sim2, pid2, 'copper_mining_pick')).toBe(1);
    expect(bagCount(sim2, pid2, 'mithril_mining_pick')).toBe(0);
    expect(bagCount(sim2, pid2, 'gathering_sickle')).toBe(0);
    // After one save the key exists and the migration never runs again.
    const resaved = sim2.serializeCharacter(pid2);
    expect(resaved?.gatherTools).toBeDefined();
  });

  it('migrates a pre-belt save with no tools at all by granting the basic three', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Empty');
    const sim2 = makeWorld();
    const pid2 = sim2.addPlayer('warrior', 'Empty', { state: preBeltSave(sim, pid, []) });
    expect(beltIds(sim2, pid2)).toEqual({
      mining: 'copper_mining_pick',
      logging: 'handaxe',
      herbalism: 'gathering_sickle',
    });
    expect(toolBelt(meta(sim2, pid2)).length).toBe(3);
    expect(meta(sim2, pid2).inventory.some((s) => gatherToolSlotFor(ITEMS[s.itemId]))).toBe(false);
  });

  it('a belt row that no longer fits its slot goes back to the bags instead of vanishing', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Odd');
    const state = sim.serializeCharacter(pid);
    if (!state) throw new Error('no save');
    state.gatherTools = { herbalism: { itemId: 'handaxe', count: 1 } };
    const sim2 = makeWorld();
    const pid2 = sim2.addPlayer('warrior', 'Odd', { state: state });
    expect(beltIds(sim2, pid2)).toEqual({});
    expect(bagCount(sim2, pid2, 'handaxe')).toBe(1);
  });

  it('an equipped tool counts as held for the starter quests (no second copy)', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Quester');
    expect(playerHoldsQuestItem(sim.ctx, meta(sim, pid), 'copper_mining_pick')).toBe(true);
    expect(playerHoldsQuestItem(sim.ctx, meta(sim, pid), 'garden_hoe')).toBe(false);
  });

  it('is deterministic: the same commands replay the same belt and bags', () => {
    const run = () => {
      const sim = makeWorld(7);
      const pid = sim.addPlayer('warrior', 'Replay');
      sim.addItem('iron_mining_pick', 1, pid);
      sim.addItem('simple_fishing_pole', 1, pid);
      sim.unequipGatherTool('logging', pid);
      sim.useItem('handaxe', pid);
      for (let i = 0; i < TICK_RATE; i++) sim.tick();
      return (
        JSON.stringify(sim.serializeCharacter(pid)?.gatherTools) +
        JSON.stringify(meta(sim, pid).inventory)
      );
    };
    expect(run()).toBe(run());
  });
});
