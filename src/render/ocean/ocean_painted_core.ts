// World Style Refined: the painted pass over the FFT water surface. Spliced by
// `oceanSurfaceFragment` into the above-water arm, right after the foam mix,
// ONLY when `opts.refined` is set, so the Classic fragment text stays
// byte-identical (pinned in tests/ocean_painted_core.test.ts).
//
// What it paints, all hue and highlight, never opacity:
//   STEPPED DEPTH BANDS: the shallow-to-deep tint in a few soft terraces of
//     baked shore depth, luminance preserved, so a coast reads as painted
//     bands of turquoise to deep blue instead of a smooth gradient.
//   SHORELINE FOAM BANDS: two thin lace rings that breathe in and out along
//     the waterline, torn by the foam texture, so the wash reads as brushed
//     strokes; they only thicken the foam cover the surf already has.
//   SOFT PAINTED HIGHLIGHTS: a share of the hard sun glitter is traded for a
//     broad soft sheen, so the sun path reads as a painted dab.
//   GENTLE WAVE MOTION: faint drifting ripple strokes on the body colour.
// Fairness: no term lowers what shows through the water (the transmitted
// `keep` share and the alpha are untouched outside the new foam rings, which
// sit on the waterline wash where surf already covers), so a floor mark or a
// creature under shallow water reads exactly as on Classic.

import { OCEAN_LOOP_SECONDS } from './ocean_spectrum_core';

/** Refined painted-water knobs (shader literals; tests read them back). */
export const PAINTED_WATER = {
  /** Shore depth (yards) over which the tint runs shallow to deep. */
  bandDepth: 5.5,
  /** Number of painted depth terraces. */
  bandSteps: 3,
  /** How far the body colour moves toward the stepped tint. */
  bandMix: 0.24,
  /** Horizontal distance (yards) of the two shoreline foam rings. */
  ringNear: 1.1,
  ringFar: 2.7,
  /** Half width of a foam ring (yards). */
  ringWidth: 0.32,
  /** Peak cover of the painted rings. */
  ringCover: 0.55,
  /** Share of the hard glitter traded for the soft sheen. */
  glitterTrade: 0.45,
  /** Brightness of the soft sheen. */
  sheen: 0.32,
  /** Brightness of the drifting ripple strokes. */
  ripple: 0.05,
} as const;

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));
const loopSpeed = (cycles: number): string => f((cycles * 2 * Math.PI) / OCEAN_LOOP_SECONDS);

/** The GLSL block (above-water arm only; every name it reads is in scope there). */
export function paintedWaterGlsl(): string {
  const p = PAINTED_WATER;
  return /* glsl */ `
  // ---- World Style Refined: painted water (ocean_painted_core.ts) ----
  {
    vec3 pwLuma = vec3(0.2126, 0.7152, 0.0722);
    float pwT = clamp(max(vShoreDepth, 0.0) / ${f(p.bandDepth)}, 0.0, 1.0) * ${f(p.bandSteps)};
    float pwStep = (floor(pwT) + smoothstep(0.38, 0.62, fract(pwT))) / ${f(p.bandSteps)};
    vec3 pwTint = mix(shallowCol, deepCol, clamp(pwStep, 0.0, 1.0));
    pwTint /= max(dot(pwTint, pwLuma), 1e-3);
    float pwBodyW = ${f(p.bandMix)} * (1.0 - foamCov) * (1.0 - F);
    col = mix(col, vec3(dot(col, pwLuma)) * pwTint, pwBodyW);
    // Soft painted sun: trade part of the hard glitter for a broad sheen.
    float pwH = clamp(dot(N, H), 0.0, 1.0);
    float pwH2 = pwH * pwH;
    float pwH8 = pwH2 * pwH2 * pwH2 * pwH2;
    float pwH32 = pwH8 * pwH8 * pwH8 * pwH8;
    col -= sunSpec * ${f(p.glitterTrade)};
    col += sunRad * keyLight * smoothstep(0.25, 0.7, pwH32) * ${f(p.sheen)} * (1.0 - foamCov);
    // Gentle drifting ripple strokes.
    float pwR = sin(dot(xz, vec2(0.23, 0.14)) + uTime * ${loopSpeed(36)} + lace * 2.2)
      * sin(dot(xz, vec2(-0.11, 0.19)) - uTime * ${loopSpeed(23)});
    col += ambient * ${f(p.ripple)} * smoothstep(0.55, 0.95, pwR) * (1.0 - foamCov) * exp(-camDist * 0.012);
    // Shoreline foam bands that breathe with the swell.
    float pwBreath = 0.5 + 0.5 * sin(uTime * ${loopSpeed(60)} + xz.x * 0.05 + xz.y * 0.037);
    float pwNear = 1.0 - smoothstep(0.0, ${f(p.ringWidth)}, abs(shoreDist - ${f(p.ringNear)} - pwBreath * 0.5));
    float pwFar = 1.0 - smoothstep(0.0, ${f(p.ringWidth)} * 0.8, abs(shoreDist - ${f(p.ringFar)} - pwBreath * 0.8));
    float pwRing = max(pwNear, pwFar * 0.6) * smoothstep(0.35, 0.65, lace * 0.8 + bubbles * 0.4);
    pwRing *= ${f(p.ringCover)} * mix(0.5, 1.0, swellEnergy) * exp(-camDist * 0.006);
    col = mix(col, foamCol, pwRing);
    keep *= 1.0 - pwRing;
    foamCov = clamp(foamCov + pwRing * (1.0 - foamCov), 0.0, 0.95);
    col = max(col, vec3(0.0));
  }`;
}
