// The one-way drop migration for the retired crypto tables. Wyndlewood ships
// no cryptocurrency, token or wallet feature (owner decision for the Steam
// Early Access launch, 2026-11-05: Steam does not allow blockchain games, so
// the feature is removed, not hidden), and the tables below were only ever
// written by that feature: the Solana wallet links and their sign-to-link
// challenges, the Solana Seeker genesis-token entitlement claims, and the
// $WOC Exchange (listings, bids, settlements, sales, custody ledger, strikes,
// terms, directed offers, step-up challenges). No code reads or writes any of
// them any more; their CREATE DDL left server/db.ts and the retired
// server/legacy_crypto_schema_db.ts in the same change.
//
// Runs in ensureSchema (server/db.ts) after every CREATE and before the
// source-writer guard, under the same advisory lock as every other schema
// step, and is idempotent by construction: DROP TABLE IF
// EXISTS is a no-op once the table is gone, so a fresh database and a database
// that booted an earlier build converge on the same shape. CASCADE takes the
// tables' own indexes, FKs and the material-source guard triggers with them
// (the woc_market_* rows left MATERIAL_SOURCE_GUARDED_TABLES in this change,
// so no later boot tries to re-create a trigger on a table that is gone). The
// order below drops referencing tables before their referents, so the CASCADE
// never has to reach past the crypto family; nothing outside it references
// these tables.
//
// This is the ONE destructive DDL in the schema, by owner decision: the rows it
// removes are wallet public keys and exchange ledgers of a feature Wyndlewood
// never offered, and keeping them would be retaining player data for no
// purpose (docs/launch/early-access-readiness.md, "Crypto code still in the
// tree"). Never extend this list with a table that live code still touches.

/** Every table the crypto feature owned, in drop order (referencing first). */
export const LEGACY_CRYPTO_TABLES: readonly string[] = [
  'woc_market_stepup_challenges',
  'woc_market_directed_offers',
  'woc_market_buy_now_abandons',
  'woc_market_settlements',
  'woc_market_bids',
  'woc_market_listings',
  'woc_market_sales',
  'woc_market_custody_claims',
  'woc_market_strikes',
  'woc_market_terms',
  'seeker_entitlement_claims',
  'wallet_link_challenges',
  'wallet_links',
];

/** The retired concurrent indexes on those tables: gone with the tables, but a
 *  CONCURRENTLY build interrupted mid-way can leave an INVALID carcass that
 *  outlives nothing (an index cannot outlive its table), so no separate drop is
 *  needed; the names are listed for the registry pin in tests only. */
export const LEGACY_CRYPTO_CONCURRENT_INDEXES: readonly string[] = [
  'woc_market_sales_seller',
  'woc_market_ops_closed_created',
  'woc_market_sales_realm_created',
];

export const LEGACY_CRYPTO_DROP_SCHEMA = LEGACY_CRYPTO_TABLES.map(
  (table) => `DROP TABLE IF EXISTS ${table} CASCADE;`,
).join('\n');
