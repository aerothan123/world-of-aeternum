// LEGACY schema for the retired crypto features (the $WOC Exchange and the
// Solana Seeker genesis-token entitlement). Project H removed every crypto
// feature: no code reads or writes these tables any more. The DDL is kept,
// verbatim and idempotent, so persisted databases keep loading unchanged and
// nothing is ever dropped implicitly; ensureSchema (server/db.ts) still applies
// it under the advisory lock. Dropping these tables is a separate, deliberate
// owner decision with its own migration, never a side effect of a refactor.

/** The OPEN settlement states the legacy one-open-settlement index predicate
 *  was built with. Kept verbatim: IF NOT EXISTS matches an index by name only,
 *  so this text must not drift from what existing databases already carry. */
const OPEN_SETTLEMENT_STATES_SQL = `('offered', 'confirming', 'review', 'confirmed', 'delivering', 'delivered')`;

/** The legacy pending-offer pair index name, interpolated into the DDL below
 *  exactly as the original schema spelled it. */
const WOC_MARKET_OFFERS_PAIR_PENDING_INDEX = 'woc_market_offers_pair_pending';

export const LEGACY_SEEKER_ENTITLEMENT_SCHEMA = `
-- Keep forever. A claimed SGT mint must never become reusable after a wallet
-- unlink, token transfer, account deactivation, hard delete, or binary rollback.
CREATE TABLE IF NOT EXISTS seeker_entitlement_claims (
  mint TEXT PRIMARY KEY,
  account_id INT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  claimant_wallet TEXT NOT NULL,
  proof_version TEXT NOT NULL,
  verification_slot BIGINT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);
`;

