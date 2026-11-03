// The choppable-tree registry: which overworld scatter trees a player may fell,
// under which STABLE id, at which tier and level. Pure and host-agnostic (no
// SimContext, no rng, no clock): the offline Sim, the server's Sim and the
// online client all derive the same answer from the same deterministic
// decoration field (sim/world.ts generateDecorationsInBounds), so no tree
// placement ever rides the wire, only felled ids.
//
// THE ID: a tree's decoration-grid ANCHOR index. The scatter field evaluates
// one candidate per anchor on a fixed 10-yard lattice and jitters it by less
// than half a step, so the nearest lattice point to a tree IS its anchor and
// `xi * zCount + zi` names it uniquely, independent of load order, of how many
// rocks or trees were generated before it, and of the query window that found
// it. The lattice constants below restate world.ts's private DECORATION_* block;
// tests/tree_registry.test.ts pins the round trip (every tree in the shipped
// world maps to a unique id that resolves back to that same tree), so the two
// cannot drift silently.
//
// Lookups are LAZY and windowed, the collider build's own shape (colliders.ts
// collidersInCell): a by-id lookup evaluates the handful of anchors round one
// lattice point, a nearby query the anchors under its box. Results are memoized
// per (active world content, seed) behind an identity-keyed WeakMap, bounded by
// the world's tree count, and are byte-identical to the uncached derivation.

import {
  DEFAULT_TREE_TIER_WEIGHTS,
  PAINTED_TOWN_TREE_PAD,
  TOWN_TREE_CLEARANCE,
  TREE_FREE_ZONE_IDS,
  TREE_TIER_WEIGHTS_BY_ZONE,
  type TreeTierWeights,
} from '../content/tree_chopping';
import {
  getActiveWorldContent,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_Z,
  ZONES,
  zoneAt,
} from '../data';
import { paintedTownReachCovers } from '../decoration_exclusions';
import { hash2 } from '../rng';
import type { GatherNodeDef, ZoneDef } from '../types';
import { type Decoration, generateDecorationsInBounds } from '../world';

// The decoration lattice (world.ts DECORATION_STEP / _X_START / _Z_START /
// _Z_END), restated; see the header for the drift pin.
const STEP = 10;
const X_START = -(WORLD_MAX_X - 14);
const Z_START = WORLD_MIN_Z + 14;
const Z_COUNT = Math.max(0, Math.ceil((WORLD_MAX_Z - 14 - Z_START) / STEP));
/** Just over half a step: the anchor window always holds its own tree. */
const ANCHOR_REACH = STEP / 2 + 0.01;

/** The prefix a tree's gather-node id carries (`tree:<anchor id>`). */
export const TREE_NODE_ID_PREFIX = 'tree:';

/** One choppable tree: its decoration record plus the derived gathering facts. */
export interface ChoppableTree {
  /** Stable anchor id (see the header). */
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly kind: 'tree' | 'tree2';
  readonly scale: number;
  readonly variant: number;
  readonly zoneId: string;
  /** Access tier 1..3 (tier 1 needs no axe). */
  readonly tier: number;
  /** Content level for the profession-XP curve (zone levelRange midpoint, ceil). */
  readonly level: number;
  /** The gather-node view the shared gathering machinery runs on. */
  readonly node: GatherNodeDef;
}

/** The anchor id of a decoration at (x, z). */
export function treeAnchorId(x: number, z: number): number {
  const xi = Math.round((x - X_START) / STEP);
  const zi = Math.round((z - Z_START) / STEP);
  return xi * Z_COUNT + zi;
}

/** `tree:<id>` for a tree id. */
export function treeNodeId(id: number): string {
  return `${TREE_NODE_ID_PREFIX}${id}`;
}

/** The tree id inside a `tree:<id>` node id, or null for any other id. */
export function parseTreeNodeId(nodeId: string): number | null {
  if (!nodeId.startsWith(TREE_NODE_ID_PREFIX)) return null;
  const rest = nodeId.slice(TREE_NODE_ID_PREFIX.length);
  if (!/^\d{1,9}$/.test(rest)) return null;
  return Number(rest);
}

/** The collider body key colliders.ts files this tree's trunk under. */
export function treeBodyKey(tree: Pick<ChoppableTree, 'x' | 'z'>): string {
  return `${tree.x},${tree.z}`;
}

/** Pick a tier from a zone's weights by a stable hash of the tree id. */
export function treeTierFor(id: number, weights: TreeTierWeights): number {
  const total = weights[0] + weights[1] + weights[2];
  if (total <= 0) return 1;
  let roll = hash2(id, 7177, 0x7ee5) * total;
  for (let t = 0; t < 3; t++) {
    if (roll < weights[t]) return t + 1;
    roll -= weights[t];
  }
  return 1;
}

