# Wyndlewood add-on API (v1)

Status: v1 implemented on `feature/addon-api` (client runtime, sandbox, Addons window,
Electron Workshop glue, SDK). Owner: addon platform crew.

Players write small UI add-ons (combat logs, encounter timers, minimap tweaks, damage and
healing meters) and share them through the Steam Workshop. This document is the contract:
what an add-on can read, what it can draw, what it can never do, how it is isolated, and
how it reaches other players.

Anchors: the runtime lives in `src/ui/hud/addons/` (barrel `index.ts`, local `CLAUDE.md`);
the sandbox bootstrap is `public/addon-sandbox/bootstrap.js`; the Electron side is
`electron/addons.cjs` + `electron/steam_workshop.cjs`; the SDK is `sdk/addons/`. The pinned
tests are `tests/addon_*.test.ts`, `tests/electron_addons.test.ts` and the real-browser
escape probe `scripts/addon_sandbox_probe.mjs`.

## 1. Principles (the hard rules)

1. **Server authority is untouched.** Add-ons run only in the client and only ever see
   what the player's own HUD could already show. The API reads `IWorld` through the same
   surfaces the HUD uses and adds nothing to the sim, the wire, or `IWorld` itself
   (no new facet member, so `tests/world_api_parity.test.ts` is unchanged).
2. **No automation.** An add-on can never move the character, cast, target, use an item,
   send chat, trade, mail, or call any `IWorld` command by itself. The only way an add-on
   can cause a game action is a **secure button**: a button whose action is declared ahead
   of time from a short allowlist, executed by the HOST inside the trusted click handler of
   a real player input. One click is one action, the same as pressing that keybind; the
   add-on code never runs between the click and the action, and it cannot change what a
   secure button does while the player is in combat (combat lockdown, section 6).
3. **No hidden information.** Every datum is derived from a HUD surface: unit frames,
   party/raid frames, the target cast bar, the minimap marker model, the player's own
   combat-log events (own, pet, and party, the same set the built-in meters count), the
   chat lines the player receives, and the player's own bags and quests. No enemy
   cooldowns, no positions beyond what the minimap draws, no entity outside interest.
4. **Isolation.** Add-on code runs in a dedicated Web Worker created inside a sandboxed,
   opaque-origin iframe with a deny-all Content Security Policy. It has no DOM, no
   network, no storage, no cookies, no auth token, no `eval`, and no reference to any game
   object. It talks to the game only through a validated message channel.
5. **Stability.** A broken or hostile add-on cannot crash or freeze the game: it runs off
   the main thread, every host-side step is budgeted, a hung worker is terminated, and an
   add-on that keeps failing is auto-disabled. Safe mode loads the game with no add-ons.

## 2. Architecture

```
 game page (trusted)                         sandbox iframe (opaque origin, CSP deny-all)
 +-------------------------------+           +----------------------------------------+
 | Hud                           |  spawn    | bootstrap.js (ours, no add-on code)    |
 |  AddonRuntime (controller)    |---------->|   new Worker(blob: prelude + files)    |
 |   - sources (dev/local/WS)    |  port     |                                        |
 |   - snapshot builder (IWorld) |<========> | worker #1  [prelude: wynd API] addon A |
 |   - event filter (SimEvents)  |  per-addon| worker #2  [prelude: wynd API] addon B |
 |   - op validator + frames     |  Message  +----------------------------------------+
 |   - budgets, watchdog, stats  |  Channel
 |  AddonFramesController (DOM)  |
 |  AddonsWindow (manager UI)    |
 +-------------------------------+
```

- **One worker per add-on.** Isolation of faults and per-add-on CPU accounting come from
  the thread boundary. Workers are spawned by the bootstrap inside the iframe so they
  inherit its opaque origin and its CSP; the host keeps one end of a `MessageChannel` per
  add-on and the iframe drops out of the conversation after the spawn.
- **The prelude** (`addon_worker_prelude.ts`, a self-contained function serialized with
  `toString()`) runs first in each worker: it captures what it needs, deletes every
  network and storage global, and freezes the `wynd` API object. The bootstrap builds ONE
  worker script: the prelude call, then the add-on files in load order, then a load
  trailer (`addonWorkerScript`). One script rather than `importScripts`, because the
  desktop shell's CSP (inherited by the sandbox) allows `blob:` workers but not `blob:`
  script imports. A syntax error fails the whole worker script, and a top-level throw
  stops before the trailer; either way the add-on never reports `ready`, and the host
  records a load error. All add-on code runs in strict mode.
