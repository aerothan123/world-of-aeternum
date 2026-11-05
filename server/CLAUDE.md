<!-- server/: the authoritative game server. Local conventions only.
     Root CLAUDE.md (architecture, the one-sim invariant, build/test) loads
     alongside this; don't repeat it here. server/ is NOT under src/. -->

# server/: authoritative game server

esbuild-bundled for Node via `npm run server` (output `dist-server`); persists to
Postgres and serves the built client from `dist/`.

## Module-first: where new server code lands
- **A new REST endpoint** is a `RouteDef` module (`server/<domain>.ts`) registered in
  `server/http/registry.ts` (recipe below), never an inline handler in `main.ts`.
- **New WS/loop-side behavior** is a sibling module, never another `GameServer`/`main.ts`
  method cluster. Pure decision logic (join rules, command parsing, rate windows) goes in a
  host-agnostic module a Vitest imports directly (exemplars: `linkdead.ts` `planJoin`,
  `moderation_commands.ts`); anything needing IO goes behind an injected deps bag or a narrow
  host interface so it tests without a DB or HTTP server (exemplars: `ws_auth.ts`
  `createWsAuth`, `moderation_service.ts`). REST domains use the same split: a pure,
  IO-free core beside a DB+HTTP shell (`discord_oauth.ts` versus `discord.ts`).
- **A new domain's tables** go in an exported `<DOMAIN>_SCHEMA` DDL constant in its
  `<domain>_db.ts`, applied by `ensureSchema` (`db.ts`) under the advisory lock (exemplars:
  `SOCIAL_SCHEMA`, `MAPS_SCHEMA`); only core character/account/token/world-state DDL lives
  in `db.ts` `SCHEMA` itself.
- **Tests** go in `tests/` (endpoint tests via the `FakeDb` helpers below). Bug fixes are
  test-first: a failing repro (extract the pure core if buried), then the smallest green change.

## Key files
The load-bearing seams, not an inventory (`ls server/*.ts` for the live set; a `<domain>.ts`
logic module pairs with a `<domain>_db.ts` that owns its SQL).

