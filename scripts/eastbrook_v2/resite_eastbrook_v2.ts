// Eastbrook Vale v2 resite: after the import (import_eastbrook_v2.ts) has laid the
// design's ground and solids into the sim, stand Eastbrook's content on it.
//
//   npx tsx scripts/eastbrook_v2/resite_eastbrook_v2.ts           (write)
//   npx tsx scripts/eastbrook_v2/resite_eastbrook_v2.ts --check   (exit 1 if stale)
//
// Reads data/eastbrook_v2/sites_config.json and the live sim (terrain, colliders,
// content), writes src/sim/eastbrook_v2/sites.generated.ts. Every search is a fixed
// spiral from the target outward, so a re-run on the same inputs writes the same file.
// Run it after every import; tests/eastbrook_v2_world.test.ts fails while any site is
// invalid on the current design.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { campSpawnOffset } from '../../src/sim/camp_scatter';
import { type Collider, rotY } from '../../src/sim/collider_shapes';
import { bankerChestSpots, isBlocked, queryOpenWorldColliders } from '../../src/sim/colliders';
import { HOUSE_LOTS } from '../../src/sim/content/house_lots';
import {
  CAMPS,
  GATHER_NODES,
  GROUND_OBJECTS,
  getActiveWorldContent,
  MOBS,
  NPCS,
  ZONES,
  zoneAt,
} from '../../src/sim/data';
import { EASTBROOK_LAYOUT } from '../../src/sim/eastbrook_layout';
import {
  ebv2Colliders,
  ebv2Nodes,
  ebv2Point,
  ebv2RoadClearance,
  ebv2Weight,
} from '../../src/sim/eastbrook_v2';
import { EBV2_FIELD_GRID } from '../../src/sim/eastbrook_v2/field.generated';
import { EBV2_COLLIDERS } from '../../src/sim/eastbrook_v2/layout.generated';
import { EBV2_SITE_LOG, ebv2Site } from '../../src/sim/eastbrook_v2/sites';
import { MAX_AGGRO_RADIUS } from '../../src/sim/mob/aggro_ranges';
import { PLAYER_MAX_CLIMB_SLOPE } from '../../src/sim/pathfind';
import { INTERACT_RANGE } from '../../src/sim/types';
import {
  groundHeight,
  roadDistance,
  terrainSteepness,
  WATER_LEVEL,
  waterLevelAt,
} from '../../src/sim/world';
import { WORLD_SEED as S } from '../../src/sim/world_seed';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'sim', 'eastbrook_v2', 'sites.generated.ts');
const cfg = JSON.parse(
  readFileSync(join(ROOT, 'data', 'eastbrook_v2', 'sites_config.json'), 'utf8'),
) as {
  exact: string[];
  anchors: Record<string, string>;
  lots: Record<string, string>;
  nodes: Record<string, 'ore' | 'herb' | 'berry'>;
  objectGroups: (
    | { building: string; point: string; items: string[] }
    | { from: P; to: P; items: string[]; building?: undefined }
  )[];
  campFollowers: Record<string, string>;
  searchRadius: Record<'npc' | 'object' | 'camp' | 'station' | 'service' | 'node', number>;
  npcSpacing: number;
  boardClearance: number;
  hubSafeMargin: number;
  outskirtClearance: number;
};

type P = { x: number; z: number };
interface Site {
  x: number;
  z: number;
  fromX?: number;
  fromZ?: number;
  lx?: number;
  lz?: number;
}
const sites: Record<string, Site> = {};
const r2 = (v: number) => Math.round(v * 100) / 100;
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);
const inVale = (x: number, z: number) => zoneAt(x, z)?.id === 'eastbrook_vale';

