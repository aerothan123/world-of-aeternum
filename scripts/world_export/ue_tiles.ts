// Landscape tile grid for the Unreal export. One global grid anchored at the
// sim origin, so a tile has the same id and bytes whichever zone asks for it
// and World Partition streams one cell per tile. Each tile is a 2 x 2 section
// Landscape of 255-quad sections: 511 x 511 vertices, 0.5 yd per quad, 255 yd
// per side. Neighbouring tiles share their edge vertices exactly (both sample
// the same terrainHeight at the same world position), so there are no seams.

export const QUAD_YD = 0.5;
export const TILE_QUADS = 510;
export const TILE_VERTS = TILE_QUADS + 1;
export const TILE_YD = TILE_QUADS * QUAD_YD;
/** Landscape section layout the importer should use for these tiles. */
export const LANDSCAPE_LAYOUT = { quadsPerSection: 255, sectionsPerComponent: 2 } as const;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TileCoord {
  tx: number;
  tz: number;
}

const sign = (n: number): string => (n < 0 ? 'n' : 'p');

/** Stable file and asset name: tile_n02_p05 (n = negative, p = zero or positive). */
export function tileName(t: TileCoord): string {
  const pad = (n: number): string => String(Math.abs(n)).padStart(2, '0');
  return `tile_${sign(t.tx)}${pad(t.tx)}_${sign(t.tz)}${pad(t.tz)}`;
}

export function tileOf(x: number, z: number): TileCoord {
  return { tx: Math.floor(x / TILE_YD), tz: Math.floor(z / TILE_YD) };
}

export function tileBounds(t: TileCoord): Rect {
  return {
    minX: t.tx * TILE_YD,
    maxX: (t.tx + 1) * TILE_YD,
    minZ: t.tz * TILE_YD,
    maxZ: (t.tz + 1) * TILE_YD,
  };
}

/** Every tile whose area overlaps the rect (touching an edge does not count). */
export function tilesCovering(r: Rect): TileCoord[] {
  const out: TileCoord[] = [];
  const x1 = Math.ceil(r.maxX / TILE_YD) - 1;
  const z1 = Math.ceil(r.maxZ / TILE_YD) - 1;
  for (let tz = Math.floor(r.minZ / TILE_YD); tz <= z1; tz++) {
    for (let tx = Math.floor(r.minX / TILE_YD); tx <= x1; tx++) out.push({ tx, tz });
  }
  return out;
}

/** World position of vertex (i, j) of a tile. */
export function tileVertexPos(t: TileCoord, i: number, j: number): { x: number; z: number } {
  return { x: t.tx * TILE_YD + i * QUAD_YD, z: t.tz * TILE_YD + j * QUAD_YD };
}

/**
 * Height encoding shared by every tile: uint16 with 32768 = the world's
 * `zeroYd`, and `scaleZ` the Landscape Z scale (Unreal reads
 * uu = (v - 32768) * scaleZ / 128). `scaleZ` 100 resolves 0.78 cm over a
 * +-256 m range; the picker only raises it when the world needs more range.
 */
export interface HeightEncoding {
  zeroYd: number;
  scaleZ: number;
  /** worst-case quantization error in centimetres */
  stepCm: number;
}

export function pickHeightEncoding(minYd: number, maxYd: number): HeightEncoding {
  const zeroYd = Math.round((minYd + maxYd) / 2);
  const halfRangeUu = Math.max(maxYd - zeroYd, zeroYd - minYd) * 100;
  let scaleZ = 100;
  while ((32767 * scaleZ) / 128 < halfRangeUu + 1) scaleZ += 50;
  return { zeroYd, scaleZ, stepCm: scaleZ / 128 };
}

export function encodeHeight(yd: number, enc: HeightEncoding): number {
  const v = Math.round(32768 + ((yd - enc.zeroYd) * 100 * 128) / enc.scaleZ);
  return v < 0 ? 0 : v > 65535 ? 65535 : v;
}

export function decodeHeight(v: number, enc: HeightEncoding): number {
  return enc.zeroYd + ((v - 32768) * enc.scaleZ) / 128 / 100;
}
