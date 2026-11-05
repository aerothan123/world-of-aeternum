// Every road polyline of the world as one list: the shipped overworld roads,
// the Eastbrook town streets, the Fenbridge streets and the Highwatch
// Stormcrag road. A layout road that already appears in the overworld list
// (same end points) is not added twice.
import { getActiveWorldContent } from '../../src/sim/data';
import { EASTBROOK_LAYOUT } from '../../src/sim/eastbrook_layout';
import { FENBRIDGE_LAYOUT } from '../../src/sim/fenbridge_layout';
import { HIGHWATCH_LAYOUT } from '../../src/sim/highwatch_layout';
import type { ExportRoad } from './world_slice_export';

/** Half width of the shipped overworld roads (world_slice_export.ts uses the same). */
export const OVERWORLD_ROAD_HALF_WIDTH = 1.9;

const near = (a: { x: number; z: number }, b: { x: number; z: number }): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) < 0.5;

export function allRoads(): ExportRoad[] {
  const out: ExportRoad[] = [];
  for (const [i, r] of getActiveWorldContent().roads.entries()) {
    out.push({
      id: `road:${i}`,
      kind: 'road',
      halfWidth: OVERWORLD_ROAD_HALF_WIDTH,
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
  for (const s of EASTBROOK_LAYOUT.roads) addLayout(`eastbrook:${s.id}`, s.halfWidth, s.points);
  for (const r of FENBRIDGE_LAYOUT.roads) addLayout(`fenbridge:${r.id}`, r.halfWidth, r.points);
  for (const [name, pts] of Object.entries(HIGHWATCH_LAYOUT.roads)) {
    addLayout(`highwatch:${name}`, OVERWORLD_ROAD_HALF_WIDTH, pts);
  }
  return out;
}