// A town service's own body (the Ravenpost pillar on each mailbox row, the banker's
// strongbox on each resolved chest spot; eastbrook_v2/colliders.ts isServiceBody)
// stands where the CURRENT sites put its service, and moves with it. A search that
// saw those bodies would chase its own last answer (the mailbox stepping off its own
// pillar, then back, every run) and never converge, so every search here looks
// through them; the mailbox front is held clear of the pillar at the mailbox's NEW
// site instead (step 1).
const serviceAt = new Set<string>([
  ...(getActiveWorldContent().services?.mailboxes ?? []).map((m) => `${m.x},${m.z}`),
  ...bankerChestSpots(S).map((c) => `${c.x},${c.z}`),
]);
const isServiceBody = (c: Collider) => c.type === 'obb' && serviceAt.has(`${c.x},${c.z}`);
function overlaps(c: Collider, x: number, z: number, r: number): boolean {
  if (c.type === 'circle') return Math.hypot(x - c.x, z - c.z) < c.r + r;
  if (c.type === 'obb') {
    const l = rotY(x - c.x, z - c.z, -c.rot);
    return Math.hypot(Math.max(Math.abs(l.x) - c.hw, 0), Math.max(Math.abs(l.z) - c.hd, 0)) < r;
  }
  return true;
}
/** isBlocked, looking through service bodies: only when a service body overlaps the
 *  spot is the verdict re-judged on the other colliders alone. */
function blocked(x: number, z: number, r: number): boolean {
  if (!isBlocked(S, x, z, r)) return false;
  const near = queryOpenWorldColliders(S, x - r - 1, z - r - 1, x + r + 1, z + r + 1, []);
  if (!near.some((c) => isServiceBody(c) && overlaps(c, x, z, r))) return true;
  return near.some((c) => !isServiceBody(c) && overlaps(c, x, z, r));
}

function standable(x: number, z: number, r: number, maxSlope = 0.55): boolean {
  if (!inVale(x, z)) return false;
  const h = groundHeight(x, z, S);
  if (h < WATER_LEVEL + 0.5) return false;
  const w = waterLevelAt(x, z, S);
  if (w !== -Infinity && h < w + 0.5) return false;
  if (terrainSteepness(x, z, S) > maxSlope) return false;
  return !blocked(x, z, r);
}

// Distance to the nearest of the design's own solids, low obstacles included (the
// live collider list lets a walker step onto a crate; nothing should stand IN one).
const designSolids = ebv2Colliders((x, z) => groundHeight(x, z, S));
function designClearance(p: P): number {
  let best = Number.POSITIVE_INFINITY;
  for (const c of designSolids) {
    if (c.type === 'circle') {
      best = Math.min(best, Math.hypot(p.x - c.x, p.z - c.z) - c.r);
    } else if (c.type === 'obb') {
      const l = rotY(p.x - c.x, p.z - c.z, -c.rot);
      best = Math.min(
        best,
        Math.hypot(Math.max(Math.abs(l.x) - c.hw, 0), Math.max(Math.abs(l.z) - c.hd, 0)),
      );
    }
  }
  return best;
}

/** The first spot on a fixed spiral round `t` (rings 0.5 yd apart, from `minD`)
 *  that is standable and passes `extra`; null when none within `maxD`. */
function spiral(
  t: P,
  maxD: number,
  r: number,
  extra: (p: P) => boolean = () => true,
  minD = 0,
): P | null {
  for (let d = minD; d <= maxD + 1e-9; d += 0.5) {
    const n = d === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * d) / 0.5));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const p = { x: r2(t.x + Math.sin(a) * d), z: r2(t.z + Math.cos(a) * d) };
      if (standable(p.x, p.z, r) && extra(p)) return p;
    }
  }
  return null;
}

const problems: string[] = [];
function need(key: string, p: P | null): P {
  if (!p) {
    problems.push(`no valid site for ${key}`);
    return { x: 0, z: 0 };
  }
  return p;
}
const original = (key: string, current: P): P => {
  const s = ebv2Site(key);
  return s?.fromX !== undefined && s.fromZ !== undefined ? { x: s.fromX, z: s.fromZ } : current;
};
/** The authored spot of a table row that may already stand on its site: the load
 *  log names the move by its authored key, so match on the key's kind prefix
 *  (`npc:<id>`, `camp:<mobId>@`, `obj:<itemId>@`) and the spot it moved to. */
const fromLog = (prefix: string, current: P): P =>
  EBV2_SITE_LOG.find(
    (e) => e.key.startsWith(prefix) && e.to.x === current.x && e.to.z === current.z,
  )?.from ?? current;

