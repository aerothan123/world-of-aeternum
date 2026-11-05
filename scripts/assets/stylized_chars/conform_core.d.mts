export interface ConformFrame {
  O: number[];
  R: number[];
  s: number;
  k: number;
  d: number[] | null;
  P: number[];
}
export const MAIN_JOINTS: Record<string, [string, string | null]>;
export const MAIN_CHILD: Record<string, string>;
export function stretch(v: number[], s: number, k: number, d: number[] | null): number[];
export function conformFrames(
  joints: { name: string; parent: number; pos: number[] }[],
  woc: Map<string, number[]>,
): { frames: ConformFrame[]; fitScale: number };
export function applyFrame(f: ConformFrame, x: number[]): number[];
export function conformVertex(
  v: number[],
  n: number[] | null,
  idx: ArrayLike<number>,
  wts: ArrayLike<number>,
  frames: ConformFrame[],
): { v: number[]; n: number[] | null };