export const LEGACY_WOC_MARKET_SCHEMA = `
CREATE TABLE IF NOT EXISTS woc_market_listings (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  seller_account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Deliberately NOT an FK: deleting the seller's character must never
  -- destroy an escrowed copy; returns re-resolve a target at flight time.
  seller_character INT NOT NULL,
  seller_name TEXT NOT NULL,
  seller_wallet TEXT NOT NULL,
  item JSONB NOT NULL CHECK (jsonb_typeof(item) = 'object'),
  item_id TEXT NOT NULL,
  quality TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('auction', 'buy_now', 'auction_buy_now')),
  start_cents INT NOT NULL,
  reserve_cents INT,
  buy_now_cents INT,
  offer_next BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ending', 'settling', 'closed')),
  resolution TEXT
    CHECK (resolution IN ('sold', 'no_bids', 'reserve_not_met', 'unsettled', 'cancelled', 'suspended')),
  -- The custody flag: the escrowed copy has left the broker (delivered to the
  -- buyer or returned to the seller). Closed rows reconcile until it is true.
  item_disposed BOOLEAN NOT NULL DEFAULT false,
  current_bid_cents INT,
  current_bid_id BIGINT,
  ends_at TIMESTAMPTZ NOT NULL,
  base_ends_at TIMESTAMPTZ NOT NULL,
  buy_now_lock_account INT,
  buy_now_lock_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The sweep's due-claim seeks on this (realm + status='active' + ends_at).
CREATE INDEX IF NOT EXISTS woc_market_listings_realm_status_ends
  ON woc_market_listings(realm, status, ends_at);
-- Browse sorts: a three-status IN() over the index above is not an ordered
-- path, so each sort gets a partial index over the live set instead. Measured
-- before these existed: a realm at its listing cap planned a parallel seq scan
-- with a 3 MB external merge sort per page.
CREATE INDEX IF NOT EXISTS woc_market_listings_live_ends
  ON woc_market_listings(realm, ends_at, id)
  WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS woc_market_listings_live_created
  ON woc_market_listings(realm, created_at DESC, id)
  WHERE status <> 'closed';
-- The price sorts order by this exact expression; the index text must match
-- the query text verbatim for the planner to use it (the LIFETIME_XP_EXPR rule).
CREATE INDEX IF NOT EXISTS woc_market_listings_live_price
  ON woc_market_listings(realm, COALESCE(current_bid_cents, start_cents), id)
  WHERE status <> 'closed';
-- price_desc keeps the ASC id tiebreak (page stability shared with price_asc),
-- so a backward scan of the ASC index cannot serve it (that would yield id
-- DESC within equal prices); the sort direction needs its own index. Stated
-- trade: every bid activation updates current_bid_cents and now maintains
-- two expression indexes instead of one (already non-HOT because of the ASC
-- twin), the price of removing a per-page sort from a player-facing sort;
-- measured on the full 16-index table: about +8% on a single-row bid-price
-- update and roughly +290 WAL bytes per updated row. The win is the SHALLOW
-- pages (the ones players read and the cache serves): past a few hundred
-- rows of OFFSET the planner abandons the ordered walk and sorts the live
-- set anyway, which is fine, deep pages are uncached and rare by design.
CREATE INDEX IF NOT EXISTS woc_market_listings_live_price_desc
  ON woc_market_listings(realm, COALESCE(current_bid_cents, start_cents) DESC, id)
  WHERE status <> 'closed';
-- The item-id search filter.
CREATE INDEX IF NOT EXISTS woc_market_listings_live_item
  ON woc_market_listings(realm, item_id)
  WHERE status <> 'closed';
-- Seller reads: the activity tab pages newest-first, and the cap counts the
-- live set. Both were previously filtering realm after seeking the account.
CREATE INDEX IF NOT EXISTS woc_market_listings_seller_created
  ON woc_market_listings(realm, seller_account, created_at DESC);
CREATE INDEX IF NOT EXISTS woc_market_listings_seller_live
  ON woc_market_listings(realm, seller_account)
  WHERE status <> 'closed';
-- The return-flight reconciliation backlog: closed rows still holding a copy.
-- updated_at is the stuck readout's age signal for this class, so park
-- rotation never writes it (it writes sweep_parked_at; see the settlements
-- twin for the full rationale).
CREATE INDEX IF NOT EXISTS woc_market_listings_undisposed
  ON woc_market_listings(realm, updated_at)
  WHERE status = 'closed' AND item_disposed = false;
ALTER TABLE woc_market_listings
  ADD COLUMN IF NOT EXISTS sweep_parked_at TIMESTAMPTZ;
-- The return arm's batch order: parked rows rotate on sweep_parked_at so a
-- refused return cycles to the tail without aging the readout column. The
-- expression is shared verbatim with the query via PARK_ROTATION_ORDER.
CREATE INDEX IF NOT EXISTS woc_market_listings_undisposed_rotation
  ON woc_market_listings(realm, (COALESCE(sweep_parked_at, updated_at)))
  WHERE status = 'closed' AND item_disposed = false;
-- The sold-residue dispose probe (steady-state EMPTY: only an old binary's
-- torn close tail populates it); without this the probe walked the whole
-- undisposed backlog once a minute to learn there was nothing to do.
CREATE INDEX IF NOT EXISTS woc_market_listings_sold_undisposed
  ON woc_market_listings(realm, id)
  WHERE status = 'closed' AND item_disposed = false AND resolution = 'sold';
-- The redrive page walk pages LIVE listings by id; no other index yields id
-- order under a realm+status filter, so without this the planner sorts the
-- whole live set once a minute forever.
CREATE INDEX IF NOT EXISTS woc_market_listings_live_ids
  ON woc_market_listings(realm, id)
  WHERE status <> 'closed';
-- Retention prune cursor (closed, disposed, oldest first).
CREATE INDEX IF NOT EXISTS woc_market_listings_closed_updated
  ON woc_market_listings(updated_at)
  WHERE status = 'closed' AND item_disposed = true;

-- A DIRECTED sale: one named counterparty, agreed in the trade window and sold
-- on this same rail (docs/prd/woc/p2p-woc-trade.md). NULL is the ordinary public
-- listing, so every existing row keeps its meaning and the column is additive.
--
-- Keyed on ACCOUNT, not character, because the wallet check that decides whether
-- the buyer can pay is account-level, and the delivery character is already
-- recorded separately on the settlement. ON DELETE CASCADE matches
-- seller_account: a deleted account cannot be owed a directed sale.
ALTER TABLE woc_market_listings
  ADD COLUMN IF NOT EXISTS directed_buyer_account INT REFERENCES accounts(id) ON DELETE CASCADE;
-- The buyer's "offers made to me" read. Partial, because directed rows are a
-- small minority of the table and the public browse must never touch them.
CREATE INDEX IF NOT EXISTS woc_market_listings_directed_buyer
  ON woc_market_listings(realm, directed_buyer_account, created_at DESC)
  WHERE directed_buyer_account IS NOT NULL AND status <> 'closed';

-- Seller cancel-intent on a LOCKED listing (the abandon-loop ruling's second
-- arm): instead of refusing, the cancel stamps this and the listing stops
-- taking new lock claims and new bids; the CURRENT holder keeps their full
-- window (a paid window proceeds to settlement as usual), and an unpaid
-- expiry closes the listing cancelled with the return flight home. Bounds the
-- seller's worst-case cancel denial at exactly one lock window. Additive.
ALTER TABLE woc_market_listings
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;
-- The Browse filter's category axes, stamped at escrow from the item def
-- (exchangeBrowseCategory / exchangeBrowseSubcategory in
-- src/sim/exchange_eligibility.ts): derived display data, never authority.
-- Nullable so the columns land additively; rows that PREDATE the stamp are
-- converged by the one-shot boot backfill (woc_market_backfill.ts), so no
-- listing sits outside the category filters for want of a stamp.
-- Additive.
ALTER TABLE woc_market_listings
  ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE woc_market_listings
  ADD COLUMN IF NOT EXISTS subcategory TEXT;
-- The boot backfill's worklist read (listingItemIdsMissingCategory:
-- SELECT DISTINCT item_id WHERE category IS NULL) runs at every boot, so a
-- partial index over exactly the un-stamped rows keeps it off a growing
-- seq scan. It is SELF-LIMITING: new rows stamp category at escrow and never
-- enter this index, and once the one-shot backfill converges it covers zero
-- rows, so the read is an index scan over an empty index for the life of the
-- table. Predicate matches the query text verbatim (the shared-SQL rule).
CREATE INDEX IF NOT EXISTS woc_market_listings_category_missing
  ON woc_market_listings(item_id)
  WHERE category IS NULL;
-- The converge arm's read, on the shared rotation order (a stamped listing
-- whose buyer PAID skips every pass until that settlement resolves, which
-- can be operator-scale time; rotation plus the caller's backoff exclusion
-- is what keeps a standing skip set from occupying the batch head forever,
-- the delivering/undisposed arms' seam). _rotation REPLACES the short-lived
-- (realm, id) shape that briefly shipped under the _cancel_pending name:
-- IF NOT EXISTS matches on NAME only, so an in-place redefinition would
-- leave any database that booted the old shape sorting forever (this
-- file's own predicate-change rule).
CREATE INDEX IF NOT EXISTS woc_market_listings_cancel_rotation
  ON woc_market_listings(realm, (COALESCE(sweep_parked_at, updated_at)))
  WHERE cancel_requested_at IS NOT NULL AND status = 'active';
DROP INDEX IF EXISTS woc_market_listings_cancel_pending;

-- The abandon ledger (the ruling's first arm): one row per abandoned public
-- buy-now lock window, keyed by the lock instance (lock_expires) so the two
-- recorders (the overdue sweep's abandon arm, and a claim that steals an
-- expired lock) dedupe instead of double-counting one abandonment. Directed
-- locks never record here (they keep their strike instead). lock_expires is
-- both the dedupe key and the age axis for the two cooldown reads (the moment
-- the abandon HAPPENED); created_at is forensics only. App clock throughout,
-- consistent with the lock predicates (the 02 clock decision).
CREATE TABLE IF NOT EXISTS woc_market_buy_now_abandons (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  listing_id BIGINT NOT NULL REFERENCES woc_market_listings(id) ON DELETE CASCADE,
  account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lock_expires TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Dedupe key; also serves the per-listing cooldown probe and the FK-cascade
-- scan from the listings prune (listing_id leads).
CREATE UNIQUE INDEX IF NOT EXISTS woc_market_buy_now_abandons_once
  ON woc_market_buy_now_abandons(listing_id, account, lock_expires);
-- The account-wide rolling-window count (realm is a residual filter over one
-- account's handful of rows) AND the accounts FK-cascade scan: account leads
-- so both are index probes.
CREATE INDEX IF NOT EXISTS woc_market_buy_now_abandons_account
  ON woc_market_buy_now_abandons(account, lock_expires DESC);

CREATE TABLE IF NOT EXISTS woc_market_bids (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES woc_market_listings(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  character_id INT NOT NULL,
  character_name TEXT NOT NULL,
  wallet TEXT NOT NULL,
  amount_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_bond'
    CHECK (status IN ('pending_bond', 'active', 'outbid', 'lapsed', 'won', 'defaulted', 'cancelled')),
  bond_cents INT NOT NULL,
  bond_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (bond_state IN ('pending', 'held', 'void', 'refund_due', 'refunded', 'forfeit_due', 'forfeited')),
  bond_reference TEXT UNIQUE,
  bond_quote_expires TIMESTAMPTZ,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS woc_market_bids_listing ON woc_market_bids(listing_id, status);
CREATE INDEX IF NOT EXISTS woc_market_bids_account ON woc_market_bids(account, placed_at DESC);
-- The bond worker's queue (refunds and forfeits owed).
CREATE INDEX IF NOT EXISTS woc_market_bids_bond_due
  ON woc_market_bids(realm, placed_at)
  WHERE bond_state IN ('refund_due', 'forfeit_due');
-- The lapse sweep (unconfirmed bonds past their TTL), realm-scoped so one
-- realm's pass cannot spend its batch budget on a peer realm's bids.
CREATE INDEX IF NOT EXISTS woc_market_bids_pending
  ON woc_market_bids(realm, placed_at)
  WHERE status = 'pending_bond';
-- The signature the bidder handed back for their bond, recorded BEFORE the
-- chain has decided. Without somewhere to keep it, a bond that had landed but
-- not yet finalized could only be refused, and the money was already gone: the
-- settlement leg learned this the expensive way and the bid leg had the same
-- hole. UNIQUE for the same reason the settlement's is: one broadcast pays for
-- one thing, and a replayed signature must not fund a second bond.
ALTER TABLE woc_market_bids
  ADD COLUMN IF NOT EXISTS bond_signature TEXT;
-- WHEN the signature was recorded: the bond poll's park threshold ages on
-- this (falling back to placed_at for legacy rows), because placement age
-- says nothing about how long the CHAIN has had the transfer: a bidder who
-- signs late in their window must still get the full poll cadence for
-- finality, not an instant park.
ALTER TABLE woc_market_bids
  ADD COLUMN IF NOT EXISTS bond_signature_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS woc_market_bids_bond_signature
  ON woc_market_bids(bond_signature)
  WHERE bond_signature IS NOT NULL;
-- The awaiting-finality queue: pending bonds that HAVE a signature are re-checked
-- by the sweep, and are exactly the rows the lapse sweep must not reap.
-- (This placed_at index still serves the stuck-bond readout's age reads.)
CREATE INDEX IF NOT EXISTS woc_market_bids_bond_confirming
  ON woc_market_bids(realm, placed_at)
  WHERE status = 'pending_bond' AND bond_signature IS NOT NULL;
-- Poll rotation for the awaiting-finality queue: a bond the chain leaves
-- undecided past the poll park delay rotates to the tail (poll_parked_at) with
-- an in-process backoff, so a standing set of never-decided signatures
-- cannot occupy the poll batch's head every pass and starve fresh bonds of
-- their finality checks. Rotation never touches placed_at (the readout's
-- age signal, the sweep_parked_at lesson); this DDL spells the expression
-- as its own literal (a template constant cannot reach this SQL string) and
-- confirmingBonds orders on BOND_POLL_ROTATION_ORDER, with the structural
-- floor pinning BOTH texts so drift fails a test rather than an index. A stale
-- poll_parked_at on a bid that left 'pending_bond' is inert: the partial
-- predicate drops the row from the queue, and no path re-enters it.
ALTER TABLE woc_market_bids
  ADD COLUMN IF NOT EXISTS poll_parked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS woc_market_bids_bond_confirming_rotation
  ON woc_market_bids(realm, (COALESCE(poll_parked_at, placed_at)))
  WHERE status = 'pending_bond' AND bond_signature IS NOT NULL;

CREATE TABLE IF NOT EXISTS woc_market_settlements (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES woc_market_listings(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  bid_id BIGINT REFERENCES woc_market_bids(id) ON DELETE SET NULL,
  attempt INT NOT NULL,
  buyer_account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  buyer_character INT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_wallet TEXT NOT NULL,
  amount_cents INT NOT NULL,
  state TEXT NOT NULL DEFAULT 'offered'
    CHECK (state IN ('offered', 'confirming', 'review', 'confirmed', 'delivering', 'delivered', 'expired', 'failed')),
  quote_reference TEXT,
  quote_expires TIMESTAMPTZ,
  -- Base-unit token amount from the stamped quote, kept for sale provenance.
  settled_amount_base TEXT,
  tx_signature TEXT UNIQUE,
  fail_reason TEXT,
  deadline_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Constraint evolution for a database created before the 'review' state: the
-- inline CHECK above only applies to a FRESH table, so a legacy table keeps
-- its old list and the first confirming -> review transition would abort with
-- a check violation. Gated on the constraint text, so it runs once per legacy
-- database and never rescans a healthy one. NOT VALID (the
-- AUTH_TOKENS_SCOPE_CONSTRAINT_SQL house pattern): new and updated rows are
-- still enforced, every STANDING value is in the wider list by construction
-- (the new list is a superset), and skipping validation keeps the
-- AccessExclusive hold inside the unbounded boot transaction to catalog-only
-- work instead of a table scan.
DO $woc_settle_state_ck$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'woc_market_settlements'::regclass
       AND conname = 'woc_market_settlements_state_check'
       AND pg_get_constraintdef(oid) NOT LIKE '%''review''%') THEN
    ALTER TABLE woc_market_settlements DROP CONSTRAINT woc_market_settlements_state_check;
    ALTER TABLE woc_market_settlements ADD CONSTRAINT woc_market_settlements_state_check
      CHECK (state IN ('offered', 'confirming', 'review', 'confirmed', 'delivering', 'delivered', 'expired', 'failed'))
      NOT VALID;
  END IF;
END $woc_settle_state_ck$;
-- Pre-flight repair for a database that ran the pre-guard code: the old
-- narrower index legally allowed a 'delivered' settlement to coexist with a
-- second open one (the reopen-after-delivered double-sell), and the wider
-- unique index below would abort the WHOLE realm boot on such a pair. Keep
-- the most-advanced settlement per listing and expire the rest under a
-- greppable reason. A no-op on healthy databases; idempotent after repair.
-- Gated on a VALID index of that name not existing yet, so the scan runs
-- once per legacy database and never again. The Var-free qual is not
-- constant-folded (these catalog reads are STABLE, not IMMUTABLE); the
-- planner treats it as a pseudoconstant and emits a one-time filter, so the
-- ranked subquery is planned but never executed on a healthy boot. Validity,
-- not bare existence: a failed CONCURRENTLY build (an incident-response hand
-- build; boot DDL itself is transactional and leaves no carcass) satisfies
-- to_regclass AND the IF NOT EXISTS below while enforcing nothing, which
-- would silently skip both the repair and the rebuild. Unbatched by design:
-- safe only while this table is pre-enable empty or scanned once per
-- upgrade; a re-use of this pattern on a populated table batches it.
-- The demotion keeps any prior fail_reason behind the greppable marker, and
-- delivered -> expired here is a deliberate exception to the
-- SETTLEMENT_TRANSITIONS terminality in woc_market_rules.ts (raw repair SQL,
-- not the runtime transition path). Retargeting the gate from _open to
-- _open2 deliberately re-runs this scan ONCE MORE on databases that already
-- carried the _open generation (measured trivial); after that it never
-- rescans a healthy database.
-- Operator note for a legacy upgrade: rows this demoted carry
-- fail_reason LIKE 'schema_dedupe%'; any demoted row that had reached
-- 'confirming' or beyond was a payment that may still land, so sweep
-- SELECT * FROM woc_market_settlements WHERE fail_reason LIKE 'schema_dedupe%'
-- after the first boot and reconcile by hand.
UPDATE woc_market_settlements
   SET state = 'expired',
       fail_reason = 'schema_dedupe' || COALESCE(':' || fail_reason, ''),
       updated_at = now()
 WHERE NOT EXISTS (
     SELECT 1 FROM pg_index i
      WHERE i.indexrelid = to_regclass('woc_market_settlements_open2')
        AND i.indisvalid)
   AND id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (
       PARTITION BY listing_id
       ORDER BY CASE state
         WHEN 'delivered' THEN 6 WHEN 'delivering' THEN 5 WHEN 'confirmed' THEN 4
         WHEN 'review' THEN 3 WHEN 'confirming' THEN 2 ELSE 1 END DESC, id ASC
     ) AS rn
     FROM woc_market_settlements
     WHERE state IN ${OPEN_SETTLEMENT_STATES_SQL}
   ) ranked
   WHERE ranked.rn > 1);
-- Exactly one OPEN settlement per listing: the live payment states plus
-- 'delivered', which stays open until the listing row closes so the
-- cancel/suspend/reclaim liveness checks and the insert guard keep seeing it
-- (a delivered-but-unclosed listing must never re-auction or double-sell).
-- Replaces woc_market_settlements_live, which excluded 'delivered'; the
-- corrected index is created first and the stale one dropped after, both
-- idempotent, so uniqueness never lapses across the swap. Deliberately boot
-- DDL rather than concurrent_indexes.ts: the marketplace is config-gated off,
-- these tables are empty until it launches, and the unique index is the
-- correctness authority the insert path relies on from the first request (a
-- CONCURRENTLY build can leave an INVALID carcass, which would silently drop
-- the invariant). Any post-launch index work here rides concurrent_indexes.ts.
-- Drop an INVALID same-named carcass first: IF NOT EXISTS matches on NAME
-- only, so a carcass would otherwise be kept and enforce nothing. The same
-- name-only matching means any future change to this index's predicate needs
-- a NEW index name (or an explicit DROP); it cannot be edited in place.
-- open2 IS that rename: it adds 'review' to the predicate (the operator
-- review state stays open) and replaces woc_market_settlements_open, which
-- is dropped only AFTER the wider index exists, so uniqueness never lapses
-- across the swap (the _live -> _open precedent).
DO $woc_open_idx$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = to_regclass('woc_market_settlements_open2')
       AND NOT i.indisvalid) THEN
    EXECUTE 'DROP INDEX woc_market_settlements_open2';
  END IF;
END $woc_open_idx$;
CREATE UNIQUE INDEX IF NOT EXISTS woc_market_settlements_open2
  ON woc_market_settlements(listing_id)
  WHERE state IN ${OPEN_SETTLEMENT_STATES_SQL};
DROP INDEX IF EXISTS woc_market_settlements_open;
DROP INDEX IF EXISTS woc_market_settlements_live;
CREATE INDEX IF NOT EXISTS woc_market_settlements_state
  ON woc_market_settlements(realm, state, deadline_at);
-- The confirming backlog and the stuck readout's delivering class order and
-- age on updated_at; without this they scanned the one-open-settlement index
-- and sorted. updated_at is stamped when the row ENTERS 'delivering' (the
-- claim UPDATE) and park rotation deliberately never moves it (it writes
-- sweep_parked_at instead), so it is both the batch order for unparked work
-- and the readout's honest age signal.
CREATE INDEX IF NOT EXISTS woc_market_settlements_state_updated
  ON woc_market_settlements(realm, state, updated_at);
-- Park rotation rides its OWN column: rotating the readout's age column made
-- a permanently parked row invisible to the monitor (re-stamped every retry,
-- it could never age past the stuck threshold). The delivering reconcile
-- batch orders on the rotation expression so a parked row still cycles to
-- the tail; the expression is shared verbatim with the queries through
-- PARK_ROTATION_ORDER (the hot-path SQL-shape rule).
ALTER TABLE woc_market_settlements
  ADD COLUMN IF NOT EXISTS sweep_parked_at TIMESTAMPTZ;
DROP INDEX IF EXISTS woc_market_settlements_state_created;
CREATE INDEX IF NOT EXISTS woc_market_settlements_delivering_rotation
  ON woc_market_settlements(realm, (COALESCE(sweep_parked_at, updated_at)))
  WHERE state = 'delivering';
CREATE INDEX IF NOT EXISTS woc_market_settlements_buyer
  ON woc_market_settlements(buyer_account, created_at DESC);
-- Postgres does not auto-index the referencing side of an FK. Without these,
-- every listing the retention prune deletes runs one sequential scan of the
-- settlements table per row (ON DELETE CASCADE), and every cascaded bid
-- delete runs another (ON DELETE SET NULL on bid_id). The listing_id index
-- carries id DESC as its second key so the offers reads' LATERAL
-- latest-settlement probe (WHERE listing_id = ... ORDER BY id DESC LIMIT 1)
-- is a one-tuple index seek instead of a per-offer-row sort; it supersedes
-- the single-column woc_market_settlements_listing (IF NOT EXISTS matches on
-- NAME only, so the reshape needs a new name and an idempotent DROP).
CREATE INDEX IF NOT EXISTS woc_market_settlements_listing_latest
  ON woc_market_settlements(listing_id, id DESC);
DROP INDEX IF EXISTS woc_market_settlements_listing;
CREATE INDEX IF NOT EXISTS woc_market_settlements_bid
  ON woc_market_settlements(bid_id);

-- Provenance and public price history. KEEP FOREVER by default: sales are the
-- marketplace's provenance record (docs/prd/woc/marketplace.md "Integrity");
-- no FK to listings so the listing prune never erases history.
CREATE TABLE IF NOT EXISTS woc_market_sales (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  listing_id BIGINT NOT NULL,
  item_id TEXT NOT NULL,
  item JSONB NOT NULL CHECK (jsonb_typeof(item) = 'object'),
  price_cents INT NOT NULL,
  amount_base TEXT,
  seller_account INT NOT NULL,
  buyer_account INT NOT NULL,
  seller_name TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  excluded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The Sales History tab's axes, stamped at the close-tail insert from the
-- settled listing (which carries quality/category/subcategory) plus a derived
-- sale_type ('auction' | 'buy_now' | 'directed'). Nullable and additive: rows
-- written before this shipped carry NULLs and sit OUTSIDE the filtered results
-- (no backfill, mirroring the pre-enable listing-category convention above;
-- sale_type is not even derivable post-hoc once the listing prunes). The
-- realm-wide read filters on these columns exactly as browseListings filters
-- the listing columns. category/subcategory are filter-only, never on the wire.
ALTER TABLE woc_market_sales ADD COLUMN IF NOT EXISTS sale_type TEXT;
ALTER TABLE woc_market_sales ADD COLUMN IF NOT EXISTS quality TEXT;
ALTER TABLE woc_market_sales ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE woc_market_sales ADD COLUMN IF NOT EXISTS subcategory TEXT;
CREATE INDEX IF NOT EXISTS woc_market_sales_item
  ON woc_market_sales(realm, item_id, created_at DESC);
-- The seller click-through's read (salesForSeller) rides its own index,
-- built CONCURRENTLY post-commit (woc_market_sales_seller_index.ts): sales
-- is keep-forever, so a transactional CREATE INDEX here would grow into a
-- boot-time write-blocking lock on the money path's insertSale.
-- Pre-flight repair, same shape as the settlements one above: a historical
-- double delivery left two non-excluded sale rows for one listing, and the
-- unique index below would abort the boot on them. Keep the EARLIEST row and
-- void later duplicates (excluded = true preserves them for audit). The
-- validity gate matters MORE here: sales are keep-forever, so an ungated
-- repair would re-scan the whole provenance table at every boot (the same
-- pseudoconstant one-time-filter mechanics as the settlements repair above,
-- and the same INVALID-carcass reasoning for gating on indisvalid).
UPDATE woc_market_sales SET excluded = true
 WHERE NOT EXISTS (
     SELECT 1 FROM pg_index i
      WHERE i.indexrelid = to_regclass('woc_market_sales_listing_once')
        AND i.indisvalid)
   AND id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (PARTITION BY listing_id ORDER BY id ASC) AS rn
     FROM woc_market_sales
     WHERE excluded = false
   ) ranked
   WHERE ranked.rn > 1);
-- One sale row per listing, forever: a double delivery fails closed here
-- rather than minting a second provenance row. Partial on excluded so an
-- operator who voids a bogus row (excluded = true) can land its correction.
-- Same carcass rule as the settlements index: drop an INVALID leftover so
-- IF NOT EXISTS cannot keep a name-matching index that enforces nothing.
DO $woc_sale_idx$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = to_regclass('woc_market_sales_listing_once')
       AND NOT i.indisvalid) THEN
    EXECUTE 'DROP INDEX woc_market_sales_listing_once';
  END IF;
END $woc_sale_idx$;
CREATE UNIQUE INDEX IF NOT EXISTS woc_market_sales_listing_once
  ON woc_market_sales(listing_id)
  WHERE excluded = false;

-- The DURABLE book-once ledger for custody parcels. The mail book lives in a
-- JSONB blob whose per-letter marker a player can delete (an emptied letter is
-- deletable) and which an older binary's loader would strip, so the blob can
-- never be the authority for "this parcel was already booked". A worker CLAIMS
-- the ref here first (the primary key makes the claim race single-winner); an
-- EXISTING claim is consulted, never adopted: booked_at set means delivered,
-- and an unbooked claim resumes only with rail-attributed proof (the column
-- comments below), else it PARKS. Failure direction is deliberate: a claim
-- with no parcel leaves the item held and VISIBLE to the operator (the row's
-- booked_at stays null), never silently duplicated.
-- OPERATOR WARNING: NEVER delete an unbooked claim row to unstick a delivery.
-- The next pass would mint a FRESH claim, and a fresh claim skips the
-- parcel-in-book check by construction; if the buyer already collected and
-- deleted the letter, that deletion re-arms the exact duplication this ledger
-- exists to prevent. Resolve a parked row by hand-delivering (then stamping
-- booked_at) or by confirming non-delivery before any reset. The one class
-- where hand-delivery is ITSELF the dupe: a parked GRANT claim (non-null
-- grant_character_id) may mean the item already sits in the buyer's bags
-- (an ambiguous grant, or an autosave that landed after a fence); confirm
-- the buyer does NOT have the item before delivering anything by hand.
CREATE TABLE IF NOT EXISTS woc_market_custody_claims (
  custody_ref TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  booked_at TIMESTAMPTZ
);
-- Rail attribution for a claim, and the whole exactly-once story hangs on it.
-- grant_character_id is the DIRECT hand-off intent: stamped BEFORE the
-- in-memory bag grant, converted to a mail intent only when the grant
-- provably left nothing behind (an ordinary grantCopy refusal). An unbooked
-- claim still carrying it means a grant MAY have persisted (an autosave can
-- land the granted bags even when the explicit save threw, and a lease fence
-- rejection says nothing about earlier saves under the then-valid nonce), so
-- no automatic path may mail or re-grant under this ref: it parks, visible in
-- the unbooked-claims read, for the operator. mail_intent_at is the MAIL rail
-- intent, stamped BEFORE the parcel is handed to the post office: the resume
-- may re-mail only while the parcel is still IN the live book (the in-blob
-- marker is advisory, a player can delete an emptied letter, so an absent
-- parcel may mean it was already collected, never that it was never sent).
-- A claim with NEITHER marker and no booking is unattributable (a legacy row
-- from before these columns, or a claim whose process died before stamping):
-- it parks, never mails. Legacy NULLs mean UNKNOWN, not "no attempt"; the
-- pre-enable deploy note is that woc_market_custody_claims must be empty (or
-- fully booked) before the first boot of this schema.
-- Retention: BOOKED rows only, aged on booked_at (never on a referent: the
-- listings prune leaves booked claim rows behind, there is no FK), on the
-- WOC_MARKET_CUSTODY_CLAIMS_RETENTION_DAYS window via
-- pruneBookedWocCustodyClaimsBatch below (registered with the nightly
-- retention sweep in main.ts). Unbooked rows are the operator's queue and
-- are NEVER pruned, at any age. The window must stay comfortably ABOVE the
-- listings window: a booked claim is the exactly-once evidence, and pruning
-- it while any settlement or listing row could still reach bookCustodyOnce
-- with the same ref would let a redrive mint a FRESH claim that skips the
-- parcel-in-book check (the duplication this ledger exists to prevent).
-- Growth rate is the sale rate (one short row per completed delivery or
-- return), so a year of provenance stays small.
-- INT to match every other character-id column. IF NOT EXISTS makes this a
-- no-op on a database that already ran an earlier BIGINT build of this ALTER
-- (dev databases only; the market never shipped): the width difference is
-- harmless there (no FK, and the reader converts through Number()).
ALTER TABLE woc_market_custody_claims
  ADD COLUMN IF NOT EXISTS grant_character_id INT;
ALTER TABLE woc_market_custody_claims
  ADD COLUMN IF NOT EXISTS mail_intent_at TIMESTAMPTZ;
-- The operator/diagnostic read: claims that never completed their booking.
CREATE INDEX IF NOT EXISTS woc_market_custody_claims_unbooked
  ON woc_market_custody_claims(realm, claimed_at)
  WHERE booked_at IS NULL;
-- Retention prune cursor (booked rows, oldest first). Boot DDL, not
-- concurrent_indexes.ts: pre-enable the table is empty.
CREATE INDEX IF NOT EXISTS woc_market_custody_claims_booked
  ON woc_market_custody_claims(booked_at)
  WHERE booked_at IS NOT NULL;

-- Account-scoped (deliberately realm-free): defaults follow the account.
CREATE TABLE IF NOT EXISTS woc_market_strikes (
  account_id INT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  strikes INT NOT NULL DEFAULT 0,
  suspended_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Account-scoped (deliberately realm-free): one acceptance of the
-- variable-token settlement terms per account.
CREATE TABLE IF NOT EXISTS woc_market_terms (
  account_id INT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A directed OFFER: the BUYER's proposed p2p purchase, before the seller agrees.
--
-- The buyer opens the deal by naming a price in the trade window, exactly the
-- way they would push gold across, and the seller answers by staging the goods.
-- So the offer carries a price and NO item: item_ref and item_id stay null
-- until acceptance, when the seller names the copy they are parting with.
--
-- This precedes the listing rather than being one, because escrow happens at
-- mutual acceptance (docs/prd/woc/p2p-woc-trade.md): escrowing earlier would
-- let anyone lock a chosen player's goods by proposing deals they never intend
-- to complete. Accepting is what creates the directed listing and takes the
-- item into custody, and from there the ordinary buy-now settlement runs.
--
-- The item is REFERENCED, not held: item_ref carries the same {index, itemId,
-- expectInstance} an extraction takes, captured at acceptance and validated in
-- the same call, so a copy that moved refuses as a stale copy.
CREATE TABLE IF NOT EXISTS woc_market_directed_offers (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  seller_account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Deliberately NOT an FK, matching woc_market_listings.seller_character.
  seller_character INT NOT NULL,
  seller_name TEXT NOT NULL,
  buyer_account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  -- Null until the seller accepts and names the copy (see the header).
  item_ref JSONB CHECK (item_ref IS NULL OR jsonb_typeof(item_ref) = 'object'),
  item_id TEXT,
  usd_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  -- Set when accepted: the directed listing this offer became.
  listing_id BIGINT REFERENCES woc_market_listings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The trade arm's poll read (directedOffersForAccount, every 2s per open
-- trade) never implied the retired pending-only partials' predicate: it
-- admits accepted rows (the payment leg) and, since the verdict grace arm,
-- just-resolved rows too, so without these two the whole read is a seq scan
-- of a table that grows per offer. A BitmapOr over the pair turns it into
-- per-account probes (measured: 2398 buffers to 206 on 200k rows). The
-- discriminator (status / updated_at) stays a heap filter, so the cost is
-- linear in the account's RETAINED offer history (the retention knob
-- WOC_MARKET_OFFERS_RETENTION_DAYS is the control), not in its live offers:
-- measure the per-account discard before enable. Two full indexes cost
-- roughly a third more WAL per offer transition (status sits in partial
-- predicates, so no HOT update). Boot DDL, not concurrent_indexes.ts:
-- pre-enable the table is empty.
CREATE INDEX IF NOT EXISTS woc_market_offers_buyer_all
  ON woc_market_directed_offers(realm, buyer_account, created_at DESC);
CREATE INDEX IF NOT EXISTS woc_market_offers_seller_all
  ON woc_market_directed_offers(realm, seller_account, created_at DESC);
-- The pending-only ACCOUNT partials (inbox/outbox) are retired: no reader is
-- left for them (the poll read above admits accepted and just-resolved rows,
-- so it cannot imply their predicate; the pair-pending unique index below and
-- woc_market_offers_due keep their own readers, the reopen probes and the
-- expiry sweep), so they were pure write amplification on every offer insert
-- and transition.
DROP INDEX IF EXISTS woc_market_offers_buyer_pending;
DROP INDEX IF EXISTS woc_market_offers_seller_pending;
-- The expiry sweep's due-claim seek.
CREATE INDEX IF NOT EXISTS woc_market_offers_due
  ON woc_market_directed_offers(realm, expires_at)
  WHERE status = 'pending';
-- Retention prune cursor (resolved offers, oldest first). This table grows per
-- offer, so it registers a prune primitive rather than keeping forever.
CREATE INDEX IF NOT EXISTS woc_market_offers_resolved_updated
  ON woc_market_directed_offers(updated_at)
  WHERE status <> 'pending';
-- The offer inverted after the table first shipped (the buyer now opens the
-- deal). item_ref stays acceptance-written; item_id has since re-tightened to
-- stamp at CREATION (H10, the fingerprint block below), so for it this DROP
-- now covers only LEGACY rows written between the inversion and the pin.
-- Dropping the NOT NULL is additive and idempotent; a pre-existing row keeps
-- its item.
ALTER TABLE woc_market_directed_offers ALTER COLUMN item_ref DROP NOT NULL;
ALTER TABLE woc_market_directed_offers ALTER COLUMN item_id DROP NOT NULL;
-- Both sides accept through the trade window's ordinary Accept button, so the
-- offer tracks each side's agreement and only the LAST one escrows. Additive.
ALTER TABLE woc_market_directed_offers
  ADD COLUMN IF NOT EXISTS buyer_accepted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE woc_market_directed_offers
  ADD COLUMN IF NOT EXISTS seller_accepted BOOLEAN NOT NULL DEFAULT false;
-- The agreed copy's fingerprint, stamped at CREATION (H10): the buyer opens
-- the deal naming the exact copy they saw, and acceptance escrows only a copy
-- whose pin matches. Stored as the fixed-width sha256 hex DIGEST of the sim's
-- canonical itemCopyPin string (the identity rule stays the sim's; the digest
-- caps a client-derived value that would otherwise ride every offer row at up
-- to the body cap). Nullable TEXT with no default (no table rewrite; a
-- pre-existing row keeps NULL and its acceptance refuses item_mismatch, the
-- safe direction for an offer that predates the pin).
ALTER TABLE woc_market_directed_offers
  ADD COLUMN IF NOT EXISTS item_pin TEXT;
-- The FK referent side of listing_id: Postgres does not index it, and the
-- nightly closed-listing prune pays a sequential scan of this table per
-- deleted listing to satisfy ON DELETE SET NULL without it (the same
-- rationale as the settlements/bids listing indexes above). Boot DDL, not
-- concurrent_indexes.ts: pre-enable the table is empty.
CREATE INDEX IF NOT EXISTS woc_market_directed_offers_listing
  ON woc_market_directed_offers(listing_id);
-- The converge arm's read: accepted offers whose escrow never stamped a
-- listing (the acceptance transaction threw). Tiny partial set by
-- construction; realm leads, updated_at ranges. Boot DDL, same rationale.
CREATE INDEX IF NOT EXISTS woc_market_offers_accepted_unstamped
  ON woc_market_directed_offers(realm, updated_at)
  WHERE status = 'accepted' AND listing_id IS NULL;
-- ONE pending offer per (buyer, seller) pair: the strike-farming bound. A
-- seller who could hold N of a victim's offers open and accept them all near
-- the TTL edge would earn the victim N strikes for one lapse of judgment;
-- with one live deal per pair, each hold needs a FRESH offer from the buyer
-- after the last one resolved. The database is the authority (two concurrent
-- creates race the service pre-read); the insert maps 23505 to the typed
-- offer_pending. Boot DDL, pre-enable-empty rationale as above; the repair
-- UPDATE below it exists for NON-empty developer and staging databases that
-- ran before the bound (duplicate pending pairs would fail the unique index
-- build and with it the whole boot): all but the newest pending offer per
-- pair expire, where "newest" means HIGHEST ID (the n.id > o.id tiebreak,
-- which equals insert order; a database whose timestamps disagree with id
-- order keeps the last-inserted row, not the last-touched one), unbatched
-- like the open2 repair (safe pre-enable; the first populated-table repair
-- must batch). Gated on the index's own validity,
-- open2's one-time pseudoconstant shape: the planner emits a one-time
-- filter, so a healthy boot (index already built) never executes the scan,
-- and dropping the index re-arms the repair. Idempotent either way: zero
-- rows once the index rules.
UPDATE woc_market_directed_offers o SET status = 'expired', updated_at = now()
 WHERE NOT EXISTS (
     SELECT 1 FROM pg_index i
      WHERE i.indexrelid = to_regclass('${WOC_MARKET_OFFERS_PAIR_PENDING_INDEX}')
        AND i.indisvalid)
   AND o.status = 'pending' AND EXISTS (
   SELECT 1 FROM woc_market_directed_offers n
    WHERE n.realm = o.realm AND n.buyer_account = o.buyer_account
      AND n.seller_account = o.seller_account AND n.status = 'pending' AND n.id > o.id);
-- Same carcass rule as the settlements and sales indexes: drop an INVALID
-- leftover so IF NOT EXISTS cannot keep a name-matching index that enforces
-- nothing. Without this, an invalid carcass would also hold the repair's
-- validity gate open forever (the repair re-scans every boot while the
-- index it repairs for never gets built).
DO $woc_pair_idx$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = to_regclass('${WOC_MARKET_OFFERS_PAIR_PENDING_INDEX}')
       AND NOT i.indisvalid) THEN
    EXECUTE 'DROP INDEX ${WOC_MARKET_OFFERS_PAIR_PENDING_INDEX}';
  END IF;
END $woc_pair_idx$;
CREATE UNIQUE INDEX IF NOT EXISTS ${WOC_MARKET_OFFERS_PAIR_PENDING_INDEX}
  ON woc_market_directed_offers(realm, buyer_account, seller_account)
  WHERE status = 'pending';
-- Step-up challenges (B6/R1): single-use, short-lived, wallet-signed
-- authorization for the custody-moving operations. The full signed message is
-- stored server-side so the client can never choose what gets signed (the
-- wallet_link_challenges rule); consuming DELETES the row, so a signature can
-- never authorize twice, and the binding digest pins the operation plus every
-- money figure the wallet showed (server/woc_market_stepup.ts). Growth is
-- bounded: every issue prunes the expired set first, the rate limiter bounds
-- the live set per account, and the nightly retention sweep drains realms
-- that stopped issuing (pruneExpiredWocStepUpChallengesBatch below).
CREATE TABLE IF NOT EXISTS woc_market_stepup_challenges (
  nonce TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  -- Adding a THIRD operation later cannot just edit this inline CHECK: the
  -- table is CREATE TABLE IF NOT EXISTS, so an existing box keeps the old
  -- constraint and the first insert of the new value would 23514. A new value
  -- needs a gated DROP CONSTRAINT + ADD CONSTRAINT ... NOT VALID block, exactly
  -- like the settlement-state CHECK evolution above.
  operation TEXT NOT NULL CHECK (operation IN ('create_listing', 'accept_directed_offer')),
  binding_digest TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The issue-time prune's seek. Realm-leading because the prune DELETE filters
-- realm = $1 AND expires_at <= $2, so a multi-realm deployment matches the
-- predicate instead of scanning the whole expiry range and filtering. Drop the
-- superseded single-column index (any box that booted the earlier build kept
-- it): the composite covers the same seek, so the old one is pure write
-- amplification the planner never chooses (the drop idiom this file uses for
-- every superseded index).
DROP INDEX IF EXISTS woc_market_stepup_challenges_expiry;
CREATE INDEX IF NOT EXISTS woc_market_stepup_challenges_realm_expiry
  ON woc_market_stepup_challenges (realm, expires_at);
-- The accounts FK-cascade scan: the composite above leads with realm, so an
-- accounts row DELETE would seq-scan this table without an account-leading
-- index. Matches the sibling tables' convention (woc_market_buy_now_abandons,
-- woc_market_bids index their account FK for exactly this).
CREATE INDEX IF NOT EXISTS woc_market_stepup_challenges_account
  ON woc_market_stepup_challenges (account_id);
`;

