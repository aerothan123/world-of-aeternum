// One house per ACCOUNT (Wyndlewood owner decision, 2026-11): the pure merge
// plan for an account whose characters hold several houses. No SQL, no clock,
// no rng: server/account_house_migration.ts feeds it the raw saved records and
// applies the plan; tests/account_house_merge.test.ts pins it directly.
//
// The rule:
// - KEEP the most-furnished house (most placed pieces); a tie goes to the
//   oldest house (earliest non-empty boughtDay; an undated, clockless purchase
//   counts as newer than any dated one), then to the oldest character (lowest id).
// - Every OTHER house is released. Nothing in it is lost: each stored slot is
//   appended VERBATIM to the kept house's storage (the load bound in
//   src/sim/housing/house_storage_state.ts keeps unknown ids dormant and never
//   destroys a row), and each placed piece of furniture comes back as one
//   item in that storage too. The storage tolerates holding more slots than
//   its chests provide (every slot stays visible and withdrawable; deposits
//   wait until there is room), which is how the kept house's capacity expands
//   to take everything.
// - The released records are returned whole, so the caller can write them to
//   the audit table before clearing them: the migration is reversible by hand.
//
// Value conservation, not row count, is the invariant: every item count in
// the released houses (stored counts plus one per placed piece) reappears in
// the kept storage.

/** One character's raw saved `state.house`, as the database holds it. */
export interface AccountHouseRow {
  characterId: number;
  house: unknown;
}

export interface ReleasedHouse {
  characterId: number;
  /** The record exactly as it was saved, for the audit table. */
  originalHouse: Record<string, unknown>;
  /** Slots this house added to the kept storage. */
  movedSlots: number;
}

export interface AccountHousePlan {
  keptCharacterId: number;
  /** The kept house's new saved record (its storage extended). */
  keptHouse: Record<string, unknown>;
  released: ReleasedHouse[];
}

type HouseRecord = Record<string, unknown> & { lot: string };

/** A record the load path would treat as a house (a record naming a lot id).
 *  The live lot check is the sim's; a record with an unknown lot loads as no
 *  house, so it is neither kept nor merged (it is left untouched). */
export function isHouseRecord(raw: unknown): raw is HouseRecord {
  return (
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    typeof (raw as { lot?: unknown }).lot === 'string'
  );
}

function furnitureEntries(house: HouseRecord): [string, unknown][] {
  const f = house.furniture;
  return f !== null && typeof f === 'object' && !Array.isArray(f)
    ? Object.entries(f as Record<string, unknown>)
    : [];
}

function storageRows(house: HouseRecord): unknown[] {
  return Array.isArray(house.storage) ? house.storage : [];
}

/** Placed pieces: the "most furnished" measure. */
export function furnishedCount(house: HouseRecord): number {
  return furnitureEntries(house).length;
}

function boughtDayOf(house: HouseRecord): string {
  return typeof house.boughtDay === 'string' ? house.boughtDay : '';
}

/** Negative when `a` should be kept over `b`. */
function keepOrder(a: AccountHouseRow & { house: HouseRecord }, b: typeof a): number {
  const furnished = furnishedCount(b.house) - furnishedCount(a.house);
  if (furnished !== 0) return furnished;
  const da = boughtDayOf(a.house);
  const db = boughtDayOf(b.house);
  if (da !== db) {
    if (da === '') return 1;
    if (db === '') return -1;
    return da < db ? -1 : 1;
  }
  return a.characterId - b.characterId;
}

/** The slots a released house contributes: its storage rows verbatim, then
 *  one item per placed piece (in anchor order, so the plan is deterministic). */
export function releasedSlots(house: HouseRecord): unknown[] {
  const out = [...storageRows(house)];
  for (const [, itemId] of furnitureEntries(house).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (typeof itemId === 'string' && itemId !== '') out.push({ itemId, count: 1 });
  }
  return out;
}

/** The plan for one account, or null when it holds at most one house. */
export function planAccountHouseMerge(rows: readonly AccountHouseRow[]): AccountHousePlan | null {
  const houses = rows.filter((r): r is AccountHouseRow & { house: HouseRecord } =>
    isHouseRecord(r.house),
  );
  if (houses.length < 2) return null;
  const ordered = [...houses].sort(keepOrder);
  const [kept, ...rest] = ordered;
  const moved: unknown[] = [];
  const released: ReleasedHouse[] = [];
  for (const row of rest) {
    const slots = releasedSlots(row.house);
    moved.push(...slots);
    released.push({ characterId: row.characterId, originalHouse: row.house, movedSlots: slots.length });
  }
  const keptHouse: Record<string, unknown> = { ...kept.house };
  if (moved.length > 0) keptHouse.storage = [...storageRows(kept.house), ...moved];
  return { keptCharacterId: kept.characterId, keptHouse, released };
}

/** Total item count across stored slots and placed pieces (the conservation
 *  measure the tests pin). A slot with no finite count counts as 1. */
export function houseItemTotal(house: unknown): number {
  if (!isHouseRecord(house)) return 0;
  let total = 0;
  for (const row of storageRows(house)) {
    const count = (row as { count?: unknown } | null)?.count;
    total += typeof count === 'number' && Number.isFinite(count) ? count : 1;
  }
  for (const [, itemId] of furnitureEntries(house)) {
    if (typeof itemId === 'string' && itemId !== '') total += 1;
  }
  return total;
}
