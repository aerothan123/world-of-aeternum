// World slice export: samples THE game world (the same sim terrain, scatter,
// placement and lighting functions the Three.js client draws from) over one
// rectangular slice and returns plain, engine-neutral data an external engine
// (Unity, Unreal, Godot) or an offline renderer can rebuild the slice from.
// Pure data in, typed arrays and records out: no DOM, no file IO (the thin
// CLI next to this file writes the files), no randomness of its own. Every
// number here comes from a live game function; the few export-side
// interpretations (cobble on the town streets, grass and flower density) are
// named where they are made.
//
// Coordinate frame: everything is emitted in the GAME frame (right-handed,
// +Y up, yards). A left-handed importer (Unity) converts by mirroring X
// (engineX = -gameX, engineYawDeg = -rotY in degrees), the same mirror the
// common glTF importers apply to the GLBs, so models and world stay consistent.
//
// Raster layout: every grid is row-major, row = z (from bounds.minZ upward),
// column = x (from bounds.minX upward), `res` samples per side, sample (i, j)
// at x = minX + i * step, z = minZ + j * step.

import {
  dayNightGrade,
  effectiveDayness,
  globalDayness,
  moonDirection,
  sunDirection,
} from '../../src/render/day_night_core';
import { BIOME_FOG, BIOME_GOD_RAYS, BIOME_LIGHT } from '../../src/render/outdoor_biome_presets';
import {
  beginChunkGeometry,
  fillChunkVertexRow,
  groundLushnessAt,
} from '../../src/render/terrain_chunk_build';
import { refinedGroundWeights } from '../../src/render/world_style_ground_core';
import { streetlampPlacements } from '../../src/sim/colliders';
import { ZONE1_FLOWER_MEADOWS } from '../../src/sim/content/zone1';
import { getActiveWorldContent } from '../../src/sim/data';
import { rockHeightOf } from '../../src/sim/decoration_dims';
import { EASTBROOK_LAYOUT } from '../../src/sim/eastbrook_layout';
import { grassClearedAt } from '../../src/sim/grass_clear';
import { generateGroundDressing } from '../../src/sim/ground_dressing';
import { fbm2, hash2 } from '../../src/sim/rng';
import type { BiomeId, ZonePropsDef } from '../../src/sim/types';
import {
  type Decoration,
  generateDecorationsInBounds,
  terrainHeight,
  waterBodies,
  waterLevel,
  zoneBiomeAt,
} from '../../src/sim/world';

export interface ExportBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The look-development slice: the Eastbrook hub and the heart of Eastbrook
 *  Vale (the zone band is z -180..180; the hub sits at (-14, -100)). Square so
 *  an engine terrain maps one to one. */
export const EASTBROOK_VALE_SLICE: ExportBounds = { minX: -224, maxX: 224, minZ: -224, maxZ: 224 };

/** The Proving Shore, the starter island the server spawns fresh players on
 *  (content/proving_shore.ts PROVING_SHORE_RECT, x -540 to -180, z -180 to
 *  180, hub Dawnrest Camp at -300, 50), padded 4 yd to a 368 yd square. */
export const PROVING_SHORE_SLICE: ExportBounds = { minX: -544, maxX: -176, minZ: -184, maxZ: 184 };

/** The slices the export can write, by output name. */
export const EXPORT_SLICES: Readonly<Record<string, ExportBounds>> = {
  eastbrook_vale: EASTBROOK_VALE_SLICE,
  proving_shore: PROVING_SHORE_SLICE,
};

/** Ground layers in splat order. */
export const GROUND_LAYERS = ['grass', 'dirt', 'sand', 'rock', 'cobble'] as const;
export type GroundLayer = (typeof GROUND_LAYERS)[number];

/** How a GLB is sized at placement. `maxDim` mirrors the client loader
 *  (largest source dimension normalized to `size` yards, render/asset_scale.ts);
 *  `height` fits the model's bounds height; `span` stretches local X to a
 *  length (fences); `raw` multiplies the model's own units (the scatter trees). */
