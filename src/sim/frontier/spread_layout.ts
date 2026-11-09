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
import { FRONTIER_SPREAD, spreadPoint } from './spread';

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
export const SPREAD_TIE_INS: readonly FrontierNeck[] = FRONTIER_TIE_INS.map(seg);

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
