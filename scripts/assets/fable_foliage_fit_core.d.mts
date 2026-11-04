export type FableKind =
  | 'broadleaf'
  | 'conifer'
  | 'dead'
  | 'bush'
  | 'flowering_bush'
  | 'mushroom'
  | 'rock';

export interface FableKindMaterials {
  readonly bark?: string;
  readonly leaf?: string;
  readonly flower?: string;
  readonly whole?: string;
}

export const FABLE_KIND_MATERIALS: Readonly<Record<FableKind, FableKindMaterials>>;
export const SPLIT_KINDS: readonly FableKind[];

export interface FableFoliageTarget {
  readonly name: string;
  readonly kind: FableKind;
  readonly height: number;
  readonly minY: number;
  readonly x: number;
  readonly z: number;
  readonly budget: number;
  readonly footprint?: readonly [number, number];
}

export const FABLE_FOLIAGE_TARGETS: readonly FableFoliageTarget[];
export const TRUNK_ANCHOR_BAND: readonly [number, number];
export const BROADLEAF_CROWN: number;
export const CONIFER_TRUNK_RADIUS: {
  readonly min: number;
  readonly max: number;
  readonly gain: number;
};
export const CONIFER_APEX: number;

export interface TextureImage {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

export interface Bounds {
  min: number[];
  max: number[];
}

export interface TriangleGeometry {
  centroids: Float64Array;
  areas: Float64Array;
}

export interface Adjacency {
  offsets: Int32Array;
  list: Int32Array;
}

export interface FableSourceGeometry {
  indices: ArrayLike<number>;
  positions: ArrayLike<number>;
  uvs: ArrayLike<number>;
  image: TextureImage;
}

export interface Fit {
  scale: [number, number, number];
  translation: [number, number, number];
}

export function srgbToLab(r: number, g: number, b: number): [number, number, number];
export function srgbToHsv(r: number, g: number, b: number): [number, number, number];
export function sampleTexel(image: TextureImage, u: number, v: number): [number, number, number];
export function triangleColours(
  indices: ArrayLike<number>,
  uvs: ArrayLike<number>,
  image: TextureImage,
): { rgb: Float64Array; lab: Float64Array };
export function triangleGeometry(
  indices: ArrayLike<number>,
  positions: ArrayLike<number>,
): TriangleGeometry;
export function indexedBounds(indices: ArrayLike<number>, positions: ArrayLike<number>): Bounds;
export function triangleAdjacency(
  indices: ArrayLike<number>,
  positions: ArrayLike<number>,
  weldEpsilon?: number,
): Adjacency;
export function seedLabels(
  kind: FableKind,
  geometry: TriangleGeometry,
  colours: { rgb: Float64Array; lab: Float64Array },
  bounds: Bounds,
): Int8Array;
export function fitGaussians(
  features: ArrayLike<number>,
  dims: number,
  labels: ArrayLike<number>,
  areas: ArrayLike<number>,
  classes: number,
): { mean: Float64Array; variance: Float64Array; weight: number }[];
export function classifyGaussian(
  features: ArrayLike<number>,
  dims: number,
  gaussians: readonly { mean: Float64Array; variance: Float64Array; weight: number }[],
  seeds: ArrayLike<number>,
): Int8Array;
export function smoothLabels(
  adjacency: Adjacency,
  labels: ArrayLike<number>,
  areas: ArrayLike<number>,
  classes: number,
  rounds?: number,
): Int8Array;
export function removeSmallIslands(
  adjacency: Adjacency,
  labels: ArrayLike<number>,
  areas: ArrayLike<number>,
  minArea: number,
  keep?: (label: number) => boolean,
): Int8Array;
export function coniferLabels(
  geometry: TriangleGeometry,
  bounds: Bounds,
): { labels: Int8Array; radius: number };
export function classifyFableTriangles(
  kind: FableKind,
  source: FableSourceGeometry,
): { labels: Int8Array; seeds: Int8Array; bounds: Bounds };
export function trunkAnchor(
  indices: ArrayLike<number>,
  positions: ArrayLike<number>,
  mask: ArrayLike<number | boolean>,
  bounds: Bounds,
  band?: readonly [number, number],
): { x: number; z: number } | null;
export function treeAnchor(
  indices: ArrayLike<number>,
  positions: ArrayLike<number>,
  barkMask: ArrayLike<number | boolean>,
  bounds: Bounds,
  band?: readonly [number, number],
): { x: number; z: number };
export function fitTransform(
  bounds: Bounds,
  anchor: { x: number; z: number },
  target: Pick<FableFoliageTarget, 'height' | 'minY' | 'x' | 'z' | 'footprint'>,
): Fit;
export function applyFit(positions: ArrayLike<number>, fit: Fit): Float32Array;
export function fitNormals(normals: ArrayLike<number>, fit: Fit): Float32Array;
export function atlasLayout(count: number): { cols: number; rows: number };
export function remapUvsToAtlasCell(
  uvs: ArrayLike<number>,
  index: number,
  layout: { cols: number; rows: number },
  inset?: number,
): Float32Array;
