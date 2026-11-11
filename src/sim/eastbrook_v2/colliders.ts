// The Eastbrook Vale v2 solids: the design's oriented boxes (layout.generated.ts
// EBV2_COLLIDERS, already filtered at import to what a walker can hit: overhead
// lintels and roof slabs and flat paving are dropped there) plus a trunk for every
// design tree that no decoration anchor owns (decorations.ts). Ownership is one rule
// both ways (ground.ts ebv2Owns): where the design owns the ground its solids stand
// and the shipped world's own Eastbrook props stand down (ebv2StandDown); where it
// does not (the edge band's outer half, and any corridor the import config keeps)
// the shipped props stand and the design's do not. So the
// server blocks where the Unreal client draws a wall and nowhere else. Built-in
// world only (built_structure_colliders.ts gates it).
//
// Pure leaf: no rng, no clock.

import type { Collider } from '../collider_shapes';
import { GATHER_NODES } from '../content/gather_nodes';
import { isBuiltinWorldContent } from '../data';
import { HARBOR_ROUTE_MARKER_SRC } from '../harbor_route_markers';
import type { WorldContent } from '../types';
import { ebv2UnanchoredTreeIndexes } from './decorations';
import { ebv2Owns } from './ground';
import { EBV2_COLLIDER_IDS, EBV2_COLLIDERS, EBV2_TREES } from './layout.generated';

/** The `src` tag every design collider carries (dev attribution, and how the
 *  stand-down below tells the design's own boxes from the shipped props). */
export const EBV2_COLLIDER_SRC_PREFIX = 'ebv2:';

/** A box shorter than this above its ground is a low obstacle a jump clears
 *  (fence rails, crates, kerbs); taller ones are full-height walls. */
export const EBV2_LOW_OBSTACLE = 1.3;

/** Trunk radius for a design tree with no anchor (the scatter tree trunk size). */
export const EBV2_TRUNK_RADIUS = 0.45;

/** Indexes of the design boxes that stand: those on ground the design owns. */
export function ebv2StandingColliderIndexes(): number[] {
  const out: number[] = [];
  EBV2_COLLIDERS.forEach(([x, z], i) => {
    if (ebv2Owns(x, z)) out.push(i);
  });
  return out;
}

export function ebv2Colliders(groundAt: (x: number, z: number) => number): Collider[] {
  const out: Collider[] = [];
  for (const i of ebv2StandingColliderIndexes()) {
    const [x, z, hw, hd, rot, top] = EBV2_COLLIDERS[i];
    const ground = groundAt(x, z);
    const c: Collider = {
      type: 'obb',
      x,
      z,
      hw,
      hd,
      rot,
      cameraTopY: top,
      src: `${EBV2_COLLIDER_SRC_PREFIX}${EBV2_COLLIDER_IDS[i]}`,
    };
    if (top - ground < EBV2_LOW_OBSTACLE) {
      c.moveTopY = top;
      c.standable = true;
    }
    out.push(c);
  }
  for (const i of ebv2UnanchoredTreeIndexes()) {
    const [x, z] = EBV2_TREES[i];
    out.push({
      type: 'circle',
      x,
      z,
      r: EBV2_TRUNK_RADIUS,
      cameraTopY: groundAt(x, z) + 6,
      src: `${EBV2_COLLIDER_SRC_PREFIX}tree:${i}`,
    });
  }
  return out;
}

// The gather nodes' own bodies (colliders.ts builds a vein's circle at its node) are
// content, not shipped props: they stand wherever their node does.
let nodeSpots: Set<string> | null = null;
function isNodeBody(c: Collider): boolean {
  if (c.type !== 'circle') return false;
  nodeSpots ??= new Set(GATHER_NODES.map((n) => `${n.pos.x},${n.pos.z}`));
  return nodeSpots.has(`${c.x},${c.z}`);
}

/** True when a collider belongs to a sea crossing, not to the shipped Eastbrook:
 *  a ferry's moored hull (gated by its berth, transport_gates.ts) or a harbor
 *  route marker's post. The ferry berths in the v2 design's west cove, so these
 *  stand on design ground and must stay. */
function isCrossingBody(c: Collider): boolean {
  return c.gate !== undefined || c.src === HARBOR_ROUTE_MARKER_SRC;
}

/** True when a shipped (non-design) collider stands on ground the design owns. */
export function ebv2RetiresShippedCollider(c: Collider): boolean {
  if (c.src?.startsWith(EBV2_COLLIDER_SRC_PREFIX) || isNodeBody(c) || isCrossingBody(c)) {
    return false;
  }
  return ebv2Owns(c.x, c.z);
}

/** The static collider list with every shipped prop on design ground removed. */
export function ebv2StandDown(out: Collider[], builtIn: boolean): Collider[] {
  return builtIn ? out.filter((c) => !ebv2RetiresShippedCollider(c)) : out;
}

/** True when the design owns the ground at (x, z) in `content` (the built-in world
 *  only): a shipped record standing there gives up its walls and floors. */
export function ebv2OwnsGround(x: number, z: number, content: WorldContent): boolean {
  return isBuiltinWorldContent(content) && ebv2Owns(x, z);
}

/** Planned sites (the streetlamp network) with every site on design ground
 *  dropped: the design draws its own lamps, unboxed, so a server post there would
 *  be an invisible wall. Built-in world only. */
export function ebv2DropOwned<T extends { x: number; z: number }>(
  items: readonly T[],
  content: WorldContent,
): T[] {
  if (!isBuiltinWorldContent(content)) return [...items];
  return items.filter((i) => !ebv2Owns(i.x, i.z));
}
