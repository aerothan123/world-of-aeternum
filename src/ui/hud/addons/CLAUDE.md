# src/ui/hud/addons/: the player add-on platform

The contract is `docs/design/addon-api.md`; read it before changing anything here.
Player add-ons are UNTRUSTED code from the Steam Workshop: every change in this
directory is a security change.

## Shape
- Pure cores (registered in `UI_PURE_CORES`): `addon_manifest_core.ts` (manifest,
  API version, load order), `addon_snapshot_core.ts` (the HUD-visible world snapshot),
  `addon_event_filter_core.ts` (own and party combat, received chat),
  `addon_widget_core.ts` (UI op validation, caps, secure-button combat lockdown),
  `addon_runtime_core.ts` (budgets, watchdog, persisted state, worker message shapes),
  `addons_window_view.ts` (the Addons window model).
- Host adapters (registered in `UI_DOM_MODULES`): `addon_runtime_controller.ts`
  (spawning, routing, budgets), `addon_frames_controller.ts` (the `#addon-layer` DOM),
  `addons_window_controller.ts`, `addons_mount.ts` (Hud's composition point),
  `addon_worker_prelude.ts` (worker-side code, serialized with `toString()`).
- `addon_sandbox_frame.ts` owns the sandboxed iframe; `public/addon-sandbox/bootstrap.js`
  runs inside it. `addon_sources.ts` lists packages (dev glob, desktop IPC).

## Rules
- **Read-only, HUD-visible data.** A new snapshot field or event must be something the
  player's own HUD already shows; extend `tests/addon_fairness.test.ts` in the same change.
- **No action ops.** The worker vocabulary (`parseWorkerMessage`) and the UI op set
  (`parseAddonUiOp`) stay closed. The only action path is a DECLARED secure button run by
  the host on a trusted click (`ADDON_SECURE_ACTIONS`); never add an op that calls an
  `IWorld` command, and never let the add-on choose the action at click time.
- **No URL, CSS or HTML channel** in widget props; colors go through `sanitizeAddonColor`.
- **The prelude is self-contained**: no imports, no module constants inside
  `addonWorkerMain` (it is evaluated in a fresh realm). `ADDON_WORKER_BLOCKED_GLOBALS`
  mirrors its inner list and the prelude test checks every name.
- **The bootstrap and `addonWorkerScript` build the same single worker script**; change
  both together (no `importScripts`: the desktop CSP forbids `blob:` script imports).
- **Sandbox changes run the real-browser probe**: `node scripts/addon_sandbox_probe.mjs`
  must print "SANDBOX HELD in both modes".
- The Electron side (`electron/addons.cjs`, `electron/steam_workshop.cjs`) mirrors the
  manifest limits; `tests/electron_addons.test.ts` pins them equal.
