# Wire protocol for a non-JS client (engine-neutral; Unreal notes)

Status: planning spec, written against `feature/player-housing` (merge `64d84727`). No Unreal
client code exists yet. This file states what any non-JS client (the planned Unreal Engine 5.8
client) must speak to play online against the
unchanged TypeScript server, and where every rule lives in the source. It follows the anchor
rule (`docs/qa-gate.md`): it cites paths, exported symbols and pinned tests, never line numbers.

Authority: when this document and the code disagree, the code wins. The lockstep pins that
own the protocol are `tests/snapshots.test.ts` (`ALL_DELTA_KEYS`, `TERSE_TO_IWORLD`, the W0a
round trip), `tests/command_schema.test.ts` (W0b), `tests/command_facets.test.ts` (W6),
`tests/bandwidth.test.ts` (lite versus full records) and `tests/input_cadence_model.test.ts`.

## 0. The big picture

```
Unreal client                                  server (Node, unchanged)
 REST  POST /api/login | /api/auth/steam  --->  server/auth_routes.ts, server/steam_login.ts
       GET  /api/characters               --->  server/characters.ts
 WS    wss://<realm>/ws                    --->  server/ws_auth.ts createWsAuth
       {t:"auth-world-48", ...}  (first)  --->  handshake, lease, game.join
       <--- {t:"hello"}                         server/game.ts
       {t:"input"} 20 Hz + {t:"cmd"} ...  --->  GameServer.dispatchMessage
       <--- {t:"snap"} ~20 Hz, {t:"events"}, {t:"social"}, ...
```

Everything is JSON text over one WebSocket. There is no binary framing. The server is
authoritative for every outcome (`server/CLAUDE.md`, "Trust nothing from the client").

### Coordinates and units

- World units are yards. The sim is Y-up with the ground plane on `x`/`z` (`src/sim/types.ts`).
- Facing `f` is radians. Forward is `(sin f, cos f)` on `(x, z)` and right is `(-cos f, sin f)`
  (`stepPlayerMotion` in `src/sim/player_motion.ts`), which is a right-handed frame.
- Unreal is left-handed, Z-up, in centimetres, with actor forward on `+X` and right on `+Y`.
  Use exactly one conversion everywhere: `ue = (z, -x, y) * 91.44` (1 yd = 91.44 cm) and
  `ueYawDegrees = -f * 180 / PI`. With that mapping sim forward becomes Unreal `+X`, sim right
  becomes `+Y` and sim up becomes `+Z`. Put it in one C++ function library (`FSimSpace`) and
  unit-test it against recorded server frames; never convert ad hoc. Positions stay `double`
  (UE 5 Large World Coordinates) so no precision is lost on the way in.
- The sim tick is fixed at 20 Hz (`DT = 1 / TICK_RATE`, `src/sim/types.ts`).

## 1. REST authentication

All REST calls go to the realm origin chosen from the realm directory and carry
`Authorization: Bearer <token>` once signed in (`Api.post` / `Api.get` in `src/net/online.ts`).
Bodies are JSON. Errors are `{ error, code }`; a client localizes `code` first
(`userFacingApiError`, `src/ui/api_error_i18n.ts`; codes in `server/http/error_codes.ts`).

### 1.1 Origin and anti-bot gates (a native client must handle these)

- `POST /api/login` and `POST /api/register` run `webLoginGuard`, `ipRateLimitGuard` and
  `turnstileGuard` (`server/auth_routes.ts`). In production `webLoginEnforced()` is on
  (`server/web_login_guard.ts`), and `isWebClientRequest` requires an `Origin` header in the
  allow list.
- The Electron shell passes both gates by sending `Origin: app://worldofclaudecraft`
  (`DESKTOP_APP_ORIGINS` in `server/web_login_guard.ts`); `passesTurnstile` then returns true for
  a desktop origin without a Turnstile token (`isDesktopAppRequest` in `server/turnstile.ts`).
