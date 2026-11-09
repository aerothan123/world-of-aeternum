// The frontier spread: one fixed map that pushes the expansion frontier
// (every point south of the core strip, z < -180, or west of it, x < -540)
// further out, so the levels 6 to 20 road takes longer to run.
//
// Content is still AUTHORED in the compact frame (frontier/layout.ts anchors,
// the content/frontier records, the chapter-two restated anchors, the slot
// grid). The spread is applied exactly twice, where the frame becomes a world:
//   - frontier/spread_layout.ts maps every authored shape once (terrain.ts);
//   - data.ts walks the merged content tables once, before the world bounds
//     are derived (spreadFrontierContent).
// The core rect (x >= -540 and z >= -180) is never touched, so the core
// terrain parity and every core record stay byte-identical.
//
// The map, inside the frontier region:
//   z' = -180 + S * (z + 180)          (south of the core edge, stretched)
//   x' = x                             for 72 <= x <= 380
//   x' = 380 + S * (x - 380)           east of 380
//   x' = 72 + S * (x - 72)             west of 72
// The x band 72..380 holds still because the two tie-in causeways (the
// Southway near x 72 and the Applewold causeway near x 380) cross from the
// fixed core into the frontier there: their core halves cannot move, so their
// frontier halves must not slide sideways. Everything else spreads by S.
//
// Settlements and pads move as a whole: a point within LOCAL_PAD_REACH of an
// authored level pad (frontier/layout.ts FRONTIER_FLATS: hubs, yards, camps)
// is TRANSLATED with its pad's center instead of scaled, so a town's tents,
// boards, givers and mailbox keep their authored spacing on their pad. The
// map never shrinks a distance, so the inverse can tell the two cases apart.

import { FRONTIER_FLATS } from './layout';

/** The frontier's linear spread factor. 1 is the compact authored frame.
 *  A dyadic rational (7/4) on purpose: spreading an authored integer and
 *  unspreading it again is exact in floating point, so unspreadFrontierContent
 *  recovers the authored frame bit for bit (the touch-up baseline token). */
export const FRONTIER_SPREAD = 1.75;

/** The core strip's south edge and west edge in yards (the spread's pivot). */
export const FRONTIER_PIVOT_Z = -180;
export const CORE_WEST_X = -540;
/** The fixed x band the tie-in causeways cross (see the header). */
export const FIXED_BAND_WEST_X = 72;
export const FIXED_BAND_EAST_X = 380;

/** The authored frontier never reaches past this many yards from the origin
 *  (west, east or south). Far parking spots (the -12000 sentinels) stay put. */
export const AUTHORED_FRONTIER_LIMIT = 1000;

/** True when an authored point lies in the frontier region (outside the core
 *  rect, inside the authored frontier's reach). */
export function inFrontierRegion(x: number, z: number): boolean {
  const L = AUTHORED_FRONTIER_LIMIT;
  return (z < FRONTIER_PIVOT_Z || x < CORE_WEST_X) && x >= -L && x <= L && z >= -L;
}

/** The same region in world space (the spread's image of the authored region).
 *  The map keeps "south of -180" and "west of -540" (x' <= x west of 72). */
export function inSpreadFrontierRegion(x: number, z: number): boolean {
  const L = AUTHORED_FRONTIER_LIMIT;
  return (
    (z < FRONTIER_PIVOT_Z || x < spreadX(CORE_WEST_X)) &&
    x >= spreadX(-L) &&
    x <= spreadX(L) &&
    z >= spreadZ(-L)
  );
}

/** Map one authored frontier x (no region check). */
export function spreadX(x: number): number {
  if (x > FIXED_BAND_EAST_X) return FIXED_BAND_EAST_X + FRONTIER_SPREAD * (x - FIXED_BAND_EAST_X);
  if (x < FIXED_BAND_WEST_X) return FIXED_BAND_WEST_X + FRONTIER_SPREAD * (x - FIXED_BAND_WEST_X);
  return x;
}

/** Map one authored frontier z (no region check). */
export function spreadZ(z: number): number {
  return FRONTIER_PIVOT_Z + FRONTIER_SPREAD * (z - FRONTIER_PIVOT_Z);
}

/** The inverse of spreadX. */
export function unspreadX(x: number): number {
  if (x > FIXED_BAND_EAST_X) return (x - FIXED_BAND_EAST_X) / FRONTIER_SPREAD + FIXED_BAND_EAST_X;
  if (x < FIXED_BAND_WEST_X) return (x - FIXED_BAND_WEST_X) / FRONTIER_SPREAD + FIXED_BAND_WEST_X;
  return x;
}

/** The inverse of spreadZ. */
export function unspreadZ(z: number): number {
  return (z - FRONTIER_PIVOT_Z) / FRONTIER_SPREAD + FRONTIER_PIVOT_Z;
}

/** How near an authored pad a point must be to move with it (yd). */
export const LOCAL_PAD_REACH = 30;

const PADS = FRONTIER_FLATS.filter((f) => inFrontierRegion(f.x, f.z));

