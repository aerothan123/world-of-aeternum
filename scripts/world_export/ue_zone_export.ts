// Unreal world export, data layer: zones, tile rasters and per-zone record
// lists, all in Unreal space (ue_space.ts). Pure data in, typed arrays and
// records out; ue_export_cli.ts writes the files. Every number is read from
// the live sim (terrainHeight, the world content tables, the dungeon
// colliders); nothing is re-derived.

import type { Collider } from '../../src/sim/collider_shapes';
import { DUNGEON_LIST, STRIP_MAX_X, STRIP_MIN_X, ZONES, zoneAt } from '../../src/sim/data';
import { interiorCollidersFor } from '../../src/sim/interior_collider_sets';
import { terrainHeight } from '../../src/sim/world';
import { simLengthToUu, simToUe, simYawToUeYawDeg } from './ue_space';
import {
  encodeHeight,
  type HeightEncoding,
  QUAD_YD,
  type Rect,
  TILE_QUADS,
  TILE_VERTS,
  type TileCoord,
  tileBounds,
  tilesCovering,
} from './ue_tiles';
import {
  collectPlacements,
  type ExportPlacement,
  type ExportRoad,
  GROUND_LAYERS,
  type PlacementFit,
  sampleGround,
} from './world_slice_export';

export interface ZoneInfo {
  id: string;
  name: string;
  rect: Rect;
}

/** Every zone of the loaded world as a rectangle (strip zones span the full width). */
export function zoneInfos(): ZoneInfo[] {
  return ZONES.map((z) => ({
    id: z.id,
    name: z.name,
    rect: {
      minX: z.xMin ?? STRIP_MIN_X,
      maxX: z.xMax ?? STRIP_MAX_X,
      minZ: z.zMin,
      maxZ: z.zMax,
    },
  }));
}

/** Tiles overlapping any zone, each once, sorted for stable output. */
export function worldTiles(zones: readonly ZoneInfo[]): TileCoord[] {
  const seen = new Map<string, TileCoord>();
  for (const z of zones) {
    for (const t of tilesCovering(z.rect)) seen.set(`${t.tx},${t.tz}`, t);
  }
  return [...seen.values()].sort((a, b) => a.tz - b.tz || a.tx - b.tx);
}

export interface TileRasters {
  /** uint16 heights, TILE_VERTS^2, row = z from the tile's minZ */
  heights: Uint16Array;
  /** sim heights in yards (kept for validation, not written) */
  heightsYd: Float32Array;
  /** one 8 bit weight map per ground layer, in GROUND_LAYERS order */
  layers: Uint8Array[];
}

const unit8 = (v: number): number => {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  return Math.round(c * 255);
};

/** Sample one landscape tile from the sim. */
export function exportTileRasters(t: TileCoord, seed: number, enc: HeightEncoding): TileRasters {
  const b = tileBounds(t);
  const n = TILE_VERTS;
  const heightsYd = new Float32Array(n * n);
  const heights = new Uint16Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = b.minZ + j * QUAD_YD;
    for (let i = 0; i < n; i++) {
      const h = terrainHeight(b.minX + i * QUAD_YD, z, seed);
      heightsYd[j * n + i] = h;
      heights[j * n + i] = encodeHeight(h, enc);
    }
  }
  const { splat } = sampleGround(b, n, seed, TILE_QUADS / 3); // 170 cells: (170 + 3)^2 stays under the Uint16 index cap
  const nL = GROUND_LAYERS.length;
  const layers = GROUND_LAYERS.map(() => new Uint8Array(n * n));
  for (let o = 0; o < n * n; o++) {
    for (let k = 0; k < nL; k++) layers[k][o] = unit8(splat[o * nL + k]);
  }
  return { heights, heightsYd, layers };
}

