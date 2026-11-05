import type { FableKind, TextureImage } from './fable_foliage_fit_core.mjs';

export type Rgb = readonly [number, number, number];
export type UvRect = readonly [number, number, number, number];

export function seededRandom(seed: number): () => number;
export function seedOf(text: string): number;

export interface SheetKey {
  readonly lo: number;
  readonly hi: number;
}
export const SHEET_KEY: Readonly<{ dark: SheetKey; light: SheetKey }>;
export function sheetKeyFor(bg: ArrayLike<number>): SheetKey;
export function backgroundColour(image: TextureImage, band?: number): number[];
export function keyAlpha(image: TextureImage, bg: ArrayLike<number>, key?: SheetKey): Uint8Array;

export interface IslandRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
}
export function spriteIslands(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  opts?: { block?: number; grow?: number; minShare?: number },
): IslandRect[];

export type CardGroup = 'broadleaf' | 'blossom' | 'conifer' | 'twig' | 'dense';
export interface AtlasCellSpec {
  readonly group: CardGroup;
  readonly sheet: string | null;
  readonly island: number;
  readonly hang?: boolean;
  readonly of?: 'broadleaf' | 'conifer';
}
export interface LeafAtlasSpec {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly cols: number;
  readonly rows: number;
  readonly pad: number;
  readonly cells: readonly AtlasCellSpec[];
}
export type LeafFamily = 'broadleaf' | 'conifer' | 'twig';
export const LEAF_ATLASES: Readonly<Record<LeafFamily, LeafAtlasSpec>>;
export type CardKind = 'broadleaf' | 'conifer' | 'bush' | 'flowering_bush' | 'dead';
export const KIND_ATLAS: Readonly<Record<CardKind, LeafFamily>>;

export interface AtlasPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  aspect: number;
  cell: { left: number; top: number; width: number; height: number };
  uv: [number, number, number, number];
}
export function atlasPlacements(
  rects: readonly ({ x0: number; y0: number; x1: number; y1: number } | null)[],
  atlas: LeafAtlasSpec,
): AtlasPlacement[];
export function cellsOf(group: CardGroup, cells: readonly AtlasCellSpec[]): number[];
export function groupGains(
  meanLinear: readonly number[],
  target: Rgb,
  clamp?: readonly [number, number],
): number[];
export function bleedColour(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  rings?: number,
  cut?: number,
): Uint8Array;

export interface CardCell {
  readonly uv: UvRect | readonly number[];
  readonly aspect: number;
  readonly hang: boolean;
}
export interface PartData {
  indices: Uint32Array;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
}
export interface CardPart extends PartData {
  cards: number;
}
export interface CrownSurface {
  indices: ArrayLike<number>;
  positions: ArrayLike<number>;
  normals?: ArrayLike<number>;
}
export function surfaceCentre(indices: ArrayLike<number>, positions: ArrayLike<number>): number[];
export function innerHull(
  crown: CrownSurface,
  centre: readonly number[],
  uvRect: UvRect | readonly number[],
  opts?: {
    shrink?: number;
    shrinkY?: number;
    normalBend?: number;
    cellsPerUnit?: number;
    seed?: number;
  },
): PartData;

export interface LeafCardRecipe {
  readonly density: number;
  readonly size: readonly [number, number];
  readonly lift: readonly [number, number];
  readonly droop: number;
  readonly roll: number;
  readonly bend: number;
  readonly cross: number;
  readonly groups: Readonly<Partial<Record<CardGroup, number>>>;
}
export type RecipeName = 'broadleaf' | 'conifer' | 'bush' | 'flowering_bush';
export const LEAF_CARD_RECIPES: Readonly<Record<RecipeName, LeafCardRecipe>>;
export function scatterLeafCards(
  crown: CrownSurface,
  opts: {
    recipe: LeafCardRecipe;
    cells: Readonly<Partial<Record<CardGroup, readonly CardCell[]>>>;
    height: number;
    centre: readonly number[];
    seed: number;
    minY?: number;
    countScale?: number;
  },
): Partial<Record<CardGroup, CardPart>>;
export function scatterTwigCards(
  bark: CrownSurface,
  opts: {
    cells: readonly CardCell[];
    height: number;
    axis: readonly [number, number];
    seed: number;
    density?: number;
    size?: readonly [number, number];
    minHeight?: number;
    minReach?: number;
  },
): CardPart;
export function mergeParts(parts: readonly PartData[]): PartData;

export interface HullSpec {
  readonly budget: number;
  readonly shrink: number;
  readonly shrinkY?: number;
  readonly dense: 'broadleaf' | 'conifer';
}
export type LeafCardKind =
  | { readonly recipe: RecipeName; readonly hull: HullSpec }
  | { readonly twigs: true };
export const LEAF_CARD_KINDS: Readonly<Record<CardKind, LeafCardKind>>;
export const LEAF_GROUP_ALBEDO: Readonly<{ broadleaf: Rgb; conifer: Rgb }>;
export const LEAF_KIND_ALBEDO: Readonly<
  Record<'broadleaf' | 'conifer' | 'bush' | 'flowering_bush', Rgb>
>;
export function kindColourFactor(kind: FableKind): number[];
export function isLeafTexel(r: number, g: number, b: number): boolean;
export interface DenseStamp {
  cell: number;
  x: number;
  y: number;
  size: number;
  flip: boolean;
  shade: number;
}
export function denseStampPlan(
  seed: number,
  cellIndices: readonly number[],
  count?: number,
): DenseStamp[];
export const DENSE_BASE_SHADE: number;
export const CONIFER_CROWN_CORE_FROM: number;
export function coniferCoreToCrown(
  labels: ArrayLike<number>,
  geometry: { indices: ArrayLike<number>; positions: ArrayLike<number> },
  bounds: { min: readonly number[]; max: readonly number[] },
  from?: number,
): Int8Array;
