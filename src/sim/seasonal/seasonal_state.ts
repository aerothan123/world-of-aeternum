// The seasonal-event core's state: which event the world is running and each
// character's event ledger. Pure leaf (no SimContext, no clock, no rng).
//
// WHICH event runs is never decided here from a date. The authoritative server
// owns the calendar (server/seasonal_calendar.ts) and writes `hostEventId` every
// tick through the realm-calendar feed; a world with no host calendar (the
// offline browser, the headless RL env, tests) leaves it null, so the event is
// off there unless `/dev season` sets the dev override. That keeps all three
// hosts on one rule: the sim reads one field, it never reads the wall clock.
//
// Reused for every seasonal event (the autumn Gourdlight Eve first, winter next):
// nothing in this file names a particular event.
import { GOURDLIGHT_PUMPKINS, HAUNTED_PUMPKIN_EDITION } from '../content/gourdlight_pumpkins';
import { freshScarecrowState, type ScarecrowState } from './scarecrow_state';

/** The world-wide seasonal state. Lives on Sim, reached by modules through the
 *  `ctx.seasonal` live view. */
export interface SeasonalWorldState {
  /** The event the host calendar says is running (null = none, or no calendar). */
  hostEventId: string | null;
  /** The /dev override: undefined follows the host, null forces off, an id forces on. */
  devOverride: string | null | undefined;
  /** The event the last seasonal tick saw active: the edge detector for open/close. */
  lastActive: string | null;
  /** Gourdlight Eve's field boss (scarecrow.ts): who stands in the field, and when next. */
  scarecrow: ScarecrowState;
  /** Characters whose event-bound items were checked since the running event last
   *  changed, each with the sweep tick it was checked at (seasonal_bound_items.ts).
   *  Identity-keyed, never iterated, never persisted. */
  boundSwept: WeakMap<object, number>;
  /** The bound-item sweep's own tick counter (re-checks are counted in it). */
  boundTick: number;
  /** The /dev pick of the day's rotating daily (gourdlight_dailies.ts): null follows
   *  the reset day. Never persisted. */
  devDaily: string | null;
  /** Each standing Gurglegreen Cauldron by its maker's entity id (toy_cauldron.ts): one
   *  per maker. Process-local and never persisted, like the cauldrons themselves. */
  toyCauldrons: Map<number, number>;
}

export function freshSeasonalWorldState(): SeasonalWorldState {
  return {
    hostEventId: null,
    devOverride: undefined,
    lastActive: null,
    scarecrow: freshScarecrowState(),
    boundSwept: new WeakMap(),
    boundTick: 0,
    devDaily: null,
    toyCauldrons: new Map(),
  };
}

/** The event running right now: the dev override when one is set, else the host's. */
export function activeSeasonalEventOf(
  state: Pick<SeasonalWorldState, 'hostEventId' | 'devOverride'>,
): string | null {
  return state.devOverride !== undefined ? state.devOverride : state.hostEventId;
}

/** Each character's seasonal ledger (folded into PlayerMeta). */
export interface SeasonalPlayerState {
  /** The worn pumpkin head: the character's choice, re-applied as an aura while
   *  its event runs (and after a death), dropped from the body when it closes. */
  pumpkinHeadWorn: boolean;
  hauntedPumpkins: Set<string>;
}

export function freshSeasonalPlayerState(): SeasonalPlayerState {
  return {
    pumpkinHeadWorn: false,
    hauntedPumpkins: new Set(),
  };
}

/** The persisted shape (CharacterState.seasonal). Written only when non-empty, so
 *  a character the feature never touched saves byte-identically. (The trick-or-treat
 *  knock ledger, `day` and `knocked`, was removed with the feature: a save that still
 *  carries those keys restores without them.) */
export interface SavedSeasonalState {
  head?: true;
  pumpkins?: { edition: string; found: string[] };
}

export function restoreSeasonalState(
  meta: SeasonalPlayerState,
  saved: SavedSeasonalState | undefined,
): void {
  const fresh = freshSeasonalPlayerState();
  meta.pumpkinHeadWorn = fresh.pumpkinHeadWorn;
  meta.hauntedPumpkins = fresh.hauntedPumpkins;
  if (!saved || typeof saved !== 'object') return;
  if (saved.pumpkins?.edition === HAUNTED_PUMPKIN_EDITION && Array.isArray(saved.pumpkins.found)) {
    const allowed = new Set(GOURDLIGHT_PUMPKINS.map((p) => p.id));
    for (const id of saved.pumpkins.found.slice(0, GOURDLIGHT_PUMPKINS.length)) {
      if (allowed.has(id)) meta.hauntedPumpkins.add(id);
    }
  }
  if (saved.head === true) meta.pumpkinHeadWorn = true;
}

export function seasonalSaveFragment(meta: SeasonalPlayerState): {
  seasonal?: SavedSeasonalState;
} {
  const out: SavedSeasonalState = {};
  if (meta.pumpkinHeadWorn) out.head = true;
  const found = hauntedPumpkinsFoundView(meta);
  if (found.length) out.pumpkins = { edition: HAUNTED_PUMPKIN_EDITION, found: [...found] };
  return Object.keys(out).length > 0 ? { seasonal: out } : {};
}

// Derived read-only projection only. Writers add discoveries, clear the ledger,
// or replace its Set on restore; never replace members at the same cardinality.
const EMPTY_PUMPKINS: readonly string[] = Object.freeze([]);
const pumpkinViews = new WeakMap<
  SeasonalPlayerState,
  { set: Set<string>; size: number; view: readonly string[] }
>();
export function hauntedPumpkinsFoundView(meta: SeasonalPlayerState): readonly string[] {
  const set = meta.hauntedPumpkins;
  if (set.size === 0) return EMPTY_PUMPKINS;
  const cached = pumpkinViews.get(meta);
  if (cached?.set === set && cached.size === set.size) return cached.view;
  const view = Object.freeze(
    GOURDLIGHT_PUMPKINS.filter((p) => set.has(p.id))
      .map((p) => p.id)
      .sort(),
  );
  pumpkinViews.set(meta, { set, size: set.size, view });
  return view;
}
