// The frontier's ground: the height rule for every expansion zone outside the
// shipped zone grid (CORE_WORLD in ../world_core_bounds.ts).
//
// The shipped terrain chain in world.ts is a hand-tuned stack of per-realm
// coasts and appliers that all assume the old world box. Rather than grow that
// monolith, the frontier is authored as DATA (land blobs, ridges, necks, flats,
// lakes, see ./layout.ts) and shaped here by one pure function of (x, z, seed),
// the same contract as terrainHeight: the renderer, colliders, pathing and the
// RL env all sample it through world.ts, so every host sees the same ground.
//
// world.ts calls applyFrontierTerrain once, late in the unpadded chain and
// before the lake-shore grading and the editor stamps, so the frontier still
// gets graded lake shores and the editor can still sculpt it. Inside the core
// rect the function is the identity (bit for bit, pinned by
// tests/world_core_terrain_parity.test.ts); past it the frontier height fades
// in over FRONTIER_SEAM_BAND yards, so the old open sea meets the new coasts
// with no step. The only authored reach INTO the core rect are the tie-in
// necks (FRONTIER_TIE_INS), the land bridges that join the old coasts to the
// new ones; each one only ever RAISES the ground toward its causeway crown.
//
// Every shape is bucketed into a FRONTIER_CELL grid once at module load, so a
// height sample only walks the handful of shapes that can reach it: the cost
// per sample stays flat however many rows the frontier grows.
//
// Pure leaf: no rng state, no SimContext; noise comes from the stateless
// hash/noise in ../rng.ts.

import { fbm2, noise2 } from '../rng';
import { CORE_WORLD } from '../world_core_bounds';
import {
  FRONTIER_BLOBS,
  FRONTIER_FLATS,
  FRONTIER_LAKES,
  FRONTIER_NECKS,
  FRONTIER_RIDGES,
  FRONTIER_TIE_INS,
  type FrontierNeck,
} from './layout';

/** Sea level, mirrored from world.ts WATER_LEVEL (a leaf cannot import world.ts:
 *  world.ts imports this module). Pinned equal by tests/frontier_terrain.test.ts. */
export const FRONTIER_WATER_LEVEL = -4.3;
/** Yards past the core rect over which the frontier height fades in. */
export const FRONTIER_SEAM_BAND = 48;
/** How far past its land the frontier still shapes the sea floor (yd). */
export const FRONTIER_EXTENT_MARGIN = 140;
/** The open-sea floor the frontier dives to away from its land. */
const SEA_FLOOR = FRONTIER_WATER_LEVEL - 9;
/** Land just above the tide line: where every blob's beach starts. */
const SHORE = FRONTIER_WATER_LEVEL + 1.2;
/** Spatial bucket size for the shape index (yd). */
const FRONTIER_CELL = 64;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Distance (yd) of a point outside the core rect, 0 on or inside it. */
export function outsideCoreDistance(x: number, z: number): number {
  const dx = Math.max(CORE_WORLD.minX - x, 0, x - CORE_WORLD.maxX);
  const dz = Math.max(CORE_WORLD.minZ - z, 0, z - CORE_WORLD.maxZ);
  return dx === 0 ? dz : dz === 0 ? dx : Math.hypot(dx, dz);
}

/** Distance from p to segment ab, plus the 0..1 parameter of the foot. */
function segment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
  return { d: Math.hypot(x - (ax + dx * t), z - (az + dz * t)), t };
}

interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const blobReach = (b: (typeof FRONTIER_BLOBS)[number]): Box => {
  const r = Math.max(b.rx, b.rz) * 1.5;
  return { minX: b.x - r, maxX: b.x + r, minZ: b.z - r, maxZ: b.z + r };
};
const segReach = (s: { ax: number; az: number; bx: number; bz: number }, r: number): Box => ({
  minX: Math.min(s.ax, s.bx) - r,
  maxX: Math.max(s.ax, s.bx) + r,
  minZ: Math.min(s.az, s.bz) - r,
  maxZ: Math.max(s.az, s.bz) + r,
});
const discReach = (d: { x: number; z: number }, r: number): Box => ({
  minX: d.x - r,
  maxX: d.x + r,
  minZ: d.z - r,
  maxZ: d.z + r,
});

