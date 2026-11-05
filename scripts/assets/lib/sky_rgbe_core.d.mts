export interface SkyImage {
  width: number;
  height: number;
  data: Float32Array;
}
export interface SunSpec {
  u: number;
  v: number;
  radiance?: number;
  radiusDeg?: number;
  haloDeg?: number;
  haloGain?: number;
  color?: [number, number, number];
}
export function srgbToLinear(c: number): number;
export function linearFromSrgb8(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  channels: number,
): SkyImage;
export function luminance(r: number, g: number, b: number): number;
export function sampleEquirect(img: SkyImage, u: number, v: number): [number, number, number];
export function resampleEquirect(img: SkyImage, width: number, height: number): SkyImage;
export function wrapSeam(img: SkyImage, frac?: number): SkyImage;
export function rowMean(img: SkyImage, y: number): [number, number, number];
export function settlePoles(
  img: SkyImage,
  opts?: {
    zenithV?: number;
    horizonV?: number;
    hazeV?: number;
    groundGain?: number;
    groundV?: number | null;
  },
): SkyImage;
export function scaleImage(img: SkyImage, k: number): SkyImage;
export function injectSun(img: SkyImage, sun: SunSpec): SkyImage;
export function brightestUv(img: SkyImage): { u: number; v: number; luminance: number };
export function skyIrradiance(img: SkyImage, gain: number, clamp: number): number;
export function calibrateExposure(
  build: (k: number) => SkyImage,
  target: number,
  gain: number,
  clamp: number,
  opts?: { lo?: number; hi?: number; iters?: number },
): number;
export function toRgbe(r: number, g: number, b: number): [number, number, number, number];
export function encodeRadiance(img: SkyImage): Buffer;
export function decodeRadiance(buf: Uint8Array): SkyImage;
export function previewSrgb8(img: SkyImage, exposure?: number): Uint8Array;
export function rollU(img: SkyImage, du: number): SkyImage;
export function findPaintedSun(
  img: SkyImage,
  opts?: { vMin?: number; vMax?: number; cols?: number; rows?: number; minContrast?: number },
): { u: number; v: number; luminance: number; contrast: number } | null;
export function findHorizon(img: SkyImage, opts?: { vMin?: number; vMax?: number }): number;
export function placeHorizon(
  img: SkyImage,
  horizon: number,
  opts?: { skyTop?: number; seaBottom?: number },
): SkyImage;