- **Host modules** (all under `src/ui/hud/addons/`): pure cores for the manifest, the
  snapshot, the event filter, the widget op validator, permissions, budgets and saved
  variables; DOM controllers for the runtime (workers, routing, watchdog), the add-on
  frame layer, and the Addons window. `Hud` composes the runtime the way it composes any
  domain controller: built in the constructor, fed `handleEvents` and the 100 ms fast band
  of `update()`, closed from `closeAll`.
- **Sources.** Dev builds load the SDK examples (`sdk/addons/examples/*`) through
  `import.meta.glob` (stripped from production). The desktop shell lists a local AddOns
  folder and the installed Steam Workshop items through IPC (section 9). The website
  build has no add-on source and the runtime stays dormant.

### Data flow

- **Snapshot**, about 10 Hz (the HUD fast band): player, target, target-of-target, pet,
  party or raid members, zone, combat flag, and (per permission) minimap markers, bag and
  equipment summary, quest log summary. Built once per tick by `addon_snapshot_core.ts`
  and posted to every running worker (structured clone, a few KB).
- **Events**, every frame that has any: the frame's `SimEvent` batch is filtered by
  `addon_event_filter_core.ts` (own, pet and party combat; received chat) and mapped to
  plain records with resolved names. Derived events (combat start/end, target changed,
  party changed, zone changed) are computed in the prelude from snapshot diffs.
- **Ops**, worker to host: UI ops (create, set, destroy), saved-variable writes, slash
  command registration, chat prints, stats, errors. Every op is validated by
  `addon_widget_core.ts` / `addon_runtime_core.ts` before it touches the DOM or storage.

## 3. Sandbox and threat model

**Adversary:** a malicious Workshop upload, or a legitimate add-on that was compromised in
an update. It wants to (a) steal the auth token or account data, (b) act as the player
(automation, gold transfer, chat spam), (c) exfiltrate private data (whispers, location),
(d) read hidden game state for an advantage, (e) crash or freeze the game, (f) attack the
player's machine (files, other apps), or (g) attack other add-ons.

| Goal | Path an attacker would try | Defense | Proof |
|---|---|---|---|
| (a) token | read `localStorage`, cookies, `window.__game`, the `wocDesktop` bridge | worker has no DOM and no storage; opaque origin means no cookies and no same-origin storage; the bridge exists only in the main world of the game page | escape probe: `self.origin === "null"`, `indexedDB` throws, `localStorage` undefined |
| (a)(c) exfil | `fetch`, XHR, `WebSocket`, `EventSource`, `importScripts(url)`, `import(url)`, `navigator.sendBeacon`, an `<img>` | CSP `default-src 'none'` (connect, img, script limited to the bootstrap URL and `blob:`); the prelude also deletes the network globals; the worker has no DOM to make an image; the host never renders add-on supplied URLs (no `url()` in styles, no image props) | escape probe asserts every path fails and that the probe server logs zero hits |
| (a)(b) eval of internals | `eval`, `new Function`, string `setTimeout` | CSP forbids eval in the worker (no `unsafe-eval`); there is no game object in the worker to evaluate against | escape probe: `EvalError` |
| (b) automation | call a host op that moves, casts, targets, uses, sends chat | there is no such op; the op allowlist is closed and unknown ops are rejected and counted as errors | `tests/addon_fairness.test.ts` |
| (b) one-button rotation | a button whose action is decided at click time | secure actions are declared props, executed by the host on a trusted click; the add-on is not consulted; secure props are frozen in combat | `tests/addon_fairness.test.ts` |
| (b) synthetic clicks | `el.click()` or a forged message claiming a click | the worker cannot touch the DOM; the host requires `event.isTrusted`; clicks travel host to worker only | `tests/addon_frames.test.ts` |
| (d) hidden data | ask for enemy cooldowns, far entities, cast data | the snapshot is built from HUD-visible fields only, entities beyond the minimap radius never appear, the event filter drops events between third parties | `tests/addon_fairness.test.ts` |
| (e) freeze | `while(true){}`, deep recursion, giant allocations | runs on a worker thread; heartbeat watchdog terminates a worker that misses pings for 3 s; host processing per add-on per frame is capped (ops and milliseconds); a backlog over the cap kills the add-on | `tests/addon_runtime.test.ts`, escape probe (infinite loop) |
| (e) DOM flood | create 100k widgets, megabyte strings | widget, text, and op caps per add-on; over-cap ops are rejected | `tests/addon_widget_core.test.ts` |
| (e) crash loop | throw in every handler | errors are caught in the prelude and counted; 25 errors in 60 s auto-disables; a crash during load trips the boot sentinel and the next launch starts in safe mode | `tests/addon_runtime.test.ts` |
| (f) machine | read or write files | the worker has no file API; the Electron side reads add-on folders itself with path containment checks and size caps, never executes anything, and saved variables live in the game's own storage | `tests/electron_addons.test.ts` |
| (g) other add-ons | read another add-on's saved data or frames | per-add-on worker, per-add-on storage keys, widget ids scoped by add-on id; inter-add-on messages only between declared dependencies | `tests/addon_runtime.test.ts` |
| UI spoofing | draw a fake login or purchase prompt | add-on frames sit in their own layer below game windows and modals, cannot use game CSS classes, and every add-on frame carries a `data-addon` marker; text only, no HTML | `tests/addon_frames.test.ts` |
| phishing text | print "click here" links into chat | prints are plain text, prefixed with the add-on name, never parsed for links | `tests/addon_runtime.test.ts` |

