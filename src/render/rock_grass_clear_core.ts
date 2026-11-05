// Pure core for the Refined grass clearing around scatter rocks. A blade or
// tuft that grows up through a boulder reads as a rock sunk in a lawn, so the
// Refined world style keeps a bare collar at each rock's foot: a hard clear
// disc just inside the stone's visual footprint, then a thinning ring where
// about half of the blades survive so the collar fades back into the meadow
// instead of drawing a ring. Classic never calls this.
//
// Pure and DOM-free: the Three-free cache in `rock_grass_clear.ts` feeds it the
// rock decorations of one grid cell; this module only does the disc math.

/** One rock's clearing footprint, precomputed from its scale. */
export interface RockGrassDisc {
  x: number;
  z: number;
  /** Squared radius of the hard clear. */
  hard2: number;
  /** Squared radius of the outer edge of the thinning ring. */
  soft2: number;
}

/** Hard clear radius per unit of rock scale, plus a flat margin (yards). */
export const ROCK_GRASS_HARD = { perScale: 0.62, base: 0.2 } as const;
/** Thinning ring outer radius per unit of rock scale, plus a flat margin. */
export const ROCK_GRASS_SOFT = { perScale: 0.9, base: 0.5 } as const;
/** Share of blades kept inside the thinning ring. */
export const ROCK_GRASS_RING_KEEP = 0.5;

/** The disc for a rock of this scale at (x, z). */
export function rockGrassDisc(x: number, z: number, scale: number): RockGrassDisc {
  const hard = ROCK_GRASS_HARD.perScale * scale + ROCK_GRASS_HARD.base;
  const soft = ROCK_GRASS_SOFT.perScale * scale + ROCK_GRASS_SOFT.base;
  return { x, z, hard2: hard * hard, soft2: soft * soft };
}

/** Largest reach of any disc for rocks up to `maxScale` (yards). */
export function rockGrassMaxReach(maxScale: number): number {
  return ROCK_GRASS_SOFT.perScale * maxScale + ROCK_GRASS_SOFT.base;
}

// A stable per-position draw in [0, 1) so the thinning ring keeps the same
// blades on every rebuild of a chunk (no rng stream is consumed).
function positionHash(x: number, z: number): number {
  const s = Math.sin(Math.floor(x * 7.31) * 127.1 + Math.floor(z * 7.31) * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Whether a blade at (x, z) is cleared by any of these rock discs. */
export function rockGrassBlocked(discs: readonly RockGrassDisc[], x: number, z: number): boolean {
  for (const d of discs) {
    const dx = x - d.x;
    const dz = z - d.z;
    const r2 = dx * dx + dz * dz;
    if (r2 >= d.soft2) continue;
    if (r2 < d.hard2) return true;
    const t = (r2 - d.hard2) / (d.soft2 - d.hard2);
    // Inner part of the ring thins harder than the outer part.
    if (positionHash(x, z) > ROCK_GRASS_RING_KEEP + (1 - ROCK_GRASS_RING_KEEP) * t) return true;
  }
  return false;
}
