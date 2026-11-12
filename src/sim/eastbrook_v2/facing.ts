// Which way a body standing on the Eastbrook Vale v2 design faces: toward the
// nearest design road lane (EBV2_ROADS centrelines), where the folk who come to a
// station, a counter or a door walk up from. The town's services take their
// facings from here instead of from the retired town kit's benches and sheds, so
// a re-import that moves a road or a site turns its keeper with it.
// The yaw convention is eastbrook_layout.ts facingToward: atan2(dx, dz), local +Z
// toward the target. Pure leaf: no rng, no clock.

import { EBV2_ROADS } from './layout.generated';

/** The nearest point on any design road centreline to (x, z), or null with no
 *  roads. Ties keep the first road in export order. */
export function ebv2NearestRoadPoint(x: number, z: number): { x: number; z: number } | null {
  let best = Number.POSITIVE_INFINITY;
  let out: { x: number; z: number } | null = null;
  for (const road of EBV2_ROADS) {
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1];
      const [bx, bz] = road.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
      const px = ax + dx * t;
      const pz = az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        out = { x: px, z: pz };
      }
    }
  }
  return out;
}

/** The yaw that faces (x, z) toward the nearest design road; `fallback` when no
 *  road exists or the point stands on a centreline (no direction to face). */
export function ebv2FacingToRoad(x: number, z: number, fallback = 0): number {
  const p = ebv2NearestRoadPoint(x, z);
  if (!p) return fallback;
  const dx = p.x - x;
  const dz = p.z - z;
  if (Math.hypot(dx, dz) < 1e-6) return fallback;
  return Math.atan2(dx, dz);
}
