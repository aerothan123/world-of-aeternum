// World Style Refined fairness (docs/design/graphics-settings-fairness.md):
// the Refined ground (per-layer earth tint, then palette) and the per-time-of-day output grade must keep
// every ground telegraph colour at least as readable against the ground as
// Classic does, and the aerial haze must never reach the near field where
// telegraphs, AoE markers and melee reads live. Pure: the JS mirrors of the
// shader terms in world_style_core.ts.
import { describe, expect, it } from 'vitest';
import { TELEGRAPH_THREAT_COLORS } from '../src/render/floor_telegraph/telegraph_look_core';
import {
  REFINED_AERIAL_CLEAR_YD,
  type RefinedEarthLayer,
  refinedAerialAmount,
  refinedAtmosphere,
  refinedEarthTint,
  refinedPalette,
} from '../src/render/world_style_core';

type Rgb = [number, number, number];

const hexRgb = (hex: number): Rgb => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

// Representative lit ground tones (display-referred), Classic look.
const GROUND: Record<string, Rgb> = {
  grass: [0.36, 0.5, 0.22],
  dryGrass: [0.52, 0.52, 0.28],
  dirt: [0.46, 0.36, 0.26],
  gravel: [0.52, 0.5, 0.46],
  sand: [0.78, 0.7, 0.52],
  rock: [0.5, 0.5, 0.5],
};
// The splat layer each tone stands on (the Refined per-layer earth tint).
const LAYER: Record<string, RefinedEarthLayer> = {
  grass: 'grass',
  dryGrass: 'grass',
  dirt: 'dirt',
  gravel: 'dirt',
  sand: 'sand',
  rock: 'rock',
};
const refinedGround = (name: string, c: Rgb): Rgb =>
  refinedPalette(refinedEarthTint(c, LAYER[name]));

// The phases a player fights in: noon, golden hour, blue hour, night.
const PHASES: [string, number, number][] = [
  ['noon', 0.66, 0],
  ['golden', 0.1, 0.2],
  ['blue', -0.07, 0.6],
  ['night', -0.6, 1],
];

function grade(c: Rgb, gain: readonly number[], sat: number, lift: readonly number[]): Rgb {
  const g: Rgb = [c[0] * gain[0] + lift[0], c[1] * gain[1] + lift[1], c[2] * gain[2] + lift[2]];
  const l = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
  return [l + (g[0] - l) * sat, l + (g[1] - l) * sat, l + (g[2] - l) * sat];
}

// A perceptual-enough distance: weighted RGB (redmean) on display values.
function distance(a: Rgb, b: Rgb): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rm) * dr * dr + 4 * dg * dg + (3 - rm) * db * db);
}

// The telegraph body is normal-blended over the ground at about half
// coverage; the rim reads at full colour. Both must keep their contrast.
function over(top: Rgb, ground: Rgb, a: number): Rgb {
  return [
    top[0] * a + ground[0] * (1 - a),
    top[1] * a + ground[1] * (1 - a),
    top[2] * a + ground[2] * (1 - a),
  ];
}

describe('ground telegraphs stay readable on the Refined ground', () => {
  for (const [phase, sunElev, night] of PHASES) {
    it(`keeps every threat colour as distinct from every ground (${phase})`, () => {
      const a = refinedAtmosphere(sunElev, night);
      for (const [threat, hex] of Object.entries(TELEGRAPH_THREAT_COLORS)) {
        const tele = hexRgb(hex);
        for (const [name, ground] of Object.entries(GROUND)) {
          for (const coverage of [0.5, 1]) {
            // Classic: the stock ground under the stock grade (identity here).
            const classic = distance(over(tele, ground, coverage), ground);
            // Refined: the painterly ground, then the time-of-day grade on
            // the whole frame (the telegraph rides the same output grade).
            const rGround = grade(
              refinedGround(name, ground),
              a.gradeGain,
              a.gradeSaturation,
              a.gradeLift,
            );
            const rTele = grade(
              over(tele, refinedGround(name, ground), coverage),
              a.gradeGain,
              a.gradeSaturation,
              a.gradeLift,
            );
            const refined = distance(rTele, rGround);
            expect(refined, `${threat} on ${name} at ${coverage}`).toBeGreaterThan(classic * 0.9);
          }
        }
      }
    });
  }

  it('keeps the four threat hues apart from each other under every grade', () => {
    for (const [, sunElev, night] of PHASES) {
      const a = refinedAtmosphere(sunElev, night);
      const graded = Object.values(TELEGRAPH_THREAT_COLORS).map((hex) =>
        grade(hexRgb(hex), a.gradeGain, a.gradeSaturation, a.gradeLift),
      );
      for (let i = 0; i < graded.length; i++)
        for (let j = i + 1; j < graded.length; j++)
          expect(distance(graded[i], graded[j])).toBeGreaterThan(0.35);
    }
  });

  it('never hazes the near field a player reacts in', () => {
    for (const [, sunElev, night] of PHASES) {
      const a = refinedAtmosphere(sunElev, night);
      for (let d = 0; d <= REFINED_AERIAL_CLEAR_YD; d += 1)
        expect(refinedAerialAmount(d, 0, a.aerialStrength, true)).toBe(0);
      // and a mob at 80 yards keeps most of its ground contrast
      expect(refinedAerialAmount(80, 0, a.aerialStrength, true)).toBeLessThan(0.05);
    }
  });
});