**Residual risks (accepted, documented):** an add-on can show misleading text inside its
own frames, can burn CPU on its own worker thread up to the watchdog limits, and sees the
chat lines the player receives when it holds the `chat` permission (whispers included).
Those are visible in the Addons window permission chips and CPU column, and the Workshop
review/report flow is the backstop. Defense in depth means a CSP failure alone does not
open the network: the prelude deletes the globals too, and the opaque origin removes
credentials.

## 4. Manifest (`addon.json`)

```json
{
  "id": "simple-damage-meter",
  "name": "Simple Damage Meter",
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "Wyndlewood SDK",
  "description": "Party damage and healing bars.",
  "permissions": ["combatLog", "party"],
  "files": ["main.js"],
  "savedVariables": { "account": true, "character": true },
  "slashCommands": ["sdm"],
  "dependencies": [],
  "optionalDependencies": [],
  "loadOrder": 100,
  "settings": [
    { "key": "mode", "type": "choice", "label": "Show", "default": "damage",
      "options": [{ "value": "damage", "label": "Damage" }, { "value": "healing", "label": "Healing" }] }
  ],
  "tags": ["Combat", "Meters"]
}
```

Rules (`addon_manifest_core.ts`, mirrored for the shell in `electron/addons.cjs`):
`id` is 3 to 48 chars of `a-z 0-9 -`, unique; `version` is semver `x.y.z`; `apiVersion`
an integer; `files` (or a single `entry`) are relative `.js` paths inside the folder, at
most 16 files and 512 KB total; `permissions` from the closed list in section 5;
`slashCommands` 2 to 24 chars, not reserved; `settings` up to 32 entries of type
`toggle`, `slider`, `choice`; `tags` from the Workshop tag allowlist. Unknown top-level
keys are ignored (forward compatibility); a malformed manifest is listed with its error
and never loads.