const BLOB_BOXES = FRONTIER_BLOBS.map(blobReach);
const NECK_BOXES = FRONTIER_NECKS.map((n) => segReach(n, n.halfWidth * 1.6));
const TIE_BOXES = FRONTIER_TIE_INS.map((n) => segReach(n, n.halfWidth * 1.6));
const RIDGE_BOXES = FRONTIER_RIDGES.map((r) => segReach(r, r.halfWidth));
const FLAT_BOXES = FRONTIER_FLATS.map((f) => discReach(f, f.r * 1.7));
const LAKE_BOXES = FRONTIER_LAKES.map((l) => discReach(l, l.radius * 1.6));

/** The rect the frontier may reshape: every shape plus the margin. Inverted
 *  (empty) when the layout has no land, so the hook is the identity. */
export const FRONTIER_EXTENT: Readonly<Box> = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of [...BLOB_BOXES, ...NECK_BOXES, ...TIE_BOXES]) {
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  const m = FRONTIER_EXTENT_MARGIN;
  return Object.freeze({ minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m });
})();

interface Bucket {
  blobs: number[];
  necks: number[];
  ties: number[];
  ridges: number[];
  flats: number[];
  lakes: number[];
}

const GRID_COLS = Number.isFinite(FRONTIER_EXTENT.minX)
  ? Math.max(1, Math.ceil((FRONTIER_EXTENT.maxX - FRONTIER_EXTENT.minX) / FRONTIER_CELL))
  : 0;
const GRID_ROWS = Number.isFinite(FRONTIER_EXTENT.minZ)
  ? Math.max(1, Math.ceil((FRONTIER_EXTENT.maxZ - FRONTIER_EXTENT.minZ) / FRONTIER_CELL))
  : 0;

const BUCKETS: Bucket[] = (() => {
  const out: Bucket[] = [];
  for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
    out.push({ blobs: [], necks: [], ties: [], ridges: [], flats: [], lakes: [] });
  }
  const put = (boxes: Box[], key: keyof Bucket) => {
    boxes.forEach((b, index) => {
      const c0 = Math.max(0, Math.floor((b.minX - FRONTIER_EXTENT.minX) / FRONTIER_CELL));
      const c1 = Math.min(
        GRID_COLS - 1,
        Math.floor((b.maxX - FRONTIER_EXTENT.minX) / FRONTIER_CELL),
      );
      const r0 = Math.max(0, Math.floor((b.minZ - FRONTIER_EXTENT.minZ) / FRONTIER_CELL));
      const r1 = Math.min(
        GRID_ROWS - 1,
        Math.floor((b.maxZ - FRONTIER_EXTENT.minZ) / FRONTIER_CELL),
      );
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) out[r * GRID_COLS + c][key].push(index);
      }
    });
  };
  put(BLOB_BOXES, 'blobs');
  put(NECK_BOXES, 'necks');
  put(TIE_BOXES, 'ties');
  put(RIDGE_BOXES, 'ridges');
  put(FLAT_BOXES, 'flats');
  put(LAKE_BOXES, 'lakes');
  return out;
})();

const EMPTY_BUCKET: Bucket = { blobs: [], necks: [], ties: [], ridges: [], flats: [], lakes: [] };

function bucketAt(x: number, z: number): Bucket {
  const c = Math.floor((x - FRONTIER_EXTENT.minX) / FRONTIER_CELL);
  const r = Math.floor((z - FRONTIER_EXTENT.minZ) / FRONTIER_CELL);
  if (c < 0 || r < 0 || c >= GRID_COLS || r >= GRID_ROWS) return EMPTY_BUCKET;
  return BUCKETS[r * GRID_COLS + c];
}

/** The frontier's land mask, 0 (open sea) .. 1 (well inland), plus how far
 *  inland the strongest blob reaches (0 at its rim, 1 at its core). */