- An Unreal client is a native desktop program, so it must send that same header on REST calls
  (the `HTTP` module's `IHttpRequest::SetHeader` allows it). This is the documented softening described in `server/CLAUDE.md`
  ("Realms / auth / limits"). OWNER DECISION: either accept that the Unreal client reuses the
  desktop origin, or add a dedicated `app://wyndlewood-unreal` entry to `DESKTOP_APP_ORIGINS`
  (a one-line server change plus its test) so the server can tell the clients apart.
- The WebSocket upgrade has no Origin check (`attachUpgrade` in `server/ws_auth.ts` only checks
  the path `WS_UPGRADE_PATH`).

### 1.2 Password login with the 2FA step

`POST /api/login` body: `{ username, password, turnstileToken, code, recoveryCode,
nativeAttestation }` (`Api.login`). Handler: `loginHandler` in `server/auth_routes.ts`.

| Server answer | Meaning | Client action |
|---|---|---|
| `200 { token, username, emailMissing }` | signed in | keep `token` (64 hex chars, `auth_tokens`) |
| `200 { twoFactorRequired: true }` (no `token`) | account has TOTP on, no code sent | show the code step, re-POST the same body plus `code` (6 digits) or `recoveryCode` |
| `401 { code: 'two_factor.code_invalid', twoFactorRequired: true }` | wrong code | stay on the code step |
| `401 { code: 'auth.invalid_credentials' }` | bad user or password | |
| `429 { code: 'auth.too_many_failed_attempts' \| 'auth.too_many_attempts' }` | throttled | back off |
| `403` moderation body (`moderationErrorBody`) | locked, banned or suspended | show the localized reason |
| `403 { code: 'auth.web_login_only' }` | missing allowed Origin | a client bug (see 1.1) |

`emailMissing: true` means the client must force the recovery-email prompt
(`POST /api/account/email/initial` family in `server/account.ts`).

### 1.3 Steam ticket login

On `feature/player-housing` Steam is LINK-ONLY: `server/steam/CLAUDE.md` says "LOGIN WITH
STEAM DOES NOT EXIST" there, and only `POST /api/steam/link`, `DELETE /api/steam/link` and
`GET /api/steam/status` exist (`server/steam/routes.ts`). Steam login is implemented on the
unmerged branch `feature/steam-platform`. Spec from that branch, which a native client should
target once it merges:

- Capability advert: `GET /api/status` returns `steam: { enabled, login }`; the client only
  offers the button when both are true (`steamLoginAdvertised` in
  `src/net/steam_login_client.ts`, feature/steam-platform).
- Ticket: obtained from Steamworks `GetAuthTicketForWebApi` bound to the identity string
  `wyndlewood-login` (`LOGIN_TICKET_IDENTITY` in `server/steam/ticket.ts` and
  `electron/steam.cjs`, feature/steam-platform). The link ticket uses the separate identity
  `wocc-link` (`TICKET_IDENTITY`); the two are never interchangeable.
- Request: `POST /api/auth/steam` with `{ ticket, personaName, code?, recoveryCode? }`
  (`steamLogin` in `src/net/steam_login_client.ts`).
- Answers: `{ token, username, emailMissing, created }` on success; `{ twoFactorRequired:
  true }` with no token when the account has TOTP. Login tickets are single use per process
  (`createTicketReplayGuard`), so the 2FA retry MUST request a FRESH ticket and resend it with
  the code. The client never names its own Steam id; the server reads it from the verified
  ticket.
- Unreal side: the engine's Steam online subsystem plugin wraps Steamworks, and a thin C++
  call to `SteamUser()->GetAuthTicketForWebApi("wyndlewood-login")` produces the ticket. The
  ticket bytes are hex-encoded before posting (`isTicketShape` in `server/steam/ticket.ts`).

### 1.4 Other sign-in surfaces (port later, not in the slice)

Discord OAuth handoff, Apple, and the desktop login code pair (`POST /api/desktop-login/create`
and `POST /api/desktop-login/exchange`, `server/desktop_login_routes.ts`) exist. The desktop code
pair is the cheapest way to let the Unreal client reuse a browser-side Discord login: the
browser mints a code, the Unreal client exchanges it for `{ token, username }`.

### 1.5 Realms and characters

- `GET /api/realms` (realm directory, `Api.realms`) and `GET /api/status` on a realm
  (`players_online`, `players_cap`, capability adverts; `Api.realmStatus`).
- `GET /api/characters` lists the roster; `POST /api/characters` creates one;
  `/api/characters/:id/takeover` is the explicit "played elsewhere" path; all in
  `server/characters.ts` `routes`. Roster sorting and the Enter World decision are pure cores
  worth mirroring: `src/net/char_sort.ts`, `src/net/charselect_action.ts`.

## 2. WebSocket connect and auth

- URL: `<realm origin with http replaced by ws>/ws` (`ClientWorld.openSocket`,
  `buildWebSocketUrl` in `src/net/world_auth_message.ts`).
- Compression: the server negotiates permessage-deflate with context takeover
  (`server/ws_compression.ts`, about 9x to 12x smaller snapshots). A client that does not offer
  it still works, uncompressed. See section 9 for the client library choice.
- Inbound cap: one client frame may be at most 16 KiB, inflated (`WS_MAX_PAYLOAD_BYTES`,
  `server/main.ts`; "Never widen WS maxPayload" in `server/CLAUDE.md`).
- First frame, within `AUTH_TIMEOUT_MS` (10 s, `server/ws_auth.ts`), built exactly like
  `buildWebSocketAuthMessage` (`src/net/world_auth_message.ts`):

```json
{ "t": "auth-world-48", "token": "<64 hex>", "character": 123, "clientSeed": "",
  "dungeonEntryFacingWire": 1, "timerWire": 3, "petSpecialWire": 1, "movementWire": 2 }
```

| Field | Source of truth | Rule |
|---|---|---|
| `t` | `ONLINE_WORLD_AUTH_TYPE` = `auth-world-${ONLINE_WORLD_LAYOUT_VERSION}` (`src/world_api.ts`, currently 48) | exact match or the server refuses with `ONLINE_WORLD_INCOMPATIBLE_MESSAGE`. The client build must stamp the epoch from the TS source at build time (section 10), never hard-code it. |
| `timerWire` | `STABLE_TIMER_WIRE_VERSION` (3) | opts into the stable timer wire (`exp` deadlines, `tw` head, auras delta-elided) |
| `petSpecialWire` | `PET_SPECIAL_WIRE_VERSION` (1) | echoed as `psw` in snapshots |
| `dungeonEntryFacingWire` | `DUNGEON_ENTRY_FACING_WIRE_VERSION` (1) | enables the `de` self key |
| `movementWire` | `2` | `negotiateMovementWireVersion` (`server/movement_wire_version.ts`); anything else falls back to v1 |
| `clientVersion` | feature/steam-platform only | `server/client_version_gate.ts`: refused below `MIN_CLIENT_VERSION` with `client update required` |

Each capability is negotiated by exact equality and silently downgrades when absent, so the
client must send every one (comment in `buildWebSocketAuthMessage`).

Refusals are always an `{ t: 'error', error: '<literal>' }` frame before close
(`WS_AUTH_ERROR` in `server/ws_auth.ts`): `bad auth message`, `authentication required`,
`not authenticated`, `no such character`, `character already in world`, `realm is full`,
`too many connections from your network`, `membership required for this character`,
`authentication timed out`, the force-rename line, and the incompatible-layout line. These
literals are wire contract; match them byte-for-byte (`src/ui/api_error_i18n.ts` holds the
current matcher).

## 3. Server to client frames

The live list is the `msg.t` branches in `ClientWorld.onMessage` (`src/net/online.ts`) plus
the request replies routed by `WorldInteractionRequests` (`src/net/world_interaction_requests.ts`).

| `t` | Payload | Client duty |
|---|---|---|
| `hello` | `pid, seed, name, cls, realm, admin, softWords, chatMutedUntil, movementWire` (`GameServer` join, `server/game.ts`) | set own entity id, world seed, movement wire version; on a reconnect reset input acking and rebuild the mirror from empty (see 7) |
| `snap` | section 4 | apply the snapshot |
| `events` | `{ list: SimEvent[] }` | section 5 |
| `error` | `{ error }` | session-fatal unless `reconnect_policy.ts` classifies it transient (section 7) |
| `social` | friends, guild, ignore and block rosters (`socialInfoFromFrame`, `src/net/social_frame_wire.ts`) | replace the social mirror |
| `socialpos` | `{ list }` friend and guild positions | merge into the roster (`applySocialPositions`) |
| `who` | the Who roster (`whoRosterFromFrame`, `src/net/who_frame_wire.ts`) | answer to the `who` command |
| `censor` | `{ words }` soft profanity list | replace the local mask list |
| `spectate` | `{ name? }` | moderator spectate swap (can be deferred) |
| `account_bank` | `{ info }` | account bank answer (`account_bank_wire.ts`) |
| `gbanklog` | guild bank history page (`guild_bank_log_wire.ts`) | |
| `referralCards` | `{ snapshot }` (`referral_cards_wire.ts`) | |
| `commandOutcome` | `{ rid, ok }` | resolves a command sent with a request id (`WorldInteractionRequests.command`) |
| `corpseHarvestInfo` | `{ id, rid, info }` | answer to `inspectCorpseHarvest` |
| `challenge` | `{ nonce, challenge }` | answered with `challengeResponse` (WIP in `online.ts`) |

Keepalive: the server sends protocol-level WebSocket pings every `WS_KEEPALIVE_PING_MS` (30 s,
`server/keepalive_sweep.ts`); the client library must answer with pongs automatically.

## 4. Snapshots

### 4.1 Cadence and head

The loop runs on a 50 ms interval and calls `broadcastSnapshots` once per callback
(`server/game.ts`), so snapshots arrive at about 20 Hz. The frame is assembled as raw JSON:

```
{"t":"snap","tick":N,"time":T[,"tickHz":H][transport head][,"tw":3][,"psw":1],
 "self":{...},"ents":[...][,ground telegraphs][,"keep":[ids]][,nearby quest traces]}
```

- `tick` is `sim.tickCount`, `time` is `sim.time` (seconds, 2 decimals).
- `tickHz` rides about twice a second (`TICK_HZ_HEAD_INTERVAL_S`); hold the last value.
- The transport head (`transportHeadJson`), ground telegraphs (`groundTelegraphWireJson`) and
  dungeon gates are decoded by `applySnapshotHeadSyncs` (`src/net/snapshot_head_syncs.ts`).
- `tw` present means the stable timer wire is active for this snapshot (`prepareSnapshotTimers`
  in `online.ts`, `snapshotTimerWireMode` in `src/net/snapshot_timer_wire.ts`); an unknown
  value must be ignored without disturbing the last good schedule.

### 4.2 Entity records: full versus lite (`ents`)

Encoder: `wireEntity(e) = { id, ...identityFields(e), ...dynamicFields(e) }`
(`server/game.ts`; `identityFields` in `server/entity_identity_wire.ts`). Per viewer the
broadcast keeps `session.sentEnts` (`SentEntityVersions`: `idVer`, `dynVer`, `auraVer`,
`sentAtTick`, `settled`) and chooses, per entity in interest:

- first sight, or identity changed: a FULL record (identity plus dynamic fields);
- due and changed (or owing its one "settle" record): a LITE record (dynamic only);
- otherwise its id goes in `keep`.

Note: the task brief names `DELTA_SELF_KEYS` and `ENTITY_IDENTITY_KEYS`. Those symbols do not
exist in this codebase. The real anchors are: the identity set is whatever `identityFields`
emits, detected on decode by `hasIdentity = w.k !== undefined` (`applyWire` inside
`ClientWorld.applySnapshot`); the self delta set is `ALL_DELTA_KEYS` in
`tests/snapshots.test.ts`.

Identity fields (only in full records; absence in a lite record means unchanged):

| Key | Meaning | Key | Meaning |
|---|---|---|---|
| `k` | kind (`player`, `mob`, `npc`, `pet`, `object`...) | `tid` | template id (class id for players, `MOBS`/`NPCS` key otherwise) |
| `nm` | name | `lv` | level |
| `cat` | `'mech'` skin catalog | `sk` | skin index |
| `mnt` | active mount key | `mntTier` | riding tier (players) |
| `bud`, `budal` | buddy key, buddy autoloot | `mh`, `oh` | mainhand and offhand item ids (held weapon models) |
| `wsk`, `msk` | weapon skin, mount skin | `eq` | worn item ids by slot (players, sparse) |
| `eqi`, `eqh` | worn instance payloads and history (`equipped_instances_wire.ts`) | `app` | authored modular appearance (spliced in from `EntityWireCache.appJson`; run through `normalizeAppearance` before use) |
| `dt, dav, dnm, dj, dr` | Discord flair | `dvt, dvc, dgl` | developer flair |
| `crk` (+ nested pair) | Curator rank | `sc`, `c` | scale, tint colour |
| `dgn`, `gds` | dungeon id, dungeon guide state | `rt`, `vr` | rift tier, vault rarity |
| `obj` | ground object item id | player identity | guild, pledge, title, border, spec: `decodePlayerIdentityWire` (`src/net/player_identity_wire.ts`) |

A lite record for an id the client has never met is skipped (the server always sends
identity first). For NPCs the client fills quest and vendor lists from `NPCS[tid]` in
`src/sim/data.ts`, so a native client needs the content export (section 10).

Dynamic fields (every record; `dynamicFields` in `server/game.ts`). Omit-when-default: an
absent key decodes to its default, never "unchanged":

| Key | Meaning | Default |
|---|---|---|
| `x, y, z, f` | position (2 decimals) and facing | always present |
| `hp, mhp` | health, max health | always present |
| `dead, gh, loot, h` | dead, ghost, lootable, hostile | false |
| `rtype, res, mres` | resource type and values (only for entities that have one) | keep blank |
| `cast, castRem, castTot, castTgt, chan` | cast bar | no cast |
| `swing` | auto-attack swing timer | not attacking |
| `mcr, mck` | mount summon cast remaining and key | idle |
| `sit, sld, cl, lp` | sitting, ice slide, ledge climb progress 1 to 99, leap | false |
| `fry` | ferry deck spot (`transport_head.ts`) | none |
| `ws, hh` | weapon stowed, helm hidden | false |
| `aggro, ft, ftm, tgt, tap` | aggro target, forced target and timer, selected target, tapped by | null |
| `hcb, ffa, cd, own` | harvest claim, loot gone free-for-all, corpse decayed, owner id | null or false |
| `emo, emoSeq` | overhead emote | none |
| `pm, pt, pa, pw, ps, px` | pet mode and pet timers (when `own` is set) | defensive, 0 |
| `rp` | ranged power | 0 |
| `pasc` | paladin Ascension charge count | 0 |
| `thr` | `[[targetId, threat], ...]` top 8 (mobs) | empty |
| `auras` | `WireAura[]` (`wireAura` in `server/snapshot_timer_wire.ts`): `id, name, kind, rem or exp, dur, perm, value, value2, value3, tickInterval, school, stacks, charges, emp, src, ub, und`, flask marker | see 4.4 |
| `lootList` | `{ copper, items }` when lootable | null |
| `mcd` | spent enemy major cooldowns (`peer_major_cooldown_wire.ts`) | |
| status bits | `/afk`, `/pvp`, bounty (`writeEntityStatusWire`, `entity_status_wire.ts`) | |
| world boss | `writeWorldBossWireFields` | |

### 4.3 `keep` and pruning

`keep` lists ids that are alive but unchanged or not due at their distance tier. After
applying `ents`, `keep` and `self`, the client removes every mirrored entity that appeared in
none of them (`wireSeen` in `applySnapshot`). `despawn_grace.ts` holds a short grace for
presentation.

### 4.4 The self record

`self` is always a full record of the viewer's own entity (`selfWireJson` in
`server/game.ts`): `wireEntity(self)` plus always-present self scalars plus delta keys.

