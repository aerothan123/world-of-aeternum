export function blurField(
  field: Float32Array,
  w: number,
  h: number,
  r: number,
  wrap: boolean,
): Float32Array;
export function luminance(rgb: Float32Array, w: number, h: number): Float32Array;
export function lowFrequencyRange(rgb: Float32Array, w: number, h: number, radius: number): number;
export function flattenLowFrequency(
  rgb: Float32Array,
  w: number,
  h: number,
  opts: { radius: number; strength?: number },
): Float32Array;
export function valueNoise(x: number, y: number, seed: number): number;
export function tileMask(
  w: number,
  h: number,
  band: number,
  wobble?: number,
  axis?: 'x' | 'y',
): Float32Array;
export function makeTileable(
  rgb: Float32Array,
  w: number,
  h: number,
  opts?: { band?: number; edgeBias?: number; wobble?: number; seam?: boolean },
): Float32Array;
export function seamRatio(rgb: Float32Array, w: number, h: number): number;
export function heightFromColor(
  rgb: Float32Array,
  w: number,
  h: number,
  opts?: { highPass?: number; smoothR?: number },
): Float32Array;
export function normalFromHeight(
  height: Float32Array,
  w: number,
  h: number,
  strength: number,
): Uint8Array;
export function roughnessFromHeight(
  height: Float32Array,
  opts?: { base?: number; swing?: number },
): Uint8Array;
export function aoFromHeight(
  height: Float32Array,
  w: number,
  h: number,
  opts?: { radius?: number; gain?: number; floor?: number },
): Uint8Array;
export function gradeColor(
  rgb: Float32Array,
  opts?: { saturation?: number; gain?: number },
): Float32Array;
export function matchMean(
  rgb: Float32Array,
  target: readonly number[] | null,
  contrast?: number,
): Float32Array;
export interface PaintedGroundOptions {
  flattenRadius?: number;
  flattenStrength?: number;
  tileBand?: number;
  tileEdgeBias?: number;
  tileWobble?: number;
  heightHighPass?: number;
  normalStrength?: number;
  roughness?: number;
  aoGain?: number;
  saturation?: number;
  gain?: number;
  tileSeam?: boolean;
  /** sRGB 0..255 target mean colour. */
  targetMean?: readonly [number, number, number];
  contrast?: number;
  /** Centre share of the source kept before the resize (larger strokes). */
  crop?: number;
}
export function paintedGroundMaps(
  rgb: Float32Array,
  w: number,
  h: number,
  opts?: PaintedGroundOptions,
): { color: Float32Array; normal: Uint8Array; roughness: Uint8Array; ao: Uint8Array };
export function toBytes(rgb: Float32Array): Uint8Array;
export function fromBytes(bytes: Uint8Array): Float32Array;
