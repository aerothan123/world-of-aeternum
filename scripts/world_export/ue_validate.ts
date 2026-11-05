// Export validation: height fidelity against the sim and asset coverage
// against the asset-convert registry. Both return reports; neither throws, so
// a missing asset id is listed for the asset crew instead of failing the run.
import fs from 'node:fs';
import { terrainHeight } from '../../src/sim/world';
import {
  decodeHeight,
  type HeightEncoding,
  QUAD_YD,
  TILE_VERTS,
  type TileCoord,
  tileBounds,
} from './ue_tiles';
import type { UePlacement } from './ue_zone_export';

export interface HeightReport {
  tile: string;
  /** worst |decoded - sim| over every sampled vertex, centimetres */
  maxVertexErrCm: number;
  /** worst |bilinear(decoded) - sim| at off-grid points, centimetres (Landscape triangle interpolation bound) */
  maxOffGridErrCm: number;
  samples: number;
}

/**
 * Compare a tile's quantized heights with terrainHeight. Vertices are checked
 * on a stride (every vertex when `stride` is 1); off-grid points sit at cell
 * centres where Unreal's interpolation is furthest from the lattice.
 */
export function validateTileHeights(
  name: string,
  t: TileCoord,
  heights: Uint16Array,
  enc: HeightEncoding,
  seed: number,
  stride = 7,
  /** per-vertex zone mask (255 inside a zone, 0 padding); off-grid cells are scored only when all four corners are inside */
  zoneMask?: Uint8Array,
): HeightReport {
  const b = tileBounds(t);
  const n = TILE_VERTS;
  let maxV = 0;
  let maxO = 0;
  let samples = 0;
  for (let j = 0; j < n; j += stride) {
    for (let i = 0; i < n; i += stride) {
      const sim = terrainHeight(b.minX + i * QUAD_YD, b.minZ + j * QUAD_YD, seed);
      const err = Math.abs(decodeHeight(heights[j * n + i], enc) - sim) * 100;
      if (err > maxV) maxV = err;
      samples++;
      const cellInside =
        !zoneMask ||
        (zoneMask[j * n + i] &&
          zoneMask[j * n + i + 1] &&
          zoneMask[(j + 1) * n + i] &&
          zoneMask[(j + 1) * n + i + 1]);
      if (i + 1 < n && j + 1 < n && cellInside) {
        const cx = b.minX + (i + 0.5) * QUAD_YD;
        const cz = b.minZ + (j + 0.5) * QUAD_YD;
        const h00 = decodeHeight(heights[j * n + i], enc);
        const h10 = decodeHeight(heights[j * n + i + 1], enc);
        const h01 = decodeHeight(heights[(j + 1) * n + i], enc);
        const h11 = decodeHeight(heights[(j + 1) * n + i + 1], enc);
        const bil = (h00 + h10 + h01 + h11) / 4;
        const e2 = Math.abs(bil - terrainHeight(cx, cz, seed)) * 100;
        if (e2 > maxO) maxO = e2;
      }
    }
  }
  return {
    tile: name,
    maxVertexErrCm: Math.round(maxV * 1000) / 1000,
    maxOffGridErrCm: Math.round(maxO * 1000) / 1000,
    samples,
  };
}

export interface AssetReport {
  registryFiles: string[];
  registrySize: number;
  referenced: number;
  /** asset ids placed in the world with no registry entry, with use counts */
  missing: { assetId: string; uses: number; zones: string[] }[];
}

/** Keys of the asset-convert registries that exist; absent files are skipped. */
export function loadRegistryKeys(files: readonly string[]): { keys: Set<string>; found: string[] } {
  const keys = new Set<string>();
  const found: string[] = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>;
      for (const k of Object.keys(j)) keys.add(k);
      found.push(f);
    } catch {
      // not there yet: reported through registryFiles being empty
    }
  }
  return { keys, found };
}

export function validateAssets(
  byZone: Record<string, readonly UePlacement[]>,
  registry: { keys: Set<string>; found: string[] },
): AssetReport {
  const uses = new Map<string, { n: number; zones: Set<string> }>();
  for (const [zone, list] of Object.entries(byZone)) {
    for (const p of list) {
      const u = uses.get(p.assetId) ?? { n: 0, zones: new Set<string>() };
      u.n++;
      u.zones.add(zone);
      uses.set(p.assetId, u);
    }
  }
  const missing = [...uses.entries()]
    .filter(([id]) => !registry.keys.has(id))
    .map(([assetId, u]) => ({ assetId, uses: u.n, zones: [...u.zones].sort() }))
    .sort((a, b) => b.uses - a.uses || (a.assetId < b.assetId ? -1 : 1));
  return {
    registryFiles: registry.found,
    registrySize: registry.keys.size,
    referenced: uses.size,
    missing,
  };
}