export type PlacementFit =
  | { mode: 'maxDim'; size: number }
  | { mode: 'height'; height: number }
  | { mode: 'span'; length: number; height: number }
  | { mode: 'raw'; scale: number };

export interface ExportPlacement {
  /** stable id where the game has one, else `<source>:<index>` */
  id: string;
  /** which game table the record came from */
  source: string;
  /** public GLB url, e.g. "/models/props/well.glb" */
  path: string;
  x: number;
  /** ground under the anchor (terrainHeight), or the authored y */
  y: number;
  z: number;
  rotY: number;
  fit: PlacementFit;
  /** seat the model's lowest point on y (true) or place its origin at y */
  seatOnGround: boolean;
  /** true where the export had to guess the game's model or size */
  approximate?: true;
  /** market stalls: the layout's canopy colour (EASTBROOK_LAYOUT stalls) */
  canopyVariant?: string;
}

export type ScatterSpecies =
  | 'oak'
  | 'pine'
  | 'twisted'
  | 'dead'
  | 'rock'
  | 'bush'
  | 'bushFlowers'
  | 'fern'
  | 'mushroom';

export interface ExportScatter {
  species: ScatterSpecies;
  path: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  fit: PlacementFit;
}

export interface KeyLight {
  name: string;
  phase: number;
  sunDir: [number, number, number];
  moonDir: [number, number, number];
  dayness: number;
  grade: ReturnType<typeof dayNightGrade>;
}

export interface ExportRoad {
  id: string;
  kind: 'road' | 'street';
  halfWidth: number;
  points: { x: number; z: number }[];
}

export interface ExportPointLight {
  x: number;
  y: number;
  z: number;
  color: [number, number, number];
  range: number;
  source: string;
}

export interface WorldSliceExport {
  meta: {
    bounds: ExportBounds;
    res: number;
    step: number;
    seed: number;
    frame: string;
    rasterLayout: string;
    heightMin: number;
    heightMax: number;
    layers: readonly GroundLayer[];
    biome: BiomeId;
  };
  /** terrainHeight samples, res*res, game yards */
  heights: Float32Array;
  /** per-layer weights 0..1, res*res*layers (layer-interleaved per sample) */
  splat: Float32Array;
  /** the game's own baked ground tint (vertex colour), linear RGB res*res*3 */
  tint: Float32Array;
  /** grass detail density 0..1, res*res */
  grassDensity: Float32Array;
  /** wildflower detail density 0..1, res*res */
  flowerDensity: Float32Array;
  water: {
    seaLevel: number;
    lakes: { x: number; z: number; radius: number; level: number }[];
  };
  roads: ExportRoad[];
  placements: ExportPlacement[];
  scatter: ExportScatter[];
  lights: {
    keyLights: KeyLight[];
    biomeLight: (typeof BIOME_LIGHT)[BiomeId];
    biomeFog: (typeof BIOME_FOG)[BiomeId];
    godRays: number | null;
    pointLights: ExportPointLight[];
  };
}

const inside = (b: ExportBounds, x: number, z: number, pad = 0): boolean =>
  x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, v: number): number => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Distance from a point to a polyline (plain, no meander: the town streets
 *  are authored exactly). */
function polylineDistance(
  points: readonly { x: number; z: number }[],
  x: number,
  z: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 > 0 ? clamp01(((x - a.x) * abx + (z - a.z) * abz) / len2) : 0;
    const d = Math.hypot(x - a.x - abx * t, z - a.z - abz * t);
    if (d < best) best = d;
  }
  return best;
}

/** Sample terrainHeight on the export grid. */
export function sampleHeights(b: ExportBounds, res: number, seed: number): Float32Array {
  const step = (b.maxX - b.minX) / (res - 1);
  const out = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    const z = b.minZ + j * step;
    for (let i = 0; i < res; i++) out[j * res + i] = terrainHeight(b.minX + i * step, z, seed);
  }
  return out;
}

