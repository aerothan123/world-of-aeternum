export function ringMedian(rgb: Uint8Array, size: number, ring?: number): number[];
export function keyAlpha(rgb: Uint8Array, size: number, opts?: { t0?: number; t1?: number }): Buffer;
export function alphaStats(
  rgba: Uint8Array,
  width: number,
  height: number,
  threshold?: number,
): { bbox: { left: number; top: number; width: number; height: number } | null; cx: number; cy: number; coverage: number };
export function keepCenterComponent(rgba: Uint8Array, size: number, floor?: number): Uint8Array;
