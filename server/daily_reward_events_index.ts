// LEGACY concurrent-index migration for daily_reward_events (the retired Daily
// Rewards point log, whose DDL still lives in server/db.ts SCHEMA so persisted
// databases keep loading unchanged). It stays registered in
// server/concurrent_indexes.ts (the migration list is append-only and its
// order is pinned), so existing databases are untouched and a fresh database
// still converges to the same shape. The SQL is verbatim from the retired
// server/legacy_crypto_schema_db.ts, which otherwise left with the crypto
// tables (server/legacy_crypto_drop_db.ts).

export const DAILY_REWARD_EVENTS_CONCURRENT_INDEX_SQL = `
CREATE INDEX CONCURRENTLY IF NOT EXISTS daily_reward_events_account_day_created_id
  ON daily_reward_events(account_id, day, realm, created_at DESC, id DESC)
  WHERE points > 0;
`;

export const DAILY_REWARD_EVENTS_INVALID_INDEX_CHECK_SQL = `
SELECT 1
  FROM pg_index i
 WHERE i.indexrelid = to_regclass('daily_reward_events_account_day_created_id')
   AND NOT i.indisvalid
`;

export const DAILY_REWARD_EVENTS_INVALID_INDEX_DROP_SQL =
  'DROP INDEX CONCURRENTLY IF EXISTS daily_reward_events_account_day_created_id';
