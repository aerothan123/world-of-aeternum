// The Eastbrook Vale v2 ground: the Unreal design's heightfield (imported by
// scripts/eastbrook_v2/import_eastbrook_v2.ts into field.generated.ts) laid over the
// shipped terrain inside the eastbrook_vale slot. world.ts applies it LAST in the
// terrain pad chain, so inside the field it is the ground, and the shipped shaping
// (the old island coast, the lake basin, the town plat stamps) only survives where
// the field eases back out: across the outer edge band (the slot's neighbours stay
// byte-identical) and along the corridors that keep a server connector the design
// does not carry (see data/eastbrook_v2/import_config.json).
//
// Built-in world only: an authored map, a linked map or a custom world never sees it.
// Pure leaf: the grid decodes once at module load, no rng, no clock.

import { isBuiltinWorldActive } from '../data';
import { EBV2_CORRIDORS, EBV2_FIELD_GRID, EBV2_HEIGHTS_B64 } from './field.generated';

const G = EBV2_FIELD_GRID;
const X1 = G.x0 + G.nx - 1;
const Z1 = G.z0 + G.nz - 1;

function decode(b64: string, count: number): Int16Array {
  // atob is a global in every host this runs in (browsers, Node 16+, workers).
  const raw = atob(b64);
  if (raw.length !== count * 2) throw new Error(`eastbrook v2 field: ${raw.length} bytes`);
  const out = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const v = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
    out[i] = v >= 0x8000 ? v - 0x10000 : v;
  }
  return out;
}

const HEIGHTS = decode(EBV2_HEIGHTS_B64, G.nx * G.nz);

/** True inside the imported field's rect (edges included). */
export function inEbv2Field(x: number, z: number): boolean {
  return x >= G.x0 && x <= X1 && z >= G.z0 && z <= Z1;
}

/** The design's own ground at (x, z), server frame, bilinear on the 1 yd grid
 *  (clamped to the rect). The raw field, before any blend. */
export function ebv2FieldHeight(x: number, z: number): number {
  const fx = Math.max(0, Math.min(G.nx - 1, x - G.x0));
  const fz = Math.max(0, Math.min(G.nz - 1, z - G.z0));
  const i0 = Math.min(G.nx - 2, Math.floor(fx));
  const j0 = Math.min(G.nz - 2, Math.floor(fz));
  const tx = fx - i0;
  const tz = fz - j0;
  const k = j0 * G.nx + i0;
  const a = HEIGHTS[k];
  const b = HEIGHTS[k + 1];
  const c = HEIGHTS[k + G.nx];
  const d = HEIGHTS[k + G.nx + 1];
  return ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz) / 100;
}

function smoothstep(e0: number, e1: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function segmentDistance(
  x: number,
  z: number,
  c: { ax: number; az: number; bx: number; bz: number },
): number {
  const dx = c.bx - c.ax;
  const dz = c.bz - c.az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - c.ax) * dx + (z - c.az) * dz) / len2)) : 0;
  return Math.hypot(x - (c.ax + dx * t), z - (c.az + dz * t));
}

/** How much of the design's ground stands at (x, z): 1 deep inside the field, 0 at
 *  its rect edge and inside every corridor's core, smooth in between. */
export function ebv2Weight(x: number, z: number): number {
  if (!inEbv2Field(x, z)) return 0;
  const inset = Math.min(x - G.x0, X1 - x, z - G.z0, Z1 - z);
  let w = smoothstep(0, G.edgeBand, inset);
  if (w === 0) return 0;
  for (const c of EBV2_CORRIDORS) {
    const d = segmentDistance(x, z, c);
    if (d >= c.halfWidth + c.blend) continue;
    w *= smoothstep(c.halfWidth, c.halfWidth + c.blend, d);
    if (w === 0) return 0;
  }
  return w;
}

/** The design owns the ground at or above this blend weight: its solids and trees
 *  stand there, and the shipped props, lamps and scatter stand down. Below it (the
 *  edge band's outer half, the corridors) the shipped world keeps its own. */
export const EBV2_OWNED = 0.5;

/** True where the design owns the ground (see EBV2_OWNED). Not world-gated: the
 *  callers gate on the built-in world themselves. */
export function ebv2Owns(x: number, z: number): boolean {
  return ebv2Weight(x, z) >= EBV2_OWNED;
}

/** The finished ground: the shipped height `h` with the design's field blended in
 *  by ebv2Weight. `h` unchanged outside the field or off the built-in world. */
export function ebv2Ground(x: number, z: number, h: number): number {
  if (!inEbv2Field(x, z) || !isBuiltinWorldActive()) return h;
  const w = ebv2Weight(x, z);
  if (w === 0) return h;
  return h + (ebv2FieldHeight(x, z) - h) * w;
}
