// The Eastbrook Vale v2 places by design id (layout.generated.ts EBV2_POINTS): the
// content tables read a service, a lot door, a camp or the player spawn from here,
// so a re-import moves them with the design and a renamed or dropped point fails
// loudly at module load instead of silently parking content at the origin. Also the
// design's road lanes (EBV2_ROADS), which a standing NPC keeps out of.
// Pure leaf.

import {
  EBV2_NODES,
  EBV2_POINTS,
  EBV2_ROADS,
  type Ebv2Node,
  type Ebv2Point,
} from './layout.generated';

const BY_ID = new Map(EBV2_POINTS.map((p) => [p.id, p]));

/** The design point `id`; throws when the design no longer exports it. */
export function ebv2Point(id: string): Ebv2Point {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Eastbrook v2: the design exports no point '${id}'`);
  return p;
}

/** `{ x, z }` of design point `id` (a fresh object, safe to freeze or spread). */
export function ebv2Xz(id: string): { x: number; z: number } {
  const p = ebv2Point(id);
  return { x: p.x, z: p.z };
}

/** The design's gather and fishing nodes of one kind, in export order. */
export function ebv2Nodes(kind: Ebv2Node['kind']): readonly Ebv2Node[] {
  return EBV2_NODES.filter((n) => n.kind === kind);
}

/** The design's roads as the sim's road polylines (zone1 ZONE1_ROADS, so the
 *  terrain splat, the map painter, decoration and lantern placement and road
 *  clearances all follow the design), in export order. Fresh arrays each call. */
export function ebv2RoadPolylines(): { x: number; z: number }[][] {
  return EBV2_ROADS.map((road) => road.points.map(([x, z]) => ({ x, z })));
}

/** How far (x, z) stands outside the nearest design road lane (centreline distance
 *  less half the road's width); negative inside a lane. Infinity with no roads. */
export function ebv2RoadClearance(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const road of EBV2_ROADS) {
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1];
      const [bx, bz] = road.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t)) - road.width / 2;
      if (d < best) best = d;
    }
  }
  return best;
}
