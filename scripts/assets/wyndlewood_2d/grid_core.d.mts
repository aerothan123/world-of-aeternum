export function profile(gray: ArrayLike<number>, width: number, height: number, axis: 'x' | 'y'): Float64Array;
export function findRules(p: ArrayLike<number>, grid: number, opts?: { windowFrac?: number }): number[];
export function cellRects(
  xRules: number[],
  yRules: number[],
  opts?: { insetFrac?: number },
): { left: number; top: number; width: number; height: number }[];
export function refineRect(
  gray: ArrayLike<number>,
  width: number,
  rect: { left: number; top: number; width: number; height: number },
  opts?: { bandFrac?: number },
): { left: number; top: number; width: number; height: number };
