// ---------------------------------------------------------------------------
// Natural roads. The authored ROADS are sparse waypoint polylines; drawn raw
// they read as ruler segments with kinks at every joint. Each road is
// densified ONCE through a centripetal-flavored Catmull-Rom spline so it
// flows as a curve through its waypoints (shared endpoints stay shared, so
// junctions remain seamless), and the query point gets a gentle fixed-seed
// meander so long reaches wander like a worn track instead of a survey line.
// The Eastbrook Vale v2 design's roads take no meander: the Unreal client
// paints them on their splines, so the sim reads them unwarped and the two
// agree (eastbrook_v2/roads.ts says which roads are the design's).
// Everything that reads roadDistance (the terrain splat, the map painter,
// decoration/terrace suppression) inherits the same curves together.
// Extracted from world.ts (which re-exports roadDistance). Deterministic:
// fixed-seed noise only, no rng draws.
// ---------------------------------------------------------------------------

import { getActiveWorldContent, getContentGeneration } from './data';
import { ebv2IsDesignRoad } from './eastbrook_v2/roads';
import { fbm2 } from './rng';

interface SmoothRoad {
  pts: { x: number; z: number }[];
  /** false for a design road: the query is not warped against it */
  meander: boolean;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const ROAD_SAMPLE_STEP = 5; // yd between densified points
const ROAD_MEANDER = 7; // full meander swing of the query warp (yd)
const ROAD_BBOX_MARGIN = 24; // covers the meander plus every consumer's reach

function catmullRom(
  p0: { x: number; z: number },
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  p3: { x: number; z: number },
  t: number,
): { x: number; z: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z:
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

function smoothRoads(roads: readonly (readonly { x: number; z: number }[])[]): SmoothRoad[] {
  return roads.map((road) => {
    const pts: { x: number; z: number }[] = [];
    if (road.length < 2) {
      pts.push(...road);
    } else {
      for (let i = 0; i < road.length - 1; i++) {
        const p0 = road[Math.max(0, i - 1)];
        const p1 = road[i];
        const p2 = road[i + 1];
        const p3 = road[Math.min(road.length - 1, i + 2)];
        const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const steps = Math.max(1, Math.ceil(segLen / ROAD_SAMPLE_STEP));
        for (let k = 0; k < steps; k++) pts.push(catmullRom(p0, p1, p2, p3, k / steps));
      }
      pts.push(road[road.length - 1]);
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return {
      pts,
      meander: !ebv2IsDesignRoad(road),
      minX: minX - ROAD_BBOX_MARGIN,
      maxX: maxX + ROAD_BBOX_MARGIN,
      minZ: minZ - ROAD_BBOX_MARGIN,
      maxZ: maxZ + ROAD_BBOX_MARGIN,
    };
  });
}

let smoothRoadGeneration = -1;
let cachedSmoothRoads: SmoothRoad[] = [];

function activeSmoothRoads(): readonly SmoothRoad[] {
  const generation = getContentGeneration();
  if (generation !== smoothRoadGeneration) {
    cachedSmoothRoads = smoothRoads(getActiveWorldContent().roads);
    smoothRoadGeneration = generation;
  }
  return cachedSmoothRoads;
}

/** Squared distance from (qx, qz) to the polyline `pts`. */
function polylineDist2(pts: readonly { x: number; z: number }[], qx: number, qz: number): number {
  let best2 = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = qx - a.x;
    const apz = qz - a.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / len2)) : 0;
    const dx = apx - abx * t;
    const dz = apz - abz * t;
    const d2 = dx * dx + dz * dz;
    if (d2 < best2) best2 = d2;
  }
  return best2;
}

/** Distance from (x,z) to the nearest road curve. */
export function roadDistance(x: number, z: number): number {
  const roads = activeSmoothRoads();
  // cheap first: most queries are nowhere near a road, so gate on the raw
  // bboxes (their margin already covers the meander) before paying for the
  // warp noise or any segment math
  let anyNear = false;
  let anyMeander = false;
  for (const road of roads) {
    if (x >= road.minX && x <= road.maxX && z >= road.minZ && z <= road.maxZ) {
      anyNear = true;
      if (road.meander) anyMeander = true;
    }
  }
  if (!anyNear) return Infinity;
  // the meander: warp the query, and the whole road wanders in response
  let wx = x;
  let wz = z;
  if (anyMeander) {
    wx = x + (fbm2(x * 0.045, z * 0.045, 9203, 2) - 0.5) * ROAD_MEANDER;
    wz = z + (fbm2(x * 0.045 + 37, z * 0.045 - 11, 9205, 2) - 0.5) * ROAD_MEANDER;
  }
  let best2 = Infinity;
  for (const road of roads) {
    const qx = road.meander ? wx : x;
    const qz = road.meander ? wz : z;
    if (qx < road.minX || qx > road.maxX || qz < road.minZ || qz > road.maxZ) continue;
    const d2 = polylineDist2(road.pts, qx, qz);
    if (d2 < best2) best2 = d2;
  }
  return Math.sqrt(best2);
}