function landMask(
  x: number,
  z: number,
  seed: number,
  cell: Bucket,
): { mask: number; core: number } {
  let mask = 0;
  let core = 0;
  if (cell.blobs.length > 0) {
    // Coast wobble: several octaves so the shoreline has coves and points
    // rather than reading as a traced ellipse.
    const wob = (fbm2(x * 0.011, z * 0.011, seed + 6101, 3) - 0.5) * 0.55;
    for (const i of cell.blobs) {
      const b = FRONTIER_BLOBS[i];
      const dx = x - b.x;
      const dz = z - b.z;
      const c = Math.cos(b.rot ?? 0);
      const s = Math.sin(b.rot ?? 0);
      const u = (dx * c - dz * s) / b.rx;
      const v = (dx * s + dz * c) / b.rz;
      const r = Math.sqrt(u * u + v * v) + wob * (b.ragged ?? 1);
      const m = 1 - smoothstep(0.78, 1.02, r);
      if (m > mask) mask = m;
      const k = 1 - smoothstep(0, 0.9, r);
      if (k > core) core = k;
    }
  }
  for (const i of cell.necks) {
    const n = FRONTIER_NECKS[i];
    const { d } = segment(x, z, n.ax, n.az, n.bx, n.bz);
    if (d > n.halfWidth * 1.6) continue;
    const m = 1 - smoothstep(n.halfWidth * 0.7, n.halfWidth * 1.25, d);
    if (m > mask) mask = m;
  }
  return { mask, core };
}

/** Rolling inland relief: broad swells plus a finer roughness, scaled by how
 *  far inland the point is so beaches stay low and the interior rises. */
function inlandRelief(x: number, z: number, seed: number, core: number): number {
  const broad = fbm2(x * 0.0048, z * 0.0048, seed + 6203, 4); // 0..1
  const fine = fbm2(x * 0.03, z * 0.03, seed + 6211, 2) - 0.5;
  const swell = 3 + 13 * core * core;
  return (broad - 0.35) * swell + fine * (1.2 + 1.6 * core);
}

/** Authored ridges and hills: a crest lift that falls off across the ridge,
 *  with a crest noise so a range reads as summits and saddles. */
function ridgeLift(x: number, z: number, seed: number, cell: Bucket): number {
  let lift = 0;
  for (const i of cell.ridges) {
    const r = FRONTIER_RIDGES[i];
    const { d, t } = segment(x, z, r.ax, r.az, r.bx, r.bz);
    if (d > r.halfWidth) continue;
    const across = 1 - smoothstep(0, r.halfWidth, d);
    const endFade = smoothstep(0, 0.12, t) * smoothstep(0, 0.12, 1 - t);
    const crest = 0.72 + 0.56 * noise2(x * 0.035, z * 0.035, seed + 6307);
    const v = r.height * across * across * (0.35 + 0.65 * endFade) * crest;
    if (v > lift) lift = v;
  }
  return lift;
}

/** A neck's causeway crown: a gentle ramp between its two end heights. */
function neckCrown(n: FrontierNeck, t: number): number {
  return n.ha + (n.hb - n.ha) * t;
}

/** The frontier's natural ground (land, ridges, causeways), before pads/lakes. */
function naturalHeight(x: number, z: number, seed: number, cell: Bucket): number {
  const { mask, core } = landMask(x, z, seed, cell);
  if (mask <= 0) return SEA_FLOOR;
  let land = SHORE + Math.max(0, inlandRelief(x, z, seed, core)) * smoothstep(0.1, 0.8, mask);
  land += ridgeLift(x, z, seed, cell) * mask;
  // causeway crowns lift the ground along every neck, so a bridge never sags
  // below the tide (raise-only: where the land already stands higher, as at a
  // neck's inland ends, the relief keeps its shape)
  for (const i of cell.necks) {
    const n = FRONTIER_NECKS[i];
    const { d, t } = segment(x, z, n.ax, n.az, n.bx, n.bz);
    if (d > n.halfWidth * 1.25) continue;
    const w = 1 - smoothstep(n.halfWidth * 0.5, n.halfWidth * 1.25, d);
    const crown = neckCrown(n, t);
    if (crown > land) land = land + (crown - land) * w;
  }
  // beach then sea: below a mask of ~0.35 the ground dives to the sea floor
  const shore = smoothstep(0.08, 0.42, mask);
  return SEA_FLOOR + (land - SEA_FLOOR) * shore;
}

