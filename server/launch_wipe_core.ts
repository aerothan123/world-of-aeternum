// The ONE Early Access wipe, at full launch (1.0), per the owner's policy:
// progress resets, cosmetics and the Book of Deeds survive, and every
// account-level entitlement survives. Pure core: what a wiped character keeps,
// what the realm clears, and the confirmation phrase. The SQL lives in
// server/launch_wipe_db.ts and the operator entry point is
// scripts/launch_wipe.ts (runbook: docs/launch/early-access-wipe.md).
//
// What survives, and why:
//   - ACCOUNTS and everything account-level: logins, Steam/Discord/Apple links,
//     moderation history, the account cosmetics (accounts.cosmetics,
//     account_weapon_cosmetics, account_mount_cosmetics), memberships and
//     purchase receipts, friends, the account ledger of deeds and relic finds.
//     The wipe never touches an account row.
//   - CHARACTERS keep their row: name (globally unique, a player keeps it),
//     class, realm, and the per-character cosmetic and Book of Deeds keys in
//     WIPE_KEEP_KEYS. Everything else in characters.state is replaced by a
//     newborn state for that class, so the character starts again at level 1
//     on the starting shore.
//   - character_deeds (the deeds board rows) and the audit ledgers
//     (item_ledger, bank_ledger) are kept: deeds are the policy, the ledgers
//     are evidence.
//   - Guilds and their membership are social, not progress: kept. Their BANK
//     books are progress: cleared.
//
//   - PAID bank capacity: slots bought with money (Claudium storage
//     purchases, bank.appliedStorageKeys) are an entitlement, not progress.
//     The wiped bank keeps exactly the paid slots (from the applied receipts;
//     the whole purchasedSlots when a receipt cannot say) and its applied
//     keys, so a replayed receipt still refuses. Gold-bought rungs reset.
//
// What the realm clears (WIPE_REALM_CLEARS): the World Market and Ravenpost
// books, rift state, mail custody parcels, guild bank books, world quest
// scores and sold-volume price history, the derived account wealth rows
// (recomputed by the next sweep), and account houses (feature/core-systems
// account_houses, when that table exists: houses are bought with gold, so
// they are progress; the migration audit is kept).
//
// What REFUSES the wipe (WIPE_BLOCKERS) instead of being cleared: anything
// still in flight that may carry real money or a paid delivery. The retired
// crypto World Market (woc_market_*: an open listing, custody claim, bid,
// directed offer or unfinished settlement), a referral reward delivery or
// transfer still bound to a realm character (character deletion refuses on
// the same rows), and a storage purchase still pending or unresolved. Closed
// market history (sales, settlements, strikes, terms) is evidence: kept.

import { BANK_EXPANSION_SLOTS } from '../src/sim/bank';

/** characters.state keys a wipe carries over unchanged (cosmetics + Book of
 *  Deeds). Anything not listed is progress and resets. Adding a key here is
 *  a policy change: the owner decides, the test pins the list. */
export const WIPE_KEEP_KEYS = [
  // The Book of Deeds and what renders it.
  'deeds',
  'deedStats',
  'renown',
  'unlockedMilestones',
  'activeTitle',
  'activeBorder',
  // The Reliquary: the collection log of unique finds (a record, not power).
  'reliquary',
  // Appearance and worn cosmetics.
  'skin',
  'skinCatalog',
  'mountSkinId',
  'helmHidden',
  'weaponStowed',
  // Cosmetic companions (owned buddies, their looks).
  'buddies',
  // Lifetime played time: a stat shown on the character, never power.
  'totalPlayedSeconds',
] as const;

export type WipeKeepKey = (typeof WIPE_KEEP_KEYS)[number];

/** The realm-scoped stores a wipe clears, by name (the db module maps each to
 *  its statement; the runbook and the dry-run report list them). */
export const WIPE_REALM_CLEARS = [
  'world_state market book',
  'world_state mail books',
  'world_state rifts',
  'mail_custody_parcels',
  'guild_banks',
  'world_quest_scores',
  'market_sold_volume',
  'account_wealth',
  'account_houses (when present)',
] as const;

/** In-flight obligations that refuse a real wipe (counted in the dry run). */
export const WIPE_BLOCKERS = [
  'woc_market open listings',
  'woc_market unbooked custody claims',
  'woc_market live bids',
  'woc_market pending directed offers',
  'woc_market unfinished settlements',
  'referral bond deliveries in flight',
  'referral transfers in flight',
  'storage purchases pending or unresolved',
] as const;

type StateRecord = Record<string, unknown>;