/**
 * Ground layers and tint from the client's own terrain sampler: the splat-tier
 * chunk builder (render/terrain_chunk_build.ts) is run over the slice in
 * chunks whose vertex lattice IS the export grid, and its per-vertex
 * (grass, dirt, rock, sand) weights and baked tint are read back. Cobble is
 * split off the rock weight with the Refined paving rule (flat rock is laid
 * stone, render/world_style_ground_core.ts) and laid on the Eastbrook town
 * streets (sim/eastbrook_layout.ts roads), the one export-side interpretation:
 * the client paints those streets as packed dirt, the look target paves them.
 */
export function sampleGround(
  b: ExportBounds,
  res: number,
  seed: number,
  chunkCells = 128,
): { splat: Float32Array; tint: Float32Array; normalY: Float32Array } {
  const cells = res - 1;
  if (cells % chunkCells !== 0) {
    throw new Error(`res-1 (${cells}) must be a multiple of ${chunkCells}`);
  }
  const step = (b.maxX - b.minX) / cells;
  const chunkSize = chunkCells * step;
  const nLayers = GROUND_LAYERS.length;
  const splat = new Float32Array(res * res * nLayers);
  const tint = new Float32Array(res * res * 3);
  const normalY = new Float32Array(res * res);
  const sea = waterLevel();
  const streets = EASTBROOK_LAYOUT.roads;
  const chunks = cells / chunkCells;
  for (let cz = 0; cz < chunks; cz++) {
    for (let cx = 0; cx < chunks; cx++) {
      const x0 = b.minX + cx * chunkSize;
      const z0 = b.minZ + cz * chunkSize;
      const st = beginChunkGeometry(x0, z0, chunkSize, step, seed, true, 0, false);
      if (st.nx !== chunkCells) throw new Error(`chunk lattice ${st.nx} != ${chunkCells}`);
      for (let gj = 0; gj < st.gh; gj++) fillChunkVertexRow(st, gj);
      const splats = st.splats as Float32Array;
      const extras = st.extras as Float32Array;
      for (let cj = 0; cj <= chunkCells; cj++) {
        for (let ci = 0; ci <= chunkCells; ci++) {
          const vi = (cj + 1) * st.gw + (ci + 1); // skip the skirt ring
          const gi = cx * chunkCells + ci;
          const gj = cz * chunkCells + cj;
          const o = gj * res + gi;
          const x = b.minX + gi * step;
          const z = b.minZ + gj * step;
          const grass = splats[vi * 4];
          const dirt = splats[vi * 4 + 1];
          const rock = splats[vi * 4 + 2];
          const sand = splats[vi * 4 + 3];
          const ny = st.normals[vi * 3 + 1];
          const r = st.colors[vi * 3];
          const g = st.colors[vi * 3 + 1];
          const bl = st.colors[vi * 3 + 2];
          const paving = refinedGroundWeights({
            grass,
            rock,
            tintLuma: 0.2126 * r + 0.7152 * g + 0.0722 * bl,
            normalY: ny,
            marsh: extras[vi * 4],
            heightAboveWater: st.positions[vi * 3 + 1] - sea,
            variantNoise: 0.5,
            snow: extras[vi * 4 + 1],
          }).paving;
          let w = [grass, dirt, sand, Math.max(0, rock - paving), paving];
          let street = 0;
          for (const s of streets) {
            const d = polylineDistance(s.points, x, z);
            street = Math.max(street, 1 - smooth(s.halfWidth - 0.4, s.halfWidth + 0.6, d));
          }
          if (street > 0) w = w.map((v, k) => v * (1 - street) + (k === 4 ? street : 0));
          const sum = w.reduce((a, v) => a + v, 0) || 1;
          for (let k = 0; k < nLayers; k++) splat[o * nLayers + k] = w[k] / sum;
          tint[o * 3] = r;
          tint[o * 3 + 1] = g;
          tint[o * 3 + 2] = bl;
          normalY[o] = ny;
        }
      }
    }
  }
  return { splat, tint, normalY };
}

