import { describe, expect, it } from 'vitest';
import {
  CHOP_HIT_PHASE,
  CHOP_SWING_SECONDS,
  chopHitsBy,
  diffFelled,
  fallDirection,
  fallPoseAt,
  impactCrossed,
  PENDING_FALL_TTL_SECONDS,
  pendingFallFresh,
  regrowScaleAt,
  SAPLING_START_SCALE,
  stumpDims,
  TREE_BOUNCE_SECONDS,
  TREE_FALL_SECONDS,
  TREE_FALL_TOTAL_SECONDS,
  TREE_LIE_SECONDS,
  TREE_REGROW_ANIM_SECONDS,
  TREE_REST_RADIANS,
} from '../src/render/tree_felling_core';
import { TREE_CHOP_SWING_SECONDS } from '../src/sim/content/tree_chopping';

describe('tree fall curve', () => {
  it('starts upright, eases in like gravity, and meets the ground on time', () => {
    expect(fallPoseAt(0).angle).toBe(0);
    const quarter = fallPoseAt(TREE_FALL_SECONDS / 4).angle;
    const half = fallPoseAt(TREE_FALL_SECONDS / 2).angle;
    // Ease-in: the second quarter covers more angle than the first.
    expect(half - quarter).toBeGreaterThan(quarter);
    expect(half).toBeCloseTo(TREE_REST_RADIANS / 4, 9);
    expect(fallPoseAt(TREE_FALL_SECONDS - 1e-6).landed).toBe(false);
    expect(fallPoseAt(TREE_FALL_SECONDS).landed).toBe(true);
    expect(fallPoseAt(TREE_FALL_SECONDS).angle).toBeCloseTo(TREE_REST_RADIANS, 9);
  });

  it('is monotone up to impact', () => {
    let prev = -1;
    for (let t = 0; t <= TREE_FALL_SECONDS; t += 0.01) {
      const a = fallPoseAt(t).angle;
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });

  it('rebounds a little after impact and settles at rest', () => {
    const mid = fallPoseAt(TREE_FALL_SECONDS + TREE_BOUNCE_SECONDS / 2).angle;
    expect(mid).toBeLessThan(TREE_REST_RADIANS);
    expect(mid).toBeGreaterThan(TREE_REST_RADIANS - 0.2);
    const still = fallPoseAt(TREE_FALL_SECONDS + TREE_BOUNCE_SECONDS + TREE_LIE_SECONDS / 2);
    expect(still.angle).toBe(TREE_REST_RADIANS);
    expect(still.scale).toBe(1);
    expect(still.sink).toBe(0);
  });

  it('sinks and shrinks away over the fade, then is done', () => {
    const fadeStart = TREE_FALL_SECONDS + TREE_BOUNCE_SECONDS + TREE_LIE_SECONDS;
    const midFade = fallPoseAt(fadeStart + 1);
    expect(midFade.scale).toBeLessThan(1);
    expect(midFade.scale).toBeGreaterThan(0);
    expect(midFade.sink).toBeGreaterThan(0);
    expect(fallPoseAt(TREE_FALL_TOTAL_SECONDS - 0.001).done).toBe(false);
    const end = fallPoseAt(TREE_FALL_TOTAL_SECONDS);
    expect(end.done).toBe(true);
    expect(end.scale).toBe(0);
  });

  it('fires the impact exactly once across any frame split', () => {
    let fired = 0;
    let t = 0;
    for (const dt of [0.4, 0.4, 0.4, 0.4, 0.4, 0.4]) {
      if (impactCrossed(t, t + dt)) fired++;
      t += dt;
    }
    expect(fired).toBe(1);
    expect(impactCrossed(TREE_FALL_SECONDS, TREE_FALL_SECONDS + 1)).toBe(false);
  });

  it('falls along (sin yaw, cos yaw), the sim convention', () => {
    const d = fallDirection(Math.PI / 2);
    expect(d.x).toBeCloseTo(1, 9);
    expect(d.z).toBeCloseTo(0, 9);
  });
});

describe('regrow and chop beats', () => {
  it('a sapling eases up to full size over the regrow', () => {
    expect(regrowScaleAt(0)).toBe(SAPLING_START_SCALE);
    expect(regrowScaleAt(TREE_REGROW_ANIM_SECONDS)).toBe(1);
    expect(regrowScaleAt(TREE_REGROW_ANIM_SECONDS / 2)).toBeGreaterThan(0.5);
    expect(regrowScaleAt(99)).toBe(1);
  });

  it('one axe hit per swing, on the swing cadence the sim casts with', () => {
    expect(CHOP_SWING_SECONDS).toBe(TREE_CHOP_SWING_SECONDS);
    expect(chopHitsBy(0)).toBe(0);
    expect(chopHitsBy(CHOP_HIT_PHASE - 0.01)).toBe(0);
    expect(chopHitsBy(CHOP_HIT_PHASE + 0.01)).toBe(1);
    expect(chopHitsBy(CHOP_HIT_PHASE + 1.01)).toBe(2);
    // A four-swing chop lands four hits before its cast ends.
    expect(chopHitsBy(4 * CHOP_SWING_SECONDS - 0.01)).toBe(4);
  });

  it('a pending fall goes stale after its window', () => {
    expect(pendingFallFresh(10, 10 + PENDING_FALL_TTL_SECONDS)).toBe(true);
    expect(pendingFallFresh(10, 10.01 + PENDING_FALL_TTL_SECONDS)).toBe(false);
  });

  it('a stump sits a little wider than the trunk collider and grows with scale', () => {
    const small = stumpDims(0.7);
    const big = stumpDims(1.6);
    expect(small.radius).toBeGreaterThan(0.55 * 0.7);
    expect(big.radius).toBeGreaterThan(small.radius);
    expect(big.height).toBeGreaterThan(small.height);
  });
});

describe('felled-set diff', () => {
  it('reports added and removed ids in ascending order', () => {
    const shown = new Set([5, 1, 9]);
    const out = diffFelled(shown, [9, 3, 2]);
    expect(out.added).toEqual([2, 3]);
    expect(out.removed).toEqual([1, 5]);
  });

  it('reuses its output buffer', () => {
    const out = { added: [7], removed: [8] };
    diffFelled(new Set(), [], out);
    expect(out).toEqual({ added: [], removed: [] });
  });
});