// Per-seed memo of each flat's resolved pad height. A pure cache: the value is
// a function of (seed, layout) only, so it can never fork two hosts.
const flatHeightMemo = new Map<number, number[]>();

/** A flat's pad height: its authored h, else the natural ground at its
 *  center, never lower than a dry step above the tide. */
function flatHeights(seed: number): number[] {
  let hs = flatHeightMemo.get(seed);
  if (!hs) {
    hs = FRONTIER_FLATS.map(
      (f) =>
        f.h ??
        Math.max(FRONTIER_WATER_LEVEL + 2.2, naturalHeight(f.x, f.z, seed, bucketAt(f.x, f.z))),
    );
    flatHeightMemo.set(seed, hs);
  }
  return hs;
}

/** The frontier height at a point, before the core-seam blend. */
export function frontierRawHeight(x: number, z: number, seed: number): number {
  const cell = bucketAt(x, z);
  let h = naturalHeight(x, z, seed, cell);
  if (cell.flats.length > 0) {
    const pads = flatHeights(seed);
    for (const i of cell.flats) {
      const f = FRONTIER_FLATS[i];
      const dx = x - f.x;
      const dz = z - f.z;
      const gate = f.r * 1.7;
      if (dx * dx + dz * dz >= gate * gate) continue;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const w = 1 - smoothstep(f.r, f.r * 1.7, dist);
      h = h * (1 - w) + pads[i] * w;
    }
  }
  // lake basins: a bowl to well under the waterline at the center
  for (const i of cell.lakes) {
    const l = FRONTIER_LAKES[i];
    const dx = x - l.x;
    const dz = z - l.z;
    const gate = l.radius * 1.6;
    if (dx * dx + dz * dz >= gate * gate) continue;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const bed = FRONTIER_WATER_LEVEL - 3.3;
    const w = 1 - smoothstep(l.radius * 0.55, l.radius * 1.6, dist);
    h = h * (1 - w) + Math.min(h, bed) * w;
  }
  return h;
}

/** world.ts hook: the shipped chain's height h at (x, z) in, the finished
 *  frontier-aware height out. Identity everywhere inside the core rect except
 *  on a tie-in neck, where it only ever raises the ground toward the crown. */
export function applyFrontierTerrain(x: number, z: number, seed: number, h: number): number {
  // Only the frontier's own neighbourhood is reshaped: everywhere else past the
  // core rect (the instance bands a hundred thousand yards east, the rift and
  // battleground fields) keeps its shipped height.
  if (
    !(x >= FRONTIER_EXTENT.minX && x <= FRONTIER_EXTENT.maxX) ||
    !(z >= FRONTIER_EXTENT.minZ && z <= FRONTIER_EXTENT.maxZ)
  ) {
    return h;
  }
  const out = outsideCoreDistance(x, z);
  if (out > 0) {
    const t = smoothstep(0, FRONTIER_SEAM_BAND, out);
    h = h + (frontierRawHeight(x, z, seed) - h) * t;
  }
  const cell = bucketAt(x, z);
  let best = 0;
  let crown = 0;
  for (const i of cell.ties) {
    const n = FRONTIER_TIE_INS[i];
    const { d, t } = segment(x, z, n.ax, n.az, n.bx, n.bz);
    if (d > n.halfWidth * 1.25) continue;
    const w = 1 - smoothstep(n.halfWidth * 0.5, n.halfWidth * 1.25, d);
    if (w > best) {
      best = w;
      crown = neckCrown(n, t);
    }
  }
  if (best > 0 && crown > h) h = h + (crown - h) * best;
  return h;
}

/** Whether the frontier holds land (above the tide) at a point: a cheap read
 *  for tests and the survey tooling, ignoring the core seam. */
export function frontierLandAt(x: number, z: number, seed: number): boolean {
  return frontierRawHeight(x, z, seed) > FRONTIER_WATER_LEVEL;
}
