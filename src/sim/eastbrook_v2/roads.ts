// Eastbrook Vale v2 roads as the sim reads them: which road polylines of the
// active world are the design's own (EBV2_ROADS). The Unreal client paints a
// design road exactly on its spline, so the sim's road meander (road_curves.ts)
// stands down for these and the painted lanes, the splat and every roadDistance
// clearance agree with Unreal. Built-in world only. Pure leaf.

import { isBuiltinWorldActive } from '../data';
import { EBV2_ROADS } from './layout.generated';

/** True when `pts` is one of the design's roads point for point (the built-in
 *  world only; an authored or custom map never sees the design). */
export function ebv2IsDesignRoad(pts: readonly { x: number; z: number }[]): boolean {
  if (!isBuiltinWorldActive()) return false;
  return EBV2_ROADS.some(
    (road) =>
      road.points.length === pts.length &&
      road.points.every(([x, z], i) => pts[i].x === x && pts[i].z === z),
  );
}