// LEGACY concurrent-index migrations for the retired crypto tables. They stay
// registered in server/concurrent_indexes.ts (the migration list is
// append-only and its order is pinned), so existing databases are untouched
// and a fresh database still converges to the same shape. The SQL is verbatim.

// daily_reward_events (the retired Daily Rewards point log).
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

// woc_market_listings (the retired Exchange ops Sold/Cancelled filters).
export const WOC_MARKET_OPS_CLOSED_INDEX_SQL = `
CREATE INDEX CONCURRENTLY IF NOT EXISTS woc_market_ops_closed_created
  ON woc_market_listings(realm, resolution, created_at DESC, id DESC)
  WHERE directed_buyer_account IS NULL AND status = 'closed';
`;

// IF NOT EXISTS accepts an invalid carcass left by an interrupted concurrent
// build, so the boot migration repairs it before trying the create again.
export const WOC_MARKET_OPS_CLOSED_INVALID_INDEX_CHECK_SQL = `
SELECT 1
  FROM pg_index i
 WHERE i.indexrelid = to_regclass('woc_market_ops_closed_created')
   AND NOT i.indisvalid
`;

export const WOC_MARKET_OPS_CLOSED_INVALID_INDEX_DROP_SQL =
  'DROP INDEX CONCURRENTLY IF EXISTS woc_market_ops_closed_created';

