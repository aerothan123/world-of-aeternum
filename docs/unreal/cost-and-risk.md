# Unreal Engine 5.8 client: cost and risk

Status: planning estimate, written against `feature/player-housing` (merge `64d84727`), before
the vertical slice. Re-base every number after the slice's M8 review (`vertical-slice-plan.md`).
Units: crew-days as defined in `client-feature-inventory.md`.

Why Unreal and not Unity (recorded for the owner): Unity's June 2026 Terms of Service restrict
AI agents and command-line automation to a Unity-designated gateway (the coordinator's reading
of Section 17.2(ff) and the "Authorized Agentic Access" definition), which collides with how
this project's crews work. Epic ships an experimental first-party MCP plugin in UE 5.8 instead
(`vertical-slice-plan.md` section 4.1). Unreal also brings Lumen, Virtual Shadow Maps, Nanite,
PCG and built-in volumetric fog, water and sky, which the Unity plan had to buy or wait for.

## 1. The architecture the estimate assumes

| Option | What runs where | Verdict |
|---|---|---|
| A. **C++ only** | protocol, mirrors, display rules, movement kernel, HUD cores and painters all rewritten in C++ | simplest dependency story, largest port, and every future sim or HUD rule must be written twice |
| B. **Hybrid (recommended, subject to the M5 spike)** | Unreal renders the world and paints the HUD (UMG, Common UI, C++ widget classes); the existing TS presentation cores (wire decoders, `ClientWorld` mirrors, `src/sim` display helpers, the movement kernel, the DOM-free HUD view-cores) run unchanged in an embedded V8 through PuerTS ([Tencent/puerts](https://github.com/Tencent/puerts), BSD-3, supports Unreal) | keeps "one sim, three hosts" literally true, reuses most of the 254k lines of UI logic, makes movement prediction exact; costs a native dependency and a C++ to JS bridge |
| C. Embedded browser HUD | the current DOM HUD in a Web Browser widget (CEF) over the 3D view | maximum reuse, but a second browser engine in the game and today's look kept, which is half of the owner's complaint; not recommended |

The hybrid works because the HUD is already "a pure DOM-free view-core plus a thin painter on
the `PainterHost` seam" (`src/ui/CLAUDE.md`, `src/ui/hud/CLAUDE.md`; reference pair
`src/ui/unit_portrait.ts` and `unit_portrait_painter.ts`).

## 2. Total estimate for the full client port

| Bucket | Hybrid (B) | C++ only (A) | Source |
|---|---|---|---|
| Client code (all areas) | 474 to 806 | 700 to 1,300 | `client-feature-inventory.md` totals; A multiplies the "port (core in V8)" rows by 1.6 to 2 |
| C++ build and iteration overhead (compile, link, shader and cook waits; section 4, risk 5) | 50 to 120 | 80 to 190 | about 10 to 15 percent of code time |
| Art re-authoring to PBR | 175 to 350 | 175 to 350 | below; slightly lower than the Unity plan because Nanite removes most manual LOD work and PCG removes hand scattering |
| Integration, QA, parity, perf, release (15 to 20 percent) | 105 to 255 | 145 to 370 | |
| **Total** | **about 805 to 1,530 crew-days** | **about 1,100 to 2,210 crew-days** | |

Art breakdown: Eastbrook and Vale beyond the slice 25 to 40; the other open-world zones 55 to
110; character bodies, faces and armor 40 to 80; hero creatures 30 to 60; weapons, tools, props
and resources 15 to 40 (Nanite import with a PBR texture pass); HUD art 10 to 20.

Calendar: at five crews in parallel the hybrid is about 160 to 305 working days, roughly 8 to
14 months; owner review bandwidth (art sheets, UI direction, zone sign-off) is the real limit.
A launch-scoped cut (zones 1 to 3, the core HUD, the first dungeon, add-ons deferred) is about
45 to 55 percent of the full total.

The honest alternative, for comparison: putting the art budget into PBR materials and better
lighting inside the existing Three.js client avoids the code and the two-client parity cost, but
its ceiling is lower (no production volumetrics, no real-time GI, and the GPU-scheduler and
shader-link workarounds in `src/render/CLAUDE.md` show how tight the browser budget already is).
That choice is the owner's; this plan prices the Unreal path.

## 3. Unreal licensing and royalties

- **Royalty:** 5 percent of royalty revenue (Royalty Addendum section 3(a)), only once a product
  "directly generates more than $1,000,000 USD in gross revenue" (section 4(b)), and the first
  1,000,000 USD of lifetime gross revenue per product is excluded (Royalty Addendum 4(b)(ii))
  ([Unreal Engine EULA](https://www.unrealengine.com/eula)). Revenue from the Epic Games Store
  (and Fab) is excluded (Royalty Addendum 4(b)(v)), and a reduced 3.5 percent applies to
  products that qualify for "Launch Everywhere with Epic"
  ([EULA change log](https://www.unrealengine.com/eula-change-log/unreal), update 20).
- **What it means here:** Steam sales, the membership subscription and in-game purchases are
  royalty-bearing gross revenue ("revenue from streaming, subscription, or other game-delivery
  services are subject to royalty", change log update 14). Model it: at 3,000,000 USD lifetime
  Steam gross the royalty is 5 percent of 2,000,000, about 100,000 USD. Also ship on the Epic
  Games Store (the repo already has `server/epic/` and `electron/epic.cjs`): those sales are
  royalty-free and may qualify the product for the 3.5 percent rate. Quarterly royalty reports
  are due once over the threshold.
- **The engine itself is free** to use; no per-seat engine fee.
- **Generative-AI clause, FLAG FOR A LAWYER.** EULA section 6(e) forbids using "the Licensed
  Technology as a training input to any Generative AI Program" and "as prompt-based input where
  the Generative AI Program trains on input data", and separately forbids using MetaHuman
  characters and animation curves "to build or enhance any database or training or testing any
  artificial intelligence" ([Unreal Engine EULA](https://www.unrealengine.com/eula); the training
  clause was added in change log update 20, the MetaHuman one in update 21). This project's
  crews are AI agents that read engine source, editor output, logs and screenshots of Unreal
  content, and send them to a model provider. Questions for counsel:
  1. Does sending engine source, editor state or rendered frames to an AI coding agent count as
     "prompt-based input where the Generative AI Program trains on input data"? It turns on
     whether the provider trains on that input, so the account's data-use and retention terms
     (training opt-out, zero retention) are part of the answer.
  2. Does driving the editor through Epic's own MCP plugin change the analysis, given Epic
     ships that plugin for exactly this use?
  3. Do Tripo and image generators count when crews describe Unreal-rendered scenes in prompts,
     or upload screenshots as references? Until answered: never upload Unreal renders, engine
     content, Fab content or MetaHumans to Tripo or any generator.
  Until counsel answers, the conservative operating rule is: crews use only model accounts that
  contractually do not train on inputs, and nothing from the engine or Fab is ever used as
  generator input.

## 4. Top risks and mitigations

| # | Risk | Why it is real here | Mitigation |
|---|---|---|---|
| 1 | **The EULA generative-AI clause** | section 6(e) above; the crew model is AI agents end to end | lawyer review before the slice starts; non-training model accounts only; never feed engine, Fab or MetaHuman content to generators; written crew rule in the Unreal repo `CLAUDE.md` |
| 2 | **HUD size** | 254k lines of UI logic outside i18n data, 76k lines of CSS, 37 `src/ui/*_window.ts` windows plus 44 `src/ui/hud/` domains, a 17k-line `hud.ts`; about 35 percent of the code estimate | the hybrid reuses view-cores; design ONE Common UI style set and component kit first (slice M6); port windows in player-journey order; stage rare windows after launch-critical ones |
| 3 | **Behaviour parity with the Three.js client** | two clients against one protocol double the lockstep surface the TS pins protect (`tests/snapshots.test.ts` W0a, `tests/command_schema.test.ts` W0b); features shipped on the web client during the port must also land in Unreal | DTOs and constants generated from the TS source with a freshness test (`wire-protocol.md` section 10); golden-frame replay comparing TS and C++ mirrors in CI; OWNER DECISION on a freeze: after the slice, client features land Unreal-first and the web client gets fixes only |
| 4 | **Movement feel** | exact-match prediction needs the same doubles and collision data as the server (`docs/design/movement-reconciliation.md`, `tests/movement_latency_baseline.test.ts`) | run the TS kernel in V8 (slice M5 measures); ship interpolated self until it passes; never write prediction into mirrored state (`src/net/CLAUDE.md`, "Never") |
| 5 | **C++ build times** | a UE C++ project's cold build compiles large parts of the engine module graph and its shaders; incremental builds still link big modules; every crew waits on these on one shared PC, and only one heavy build can run at a time there | split the game into small runtime modules (`WyndNet`, `WyndWorld`, `WyndHud`, ...) so a change rebuilds one; use the binary installed engine (no engine source build); Live Coding for iteration; a shared Derived Data Cache on the PC (filled by `DerivedDataCache -fill`) so shaders compile once; move heavy cooks to the GEEKOM; measure cold and incremental times in M0 and budget them (the 50 to 120 crew-day line above) |
| 6 | **Blueprint and other binary assets** | Blueprints, levels, materials and data assets are binary `.uasset` and `.umap`: they do not diff, merge or review, and crews editing them in parallel lose work | logic in C++, editor automation in Python, Blueprints only as thin UMG layout and art parameters; levels GENERATED by script from exported JSON and Level Instances (`asset-pipeline.md` section 5); World Partition One File Per Actor; LFS locking (or Perforce exclusive checkout) on every `.uasset`; one crew owns each content folder per wave |
| 7 | **Project size, Git LFS or Perforce** | `public/` is already about 1.5 GB at web sizes; a Nanite and 4K PBR project plus Fab packs reaches tens of GB; GitHub Free LFS includes 10 GiB storage and 10 GiB bandwidth a month ([GitHub docs](https://docs.github.com/en/billing/concepts/product-billing/git-lfs)); Perforce is free for up to five users ([Perforce](https://www.perforce.com/p/products/vcs/free-version-control-unreal-engine)) | separate private repo; Git LFS with paid data packs to start (crews' workflow is git), or self-hosted Perforce if LFS bandwidth or locking fails; never commit `DerivedDataCache/`, `Intermediate/`, `Saved/` or `Binaries/`; one shared LFS cache per PC |
| 8 | **Steam Deck and min-spec** | Lumen, VSM, volumetric fog and dense Nanite foliage are what a handheld cannot afford; Epic's Low scalability turns Lumen off ([Lumen performance guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-performance-guide-for-unreal-engine)), which changes the whole look; the fairness rule forbids thinning near foliage that conceals characters (`asset-pipeline.md` section 8) | design the Low tier from day one (sky-light fallback, cascaded shadows, height fog, TSR at 50 percent); author near-field foliage cheap enough to stay identical on every tier; test on a Deck after M4 and every milestone after; decide native Linux (Vulkan) versus Proton for the Deck build by measurement |
| 9 | **Character quality** | stylized faces with realistic armor; MetaHumans are realistic humans and carry their own AI restriction; Tripo topology does not deform well around faces | modular armor from the Fab shortlist on the Epic skeleton; one commissioned or licensed stylized base head and body with facial blendshapes; MetaHuman only as a rig base if look-dev in M4 shows it can be stylized enough; Tripo for accessories and blockouts only |
| 10 | **Build size and patch size** | 4K PBR sets and Nanite data are large; SteamPipe diffs in about 1 MB chunks and warns that compression across asset boundaries and reordering assets "spread out changes" ([Steamworks: uploading](https://partner.steamgames.com/doc/sdk/uploading)), with Unreal-specific advice to align pak padding to 1 MB | IoStore containers chunked by zone and feature (Primary Asset Labels), pak padding aligned to 1 MB as Steamworks advises for Unreal, deterministic cooks, new content in new chunks; measure the SteamPipe download of every release candidate and fail a release when a small change makes a large patch |
| 11 | **The add-on platform** | `feature/addon-api` isolates add-ons with a browser Worker in an opaque-origin iframe under a deny-all CSP; none exists in Unreal | keep the `wynd` API v1 contract; host each add-on in its own JS context (a separate V8 isolate or QuickJS) with only the message channel bound; reuse the pure host cores; re-prove the threat table in `docs/design/addon-api.md` with a hostile add-on automation corpus; first Unreal builds ship with add-ons off |
| 12 | **The MCP plugin is experimental** | minimal tool set, limited read-back, unfinished hardening ([StraySpark](https://www.strayspark.studio/blog/epic-official-mcp-plugin-ue5-8-vs-third-party)); a hands-on test left a project unplayable ([Puget Systems](https://www.pugetsystems.com/blog/2026/07/09/unreal-engine-mcp-hands-on-testing-ai-inside-the-editor/)) | the build path never depends on it: every lasting change is a committed Python script or C++ change; MCP sessions run in Sandboxes or throwaway branches |
| 13 | **Engine generation change** | 5.8 is described as the last big update before UE6 ([FeedBagel](https://feedbagel.com/post/unreal-engine-58)) | stay on 5.8 through launch; plan one deliberate UE6 upgrade with `ResavePackages` and the automation suite as the safety net |
| 14 | **Graphics-tier fairness** | the new look adds exactly the features (foliage, fog, darkness) that can hide actionable information differently per tier | the five rules in `asset-pipeline.md` section 8, each pinned by an automation test the way `tests/professions_graphics_fairness.test.ts` pins the web client; tiers read a static preset, never a frame-rate governor |

Also track: whether Unreal's `WebSockets` module negotiates permessage-deflate with context
takeover (else about 9x to 12x more snapshot bandwidth against `server/ws_compression.ts`;
verified in slice M2); CJK and Cyrillic composite fonts for 21 locales; PSO precaching so first
encounters with a material do not hitch.

## 5. What the owner must decide

1. **Go or no-go on the slice** (2 to 3 weeks), knowing the full port is about 805 to 1,530
   crew-days on the hybrid path.
2. **Lawyer review of EULA section 6(e)** before crews start, and which model accounts crews
   may use.
3. **Hybrid (V8 embedded) versus C++ only,** after the M5 measurement.
4. **The Unreal repo:** separate private repo (recommended); Git LFS with paid data versus
   Perforce.
5. **Fab purchases** from `fab-shortlist.md` (299.95 USD on the Personal tier, valid while
   studio revenue stays at or under 100,000 USD a year).
6. **Distribution:** also release on the Epic Games Store (royalty-free sales and possibly the
   3.5 percent rate) or Steam only.
7. **Desktop origin:** reuse `app://worldofclaudecraft` for the Unreal client or add a new
   allowed origin (`wire-protocol.md` section 1.1).
8. **Steam login:** merge `feature/steam-platform` before the Unreal client relies on it.
9. **Feature freeze policy** for the web client during the port (risk 3).
10. **Add-ons at Unreal launch,** or deferred (risk 11).
11. **Character base:** commission or license a stylized head and body (risk 9).
