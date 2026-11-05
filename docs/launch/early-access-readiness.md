# Wyndlewood: Steam Early Access readiness

Audit date: 2026-11-04. Base: `feature/player-housing` at 64d84727.
Scope: a desktop-only (Windows PC) Steam Early Access launch.
Method: read-only audit of the integration branch plus the tips of every
crew branch on origin, the root and area `CLAUDE.md` files, `DEPLOY.md`,
`docs/desktop-release.md`, `docs/desktop-self-hosted-updates.md`, the legal
files, and current Steam policy pages (sources at the end).

Status key: DONE (works today), PARTIAL (exists but needs work or config),
MISSING (not built). Effort: S under 1 week, M 1 to 3 weeks, L over 3 weeks.
"Blocks" means it blocks the Early Access launch.

---

## Summary

**Overall: not ready, but the engine is.** The inherited server, anti-cheat,
moderation, admin, accessibility and live-ops stack is production grade and
mostly DONE. What blocks Early Access is not engineering depth. It is
ownership and identity: rights to the shipped art and audio, the legal
documents, the brand, and the Steam-specific plumbing (own origin, Steam
login, Steam payments policy). Wyndlewood content (Chapter One, the five
factions) is not in code on origin yet.

**Blockers, ranked (fix in this order):**

1. **Asset rights.** `CREDITS.md` marks 143 rows "No, permission required"
   (Levy Street rights reserved), including the WOC player characters for
   all nine classes, the CraftPix ability icons, item and deed icons, weapon
   and prop models. Nine rows of core SFX (melee, footsteps, every mob voice,
   quest and level-up chimes) are CC BY-NC with a commercial grant to World
   of ClaudeCraft only. A paid Steam game cannot ship these without written
   permission or replacement.
2. **AI asset provenance.** The new ambience beds on `feature/music` were
   generated on the ElevenLabs free tier; ElevenLabs says free-tier output
   has no commercial licence and upgrading later does not fix it. Every
   Tripo, OpenAI image and ElevenLabs asset the fork made needs a recorded
   paid-plan provenance, and Steam needs an AI content disclosure.
3. **Legal documents.** `PRIVACY_POLICY.md`, `TERMS_AND_CONDITIONS.md` and the
   public `/privacy` and `/terms` pages name Dream Home AI Limited (Levy
   Street), Ko-fi, Solana and the $WOC token. They must be rewritten for the
   owner's own entity. No EULA is accepted at first launch.
