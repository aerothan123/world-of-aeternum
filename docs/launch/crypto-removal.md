# Crypto removal: what left, what stays on purpose, and why

Branch `feature/launch-blockers`. Companion to `docs/launch/rebrand-wyndlewood.md`
and the readiness audit's blocker 6 ("Crypto code still in the tree"). Steam does
not allow blockchain games, and the owner decided the feature is removed, not
hidden. `tests/crypto_removed.test.ts` is the standing proof for every shipping
surface below.

## Removed

- **Packages.** `@reown/*`, `@solana/*`, `@wallet-standard/*`, `bs58`,
  `@noble/curves` and `tweetnacl` left `package.json`, and `pnpm-lock.yaml` was
  regenerated so none of them (nor `jayson`, `stream-json`, `bigint-buffer`, the
  `uuid@8` copy or the `zod@3.22.4` copy) resolves any more. The `stream-json@1`
  override, the `bigint-buffer` build entry and the Reown zod patch went with
  them, and the five audit exceptions whose only path was the wallet stack are
  retired in `docs/security/dependency-audit-catalog.md`.
- **Licenses.** `THIRD_PARTY_NOTICES.md` no longer describes wallet linking, and
  the Reown and WalletConnect community license texts are gone from
  `third_party/licenses/`.
- **Database.** The wallet-link, Seeker-claim and $WOC Exchange tables are no
  longer re-created at boot. `server/legacy_crypto_drop_db.ts` drops them
  idempotently (the one destructive DDL in the schema, by owner decision), the
  source-writer guard no longer names the market tables, and the three Exchange
  concurrent-index migrations left the registry. The account export no longer
  reads Seeker claims.
- **Player text that still rendered.** The guide FAQ's "Do I need a crypto
  wallet?" rows and the daily-rewards guide section were already retired
  (`scripts/i18n_retired_keys.mjs`); no live page renders a chain, token or
  wallet string, pinned by the landing, static and legal page checks in
  `tests/crypto_removed.test.ts`.

## Removed in the second pass (`fix/remove-crypto`)

- **Android Solana Store flavor.** The `solanaStore` product flavor, its
  Mobile Wallet Adapter plugin, encrypted wallet-token store, backup rules,
  unit and instrumentation suites, and the `com.solanamobile` /
  `io.github.funkatronics` dependencies are gone; `play` is the one flavor and
  `docs/mobile-store-release.md` documents only the Play artifact.
- **Payment-rail art.** The Solana and USDC brand marks under
  `public/claudium/icons/` (unused since the rails left) and their credits.
- **Docs.** The wallet-link, marketplace, P2P token trade and holder-flair
  PRDs, the marketplace hardening packet, the market runbook and the market
  screenshots. The README (and every translation of it) no longer has a Web3
  section, a token contract address, or Solana and USDC in its brand marks.
- **Dead styles.** The holder-tier nameplate badge and halo, the wallet-only
  CTA states, the player-card wallet toggle, the token coin chip, and the
  trade window's token arm (rules and orphaned comments).

## Kept on purpose (not oversights)

- **The Exchange letters** (`woc_market_delivery`, `woc_market_return`,
  `woc_market_sold` in `src/sim/content/letters.ts`). Letter ids are persisted
  on booked mail rows, so an existing mailbox must still render them; their
  text names no chain, token or wallet.
- **The `woc_token` currency art** stays in the accepted v0.39 currency cohort
  (a hash-pinned history record) but no live surface paints it.
- **The launch wipe's `woc_market_*` blockers** (`server/launch_wipe_core.ts`)
  probe with `to_regclass`, so they read zero on a dropped schema and still
  refuse a wipe on a database that predates the drop.
- **The `.wallet-cta` / `.cs-wallet` class names** style the GitHub, Steam
  and Epic link rows on character select; only the names are historical.
- **Error codes** `wallet.*`, `seeker.*` and `woc_market.*` in
  `server/http/error_codes.ts`, and their `apiError.*` mirrors in
  `src/ui/api_error_i18n.ts` and `src/ui/i18n.catalog/api_error.ts`. The catalog
  is append-only by contract (`server/http/CLAUDE.md`, "Error codes": codes are
  permanent, never renamed or removed; `tests/server/http/error_codes.test.ts`
  snapshot-guards it, and `tests/api_error_code_parity.test.ts` requires a client
  key for every code). No route emits them any more; they are dead rows a client
  can only see if a server older than this branch answers.
- **Retired i18n keys** under `wallet.*`, `hudChrome.wocMarket.*`,
  `hudChrome.walletBridge.*`, the wallet leaves of `hudChrome.wocStore`,
  `hudChrome.dailyRewards`, `hudChrome.trade`, `hudChrome.account`,
  `hudChrome.bank`, `hudChrome.options`, `hudChrome.claudium` and the guide FAQ
  rows. The repo's retirement path is registration in
  `scripts/i18n_retired_keys.mjs`, not deletion: every locale overlay still
  carries a reviewed translation for each, contributors never edit the overlays,
  and `tests/guide_key_coverage.test.ts` proves a retired key has no live
  reference. They render nowhere.
- **`daily_reward_*` tables** in `server/db.ts` SCHEMA and the
  `daily_reward_excluded_accounts` view. The Daily Rewards window is now the
  Claudium store surface, the ban tables back the admin exclusion view, and the
  retention tests exercise them; nothing in them is chain data.
- **Internal names.** `woc_*` storage keys, the `WOC_*` environment variables
  and the `wocStore` i18n subtree are save and config compatibility names
  (`docs/launch/rebrand-wyndlewood.md`, "Deliberately NOT renamed"), not features.

## Owner follow-ups

- The Steam content survey still needs the "no blockchain or NFT" answer and the
  AI content disclosure (readiness audit, "Not blockers but before launch").
- Dropping the `daily_reward_*` tables is a separate decision if the Claudium
  store never ships at Early Access.