- Always present (extended): `res, mres, rtype` (precise), `gcd, pcd, fcd`, `swing, swingOff`,
  `combo`, `pdev` (paladin devotion), `target, auto, queued`, `eat, drk` (eat and drink
  remaining), `ccast` (channel cast), `opUntil, opRem`, `ack` (highest input `seq` folded,
  `foldInputAck` in `src/net/input_ack.ts`), plus the scalar cohort emitted by
  `server/self_scalar_wire.ts` (decoded by `src/net/combat_scalar_wire.ts`).
- Movement reconciliation (wire v2, `applyReconSelfWire` in
  `src/net/movement_reconciliation_wire.ts`): `rpx, rpy, rpz, rpf` (acked authoritative pose),
  `ackCt` (highest client tick consumed), `ovE` (override epoch), `ovA` (override active),
  `msm` (move speed multiplier), `rdk` (deck-relative pose on a ship).
- Delta keys: the server OMITS each one while unchanged for this session (`maybe(...)`,
  `maybeRaw(...)`, `maybeSerialized(...)`). The client MUST keep its prior value when a key is
  absent; defaulting it to empty wipes local state (`src/net/CLAUDE.md`, "Delta invariant").
  The complete set is `ALL_DELTA_KEYS`:

`aborder acct achg achr adiff ahs ap app arena atitle auras bags bank bg blk bpsl budOwn
budPend buyback bval cardDuel cbt cds cluh copper corder corpse cosmetics courier courierData
courierLegTicks courierStores courierTravelTicks cprof crat crit cvault dclears dcomp
dcompanion ddiff de deeds delveDaily denc df dfb dgrun dmarks dodge drun dstats duel einst ench
equip fac facCur fplot ftr gcon ggoal gprof gtool guildBank hbl hill hirat hmarks honor hpf
hpref hpw hrat hse hst inv lance lguide lhonor lockouts lrest lroll lrollg lxp mail mailU
market marks mbr milestones mktU mloot mntLesson mntOwn mntRace mntRtd mst ncd offhandWeapon
party prk prof ptime pvr pvrw qdone qlog reliq renown rxp salv scb season sh skb sp stats tal
tfocus tfpend tmap tot trade tslot udiff vault vehicle wba weapon weeklyRewards wkexp wkq wpvp
wqday wqexp wqlog wqrep wqrr xp`

  `TERSE_TO_IWORLD` in the same test maps each terse key to its `IWorld` member (for example
  `inv` to `inventory`, `qlog` to `questLog`, `cds` to `cooldowns`, `hse` to `myHouse`, `hst` to
  `houseStorage`), and the `IWorld` facet files under `src/world_api/` give each member's type.
  Capability-gated: `auras` elides only on the stable timer wire, `de` exists only with
  `dungeonEntryFacingWire` (`CAPABILITY_DELTA_KEYS`). `app` and `de` may be absent on a fresh
  session (`DENSE_DELTA_KEYS`).
