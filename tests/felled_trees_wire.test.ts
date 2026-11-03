// Tree chopping over the live server (docs/design/tree-chopping.md): the `ftr`
// self key (server/felled_trees_wire.ts), the `treeFelled` world event's
// interest scoping, the ClientWorld mirror (src/net/felled_trees_wire.ts) and
// its collision-view publish, and a reconnecting client seeing current stumps.

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  setAccountWeaponSkinLoadout: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
}));

import { appendFelledTreesSelfWire, felledTreesCellJson } from '../server/felled_trees_wire';
import { GameServer } from '../server/game';
import { decodeFelledTreesWire, FelledTreeMirror } from '../src/net/felled_trees_wire';
import { isBlocked } from '../src/sim/colliders';
import { TREE_REGROW_SECONDS } from '../src/sim/content/tree_chopping';
import { ZONES } from '../src/sim/data';
import { clearFelledTreeBodies, isTreeBodyFelled } from '../src/sim/trees/tree_fell_collision';
import type { FelledTreesView } from '../src/sim/trees/tree_felling';
import {
  type ChoppableTree,
  choppableTreesNear,
  treeBodyKey,
  treeNodeId,
} from '../src/sim/trees/tree_registry';
import { type SimEvent, TICK_RATE } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';
import {
  bareClient,
  broadcast,
  type FakeClient,
  fakeWs,
  joinServer,
  lastSnap,
} from './helpers/bare_client';

afterEach(() => clearFelledTreeBodies());

function eastbrookTree(seed: number): ChoppableTree {
  const hub = ZONES.find((z) => z.id === 'eastbrook_vale')?.hub;
  if (!hub) throw new Error('no eastbrook hub');
  for (const tree of choppableTreesNear(seed, hub.x, hub.z, 400)) {
    if (tree.zoneId === 'eastbrook_vale' && !isBlocked(seed, tree.x, tree.z - 1.6, 0.4))
      return tree;
  }
  throw new Error('no eastbrook tree');
}

function moveTo(server: GameServer, pid: number, x: number, z: number): void {
  const e = server.sim.entities.get(pid);
  if (!e) throw new Error(`missing entity ${pid}`);
  e.pos = { x, y: terrainHeight(x, z, server.sim.cfg.seed), z };
  e.prevPos = { ...e.pos };
}

function deliveredEvents(fc: FakeClient): SimEvent[] {
  return fc.sent.filter((m) => m.t === 'events').flatMap((m) => m.list as SimEvent[]);
}

/** Tick the live server's sim, routing every event as the loop does. */
function step(server: GameServer, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    const events = server.sim.tick();
    // biome-ignore lint/suspicious/noExplicitAny: routeEvents is the server loop's private fan-out
    (server as any).routeEvents(events);
  }
}

function despawnMobs(server: GameServer): void {
  for (const e of server.sim.entities.values()) {
    if (e.kind !== 'mob') continue;
    e.dead = true;
    e.hp = 0;
    e.aiState = 'dead';
    e.respawnTimer = 1e9;
    e.corpseTimer = 1e9;
    e.inCombat = false;
  }
}

describe('ftr readout (server/felled_trees_wire.ts)', () => {
  const view = (rev: number, trees: [number, number, number, number][]): FelledTreesView => ({
    rev,
    trees: new Map(trees.map(([id, x, z, regrowAt]) => [id, { id, x, z, regrowAt }])),
  });

  it('carries the felled trees round the cell, sorted, with absolute regrow times', () => {
    const v = view(3, [
      [9, 10, 10, 312.34],
      [4, 20, 5, 400],
      [7, 5000, 5000, 350],
    ]);
    expect(felledTreesCellJson(v, 32768 * 65536 + 32768)).toBe('[[4,400],[9,312.3]]');
  });

  it('rebuilds only on a fell, a regrow, or a cell change, and re-sends only then', () => {
    let reads = 0;
    let current = view(1, [[1, 0, 0, 100]]);
    const sim = {
      felledTrees: () => {
        reads++;
        return current;
      },
    };
    const sends: string[] = [];
    const sent: Record<string, string> = {};
    const maybeSerialized = (key: string, s: string) => {
      if (sent[key] !== s) {
        sent[key] = s;
        sends.push(s);
      }
    };
    const session = {};
    for (let i = 0; i < 50; i++)
      appendFelledTreesSelfWire(sim, session, { x: 1, z: 1 }, maybeSerialized);
    expect(reads).toBe(50);
    expect(sends).toEqual(['[[1,100]]']);
    current = view(2, []);
    appendFelledTreesSelfWire(sim, session, { x: 1, z: 1 }, maybeSerialized);
    expect(sends).toEqual(['[[1,100]]', '[]']);
  });
});