// 1. Services.
const svcCurrent: Record<string, P> = {
  'svc:playerStart': EASTBROOK_LAYOUT.services.playerStart.position,
  'svc:mailbox': EASTBROOK_LAYOUT.services.mailbox.position,
  'svc:noticeboard': EASTBROOK_LAYOUT.services.noticeboard.position,
  'svc:graveyard': EASTBROOK_LAYOUT.services.graveyard.position,
};
for (const key of Object.keys(svcCurrent)) {
  const pt = ebv2Point(cfg.anchors[key]);
  const from = original(key, svcCurrent[key]);
  const at = cfg.exact.includes(key)
    ? { x: pt.x, z: pt.z }
    : need(key, spiral(pt, cfg.searchRadius.service, 0.8));
  sites[key] = { x: at.x, z: at.z, fromX: from.x, fromZ: from.z };
}
const board = sites['svc:noticeboard'];
sites['svc:noticeboardFront'] = need(
  'svc:noticeboardFront',
  spiral(board, 4, 0.5, () => true, 1.5),
);
const mailbox = sites['svc:mailbox'];
// the pillar as the live list has it at the current site, stood at the new one
const mailboxNow = svcCurrent['svc:mailbox'];
const pillar = queryOpenWorldColliders(
  S,
  mailboxNow.x - 1,
  mailboxNow.z - 1,
  mailboxNow.x + 1,
  mailboxNow.z + 1,
  [],
).find((c) => isServiceBody(c) && c.x === mailboxNow.x && c.z === mailboxNow.z);
const clearOfPillar = (q: P) =>
  !pillar || !overlaps({ ...pillar, x: mailbox.x, z: mailbox.z }, q.x, q.z, 0.5);
sites['svc:mailboxFront'] = need('svc:mailboxFront', spiral(mailbox, 4, 0.5, clearOfPillar, 1.1));
const boardSpots: P[] = [board, sites['svc:noticeboardFront'], mailbox, sites['svc:mailboxFront']];

// 2. Stations.
for (const st of EASTBROOK_LAYOUT.services.stations) {
  const key = `station:${st.id}`;
  const anchor = cfg.anchors[key];
  if (!anchor) continue;
  const from = original(key, st.position);
  const at = need(key, spiral(ebv2Point(anchor), cfg.searchRadius.station, 0.5));
  sites[key] = { x: at.x, z: at.z, fromX: from.x, fromZ: from.z };
}

// 3. NPCs: anchored first (config order), then every other placed vale NPC by id.
const placed: P[] = [];
// an NPC body (0.5 yd) stands clear of every design road lane, and off every
// station's working spot (a master stands beside their bench, never on it)
const stationSpots = Object.keys(sites)
  .filter((k) => k.startsWith('station:'))
  .map((k) => sites[k]);
const npcOk = (p: P) =>
  ebv2RoadClearance(p.x, p.z) >= 0.6 &&
  designClearance(p) >= 0.6 &&
  stationSpots.every((q) => dist(p, q) >= 1.2) &&
  placed.every((q) => dist(p, q) >= cfg.npcSpacing) &&
  boardSpots.every((q) => dist(p, q) >= cfg.boardClearance);
const anchoredNpcs = Object.keys(cfg.anchors).filter((k) => k.startsWith('npc:'));
for (const key of anchoredNpcs) {
  const id = key.slice(4);
  const npc = NPCS[id];
  if (!npc) {
    problems.push(`anchor for unknown NPC ${id}`);
    continue;
  }
  const from = original(key, fromLog(key, npc.pos));
  const at = need(key, spiral(ebv2Point(cfg.anchors[key]), cfg.searchRadius.npc, 0.6, npcOk, 1.2));
  placed.push(at);
  sites[key] = { x: at.x, z: at.z, fromX: from.x, fromZ: from.z };
}
for (const npc of Object.values(NPCS).sort((a, b) => (a.id < b.id ? -1 : 1))) {
  const key = `npc:${npc.id}`;
  if (cfg.anchors[key] || npc.dynamic) continue;
  const from = original(key, fromLog(key, npc.pos));
  if ((from.x === 0 && from.z === 0) || !inVale(from.x, from.z)) continue;
  if (ebv2Weight(from.x, from.z) < 0.5) {
    placed.push(from); // shipped ground: stays as authored, and camps keep clear of it
    continue;
  }
  if (standable(from.x, from.z, 0.6) && npcOk(from)) {
    placed.push(from);
    continue;
  }
  const at = need(key, spiral(from, cfg.searchRadius.npc, 0.6, npcOk));
  placed.push(at);
  sites[key] = { x: at.x, z: at.z, fromX: from.x, fromZ: from.z };
}

