// Every road polyline of the world as one list: the shipped overworld roads
// (Eastbrook Vale's are the v2 design's, at the design's own widths), the
// Fenbridge streets and the Highwatch Stormcrag road. The old Eastbrook town
// streets (EASTBROOK_LAYOUT.roads) are retired with the old town. A layout road that already appears in the overworld list
// (same end points) is not added twice.
import { getActiveWorldContent } from '../../src/sim/data';
import { EBV2_ROADS } from '../../src/sim/eastbrook_v2/layout.generated';
import { FENBRIDGE_LAYOUT } from '../../src/sim/fenbridge_layout';
import { HIGHWATCH_LAYOUT } from '../../src/sim/highwatch_layout';
import type { ExportRoad } from './world_slice_export';

/** Half width of the shipped overworld roads (world_slice_export.ts uses the same). */
export const OVERWORLD_ROAD_HALF_WIDTH = 1.9;

const near = (a: { x: number; z: number }, b: { x: number; z: number }): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) < 0.5;

/** Half width of a road that is one of the Eastbrook v2 design's (same end points). */
function designHalfWidth(pts: readonly { x: number; z: number }[]): number | undefined {
  if (pts.length < 2) return undefined;
  const last = pts[pts.length - 1];
  const road = EBV2_ROADS.find((r) => {
    const [ax, az] = r.points[0];
    const [bx, bz] = r.points[r.points.length - 1];
    return near({ x: ax, z: az }, pts[0]) && near({ x: bx, z: bz }, last);
  });
  return road ? road.width / 2 : undefined;
}

export function allRoads(): ExportRoad[] {
  const out: ExportRoad[] = [];
  for (const [i, r] of getActiveWorldContent().roads.entries()) {
    out.push({
      id: `road:${i}`,
      kind: 'road',
      halfWidth: designHalfWidth(r) ?? OVERWORLD_ROAD_HALF_WIDTH,
      points: r.map((p) => ({ x: p.x, z: p.z })),
    });
  }
  const dup = (pts: readonly { x: number; z: number }[]): boolean =>
    out.some(
      (o) =>
        o.points.length > 1 &&
        near(o.points[0], pts[0]) &&
        near(o.points[o.points.length - 1], pts[pts.length - 1]),
    );
  const addLayout = (id: string, halfWidth: number, pts: readonly { x: number; z: number }[]) => {
    if (pts.length < 2 || dup(pts)) return;
    out.push({
      id,
      kind: 'street',
      halfWidth,
      points: pts.map((p) => ({ x: p.x, z: p.z })),
    });
  };
  for (const r of FENBRIDGE_LAYOUT.roads) addLayout(`fenbridge:${r.id}`, r.halfWidth, r.points);
  for (const [name, pts] of Object.entries(HIGHWATCH_LAYOUT.roads)) {
    addLayout(`highwatch:${name}`, OVERWORLD_ROAD_HALF_WIDTH, pts);
  }
  return out;
}