| File | Role |
|---|---|
| `main.ts` | HTTP server + the prefix-ladder dispatch (`routeHttpRequest` sends `/api` `/admin/api` `/oauth` `/internal` to four flag-gated entries) + the RETAINED legacy handler ladder, WS `/ws` upgrade wiring (builds the `createWsAuth` deps bag), boot/shutdown, leaderboard cache (migrated routes live behind `server/http/`, see its `CLAUDE.md`) |
| `game.ts` | `GameServer`: owns the `Sim`, the 50 ms loop, interest-scoped snapshots, command dispatch, chat. **Largest file; extract beside it, never grow it** (Module-first above) |
| `ws_auth.ts` | the whole WS auth handshake behind an injected deps bag (`createWsAuth`): strict first-frame `ONLINE_WORLD_AUTH_TYPE` check before credential or DB work, moderation/character checks, per-IP cap, the realm admission cap (`MAX_PLAYERS_PER_REALM`, default 5000, explicit 0 disables; checked with an in-flight admission counter so racing handshakes cannot admit past it; resumes and admins exempt), lease acquire, `game.join`. Unit-testable without a DB or HTTP server. Its rejection literals are wire contract the client matches verbatim (`src/ui/api_error_i18n.ts`): change one and the matcher in the SAME commit. Every refusal sends an `{t:'error'}` frame before closing (never a bare close code): the client classifies the literal, so a frameless refusal turns into a silent retry loop |
| `msg_rate_limit.ts` / `msg_lanes.ts` / `list_read_guard.ts` | the inbound WS flood defense: the pre-parse gate (frame + byte buckets and the shared abuse window that kicks), the post-parse per-class lanes, and the ignore/block list-readout meter (see "Inbound WS flood defense") |
| `ws_backpressure.ts` | the OUTBOUND counterpart to the flood defense: terminates a session whose `ws.bufferedAmount` climbs past the hard limit. `ws.send()` never blocks and a non-draining client's socket stays OPEN, so without this one frozen tab or deliberately non-reading attacker accumulates an unbounded write buffer and can OOM the realm; `readyState` checks do not catch it |
| `linkdead.ts` | pure session-lifecycle decision core: `planJoin` (resume/reject/join) + `LINKDEAD_GRACE_MS` (see Persistence) |
| `input_seq.ts` | the one fold of a received `seq` into `session.lastInputSeq` (the R9 gap booking plus the ack high-water the self snapshot echoes), shared by every `input` frame and the client's seq-bearing `target` command (`src/net/target_echo.ts` reads a covering ack as "built after my command"); pure, gap sink injected (`tests/input_seq_fold.test.ts`) |
| `keepalive_sweep.ts` | pure self-clocked keepalive-sweep decision (`keepaliveSweepDelayed`, `KEEPALIVE_STALL_FACTOR`): a sweep that fires late (an event-loop stall) re-arms every session instead of terminating them, so one stall can never mass-disconnect the realm; a genuinely dead socket still reaps one clean interval later; plus the stall-proof hard silence deadline (`WS_SILENCE_DEADLINE_MS`, `noteClientFrame`, `socketSilentPastDeadline`, `shouldReapSession`): a socket the server processed no frame from for ten minutes, measured only up to the previous sweep, is reaped however late the sweep runs, so a black-holed socket can never hold a character 'already in world' without bound |
| `db.ts` | `pg` pool, core `SCHEMA` DDL + `ensureSchema`, character/account/token/world-state queries. Owns the timeout ladder (connect < statement default < the `runWithStatementTimeout` heavy allowance < the driver-side `query_timeout` backstop; constants + rationale at the top, relation pinned by `tests/server/tunables.test.ts`): wrap a known-long read in `runWithStatementTimeout`, never lift the session default, and remember `SET LOCAL` cannot lift the driver backstop. Boot DDL runs on a dedicated non-pool `Client` so schema setup is never capped |
| `account.ts`, `totp.ts` | account self-service routes: password change/forgot/reset, verified email change, data export, TOTP 2FA (`totp.ts` is the pure RFC 6238 core) |
| `admin_permissions.ts`/`admin_routes.ts`/`staff_db.ts` | fine-grained admin authz: permission vocabulary + role bundles / declarative route-to-permission map (fail-closed, guarded by `tests/admin_routes.test.ts`) / `accounts.admin_roles` SQL + `admin_role_changes` audit |
| `moderation_commands.ts`/`moderation_service.ts`/`moderation_db.ts` | pure parser for the in-game moderator chat commands (`/kick` `/mute` `/ban` `/suspend` `/spectate` `/jail`, ..., with duration caps, plus the admin `/motd`) / the moderation service behind a host interface, wired into `GameServer` / writes + unified history. `/motd` (the `realm.motd` grant) delegates to `realm_motd.ts`: the realm message of the day, held in memory, greeted at every fresh join, broadcast serialize-once on change, persisted with its change trail by `realm_motd_db.ts`. `clear_item_name.ts` is the one content-moderation arm on an item COPY (the Masterwrought legendary name strip: a superadmin-only, audited, offline-only blob write behind an injected deps bag; its write rides `db.ts` `saveOfflineCharacterState`, fenced on the load lease; operator runbook in `DEPLOY.md`) |
| `chat_filter.ts`/`chat_filter_db.ts` | host-agnostic profanity/slur filter (soft cosmetic + hard server-enforced tiers) / admin word-list SQL |
| `bot_detector/contract.ts` / `stub.ts` | `BotDetector` seam (`#bot-detector`): the contract interface / the no-op stub used when the private clone is absent |
| `antibot_config_db.ts` | per-realm JSONB state plus append-only audit history for the bot-detector runtime config (the admin Bot Detector > Configuration panel); validation and live apply happen inside the detector (`BotDetector.applyConfig`) |
| `bank_ledger.ts` | append-only `bank_ledger` observer: diffs `Sim.bankInfoFor` around each bank dispatch and writes the moved delta via a fire-and-forget FIFO (audited offline by `scripts/bank_audit.mjs`) |
| `bank_entitlements.ts` | pure bonus-slot source registry + `computeBankBonus` (email verified / Discord / qualified referrals); stamped at the fresh-join handshake via the injected `WsAuthDeps.bankBonusForAccount`, never client-supplied |
| `deeds_db.ts` / `deeds_records.ts` | deeds SQL boundary (`character_deeds` upserts, rarity counts, recent earns, broadcast opt-out; the board roll-up is `deedsBoardRanked` in `db.ts`, aggregated SQL-side with Renown passed as parameters) / the `deedUnlocked` observer: fire-and-forget FIFO upserts, the `isMarqueeDeed` predicate, and the dual storefront mirror fan-out (BOTH the Steam and Epic `onDeedRecorded` hooks fire after each upsert, D21; the marquee guild/friend broadcast fan-out itself lives in `game.ts`); the sim decides unlocks, this only records them |
| `deeds_board.ts` / `deeds.ts` | the Renown leaderboard's pure scoring core (account-level dedupe, entry floor, score-then-earliest tie-break; Renown values come from the content table, never SQL) / the `RouteDef` API surface (public rarity read, broadcast toggle), TTL-cached in `main.ts` |
| `steam/` / `epic/` | the env-gated (`STEAM_ENABLED` / `EPIC_ENABLED`, off by default) storefront achievement mirrors: link-not-login association plus the deed-to-achievement push, mirror-never-authority. The shared pattern is documented in `server/steam/CLAUDE.md`; `server/epic/CLAUDE.md` covers only the Epic deltas |
| `reliquary.ts` / `reliquary_rarity_db.ts` | the Reliquary API surface: registry-only `RouteDef`s mirroring the deeds rarity rung (static `routes`, `configureReliquaryRuntime` injection, no legacy twin); the rarity aggregate unnests `characters.state` JSONB in place and shares the deeds rarity TTL cache + single flight in `main.ts`, so the characters walk never gains a second cadence |
| `guild_bank_state.ts` (+ `guild_bank_op_guard`/`op_log`/`counterparty`/`log`/`log_db`/`log_delivery`) | guild bank host glue: the escrow-merge save path (a session persists only its OWN unflushed op deltas, never the shared live book; the row is rebuilt inside the transaction, and a refused book half aborts the paired character half via `GuildBankEscrowRefused`), the dedicated op token bucket, unflushed-op-log compaction, counterparty ledger rows, and the member-visible transaction history read (`guild_bank_log.ts`: the page cache keyed by guild, kind and cursor, busting only the newest windows; `guild_bank_log_db.ts`: the one paged statement with its `more` probe and lowered statement timeout; `guild_bank_log_delivery.ts`: the request decode, the post-await authority re-check and the echoing frame). SQL seam: `db.ts` `loadGuildBankRows`/`saveCharacterAndGuildBankState`; design record `docs/guild-bank/escrow-fix-plan.md` |
| `claudium.ts` / `claudium_proxy.ts` | CLAUDIUM, the server-authoritative soft currency: a thin authenticated pass-through that computes NO peg/price/balance (ALL economy logic lives in the external service), proxied through `claudium_proxy.ts`, which fails closed with typed unavailable results and never throws when the service is unset or unreachable. The shared `handleClaudiumApi` core is called by BOTH dispatch arms (mirrors the daily-rewards twin) |
| `parse/` | the combat parse recorder: a read-only observer at the tick drain that segments play into fights and ships gzip NDJSON to the external parse service; see `server/parse/CLAUDE.md` |
| `email/` | transactional + marketing email, the ONE place `server/` renders final localized text itself; see `server/email/CLAUDE.md` |
| `discord.ts` (+ `discord_oauth`/`discord_db`/`discord_relay`/`discord_activity`/`discord_activity_pvp`/`discord_pvp_feed`/`discord_hill_feed`/`discord_link_changes`/`discord_queue_pops`/`discord_queue_pings`/`discord_queue_pings_db`/`discord_status_cache`/`discord_bot_counters`/`http/discord_bot_metrics`) | Discord integration: link/unlink OAuth shell + rewards, in-game `!` community-command relay, activity feed the bot drains (the duel card builder in `discord_activity_pvp`), the World PvP kill feed (`discord_pvp_feed`: the bounded names-only queue behind the outbox's `pvpKills` stream, fed from the server-only `worldPvpKill` sim event) and the King of the Hill spawn calls for the same channel (`discord_hill_feed`, from the server-only `hillAnnounced` event, mapped onto the server clock), the bounded linked-member change feed the outbox carries, the queue-pop DM feed (`discord_queue_pops`: the tick observer over `bgProposed`/`arenaFound`, the opt-in cache, the bot-cadence watch signal; opted in per account through the `/api/discord/queue-pings` toggle pair in `discord_queue_pings`), the keyed `/api/discord` status cache busted on every write, and the bot's governor counters exposed as prometheus series |
| `github.ts` (+ `github_oauth`/`github_db`/`github_contributors`) | GitHub contributor linking for the developer badge + merged-PR tally |
| `oauth.ts`/`oauth_db.ts`, `character_sheet.ts`, `profile_page.ts`, `avatar.ts` | read-only companion API: OAuth code+PKCE and device grants (scope `character:read`), pure sheet normalizer, public SEO profile pages + generated avatars |
| `maps.ts`/`maps_db.ts`/`maps_routes.ts`, `user_assets*.ts` | map editor: custom-map persistence with fork lineage / hardened player GLB uploads (both mirror the `SocialService`/`SocialDb` split) |
| `tick_profiler.ts` / `tick_rate_meter.ts` | debugging the 50 ms budget: rolling per-phase loop timings, achieved wall-clock tick rate (the two can disagree, see the meter header) |
| `mob_scan_tick_stats.ts` | folds the sim's per-tick mob-scan visit counters (`Sim.mobScanCounters`, observer-only) into the `PERF_TICK_LOG` heartbeat tokens (`aggroVisits=`/`threatVisits=`) and the admin tick-capture accumulators; `game.ts` keeps only the holder and the apply call |
| `cached_read.ts` / `deeds_board_warm.ts` / `discord_status_cache.ts` | the three shared-read cache shapes: single-key `createCachedRead` (TTL, single-flight, stale-on-error, joiner-refusing bust) / the extended `singleFlight(run, epochOf?)` for per-scope epoch-keyed board flights / the keyed bounded per-account cache behind `GET /api/discord` (see Hot paths) |
| `auth_guard_core.ts` | the per-request auth-guard reads' pure core (token scope/expiry verdict + the moderation status ladder, computed from raw rows at read time), shared by the `db.ts` read path |
| `retention_sweep.ts` | the advisory-locked, self-clocked nightly sweep of batched per-table prunes; every table that grows without bound registers here (see Hot paths) |
| `event_record_observers.ts` / `craft_roll_events.ts` / `craft_roll_events_db.ts` | the event drain's database RECORD arms (one sim event in, one fire-and-forget row out: the ftue_events quest/death rows and the `craft_roll_events` chance-based crafting outcome audit, a bounded FIFO writer over a pure schema+insert+prune module); a new "log this sim event to a table" need is a new arm here plus a `*_db.ts` sibling, never a block in game.ts |
| `concurrent_indexes.ts` | post-boot `CREATE INDEX CONCURRENTLY` seam for new indexes on big live tables |
| `legacy_crypto_drop_db.ts` | the ONE destructive DDL in the schema, by owner decision (Wyndlewood ships no crypto feature): `DROP TABLE IF EXISTS ... CASCADE` for the retired wallet-link, Seeker-claim and $WOC Exchange tables, applied by `ensureSchema` after every CREATE and before the source-writer guard; idempotent, pinned by `tests/schema_wiring.test.ts`. Never list a table live code still touches |
| `interest_scope.ts` | who is inside whose interest: the radii and hysteresis, the same-slot battleground widening, and the world-boss LANDMARK widening (`MobTemplate.landmarkRange`, so a boss the client draws as a far sprite is actually sent from across the zone). One module because the question is answered at THREE points that must agree, the shared query's reach, the per-viewer cutoff and the per-entity limit, and widening one of the three alone is a silent no-op |
| `realm_readout_memo.ts` / `event_frame.ts` / `interest_candidates.ts` | broadcast build-once seams: per-pass realm readout memo (rides `maybeRaw`), serialize-once event frames (sent via `sendRaw`), per-cell shared interest gathering (see Hot paths) |
| `event_delivery.ts` / `attack_cue.ts` | who receives which event: the combat-participant scoping (a `damage`/`heal2`/`absorb` event reaches the two sides and their parties, never a stranger's combat log or meters), the anchor radius check, and the bystander ATTACK CUE: every in-range session a damage event is kept from gets the numberless `attackCue` SimEvent derived from it (serialized at most once per event per batch) so a stranger's swing, blade contact and impact VFX still play on their client; offline needs none, the HUD hands the renderer the damage event itself. Pinned by `tests/combat_log_event_route_online.test.ts` and `tests/attack_cue_route_online.test.ts` |

## Invariants, YOU MUST keep these
- **Trust nothing from the client.** Movement intent + `cmd`s arrive over WS;
  every combat/loot/quest/economy/talent outcome resolves *inside the `Sim`*.
  `dispatchMessage` (game.ts) type-checks each field before calling a `sim.*`
  method, keep that guarding when you add a command.
- **Wire protocol lockstep with `src/net/online.ts`.** Server sends `hello` /
  `snap` (with `self`/`ents`/`keep`) / `events` / `social` / `censor` / `error`; client
  first sends `{ t: ONLINE_WORLD_AUTH_TYPE, token, character }`. The versioned discriminator
  rejects mixed built-in world layouts in both rolling-deploy directions before admission.
  Any wire change must land in both files together.
- **No browser/render/ui imports.** This bundles for Node, import only from
  `src/sim/`, `src/world_api.ts`, and `node:*`. Never from `render/`/`ui/`/`game/`/`net/`.
- **SQL lives only in `db.ts` and `*_db.ts`.** Logic modules (`game.ts`,
  `social.ts`, `admin.ts`) carry zero raw SQL: `SocialService` talks to a
  `SocialDb` interface so tests use an in-memory fake. Don't inline `pool.query` in a logic module.
- **`ALLOW_DEV_COMMANDS=1` gates the whole dev-cheat surface** (dev/E2E only, **never prod**):
  every `dev_*` case in `dispatchMessage` (game.ts), `Sim.devCommands` (set from the env var
  when `GameServer` constructs the `Sim`, enabling the full `/dev` chat set in
  `src/sim/dev_commands.ts`, `handleDevChat`: level, teleport, give, spawn, heal, and friends),
  and the dev-only `GET /api/perf` read (both dispatch arms).

## Persistence model
- Character level + full state (gear/bags/bank/quests/position/money/talents/arena/lifetimeXp/
  deeds/deedStats/activeTitle/renown) stored as **JSONB** in `characters.state`;
  `serializeCharacter` converts to and from the `Sim`.
  Same-blob atomicity is the bank's anti-dupe cornerstone: the personal bank NEVER gets its own
  `world_state` row. Treat the bank rollout as forward-only (a pre-bank binary's save drops the field).
- **Per-character load lease** (`character_leases`): acquired at the WS handshake between
  `getCharacter` and `game.join` (90 s TTL, heartbeats on the autosave loop, nonce-fenced release),
  so two processes can never double-load one character. The steal predicate has three arms
  (expiry, same holder, same AUTHENTICATED account), so a player whose old process died
  reclaims their own character immediately instead of waiting out the TTL; rows with a NULL
  `account_id` fail that arm closed. Character saves are lease-fenced: every fenced
  character-write path (the `db.ts` save pair plus `saveCharacterStateOnClient` inside the
  marketplace escrow and delivered-save transactions)
  takes the session's lease nonce and lands only while the row still carries it (an in-statement
  EXISTS fence, never check-then-write), and a fenced-out session is kicked with the existing
  takeover signal, so a displaced zombie can never overwrite live state. `bank_ledger` is the
  append-only per-op audit trail (`scripts/bank_audit.mjs` replays it offline).
- **Disconnect is not leave.** `linkdead.ts` holds a dropped session in-world for
  `LINKDEAD_GRACE_MS` (5 min); `planJoin` (pure, unit-tested) decides resume/reject/join, and a
  resume never re-acquires the lease. Forced disconnects (moderation, takeover, anti-bot) skip
  grace and tear down via `GameServer.leave()`. Never resume a session whose teardown has begun
  (the `left` flag): the reconnect would get a zombie whose lease is released under it.
- Every durable LIVE-SESSION character write rides the per-character FIFO
  (`GameServer.enqueueCharacterWrite`, backed by `serial_writer.ts` `createKeyedSerialWriter`):
  commit order is enqueue order across autosaves, leave flushes, the marketplace escrow
  persist, and (since the escrow write-path rider) the marketplace delivered save
  (`commitGrant` through custody's bounded `persistGrantSerialized`: in-slot serialize, a
  wait deadline that parks instead of blocking the sweep), and every write's blob carries
  the session save fixups (`character_save_fixups.ts`: jail and jail-visit position, the
  visit's stowed pet, the jail flag; /spectate needs none, the body never moves). The offline admin/boost writers (the rename and reclaim signer
  sweeps, the PBE roster save, the clear-item-name strip) ride the lease-fenced
  `saveOfflineCharacterState` since masterwrought Phase 18, so no character-blob
  writer is unfenced: a live lease makes the write touch nothing, logged and
  counted rather than raced. Cross-queue order is the character
  FIFO first, THEN the market serial writer; never enqueue from inside a market thunk, an
  open transaction, or another job for the same character.
- Save cadence: autosave every **30 s** (`AUTOSAVE_SECONDS`), on `leave`, and on
  `SIGINT`/`SIGTERM` shutdown (`saveAll`). World Market is a per-realm JSONB row (`world_state`
  key `market:<realm>`), realm-scoped like everything else; the one-shot legacy `'market'` row
  backfill lives in `server/market_backfill.ts`, its rollback story in
  `docs/api-pipeline/phase-20-rollback-runbook.md`.
- **Character names are globally `UNIQUE`** (catch `23505`, return 409 "name taken").
- Leaderboards (`topLifetimeXp`, `topArenaRatings`) sort on JSONB expressions and
  are read through the **in-memory cache in main.ts**, never per-request under load.

## Hot paths: shared reads, retention, broadcast
One process serves a whole realm, so per-request and per-tick cost is what scales.
The seams below keep it flat; use them, never re-invent them. The recurring failure is
not the seams but the SHAPE of a cost: work that looks flat on a fresh world and scales
with a collection that grows for months in production. The last four bullets exist for
that shape.

- **Shared (viewer-identical) reads are cached with single-flight.** Three shapes:
  `createCachedRead(refresh, {ttlMs})` (`cached_read.ts`) for a single-key read (TTL,
  single-flight, stale-on-error, and a bust that refuses in-flight joiners), the
  extended `singleFlight(run, epochOf?)` (`deeds_board_warm.ts`) for per-scope board
  flights keyed on `() => boardEpoch`, so the existing `bustBoardCaches` epoch bump also
  evicts readers that joined mid-refresh, and the keyed bounded per-account
  `discord_status_cache.ts` (a Map of CachedRead entries with LRU eviction) for the one
  account-scoped hot read, `/api/discord`. Exemplars: `admin_overview_cache.ts` (dual-arm
  memo), the leaderboard/guild/arena/deeds
  flights in `main.ts`; pinned by `tests/server/board_read_single_flight.test.ts`.
  Rules: a new endpoint whose response is identical for every caller (a board, a count,
  an aggregate) reads through one of the first two shapes, never a per-request
  `pool.query` (the keyed third shape is for an account-scoped hot read);
  anything a moderation action can change MUST be bust-wired in the same change (TTL
  alone delays enforcement); a deliberately non-busted read (a moderation-invariant
  COUNT) records why in a comment.

- **Every table that grows without bound gets a retention story in the same change.**
  The nightly sweep (`retention_sweep.ts`, registered after listen in `main.ts`) runs
  batched prunes under a per-run budget; windows are env keys in `.env.example`, each
  with a POSITIVE code default, so an unset key prunes at the value its `.env.example`
  row states; `0` is the explicit keep-forever, and the reads are deliberately
  untrimmed so a whitespace value numbers to 0, the safe side for a delete. A new
  per-event, per-session, or per-day table
  either registers a prune primitive in its `*_db.ts` or carries an explicit
  keep-forever comment at the DDL. Fold before deleting when readers need lifetime
  history (`play_session_retention_db.ts` is the exemplar: an atomic fold-into-rollups
  CTE, then delete). Prune SQL: batch via a LIMIT subquery; no ORDER BY unless the
  cutoff column is indexed (unindexed, it plans a full sort per batch; pin the absence);
  NOT EXISTS over NOT IN for referent guards (NOT IN falls off a work_mem cliff).

- **SQL shape on hot paths.** A query the planner should serve from an expression index
  must share the index's SQL text verbatim (one shared module-level constant, e.g.
  `LIFETIME_XP_EXPR` in `db.ts`, used by both the query and the DDL). Hot views prefer plain UNION
  arms over OR-joined EXISTS (the shape `DAILY_REWARD_EXCLUDED_ACCOUNTS_VIEW_SQL` in
  `db.ts` keeps, now LEGACY DDL). Known-long
  reads ride `runWithStatementTimeout` (see the `db.ts` timeout ladder), and new indexes
  on big live tables go through `concurrent_indexes.ts`, never boot DDL.

- **The broadcast loop builds shared things once per pass, never per session.** A
  realm-wide viewer-independent readout builds and stringifies ONCE per pass via
  `realm_readout_memo.ts` and rides `maybeRaw(...)` (the dungeon-finder
  boards are the tenants); events stringify once per batch (`event_frame.ts`) and go out
  via `sendRaw`, never re-`send` per session; interest gathering scans each occupied
  grid cell once (`interest_candidates.ts`) and re-applies each viewer's exact radius.
  Refactors here prove byte-identity with pinned tests (`tests/bandwidth.test.ts`,
  `tests/snapshots.test.ts`); cadence gates use a `>=` dueness tracker, never
  `tickCount % N` (catch-up ticks stride past a modulo and stall the gate).

- **Never put an O(realm-collection) read on the per-tick self path.** The self path is
  `selfWireJson` (`game.ts`): every `maybe(...)` key there is rebuilt for every session on
  every broadcast pass, and the delta cache suppresses only the SEND, never the rebuild. A
  read whose cost scales with a collection that grows with realm age or activity (the
  World Market listing book, the Ravenpost mail book, the commission order board, any
  future shared board or ledger) is a defect on this path even when each call looks fast
  on a fresh world: such collections are near-empty in dev and in bot load tests, and
  grow for months in production. Three shipped incidents, same shape: the World Market
  browse read (gated by PR #3028), the commission order board read (the `corder` key,
  which shipped in the very release that fixed the market and was gated by PR #3113),
  and the mailbox read (the `mail` key, gated in that same PR #3113 on top of the
  per-recipient `MailIndex` of PR #3052). The settled recipe (the market gate is the
  exemplar; `corder` and `mail` copy its shape minus the query-identity arm, having no
  query): keep the viewer-independent work out of the per-viewer rebuild (memoized
  inside the sim per book revision, `sortedBookCache` in `src/sim/market.ts`; or, when
  the WHOLE value is viewer-identical, built and stringified once per pass via
  `realm_readout_memo.ts` and shipped with `maybeRaw(...)`, the `dfb` board), and
  rebuild the per-viewer remainder only behind a revision counter bumped at EVERY
  mutation site of the backing collection (`sim.marketBrowseRevFor`,
  `sim.commissionOrderBoardRev`, `sim.mailRevFor`; each verb pinned by a test), a
  per-session last-built revision plus query-identity check, a staleness backstop
  (`*_REFRESH_TICKS`), and a `>=` cadence gate (`MARKET_WIRE_HZ`,
  `CORDER_WIRE_HZ`, `MAIL_WIRE_HZ`) with a prompt re-arm on the viewer's own commands
  (`*_WIRE_PROMPT_CMDS`). Pinned by `tests/market_wire_cadence.test.ts`,
  `tests/commission_wire_cadence.test.ts`, and `tests/mail_wire_cadence.test.ts`: the
  decisive pin is a SPY on the expensive sim read proving it is not called while nothing
  changed. A new self key also joins a `SELF_WIRE_PHASES` bucket
  (`tests/self_wire_phase_breakdown.test.ts`) so the next Tick Profiler capture names it
  instead of folding it into the `bcastSelf` total, where the market and corder
  incidents each hid for a whole diagnosis round.

- **A "small read" claim needs a named bound.** A comment calling a per-tick snapshot
  read small must say WHAT bounds it: an O(1) per-player field (a scalar or fixed-shape
  record on the player meta: `copper`, `ddiff`, `mst`), a content table
  (`craftingIdentityFor` is bounded by the recipe catalog), a per-player cap (bags,
  buyback, cooldowns), a proximity gate (the mail key is built only at a raven pillar,
  the market key only at the Merchant), or the revision plus cadence gate above. A read
  bounded by an O(1) field or by content may stay per-tick; a
  read bounded by nothing was how the commission board shipped. No named bound, no
  per-tick key.

- **Recurring main-thread work is O(what changed), never O(the book), and so is any
  event-driven durability write.** The autosave
  (`flushPeriodicSaves`, `AUTOSAVE_SECONDS`), the account-wealth sweep
  (`account_wealth.ts`), the retention sweep, and any self-clocked loop run on the same
  thread as the 20 Hz tick, and for a long time outside its instrument: the autosave ran
  after `tickProfiler.commit`, so its cost sat outside every phase and outside `total`,
  visible only as `nodejs_eventloop_lag_max_seconds`. That is how issue #3561 (the whole
  mail book re-stringified every 30 s, ~250 ms per pass against the production 89 MB
  row) and the v0.40.1 hotfix pair (the escrow fold that JSON-parsed the same book in
  Node every 60 s, moved into Postgres by PR #3661 in `account_wealth_db.ts`; the
  custody parcel that rewrote the whole book per booking, now one overlay row via
  PR #3663 `mail_custody_overlay.ts`) stayed undiagnosed for weeks. PR #3576 closed
  the blind spot: the shared-blob writers (the market writer, which carries the market
  AND mail books, and the rift writer) bill their thunk's synchronous cost to the
  `saves` phase through the serial writers' `onWrite` observer (`serial_writer.ts`),
  and the gap BETWEEN callbacks is the `lateness` phase; both ride `woc_sim_tick_phase_seconds`
  (read `max`, never `p95`: a 30 s stall is two samples in a 60 s ring). `saves` counts
  ONLY those two writers: per-character blobs and DB round trips are not in it, and a
  job that reports into no phase shows up as `lateness` with nothing to attribute it
  to. Rules: a new realm collection never persists as one whole-book `world_state` blob
  rewritten on the autosave cadence (the market and rift blobs are the legacy shape,
  not the template; the mail book was the third until PR #3613 partitioned it per
  dirty recipient, which is what the fix looks like): write per-row, overlay, or
  dirty-bucket, so a quiet interval writes nothing; a recurring job's cost, or an
  event-driven durability write's, must not scale with total book size, only with what
  changed or with the bounded result it produces (aggregate inside Postgres when the
  input is a stored blob; a handler that awaits a whole-book save "so the grant is
  durable", the `persistMailBlob` per-parcel shape PR #3663 retired, is the same
  defect on a different clock); and a new recurring job bills its cost to
  a profiler phase in the same change (an observer into `saves` for a new shared-blob
  writer, a registered phase of its own otherwise), never silently.

- **Fresh-bot load tests cannot see this bug class.** Fresh characters carry empty
  books, boards, and inboxes, so a bot fleet proves interest-scan and movement cost,
  never grown-collection cost. Before calling a new snapshot read or recurring job cheap,
  bench it against a grown backing collection (seed 1,000+ rows; PR #3052 benched a
  prod-shaped 98k-letter book) and record the measured per-call cost at that size in the
  PR. When in doubt, capture the admin Tick Profiler (`tick_profiler.ts`, the
  `self.*` breakdown) before and after on a long-lived realm, not a fresh one, and read
  the `saves` and `lateness` maxima (plus `nodejs_eventloop_lag_max_seconds`) for
  anything that runs outside the tick body.

## Inbound WS flood defense (`msg_rate_limit.ts`, `msg_lanes.ts`, `list_read_guard.ts`)
Three pure metering modules (injected `nowSec`, no `Date.now`; unit-tested without a
server) verdict every inbound frame; `game.ts` is a thin consumer. The design record is
`docs/design/player-performance/packet-3-input-cadence.md`.
- **Order and placement are load-bearing.** The pre-parse gate (frame ceiling + byte
  budget, sized against the real client cadence model in `src/net/input_send_cadence.ts`)
  verdicts ABOVE `JSON.parse`, so a flooder buys token math, never parse CPU. The
  per-class lanes (movement / command / chat / name-screen, the last for the two
  commands that run the obscenity matcher on player text ahead of any sim gate) are
  post-parse at the dispatch switch, so one class can never starve another. Every verdict is allow-or-DROP, never queue or
  defer: deferred delivery shifts receive time and poisons the bot detector's timing
  strategies.
- **Detector placement contract:** movement drops before `observeInput` (a dropped frame
  reaches neither sim nor detector), command drops after `observeCommand`
  (observe-then-drop, the detector keeps seeing traffic shape). Keep these when touching
  the dispatch arms.
- **One shared abuse window.** Drops of every cause feed `tallyDrop` on the session's
  one window; sustained abuse kicks. Allowed frames never reset it: a counter that
  resets on any allow is dead code against interleaved refill (the retired
  consecutive-violations ladder was exactly that).
- **Every client-triggerable per-call DB read on this path must sit behind a meter** (a
  lane, a dedicated guard bucket, a ladder token, or a cached read). An ALLOWED
  under-ceiling frame books no drop, so an unmetered read is sustainable at the full
  frame ceiling and the abuse window can structurally never kick it. That is a defect,
  not a style choice; `list_read_guard.ts` exists because review found exactly this on
  the ignore/block readouts.
- **Closed vocabularies, pinned lockstep.** Drop causes are the fixed `WS_DROP_CAUSES`
  set on the game-signals seam (a new shed mechanism adds its cause there, never a
  per-player label). The kick literal (`MSG_RATE_KICK_REASON`) is byte-exact wire
  contract with the client matcher, and `tests/localization_fixes.test.ts` counts the
  `kickSession` sites passing it: a NEW kick arm must consciously join that pin, the
  matcher, and the frame pins together.

## Realms / auth / limits
- **One process = one realm.** Characters/friends/guilds/presence are scoped to
  `REALM`; every realm process shares one `DATABASE_URL`. Schema setup is
  serialized behind a `pg_advisory_xact_lock` (concurrent boots).
- Auth: scrypt + bearer token (`auth_tokens`, 64-hex). REST uses
  `Authorization: Bearer`; WS authenticates via the first message. Banned/suspended
  accounts blocked at both entry points (`moderationStatusForAccount`).
- Sign-in surfaces beyond password: Apple native sign-in (`apple_auth.ts`/`apple_auth_db.ts`),
  the native-app Discord login handoff (`native_discord_handoff.ts`), Electron desktop login
  codes (`desktop_login.ts`/`desktop_login_routes.ts`), and the companion OAuth grants
  (`oauth.ts`). Native apps must present a platform attestation (`native_attestation.ts`);
  the Electron `app://` desktop origins bypass Turnstile by Origin header alone, a deliberate,
  documented softening (see the `passesTurnstile` header in `turnstile.ts`).
- Rate limiting: `rateLimited(req)` on register/login + admin login. Behind a proxy
  set `TRUSTED_PROXY_IPS`; otherwise private/loopback sources are trusted to set XFF.

## Adding a typical command
1. Add the wire token to the shared `COMMAND_NAMES` table in `src/world_api.ts`
   (append-only; both `game.ts` and `online.ts` import it), then add the matching
   `case` in `dispatchMessage` (game.ts), validating every field, then call the
   `sim.*` method that owns the rule. A server-only case the client never sends (a
   `dev_*` cheat, an `enter_crypt`/`leave_crypt` legacy alias, the `social_refresh`
   push, the RL-only `targetNearest`) goes on the `DISPATCH_ONLY_COMMANDS` allowlist
   in `src/world_api.ts` instead, so the send-subset check stays green. 2. If it
   changes self-state the client reads, surface it via `selfWireJson` (use `maybe(...)`
   for heavy fields that ride only on change). 3. Mirror the wire shape in
   `src/net/online.ts`. 4. Add a Vitest. Command-schema lockstep is pinned by
   `tests/command_schema.test.ts` (W0b).

- **Delta-key registry.** The heavy self fields `selfWireJson` may omit are written
  with `maybe(...)`; the delta keys and their terse-key to IWorld-name mapping are
  pinned by `ALL_DELTA_KEYS` + `TERSE_TO_IWORLD` in `tests/snapshots.test.ts` (W0a),
  which owns the list and guards the `selfWireJson` (encode) to `applySnapshot`
  (decode) round-trip. A new heavy self field lands in `selfWireJson` (here) and
  `applySnapshot` (`online.ts`) in one commit, and is added to that registry. The
  static combat-rating / progression scalar cohort and the in-combat bit `cbt` are
  emitted by `server/self_scalar_wire.ts` (decoded by `src/net/combat_scalar_wire.ts`),
  the emitter-module form a new self scalar follows. A value
  already serialized once realm-wide (the dungeon-finder board on `dfb`, built
  and stringified a single time per broadcast pass by the realm-readout memo) rides
  via `maybeRaw(...)` instead of `maybe(...)`, so the per-session diff reuses the one
  memoized string rather than re-stringifying it for every viewer. The `dfb`
  key is asserted directly in the round-trip test rather than mapped in
  `TERSE_TO_IWORLD` (they merge back into one `cupInfo` on decode), the same way `tal`
  fans out to several members and is asserted directly.

- The PHYSICAL `game.ts` restructure (facet-ordered dispatch, per-facet command
  modules, a facet-aligned encoder) is workstream #4; until it lands, add new
  commands inline as above. Scope and ownership:
  `docs/refactor/world-api-to-server-runtime-handoff.md`.

## The REST request pipeline (`server/http/`)
Every REST surface (`/api`, `/oauth`, `/admin/api`, `/internal`) runs through the in-house
pipeline under `server/http/` (its own `CLAUDE.md` is the spine reference). `main.ts` is a
prefix ladder: `routeHttpRequest` sends each prefix to one of four flag-gated entries
(`apiEntry` / `adminApiEntry` / `oauthApiEntry` / `internalApiEntry`), each built by
`selectApiEntry`. Under `API_DISPATCH=new` (the default) a matched `RouteDef` from the registry
runs the middleware onion; an unmatched path (and HEAD) delegates to the retained legacy handler
for that prefix. `API_DISPATCH=legacy` is the one-flag rollback to the old ladder. A migrated
route is served by BOTH arms until the ladder-deletion follow-up; the dual-edit rule (with its
`known_deviations.ts` ledger), the flag model, and the `RouteDef`/envelope contract live in
`server/http/CLAUDE.md`.

## Adding an endpoint (REST)
0. **Scaffold it.** `npm run new:endpoint -- --domain <slug> --method <METHOD> --path </api/...>
   [--public]` (`scripts/new_endpoint.mjs`) emits the `RouteDef` stub in a domain module, a typed
   `Infer`-derived schema (`server/http/schema.ts` combinators), a paired error code appended to
   `error_codes.ts`, the English `apiError.*` catalog entry plus its `API_ERROR_KEYS` client
   mapping, and a `FakeDb`-based test. It auto-attaches a `requireOwned` loader on a `:id` route
   unless `--public`.

Then fill the handler in by rung (real reference commits, reference by hash + module):
1. **Public read:** commit c07d677af, `server/leaderboard.ts`. Shows a static `export const routes`
   array, a `configure<Domain>Runtime` injection (avoids an import cycle), lenient query decoders,
   and `meta.publicRead` on an intentional public `:param`.
2. **Authenticated:** commit 14275d39e, `server/auth_routes.ts`. The canonical "add one
   authenticated endpoint" example.
3. **Owner-gated `:id`:** commit 5bba9353e, `server/characters.ts`. Uses the `requireOwned` loader
   (`server/http/middleware/require_owned.ts`) with `meta.requireOwned`; denial is 404
   (anti-enumeration); order is the auth guard, then the per-action limiter, then `withBody`, then
   `requireOwned<X>`, then the handler.

Register the domain's `routes` in `server/http/registry.ts` (import + spread into `apiRoutes`); the
registry sorts most-specific-first and runs the BOLA-shadow guard at build time.

## Error localization: emit the CODE, never English
A REST handler raises an `HttpError` (`server/http/errors.ts`) carrying a stable `<domain>.<reason>`
code appended to `server/http/error_codes.ts`, NEVER English prose (the server stays
language-agnostic). The client localizes code-first: `userFacingApiError` (`src/ui/api_error_i18n.ts`)
maps a code verbatim to `apiError.<domain>.<reason>`, English source in
`src/ui/i18n.catalog/api_error.ts`; `tests/api_error_code_parity.test.ts` fails a server code with no
client key. Contributors add English only, same as the WS emits above. A new `apiError.*`
English leaf that is wordy (any word of 4+ letters, i.e. most real prose) also needs its five
non-Latin fills (`zh`, `zh_TW`, `ja`, `ko`, `ru`) in the same change, or M16
(`tests/i18n_completeness.test.ts`) reds; `npm run new:endpoint` prints this reminder for the
leaf it appends.

## Endpoint tests: FakeDb, not a pg-mock
Test a migrated endpoint through its `routes` + `configure<Domain>Runtime` + the
`tests/server/helpers/` barrel: `fakeCtx` builds a well-formed frozen `Ctx` with a `FakeRes`, and
`FakeCharactersDb`/`FakeLeaderboardDb`/`FakeReportsDb` are type-only fakes with zero runtime `pg`.
Exemplar: `tests/server/leaderboard.test.ts` (unit-tests the pure read functions with a `FakeDb`,
then drives handlers via `routes` + `configureLeaderboardRuntime` + `fakeCtx`). This REPLACES the old
`vi.mock('../server/db')` + `sql.includes()` idiom for NEW endpoint tests.

## i18n: player-facing text is English at the source
- Like the sim, `server/` is **language-agnostic** (no `t()`, no DOM). `game.ts` emits
  English literals in `type:'log'|'error'` events (and forwards the sim's `'loot'`
  events), via `sendChatNotice(session, text)`, and via `broadcastSystem(text)`. The
  client re-localizes at the boundary: most
  strings through `src/ui/server_i18n.ts` (`localizeServerText`: an `EXACT` map + ordered
  `RULES` + a `RESTART_MESSAGES` table), a few (chat-rate limit, etc.) through the
  `localizeErrorText` arm (`src/ui/error_text_i18n_core.ts`, delegated by the hud) or the
  hud's own `localizeSystemText` arm. Durations re-localize via
  `localizeServerDuration`, which maps `formatDuration` output (`"5 minutes"`, `"1 hour"`,
  ...) onto the `time.*` keys. **Add the matcher entry in the same change** as a new emit.
- The **S3 guard** (`tests/localization_fixes.test.ts`) scans `game.ts` emit literals
  (`type/text`, ternary `text:`, `sendChatNotice`). It is **blind** to variable-routed
  emits (`broadcastSystem(step.text)` for the `RESTART_COUNTDOWN_STEPS`, the
  `chatMuteMessage()` return) and to `?? 'literal'` fallbacks, so localize those
  deliberately and back them with a dedicated test.
- `server_i18n.ts`'s `DICT` carries **explicit per-dialect entries** (`es_ES`, `fr_CA`,
  `en_CA`) as first-class keys, resolved at runtime by `getLanguage()` with no
  base-collapse: a new key needs a value in every locale block (`en_CA` stays English).

## Never do this here
- Never resolve gameplay (damage, drops, gold, XP) on the server outside the `Sim`.
- Never widen WS `maxPayload` (16 KiB) or skip field validation: one socket must not be able to crash the loop or OOM the process.
- Never serve a viewer-identical read with a per-request `pool.query`, and never leave a
  moderation-visible cache without a bust wire (Hot paths above).
- Never add a table that grows per event or session without a retention registration or
  an explicit keep-forever comment at the DDL.
- Never serialize a realm-identical broadcast payload per session: build once per pass,
  reuse the bytes.
- Never put a read whose cost scales with a realm collection (the listing book, the mail
  book, the order board, any shared board or ledger) on the per-tick self path without the
  revision plus cadence gate, and never call a per-tick read small without naming its bound.
- Never add recurring main-thread work, or an event-driven durability write, whose cost
  scales with a whole book instead of what changed, and never persist a new realm
  collection as one whole-book `world_state` blob rewritten on the autosave cadence.
- Never call a new snapshot read or recurring job cheap on the evidence of a fresh world or
  a fresh-bot fleet alone: bench it against a grown collection and record the number.