// 4. Lots: the design's front door, and a 3 yd step out of it away from the
// house (the nearest design box), turned until the step lands on clear ground.
const lotDoors: P[] = [];
for (const lot of HOUSE_LOTS) {
  const pointId = cfg.lots[lot.id];
  if (!pointId) continue;
  const key = `lot:${lot.id}`;
  const pt = ebv2Point(pointId);
  const door = need(key, spiral(pt, 3, 0.4));
  let nearest = EBV2_COLLIDERS[0];
  for (const c of EBV2_COLLIDERS)
    if (dist({ x: c[0], z: c[1] }, door) < dist({ x: nearest[0], z: nearest[1] }, door))
      nearest = c;
  const base = Math.atan2(door.x - nearest[0], door.z - nearest[1]);
  let step: P | null = null;
  for (let k = 0; k < 16 && !step; k++) {
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
    const p = { x: r2(Math.sin(a) * 3), z: r2(Math.cos(a) * 3) };
    if (standable(door.x + p.x, door.z + p.z, 0.5)) step = p;
  }
  const leave = need(`${key} step`, step);
  const from = original(key, lot.doorPos);
  lotDoors.push(door);
  sites[key] = { x: door.x, z: door.z, fromX: from.x, fromZ: from.z, lx: leave.x, lz: leave.z };
}

// 5. Gather nodes stand on the design's own nodes, in export order per kind, where
// the design owns the ground (a node in the edge band or a corridor would sit on
// shipped ground the client does not draw). A vein's own body is not ground, so
// only water and slope rule a design node out. Ids the design cannot fill keep
// their authored spot (tests/gather_node_placement.test.ts judges it).
// A node's harvest disc stays out of every named rare's and boss's scaled reach at
// the vale's entry level (tests/gather_node_placement.test.ts pins the deliberate
// dangers; the move onto the design must not add one).
const valeEntryLevel = ZONES.find((z) => z.id === 'eastbrook_vale')!.levelRange[0];
const copperDig = ZONES.find((z) => z.id === 'eastbrook_vale')!.pois.find(
  (p) => p.id === 'copper_dig',
)!;
const namedCamps = CAMPS.filter(
  (c) => MOBS[c.mobId]?.rare === true || MOBS[c.mobId]?.boss === true,
);
const coolOfNamed = (p: P) =>
  namedCamps.every((c) => {
    const m = MOBS[c.mobId];
    const aggro = Math.max(
      4,
      Math.min(MAX_AGGRO_RADIUS, m.aggroRadius + (m.maxLevel - valeEntryLevel) * 1.5),
    );
    return dist(p, c.center) - c.radius - aggro - INTERACT_RANGE >= 1;
  });
// ...and 5 yd off the server's road network (the decoration screen; the road band
// holds only recorded exemptions, tests/gather_node_placement.test.ts).
const offRoad = (p: P) => roadDistance(p.x, p.z) >= 5;
const designNodeOk = (n: P) => {
  if (ebv2Weight(n.x, n.z) < 0.9 || !coolOfNamed(n) || !offRoad(n)) return false;
  const h = groundHeight(n.x, n.z, S);
  const w = waterLevelAt(n.x, n.z, S);
  return (
    h >= WATER_LEVEL + 0.5 &&
    (w === -Infinity || h >= w + 0.5) &&
    terrainSteepness(n.x, n.z, S) <= 0.55
  );
};
const nodeQueues = {
  ore: ebv2Nodes('ore').filter(designNodeOk),
  herb: ebv2Nodes('herb').filter(designNodeOk),
  berry: ebv2Nodes('berry').filter(designNodeOk),
};
const unfilled: string[] = [];
for (const [id, kind] of Object.entries(cfg.nodes)) {
  const n = nodeQueues[kind].shift() ?? (kind === 'berry' ? nodeQueues.herb.shift() : undefined);
  if (n) sites[`node:${id}`] = { x: n.x, z: n.z };
  else unfilled.push(id);
}
if (unfilled.length)
  console.log(`kept authored spots (no design node on design ground): ${unfilled.join(', ')}`);