- Timers on the stable wire: `cds`, `ncd`, aura `exp` are absolute deadlines on the snapshot
  `time` clock (`stableCooldownRemaining`, `stableDeadlineRemaining`); on the legacy wire they
  are remaining seconds.
- Field-family decoders already exist as small pure TS modules and are the porting checklist:
  every `*_wire.ts` file under `src/net/` (for example `housing_self_wire.ts`,
  `house_storage_wire.ts`, `crafting_wire.ts`, `material_inventory_wire.ts`,
  `quest_snapshot_wire.ts`, `bank_snapshot_wire.ts`, `vault_snapshot_wire.ts`). The large
  vault stream is chunked (layout epoch 47, `src/vault_transfer_protocol.ts`).

## 5. Per-player events

`{ t: 'events', list: SimEvent[] }`, serialized once per batch (`server/event_frame.ts`) and
scoped per receiver (`server/event_delivery.ts`: combat events reach the two sides and their
parties; bystanders in range get a numberless `attackCue` instead, `server/attack_cue.ts`).
The type is the `SimEvent` union in `src/sim/types.ts`, discriminated by `type`, with an
optional `pid`. It has more than two hundred variants; the ones the slice needs are `damage`,
`heal`, `heal2`, `absorb`, `death`, `respawn`, `aura`, `castStart`, `castStop`, `spellfx`,
`spellfxAt`, `attackCue`, `chat`, `log`, `error`, `levelup`, `xp`, `loot`, `questAccepted`,
`questProgress`, `questDone`. `ClientWorld` also folds a few into mirrors before queueing
them (`applyLockpickEvent`, `applyCraftResultEvent`, `applyRiftStateEvent` and siblings in
`onMessage`).

Server text inside events (`type: 'log' | 'error'`, chat notices) is English re-localized on
the client by `localizeServerText` (`src/ui/server_i18n.ts`). A native client needs the same
matcher (section 10).

## 6. Client to server frames

### 6.1 Movement intent (`input`), movement wire v2

The client runs a fixed 20 Hz input tick and sends one frame per tick
(`docs/design/movement-reconciliation.md`; sender `sendMovementFrameV2` in
`src/net/movement_frame_v2_wire.ts`, driven by `src/render/self_prediction.ts` through
`src/game/input_tick_sampler.ts`):

```json
{ "t": "input", "seq": 812, "ct": 640,
  "mi": { "f": 1, "b": 0, "tl": 0, "tr": 0, "sl": 0, "sr": 0, "j": 0, "dv": 0, "sf": 0,
          "ss": 0.5, "gp": -0.2 },
  "facing": 1.5708 }
```

- `seq`: monotonic per transport, reset to 0 on the post-reconnect `hello`; echoed back as
  `self.ack`. `ct`: the client tick index, monotonic from join; echoed back as `self.ackCt`.
- `mi`: forward, back, turn left, turn right, strafe left, strafe right, jump, dive, surface
  (0 or 1). `ss` (swim steer) only when not 1, `gp` (glider pitch) only when set
  (`encodeAnalogMoveInput`).
- `facing`: radians, present while the client drives the heading (mouselook and keyboard
  turns, `src/game/keyboard_turn_facing.ts`). The heading is client-authoritative input, not a
  prediction (`src/net/CLAUDE.md`, "The heading is NOT predicted").
- `de`: the dungeon-entry fence sequence, only after a `de` self key (`dungeon_entry_facing.ts`).
- Backpressure: frames queue in `MovementFrameV2Outbox` (cap `MOVEMENT_FRAME_V2_PENDING_CAP` =
  8, drop oldest) while `bufferedAmount` is high (`send_backpressure.ts`), flushed by a 50 ms
  timer.
- Server side: a per-session jitter buffer consumes exactly one frame per sim tick, with
  starvation extrapolation and adaptive playout depth (the design doc above).
- Inbound limits: `MSG_RATE_REFILL_PER_SECOND` 120 frames per second, `MSG_RATE_BURST` 180,
  `MSG_BYTE_REFILL_PER_SECOND` 64 KiB, per-class lanes, kick literal `message rate exceeded`
  (`server/msg_rate_limit.ts`, `server/msg_lanes.ts`). One input frame per tick plus commands
  is far below this.

Legacy v1 (`sendInput` in `online.ts`, constants in `src/net/input_send_cadence.ts`) is a held
boolean state sent on a 50 ms timer plus a 16 ms gated changed-only flush. A native client
should implement v2 only and treat a v1 `hello` as incompatible.

### 6.2 Commands (`cmd`)

`{ "t": "cmd", "cmd": "<token>", ...fields }` (`ClientWorld.rawCmd`). The vocabulary is
`COMMAND_NAMES` in `src/world_api.ts`, APPEND-ONLY: the wire string is the protocol. Tokens on
`DISPATCH_ONLY_COMMANDS` are server-only (dev cheats, RL helpers, legacy aliases) and a client
never sends them. Every field is re-validated in `GameServer.dispatchMessage`
(`server/game.ts`); invalid input is dropped, not answered.

Request-correlated commands add `rid` (positive integer) and get `{ t: 'commandOutcome', rid,
ok }` (`WorldInteractionRequests`). The `target` command carries the input `seq` so the
optimistic target holds until a snapshot `ack` covers it (`src/net/target_echo.ts`).

Logout: `{ "t": "logout" }` skips the five-minute linkdead grace (`sendLogout`).

The full command table, grouped by `IWorld` facet, is in the appendix. It is generated from
the `this.cmd({ cmd: ... })` call sites under `src/net/` and the `COMMAND_FACETS` table, so it
lists exactly what today's client sends. For field TYPES read the matching `IWorld` facet
member (`src/world_api/<domain>.ts`) and the `case` in `dispatchMessage`.

## 7. Interest scoping

- Players and pets enter at `INTEREST_RADIUS` (90 yd, `PLAYER_INTEREST_RADIUS` in
  `src/sim/types.ts`) and drop at `INTEREST_DROP_RADIUS` (100 yd). NPCs use
  `NPC_INTEREST_RADIUS` 120 and `NPC_DROP_RADIUS` 130. The viewer's current target stays in
  until `NPC_DROP_RADIUS`. Battleground teammates use `BG_MATCH_INTEREST_RADIUS` 300 and
  `BG_MATCH_DROP_RADIUS` 320. World bosses widen by `landmarkRange`. All in
  `server/interest_policy.ts`; the three agreeing cutoffs are documented in
  `server/interest_scope.ts`.
- Update rate by distance (`isUpdateDue`, `server/entity_update_cadence.ts`): every snapshot
  inside 55 yd, every second snapshot to 80 yd, every fourth beyond. The viewer's target and
  anything attacking the viewer always update at full rate. So a native client must
  interpolate each entity on its OWN measured cadence (`reanchorDecision` in
  `src/net/entity_reanchor.ts`, `netInterval`) and must not assume 50 ms everywhere.
- Fog of interest is a server duty: enemies past the radius are never shipped, so a client can
  never reveal more than it is sent.

## 8. Reconnect and resume

