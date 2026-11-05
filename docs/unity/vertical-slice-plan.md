# Unity vertical slice plan (2 to 3 weeks)

Status: plan only. Unity is not installed yet. Written against `feature/player-housing`
(merge `64d84727`). Goal: give the owner a side-by-side answer to "can a Unity client hit the
detailed stylized look while speaking our existing server?" before committing to the full port
(`cost-and-risk.md`).

## 1. Scope

In scope:

- Eastbrook (the starter town) and Eastbrook Vale around it (zone 1, `src/sim/content/zone1.ts`,
  layout `EASTBROOK_LAYOUT` in `src/sim/eastbrook_layout.ts`), out to Mirror Lake and the Wolf
  Run.
- One playable character (one class, one modular body), walking, running, jumping, turning,
  with the camera.
- A real server connection: REST login, world auth, snapshots, other players and mobs visible
  and animated, chat.
- A minimal HUD: player frame (health and resource), target frame (health, cast bar), chat
  (receive and send).
- Day and night lighting at the detailed stylized target, driven by the server clock.

Out of scope for the slice: combat abilities beyond auto-attack display, inventory and every
other window, dungeons, add-ons, audio beyond footsteps and the town music track, Steam
integration, localization beyond loading the English catalog through keys.

Rules that still apply: the server stays unchanged except, if the owner chooses it, the one-line
desktop origin entry (`wire-protocol.md` section 1.1); no em dashes, en dashes or emojis; every
player-visible string comes from an exported i18n key; the fairness rule
(`asset-pipeline.md` section 8).

## 2. Milestones

Day numbers assume one crew on the slice full time, starting the day Unity is installed. Each
milestone has one pass or fail check that a crew can run and report; a failed check stops the
next dependent milestone, never silently passes.

| # | Days | Milestone | Pass or fail check |
|---|---|---|---|
| M0 | 1 to 2 | **Toolchain.** Unity 6.3 LTS with URP on AerothanPC, the private Unity repo with LFS, the `.ps1` runners (section 4), an empty bootstrap scene built by code | `run_build.ps1` produces `Build/Win64/Wyndlewood.exe` from `-batchmode -executeMethod`, and `run_tests.ps1` writes an NUnit XML with one passing EditMode test; both exit 0 |
| M1 | 2 to 4 | **World export.** `scripts/unity/export_world.mjs` in this repo bakes the zone 1 heightfield (0.5 yd grid), water circles, roads and collider-backed placements; the render-only dressing is dumped from the running web client (`asset-pipeline.md` section 5) | a Vitest asserts baked heights equal `terrainHeight` within 1 cm at 10,000 random points; in Unity the generated terrain and placed blockout prefabs line up with a web screenshot from the same camera (overlay diff under 0.5 percent of pixels off by more than 8 px) |
| M2 | 3 to 6 | **Network spine.** C# REST login, `auth-world-48` handshake with every capability field, `hello`, `snap` decode (identity, dynamic, `keep`, prune, self scalars, `ack`, `ackCt`), `events` passthrough, reconnect with the jittered backoff; DTOs generated from the protocol export (`wire-protocol.md` section 10) | golden-frame test: 2 minutes of recorded frames from a local server replayed through the TS `ClientWorld.applySnapshot` and the C# decoder give identical mirrored entity state (positions, hp, kind, name, auras) on every frame; a live connect to a local `npm run server` reaches `hello` and holds 10 minutes with no `error` frame |
| M3 | 5 to 9 | **Walking player.** 20 Hz v2 `input` frames with `seq` and `ct`, facing from mouselook, self drawn interpolated (no prediction, the `?nopredict` model), camera rig, locomotion Animator mapped from the exported `ClipMap` | walk a scripted route (town gate to Mirror Lake and back): the server position at each `ackCt` stays within 0.05 yd of the web client's replay of the same input frames; zero `message rate exceeded` kicks; the base state shown matches `desiredBaseState` for the same speed and input on 100 percent of sampled frames |
| M4 | 6 to 12 | **Look development.** URP Forward+, APV with day and night lighting scenarios, volumetric fog, water, PBR terrain layers, dense foliage, Eastbrook's core (the gate, the square, about ten buildings, the bank, the inn) in PBR from the shortlist packs and crew re-texture passes, warm grade LUT; time of day follows the server `time` through a port of `src/render/day_night_core.ts` | on AerothanPC (RTX class) at 1440p High: median frame time under 16.7 ms and 99th percentile under 25 ms over a 60 s fly-through of the square at noon and at night, captured with the Unity Profiler in a development build; the screenshot set in section 5 is produced |
| M5 | 8 to 12 | **Embedding spike (decides the architecture).** PuerTS with the V8 backend runs an esbuild bundle of `src/sim/player_motion.ts` and its imports inside the player; replay the recorded inputs of `tests/movement_latency_baseline.test.ts` scenarios | exact-match (bit-identical pose) against the Node replay on at least 99.9 percent of ticks, and under 0.2 ms per kernel step on AerothanPC; result written up as go or no-go for the hybrid architecture in `cost-and-risk.md` |
| M6 | 10 to 15 | **Minimal HUD and UI direction.** UI Toolkit theme (one USS token file), player frame, target frame with cast bar, chat frame with send; strings from the exported English catalog by key; the visual direction tile for owner sign-off before any other window | target a wolf another client is attacking and watch its health fall and its cast bar run; send a chat line from Unity and read it in the web client and back; a scan of the C# UI code finds no player-visible English literal |
| M7 | 14 to 18 | **The living world.** Other players (modular bodies from `app`), mobs (zone 1 creatures from `MOBS`), interest enter and leave, per-entity interpolation on its own cadence (`reanchorDecision`), nameplates | with 20 local bot players plus the town NPCs and nearby mobs: entities appear inside 90 yd and disappear past 100 yd (NPCs 120 and 130), no entity lingers after it leaves `ents` and `keep`, frame-time budget of M4 still met |
| M8 | 17 to 21 | **Owner review pack.** Screenshot pairs, a 2 minute capture video, the perf report, the M5 decision, and an updated estimate | the owner can answer "go, change, or stop" from the pack alone |