// 5b. Every other vale node on the design's ground (the Copper Dig veins keep their
// field round the landmark, see sites_config.json) keeps its authored spot while
// that spot is workable: dry, not too steep, and with room all round its body for a
// gatherer to stand clear of the design's solids, and NODE_SPACING from every other
// node (tests/gather_node_placement.test.ts: no two nodes share one harvest reach;
// tests/copper_dig_pathing.test.ts: a mob still threads the vein field). Otherwise
// it steps to the nearest workable spot (rings 0.5 yd apart). Clearance is
// measured against the design's own solids only: the live collider list holds
// every node's own body.
const NODE_ROOM = 1.8; // body (0.55) plus a gatherer's footing all round
const NODE_SPACING = 6.5; // two 0.55 yd bodies and a 5 yd mob lane between them
const nodeAt = new Map<string, P>();
const nodeFrom = new Map<string, P>();
for (const node of GATHER_NODES) {
  const s = sites[`node:${node.id}`];
  const authored = original(`node:${node.id}`, node.pos);
  nodeFrom.set(node.id, authored);
  nodeAt.set(node.id, s ? { x: s.x, z: s.z } : authored);
}
// refusal counts per reason for the node being searched (reported when none fits)
const why: Record<string, number> = {};
const no = (r: string) => {
  why[r] = (why[r] ?? 0) + 1;
  return false;
};
const nodeWorkable = (id: string, p: P) => {
  const h = groundHeight(p.x, p.z, S);
  const w = waterLevelAt(p.x, p.z, S);
  if (h < WATER_LEVEL + 0.5 || (w !== -Infinity && h < w + 0.5)) return no('water');
  // a quarter under the climb limit tests/gather_node_placement.test.ts holds every
  // node and its harvest reach to
  if (terrainSteepness(p.x, p.z, S) > PLAYER_MAX_CLIMB_SLOPE * 0.75) return no('slope');
  if (designClearance(p) < NODE_ROOM) return no('solid');
  if (!coolOfNamed(p) && coolOfNamed(nodeFrom.get(id) ?? p)) return no('named');
  if (!offRoad(p) && offRoad(nodeFrom.get(id) ?? p)) return no('road');
  // a Copper Dig vein stays in the dig field round its landmark
  // (tests/gather_nodes.test.ts holds every vale vein within 20 yd of it)
  if (
    id.startsWith('ore_eastbrook_') &&
    dist(p, copperDig) > Math.max(19.5, dist(nodeFrom.get(id) ?? p, copperDig))
  ) {
    return no('dig');
  }
  // never closer to a neighbour than NODE_SPACING, or than it was authored
  const from = nodeFrom.get(id) ?? p;
  for (const [other, q] of nodeAt) {
    if (other !== id && dist(p, q) < Math.min(NODE_SPACING, dist(from, nodeFrom.get(other) ?? q))) {
      return no('spacing');
    }
  }
  return true;
};
for (const node of GATHER_NODES) {
  const key = `node:${node.id}`;
  if (node.zoneId !== 'eastbrook_vale' || (cfg.nodes[node.id] && sites[key])) continue;
  const from = original(key, node.pos);
  if (ebv2Weight(from.x, from.z) < 0.5 || nodeWorkable(node.id, from)) continue;
  for (const k of Object.keys(why)) delete why[k];
  let at: P | null = null;
  for (let d = 0.5; d <= cfg.searchRadius.node + 1e-9 && !at; d += 0.5) {
    const n = Math.max(8, Math.round((2 * Math.PI * d) / 0.5));
    for (let k = 0; k < n && !at; k++) {
      const a = (k / n) * Math.PI * 2;
      const p = { x: r2(from.x + Math.sin(a) * d), z: r2(from.z + Math.cos(a) * d) };
      if (nodeWorkable(node.id, p)) at = p;
    }
  }
  // say why, so a re-import that strands a node is diagnosable from the log alone
  if (!at)
    problems.push(`${key} from ${from.x},${from.z}: candidates refused by ${JSON.stringify(why)}`);
  const to = need(key, at);
  nodeAt.set(node.id, to);
  sites[key] = { x: to.x, z: to.z, fromX: from.x, fromZ: from.z };
}