**API version compatibility.** The runtime declares `ADDON_API_VERSION` (current) and
`ADDON_API_MIN` (oldest still loaded). `apiVersion > current`: "requires a newer game
version", not loaded. `apiVersion < min`: "out of date", not loaded unless the player
ticks "Load out of date add-ons". In between: loaded, with the prelude applying the shims
for that version (the prelude receives the add-on's `apiVersion`). The policy for moving
the version: additive changes do NOT bump it; a removal or semantic change bumps
`ADDON_API_VERSION`, keeps a shim for at least one major game release, and only then
raises `ADDON_API_MIN`. `wynd.apiVersion` tells an add-on which runtime it is on.

**Load order.** Dependencies first (topological), then `loadOrder` ascending, then id.
A missing required dependency or a cycle is a load error; a missing optional dependency is
ignored. Dependencies order the spawn and gate `wynd.comm` (section 5.9).

## 5. API surface (the `wynd` global inside the worker)

Typed definitions: `sdk/addons/wynd-addon-api.d.ts`. Everything below is v1.

### 5.1 Permissions

| Permission | Grants |
|---|---|
| (none) | `player`, `target`, `targettarget`, `pet` units, zone, combat flag, UI, timers, slash commands, prints, settings, saved variables declared in the manifest |
| `party` | `party1..4` / `raid1..40` units and `wynd.party()` |
| `combatLog` | `COMBAT_LOG` events (own, pet, party participants only) |
| `chat` | `CHAT` events for lines the player receives (shown to the player as a privacy chip) |
| `minimap` | `wynd.minimap()`: the minimap marker model in yards relative to the player, clipped to the minimap radius, plus player position and facing |
| `inventory` | `wynd.inventory()`: own bags (item id, count) and equipped item ids |
| `quests` | `wynd.quests()`: own quest log entries with objective progress |
| `secureActions` | secure buttons (section 6) |

Permissions are shown in the Addons window; enabling an add-on grants what it declared.
A call that needs an undeclared permission returns `null` (data) or is rejected (ops).

### 5.2 Events

`wynd.on(name, fn)` returns an unsubscribe function. Handlers are isolated: a throw is
reported and counted, the next handler still runs.

| Event | Payload |
|---|---|
| `LOADED` | `{ firstRun }` after saved variables are in place |
| `UPDATE` | `{ time, dt }` about 10 Hz, after the snapshot refreshed |
| `COMBAT_START` / `COMBAT_END` | `{ time }` from the player's combat flag |
| `TARGET_CHANGED` | `{ unit }` (the new target or null) |
| `PARTY_CHANGED` | `{ size, raid }` |
| `ZONE_CHANGED` | `{ zoneId }` |
| `COMBAT_LOG` | `{ time, kind, source, target, amount, overheal, absorbed, crit, school, ability, abilityId, result, gained, stacks, success }` with `source`/`target` as `{ id, name, kind, isPlayer, isPet, isParty }` |
| `CHAT` | `{ time, channel, from, text, to }` |
| `CLICK` | `{ widget, button }` for add-on widgets with `clickable` |
| `FRAME_MOVED` | `{ widget, x, y }` after the player drags a movable frame |
| `SETTING_CHANGED` | `{ key, value }` |
| `COMM` | `{ from, data }` from a dependency (section 5.9) |
| `LOGOUT` | sent before the page unloads; last chance to save |

`COMBAT_LOG.kind` is one of `damage`, `heal`, `absorb`, `aura`, `death`, `castStart`,
`castStop`; `result` carries the damage outcome (`hit`, `miss`, `dodge`, `parry`,
`block`, `resist`, `immune`, `evade` ...).

### 5.3 Units and party

`wynd.unit(token)` returns `{ id, name, level, cls, kind, hp, hpMax, power, powerMax,
powerType, dead, inCombat, hostile, isPlayer, auras: [{ id, name, kind, remaining,
duration, stacks, mine }], cast: { ability, progress, duration } | null }` or null.
Tokens: `player`, `target`, `targettarget`, `pet`, `party1`..`party4`, `raid1`..`raid40`.
Party members out of interest return the party-frame fields only (hp, power, class,
level, dead, combat, the party aura strip). `wynd.party()` returns `{ raid, leader,
members: [{ unit, name, cls, level, role, dead, connected }] }`.

### 5.4 Minimap, inventory, quests

`wynd.minimap()`: `{ x, z, facing, zoneId, radiusYards, markers: [{ kind, dx, dz, ... }] }`.
`markers` is exactly the built-in minimap's marker model (`createMinimapMarkers`) at base
zoom, converted to yards; entities beyond the minimap radius never appear.
`wynd.inventory()`: `{ bags: [{ itemId, count }], equipped: [itemId] , copper }`.
`wynd.quests()`: `[{ id, title, done, objectives: [{ have, need }] }]` (titles via the
game's localized quest title).

### 5.5 Timers

`wynd.after(seconds, fn)`, `wynd.every(seconds, fn)` (minimum 0.05 s), `wynd.cancel(handle)`,
`wynd.time()` (game-session seconds, the clock the event timestamps use). Timer callbacks
are isolated and budgeted like handlers.

### 5.6 UI: frames, widgets, layout, anchors, drag

`wynd.ui.create(type, props)` returns a handle with `set(props)`, `destroy()`, `id`.
Types: `frame` (container with optional backdrop and border), `text`, `bar` (status bar
with `value/min/max`), `button` (text button, optionally secure). Common props:

- `parent` (a handle or id; omitted = the screen), `name` (stable name, required for
  movable frames so the position persists), `point` / `relativePoint` (one of
  `TOPLEFT TOP TOPRIGHT LEFT CENTER RIGHT BOTTOMLEFT BOTTOM BOTTOMRIGHT`), `x`, `y`
  (offsets in px), `width`, `height`, `shown`, `alpha`, `layer` (`low`, `medium`, `high`
  inside the add-on layer only), `clickable`, `movable` (top-level frames only).
- `backdrop` (`{ color, borderColor }`), `text`, `size` (8 to 32), `color`, `align`,
  `wrap`, `bold` for text; `value`, `min`, `max`, `color`, `bgColor`, `vertical` for bars.

Colors are `#rgb`, `#rrggbb` or `#rrggbbaa` or a named game token (`accent`, `good`,
`bad`, `warn`, `muted`, `text`, `class:<cls>`, `school:<school>`). There is no free CSS,
no HTML, no URL and no image prop in v1 (the reason is exfiltration and spoofing; game
icons by ability or item id are a planned v2 prop). Anchoring is relative to the parent
box (CSS percent position plus translate), so text auto-sizes without layout reads.

**Drag.** A top-level frame with `movable: true` and a `name` can be dragged by the player
(not while the game interface is locked if the player chose so). The host owns the drag,
persists the position per add-on per frame name (`woc_addon_layout_v1`), re-applies it
when the add-on creates the frame again, and sends `FRAME_MOVED`. Add-ons cannot move the
pointer or start a drag.

**Limits per add-on:** 400 widgets, 2,000 characters per text, 500 ops per message,
4,000 queued ops, 2 ms of host processing per frame (excess waits for the next frame).

### 5.7 Saved variables

`wynd.saved.account` and `wynd.saved.character` are plain objects (present when the
manifest declares them). They are restored before `LOADED` and written back when the
add-on calls `wynd.saved.save()`, automatically every 10 s when changed, and on `LOGOUT`.
Values must be JSON. Caps: 256 KB per scope. Keys: `woc_addon_sv_v1:<id>:account`,
`woc_addon_sv_v1:<id>:char:<realm>:<character>`. Removing an add-on keeps its data;
the Addons window has "Reset saved data".

### 5.8 Slash commands, prints, localization, settings

- `wynd.slash(name, fn(args))`: name must be listed in the manifest `slashCommands`, and
  not reserved by the game (`ADDON_RESERVED_SLASH`). Typed in chat as `/name args`; the
  line is consumed locally and never sent. Built-in: `/addons` opens the Addons window,
  `/reloadui` restarts all add-ons.
- `wynd.print(text, color?)`: a local chat line prefixed `[Addon Name]`, plain text.
- `wynd.locale()` (the game language, e.g. `de_DE`), `wynd.L(table)` picks
  `table[locale] ?? table[language] ?? table.en`, `wynd.format.number(n, opts)`,
  `wynd.format.duration(seconds)`, `wynd.format.percent(frac)` (Intl, game locale). Add-on
  text is the author's content; the game's own chrome stays on `t()` keys.
- `wynd.settings.get(key)` and the `SETTING_CHANGED` event. Settings are declared in the
  manifest and rendered by the host in the Addons window "Options" panel; values persist
  per account.

### 5.9 Add-on to add-on messages

`wynd.comm.send(addonId, data)` delivers `COMM` to `addonId` only when one of the two
declares the other in `dependencies` or `optionalDependencies`. JSON data, 16 KB cap. This
is how a shared library add-on serves others without shared memory.

## 6. Secure buttons (the only path to an action)

```js
wynd.ui.create('button', { parent: bar, text: 'Bags',
  secure: { type: 'toggleWindow', window: 'bags' } });
```

Allowlist (`ADDON_SECURE_ACTIONS`): `actionSlot` (press action bar slot N, the same path
as its keybind), `targetUnit` (`player`, `pet`, `party1..4`: the same as clicking that
unit frame), `toggleWindow` (`bags`, `map`, `character`, `spellbook`, `talents`,
`questlog`). Rules: requires the `secureActions` permission; executed by the host in the
click handler only when `event.isTrusted`; at most one action per click; the add-on is
notified after the fact (`CLICK`) and cannot veto, delay or redirect it. **Combat lockdown:**
while the player is in combat, the host defers (until combat ends) every op that would
create, destroy, show, hide, move, resize or re-declare a secure button or any ancestor of
one, so an add-on cannot reshuffle which button sits under the cursor mid-fight. This is
the classic secure-template model; it keeps "one input, one action, chosen by the player".

## 7. Stability

- **Off-main-thread execution**: an infinite loop stalls only its own worker.
- **Heartbeat**: the host pings every 1 s; no pong for 3 s terminates the worker, marks
  the add-on "Stopped: not responding" and disables it until the player re-enables it.
- **Error budget**: handler, timer and load errors and rejected ops are counted; 25 in
  60 s auto-disables the add-on (persisted with the reason).
- **Host budget**: ops are applied at most 2 ms per add-on per frame; a backlog over
  4,000 ops stops the add-on.
- **Boot sentinel**: a flag set while add-ons spawn and cleared after 10 s of stable
  running. If the game dies in that window, the next launch starts in safe mode and says
  so. Safe mode is also one click in the Addons window ("Restart in safe mode") and the
  `?addons=safe` URL flag in dev.
- **Stats** (Addons window): CPU ms per second (measured in the worker around every
  handler and timer), messages per second, widget count, saved data size, error count,
  last errors. Worker heap size is not observable from the page (no cross-origin
  isolation), so "memory" is reported as widgets plus saved data; this is stated in the UI.

## 8. Fairness review against `docs/design/graphics-settings-fairness.md`

Add-ons are a presentation layer like graphics presets: they may add or rearrange
information the HUD already exposes and must never hide or delay something the base HUD
shows. The add-on layer sits below game windows, prompts and the boss warning banners;
it cannot cover or restyle them (no game classes, own layer). An add-on that the player
installs can obscure the 3D view with its own frames, which is a player choice like
moving a built-in frame. Nothing about add-ons is gated on the graphics preset.

## 9. Steam Workshop flow

**Player:** subscribe in the Workshop; Steam downloads the item; on the next launch (or
"Reload UI") the shell lists subscribed items (`ISteamUGC::GetSubscribedItems` plus
`GetItemInstallInfo`), reads each install folder like a local add-on, and the Addons
window shows it with the source "Workshop". Items still downloading are listed as such and
`DownloadItem` is requested. Unsubscribing removes it after the game exits (Steam rule).
Without Steam (not the Steam build, Steam not running, no App ID), the shell falls back to
the local folder only.

**Local folder:** `<userData>/AddOns/<addon-id>/addon.json` (+ files). The Addons window
has "Open add-ons folder". Override with `WYND_ADDONS_DIR` on unpackaged builds.

**Creator:** two paths, same code (`electron/steam_workshop.cjs`):
1. In game: a local add-on row has "Publish to Workshop" (desktop, Steam running). The
   shell validates the folder, creates the item on first publish (`CreateItem`), stores
   the published id in `workshop.json` beside the manifest, then `SubmitItemUpdate` with
   title, description, tags, preview (`preview.png` if present) and content folder.
2. CLI: `node scripts/addon_publish.mjs <folder> [--visibility private|friends|unlisted|public]
   [--note "change note"] [--dry-run]` (Steam client running and logged in, App ID from
   `WYND_STEAM_APP_ID` or `WOC_STEAM_APP_ID`).
If Steam answers `needsToAcceptAgreement`, the item is created but hidden until the
creator accepts the Workshop legal agreement on its Steam page; both paths say so.

**App ID:** read from the build stamp (`wocDesktop.steamAppId`) or `WOC_STEAM_APP_ID`
(unpackaged), falling back to Spacewar (480) for local experiments, exactly like
`electron/steam.cjs`. No new package: the existing optional `steamworks.js` dependency
already wraps `ISteamUGC` (`client.workshop.*`).

**What the owner must set up in Steamworks** (not doable from code):
1. Create the app (App ID) and stamp it into the Steam build (`steamAppId`).
2. Workshop > General: enable Steam Workshop for the app; choose "ready to use" item
   visibility rules; set the per-item size limit (add-ons are small, 10 MB is plenty).
3. Workshop > Tags: add the tag set used by `ADDON_WORKSHOP_TAGS` (`Addon`, `Combat`,
   `Meters`, `Timers`, `Map`, `Interface`, `Chat`, `Social`, `Library`).
4. Steam Cloud / UGC: enable "UGC" file storage quota for the app (ISteamUGC uses it).
5. Publish the Workshop legal agreement link (Steam provides it) and decide on
   moderation: allow player reports, assign a moderator account, optionally require
   items to be approved ("Curated" vs "Ready-to-use"; ready-to-use fits add-ons).
6. Visibility default: items start Private on first publish from the CLI unless
   `--visibility` says otherwise; in game the dialog defaults to Private too.
7. Publish the Steamworks changes (Steamworks requires "Publish" for settings to apply),
   then test with a second account: subscribe, launch, see the add-on in the window.

## 10. Worked examples (the owner's add-on kinds)

All four are buildable on v1; three ship as SDK examples.

**Combat log (permission `combatLog`, optional `chat`).** Subscribe to `COMBAT_LOG`, keep a
ring buffer of the last N entries, render a movable `frame` with `text` rows, filter by
kind with buttons (plain `clickable` buttons, no secure action needed). Data:
`source.name`, `target.name`, `ability`, `amount`, `result`, `crit`, `time`. Saved
variables: filter settings and window position (position is automatic).

**Raid / encounter timer (no extra permission; `combatLog` for ability triggers).** The
SDK `encounter-timer` example: `COMBAT_START` starts a stopwatch, `COMBAT_END` records the
duration per target name in `saved.character`; `/et 30 Adds` adds a countdown bar; the
target cast bar comes from `wynd.unit('target').cast` (the same cast the target frame
shows). A boss-ability timer subscribes to `COMBAT_LOG` `castStart` of the target and
starts a bar of the author's chosen length. Pull timers are local (`/et pull 10`); telling
the party is the player typing in chat, never the add-on.

**Minimap tweak (permission `minimap`).** The SDK `minimap-coords` example: a small frame
under the minimap showing player coordinates, facing, zone and a count of nearby markers by
kind, plus an optional compact radar that redraws `wynd.minimap().markers` as dots in a
square frame. It can only redraw what the minimap already shows.

**Damage / healing meters (permissions `combatLog`, `party`).** The SDK
`simple-damage-meter` example: sums `COMBAT_LOG` `damage` and `heal` amounts by
`source.id` for party members and pets (pets fold into the owner via `source.ownerName`),
segments by `COMBAT_START` / `COMBAT_END`, shows DPS over the segment duration as `bar`
rows sorted descending, `/sdm reset`, mode setting `damage` or `healing`, saved per
account. Overheal and absorbs arrive in the same events.

## 11. Testing

- `tests/addon_manifest.test.ts`: manifest validation, version compatibility, load order.
- `tests/addon_widget_core.test.ts`: op validation, caps, color/anchor sanitizing,
  combat lockdown deferral.
- `tests/addon_fairness.test.ts`: the snapshot holds only HUD-visible fields; far
  entities and third-party events never leak; there is no op that acts; secure actions
  only on trusted clicks and from the allowlist.
- `tests/addon_worker_prelude.test.ts`: the prelude in a fake worker scope: globals
  deleted, handler isolation, string timers refused, saved variables round trip, derived
  events, syntax and top-level load errors.
- `tests/addon_runtime.test.ts`: routing, budgets, watchdog termination, auto-disable,
  boot sentinel and safe mode, saved-variable persistence per account and character.
- `tests/electron_addons.test.ts`: folder scan, path containment, size caps, Workshop
  listing and publish with an injected fake `steamworks.js`.
- `scripts/addon_sandbox_probe.mjs`: real Chromium (Edge or Chrome headless), bundles the
  real sandbox host and prelude, serves the real bootstrap, and runs an escape suite
  (fetch, XHR, WebSocket, EventSource, importScripts, dynamic import, eval, Function via
  constructor, string timers, IndexedDB, Cache, BroadcastChannel, nested Worker,
  WebAssembly, sendBeacon, blob URLs, document, localStorage, the desktop bridge, the game
  global) plus a `for (;;) {}` add-on, with no page CSP and under the desktop shell's own
  CSP. It fails if any path opens, if the server sees a single request, or if the page's
  main thread lags.
