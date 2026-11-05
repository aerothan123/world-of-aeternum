export type WyndTier = 'starter' | 'mid' | 'fine';
export type WyndTexelClass = 'shadow' | 'metal' | 'brass' | 'warm' | 'accent' | 'pale';
export interface WyndZoneCoords {
  t: number;
  r: number;
  z: number;
}
export interface WyndAddon {
  kind: 'band' | 'gem';
  t?: number;
  at?: string;
  swatch: string;
  size?: number;
}
export const WYND_TIERS: readonly WyndTier[];
export const WYND_TYPES: Record<string, { family: string; key: string }>;
export function wyndTierKey(type: string, tier: string): string;
export function rgbToHsv(r: number, g: number, b: number): [number, number, number];
export function hsvToRgb(h: number, s: number, v: number): [number, number, number];
export function classifyTexel(
  r: number,
  g: number,
  b: number,
  metal?: number | null,
): WyndTexelClass;
export function inTrimZone(type: string, t: number, r: number): boolean;
export function inGripZone(type: string, t: number): boolean;
export const TRIM_GILDS_ALL: ReadonlySet<string>;
export const WYND_RECIPES: Record<WyndTier, { roughness: number; metalness: number }>;
export function repaintTexel(
  tier: WyndTier,
  type: string,
  rgb: readonly number[],
  pos: WyndZoneCoords | null,
  metal?: number | null,
): [number, number, number];
export const WYND_SWATCHES: Record<string, [number, number, number]>;
export const WYND_ADDONS: Partial<Record<WyndTier, Record<string, WyndAddon[]>>>;
export function addonsFor(tier: string, type: string): WyndAddon[];
export function gemGeometry(
  c: readonly number[],
  size: number,
  depthAxis?: number,
): { positions: number[]; normals: number[] };
export function bandGeometry(
  cx: number,
  cz: number,
  y: number,
  r: number,
  height: number,
  seg?: number,
): { positions: number[]; normals: number[] };
export function rasterizeUv(
  W: number,
  H: number,
  uvs: ArrayLike<number>,
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
): { covered: Uint8Array; pos: Float32Array };
export function dilatePositions(
  W: number,
  H: number,
  covered: Uint8Array,
  pos: Float32Array,
  passes?: number,
): Uint8Array;
export function findFreeBlock(
  W: number,
  H: number,
  cov: Uint8Array,
  size: number,
  margin?: number,
): { x: number; y: number } | null;
export function zoneCoords(
  p: readonly number[],
  bounds: [number[], number[]],
  type: string,
): WyndZoneCoords;