function zoneLevel(zone: ZoneDef): number {
  return Math.ceil((zone.levelRange[0] + zone.levelRange[1]) / 2);
}

/** Whether a tree at (x, z) stands inside a protected settlement area. */
export function treeInSettlement(x: number, z: number): boolean {
  const active = getActiveWorldContent().zones;
  for (const zone of active.length > 0 ? active : ZONES) {
    const limit = zone.hub.radius + TOWN_TREE_CLEARANCE;
    const dx = x - zone.hub.x;
    const dz = z - zone.hub.z;
    if (dx * dx + dz * dz < limit * limit) return true;
  }
  return paintedTownReachCovers(x, z, PAINTED_TOWN_TREE_PAD);
}

function buildTree(d: Decoration): ChoppableTree | null {
  if (d.kind === 'rock' || d.farOnly) return null;
  if (treeInSettlement(d.x, d.z)) return null;
  const id = treeAnchorId(d.x, d.z);
  const zone = zoneAt(d.x, d.z);
  if (TREE_FREE_ZONE_IDS.includes(zone.id)) return null;
  const tier = treeTierFor(id, TREE_TIER_WEIGHTS_BY_ZONE[zone.id] ?? DEFAULT_TREE_TIER_WEIGHTS);
  const level = zoneLevel(zone);
  const node: GatherNodeDef = Object.freeze({
    id: treeNodeId(id),
    zoneId: zone.id,
    type: 'wood' as const,
    pos: Object.freeze({ x: d.x, z: d.z }),
    level,
    tier,
  });
  return Object.freeze({
    id,
    x: d.x,
    z: d.z,
    kind: d.kind,
    scale: d.scale,
    variant: d.variant,
    zoneId: zone.id,
    tier,
    level,
    node,
  });
}

// (active world content) -> seed -> anchor id -> tree (null: no choppable tree).
const memo = new WeakMap<object, Map<number, Map<number, ChoppableTree | null>>>();

function memoFor(seed: number): Map<number, ChoppableTree | null> {
  const content = getActiveWorldContent();
  let bySeed = memo.get(content);
  if (!bySeed) {
    bySeed = new Map();
    memo.set(content, bySeed);
  }
  let byId = bySeed.get(seed);
  if (!byId) {
    byId = new Map();
    bySeed.set(seed, byId);
  }
  return byId;
}

function remember(byId: Map<number, ChoppableTree | null>, d: Decoration): ChoppableTree | null {
  const id = treeAnchorId(d.x, d.z);
  if (byId.has(id)) return byId.get(id) ?? null;
  const tree = buildTree(d);
  byId.set(id, tree);
  return tree;
}

/** The choppable tree with this id, or null (no tree there, a rock, a town tree). */
export function choppableTreeById(seed: number, id: number): ChoppableTree | null {
  if (!Number.isInteger(id) || id < 0) return null;
  const byId = memoFor(seed);
  const hit = byId.get(id);
  if (hit !== undefined) return hit;
  const xi = Math.floor(id / Z_COUNT);
  const zi = id - xi * Z_COUNT;
  const gx = X_START + xi * STEP;
  const gz = Z_START + zi * STEP;
  let found: ChoppableTree | null = null;
  for (const d of generateDecorationsInBounds(seed, {
    minX: gx - ANCHOR_REACH,
    maxX: gx + ANCHOR_REACH,
    minZ: gz - ANCHOR_REACH,
    maxZ: gz + ANCHOR_REACH,
  })) {
    if (treeAnchorId(d.x, d.z) !== id) continue;
    found = remember(byId, d);
    break;
  }
  byId.set(id, found);
  return found;
}

/** The choppable tree behind a `tree:<id>` node id, or null. */
export function choppableTreeByNodeId(seed: number, nodeId: string): ChoppableTree | null {
  const id = parseTreeNodeId(nodeId);
  return id === null ? null : choppableTreeById(seed, id);
}

/** Every choppable tree whose trunk centre lies within `radius` of (x, z), in
 *  lattice order (deterministic). */
export function choppableTreesNear(
  seed: number,
  x: number,
  z: number,
  radius: number,
): ChoppableTree[] {
  const byId = memoFor(seed);
  const out: ChoppableTree[] = [];
  const r2 = radius * radius;
  for (const d of generateDecorationsInBounds(seed, {
    minX: x - radius,
    maxX: x + radius,
    minZ: z - radius,
    maxZ: z + radius,
  })) {
    if (d.kind === 'rock') continue;
    const dx = d.x - x;
    const dz = d.z - z;
    if (dx * dx + dz * dz > r2) continue;
    const tree = remember(byId, d);
    if (tree) out.push(tree);
  }
  return out;
}