- Backoff: `computeBackoffDelay` (`src/net/backoff.ts`) with `RECONNECT_BASE_DELAY_MS` 1000,
  `RECONNECT_MAX_DELAY_MS` 15000, `RECONNECT_MAX_ATTEMPTS` 40, full jitter 0.5x to 1.5x
  (`src/net/reconnect_policy.ts`). Keep the jitter; it stops a realm-wide reconnect stampede.
- Transient error frames (keep retrying, bounded): `character already in world`
  (`RECONNECT_CONFLICT_ERROR`, `MAX_CONFLICT_REJECTIONS` 8) and `authentication timed out`
  (`RECONNECT_TIMEOUT_ERROR`, `MAX_TIMEOUT_REJECTIONS` 20). They apply to the first join too.
  Every other error frame is fatal, including `realm is full`.
- The server holds a dropped character in world for `LINKDEAD_GRACE_MS` (5 minutes,
  `server/linkdead.ts` `planJoin`); a re-auth inside the grace resumes the session.
- On the post-reconnect `hello`: reset `seq` and `ct` acking, clear the entity mirror, null
  every delta-omitted mirror that could be stale (the list is in the `hello` branch of
  `onMessage`: `marketInfo`, `harvestPreference`, `gatheringGoal`, quest world state, vault),
  then re-push session preferences (`resendSessionPreferences`).

## 9. What the current client runs locally, and what Unreal must replicate

`ClientWorld` is presentation only, but it is not thin. It imports more than a hundred
modules from `src/sim/` (`grep "from '../sim/" src/net/*.ts`), in four groups:

| Group | Examples | Why the client needs it | Unreal options |
|---|---|---|---|
| A. Content tables | `src/sim/data.ts` (`NPCS`, `MOBS`, items, abilities), `src/sim/content/*` | names, icons, vendor and quest lists, tooltips, model keys | export to JSON at build time (section 10); no porting |
| B. Pure display rules | `abilitiesKnownAt`, `computeQuestState`, `resolveAbilityChain`, `applyAbilityCostTail`, talent resolution, item tooltip math | the HUD shows the same numbers the sim uses | port the slice's few to C++; long term embed the TS (below) |
| C. Movement kernel | `stepPlayerMotion` (`src/sim/player_motion.ts`), `resolveMovement` and `moverHeight` (`src/sim/colliders.ts`), `terrainHeight` (`src/sim/world.ts`), ladders, slopes, decks, rift floors | local-player prediction must be bit-exact with the server (`tests/player_motion.test.ts`, `tests/movement_latency_baseline.test.ts`) | see below |
| D. Wire decoders | every `src/net/*_wire.ts` | turn terse JSON into typed state | port to C++ alongside generated `USTRUCT` DTOs |

The movement kernel is the hard part. The v2 predictor (`src/render/self_prediction.ts`,
`self_prediction_core.ts`) replays the exact input frames through the shared kernel and
reconciles exact-match against `rpx/rpy/rpz/rpf` at `ackCt`. Exactness depends on identical
IEEE double arithmetic AND identical collision data (terrain heights, every collider, decks,
rift regions). Three options:

1. **No local prediction (slice default).** Draw the self entity interpolated from snapshots,
   like `?nopredict` (`src/render/self_render_position_core.ts`). Input latency becomes one
   round trip. Acceptable for the visual slice, NOT acceptable for launch.
2. **Embed the TS kernel in Unreal** with a V8 runtime (PuerTS, BSD-3, which supports Unreal as
   well as Unity, V8 backend, Windows and Linux; see `cost-and-risk.md`). The same JS doubles as Node, so the kernel and its collider
   data run unchanged; the bundle is produced by esbuild from `src/sim/player_motion.ts` and
   its imports. Cost: a V8 dependency, a per-tick interop call, and keeping the world
   collision data in JS memory.
3. **Port the kernel to C++** with `double` math. Exactness is plausible (`double` is IEEE 754 and
   `std::sin`/`std::cos` are the platform libm, but MSVC floating-point flags such as `/fp:fast`
   must be off for that module) but NOT guaranteed bit-identical to V8
   for transcendental functions, and every future sim change to movement must be ported in the
   same change. Highest long-term risk.

Recommendation: decide by spike in the slice (milestone M5 in `vertical-slice-plan.md`): run
the recorded-input replay from `tests/movement_latency_baseline.test.ts` through option 2 and
measure exact-match rate and per-tick cost. Prefer option 2 if it holds; it also hosts group B
for free and keeps "one sim, three hosts" honest.

Network library: the server benefits from permessage-deflate with context takeover
(`server/ws_compression.ts`). Unreal ships a `WebSockets` module (`FWebSocketsModule`, built on
libwebsockets on desktop). Whether its client negotiates permessage-deflate with context
takeover must be verified in milestone M2 of `vertical-slice-plan.md` by inspecting the
handshake against a local server; if it does not, either enable the libwebsockets extension in
a small engine-module patch or accept uncompressed frames and measure the bandwidth with
`tests/bandwidth.test.ts` style frames (about 9x to 12x more downstream per the
`server/ws_compression.ts` measurements).

## 10. Keeping a C++ client in lockstep (generated, never hand-copied)

A second client in another language doubles the lockstep surface the TS pins protect. The
plan: generate, then pin.

- A Node exporter in this repo (proposed `scripts/unreal/export_protocol.mjs`) emits, from the
  TS source of truth: `ONLINE_WORLD_LAYOUT_VERSION` and every capability version,
  `COMMAND_NAMES` and `DISPATCH_ONLY_COMMANDS`, `ALL_DELTA_KEYS` and `TERSE_TO_IWORLD`, the
  reconnect literals, and JSON Schemas for `SimEvent`, `WireAura` and the self record built
  from the TS types (for example with `typescript-json-schema`).
- C++ `USTRUCT` DTOs and JSON readers are generated from those schemas by a small generator in
  the Unreal project repo (FJsonObjectConverter maps `UPROPERTY` names to the terse keys).
- A Vitest in this repo (proposed `tests/unreal_protocol_export.test.ts`) fails when the export
  is stale, the same freshness pattern `tests/guide.test.ts` uses for the wiki.
- Golden frames: record real `hello`/`snap`/`events` frames from a local server session and
  replay them through both the TS `ClientWorld.applySnapshot` and the C++ decoder, comparing the
  resulting mirrored state. This is the C++ twin of the W0a round trip.
- Content export (proposed `scripts/unreal/export_content.mjs`): `src/sim/data.ts` tables and the
  resolved English i18n catalog (`src/ui/i18n.resolved.generated/en.ts`, plus locales) as JSON.

## Appendix: command table (generated from `src/net/` call sites and `COMMAND_FACETS`)

"Untagged" commands are deliberately row-less in `COMMAND_FACETS` (the professions family;
see `FACET_PROFESSIONS` in `tests/world_api_parity.test.ts`). A key shown as `...name` is a
spread of a payload built by a helper in the named module. `dev_*` rows are dispatch-only and
must never be sent by a release client.