// 6. Quest and ground objects keep their spot when it is valid, else the nearest.
// A group that belongs to a building (the inn's pantry, the chapel's desk) moves
// with it: offset from the authored building onto the design point, then cleared.
const groupFor = new Map<string, P>();
for (const g of cfg.objectGroups) {
  // a group with no building moves by an explicit offset: the shipped spot it
  // gathered round to where it gathers now (the old quay's cargo to the cove dock)
  if (g.building === undefined) {
    for (const item of g.items) groupFor.set(item, { x: g.to.x - g.from.x, z: g.to.z - g.from.z });
    continue;
  }
  const b = EASTBROOK_LAYOUT.buildings.find((x) => x.id === g.building);
  if (!b) {
    problems.push(`object group names unknown building ${g.building}`);
    continue;
  }
  const to = ebv2Point(g.point);
  for (const item of g.items)
    groupFor.set(item, { x: to.x - b.position.x, z: to.z - b.position.z });
}
// An object never rests on (or in) one of the design's solids, low crates included: a
// pickup must lie on natural ground (tests/ground_object_placement.test.ts).
const objectClear = (p: P) => designClearance(p) >= 0.4;
// Run after the camps (step 7): an object that belongs to a camp (the stolen supply
// crates in the bandit camps, sites_config.json campFollowers) moves with it.
function siteObjects(campMoves: { mobId: string; from: P; to: P; radius: number }[]) {
  for (const o of GROUND_OBJECTS) {
    for (const p of o.positions) {
      const from = fromLog(`obj:${o.itemId}@`, { x: p.x, z: p.z });
      if (!inVale(from.x, from.z) || ebv2Weight(from.x, from.z) < 0.5) continue;
      const key = `obj:${o.itemId}@${from.x},${from.z}`;
      const followMob = cfg.campFollowers[o.itemId];
      const camp = followMob
        ? campMoves.find((m) => m.mobId === followMob && dist(m.from, from) <= m.radius + 2)
        : undefined;
      const shift = camp
        ? { x: camp.to.x - camp.from.x, z: camp.to.z - camp.from.z }
        : groupFor.get(o.itemId);
      if (shift) {
        const target = { x: r2(from.x + shift.x), z: r2(from.z + shift.z) };
        const at = spiral(target, cfg.searchRadius.object, 0.4, objectClear);
        // say where it was aiming, so a re-import that strands a moved object is
        // diagnosable from the log alone
        if (!at) problems.push(`${key} aimed at ${target.x},${target.z}`);
        sites[key] = need(key, at);
        continue;
      }
      if (standable(from.x, from.z, 0.4) && objectClear(from)) continue;
      sites[key] = need(key, spiral(from, cfg.searchRadius.object, 0.4, objectClear));
    }
  }
}

// 7. Camps: their whole spawn disc on usable ground, 60 yd beyond the town edge,
// 25 yd clear of every NPC and lot door. Anchored camps search from the design camp.
const hub = ZONES.find((z) => z.id === 'eastbrook_vale')!.hub;
const anchorsForCamps = [...placed, ...lotDoors];
// A camp levels the shipped ground in a disc of 1.8 radii round itself (the camp
// flatten in world.ts). Inside the design field that ground is overwritten, but a
// disc reaching past the slot edge would move a neighbour's ground: such a camp
// keeps its authored spot, and a moved camp keeps its whole disc inside the slot.
const FLATTEN = 1.8;
// the slot is the imported field's rect (data/eastbrook_v2/import_config.json clip)
const G = EBV2_FIELD_GRID;
const slotInset = (p: P) =>
  Math.min(p.x - G.x0, G.x0 + G.nx - 1 - p.x, p.z - G.z0, G.z0 + G.nz - 1 - p.z);
// Every vale camp as authored, and where this run has placed it so far (camps are
// placed in table order, each against the ones before it, so a re-run on the same
// inputs places them the same way): a moved camp keeps the separation
// tests/eastbrook_camp_spacing.test.ts asks of two camps (2 yd of clear ground
// between different families' discs; one family split in two may abut, 0.75 of
// the radii plus 8), or, where the authored pair was already closer, never closes
// on it further.
const campsNow = CAMPS.filter((c) => inVale(c.center.x, c.center.z)).map((c) => {
  const from = fromLog(`camp:${c.mobId}@`, c.center);
  return { c, from, at: { x: from.x, z: from.z } };
});
const separation = (a: { mobId: string; radius: number }, b: { mobId: string; radius: number }) =>
  a.mobId === b.mobId ? (a.radius + b.radius) * 0.75 + 8 : a.radius + b.radius + 2;