// woc_market_sales by realm (the retired Exchange sales history).
export const WOC_MARKET_SALES_REALM_INDEX_SQL = `
CREATE INDEX CONCURRENTLY IF NOT EXISTS woc_market_sales_realm_created
  ON woc_market_sales(realm, created_at DESC, id DESC);
`;

// A CREATE INDEX CONCURRENTLY killed mid-build strands the index INVALID, and
// IF NOT EXISTS then treats that carcass as existing on every later boot, so
// the read would silently keep sequential-scanning forever. The boot
// coordinator drops the carcass before re-running the create (the seller
// index carcass note).
export const WOC_MARKET_SALES_REALM_INVALID_INDEX_CHECK_SQL = `
SELECT 1
  FROM pg_index i
 WHERE i.indexrelid = to_regclass('woc_market_sales_realm_created')
   AND NOT i.indisvalid
`;

export const WOC_MARKET_SALES_REALM_INVALID_INDEX_DROP_SQL =
  'DROP INDEX CONCURRENTLY IF EXISTS woc_market_sales_realm_created';

// woc_market_sales by seller (the retired Exchange seller history).
export const WOC_MARKET_SALES_SELLER_INDEX_SQL = `
CREATE INDEX CONCURRENTLY IF NOT EXISTS woc_market_sales_seller
  ON woc_market_sales(realm, seller_name, created_at DESC);
`;

// A CREATE INDEX CONCURRENTLY killed mid-build strands the index INVALID, and
// IF NOT EXISTS then treats that carcass as existing on every later boot (the
// player_metrics_db.ts carcass note), so the read would silently keep
// sequential-scanning forever. The boot coordinator drops the carcass before
// re-running the create.
export const WOC_MARKET_SALES_SELLER_INVALID_INDEX_CHECK_SQL = `
SELECT 1
  FROM pg_index i
 WHERE i.indexrelid = to_regclass('woc_market_sales_seller')
   AND NOT i.indisvalid
`;

export const WOC_MARKET_SALES_SELLER_INVALID_INDEX_DROP_SQL =
  'DROP INDEX CONCURRENTLY IF EXISTS woc_market_sales_seller';