describe('client mirror (src/net/felled_trees_wire.ts)', () => {
  it('decodes, drops malformed rows, and publishes the collision view', () => {
    expect(decodeFelledTreesWire([[1, 2], ['x', 3], [4], [-1, 5], [6, Number.NaN]])).toEqual([
      [1, 2],
    ]);
    const tree = eastbrookTree(WORLD_SEED);
    const mirror = new FelledTreeMirror(WORLD_SEED);
    mirror.apply([[tree.id, 400]], 100, { x: tree.x, z: tree.z });
    expect(mirror.view.trees.get(tree.id)).toMatchObject({ x: tree.x, z: tree.z, regrowAt: 400 });
    expect(isTreeBodyFelled(treeBodyKey(tree))).toBe(true);
    expect(mirror.standing(treeNodeId(tree.id))).toBe(false);
    expect(mirror.regrowSeconds(treeNodeId(tree.id))).toBe(300);
    // Inside coverage, dropping out of the list means it regrew.
    const rev = mirror.view.rev;
    mirror.apply([], 401, { x: tree.x, z: tree.z });
    expect(mirror.view.trees.size).toBe(0);
    expect(mirror.view.rev).toBe(rev + 1);
    expect(isTreeBodyFelled(treeBodyKey(tree))).toBe(false);
  });

  it('keeps a stump that left coverage until its own regrow time', () => {
    const tree = eastbrookTree(WORLD_SEED);
    const mirror = new FelledTreeMirror(WORLD_SEED);
    mirror.apply([[tree.id, 400]], 100, { x: tree.x, z: tree.z });
    mirror.apply([], 110, { x: tree.x + 1000, z: tree.z });
    expect(mirror.view.trees.has(tree.id)).toBe(true);
    mirror.apply(undefined, 401, { x: tree.x + 1000, z: tree.z });
    expect(mirror.view.trees.has(tree.id)).toBe(false);
  });
});

describe('tree chopping over the live server', () => {
  it('chopper and bystander see the fall and the stump; a far session does not; a reconnect sees stumps', () => {
    const server = new GameServer();
    despawnMobs(server);
    const fcA = fakeWs();
    const fcB = fakeWs();
    const fcC = fakeWs();
    const sa = joinServer(server, fcA, 71, 'Chopper');
    const sb = joinServer(server, fcB, 72, 'Watcher');
    const sc = joinServer(server, fcC, 73, 'Faraway');
    const tree = eastbrookTree(server.sim.cfg.seed);
    moveTo(server, sa.pid, tree.x, tree.z - 1.6);
    moveTo(server, sb.pid, tree.x + 8, tree.z - 6);
    moveTo(server, sc.pid, tree.x + 900, tree.z);
    step(server, 1);
    broadcast(server);
    for (const fc of [fcA, fcB, fcC]) fc.sent.length = 0;

    expect(server.sim.harvestNode(treeNodeId(tree.id), undefined, sa.pid)).toBe(true);
    const p = server.sim.entities.get(sa.pid);
    for (let i = 0; i < 10 * TICK_RATE && p?.castingAbility; i++) step(server, 1);
    step(server, 1);
    broadcast(server);

    const fallA = deliveredEvents(fcA).find((e) => e.type === 'treeFelled');
    const fallB = deliveredEvents(fcB).find((e) => e.type === 'treeFelled');
    expect(fallA).toMatchObject({ treeId: tree.id, fellerId: sa.pid });
    expect(fallB).toMatchObject({ treeId: tree.id, fellerId: sa.pid });
    expect(deliveredEvents(fcC).some((e) => e.type === 'treeFelled')).toBe(false);
    const snapB = lastSnap(fcB.sent);
    const rows = decodeFelledTreesWire(snapB.self.ftr);
    expect(rows.map((r) => r[0])).toEqual([tree.id]);
    expect(rows[0][1]).toBeGreaterThan(server.sim.time + TREE_REGROW_SECONDS - 2);
    const snapC = lastSnap(fcC.sent);
    expect(snapC.self.ftr === undefined || decodeFelledTreesWire(snapC.self.ftr).length === 0).toBe(
      true,
    );

    // A fresh (reconnecting) client applies its first snapshot and stands the
    // stump up at once, collision view included.
    clearFelledTreeBodies();
    const fcD = fakeWs();
    const fresh = joinServer(server, fcD, 74, 'Returner');
    moveTo(server, fresh.pid, tree.x + 5, tree.z + 5);
    step(server, 1);
    broadcast(server);
    const client = bareClient(fresh.pid);
    // biome-ignore lint/suspicious/noExplicitAny: applySnapshot is ClientWorld's private decode spine
    (client as any).applySnapshot(lastSnap(fcD.sent));
    expect(client.felledTrees().trees.has(tree.id)).toBe(true);
    expect(client.nodeHarvestableByMe(treeNodeId(tree.id))).toBe(false);
    expect(isTreeBodyFelled(treeBodyKey(tree))).toBe(true);
  });

  it('a bystander receives the chop castStart with the tree id', () => {
    const server = new GameServer();
    despawnMobs(server);
    const fcA = fakeWs();
    const fcB = fakeWs();
    const sa = joinServer(server, fcA, 81, 'Chopper');
    const sb = joinServer(server, fcB, 82, 'Watcher');
    const tree = eastbrookTree(server.sim.cfg.seed);
    moveTo(server, sa.pid, tree.x, tree.z - 1.6);
    moveTo(server, sb.pid, tree.x + 6, tree.z - 4);
    step(server, 1);
    fcB.sent.length = 0;
    expect(server.sim.harvestNode(treeNodeId(tree.id), undefined, sa.pid)).toBe(true);
    step(server, 1);
    broadcast(server);
    expect(
      deliveredEvents(fcB).some((e) => e.type === 'castStart' && e.chopTreeId === tree.id),
    ).toBe(true);
  });
});
