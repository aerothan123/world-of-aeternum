import { describe, expect, it } from 'vitest';
import { FACTION_IDS } from '../src/sim/factions';
import { buildCurrenciesView } from '../src/ui/hud/currencies/currencies_view';

describe('currencies view', () => {
  it('shows the Heroic Marks currency balance as a whole number, never a bag count', () => {
    const view = (heroicMarks: number) =>
      buildCurrenciesView({ heroicMarks, honor: 0, lifetimeHonor: 0, delveMarks: 0 });
    expect(view(12.9).activities[0]).toMatchObject({ id: 'heroic_mark', amount: 12 });
    expect(view(-4).activities[0].amount).toBe(0);
    expect(view(Number.NaN).activities[0].amount).toBe(0);
  });

  it('lists the three activity balances in a fixed order with Honor carrying its lifetime total', () => {
    const view = buildCurrenciesView({
      heroicMarks: 3,
      honor: 340,
      lifetimeHonor: 1_200,
      delveMarks: 5,
    });
    expect(view.activities.map((row) => row.id)).toEqual(['heroic_mark', 'honor', 'delve_mark']);
    expect(view.activities[0].amount).toBe(3);
    expect(view.activities[1]).toMatchObject({ amount: 340, lifetime: 1_200 });
    expect(view.activities[2].amount).toBe(5);
    expect(view.activities).toHaveLength(3);
  });

  it('clamps corrupt balances to zero instead of painting a negative', () => {
    const view = buildCurrenciesView({
      heroicMarks: 0,
      honor: -5,
      lifetimeHonor: Number.NaN,
      delveMarks: -1,
    });
    expect(view.activities[1]).toMatchObject({ amount: 0, lifetime: 0 });
    expect(view.activities[2].amount).toBe(0);
  });

  it('prepares one row per allied faction with real balance', () => {
    const view = buildCurrenciesView({
      heroicMarks: 0,
      honor: 0,
      lifetimeHonor: 0,
      delveMarks: 0,
      factionCurrencies: { rift_watch: 25, church_order: 10, automatons: 0 },
    });
    expect(view.factions.map((row) => row.factionId)).toEqual([...FACTION_IDS]);
    expect(view.factions[0]).toEqual({ factionId: 'rift_watch', amount: 25, pending: false });
    expect(view.factions[1]).toEqual({ factionId: 'church_order', amount: 10, pending: false });
    expect(view.factions[2]).toEqual({ factionId: 'automatons', amount: 0, pending: false });
  });
});