/** The client's catalogue target size for a placed GLB (render/asset_scale.ts
 *  targetHeightFor, the foliage and palm arms; everything else 2 yd, the
 *  loader's TARGET_HEIGHT). A small mirror because asset_scale.ts is not
 *  importable outside the browser bundle. */
export function targetSizeForPath(path: string): number {
  if (/beach_palm/i.test(path)) return 4;
  const m = /\/foliage\/([a-z0-9_]+)\.glb$/i.exec(path);
  if (!m) return 2;
  if (/^(oak|pine|twisted|dead)/.test(m[1])) return 7.5;
  if (/^bush/.test(m[1])) return 3.2;
  if (/^(fern|mushroom)/.test(m[1])) return 1.6;
  if (/^rock/.test(m[1])) return 2.4;
  return 2;
}

/** Every placed prop, building and fence the client draws from the shipped
 *  world content inside the bounds. Sizes follow what the client does with the
 *  record; `approximate` marks the tables whose client model choice is a
 *  per-instance hash or a procedural build the export does not replicate. */
export function collectPlacements(
  b: ExportBounds,
  seed: number,
  propAssetUrl: (key: string) => string | null,
): ExportPlacement[] {
  const w = getActiveWorldContent();
  const P: ZonePropsDef = w.props;
  const out: ExportPlacement[] = [];
  const add = (p: Omit<ExportPlacement, 'y'> & { y?: number }) =>
    out.push({ ...p, y: p.y ?? terrainHeight(p.x, p.z, seed) });

  for (const [i, p] of (w.placements ?? []).entries()) {
    if (!inside(b, p.x, p.z)) continue;
    add({
      id: `placement:${i}`,
      source: 'placements',
      path: p.path,
      x: p.x,
      z: p.z,
      y: p.y ?? p.groundY,
      rotY: p.rotY,
      fit: { mode: 'maxDim', size: targetSizeForPath(p.path) * (p.scale || 1) },
      seatOnGround: p.y === undefined,
    });
  }
  const layoutBuildings = new Map(EASTBROOK_LAYOUT.buildings.map((lb) => [lb.id, lb]));
  for (const [i, bd] of P.buildings.entries()) {
    if (!bd.assetId || !inside(b, bd.x, bd.z)) continue;
    // A painted town building stands as render/eastbrook_placed_building.ts
    // stands it: at its layout anchor and turn, one uniform scale, its
    // lowest point on the ground and then sunk by the layout's lift.
    const placed = bd.id ? layoutBuildings.get(bd.id)?.placement : undefined;
    const x = placed?.x ?? bd.x;
    const z = placed?.z ?? bd.z;
    add({
      id: bd.id ?? `building:${i}`,
      source: 'buildings',
      path: bd.assetId,
      x,
      z,
      y: terrainHeight(x, z, seed) + (placed?.lift ?? 0),
      rotY: placed?.rotation ?? bd.rot,
      fit: { mode: 'raw', scale: placed?.scale ?? 1 },
      seatOnGround: true,
    });
  }
  for (const [i, s] of P.wells.entries()) {
    if (!inside(b, s.x, s.z)) continue;
    add({
      id: s.id ?? `well:${i}`,
      source: 'wells',
      path: s.assetId ?? '/models/props/well.glb',
      x: s.x,
      z: s.z,
      rotY: 0,
      fit: s.height ? { mode: 'height', height: s.height } : { mode: 'maxDim', size: s.r * 2 },
      seatOnGround: true,
      ...(s.assetId ? {} : { approximate: true as const }),
    });
  }
  for (const [i, s] of P.stalls.entries()) {
    if (!inside(b, s.x, s.z)) continue;
    add({
      id: s.id ?? `stall:${i}`,
      source: 'stalls',
      path: s.assetId ?? '/models/props/market_stand_1.glb',
      x: s.x,
      z: s.z,
      rotY: s.rot,
      fit: s.height ? { mode: 'height', height: s.height } : { mode: 'maxDim', size: s.r * 2 },
      seatOnGround: true,
      ...(s.assetId ? {} : { approximate: true as const }),
      ...(s.canopyVariant ? { canopyVariant: s.canopyVariant } : {}),
    });
  }
  for (const [i, f] of P.fences.entries()) {
    const mx = (f.x1 + f.x2) / 2;
    const mz = (f.z1 + f.z2) / 2;
    if (!inside(b, mx, mz)) continue;
    add({
      id: f.id ?? `fence:${i}`,
      source: 'fences',
      path: f.assetId ?? '/models/props/fence.glb',
      x: mx,
      z: mz,
      // local +X runs from end 1 to end 2 (a Three Y rotation maps local +X to (cos, -sin))
      rotY: Math.atan2(-(f.z2 - f.z1), f.x2 - f.x1),
      fit: { mode: 'span', length: Math.hypot(f.x2 - f.x1, f.z2 - f.z1), height: f.height ?? 1.1 },
      seatOnGround: true,
      ...(f.assetId ? {} : { approximate: true as const }),
    });
  }
  for (const [i, s] of (P.benches ?? []).entries()) {
    if (!inside(b, s.x, s.z)) continue;
    add({
      id: s.id ?? `bench:${i}`,
      source: 'benches',
      path: s.assetId ?? '/models/dungeon/bench.glb',
      x: s.x,
      z: s.z,
      rotY: s.rot,
      fit: { mode: 'height', height: s.height ?? 1 },
      seatOnGround: true,
    });
  }
  for (const [i, d] of (P.decorProps ?? []).entries()) {
    if (!inside(b, d.x, d.z)) continue;
    const url = propAssetUrl(d.key);
    if (!url) continue;
    add({
      id: `decor:${d.key}:${i}`,
      source: 'decorProps',
      path: url,
      x: d.x,
      z: d.z,
      rotY: d.rot ?? 0,
      fit: d.h ? { mode: 'height', height: d.h } : { mode: 'maxDim', size: (d.scale ?? 1) * 2 },
      seatOnGround: d.float === undefined,
      ...(d.float !== undefined ? { y: waterLevel() + d.float } : {}),
      approximate: true,
    });
  }
  // camp and harbour clutter: the client picks a model per instance by hash
  const clutter = (
    source: string,
    list: readonly { x: number; z: number; rot?: number; scale?: number }[],
    key: string,
    size: number,
  ) => {
    const url = propAssetUrl(key);
    if (!url) return;
    for (const [i, c] of list.entries()) {
      if (!inside(b, c.x, c.z)) continue;
      add({
        id: `${source}:${i}`,
        source,
        path: url,
        x: c.x,
        z: c.z,
        rotY: c.rot ?? hash2(Math.floor(c.x * 7), Math.floor(c.z * 7), seed + 811) * Math.PI * 2,
        fit: { mode: 'maxDim', size: size * (c.scale ?? 1) },
        seatOnGround: true,
        approximate: true,
      });
    }
  };
  const pair = (l: readonly (readonly [number, number, ...unknown[]])[]) =>
    l.map((e) => ({ x: e[0], z: e[1] }));
  clutter('tents', P.tents, 'tentOpen', 3.2);
  clutter('crates', pair(P.crates), 'crateWooden', 1);
  clutter('campfires', pair(P.campfires), 'bonfire', 1.4);
  clutter('docks', P.docks, 'dockPlatform', 8);
  clutter('graveyards', P.graveyards, 'graveRound', 1.2);
  clutter('mines', P.mines, 'oreRocks', 3);
  clutter('mudHuts', pair(P.mudHuts), 'mudfinHutA', 4);
  const column = propAssetUrl('column');
  const broken = propAssetUrl('columnBroken');
  for (const [ri, ring] of P.ruinRings.entries()) {
    if (!column || !inside(b, ring.x, ring.z)) continue;
    for (let c = 0; c < ring.columns; c++) {
      if (ring.omit?.includes(c)) continue;
      const a = (c / ring.columns) * Math.PI * 2;
      add({
        id: `ruin:${ri}:${c}`,
        source: 'ruinRings',
        path: c % 3 === 2 && broken ? broken : column,
        x: ring.x + Math.cos(a) * ring.ringR,
        z: ring.z + Math.sin(a) * ring.ringR,
        rotY: -a,
        fit: { mode: 'maxDim', size: 4 },
        seatOnGround: true,
        approximate: true,
      });
    }
  }
  for (const [i, lamp] of streetlampPlacements(seed).entries()) {
    if (!inside(b, lamp.x, lamp.z)) continue;
    add({
      id: `streetlamp:${i}`,
      source: 'streetlamps',
      path: `/models/props/streetlamp_${lamp.style}.glb`,
      x: lamp.x,
      z: lamp.z,
      y: lamp.y,
      rotY: lamp.roadYaw,
      fit: { mode: 'height', height: 5.5 },
      seatOnGround: true,
      approximate: true,
    });
  }
  return out;
}

