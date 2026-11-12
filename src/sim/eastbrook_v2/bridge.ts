// The brook bridge of the Eastbrook Vale v2 design: the timber bridge that carries the north road
// over the brook a few yards downstream (west) of the Broken Span, which stays a ruin. Unreal builds
// it from the same numbers (wt-aura Scripts/worldv2_aura/ebv_pass5_shape.py BRIDGE, ebv_pass5.py
// "bridge"); keep the two equal. The deck runs along z at x, from the south bank (z0) to the north
// bank (z1), its top rising from y0 to y1 with an arch at mid span; the design's road lanes stop at
// its two ends (north_road, north_road_n). Server frame, yards (the design is server + 8.3 m).
// Built-in world only. Pure leaf: no rng, no clock.

import { isBuiltinWorldActive } from '../data';

export const EBV2_BROOK_BRIDGE = {
  x: -18,
  z0: -44,
  z1: -28,
  halfWidth: 2.2,
  y0: -2.05,
  y1: -2.47,
  arch: 0.6,
} as const;

/** The deck top under (x, z), or -Infinity off the deck (and off the built-in world). */
export function ebv2BridgeSurface(x: number, z: number): number {
  const b = EBV2_BROOK_BRIDGE;
  if (Math.abs(x - b.x) > b.halfWidth || z < b.z0 || z > b.z1) return -Infinity;
  if (!isBuiltinWorldActive()) return -Infinity;
  const t = (z - b.z0) / (b.z1 - b.z0);
  return b.y0 + (b.y1 - b.y0) * t + b.arch * Math.sin(Math.PI * t);
}
