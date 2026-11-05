# Client feature inventory for a Unity port

Status: planning inventory, written against `feature/player-housing` (merge `64d84727`). It
lists what the current Three.js client renders or handles, grouped by area, with a size
estimate and a port, rebuild, or drop call for each. Companion docs: `wire-protocol.md`
(what the client speaks), `asset-pipeline.md` (how assets move), `cost-and-risk.md` (totals).

## How to read the estimates

- A **crew-day** is one AI crew working one day on the owner's PC, including its own tests
  and screenshots, but NOT the owner's review time. Ranges are low to high; the high end
  assumes one rework round after owner review, which art-facing items usually need.
- **Port** means the behavior and data carry over and only the host changes (TS logic run as
  is, or translated to C# line for line). **Rebuild** means the feature is re-created natively
  in Unity to the new art target, using the TS code as the spec. **Drop** means the Unity
  client does not need it (it is a WebGL or browser workaround, a mobile feature, or a
  dev-only tool).
- Sizing anchors are line counts of the existing code (`find <dir> -name '*.ts' | xargs cat |
  wc -l`, measured on this branch), quoted as rough scale only: client logic is about 254k
  lines in `src/ui` (excluding i18n data), 495k in `src/render`, 57k in `src/game`, 16k in
  `src/net`, plus 76k lines of CSS in `src/styles`.

## The architecture assumption behind every number

The estimates assume the hybrid recommended in `cost-and-risk.md`: Unity renders the world and
paints the HUD natively, while the existing TS presentation cores (the DOM-free view-cores the
HUD is built from, `src/ui/CLAUDE.md` "pure view-core plus thin painter", the wire decoders and
the sim display helpers) run inside an embedded V8 (PuerTS) in the Unity player. Under that
assumption most HUD work is "write a C# painter for an existing core". If the M5 spike in
`vertical-slice-plan.md` rejects embedding, every "port (core in V8)" row below becomes a C#
translation and its estimate grows by roughly 1.6x to 2x (the "C# only" column in
`cost-and-risk.md` carries that variant).

## 1. HUD windows and frames (`src/ui/hud/` domains plus `src/ui/*_window.ts`)

The HUD composes domain components under `src/ui/hud/<domain>/` (each behind an `index.ts`
barrel) and the window modules at `src/ui/*_window.ts`, driven by the coordinator
`src/ui/hud.ts` (a monolith at about 17k lines). Unity target: UI Toolkit (UXML plus USS), one
C# painter per component on a shared `PainterHost`-like seam, fed by the TS view-core through
the V8 bridge.

### 1a. Frames and per-frame bars

| Component (path) | Size (TS lines) | Call | Crew-days |
|---|---|---|---|
| Unit frames: player, target, target-of-target, focus, party, raid (`src/ui/unit_portrait.ts` + painter, `src/ui/hud/vitals/`, `target_dots/`, `target_frame_menu.ts`) | ~2k plus shared cores | port (core in V8), rebuild painters | 6 to 10 |
| Portraits (`src/render/characters/portrait*.ts`, a render-to-texture capture) | ~3k | rebuild (Unity RenderTexture camera) | 2 to 4 |
| Cast bars, swing timer, GCD (`class_resources.ts`, cast bar cores in `hud.ts`) | ~1.5k | port core, rebuild painter | 2 to 3 |
| Action bars, keybind labels, cooldown sweeps, charges (`src/ui/hud/action_bar/`, `cooldown_manager/`, `cross_hotbar/`) | ~12.4k | port core, rebuild painter | 8 to 14 |
| Auras and aura tracks (`aura_tracks/`, `target_auras_window.ts`) | ~1.5k | port | 3 to 5 |
| Class resources and stances (`class_resources.ts`, `stance/`, `priest/`, `warlock/`, `shardpike/`) | ~2.3k | port | 4 to 6 |
| Pet bar (`pet_bar_core.ts`, `pet_bar_button.ts`) | small | port | 1 to 2 |
| Floating combat text (FCT, in `hud.ts` and its cores) | ~1k | rebuild (world-space UI) | 2 to 4 |
| Talking head, quest tracker, currencies, death, reputation bars (`talking_head/`, `quest/`, `currencies/`, `death/`, `reputation/`) | ~5.4k | port | 5 to 8 |
| Minimap and zone map (`src/ui/minimap_*.ts`, `map_*.ts`, `src/ui/hud/map/`) | ~13k | port core, rebuild painter | 8 to 12 |
| Chat frame, tabs, composer, bubbles (`src/ui/hud/chat/`, `chat_*.ts`) | ~2.9k | port | 4 to 6 |
| Tooltips (items, abilities, auras, talents; `src/ui/*tooltip*`, `aura_effect.ts`) | large, shared | port (core in V8), one painter family | 6 to 10 |
| Loot window, roll frames, loot explorer (`loot/`, `loot_explorer/`) | ~3.7k | port | 3 to 5 |
| Battleground, world PvP, hill, fiesta, rift, delve, dungeon HUD (`battleground/`, `world_pvp/`, `hill/`, `fiesta/`, `rift/`, `rift_forge/`, `delve/`, `dungeon/`) | ~12.7k | port, staged after launch-critical | 10 to 16 |
| Vehicle and transport frames (`vehicle/`, `transport/`) | ~1.2k | port | 2 to 3 |
| Reconnect overlay, loading screen, tips (`reconnect_overlay.ts`, `loading_*.ts`) | small | rebuild | 2 to 3 |

### 1b. Windows

Enumerated from `ls src/ui/*_window.ts` and the window-bearing HUD domains:

| Window | Call | Crew-days |
|---|---|---|
| Character (`char_window.ts`), Inspect (`inspect_window.ts`), skins (`char_skin_window.ts`) with the paperdoll 3D view | port core, rebuild 3D paperdoll | 5 to 8 |
| Bags (`bags_window.ts`), Bank (`bank_window.ts`), Account bank (`account_bank_window.ts`), Vault (`vault_window.ts`) | port | 6 to 9 |
| Spellbook (`spellbook_window.ts`), Talents (`talents_window.ts`) | port | 5 to 8 |
| Quest log and gossip (`src/ui/hud/quest/`) | port | 4 to 6 |
| Vendor and trainer (`src/ui/hud/vendor/`) | port | 3 to 5 |
| Professions, crafting, gathering goal, perfecting, town focus (`src/ui/hud/professions/` about 14.5k lines, `town_focus_window.ts`) | port | 12 to 18 |
| Market (`market_window.ts`), Mailbox (`mailbox_window.ts`), Trade (`src/ui/hud/trade/`), Courier (`courier/`) | port | 8 to 12 |
| Social: friends, guild, ignore, Who (`social_window.ts`), guild bank and log (`guild_bank_window.ts`, `guild_bank_log_window.ts`), guild board and hall (`guild_board/`, `guild_hall/`) | port | 8 to 12 |
| Dungeon finder (`dungeon_finder_window.ts`), Arena (`arena_window.ts`), Card duel (`card_duel_window.ts`), Calendar (`calendar_window.ts`) | port | 6 to 10 |
| Deeds (`deeds_window.ts`), Reliquary (`reliquary_window.ts`), Leaderboard (`leaderboard_window.ts`), Weekly quests and rewards (`weekly_quests_window.ts`, `weekly_rewards_window.ts`, `daily_rewards_window.ts`) | port | 6 to 9 |
| World quest windows (`world_quest_*_window.ts`: confection, leaderboard, ley, puzzle) | port, staged | 4 to 6 |
| Housing (`src/ui/hud/housing/`) | port core, rebuild placement gizmo | 3 to 5 |
| Options (`options_window.ts` family, about 8k lines with settings and keybinds) | rebuild (section 10) | see 10 |
| Raid boss guide (`raid_boss_guide_window.ts`), Report (`report_window.ts`), Claudium store (`claudium_window.ts`), cosmetics, referral cards, player card | port | 5 to 8 |
| Keyboard map (`keyboard_map_window.ts`), tutorial greeting (`tutorial_greeting_window.ts`) | port | 1 to 2 |
| Dev command window (`dev_command_window.ts`) | drop from release builds; keep an editor-only equivalent | 0 to 1 |
| Menu, practice, skull bag, treasure, expeditions, buddy menu, tap menu (`menu/`, `practice/`, `skull_bag/`, `treasure/`, `expeditions/`, `buddy_menu.ts`, `tap_menu*.ts`) | port (tap menu: drop, mobile) | 4 to 6 |

**HUD subtotal: about 170 to 275 crew-days** (hybrid), the single largest line item. The HUD
is also where "looks like a mobile game" is decided, so its visual language must be designed
once (USS theme plus a component kit) before the windows are mass-ported (M6 in the slice).

## 2. World rendering

| Feature (path) | Size | Call | Crew-days |
|---|---|---|---|
| Terrain: height, chunks, splat paint, cuts, far terrain (`src/render/terrain*.ts`, `far_terrain*.ts`; heights from `terrainHeight` in `src/sim/world.ts`) | ~11k | rebuild on Unity Terrain or meshes baked from the sim heightfield, with PBR splat layers | 10 to 16 |
| Water: lakes, rivers, shore, ocean, waterfalls, underwater (`water*.ts`, `shore_*`, `src/render/ocean/`, `waterfall.ts`, `underwater.ts`) | ~7k | rebuild (water asset, section 3 of the shortlist) | 6 to 10 |
| Foliage, grass, trees, sway, LOD and impostors (`foliage*.ts`, `blade_grass*.ts`, `grass_*`, `tree_*`, `world_style_foliage*`) | ~17k | rebuild (Unity terrain details or GPU instancing, new PBR foliage) | 12 to 20 |
| Sky, clouds, day and night clock, night lighting, aurora (`sky*.ts`, `clouds.ts`, `day_night_clock.ts`, `day_night_core.ts`, `night_*`) | ~5.7k | rebuild (sky asset plus a port of `day_night_core` timing so the clock matches the server) | 5 to 8 |
| Weather and fog (`weather*.ts`, `fog_scene_state.ts`) | included above | rebuild (volumetric fog asset) | 3 to 5 |
| Lights: point light budget, streetlamps, torches, interiors (`point_light_*`, `streetlamp*`, `interior_light_rig.ts`, `fire_light_registry.ts`) | ~4k | rebuild (URP Forward+ lights, APV probes) | 4 to 6 |
| Post: bloom, AO, SMAA, grading, cel ink, shadows cadence (`post*.ts`, `shadow_*`) | ~7.6k | rebuild (URP Volume profile, mostly free) | 3 to 5 |
| Static world placement: towns, props, buildings, walls, colliders (`placed_assets.ts`, `eastbrook_layout` and `colliders` readouts in `src/sim/`) | large | port the placement DATA by export (`asset-pipeline.md` section 5), rebuild the scene | 8 to 14 |
| Dungeons and set pieces (`src/render/hollow_crypt/`, `drowned_temple/`, `gravewyrm_sanctum*`, `sunken_bastion/`, `wildheart_basin/`) | large | rebuild per zone, after launch zones | 20 to 40 |
| Authored maps and editor API (`authored_map/`, `editor_api/`, `src/editor/`) | dev tool | drop from the client; Unity editor replaces it | 0 |
| GPU scheduler, prewarm twins, live-program gates, shed governors (`src/render/CLAUDE.md` "GPU work") | large | drop (WebGL shader-link workarounds); replace with Unity shader variant collections and warmup | 2 to 4 |

**World subtotal: about 75 to 130 crew-days** for launch zones (dungeons separate).

## 3. Characters, armor, weapons, animation

| Feature (path) | Size | Call | Crew-days |
|---|---|---|---|
| Modular player bodies, appearance normalization, dyes, makeup, hair (`src/render/characters/modular.ts`, `player_look_core.ts`, `armor_dye.ts`; `normalizeAppearance` in `src/world_api/appearance`) | part of ~62k | port the appearance DATA rules (core in V8), rebuild bodies to the new art target | 15 to 25 |
| Armor and held items: grips, back grips, sizes, stow, helm hide (`held_item_grips.ts`, `back_grips.ts`, `held_item_size_core.ts`) | | port data, rebuild sockets | 5 to 8 |
| Clip maps and animation state (`manifest.ts` `ClipMap` factories, `anim_state.ts` `desiredBaseState`, `locomotion.ts`, `clip_split.ts`, `clip_twin.ts`) | | port the state machine logic, rebuild as an Animator Controller or Playables graph keyed by the same `BaseState` names | 6 to 10 |
| Class and ability visual hooks (`damage_attack_animation.ts`, paladin clip modules, `charge_glow.ts`) | | port | 4 to 6 |
| Crowd LOD and the visual reuse pool (`src/render/crowd_lod.ts`, `visual_pool.ts`) | | rebuild (Unity LODGroup, GPU skinning, pooling) | 3 to 5 |
| NPC looks (`npc_looks.ts`, `npc_look_provider.ts`) | | port data | 2 to 3 |

**Characters subtotal: about 35 to 57 crew-days**, plus the art re-authoring in
`asset-pipeline.md` (characters are the most expensive art to redo).

## 4. Creatures

211 creature GLBs (`public/models/creatures/`) and the `MOBS` table (`src/sim/data.ts`) with
per-family clip maps (`manifest.ts`). Call: **port** rigs and clips as-is first (glTF import),
then **rebuild** hero creatures to the PBR target in priority order (zone 1 first). Estimate:
import and wiring 6 to 10 crew-days; re-authoring is art budget (see `asset-pipeline.md`).

## 5. VFX and ability visuals

`src/render/ability_vfx/` (~27k lines), `*_vfx_specs.ts` per class, `vfx*.ts`, `weapon_vfx*.ts`,
boss FX modules: about 45k lines of VFX code in total. Call: **rebuild** in VFX Graph or
Shuriken. The spec tables (`ability_vfx_registry.ts`, `*_vfx_specs.ts`) are declarative and
should be **ported as data** (exported JSON keyed by ability id) so one Unity VFX library is
driven by the same keys. Estimate: framework 5 to 8, per-class sets 4 to 6 each for 8 to 10
classes, boss and world FX 10 to 20: **about 50 to 90 crew-days**. Fairness applies:
telegraphs and cast visuals are actionable (`docs/design/graphics-settings-fairness.md`), so
they never scale down by tier.

## 6. Housing and furniture

`src/render/house_furniture.ts`, cottage layout (`src/sim/housing/cottage_layout.ts`), lots
(`src/sim/content/house_lots.ts`, `furniture.ts`), wire `housing_self_wire.ts` and
`house_storage_wire.ts`, commands `buy_house`, `place_furniture`, `remove_furniture`,
`house_storage_*`. Call: **port** data and placement rules (core in V8), **rebuild** the
placement gizmo and the furniture art. This is the feature the owner cares most about for the
New World and BDO style goal, so it deserves real PBR interiors. Estimate: 8 to 14 crew-days
of code plus art.

## 7. Gathering and crafting visuals

Gather nodes, strike poses and audio, tree felling, harvest icons (`gather_nodes*.ts`,
`gather_pose_core.ts`, `gather_strike_*.ts`, `tree_felling*.ts`, `nameplate_harvest_icon.ts`),
farm plots and mobile stations. Call: **port** the cores, **rebuild** the visuals. Fairness:
the node tier is expressed as SIZE (`nodeTierScale`) and must stay identical on every preset.
Estimate: 6 to 10 crew-days.

## 8. Audio and music cues

- SFX: 747 files under `public/audio/sfx`, manifest `src/game/sfx_manifest.generated.ts`, gain
  and speed maps `scripts/sfx/sfx_gain_map.json` and `sfx_speed_map.json`, mix bus
  `sfx_mix_bus.ts`, residency `sfx_residency_core.ts`. Call: **port** (import files as-is,
  generate a Unity audio manifest from the same JSON maps). 4 to 6 crew-days.
- Voice: 578 files under `public/audio/voice`, `voice_manifest.generated.ts`. **Port** as data.
  2 to 3 crew-days.
- Music: 58 streamed tracks (`ZONE_STREAM_URLS` in `src/game/music_tracks.ts`), zone and
  instance selection (`music_zones.ts`, `dungeon_music_zones.ts`, `boss_music_loop.ts`, mix policy
  `music_mix_policy.ts`). The procedural composer (`src/game/music.ts`) stays the authoring
  tool in this repo; the client only streams the renders. Call: **port** the selection logic,
  **drop** the WebAudio synthesis. 4 to 6 crew-days.
- Ambience (`tavern_ambience_core.ts`, `feature/ambience` branch). **Port**. 2 to 3 crew-days.

## 9. i18n

25 English catalog domains (`src/ui/i18n.catalog/`, about 73k lines), 21 locale overlays
(`src/ui/i18n.locales/`), resolved bundles (`src/ui/i18n.resolved.generated/`), the server text
matcher (`localizeServerText`, `src/ui/server_i18n.ts`) and formatters
(`formatNumber`/`formatMoney`/`formatDateTime`). Call: **port by export**. Generate JSON string
tables from the resolved bundles at build time and load them with a small C# `T(key, params)`
that implements the same interpolation (`src/ui/i18n_interpolation.ts`). If the V8 bridge is
used, call the existing TS `t()` and matcher directly. Fonts: CJK and Cyrillic need Unity
TextCore font assets with fallback chains. Estimate: 6 to 10 crew-days. The invariant still
holds: every player string is a key; the C# code adds no English literals.

## 10. Settings and keybinds

`src/game/settings.ts`, `src/game/keybinds*.ts`, gamepad (`gamepad*.ts`), camera settings
(`camera_*.ts`, `mouse_camera_settings.ts`), options UI (`src/ui/options_*.ts`, `keybind_*.ts`,
`settings_transfer*.ts`), graphics presets (`src/game/ui_effects_profile.ts`). Call: **port**
the keybind model and conflict rules (core in V8), **rebuild** input on the Unity Input System
and the graphics presets on URP quality tiers. The fairness rule (`cost-and-risk.md`, risk 10)
binds the new tiers. Estimate: 8 to 12 crew-days.

## 11. Map, minimap and nameplates

Covered in 1a for the map windows. Nameplates (`src/render/nameplate_*.ts`, ~4.7k lines: canvas
painter, cooldown rows, dot rows, threat, heraldry, target highlight, pick): **port** the cores,
**rebuild** the painter as world-space UI or a batched quad renderer. Minimap capture
(`minimap_capture.ts`) is rebuilt as an orthographic camera or a baked map. Estimate:
nameplates 6 to 10 crew-days.

## 12. Chat and social

Chat UI is in 1a. Commands and emotes (`chat`, `emote`, `/` command parsing in
`src/ui/hud/chat/local_command_hooks.ts` and `chat_command_menu.ts`), profanity mask from
`softWords` and `censor`, social frames (`social`, `socialpos`, `who`). Call: **port**.
Estimate: 3 to 5 crew-days beyond the window.

## 13. Tutorial and onboarding

`src/ui/tutorial.ts`, `tutorial_copy.ts`, `tutorial_greeting_*`, the Proving Shore tutorial
island in the world (`src/sim/world.ts`), `profTierTutorial` events, loading tips. Call:
**port** the logic, **rebuild** the presentation; re-capture the tutorial screenshots in the
new art. Character creation (appearance creator) is part of section 3. Estimate: 4 to 6
crew-days.

## 14. Steam, the Electron shell and its updater

| Feature (path) | Call | Crew-days |
|---|---|---|
| Electron shell: window, GPU backend policy, crash guard, diagnostics, prefs, logging (`electron/*.cjs`, ~9.7k lines) | drop; Unity player replaces it (keep diagnostics as a C# log exporter) | 2 to 4 |
| Steamworks: tickets, overlay, achievements mirror (`electron/steam.cjs`, `steam_overlay_guard.cjs`; server `server/steam/`) | rebuild with Steamworks.NET or Facepunch.Steamworks; server side unchanged | 3 to 5 |
| Discord rich presence (`electron/discord_presence*.cjs`) | rebuild with the Discord Social SDK or drop | 1 to 2 |
| Self-hosted updater (`electron/updater.cjs`, `electron-updater`, `docs/desktop-self-hosted-updates.md`) | drop for Steam builds (Steam updates the depot); keep a website build only if the owner wants a non-Steam distribution | 0 to 3 |
| Epic glue (`electron/epic.cjs`, `server/epic/`) | defer | 0 |

## 15. The add-on API and Workshop

The add-on platform lives on the unmerged branch `feature/addon-api` (design
`docs/design/addon-api.md` there; runtime `src/ui/hud/addons/`; SDK `sdk/addons/` with
`wynd-addon-api.d.ts`; Workshop glue `electron/steam_workshop.cjs`). Each add-on is plain JS in
a Web Worker inside an opaque-origin sandboxed iframe with a deny-all CSP; it sees a 10 Hz
snapshot of HUD-visible data plus filtered events, and draws only through validated widget
ops; game actions exist only as host-executed secure buttons.

What happens in Unity:

- The browser sandbox (iframe, CSP, Worker) does not exist in a Unity player. The isolation
  model must be rebuilt on a different primitive.
- Recommended: keep the `wynd` API v1 contract byte-compatible so published add-ons keep
  working, and host each add-on in its own isolated JS context: either a separate V8 isolate
  (PuerTS can create several `JsEnv` instances) with no host bindings except the message
  channel, or the pure C# interpreter Jint, which has no network or file APIs unless the host
  adds them and supports execution limits. The host side keeps the existing pure cores
  (`addon_manifest_core.ts`, `addon_snapshot_core.ts`, `addon_event_filter_core.ts`,
  `addon_widget_core.ts`, `addon_runtime_core.ts`) and replaces only the DOM frames
  controller with a UI Toolkit painter and the worker watchdog with a per-isolate time budget.
- The security proofs must be re-done: `tests/addon_fairness.test.ts` ports as is (it tests
  pure cores), but the browser escape probe `scripts/addon_sandbox_probe.mjs` needs a Unity
  equivalent (a hostile add-on corpus run in a play-mode test).
- Workshop: `electron/steam_workshop.cjs` becomes a Steamworks UGC wrapper in C#.
- Estimate: 15 to 25 crew-days. OWNER DECISION: whether add-ons are a launch feature of the
  Unity client or follow it. Cheapest safe path is "add-ons off in the first Unity builds".

## 16. Also handled by the client today (easy to forget)

| Feature | Call | Crew-days |
|---|---|---|
| Login, realm list, character select and create (`src/main.ts` flows, `char_sort.ts`, `charselect_action.ts`, `realm_population.ts`) | port cores, rebuild screens | 6 to 10 |
| Click targeting, picking, ground-target casting (`castAt`), tab targeting | rebuild (Unity physics raycasts against entity colliders) | 3 to 5 |
| Camera: follow, zoom ceiling, pitch range, teleport camera, mouselook facing (`src/game/camera_*.ts`) | port logic, rebuild on Cinemachine or a custom rig | 4 to 6 |
| Self prediction and reconciliation (`src/render/self_prediction*.ts`) | see `wire-protocol.md` section 9 | 5 to 15 |
| Entity interpolation (`interp_math.ts`, `entity_reanchor.ts`, `snapshot_alpha.ts`) | port | 2 to 3 |
| Mounts, buddies, vehicles, ferries, gliders (render side) | port data, rebuild visuals | 8 to 14 |
| Perf monitor and telemetry (`net_pipeline_stats.ts`, `telemetry` command) | rebuild minimal | 1 to 2 |
| Mobile controls, Capacitor glue, touch HUD layout (`mobile_*.ts`, `src/net/native_*.ts`) | drop (desktop Steam game) | 0 |
| Website landing, guide SPA, admin SPA, editor SPA (`src/guide/`, `src/admin/`, `src/editor/`) | stay on the web, unchanged | 0 |

## Totals by area (hybrid architecture)

| Area | Crew-days (low to high) |
|---|---|
| 1. HUD | 170 to 275 |
| 2. World rendering (launch zones) | 75 to 130 |
| 2b. Dungeons and set pieces | 20 to 40 |
| 3. Characters | 35 to 57 |
| 4. Creatures (code) | 6 to 10 |
| 5. VFX | 50 to 90 |
| 6. Housing | 8 to 14 |
| 7. Gathering and crafting | 6 to 10 |
| 8. Audio | 12 to 18 |
| 9. i18n | 6 to 10 |
| 10. Settings and keybinds | 8 to 12 |
| 11. Nameplates | 6 to 10 |
| 12. Chat and social | 3 to 5 |
| 13. Tutorial | 4 to 6 |
| 14. Steam and shell | 6 to 14 |
| 15. Add-ons | 15 to 25 |
| 16. Other client duties | 29 to 55 |
| Net client and protocol (`wire-protocol.md`, generator and golden frames) | 15 to 25 |
| **Code total** | **about 474 to 806** |

Art re-authoring and the integration and QA overhead are added in `cost-and-risk.md`.