function campOk(c: { mobId: string; radius: number; count: number }, p: P, self?: P): boolean {
  if (self) {
    for (const o of campsNow) {
      if (o.from.x === self.x && o.from.z === self.z && o.c.mobId === c.mobId) continue;
      if (practice(o.c.mobId)) continue;
      const need = Math.min(separation(c, o.c), dist(self, o.from));
      if (dist(p, o.at) < need) return false;
    }
  }
  // camps stand on the design's own ground (the edge band and corridors are shipped)
  if (ebv2Weight(p.x, p.z) < 0.95) return false;
  if (slotInset(p) < c.radius * FLATTEN + 2) return false;
  if (dist(p, hub) - c.radius - hub.radius < cfg.hubSafeMargin) return false;
  if (anchorsForCamps.some((a) => dist(p, a) - c.radius < cfg.outskirtClearance)) return false;
  // every designed slot, plus a yard round it for the spawn jitter's usual draw
  // (tests/eastbrook_camp_spacing.test.ts probes the slots, camp_scatter.ts jitters)
  for (let i = 0; i < c.count; i++) {
    const o = campSpawnOffset(i, c.count, c.radius, 0, 0);
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (!standable(p.x + o.x + dx, p.z + o.z + dz, 0.5, 1.2)) return false;
    }
  }
  return true;
}
const practice = (id: string) => id.startsWith('training_') || id.includes('dummy');
for (const c of CAMPS) {
  const from = fromLog(`camp:${c.mobId}@`, c.center);
  if (!inVale(from.x, from.z) || practice(c.mobId)) continue;
  // only content on the design's ground moves; a disc that already reaches past
  // the slot edge stays where it shapes the neighbour's ground today
  if (ebv2Weight(from.x, from.z) < 0.5 || slotInset(from) < c.radius * FLATTEN) continue;
  const key = `camp:${c.mobId}@${from.x},${from.z}`;
  const anchor = cfg.anchors[key];
  const target = anchor ? ebv2Point(anchor) : from;
  if (!anchor && standable(from.x, from.z, 0.5) && campOk(c, from, from)) continue;
  // a camp keeps its bearing from the map origin (tests/eastbrook_camp_spacing.test.ts
  // holds the starter camps within 15 degrees of where they shipped)
  const bearingOk = (p: P) => {
    const d = Math.abs(Math.atan2(p.z, p.x) - Math.atan2(from.z, from.x)) * (180 / Math.PI);
    return Math.min(d, 360 - d) <= 14;
  };
  let at: P | null = null;
  for (let d = 0; d <= cfg.searchRadius.camp && !at; d += 2) {
    const n = d === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * d) / 2));
    for (let k = 0; k < n && !at; k++) {
      const a = (k / n) * Math.PI * 2;
      const p = {
        x: Math.round(target.x + Math.sin(a) * d),
        z: Math.round(target.z + Math.cos(a) * d),
      };
      if ((anchor || bearingOk(p)) && standable(p.x, p.z, 0.5) && campOk(c, p, from)) at = p;
    }
  }
  sites[key] = need(key, at);
  const self = campsNow.find(
    (o) => o.c.mobId === c.mobId && o.from.x === from.x && o.from.z === from.z,
  );
  if (self && at) self.at = { x: at.x, z: at.z };
}

// 6, run now that the camps stand: quest and ground objects.
siteObjects(
  campsNow
    .filter((o) => o.at.x !== o.from.x || o.at.z !== o.from.z)
    .map((o) => ({ mobId: o.c.mobId, from: o.from, to: o.at, radius: o.c.radius })),
);

// Write.
const keys = Object.keys(sites).sort();
const body = [
  '// GENERATED by scripts/eastbrook_v2/resite_eastbrook_v2.ts from data/eastbrook_v2/sites_config.json',
  '// and the live v2 design ground. Do not edit by hand: re-run the resite after every import.',
  '',
  'export interface Ebv2Site {',
  '  readonly x: number;',
  '  readonly z: number;',
  '  /** The authored spot this site replaced (npc, station, svc and lot keys). */',
  '  readonly fromX?: number;',
  '  readonly fromZ?: number;',
  "  /** A lot's step out of its door. */",
  '  readonly lx?: number;',
  '  readonly lz?: number;',
  '}',
  '',
  'export const EBV2_SITES: Readonly<Record<string, Ebv2Site>> = {',
  ...keys.map((k) => `  '${k}': ${JSON.stringify(sites[k])},`),
  '};',
  '',
].join('\n');

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
if (process.argv.includes('--check')) {
  const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === body;
  if (!same) console.error(`stale: ${OUT}`);
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT, body);
console.log(`${keys.length} sites written`);