const FOLIAGE = '/models/foliage/';
const TREE_VARIANTS = {
  pine: [1, 2, 4, 5],
  oak: [1, 2, 3, 4, 5],
  twisted: [1, 2, 3],
  dead: [1, 2, 3],
} as const;
const BASE_SCALE = { pine: 1.1, oak: 1.15, twisted: 0.5, dead: 0.7 } as const;

/** Species routing of render/foliage.ts for a procedural decoration. */
export function decorationSpecies(d: Decoration): 'oak' | 'pine' | 'twisted' | 'dead' | 'rock' {
  if (d.kind === 'rock') return 'rock';
  const broadleaf = d.biome === 'vale' || d.biome === 'fen' || d.biome === 'amber';
  const gnarled = d.biome === 'marsh' || d.biome === 'dusk';
  if (d.kind === 'tree') return broadleaf ? 'oak' : 'pine';
  if (!gnarled) return 'oak';
  if (d.biome === 'dusk') return 'twisted';
  return hash2(Math.floor(d.x * 10), Math.floor(d.z * 10), 19) >= 0.35 ? 'twisted' : 'dead';
}

/** Trees, rocks and ground dressing (bushes, ferns, mushrooms). */
export function collectScatter(b: ExportBounds, seed: number): ExportScatter[] {
  const out: ExportScatter[] = [];
  for (const d of generateDecorationsInBounds(seed, b)) {
    if (!inside(b, d.x, d.z)) continue;
    const species = decorationSpecies(d);
    const y = terrainHeight(d.x, d.z, seed);
    const rotY = hash2(Math.floor(d.x * 13), Math.floor(d.z * 13), seed + 401) * Math.PI * 2;
    if (species === 'rock') {
      out.push({
        species,
        path: `${FOLIAGE}rock_${1 + (d.variant % 3)}.glb`,
        x: d.x,
        y,
        z: d.z,
        rotY,
        fit: { mode: 'height', height: rockHeightOf(d, seed) },
      });
      continue;
    }
    const variants = TREE_VARIANTS[species];
    out.push({
      species,
      path: `${FOLIAGE}${species}_${variants[d.variant % variants.length]}.glb`,
      x: d.x,
      y,
      z: d.z,
      rotY,
      fit: { mode: 'raw', scale: BASE_SCALE[species] * d.scale },
    });
  }
  const files = { bush: 'bush', bushFlowers: 'bush_flowers', fern: 'fern', mushroom: 'mushroom' };
  for (const s of generateGroundDressing(seed, { bounds: b })) {
    if (!inside(b, s.x, s.z)) continue;
    const path = `${FOLIAGE}${files[s.kind]}.glb`;
    out.push({
      species: s.kind,
      path,
      x: s.x,
      y: terrainHeight(s.x, s.z, seed),
      z: s.z,
      rotY: hash2(Math.floor(s.x * 11), Math.floor(s.z * 11), seed + 409) * Math.PI * 2,
      fit: { mode: 'maxDim', size: targetSizeForPath(path) * s.scale },
    });
  }
  return out;
}

