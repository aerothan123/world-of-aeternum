// The frontier layout in WORLD space: every authored shape of ./layout.ts put
// through the frontier spread (./spread.ts) once at module load. terrain.ts
// shapes the ground from these; content anchors are spread by data.ts.
// Centers and segment ends move with the spread; land radii and ridge widths
// grow by the same factor so a coast keeps its outline, while pads, lakes and
// causeway widths keep their authored size (a hub pad is not a bigger town).

import {
  FRONTIER_BLOBS,
  FRONTIER_FLATS,
  FRONTIER_LAKES,
  FRONTIER_NECKS,
  FRONTIER_RIDGES,
  FRONTIER_TIE_INS,
  type FrontierBlob,
  type FrontierFlat,
  type FrontierLake,
  type FrontierNeck,
  type FrontierRidge,
} from './layout';
import { FRONTIER_PIVOT_Z, FRONTIER_SPREAD, spreadPoint } from './spread';

function seg<T extends { ax: number; az: number; bx: number; bz: number }>(s: T): T {
  const a = spreadPoint(s.ax, s.az);
  const b = spreadPoint(s.bx, s.bz);
  return { ...s, ax: a.x, az: a.z, bx: b.x, bz: b.z };
}

export const SPREAD_BLOBS: readonly FrontierBlob[] = FRONTIER_BLOBS.map((b) => ({
  ...b,
  ...spreadPoint(b.x, b.z),
  rx: b.rx * FRONTIER_SPREAD,
  rz: b.rz * FRONTIER_SPREAD,
}));

export const SPREAD_NECKS: readonly FrontierNeck[] = FRONTIER_NECKS.map(seg);
// A tie-in keeps its authored line (its core half cannot move) and gains a
// two-leg bridge out to where the spread put its frontier end: a short knee
// from where it crosses the core edge (z -180) down to one lift-reach south
// of the edge, inside the tie-in's core exemption, then a straight leg to the
// spread end that never lifts core ground (tests/world_core_terrain_parity).
function bridge(t: FrontierNeck): FrontierNeck[] {
  const end = spreadPoint(t.bx, t.bz);
  const reach = t.halfWidth * 1.25;
  const knee = {
    x: t.bx + Math.max(-reach, Math.min(reach, end.x - t.bx)),
    z: FRONTIER_PIVOT_Z - reach,
  };
  const leg = { ...t, ha: t.hb, hb: t.hb };
  return [
    { ...leg, ax: t.bx, az: FRONTIER_PIVOT_Z, bx: knee.x, bz: knee.z },
    { ...leg, ax: knee.x, az: knee.z, bx: end.x, bz: end.z },
  ];
}

export const SPREAD_TIE_INS: readonly FrontierNeck[] = [
  ...FRONTIER_TIE_INS,
  ...FRONTIER_TIE_INS.flatMap(bridge),
];

export const SPREAD_RIDGES: readonly FrontierRidge[] = FRONTIER_RIDGES.map((r) => ({
  ...seg(r),
  halfWidth: r.halfWidth * FRONTIER_SPREAD,
}));

export const SPREAD_FLATS: readonly FrontierFlat[] = FRONTIER_FLATS.map((f) => ({
  ...f,
  ...spreadPoint(f.x, f.z),
}));

export const SPREAD_LAKES: readonly FrontierLake[] = FRONTIER_LAKES.map((l) => ({
  ...l,
  ...spreadPoint(l.x, l.z),
}));