/** The ladder granularity (src/sim/bank.ts BANK_EXPANSION_SLOTS); a carried
 *  slot count always lands on a rung. */
const RUNG = BANK_EXPANSION_SLOTS;

/**
 * The bank a wiped character keeps: an empty bank (items are progress) with
 * the PAID capacity carried. `paidSlots` is the receipts' sum of
 * purchased_slots_after minus purchased_slots_before, or null when no receipt
 * can say (a legacy backfill row): then the whole old purchasedSlots is kept,
 * so a wipe can never take paid capacity away. No applied keys means nothing
 * was paid for, and the fresh bank wins untouched.
 */
export function wipeBankState(
  oldBank: unknown,
  freshBank: unknown,
  paidSlots: number | null,
): unknown {
  if (oldBank === null || typeof oldBank !== 'object') return freshBank;
  const old = oldBank as { purchasedSlots?: unknown; appliedStorageKeys?: unknown };
  const keys = Array.isArray(old.appliedStorageKeys)
    ? old.appliedStorageKeys.filter((k): k is string => typeof k === 'string')
    : [];
  if (keys.length === 0) return freshBank;
  const oldSlots =
    typeof old.purchasedSlots === 'number' && Number.isFinite(old.purchasedSlots)
      ? Math.max(0, old.purchasedSlots)
      : 0;
  const wanted = paidSlots === null ? oldSlots : Math.min(oldSlots, Math.max(0, paidSlots));
  const slots = Math.floor(wanted / RUNG) * RUNG;
  const base =
    freshBank !== null && typeof freshBank === 'object'
      ? (freshBank as StateRecord)
      : { inventory: [], bonusSlots: 0 };
  return { ...base, purchasedSlots: slots, appliedStorageKeys: [...keys] };
}

/**
 * The wiped state: the newborn state with every kept key copied over from the
 * old one. A kept key absent from the old state stays absent (the newborn's
 * default wins), so a pre-feature save never gains an empty field.
 */
export function wipeCharacterState(
  oldState: unknown,
  fresh: StateRecord,
  paidStorageSlots: number | null = null,
): StateRecord {
  const next: StateRecord = { ...fresh };
  if (oldState === null || typeof oldState !== 'object') return next;
  const old = oldState as StateRecord;
  for (const key of WIPE_KEEP_KEYS) {
    if (Object.hasOwn(old, key) && old[key] !== undefined) next[key] = old[key];
  }
  const bank = wipeBankState(old.bank, fresh.bank, paidStorageSlots);
  if (bank !== undefined) next.bank = bank;
  return next;
}

/** The kept keys an old state actually carries (for the dry-run report). */
export function keptKeysOf(oldState: unknown): WipeKeepKey[] {
  if (oldState === null || typeof oldState !== 'object') return [];
  const old = oldState as StateRecord;
  return WIPE_KEEP_KEYS.filter((k) => Object.hasOwn(old, k) && old[k] !== undefined);
}

/** The exact phrase an operator must type to run the wipe for real. It names
 *  the realm and the count the dry run reported, so a stale or mistyped
 *  confirmation (wrong realm, a count that moved) refuses. */
export function wipeConfirmationPhrase(realm: string, characterCount: number): string {
  return `WIPE ${realm} ${characterCount} CHARACTERS`;
}

export interface WipeCharacterRow {
  id: number;
  name: string;
  cls: string;
  level: number;
  state: unknown;
}

export interface WipePlan {
  /** Blocker counts (WIPE_BLOCKERS order); any nonzero refuses a real run. */
  blockers?: Record<string, number>;
  realm: string;
  characters: number;
  levelsReset: number;
  withDeeds: number;
  keptKeyCounts: Record<string, number>;
  realmClears: readonly string[];
  confirmation: string;
}

/** Summarize what a wipe of these rows would do (the dry run's report). */
export function planLaunchWipe(realm: string, rows: readonly WipeCharacterRow[]): WipePlan {
  const keptKeyCounts: Record<string, number> = {};
  let levelsReset = 0;
  let withDeeds = 0;
  for (const row of rows) {
    if (row.level > 1) levelsReset++;
    const kept = keptKeysOf(row.state);
    if (kept.includes('deeds')) withDeeds++;
    for (const k of kept) keptKeyCounts[k] = (keptKeyCounts[k] ?? 0) + 1;
  }
  return {
    realm,
    characters: rows.length,
    levelsReset,
    withDeeds,
    keptKeyCounts,
    realmClears: WIPE_REALM_CLEARS,
    confirmation: wipeConfirmationPhrase(realm, rows.length),
  };
}
