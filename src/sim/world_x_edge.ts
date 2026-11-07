// The world's east and west edges as a pair. The shipped world was symmetric
// about x 0 (x -540..540), so render code tested `Math.abs(x)` against
// WORLD_MAX_X; the expansion's West March (src/sim/frontier/) put the west
// edge at x -900 while the east edge stayed at 540, and every such test read
// the whole March as "past the world rim" (rim haze tint, no grass, no near
// terrain chunks). These read the real pair. For a symmetric world each one
// equals the old expression, so the shipped box is unchanged by them.
//
// Pure leaf: no rng, no SimContext.
import { WORLD_MAX_X, WORLD_MIN_X } from './data';

/** The world's full east-west width. */
export const WORLD_WIDTH_X = WORLD_MAX_X - WORLD_MIN_X;

/** How far x lies inside the nearer of the east and west world edges
 *  (negative past one). `insideWorldX(x) < m` replaces `Math.abs(x) > MAX - m`. */
export function insideWorldX(x: number): number {
  return Math.min(x - WORLD_MIN_X, WORLD_MAX_X - x);
}

/** x mapped to 0..1 across the world's width (the world-planar texture u). */
export function worldU(x: number): number {
  return (x - WORLD_MIN_X) / WORLD_WIDTH_X;
}
