// World Style: the thin painter over world_style_core.ts. It owns the ONE shared
// uniform block every Refined consumer (terrain, far vista, sky dome, output
// grade) binds by reference, and writes it once per frame from the day/night
// grade the renderer already computes. Classic never touches any of it: every
// entry point below returns its input (or does nothing) when the active
// profile's style is Classic, so the Classic frame is the shipped frame.
//
// No GPU producer lives here. The style selects compile-time VARIANTS of
// materials that already exist and already have their prewarm homes (the
// terrain splat and Lambert materials, the far vista tiles, the sky dome, the
// grade pass and its FXAA twin); the variant is fixed for the renderer's
// lifetime and a style change rides the full graphics rebuild.

import * as THREE from 'three';
import { WATER_LEVEL } from '../sim/world';
import type { DayNightGrade } from './day_night_core';
import { GFX, sharedUniforms } from './gfx';
import {
  REFINED_AERIAL_CLEAR_YD,
  REFINED_AERIAL_DENSITY,
  REFINED_AERIAL_HEIGHT_FALLOFF,
  REFINED_CLOUD_DRIFT,
  type RefinedAtmosphere,
  refinedAtmosphere,
  worldStyleShadowRadius,
} from './world_style_core';

/** True when the active graphics profile runs the Refined style. */
export function worldStyleRefined(): boolean {
  return GFX.worldStyle === 'refined';
}

/** The output grade compiles its Refined arm (post.ts reads this). */
export function worldGradeEnabled(): boolean {
  return worldStyleRefined();
}

const initial = refinedAtmosphere(0.6, 0);

/** The shared Refined uniform block (by reference in every consumer). */
export const worldStyleUniforms = {
  uWsGradeGain: { value: new THREE.Vector4(1, 1, 1, 1) },
  uWsGradeLift: { value: new THREE.Vector4(0, 0, 0, 1) },
  uWsAerial: { value: new THREE.Vector4(...initial.aerialColor, initial.aerialStrength) },
  uWsAerialParams: {
    value: new THREE.Vector4(
      REFINED_AERIAL_CLEAR_YD,
      REFINED_AERIAL_DENSITY,
      WATER_LEVEL,
      REFINED_AERIAL_HEIGHT_FALLOFF,
    ),
  },
  uWsSkyZenith: { value: new THREE.Vector3(...initial.skyZenith) },
  uWsSkyHorizon: { value: new THREE.Vector3(...initial.skyHorizon) },
  uWsSunGlow: { value: new THREE.Vector3(...initial.sunGlow) },
  uWsCloudLit: { value: new THREE.Vector4(...initial.cloudLit, initial.cloudCoverage) },
  uWsCloudShade: { value: new THREE.Vector4(...initial.cloudShade, initial.cloudOpacity) },
  uWsCloudDrift: { value: new THREE.Vector2(0, 0) },
};

/** The uniforms a Refined world surface (terrain, far vista) binds. */
export function worldStyleSurfaceUniforms(): Record<string, { value: unknown }> {
  return {
    uWsAerial: worldStyleUniforms.uWsAerial,
    uWsAerialParams: worldStyleUniforms.uWsAerialParams,
  };
}

/** The uniforms the Refined sky dome binds. */
export function worldStyleSkyUniforms(): Record<string, { value: unknown }> {
  const u = worldStyleUniforms;
  return {
    uWsSkyZenith: u.uWsSkyZenith,
    uWsSkyHorizon: u.uWsSkyHorizon,
    uWsSunGlow: u.uWsSunGlow,
    uWsCloudLit: u.uWsCloudLit,
    uWsCloudShade: u.uWsCloudShade,
    uWsAerial: u.uWsAerial,
    uWsCloudDrift: u.uWsCloudDrift,
  };
}

/** The uniforms the Refined output grade binds. */
export function worldGradeUniforms(): Record<string, { value: unknown }> {
  return {
    uWsGradeGain: worldStyleUniforms.uWsGradeGain,
    uWsGradeLift: worldStyleUniforms.uWsGradeLift,
  };
}

let lastAtmosphere: RefinedAtmosphere = initial;

/** Write one atmosphere into the shared block (exported for tests). */
export function writeWorldStyleUniforms(a: RefinedAtmosphere, timeSec: number): void {
  const u = worldStyleUniforms;
  u.uWsGradeGain.value.set(a.gradeGain[0], a.gradeGain[1], a.gradeGain[2], a.gradeSaturation);
  u.uWsGradeLift.value.set(a.gradeLift[0], a.gradeLift[1], a.gradeLift[2], a.exposure);
  u.uWsAerial.value.set(a.aerialColor[0], a.aerialColor[1], a.aerialColor[2], a.aerialStrength);
  u.uWsSkyZenith.value.set(a.skyZenith[0], a.skyZenith[1], a.skyZenith[2]);
  u.uWsSkyHorizon.value.set(a.skyHorizon[0], a.skyHorizon[1], a.skyHorizon[2]);
  u.uWsSunGlow.value.set(a.sunGlow[0], a.sunGlow[1], a.sunGlow[2]);
  u.uWsCloudLit.value.set(a.cloudLit[0], a.cloudLit[1], a.cloudLit[2], a.cloudCoverage);
  u.uWsCloudShade.value.set(a.cloudShade[0], a.cloudShade[1], a.cloudShade[2], a.cloudOpacity);
  // Wrapped so a long session never loses float precision in the shader.
  u.uWsCloudDrift.value.set(
    (timeSec * REFINED_CLOUD_DRIFT[0]) % 512,
    (timeSec * REFINED_CLOUD_DRIFT[1]) % 512,
  );
}

/**
 * The renderer's per-frame hook on the settled day/night grade. Classic: the
 * grade itself, untouched (same object). Refined: writes the shared uniform
 * block for this time of day and returns the grade with the Refined light and
 * fog curves on top. The fog RANGE (farScale) is never touched, and the
 * ambient multiplier only ever applies by day, so night readability floors
 * stay exactly where day_night_core.ts put them.
 */
export function applyWorldStyleGrade(g: DayNightGrade, sunElev: number): DayNightGrade {
  if (!worldStyleRefined()) return g;
  const a = refinedAtmosphere(sunElev, g.nightAmt);
  lastAtmosphere = a;
  writeWorldStyleUniforms(a, sharedUniforms.uTime.value);
  const day = 1 - g.nightAmt;
  return {
    ...g,
    lightScale: g.lightScale * (1 + (a.lightScaleMul - 1) * day),
    ambientScale: g.ambientScale * (1 + (a.ambientScaleMul - 1) * day),
    fog: [g.fog[0] * a.fogTint[0], g.fog[1] * a.fogTint[1], g.fog[2] * a.fogTint[2]],
  };
}

/** Tint the key light's TARGET colour (before the renderer eases toward it,
 *  so the tint never compounds frame over frame). Classic: no-op. */
export function applyWorldStyleSunTint(target: THREE.Color): void {
  if (!worldStyleRefined()) return;
  const t = lastAtmosphere.sunTint;
  target.r *= t[0];
  target.g *= t[1];
  target.b *= t[2];
}

/** The sun's PCF shadow radius for the active style. */
export function activeShadowRadius(classicRadius: number): number {
  return worldStyleShadowRadius(GFX.worldStyle, classicRadius);
}
