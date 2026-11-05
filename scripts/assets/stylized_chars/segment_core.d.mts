export const JOINT_REGION: Record<string, string>;
export const REGIONS: string[];
export const BOOT_LINE: number;
export function vertexRegion(
  jointNames: string[],
  idx: ArrayLike<number>,
  wts: ArrayLike<number>,
  p: number[],
  knee: Record<'l' | 'r', number[]>,
  ankle: Record<'l' | 'r', number[]>,
): string;
export function triangleRegion(r0: string, r1: string, r2: string): string;
export function splitByRegion(
  indices: ArrayLike<number>,
  regions: string[],
  keep?: ((region: string) => boolean) | null,
): Map<string, { vertices: number[]; indices: number[] }>;