/** Min and max terrain height over all tiles, sampled on a coarse lattice. */
export function worldHeightRange(
  tiles: readonly TileCoord[],
  seed: number,
  stepYd = 5,
): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const t of tiles) {
    const b = tileBounds(t);
    for (let z = b.minZ; z <= b.maxZ; z += stepYd) {
      for (let x = b.minX; x <= b.maxX; x += stepYd) {
        const h = terrainHeight(x, z, seed);
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
  }
  return { min, max };
}

// ---------------------------------------------------------------- records

export interface UeFit {
  mode: PlacementFit['mode'];
  /** maxDim: target largest dimension; height/span: target height, in uu */
  sizeUu?: number;
  heightUu?: number;
  lengthUu?: number;
  /** raw: multiplier on the model's own size */
  scale?: number;
}

export interface UePlacement {
  id: string;
  source: string;
  /** asset-convert registry key, e.g. "props/well" */
  assetId: string;
  location: { x: number; y: number; z: number };
  yawDeg: number;
  fit: UeFit;
  seatOnGround: boolean;
  approximate?: true;
}

/** "/models/props/well.glb" -> "props/well" (the asset_registry.json key). */
export function assetIdOf(glbPath: string): string {
  return glbPath.replace(/^\/models\//, '').replace(/\.glb$/i, '');
}

export function fitToUe(f: PlacementFit): UeFit {
  switch (f.mode) {
    case 'maxDim':
      return { mode: 'maxDim', sizeUu: simLengthToUu(f.size) };
    case 'height':
      return { mode: 'height', heightUu: simLengthToUu(f.height) };
    case 'span':
      return {
        mode: 'span',
        lengthUu: simLengthToUu(f.length),
        heightUu: simLengthToUu(f.height),
      };
    case 'raw':
      return { mode: 'raw', scale: f.scale };
  }
}

export function placementToUe(p: ExportPlacement): UePlacement {
  return {
    id: p.id,
    source: p.source,
    assetId: assetIdOf(p.path),
    location: simToUe(p.x, p.y, p.z),
    yawDeg: simYawToUeYawDeg(p.rotY),
    fit: fitToUe(p.fit),
    seatOnGround: p.seatOnGround,
    ...(p.approximate ? { approximate: true as const } : {}),
  };
}

const ownedBy = (zoneId: string, x: number, z: number): boolean => zoneAt(x, z).id === zoneId;

/** Placements (props, buildings, fences, clutter, lamps) the zone owns. */
export function zonePlacements(
  zone: ZoneInfo,
  seed: number,
  propAssetUrl: (key: string) => string | null,
): UePlacement[] {
  return collectPlacements(zone.rect, seed, propAssetUrl)
    .filter((p) => ownedBy(zone.id, p.x, p.z))
    .map(placementToUe);
}

export interface UeRoad {
  id: string;
  kind: string;
  halfWidthUu: number;
  points: { x: number; y: number; z: number }[];
}

/** Polyline length-midpoint, the point that decides which zone owns a road. */
export function polylineMidpoint(pts: readonly { x: number; z: number }[]): {
  x: number;
  z: number;
} {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  let run = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (run <= seg && seg > 0) {
      const t = run / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t,
      };
    }
    run -= seg;
  }
  return { x: pts[0].x, z: pts[0].z };
}

export function roadToUe(r: ExportRoad, seed: number): UeRoad {
  return {
    id: r.id,
    kind: r.kind,
    halfWidthUu: simLengthToUu(r.halfWidth),
    points: r.points.map((p) => simToUe(p.x, terrainHeight(p.x, p.z, seed), p.z)),
  };
}

/** Roads and town streets whose midpoint lies in the zone, full polyline kept. */
export function zoneRoads(zone: ZoneInfo, roads: readonly ExportRoad[], seed: number): UeRoad[] {
  return roads
    .filter((r) => {
      const m = polylineMidpoint(r.points);
      return ownedBy(zone.id, m.x, m.z);
    })
    .map((r) => roadToUe(r, seed));
}

export interface UeWall {
  shape: 'box' | 'cylinder' | 'prism';
  location: { x: number; y: number; z: number };
  yawDeg?: number;
  /** box: half extents in uu (x = local width, y = local depth, z = half height) */
  halfExtentsUu?: { x: number; y: number; z: number };
  radiusUu?: number;
  /** prism: outline vertices relative to `location`, uu, in UE X/Y */
  outlineUu?: { x: number; y: number }[];
  src?: string;
  gate?: string;
}

export interface UeDungeon {
  id: string;
  name: string;
  interior: string;
  /** instance-local frame, origin at the instance origin */
  entry: { x: number; y: number; z: number };
  walls: UeWall[];
}

/** Default wall height when a collider carries no vertical extent (DUNGEON_WALL_HEIGHT). */
const WALL_HEIGHT_YD = 8;

export function colliderToWall(c: Collider): UeWall {
  const top = c.moveTopY ?? c.cameraTopY ?? WALL_HEIGHT_YD;
  const base = c.baseY ?? 0;
  const halfH = Math.max(0.05, (top - base) / 2);
  const location = simToUe(c.x, base + halfH, c.z);
  const meta = { ...(c.src ? { src: c.src } : {}), ...(c.gate ? { gate: c.gate } : {}) };
  if (c.type === 'circle') {
    return {
      shape: 'cylinder',
      location,
      radiusUu: simLengthToUu(c.r),
      halfExtentsUu: { x: 0, y: 0, z: simLengthToUu(halfH) },
      ...meta,
    };
  }
  if (c.type === 'obb') {
    return {
      shape: 'box',
      location,
      yawDeg: simYawToUeYawDeg(c.rot),
      halfExtentsUu: {
        x: simLengthToUu(c.hw),
        y: simLengthToUu(c.hd),
        z: simLengthToUu(halfH),
      },
      ...meta,
    };
  }
  const outline: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < c.poly.length; i += 2) {
    outline.push({ x: simLengthToUu(c.poly[i]), y: simLengthToUu(c.poly[i + 1]) });
  }
  return {
    shape: 'prism',
    location,
    halfExtentsUu: { x: 0, y: 0, z: simLengthToUu(halfH) },
    outlineUu: outline,
    ...meta,
  };
}

/** Wall colliders of every dungeon interior in its own instance-local frame. */
export function dungeonWalls(): UeDungeon[] {
  return DUNGEON_LIST.map((d) => ({
    id: d.id,
    name: d.name,
    interior: d.interior,
    entry: simToUe(d.entry.x, 0, d.entry.z),
    walls: interiorCollidersFor(d.id, d.interior, 0, 0).map(colliderToWall),
  }));
}