/**
 * Grass and wildflower detail density. The client draws blades by the grass
 * splat weight and thickens them on the lush patches of the ground palette's
 * own noise (render/terrain_chunk_build.ts groundLushnessAt); flowers bloom in
 * the authored vale meadow circles (sim/content/zone1.ts, read by
 * render/flower_meadows_core.ts) and, export-side, sparsely along the lush
 * turf. Density is zero under water, on steep ground, in painted no-grass
 * discs and under placed footprints.
 */
export function sampleDetailDensity(
  b: ExportBounds,
  res: number,
  seed: number,
  heights: Float32Array,
  splat: Float32Array,
  normalY: Float32Array,
  placements: readonly ExportPlacement[],
): { grass: Float32Array; flowers: Float32Array } {
  const step = (b.maxX - b.minX) / (res - 1);
  const nL = GROUND_LAYERS.length;
  const grass = new Float32Array(res * res);
  const flowers = new Float32Array(res * res);
  const clears = getActiveWorldContent().grassClear;
  const sea = waterLevel();
  const solids = placements
    .map((p) => ({
      x: p.x,
      z: p.z,
      r: p.fit.mode === 'maxDim' ? p.fit.size * 0.45 : p.fit.mode === 'height' ? 1.2 : 0,
    }))
    .filter((c) => c.r > 0.6);
  const lakes = waterBodies();
  for (let j = 0; j < res; j++) {
    const z = b.minZ + j * step;
    for (let i = 0; i < res; i++) {
      const x = b.minX + i * step;
      const o = j * res + i;
      if (heights[o] < sea + 0.15 || grassClearedAt(clears, x, z)) continue;
      let blocked = false;
      for (const l of lakes) {
        if (heights[o] < sea + 0.6 && Math.hypot(x - l.x, z - l.z) < l.radius * 0.55)
          blocked = true;
      }
      for (const c of solids) {
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz < c.r * c.r) blocked = true;
      }
      if (blocked) continue;
      const flat = smooth(0.72, 0.9, normalY[o]);
      const dens = splat[o * nL] * flat * (0.35 + 0.65 * groundLushnessAt(x, z, seed));
      grass[o] = clamp01(dens);
      let meadow = 0;
      for (const m of ZONE1_FLOWER_MEADOWS) {
        meadow = Math.max(meadow, 1 - smooth(m.r * 0.6, m.r * 1.15, Math.hypot(x - m.x, z - m.z)));
      }
      const scatter = smooth(0.62, 0.78, fbm2(x * 0.09, z * 0.09, seed + 977, 2)) * 0.35;
      flowers[o] = clamp01(Math.max(meadow, scatter) * dens * 1.4);
    }
  }
  return { grass, flowers };
}

