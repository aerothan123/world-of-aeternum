// How wooded the ground around the listener is (0 open, 1 a closed wood), for the region
// ambience's meadow-to-forest blend (region_ambience_core.ts). The world's trees come from
// a deterministic scatter, so the count per FOREST_CELL_YARDS cell never changes for a seed:
// each cell is counted once (over a square FOREST_REACH_YARDS a side round its centre),
// cached, and the readout bilinearly blends the four cells round the listener, so the
// density glides as the player walks instead of stepping at cell edges.
//
// At most FOREST_CELLS_PER_FRAME new cells are counted per call (a fresh login or a teleport
// fills the cache over a few frames; until then the last value holds). The cache is bounded:
// past FOREST_CACHE_CELLS it is cleared and refilled from where the player now stands.
//
// Pure and deterministic (RENDER_PURE_CORES): the tree count is injected.

/** Side of one counted cell (yards). */
export const FOREST_CELL_YARDS = 24;
/** Side of the square counted round each cell's centre (yards). */
export const FOREST_REACH_YARDS = 48;
/** Trees in one counted square at which the ground starts to read as a wood... */
export const FOREST_TREES_OPEN = 6;
/** ...and at which it is a closed wood. */
export const FOREST_TREES_CLOSED = 22;
export const FOREST_CELLS_PER_FRAME = 2;
export const FOREST_CACHE_CELLS = 1024;

/** Trees whose trunk lies inside the square, given its bounds. */
export type TreeCounter = (minX: number, maxX: number, minZ: number, maxZ: number) => number;

function smoothstep(e0: number, e1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export class ForestDensitySampler {
  private readonly cells = new Map<number, number>();
  private last = 0;
  private budget = 0;

  constructor(private readonly count: TreeCounter) {}

  /** A cell's density, counting it if the frame's budget allows (else undefined). */
  private cell(cx: number, cz: number): number | undefined {
    // cells are small integers either side of 0 (the world spans a few thousand yards)
    const key = (cx + 32768) * 65536 + (cz + 32768);
    const hit = this.cells.get(key);
    if (hit !== undefined) return hit;
    if (this.budget <= 0) return undefined;
    this.budget--;
    if (this.cells.size >= FOREST_CACHE_CELLS) this.cells.clear();
    const mx = (cx + 0.5) * FOREST_CELL_YARDS;
    const mz = (cz + 0.5) * FOREST_CELL_YARDS;
    const h = FOREST_REACH_YARDS / 2;
    const n = this.count(mx - h, mx + h, mz - h, mz + h);
    const d = smoothstep(FOREST_TREES_OPEN, FOREST_TREES_CLOSED, n);
    this.cells.set(key, d);
    return d;
  }

  /** The density at (x, z), 0..1. */
  sample(x: number, z: number): number {
    this.budget = FOREST_CELLS_PER_FRAME;
    const gx = x / FOREST_CELL_YARDS - 0.5;
    const gz = z / FOREST_CELL_YARDS - 0.5;
    const cx = Math.floor(gx);
    const cz = Math.floor(gz);
    const fx = gx - cx;
    const fz = gz - cz;
    const a = this.cell(cx, cz);
    const b = this.cell(cx + 1, cz);
    const c = this.cell(cx, cz + 1);
    const d = this.cell(cx + 1, cz + 1);
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      return this.last;
    }
    this.last = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
    return this.last;
  }
}