| Facet (`COMMAND_FACETS`) | Wire token (`cmd`) | Payload keys sent by `ClientWorld` | Sender module |
|---|---|---|---|
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `abandon` | `quest` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `accept` | `quest`, `selection` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `accept_commission_order` | `order` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `apply_enchant` | `confirm`, `enchant`, `item`, `slot` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `autoloot` | `id` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `buy` | `...quote`, `bulk`, `count`, `item`, `npc` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `buyback` | `craftedRecipeId`, `index`, `instance`, `item` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `cancel_commission_order` | `order` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `challengeResponse` | `n`, `r`, `sig` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `change_mount_skin` | `skin` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `chat` | `text` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `clear_gathering_goal` | (none) | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `craft_item` | `commission`, `count`, `recipe` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `crucible_buy` | `itemId` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `deliver_commission_order` | `order` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `discard` | `...anchorFields`, `count`, `item`, `slot` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `disenchant_item` | `item`, `slot` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `emote` | `emote` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `equip` | `bagSlot`, `item`, `slot` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `equip_bag` | `...bagSocketPayload` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `extract_essence` | `item`, `slot` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `guild_buy_cosmetic` | `offer` | `src/net/guild_hall_wire_state.ts`, `src/net/quest_world_wire_state.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `harvestCorpse` | `id` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `harvest_node` | `confirmUse`, `node` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `inspectCorpseHarvest` | `exactly`, `id`, `never`, `not`, `rid`, `socket`, `which` | `src/net/online.ts`, `src/net/world_interaction_requests.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `interact` | (none) | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `inv_move` | `from`, `to` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `loot` | `id` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `open_commission_order` | `crafter`, `recipe`, `scope` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `perfect_item` | `...perfectingCommand` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `pickup` | `id` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `place_mobile_station` | `craft` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `qlinkaccept` | `from`, `quest` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `recharge_tool_effect` | `profession` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `salvage_item` | `item`, `slot` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `sell` | `...anchorFields`, `count`, `item`, `slot` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `sell_all_junk` | (none) | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `set_harvest_preference` | `raw` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `set_town_focus` | `allocation`, `tier` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `slot_tool_effect` | `effect`, `mode`, `profession` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `track_gathering_commission` | `order` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `track_gathering_recipe` | `count`, `recipe` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `train_recipe` | `recipe` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `turnin` | `choice`, `quest` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `unbind_item` | `item` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `unequip_bag` | `socket` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `unequip_gather_tool` | `profession` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `unequip_item` | `slot` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `use` | `inkMap`, `item`, `slot` | `src/net/online.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `world_quest_weekly_choose` | `quest` | `src/net/quest_world_wire_state.ts` |
| (untagged: see FACET_PROFESSIONS and the row-less W6 design) | `world_quest_weekly_commend` | `faction` | `src/net/quest_world_wire_state.ts` |
| IWorldActionBar | `save_hotbar_layout` | `layout`, `profile` | `src/net/action_bar_upload.ts` |
| IWorldBank | `account_bank_list` | (none) | `src/net/online.ts` |
| IWorldBank | `account_bank_select` | `characterId` | `src/net/online.ts` |
| IWorldBank | `account_bank_transfer` | `...accountBankTransferPayload` | `src/net/online.ts` |
| IWorldBank | `bank_buy_slots` | (none) | `src/net/online.ts` |
| IWorldBank | `bank_deposit` | `...materialStorageTransferPayload` | `src/net/online.ts` |
| IWorldBank | `bank_socket_bag` | `...bagSocketPayload` | `src/net/online.ts` |
| IWorldBank | `bank_unlock_socket` | (none) | `src/net/online.ts` |
| IWorldBank | `bank_unsocket_bag` | `socket` | `src/net/online.ts` |
| IWorldBank | `bank_withdraw` | `...materialStorageTransferPayload` | `src/net/online.ts` |
| IWorldBank | `courier_dispatch` | `...request` | `src/net/online.ts` |
| IWorldBank | `vault_buy_upgrade` | (none) | `src/net/online.ts` |
| IWorldBank | `vault_deposit` | `...materialStorageTransferPayload` | `src/net/online.ts` |
| IWorldBank | `vault_deposit_all` | (none) | `src/net/online.ts` |
| IWorldBank | `vault_withdraw` | `...vaultWithdrawPayload` | `src/net/online.ts` |
| IWorldBank | `weekly_loot_spec` | `spec` | `src/net/online.ts` |
| IWorldBank | `weekly_reward_claim` | `choice`, `token` | `src/net/weekly_rewards_wire.ts` |
| IWorldBank | `weekly_reward_open` | `choice`, `token` | `src/net/weekly_rewards_wire.ts` |
| IWorldBattleground | `bg_flag` | (none) | `src/net/online.ts` |
| IWorldBattleground | `bg_leave` | (none) | `src/net/online.ts` |
| IWorldBattleground | `bg_queue` | (none) | `src/net/online.ts` |
| IWorldBattleground | `bg_respond` | `accept` | `src/net/online.ts` |
| IWorldBuddies | `buddy_autoloot` | `on` | `src/net/online.ts` |
| IWorldBuddies | `buddy_rename` | `id`, `name` | `src/net/online.ts` |
| IWorldBuddies | `buddy_summon` | `key` | `src/net/online.ts` |
| IWorldBuddies | `buddy_toggle` | (none) | `src/net/online.ts` |
| IWorldCardMinigame | `card_forfeit` | (none) | `src/net/online.ts` |
| IWorldCardMinigame | `card_queue_join` | (none) | `src/net/online.ts` |
| IWorldCardMinigame | `card_queue_leave` | (none) | `src/net/online.ts` |
| IWorldCardMinigame | `play_card` | `value` | `src/net/online.ts` |
| IWorldCombat | `attack` | (none) | `src/net/online.ts` |
| IWorldCombat | `cancel_aura` | `aura` | `src/net/online.ts` |
| IWorldCombat | `cast` | `ability`, `target` | `src/net/online.ts` |
| IWorldCombat | `castAt` | `ability`, `x`, `z` | `src/net/online.ts` |
| IWorldCombat | `castSlot` | `slot` | `src/net/online.ts` |
| IWorldCombat | `pvp_resurrect` | (none) | `src/net/online.ts` |
| IWorldCombat | `release` | (none) | `src/net/online.ts` |
| IWorldCombat | `releaseEmpowered` | `ability` | `src/net/online.ts` |
| IWorldCombat | `resurrect_corpse` | (none) | `src/net/online.ts` |
| IWorldCombat | `resurrect_healer` | (none) | `src/net/online.ts` |
| IWorldCombat | `resurrect_respond` | `accept` | `src/net/online.ts` |
| IWorldCombat | `stopattack` | (none) | `src/net/online.ts` |
| IWorldCombat | `unstuck` | (none) | `src/net/online.ts` |
| IWorldCosmetics | `change_skin` | `catalog`, `skin` | `src/net/online.ts` |
| IWorldCosmetics | `change_weapon_skin` | `skin`, `wtype` | `src/net/online.ts` |
| IWorldCosmetics | `claim_event_skin` | `skin` | `src/net/online.ts` |
| IWorldCosmetics | `set_helm` | `hidden` | `src/net/online.ts` |
| IWorldCosmetics | `stow_weapon` | (none) | `src/net/online.ts` |
| IWorldCosmetics | `unequip_mech_chroma` | `chroma` | `src/net/online.ts` |
| IWorldDeeds | `deed_set_border` | `deedId` | `src/net/online.ts` |
| IWorldDeeds | `deed_set_title` | `deedId` | `src/net/online.ts` |
| IWorldDelves | `collect_delve_chest_loot` | `objectId` | `src/net/online.ts` |
| IWorldDelves | `companion_upgrade` | `companionId` | `src/net/online.ts` |
| IWorldDelves | `delve_buy` | `delveId`, `itemId` | `src/net/online.ts` |
| IWorldDelves | `delve_interact` | `objectId` | `src/net/online.ts` |
| IWorldDelves | `delve_rite_choose` | `intensity` | `src/net/online.ts` |
| IWorldDelves | `enter_delve` | `delveId`, `tierId` | `src/net/online.ts` |
| IWorldDelves | `leave_delve` | (none) | `src/net/online.ts` |
| IWorldDelves | `lockpick_abort` | `sid` | `src/net/online.ts` |
| IWorldDelves | `lockpick_action` | `action`, `sid` | `src/net/online.ts` |
| IWorldDelves | `lockpick_engage` | `ante`, `objectId` | `src/net/online.ts` |
| IWorldDuelArena | `arena_augment` | `augment` | `src/net/online.ts` |
| IWorldDuelArena | `arena_leave` | (none) | `src/net/online.ts` |
| IWorldDuelArena | `arena_queue` | `format` | `src/net/online.ts` |
| IWorldDuelArena | `duel_accept` | (none) | `src/net/online.ts` |
| IWorldDuelArena | `duel_decline` | (none) | `src/net/online.ts` |
| IWorldDuelArena | `duel_req` | `id` | `src/net/online.ts` |
| IWorldDungeonFinder | `df_app_respond` | `accept`, `applicant` | `src/net/online.ts` |
| IWorldDungeonFinder | `df_apply` | `listing` | `src/net/online.ts` |
| IWorldDungeonFinder | `df_apply_cancel` | (none) | `src/net/online.ts` |
| IWorldDungeonFinder | `df_expedition_apply` | `listing`, `role` | `src/net/online.ts` |
| IWorldDungeonFinder | `df_expedition_configure` | `settings` | `src/net/online.ts` |
| IWorldDungeonFinder | `df_expedition_open` | (none) | `src/net/online.ts` |
| IWorldDungeonFinder | `df_expedition_travel` | (none) | `src/net/online.ts` |
| IWorldDungeonFinder | `df_list_close` | (none) | `src/net/online.ts` |
| IWorldDungeonFinder | `df_list_create` | `activity`, `tags` | `src/net/online.ts` |
| IWorldDungeonFinder | `df_proposal` | `accept` | `src/net/online.ts` |
| IWorldDungeonFinder | `df_queue` | `activities` | `src/net/online.ts` |
| IWorldDungeonFinder | `df_queue_leave` | (none) | `src/net/online.ts` |
| IWorldDungeonFinder | `df_roles` | `roles` | `src/net/online.ts` |
| IWorldDungeons | `dungeon_guide_answer` | `accept`, `npcId` | `src/net/online.ts` |
| IWorldDungeons | `enter_dungeon` | `dungeon` | `src/net/online.ts` |
| IWorldDungeons | `heroic_buy` | `itemId` | `src/net/online.ts` |
| IWorldDungeons | `leave_dungeon` | (none) | `src/net/online.ts` |
| IWorldDungeons | `set_dungeon_difficulty` | `difficulty` | `src/net/online.ts` |
| IWorldFarming | `consume_feast` | `id` | `src/net/online.ts` |
| IWorldFarming | `convert_husks` | (none) | `src/net/online.ts` |
| IWorldFarming | `harvest_crop` | `bed` | `src/net/online.ts` |
| IWorldFarming | `place_feast` | `slot` | `src/net/online.ts` |
| IWorldFarming | `plant_crop` | `bed`, `crop` | `src/net/online.ts` |
| IWorldGuildBank | `guild_bank_buy_slots` | (none) | `src/net/online.ts` |
| IWorldGuildBank | `guild_bank_deposit` | `...materialStorageTransferPayload` | `src/net/online.ts` |
| IWorldGuildBank | `guild_bank_deposit_gold` | `amount` | `src/net/online.ts` |
| IWorldGuildBank | `guild_bank_log` | `before`, `kind` | `src/net/guild_bank_log_mirror.ts`, `src/net/guild_bank_log_wire.ts` |
| IWorldGuildBank | `guild_bank_withdraw` | `...materialStorageTransferPayload` | `src/net/online.ts` |
| IWorldGuildBank | `guild_bank_withdraw_gold` | `amount` | `src/net/online.ts` |
| IWorldHousing | `buy_house` | `lot` | `src/net/online.ts` |
| IWorldHousing | `house_storage_deposit` | `slot` | `src/net/online.ts` |
| IWorldHousing | `house_storage_withdraw` | `slot` | `src/net/online.ts` |
| IWorldHousing | `place_furniture` | `anchor`, `slot` | `src/net/online.ts` |
| IWorldHousing | `remove_furniture` | `anchor` | `src/net/online.ts` |
| IWorldInteraction | `set_auto_loot` | `enabled` | `src/net/online.ts`, `src/net/session_preferences.ts` |
| IWorldInventory | `inv_sort` | (none) | `src/net/online.ts` |
| IWorldInventory | `lock_item` | `...anchorFields`, `item`, `locked`, `slot` | `src/net/online.ts` |
| IWorldInventory | `material_combine` | `item`, `target` | `src/net/online.ts` |
| IWorldInventory | `material_separate` | `item`, `sources`, `target` | `src/net/online.ts` |
| IWorldInventory | `membership_claim_armour` | (none) | `src/net/online.ts` |
| IWorldInventory | `rift_socket_gem` | `gem`, `item`, `slot` | `src/net/online.ts` |
| IWorldInventory | `rift_upgrade_item` | `item`, `slot` | `src/net/online.ts` |
| IWorldLanceTrial | `lance_brace` | (none) | `src/net/lance_wire_state.ts`, `src/net/quest_world_wire_state.ts` |
| IWorldLanceTrial | `lance_release` | (none) | `src/net/lance_wire_state.ts`, `src/net/quest_world_wire_state.ts` |
| IWorldLanceTrial | `lance_thrust` | (none) | `src/net/lance_wire_state.ts`, `src/net/quest_world_wire_state.ts` |
| IWorldLoot | `lootRoll` | `choice`, `rollId` | `src/net/online.ts` |
| IWorldMail | `mail_delete` | `id` | `src/net/online.ts` |
| IWorldMail | `mail_read` | `id` | `src/net/online.ts` |
| IWorldMail | `mail_send` | `body`, `copper`, `items`, `subject`, `to` | `src/net/online.ts` |
| IWorldMail | `mail_take` | `id` | `src/net/online.ts` |
| IWorldMarket | `market_buy` | `id` | `src/net/online.ts` |
| IWorldMarket | `market_cancel` | `id` | `src/net/online.ts` |
| IWorldMarket | `market_collect` | (none) | `src/net/online.ts` |
| IWorldMarket | `market_list` | `count`, `item`, `price` | `src/net/online.ts` |
| IWorldMarket | `market_list_instance` | `instance`, `item`, `price` | `src/net/online.ts` |
| IWorldMarket | `market_order_cancel` | `id` | `src/net/online.ts` |
| IWorldMarket | `market_order_fill` | `count`, `id` | `src/net/online.ts` |
| IWorldMarket | `market_order_place` | `count`, `item`, `price` | `src/net/online.ts` |
| IWorldMarket | `market_search` | `armorClass`, `collapseLowest`, `itemType`, `page`, `primaryStat`, `q`, `rarity`, `sort`, `subtype` | `src/net/online.ts` |
| IWorldMarket | `market_sell_price_check` | `item` | `src/net/online.ts` |
| IWorldMarket | `market_sweep` | `count`, `item`, `max` | `src/net/online.ts` |
| IWorldMarket | `market_sweep_quote` | `count`, `item` | `src/net/online.ts` |
| IWorldMounts | `learn_riding` | `npc`, `ridingTier` | `src/net/online.ts` |
| IWorldMounts | `mount_race_cancel` | (none) | `src/net/online.ts` |
| IWorldMounts | `mount_race_start` | (none) | `src/net/online.ts` |
| IWorldMounts | `mount_toggle` | (none) | `src/net/online.ts` |
| IWorldMounts | `mount_train_begin` | (none) | `src/net/online.ts` |
| IWorldParty | `clearMarker` | `id` | `src/net/online.ts` |
| IWorldParty | `masterAssign` | `pids`, `rollId` | `src/net/online.ts` |
| IWorldParty | `paccept` | (none) | `src/net/online.ts` |
| IWorldParty | `pdecline` | (none) | `src/net/online.ts` |
| IWorldParty | `pinvite` | `id` | `src/net/online.ts` |
| IWorldParty | `pkick` | `id` | `src/net/online.ts` |
| IWorldParty | `pleave` | (none) | `src/net/online.ts` |
| IWorldParty | `pmoveRaid` | `group`, `id` | `src/net/online.ts` |
| IWorldParty | `ppromote` | `id` | `src/net/online.ts` |
| IWorldParty | `praid` | (none) | `src/net/online.ts` |
| IWorldParty | `punraid` | (none) | `src/net/online.ts` |
| IWorldParty | `readyrespond` | `ready` | `src/net/online.ts` |
| IWorldParty | `setLootMaster` | `enabled`, `looter`, `threshold` | `src/net/online.ts` |
| IWorldParty | `setMarker` | `id`, `marker` | `src/net/online.ts` |
| IWorldPet | `pet_abandon` | (none) | `src/net/online.ts` |
| IWorldPet | `pet_attack` | (none) | `src/net/online.ts` |
| IWorldPet | `pet_auto_special` | `enabled` | `src/net/online.ts` |
| IWorldPet | `pet_auto_taunt` | `enabled` | `src/net/online.ts` |
| IWorldPet | `pet_auto_water_jet` | `enabled` | `src/net/online.ts` |
| IWorldPet | `pet_feed` | `item`, `slot` | `src/net/online.ts` |
| IWorldPet | `pet_heal` | (none) | `src/net/online.ts` |
| IWorldPet | `pet_mode` | `mode` | `src/net/online.ts` |
| IWorldPet | `pet_rename` | `name` | `src/net/online.ts` |
| IWorldPet | `pet_revive` | (none) | `src/net/online.ts` |
| IWorldPet | `pet_special` | (none) | `src/net/online.ts` |
| IWorldPet | `pet_taunt` | (none) | `src/net/online.ts` |
| IWorldPet | `pet_water_jet` | (none) | `src/net/online.ts` |
| IWorldProfessions | `swap_perfecting_ranks` | `...perfectingSwapCommand` | `src/net/online.ts` |
| IWorldProgressionXp | `prestige` | (none) | `src/net/online.ts` |
| IWorldQuests | `allied_hearthstone_attune` | `npcId` | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `clue_hunt_abandon` | (none) | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `world_quest_accuse` | `npcId` | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `world_quest_glider_boost` | (none) | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `world_quest_match3_reset` | `quest` | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `world_quest_match3_swap` | `fromIndex`, `quest`, `toIndex` | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `world_quest_puzzle_reset` | `quest` | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `world_quest_puzzle_rotate` | `quest`, `tileIndex` | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `world_quest_reroll` | `quest` | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `world_quest_shadow` | `action` | `src/net/quest_world_wire_state.ts` |
| IWorldQuests | `world_quest_start` | `difficulty`, `quest` | `src/net/quest_world_wire_state.ts` |
| IWorldSeasonal | `trick_or_treat` | `boo`, `npcId` | `src/net/quest_world_wire_state.ts`, `src/net/seasonal_wire_state.ts` |
| IWorldSeating | `sit_seat` | `seat` | `src/net/online.ts` |
| IWorldSocialGraph | `block_add` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `block_remove` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `friend_add` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `friend_remove` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_accept` | (none) | `src/net/online.ts` |
| IWorldSocialGraph | `guild_buy_roster_page` | (none) | `src/net/online.ts` |
| IWorldSocialGraph | `guild_create` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_decline` | (none) | `src/net/online.ts` |
| IWorldSocialGraph | `guild_demote` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_disband` | (none) | `src/net/online.ts` |
| IWorldSocialGraph | `guild_event_create` | `day`, `hour`, `note`, `title` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_event_remove` | `id` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_invite` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_kick` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_leave` | (none) | `src/net/online.ts` |
| IWorldSocialGraph | `guild_pledge` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_pledge_decide` | `accept`, `name` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_pledge_settings` | `...settings` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_pledge_withdraw` | (none) | `src/net/online.ts` |
| IWorldSocialGraph | `guild_promote` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_set_motd` | `text` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_set_ranks` | `ranks` | `src/net/online.ts` |
| IWorldSocialGraph | `guild_transfer` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `ignore_add` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `ignore_remove` | `name` | `src/net/online.ts` |
| IWorldSocialGraph | `referralCards` | `action` | `src/net/online.ts` |
| IWorldSocialGraph | `social_refresh` | `afterBlockCursor`, `afterFriendCursor` | `src/net/online.ts` |
| IWorldSocialGraph | `who` | `filter` | `src/net/online.ts` |
| IWorldTalents | `applyTalents` | `alloc` | `src/net/online.ts` |
| IWorldTalents | `deleteLoadout` | `index` | `src/net/online.ts` |
| IWorldTalents | `respec` | (none) | `src/net/online.ts` |
| IWorldTalents | `saveLoadout` | `alloc`, `bar`, `captureGear`, `name` | `src/net/online.ts` |
| IWorldTalents | `selectTalentRow` | `level`, `optionId` | `src/net/online.ts` |
| IWorldTalents | `setSpec` | `spec` | `src/net/online.ts` |
| IWorldTalents | `switchLoadout` | `index` | `src/net/online.ts` |
| IWorldTargeting | `stopAutoAttackOnTargetSwitch` | `enabled` | `src/net/online.ts`, `src/net/session_preferences.ts` |
| IWorldTargeting | `tab` | (none) | `src/net/online.ts` |
| IWorldTargeting | `tabFriendly` | (none) | `src/net/online.ts` |
| IWorldTargeting | `tabPrev` | (none) | `src/net/online.ts` |
| IWorldTargeting | `target` | `id`, `seq` | `src/net/online.ts` |
| IWorldTargeting | `targetNearestFriendly` | (none) | `src/net/online.ts` |
| IWorldTelemetry | `telemetry` | `...data`, `kind` | `src/net/online.ts` |
| IWorldTrade | `trade_accept` | (none) | `src/net/online.ts` |
| IWorldTrade | `trade_cancel` | (none) | `src/net/online.ts` |
| IWorldTrade | `trade_close` | (none) | `src/net/online.ts` |
| IWorldTrade | `trade_confirm` | (none) | `src/net/online.ts` |
| IWorldTrade | `trade_offer` | `copper`, `items` | `src/net/online.ts` |
| IWorldTrade | `trade_req` | `id` | `src/net/online.ts` |
| IWorldVehicles | `vehicle_action` | `action`, `x`, `z` | `src/net/quest_world_wire_state.ts` |
| IWorldVehicles | `vehicle_enter` | `station` | `src/net/quest_world_wire_state.ts` |
| IWorldVehicles | `vehicle_leave` | (none) | `src/net/quest_world_wire_state.ts` |
| IWorldWorldPvp | `pvp_flag` | `on` | `src/net/online.ts` |
| IWorldWorldPvp | `skull_bag` | `...action` | `src/net/online.ts` |
