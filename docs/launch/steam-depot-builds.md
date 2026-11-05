# Steam depot builds (Windows)

How a Wyndlewood Windows build gets from this repo onto Steam. Wyndlewood is
desktop-only on Windows, so the Steam app has ONE depot. The general desktop
runbook is `docs/desktop-release.md` (the "Steam" section); this page is the
SteamPipe step. Everything here runs on the build PC; nothing touches the game
server.

## What you need once

From `docs/launch/steamworks-setup.md`: the app id, the Windows depot id, and a
Steamworks build account (a separate Steam account with only the "Edit App
Metadata" and "Publish App Changes To Steam" permissions, Steam Guard on).
`steamcmd` installed (https://developer.valvesoftware.com/wiki/SteamCMD) and on
`PATH`, or its full path in `STEAMCMD`.

Set these in the build shell (never commit them; app and depot ids are public,
but keep them in one place):

| Variable | Meaning |
|---|---|
| `WOC_STEAM_APP_ID` | the app id stamped into the build (`npm run electron:build:steam` refuses without it) |
| `STEAM_APP_ID` | the app id the upload targets (normally the same number) |
| `STEAM_DEPOT_ID_WIN` | the Windows depot id |
| `STEAM_BUILD_USER` | the build account's login name (NOT its password) |

## Build and upload

```powershell
$env:WOC_STEAM_APP_ID = '<appid>'
npm run electron:build:steam            # writes release-steam/win-unpacked/
node scripts/steam_depot_build.mjs      # dry run: renders the VDFs, prints the steamcmd line
node scripts/steam_depot_build.mjs --set-live beta --run   # uploads and sets the beta branch live
```

`scripts/steam_depot_build.mjs` renders `build/steam/app_build.vdf.template` and
`build/steam/depot_build_win.vdf.template` into `release-steam/steampipe/` and
spawns `steamcmd +login <build user> +run_app_build <app_build.vdf> +quit`.
steamcmd prompts for the password and the Steam Guard code the first time and
caches the login after that. There is deliberately no password flag.

Rules the planner enforces (`scripts/lib/steam_depot_plan.mjs`, pinned by
`tests/steam_depot_plan.test.ts`):
- app and depot ids must be numeric;
- `--set-live default` is refused: promote a build to the public branch in the
  Steamworks partner site (SteamPipe > Builds) only after a smoke test on `beta`;
- `--preview` renders a preview build (no upload of content, a manifest dry run);
- `steam_appid.txt` must not be in the content root, and `*.pdb` never ships.

## The Playtest app

Steam Playtest is a separate app id with its own depot. Run the same commands
with `--app-id <playtest appid> --depot-id <playtest depot id>`. The Playtest
build must be stamped with ITS app id too (`WOC_STEAM_APP_ID=<playtest appid>`),
or link and login tickets verify against the wrong app. The server then needs
the matching `STEAM_APP_ID`: run the Playtest against its own realm, or accept
that one server verifies one app id.

## Launch option

Steamworks > Installation > General: one launch option, executable
`Wyndlewood.exe` (the product name in the build; check `win-unpacked/` for the
exact file name), OS Windows, 64-bit. Optional second launch option for players
whose GPU misbehaves with the overlay: same executable, arguments
`--no-steam-overlay`, description "Start without the Steam overlay".

## What the Steam build does differently

- **No in-app updater.** Steam delivers updates. The Steam channel has no
  publish feed and the runtime keeps the updater off (`electron/desktop_config.cjs`
  `updaterAllowed`, pinned by `tests/electron_desktop_config.test.ts` and
  `tests/electron_builder_config.test.ts`). The self-hosted updater stays for
  website builds (`docs/desktop-self-hosted-updates.md`).
- **Steam overlay hooked** on Windows (`electron/steam_overlay.cjs`): the
  steamworks.js helper switches to in-process GPU without direct composition,
  which the overlay needs. `--no-steam-overlay` turns it off per launch.
  The Steam API initializes at ready so the overlay sees a live session.
- **Steam login** (`server/steam_login.ts`) and the account link both use
  tickets the server verifies; the app id in the build and on the server must
  match.

## Rolling back

SteamPipe > Builds in the partner site: set an older build live on the branch.
Players download it like an update. The server must still accept that client
(see the minimum shell version in `docs/launch/live-ops-runbook.md`).