Parallelism: M1 and M2 can run on two crews; M4 is art-heavy and can start on M1's blockout.
With two crews the slice fits in about 2 weeks; with one, about 3.

## 3. Repo layout: a separate private repo

Recommendation: **a separate private repository** (proposed `aerothan123/wyndlewood-unity`)
with Git LFS, not a `unity/` folder in this monorepo. Reasons, all checked:

1. **This repo is public.** `gh api repos/aerothan123/world-of-aeternum` reports
   `"visibility":"public"`, a fork of `levy-street/world-of-claudecraft`. Paid Asset Store
   content may only be distributed embedded in a product; the EULA FAQ says a product is not
   "incorporated" if it lets users "extract or download assets separately"
   ([Asset Store EULA FAQ](https://assetstore.unity.com/browse/eula-faq)). Committing purchased
   packs to a public repository would publish their source files. Community consensus is that
   private repositories are fine and public ones are not
   ([Unity Discussions](https://discussions.unity.com/t/using-git-for-paid-for-assets-if-set-the-repository-to-private/879286)).
2. **No LFS today.** `.gitattributes` has no `filter=lfs` line, and the repo already weighs about
   11 GB on GitHub (`size` from the same API call). Adding a Unity project's textures, FBX and
   scenes would grow every clone, including the worker clones on both PCs.
3. **Different toolchains and gates.** The pre-push floor here runs `tsc`, Vitest guard tests and
   Biome; none of that applies to C#, and a Unity import of a large folder would slow every
   crew's `git status`.

What crosses between the repos is GENERATED and pinned:

- This repo owns the exporters (`scripts/unity/export_protocol.mjs`, `export_content.mjs`,
  `export_world.mjs`, `normalize_glb.mjs`) and their freshness tests.
- The Unity repo has `Assets/Generated/` (protocol DTOs, content JSON, i18n tables, world
  data, normalized GLBs) written only by an import script that records the source commit in
  `Assets/Generated/SOURCE_COMMIT`. A Unity EditMode test fails when `SOURCE_COMMIT` differs from
  the pinned TS commit in `Packages/wyndlewood-source.json`.
- `ONLINE_WORLD_LAYOUT_VERSION` travels with the protocol export, so a Unity build is always
  stamped with the epoch of the TS commit it was generated from.

LFS budget: GitHub Free includes 10 GiB of LFS storage and 10 GiB of bandwidth per month
([GitHub docs](https://docs.github.com/en/billing/concepts/product-billing/git-lfs)). A Unity
project with 2K PBR sets passes that within weeks, and every crew clone or CI checkout counts
against bandwidth. OWNER DECISION: pay for LFS data (billed per GiB beyond the quota), or use
Unity Version Control for the binary-heavy Unity repo. Either way, keep crew clones shallow and
use one shared LFS cache per PC.

Layout of the Unity repo:

```
wyndlewood-unity/
  Assets/
    Generated/            # written by the import script only, never by hand
    Wyndlewood/
      Runtime/            # C#: Net/, World/, Characters/, Hud/, Audio/, Bridge/ (V8)
      Editor/             # builders: BuildScripts.cs, SceneGenerator.cs, AssetPostprocessors
      Prefabs/            # every placed thing is a prefab
      Art/                # crew and purchased art, by category, with CREDITS rows
      Settings/           # URP assets, quality tiers, Volume profiles
    ThirdParty/           # Asset Store packs, untouched
  Packages/manifest.json
  Tests/EditMode, Tests/PlayMode
  tools/                  # run_build.ps1, run_tests.ps1, run_capture.ps1, import_generated.ps1
  CREDITS.md, CLAUDE.md
```

Scenes: one tiny bootstrap scene committed; zone scenes are GENERATED by
`SceneGenerator.cs` from `Assets/Generated/world/*.json` plus prefabs, and are not committed
(or committed only as a build cache). Unity's YAML scene merge is fragile, so crews never
hand-edit `.unity` files (`cost-and-risk.md`, risk 6). Force text serialization and visible meta
files in Editor settings.

## 4. Driving Unity headlessly on the owner's Windows PC

Follow the shared crew rules: long jobs run hidden through a `.ps1`, log to a file, and are
polled; refresh `PATH` first; at most one Unity instance at a time on AerothanPC because other
crews share it.

Build (`tools/run_build.ps1`):

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$unity = 'C:\Program Files\Unity\Hub\Editor\<6000.3.x>\Editor\Unity.exe'
& $unity -batchmode -nographics -quit `
  -projectPath C:\Users\cdero\Apps\wyndlewood-unity `
  -executeMethod Wyndlewood.Editor.BuildScripts.BuildWin64 `
  -logFile C:\Users\cdero\Apps\wyndlewood-unity\Logs\build.log
exit $LASTEXITCODE
```

`BuildScripts.BuildWin64` calls `BuildPipeline.BuildPlayer` with an explicit scene list and
`EditorApplication.Exit(1)` on any error, so the exit code is honest.

Tests (`tools/run_tests.ps1`), Unity Test Framework from the CLI
([UTF command line reference](https://docs.unity3d.com/Packages/com.unity.test-framework@1.4/manual/reference-command-line.html)):

```powershell
& $unity -batchmode -nographics -projectPath <path> -runTests -testPlatform EditMode `
  -testResults <path>\Logs\editmode.xml -logFile <path>\Logs\editmode.log
& $unity -batchmode -projectPath <path> -runTests -testPlatform PlayMode `
  -testResults <path>\Logs\playmode.xml -logFile <path>\Logs\playmode.log
```

Notes: leave `-quit` off a `-runTests` run (the test runner exits by itself when it finishes, and
an early `-quit` can end the editor before the tests run);
use `-testFilter` for single suites while iterating, the same discipline as single Vitest files;
PlayMode tests that render need a GPU, so they run without `-nographics`. Parse the NUnit XML
(`result="Passed"` counts) in the runner and print a one-line summary for the crew to poll.

Screenshots (`tools/run_capture.ps1`): run the BUILT player with a capture flag, for example
`Wyndlewood.exe -screen-width 2560 -screen-height 1440 -capture-tour bookmarks.json -capture-out
<dir>`, where a `CaptureTour` component teleports the camera through fixed bookmarks, sets the
time of day, hides or shows the HUD, waits for streaming and APV to settle, and writes PNGs.
Batchmode with `-nographics` cannot render, so captures always use a windowed player.

Licensing for batchmode: the Unity Hub must be signed in once on each machine so the
editor finds an activated Personal or Pro entitlement; a fresh machine fails batchmode until
then. This is an owner step (an account login), not a crew step.

## 5. The screenshots that will show the owner the difference

Captured from the SAME camera bookmarks in the current web client (`scripts/pr_screenshots.mjs`
and the `pr-screenshots` skill) and in the Unity slice, labeled side by side, at 2560x1440, the
web client on its Refined preset at high, HUD hidden unless stated:

| # | Bookmark | Times |
|---|---|---|
| 1 | Eastbrook gate, street level, looking into town | noon, golden hour, night |
| 2 | The town square from a second-floor height (the "postcard") | noon, golden hour, night |
| 3 | Close-up material shot: a timber-frame wall, cobbles, a barrel, a lamp | noon, night (lamp lit) |
| 4 | Vale meadow toward Mirror Lake, foliage and water | noon, golden hour |
| 5 | Forest edge on the Wolf Run with fog and light shafts | morning fog |
| 6 | The player character, three-quarter view, in town | noon |
| 7 | Gameplay frame with the minimal HUD visible, targeting a wolf | noon |

Plus a 2 minute capture of the M3 walking route and the M7 crowd, and one perf overlay frame
per bookmark. Images are kept in the Unity repo (`Docs/screenshots/slice/`) and copied into this
repo under `docs/screenshots/unity-slice/` only when a PR here needs them.

## 6. What the owner provides

- Installs Unity Hub and Unity 6.3 LTS with the Windows and Linux build modules, signs in.
- Creates the private repo and decides LFS versus Unity Version Control.
- Buys the shortlist packs (`asset-store-shortlist.md`) after viewing their screenshots.
- Decides the desktop origin question (`wire-protocol.md` section 1.1).
- Reviews the M6 UI direction tile before any other window is built.