4. **Upstream tracking and payment links in the desktop build.**
   `index.html` loads Google Analytics `G-BR5Z7GT7C2` (upstream's property)
   on any non-localhost host, and the Electron CSP in
   `electron/shell_guards.cjs` allows it, so the desktop app would send
   player analytics to upstream without consent. The game HUD links to
   `ko-fi.com/worldofclaudecraft` (a non-Steam payment link fails Steam build
   review).
5. **Rebrand and own origin.** The desktop build still defaults to
   `worldofclaudecraft.com`, appId `com.worldofclaudecraft.desktop`, the
   `worldofclaudecraft://` deep link, the baked "World of ClaudeCraft"
   Discord presence id, and hundreds of player-visible "ClaudeCraft"
   strings. No Wyndlewood string exists on the integration branch.
6. **Crypto code still in the tree.** Crypto features are retired
   (`server/legacy_crypto_schema_db.ts`), and `feature/core-systems` switches
   membership and Claudium off. But `package.json` still depends on the
   Reown AppKit and Solana wallet packages and `THIRD_PARTY_NOTICES.md`
   still describes wallet linking. Steam bans blockchain games; remove, do
   not hide.
7. **Steam account flow.** Login with Steam does not exist (by design
   upstream: `server/steam/CLAUDE.md`, "link-not-login"). A Steam player must
   create a separate email or Discord account. The game plan's launch scope
   asks for Steam login. Either build Steam ticket login or disclose a
   third-party account on the store page.
8. **Production for Wyndlewood.** The only server is a DigitalOcean droplet
   on an `sslip.io` hostname with an unsigned, self-hosted updater. Needs a
   real domain, TLS, Steam depot builds with `WOC_STEAM_APP_ID`, off-box
   backups and alerting.
9. **Content.** Chapter One quests and the five factions are not on any
   origin branch (`feature/wyndlewood-story` does not exist on origin).
   Durability/repair and account-level housing (decided) are not pushed yet.
10. **Early Access wipe policy and tooling.** Steam requires disclosing
    planned wipes; there is no wipe tool.

**Not blockers but before launch:** a production boot guard against
`ALLOW_DEV_COMMANDS=1`, the real bot detector (the fork ships the no-op stub),
an appeal process, audio captions, minimum specs, store assets, and the
Steam content survey (age rating plus AI disclosure).

---

## Crew branches checked (tips on 2026-11-04)

| Branch | On origin | What it adds that this audit counts |
|---|---|---|
| feature/core-systems | yes | quest XP formula, membership and Claudium OFF switches, Apprentice Riding at 10, Chronomancy healer. Not yet: account housing, durability, life-skill path |
| feature/wyndlewood-story | **no** | (factions, Chapter One, quest board expected) |
| feature/addon-api | **no** | (addons, Workshop expected) |
| feature/painted-ui | yes | painted HUD theme, icon repaints |
| feature/stylized-chars | yes | stylized kit, dev flag `?stylizedchars=1` only, built on the WOC rig |
| feature/town-kit | yes | Eastbrook town kit |
| feature/world-expansion | yes | Southern Reaches row |
| feature/env-detail | yes | painted rocks, water, grass |
| feature/creatures | yes | painted wolf and boar |
| feature/props-furniture | yes | Wyndlewood kit props and furniture |
| feature/weapons | **no** | |
| feature/ambience | yes | region ambience beds |
| feature/music | yes | soundtrack plan, ElevenLabs pipeline, ambience (free tier) |
| docs/wyndlewood-game-design | yes | game plan, roadmap, faction ladder |
| feature/discord-admin | yes | Wyndlewood Discord server tool and posts |

---

## 1. Steam

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Steamworks app, depots, package | MISSING | `docs/desktop-release.md` "What the maintainer must provision": partner account, app id, depot ids are owner tasks | S | yes | owner |
| Steam build target | DONE | `npm run electron:build:steam`, refuses without numeric `WOC_STEAM_APP_ID`; in-app updater off on this channel | S | no | new steam-platform crew |
| Windows depot only | PARTIAL | runbook defines win, mac, linux depots; PC-only needs just the `win-unpacked` depot | S | no | steam-platform |
| Steam login (ticket auth) | MISSING | `server/steam/CLAUDE.md`: "LOGIN WITH STEAM DOES NOT EXIST"; only link ticket in `electron/steam.cjs` | M | yes, or disclose 3rd-party account | steam-platform |
| Account link + achievements | DONE | `server/steam/` mirror of Book of Deeds via `achievement_map.ts` (cap 100); env `STEAM_ENABLED=1` | S (config) | no | steam-platform |
| Achievements authored in partner site | MISSING | ACH names must match `server/steam/achievement_map.ts`; icons needed | S | no | steam-platform |
| Overlay | PARTIAL | not hooked (runbook: "nothing calls an overlay enable"); needed only for Steam purchase dialogs | M | only if a shop ships | steam-platform |
| Self-hosted updater vs depots | DONE | Steam channel has no feed; `docs/desktop-self-hosted-updates.md` covers the website channel only | S | no | steam-platform |
| DRM-free | DONE | runbook: do not apply the Valve DRM wrapper | S | no | none |
| Steam Cloud | DONE (N/A) | saves are server side; cloud unused by design | S | no | none |
| Steam Playtest app | MISSING | no config; a free Playtest is the cheap stress test before EA | S | no | owner |
| Store page, capsules, trailer, EA Q&A | MISSING | no store assets in repo; Steam requires gameplay screenshots, a trailer and every EA question answered | M | yes | discord-admin crew + owner |
| Code signing | MISSING | owner build is unsigned (updater doc, "Unsigned installs"); Steam does not require it but SmartScreen and AV do flag | S | no | steam-platform |

## 2. Account and onboarding

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Email and Discord login | DONE | `server/auth_routes.ts`, `server/desktop_login.ts` deep-link handoff | S | no | none |
| Password reset, 2FA | DONE | `server/email/events.ts` (`password_reset`, `two_factor_*`), `server/totp.ts` | S | no | none |
| Email delivery | PARTIAL | `server/email/sender.ts` falls back to console without SES or HTTP env; needs a sender domain | S | yes | live-ops crew |
| Email verification at signup | PARTIAL | `accounts.email_verified_at` exists; verify mail only on email change | S | no | live-ops |
| Bot gate on signup | PARTIAL | `server/turnstile.ts` admits desktop origins without Turnstile (documented softening) | S | no | live-ops |
| Character creation and appearance | PARTIAL | `src/ui/appearance_customizer.ts` on WOC bodies (rights reserved, see area 7); stylized bodies, faces, hair only behind a dev flag on `feature/stylized-chars` | L | yes | stylized-chars |
| Name rules | PARTIAL | `server/auth.ts` built-in banlist is one term; real list comes from `USERNAME_BANLIST_FILE` | S | no | live-ops |
| Tutorial / new player | PARTIAL | Proving Shore start, `src/ui/bootcamp.ts`, hub lessons exist; Wyndlewood Chapter One opening is not in code | M | yes | wyndlewood-story |
| EULA at first launch | MISSING | no terms acceptance on register (only Marketplace terms); Steam can show a custom EULA at first launch | S | yes | legal crew |

## 3. Live operations

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Production deployment | PARTIAL | `DEPLOY.md` (AWS, Docker compose, Caddy); fork runs a droplet on `sslip.io` | M | yes | live-ops |
| Domain, TLS, API origin | MISSING | desktop defaults to `worldofclaudecraft.com`; `VITE_DESKTOP_API_ORIGIN` must be the Wyndlewood host | S | yes | live-ops |
| Realms and capacity | DONE | one process per realm (`REALM_NAME`), `MAX_PLAYERS_PER_REALM` default 5000 in `server/http/config.ts`; realm count is an owner decision | S | no | owner |
| Backups and restore | PARTIAL | nightly `pg_dump`, 14 days, on the same box; off-box sync "occasionally" | S | yes | live-ops |
| Monitoring | PARTIAL | `/metrics` behind `METRICS_TOKEN`, `/livez` `/readyz`, `deploy/game_watchdog.sh` | S | no | live-ops |
| Alerting | MISSING | no alert rules or pager shipped | S | yes | live-ops |
| Logs | DONE | `server/http/access_log.ts`, `server/http/redact.ts`; desktop `main.log` | S | no | none |
| Restart broadcast | DONE | `POST /internal/restart-countdown`, `server/realm_motd.ts` MOTD | S | no | none |
| Maintenance mode (login gate) | MISSING | no maintenance flag found; only countdown then stop | S | no | live-ops |
| Client/server version check | PARTIAL | per-feature wire negotiation (`server/ws_auth.ts`, `server/movement_wire_version.ts`), no minimum-client refusal; Steam keeps clients current | S | no | live-ops |
| Hotfix and rollback | DONE | `DEPLOY.md` update steps and per-feature rollback caveats; Steam rollback is re-promoting an older build | S | no | none |
| Early Access wipe tooling | MISSING | no wipe tool; Steam requires disclosing wipes | M | yes | live-ops |
| Server-first deploy order | DONE | `DEPLOY.md` "Client/server deploy order" | S | no | none |

## 4. Crash, bugs, telemetry

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Crash dumps | PARTIAL | Crashpad local; upload only if `WOC_CRASH_SUBMIT_URL` set at build (`docs/desktop-release.md`) | S | no | live-ops |
| Renderer error ingest | DONE | `server/http/client_error.ts` | S | no | none |
| In-game bug report | DONE | `src/ui/bug_report.ts`, `server/bug_report_db.ts`, admin `BugReports` page | S | no | none |
| Perf reports | DONE | `server/perf_report.ts`, `server/client_perf_reports_db.ts` | S | no | none |
| Telemetry consent | MISSING | no consent flow; desktop loads upstream GA tag `G-BR5Z7GT7C2` (`index.html`, allowed in `electron/shell_guards.cjs`); Meta CAPI code in `server/meta_capi.ts`, `src/game/meta_pixel.ts` | S | yes | legal crew |
| Feedback channel | PARTIAL | Discord server tool on `feature/discord-admin`; Steam forums once live | S | no | discord-admin |

## 5. Anti-cheat and abuse

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Server authority | DONE | `server/CLAUDE.md` "Trust nothing from the client": intent plus commands only | S | no | none |
| Movement speed and teleport | DONE | client sends intent, the server sim moves; no client position to fake | S | no | none |
| WS flood limits | DONE | `server/msg_rate_limit.ts`, `server/msg_lanes.ts`, `MAX_WS_PER_IP_HARD` | S | no | none |
| Chat, REST rate limits | DONE | `server/chat_rate_limit.ts`, `server/general_chat_quota.ts`, `server/ratelimit.ts` | S | no | none |
| Dupe protection | DONE | bank same-blob atomicity, `server/item_ledger.ts`, `server/bank_ledger.ts`, `scripts/bank_audit.mjs` | S | no | none |
| Bot detection | PARTIAL | fork ships `server/bot_detector/stub.ts` (no-op); private detector not available; `server/suspicion_flags.ts` and admin `SuspiciousPlayers` remain | M | no | live-ops |
| Gold sellers / RMT | PARTIAL | chat filter, IP associations, shared IPs, item tracking pages; no dedicated spam heuristics | M | no | live-ops |
| Bans | DONE | `server/moderation_service.ts`, `server/ip_block.ts`, `server/account_sanctions_runtime.ts` | S | no | none |
| Appeals | MISSING | no appeal flow; a support email process is enough for EA | S | no | owner |

## 6. Moderation and GM tools

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Player reports | DONE | `server/reports.ts`, admin `Moderation` pages | S | no | none |
| Mutes, bans, chat filter | DONE | `server/moderation_commands.ts`, admin `ChatFilter` (live word lists) | S | no | none |
| Admin dashboard | DONE | `src/admin/` (Svelte): accounts, characters, guilds, online, tick perf, flags, staff | S | no | none |
| Stuck character tool | DONE | `server/unstuck_db.ts`, admin `UnstuckReports` | S | no | none |
| Item restoration | PARTIAL | admin `ItemTracking` and ledgers trace items; no one-click restore | M | no | live-ops |
| Audit logs | DONE | `server/admin_db.ts` moderation history, `server/content_moderation_db.ts` | S | no | none |
| GM commands | DONE | `server/gm_tools_host.ts` | S | no | none |
| `ALLOW_DEV_COMMANDS` off in prod | PARTIAL | env gate only (`server/game.ts`); compose default off; no boot refusal on a production realm | S | no | live-ops |
| `PROVISION_TEST_ACCOUNTS` off | PARTIAL | `DEPLOY.md` "Community test profile"; must be 0 on the EA realm | S | no | live-ops |

## 7. Legal and privacy

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Code licence (MIT) | DONE | `LICENSE` allows commercial use; keep the Levy Street notice in shipped builds | S | no | legal crew |
| Rights-reserved upstream assets | MISSING | `CREDITS.md`: 143 rows "No, permission required" (WOC player bodies, CraftPix icons, item, deed, weapon, prop, mount art) | L | yes | legal crew + painted-ui, stylized-chars, props-furniture, weapons |
| CC BY-NC upstream audio | MISSING | `CREDITS.md` @jamiecypher rows: melee, footsteps, mob voices, quest and level-up sounds; commercial grant is WoC only | M | yes | ambience crew |
| "With the project only" assets | PARTIAL | 209 rows may ship in a fork; confirm in writing with Levy Street that a paid fork is covered | S | yes | owner |
| Unlisted assets | PARTIAL | `CREDITS.md`: unlisted means unrecorded, not free; audit every shipped file | M | yes | legal crew |
| Fork AI asset provenance | PARTIAL | Tripo paid-plan noted upstream; `feature/music` ambience made on ElevenLabs free tier (no commercial rights, not cured by upgrading) | M | yes | music, ambience |
| Brand marks | PARTIAL | Steam, Discord marks fine with guidelines; drop Solana, USDC, Ko-fi marks | S | no | legal crew |
| Privacy policy | MISSING | `PRIVACY_POLICY.md` is Levy Street's, mentions Solana, Ko-fi, $WOC | M | yes | legal crew |
| Terms / EULA | MISSING | `TERMS_AND_CONDITIONS.md` and the marketplace draft are Levy Street's; delete the $WOC sections | M | yes | legal crew |
| `THIRD_PARTY_NOTICES.md` | PARTIAL | describes Reown wallet deps; regenerate from the real Steam build deps | S | no | legal crew |
| GDPR/CCPA export and delete | DONE | `server/account_export_state.ts`, `data_export` and `account_deleted` mail, `public/data-deletion.html` | S | no | none |
| Age rating | MISSING | Steam content survey generates regional ratings; not filed | S | yes | owner |
| AI content disclosure | MISSING | Steam survey: describe pre-generated AI content; keep `RIFT_UPGRADER_URL` and `RIFT_RUNTIME_ASSETS` off or disclose live AI with guardrails | S | yes | owner |
| COPPA / under 13 | PARTIAL | terms say 13+, no age gate; Steam accounts are 13+ | S | no | legal crew |
| Trademark "Wyndlewood" | PARTIAL | web search found no game or mark with this exact name; nearest marks are Wyrmwood (gaming accessories) and place names Wyldwood/Wyldewood. Needs a formal USPTO/EUIPO search, classes 9, 28, 41 | S | no | owner |

## 8. Monetization and store

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| EA price model | MISSING | owner decision (game plan: buy-to-play, cosmetics, expansions) | S | yes | owner |
| Membership off | DONE (branch) | `feature/core-systems` `MEMBERSHIP_ENABLED` default off, `tests/early_access_flags.test.ts` | S | no | core-systems |
| Claudium store off | DONE (branch) | `CLAUDIUM_ENABLED` off, store behind a dynamic import | S | no | core-systems |
| Crypto removed | PARTIAL | features retired, but `@reown/*`, `@solana/*`, `@wallet-standard/*` still in `package.json` | S | yes | core-systems |
| Stripe checkout reachable | PARTIAL | `src/net/stripe_checkout.ts`, `server/claudium_proxy.ts`; Steam build review fails on non-Steam-Wallet purchases | S | yes | core-systems |
| Donate links | MISSING (removal) | Ko-fi links in `index.html` HUD and footer | S | yes | painted-ui |
| Cosmetic shop on Steam | MISSING | no Steam MicroTxn integration; ship EA without a shop, or build it | L | no | steam-platform |
| Refunds and gifting | DONE (Steam) | base game refunds and gifts are handled by Steam | S | no | none |
| Referral and ad pixels | PARTIAL | `server/referral_*`, `server/ua_capi.ts`; decide keep or strip | S | no | core-systems |

## 9. Settings and accessibility

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Keybind remapping | DONE | `src/game/keybinds.ts`, conflict prompt in `src/ui/keybind_conflict_prompt_core.ts` | S | no | none |
| UI scale | DONE | `src/ui/ui_scale.ts` | S | no | none |
| Colourblind mode | PARTIAL | `colorblindMode` in `src/game/settings.ts` covers raid floor hazards only | M | no | painted-ui |
| Reduced motion, high contrast | DONE | `reduceMotion`, `highContrastText` settings | S | no | none |
| Captions for audio cues | MISSING | no caption or visual-sound setting | M | no | ambience |
| Controller support | DONE | `src/game/gamepad*.ts`, cross hotbar | S | no | none |
| Graphics presets | DONE | `src/game/ui_effects_profile.ts`, fairness rules in root `CLAUDE.md` | S | no | none |
| Min and recommended specs | MISSING | no spec doc; measure on the painted world | S | yes (store page) | env-detail |

## 10. Localization

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| English | DONE | `src/ui/i18n.catalog/` | S | no | none |
| 20 other locales | PARTIAL | `src/ui/i18n.resolved.generated/pending.ts`: 245 pending keys in Latin locales, 143 in ja, ko, ru, zh_CN, zh_TW (housing, furniture, new casts) | M | no | i18n fill pass |
| Wyndlewood rename in all locales | MISSING | brand and new content strings not authored yet | M | no | each crew |
| EA language list | MISSING | decide which locales the store page claims; claim only filled ones | S | no | owner |

## 11. Social and community

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Guilds, friends, mail, trade | DONE | `server/guild_*`, `server/account_friends_db.ts`, `server/mail_db.ts` | S | no | none |
| Chat channels and filter | DONE | `server/chat_filter.ts`, `filterProfanity` setting | S | no | none |
| Discord bot | PARTIAL | `bot/` targets the WoC guild; needs own app id, guild, env (`DEPLOY.md` "Discord bot") | S | no | discord-admin |
| Discord server | PARTIAL | `feature/discord-admin`: `scripts/discord/server_admin.mjs`, rules, roadmap, patch notes | S | no | discord-admin |
| Rich presence | PARTIAL | `DEFAULT_DISCORD_APP_ID` shows "World of ClaudeCraft"; set `WOC_DISCORD_APP_ID` to a Wyndlewood app | S | yes (brand) | discord-admin |
| In-game announcements | DONE | `server/realm_motd.ts`, restart countdown | S | no | none |

## 12. Performance and stability

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Perf budgets | DONE | `docs/perf/baseline/`, `docs/design/player-performance/` | S | no | none |
| Server tick under load | DONE | `server/tick_profiler.ts`, admin `TickPerf`, `scripts/load_players.mjs`, `scripts/load_probe.mjs` | S | no | none |
| Client FPS benches | DONE | `scripts/crowd_fps_bench.mjs`, `scripts/client_perf_under_load.mjs` | S | no | none |
| Painted-world re-baseline | MISSING | new painted terrain, water, town kit, creatures not re-benched on low-end PCs | M | yes (specs) | env-detail, town-kit |
| Long-session memory | PARTIAL | no soak run recorded for the fork; run a multi-hour session before EA | S | no | env-detail |
| Load times | PARTIAL | shader prewarm and disk cache exist (`electron/shader_disk_cache.cjs`); re-measure with new assets | S | no | env-detail |

## 13. Content for Early Access

| Item | Status | Evidence | Effort | Blocks | Owner |
|---|---|---|---|---|---|
| Level 1 to 20 path | PARTIAL | upstream zones and quests to 20; quest XP retune on `feature/core-systems` | M | no | core-systems |
| Chapter One quests | MISSING | 28 quests plus 12 dailies are a file outside code; no origin branch | L | yes | wyndlewood-story |
| Five factions and boards | MISSING | three placeholder factions (`src/sim/content/faction_rewards.ts`) | M | yes | wyndlewood-story |
| Dungeons and raids | DONE | 5 dungeons plus heroics, 2 raids (game plan Appendix A) | S | no | none |
| Crafting, gathering, farming | DONE | professions ring, market, commissions | S | no | none |
| Housing | PARTIAL | phases 1 to 3 in `src/sim/housing/`; account-level house decided, not pushed | L | no | core-systems |
| Durability and repair | MISSING | not in `src/sim`; decided, assigned to core-systems | M | no | core-systems |
| Endgame at 20 | DONE | heroics, raids, delves, rifts, world bosses, vault | S | no | none |
| Wyndlewood look (UI, chars, world) | PARTIAL | painted-ui, stylized-chars (dev flag), town-kit, env-detail, creatures in flight | L | yes (chars) | art crews |

---

## Recommended order of work

1. **Owner calls first** (below). Nothing else unblocks without them.
2. **Legal crew (new):** asset provenance audit against `CREDITS.md`; a
   replacement list per crew; rewrite privacy policy, terms and EULA; strip
   the analytics tags or add consent.
3. **core-systems:** remove the wallet packages and Stripe paths from the
   Steam build; ship durability and account housing.
4. **steam-platform crew (new):** own API origin and rebrand of the shell
   (appId, product name, deep link, presence id), Steam ticket login, Windows
   depot pipeline, Playtest app.
5. **Art and audio crews:** replace every rights-reserved and CC BY-NC asset
   that ships (characters and SFX first, they are everywhere); regenerate
   the free-tier ambience on a paid ElevenLabs plan.
6. **wyndlewood-story:** push Chapter One and the five factions.
7. **live-ops crew (new):** domain and TLS, off-box backups, alerting,
   maintenance flag, wipe tool, dev-command boot guard, email sender.
8. **Store and community:** specs from a fresh benchmark, store page and EA
   Q&A, content survey (age rating, AI disclosure), Discord wiring.
9. Steam Playtest weekend as the load and wipe rehearsal, then EA.

## Owner decisions needed

1. **Levy Street permission or full replacement** of rights-reserved and
   CC BY-NC assets; and written confirmation that "With the project only"
   assets may ship in a paid fork.
2. **Legal entity** that publishes Wyndlewood (named in the terms, privacy
   policy and Steamworks).
3. **Steam login or separate account** (store page must disclose a
   third-party account if no Steam login).
4. **Price and shop:** EA price, and whether any cosmetic shop exists at EA
   (if yes, Steam MicroTxn plus overlay work).
5. **Wipe policy:** wipe at 1.0 or not, stated on the store page.
6. **Realms:** one realm or several, and the capacity target.
7. **Languages** the store page lists.
8. **Analytics:** keep GA and Meta (with consent and your own ids) or drop.
9. **Trademark filing** for Wyndlewood after a formal search.

## Sources

- Steam Early Access rules: https://partner.steamgames.com/doc/store/earlyaccess
- Steam review process (Steam Wallet rule for in-game transactions): https://partner.steamgames.com/doc/store/review_process
- Steam content survey (AI disclosure, ratings): https://partner.steamgames.com/doc/gettingstarted/contentsurvey
- Steam blockchain policy coverage: https://www.pcgamer.com/steam-bans-nfts-cryptocurrencies-blockchain
- ElevenLabs free vs paid commercial rights: https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform/llms.txt
- Steam microtransactions: https://partner.steamgames.com/doc/features/microtransactions