/** The look-target times of day plus noon and midnight, on the client's sun
 *  path (render/day_night_core.ts sunDirection) and grade. */
export const KEY_LIGHT_PHASES: readonly { name: string; phase: number }[] = [
  { name: 'morning', phase: 0.32 },
  { name: 'noon', phase: 0.5 },
  { name: 'late_afternoon', phase: 0.64 },
  { name: 'golden_hour', phase: 0.705 },
  { name: 'dusk', phase: 0.75 },
  { name: 'midnight', phase: 0.0 },
];

export function keyLights(biome: BiomeId): KeyLight[] {
  return KEY_LIGHT_PHASES.map(({ name, phase }) => {
    const dayness = effectiveDayness(globalDayness(phase), biome);
    return {
      name,
      phase,
      sunDir: sunDirection(phase),
      moonDir: moonDirection(phase),
      dayness,
      grade: dayNightGrade(dayness, biome),
    };
  });
}

/** Run the whole export. `cells` is the heightmap cell count per side (1024
 *  gives a 1025-sample heightmap, the 2^n + 1 shape engine terrains take). */
export function exportWorldSlice(
  b: ExportBounds,
  seed: number,
  propAssetUrl: (key: string) => string | null,
  cells = 1024,
): WorldSliceExport {
  const res = cells + 1;
  const step = (b.maxX - b.minX) / cells;
  const heights = sampleHeights(b, res, seed);
  const { splat, tint, normalY } = sampleGround(b, res, seed);
  const placements = collectPlacements(b, seed, propAssetUrl);
  const scatter = collectScatter(b, seed);
  const { grass, flowers } = sampleDetailDensity(b, res, seed, heights, splat, normalY, placements);
  let hMin = Number.POSITIVE_INFINITY;
  let hMax = Number.NEGATIVE_INFINITY;
  for (const h of heights) {
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }
  const roads: ExportRoad[] = [];
  for (const [i, r] of getActiveWorldContent().roads.entries()) {
    if (!r.some((p) => inside(b, p.x, p.z, 20))) continue;
    roads.push({ id: `road:${i}`, kind: 'road', halfWidth: 1.9, points: r.map((p) => ({ ...p })) });
  }
  for (const s of EASTBROOK_LAYOUT.roads) {
    roads.push({
      id: `eastbrook:${s.id}`,
      kind: 'street',
      halfWidth: s.halfWidth,
      points: s.points.map((p) => ({ x: p.x, z: p.z })),
    });
  }
  const biome = zoneBiomeAt((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
  const lakes = waterBodies()
    .filter((l) => inside(b, l.x, l.z, l.radius))
    .map((l) => ({ ...l, level: waterLevel() }));
  const pointLights: ExportPointLight[] = streetlampPlacements(seed)
    .filter((l) => inside(b, l.x, l.z))
    .map((l) => ({
      x: l.x,
      y: l.y + 4.6,
      z: l.z,
      color: [1, 0.72, 0.42],
      range: 9,
      source: `streetlamp:${l.style}`,
    }));
  return {
    meta: {
      bounds: b,
      res,
      step,
      seed,
      frame:
        'game: right-handed, +Y up, yards; left-handed engines mirror X: engineX = -x, engineYawDeg = -rotY*180/PI',
      rasterLayout: 'row-major, row = z from minZ, column = x from minX',
      heightMin: hMin,
      heightMax: hMax,
      layers: GROUND_LAYERS,
      biome,
    },
    heights,
    splat,
    tint,
    grassDensity: grass,
    flowerDensity: flowers,
    water: { seaLevel: waterLevel(), lakes },
    roads,
    placements,
    scatter,
    lights: {
      keyLights: keyLights(biome),
      biomeLight: BIOME_LIGHT[biome],
      biomeFog: BIOME_FOG[biome],
      godRays: BIOME_GOD_RAYS[biome] ?? null,
      pointLights,
    },
  };
}

/** Quantize a height raster to unsigned 16-bit over [min, max]. */
export function quantizeHeights(h: Float32Array, min: number, max: number): Uint16Array {
  const out = new Uint16Array(h.length);
  const span = max - min || 1;
  for (let i = 0; i < h.length; i++) out[i] = Math.round(clamp01((h[i] - min) / span) * 65535);
  return out;
}

/** Quantize 0..1 floats to bytes. */
export function quantizeUnit(v: Float32Array): Uint8Array {
  const out = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = Math.round(clamp01(v[i]) * 255);
  return out;
}

/** Parse the client's prop asset table (render/props.ts PROP_ASSET_DEFS,
 *  `key: { url: '...' }` rows) out of its source text: props.ts itself is
 *  bundle-only (it reaches import.meta.env through the asset loader). */
export function parsePropAssetUrls(propsSource: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /^\s+([A-Za-z0-9_]+):\s*\{\s*url:\s*'([^']+\.glb)'/gm;
  for (let m = re.exec(propsSource); m; m = re.exec(propsSource)) out[m[1]] = m[2];
  return out;
}