/** The authored pad nearest an authored point within reach, if any. */
function padFor(x: number, z: number): { x: number; z: number } | undefined {
  let best: { x: number; z: number } | undefined;
  let bestD = LOCAL_PAD_REACH;
  for (const f of PADS) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/** Map an authored point: spread when it is in the frontier, identity in the core. */
export function spreadPoint(x: number, z: number): { x: number; z: number } {
  if (!inFrontierRegion(x, z)) return { x, z };
  const pad = padFor(x, z);
  if (pad) return { x: spreadX(pad.x) + (x - pad.x), z: spreadZ(pad.z) + (z - pad.z) };
  return { x: spreadX(x), z: spreadZ(z) };
}

interface ZoneRect {
  xMin?: number;
  xMax?: number;
  zMin: number;
  zMax: number;
}

/** True when a zone's authored rect is a frontier cell. */
export function isFrontierRect(r: ZoneRect): boolean {
  return r.zMax <= FRONTIER_PIVOT_Z || (r.xMax !== undefined && r.xMax <= CORE_WEST_X);
}

/** The same test for a rect already in world space. */
function isSpreadFrontierRect(r: ZoneRect): boolean {
  return r.zMax <= FRONTIER_PIVOT_Z || (r.xMax !== undefined && r.xMax <= spreadX(CORE_WEST_X));
}

/** Spread a frontier zone rect in place (identity for a core rect). */
export function spreadRect(r: ZoneRect): void {
  if (!isFrontierRect(r)) return;
  if (r.xMin !== undefined) r.xMin = spreadX(r.xMin);
  if (r.xMax !== undefined) r.xMax = spreadX(r.xMax);
  r.zMin = spreadZ(r.zMin);
  r.zMax = spreadZ(r.zMax);
}

/** The inverse map: a world-space point back to the authored frame. The spread
 *  maps the frontier region onto itself, so the same region test applies. */
export function unspreadPoint(x: number, z: number): { x: number; z: number } {
  if (!inSpreadFrontierRegion(x, z)) return { x, z };
  for (const f of PADS) {
    const fx = spreadX(f.x);
    const fz = spreadZ(f.z);
    if (Math.hypot(x - fx, z - fz) >= LOCAL_PAD_REACH) continue;
    const p = { x: x - fx + f.x, z: z - fz + f.z };
    if (padFor(p.x, p.z) === f) return p;
  }
  return { x: unspreadX(x), z: unspreadZ(z) };
}

/** A zone rect back in the authored frame (a copy; identity for a core rect). */
function unspreadRect<T extends ZoneRect>(r: T): T {
  if (!isSpreadFrontierRect(r)) return r;
  const out = { ...r };
  if (r.xMin !== undefined) out.xMin = unspreadX(r.xMin);
  if (r.xMax !== undefined) out.xMax = unspreadX(r.xMax);
  out.zMin = unspreadZ(r.zMin);
  out.zMax = unspreadZ(r.zMax);
  return out;
}

/**
 * A deep copy of a content value with every frontier {x, z} point (and every
 * [x, z, ...] tuple) mapped back to the authored frame, and every zone-like
 * rect ({zMin, zMax}) unspread. Key order is kept, so a token taken over the
 * copy equals one taken over the authored content. Core values pass through.
 */
export function unspreadFrontierContent<T>(value: T): T {
  const copy = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    // spreadFrontierContent never touches a frozen value, so neither does this
    if (Object.isFrozen(v)) return v;
    if (Array.isArray(v)) {
      if (isPointTuple(v)) {
        const p = unspreadPoint(v[0], v[1]);
        return [p.x, p.z, ...v.slice(2)];
      }
      return v.map(copy);
    }
    if (Object.getPrototypeOf(v) !== Object.prototype) return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = copy(o[k]);
    if (typeof o.x === 'number' && typeof o.z === 'number') {
      const p = unspreadPoint(o.x, o.z);
      out.x = p.x;
      out.z = p.z;
    }
    if (typeof o.zMin === 'number' && typeof o.zMax === 'number') {
      const r = unspreadRect(out as unknown as ZoneRect);
      Object.assign(out, r);
    }
    return out;
  };
  return copy(value) as T;
}

type Walkable = Record<string, unknown> | unknown[];

/** A prop placement tuple: [x, z, ...numbers]. */
function isPointTuple(v: unknown[]): v is number[] {
  return v.length >= 2 && v.every((e) => typeof e === 'number');
}

/**
 * Walk a content value and spread, in place, every plain {x, z} object whose
 * authored point lies in the frontier region. Each object is visited once, so
 * a record shared between two tables is never spread twice. Frozen objects are
 * skipped (the authored layout frame is frozen on purpose).
 */
export function spreadFrontierContent(roots: readonly unknown[]): number {
  const seen = new WeakSet<object>();
  let moved = 0;
  const visit = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    const frozen = Object.isFrozen(v);
    if (Array.isArray(v)) {
      if (isPointTuple(v)) {
        if (!frozen && inFrontierRegion(v[0], v[1])) {
          const p = spreadPoint(v[0], v[1]);
          v[0] = p.x;
          v[1] = p.z;
          moved++;
        }
        return;
      }
      for (const e of v) visit(e);
      return;
    }
    if (Object.getPrototypeOf(v) !== Object.prototype) return;
    const o = v as Record<string, unknown>;
    if (
      !frozen &&
      typeof o.x === 'number' &&
      typeof o.z === 'number' &&
      inFrontierRegion(o.x, o.z)
    ) {
      const p = spreadPoint(o.x, o.z);
      o.x = p.x;
      o.z = p.z;
      moved++;
    }
    if (!frozen && typeof o.zMin === 'number' && typeof o.zMax === 'number') {
      spreadRect(o as unknown as ZoneRect);
    }
    for (const k of Object.keys(o)) visit(o[k] as Walkable);
  };
  for (const r of roots) visit(r);
  return moved;
}
