// The Currencies tab's pure view core: every balance the character can spend
// that is NOT coin, in two groups. Activities: Heroic Marks (a PlayerMeta
// counter, src/sim/heroic_marks.ts), Honor and Delve Marks. Factions: one row per allied faction, PENDING until Stage 2 of
// the World Quests scope chooses the currency model; standing is shown on the
// Reputation tab and is deliberately not a currency here.
import { FACTION_IDS, type FactionId } from '../../../sim/factions';

export type ActivityCurrencyId = 'heroic_mark' | 'honor' | 'delve_mark';

export interface ActivityCurrencyRow {
  readonly id: ActivityCurrencyId;
  /** The spendable amount. */
  readonly amount: number;
  /** A lifetime note the painter may show beside the amount. */
  readonly lifetime: number | null;
}

export interface FactionCurrencyRow {
  readonly factionId: FactionId;
  readonly amount: number;
  /** True until the faction currency model ships (Stage 2). */
  readonly pending: boolean;
}

export interface CurrenciesView {
  readonly activities: readonly ActivityCurrencyRow[];
  readonly factions: readonly FactionCurrencyRow[];
}

export interface CurrenciesViewInput {
  readonly heroicMarks: number;
  readonly honor: number;
  readonly lifetimeHonor: number;
  readonly delveMarks: number;
  readonly factionCurrencies?: Readonly<Record<FactionId, number>>;
}

const whole = (value: number): number =>
  Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

export function buildCurrenciesView(input: CurrenciesViewInput): CurrenciesView {
  const activities: ActivityCurrencyRow[] = [
    { id: 'heroic_mark', amount: whole(input.heroicMarks), lifetime: null },
    { id: 'honor', amount: whole(input.honor), lifetime: whole(input.lifetimeHonor) },
    { id: 'delve_mark', amount: whole(input.delveMarks), lifetime: null },
  ];
  return {
    activities,
    factions: FACTION_IDS.map((factionId) => ({
      factionId,
      amount: whole(input.factionCurrencies?.[factionId] ?? 0),
      pending: false,
    })),
  };
}
