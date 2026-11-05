// Pure-core pins for the faction standing tier celebration: tier crossings
// over two standing maps, the silent first observation and the synced gate,
// in-place advance of the baseline, and the per-drain plan (one plate, one
// chime, motion under reduced motion).

import { describe, expect, it } from 'vitest';
import { STANDING_THRESHOLDS } from '../src/sim/factions';
import {
  advanceFactionTierObservation,
  buildFactionTierCelebrationPlan,
  computeFactionTierUps,
} from '../src/ui/hud/reputation/faction_tier_celebration_view';

const zero = { gilt_measure: 0, lanternwardens: 0, hearthwright_compact: 0, bracken_circle: 0 };

describe('computeFactionTierUps', () => {
  it('is silent on the first observation and on a plain gain inside a tier', () => {
    expect(computeFactionTierUps(null, { ...zero, gilt_measure: 5_000 })).toEqual([]);
    expect(
      computeFactionTierUps({ ...zero, gilt_measure: 100 }, { ...zero, gilt_measure: 900 }),
    ).toEqual([]);
  });

  it('reports each faction that crossed a tier, once, in faction order, with the tier reached', () => {
    const ups = computeFactionTierUps(
      { ...zero, gilt_measure: 980, hearthwright_compact: 2_990 },
      {
        gilt_measure: STANDING_THRESHOLDS.recognized,
        lanternwardens: 0,
        // A jump over two tiers reports only the tier reached.
        hearthwright_compact: STANDING_THRESHOLDS.vanguard,
        bracken_circle: 0,
      },
    );
    expect(ups).toEqual([
      { factionId: 'gilt_measure', fromTier: 'unknown', toTier: 'recognized' },
      { factionId: 'hearthwright_compact', fromTier: 'recognized', toTier: 'vanguard' },
    ]);
  });

  it('never reports a drop (a sanitized or reset mirror is not a celebration)', () => {
    expect(
      computeFactionTierUps({ ...zero, gilt_measure: 7_000 }, { ...zero, gilt_measure: 0 }),
    ).toEqual([]);
  });

  it('treats a missing faction key as zero standing', () => {
    expect(computeFactionTierUps({}, { gilt_measure: 1_000 })).toEqual([
      { factionId: 'gilt_measure', fromTier: 'unknown', toTier: 'recognized' },
    ]);
  });
});

describe('advanceFactionTierObservation', () => {
  it('does nothing before the mirror is synced, then baselines silently', () => {
    const unsynced = advanceFactionTierObservation(false, null, { ...zero, gilt_measure: 3_000 });
    expect(unsynced.tierUps).toEqual([]);
    expect(unsynced.prev).toBeNull();
    const first = advanceFactionTierObservation(true, null, { ...zero, gilt_measure: 3_000 });
    expect(first.tierUps).toEqual([]);
    expect(first.prev).toEqual({
      gilt_measure: 3_000,
      lanternwardens: 0,
      hearthwright_compact: 0,
      bracken_circle: 0,
    });
  });

  it('diffs against the baseline and advances it in place', () => {
    const baseline = { ...zero, lanternwardens: 2_990 };
    const obs = advanceFactionTierObservation(true, baseline, {
      ...zero,
      lanternwardens: STANDING_THRESHOLDS.trusted,
    });
    expect(obs.tierUps).toEqual([
      { factionId: 'lanternwardens', fromTier: 'recognized', toTier: 'trusted' },
    ]);
    expect(obs.prev).toBe(baseline);
    expect(baseline.lanternwardens).toBe(STANDING_THRESHOLDS.trusted);
    // The next drain sees no change.
    expect(
      advanceFactionTierObservation(true, baseline, { ...zero, lanternwardens: 3_000 }).tierUps,
    ).toEqual([]);
  });
});

describe('buildFactionTierCelebrationPlan', () => {
  const up = { factionId: 'gilt_measure', fromTier: 'trusted', toTier: 'proven' } as const;
  const later = {
    factionId: 'hearthwright_compact',
    fromTier: 'unknown',
    toTier: 'recognized',
  } as const;

  it('logs every crossing and plates the last one, chiming once', () => {
    const plan = buildFactionTierCelebrationPlan([up, later], false, false);
    expect(plan.logs).toEqual([up, later]);
    expect(plan.banner).toEqual(later);
    expect(plan.playSound).toBe(true);
    expect(plan.motion).toBe(true);
  });

  it('stands the chime down when the drain already chimed and the motion under reduced motion', () => {
    const plan = buildFactionTierCelebrationPlan([up], true, true);
    expect(plan.banner).toEqual(up);
    expect(plan.playSound).toBe(false);
    expect(plan.motion).toBe(false);
  });

  it('plans nothing for an empty drain', () => {
    const plan = buildFactionTierCelebrationPlan([], false, false);
    expect(plan).toEqual({ logs: [], banner: null, playSound: false, motion: false });
  });
});
