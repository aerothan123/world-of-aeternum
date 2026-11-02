# Self-hosted desktop auto-updates (Windows, own droplet)

Companion to `docs/desktop-release.md` (the official CI-published release). This
runbook covers a build baked with YOUR OWN API origin (a non-production origin,
for example `https://104-248-71-233.sslip.io`) that auto-updates from a feed you
host yourself on the same server, with one command doing the build, the version
stamp and the upload.

## Release in one command (PowerShell on the build PC)

```powershell
node scripts/release_desktop.mjs
```

That is the whole release. It:

1. GETs the live feed (`<origin>/downloads/desktop/dev.yml`) to learn the
   version installed apps currently see (a 404 means "first release").
2. Picks the version (below) and runs `node scripts/electron-build.mjs build website`
   with `VITE_DESKTOP_API_ORIGIN=<origin>`, `WOC_DESKTOP_UPDATE_URL=<origin>/downloads/desktop`
   and `WOC_DESKTOP_VERSION=<version>`.
3. Reads the emitted `release/dev.yml`, collects the installer it names plus its
   `.blockmap`, and `scp`s the three files into `/var/www/downloads/desktop/` on
   the droplet (`ssh -i ~/.ssh/projecth_do root@104.248.71.233`, the same key and
   host you use by hand).
4. `cp`s the versioned installer over `/var/www/downloads/Project-H-Setup.exe`
   so the link friends already have keeps serving the newest build.
5. Prints the feed URL, the versioned installer URL and the friends' link.

Flags (every default matches the droplet):

| Flag | Default | Meaning |
|---|---|---|
| `--origin URL` | `https://104-248-71-233.sslip.io` | The API origin baked into the build; also the host the feed is derived under. |
| `--version x.y.z` | derived (below) | Explicit version stamp; must be semver and greater than the live feed. |
| `--host user@ip` | `root@104.248.71.233` | ssh/scp target. |
| `--key PATH` | `~/.ssh/projecth_do` | ssh identity file. |
| `--remote-dir DIR` | `/var/www/downloads/desktop` | Feed directory on the host; the friends' link lives one level up. |
| `--installer-name NAME` | `Project-H-Setup.exe` | The stable link name. |
| `--feed-url URL` | derived | Override the feed URL (the build bakes it too; keep both the same). |
| `--dry-run` | off | Print the version, the build env and every ssh/scp command; run nothing. |

Start with `node scripts/release_desktop.mjs --dry-run` once to see the plan.
The script needs `ssh`/`scp` on PATH (Windows OpenSSH ships them) and spawns
every command without a shell, so a checkout path with spaces is fine. There is
deliberately no npm alias and no `package.json` version bump: `package.json` is
a fingerprint input for shipped GLB assets (`scripts/CLAUDE.md`), so the version
is stamped at build time instead. Pure planning (flags, version choice, feed
parsing, the exact argv) lives in `scripts/lib/release_desktop_plan.mjs`,
pinned by `tests/release_desktop_plan.test.ts`.

## How the version is chosen

electron-updater installs only a STRICTLY greater semver, so each release must
be newer than the last one the feed served. Without `--version`, the script
takes whichever is newer of the repo's `package.json` version and the live
feed's version, and bumps its patch number (`chooseReleaseVersion`):

- first release, `package.json` at `0.45.6`: `0.45.7`;
- feed at `0.45.9`, `package.json` still `0.45.6`: `0.45.10`;
- a release branch bumps `package.json` to `0.46.0`, feed at `0.45.9`: `0.46.1`.

`--version` must be semver (`x.y.z`, no `v`, no date) and greater than the feed
version; the build refuses anything else (`isSemver` in
`scripts/electron-builder-config.mjs`). The stamp lands in electron-builder's
`extraMetadata.version`, which becomes the packaged app's `package.json`
version, the artifact names (`world-of-claudecraft-<version>-win-x64.exe`), the
`version:` line in `dev.yml`, and what the running app compares against. The
repo's own `package.json` is never touched.

## How the feed and channel work

- Channel: a build baked with ANY non-production origin publishes and reads the
  `dev` update channel (`updateChannelForOrigin` in `electron/update_guard.cjs`),
  so its feed file is `dev.yml` and production installs never request it. The
  production origin keeps the official `latest` feed on the official host,
  unchanged.
- Feed URL: `resolveUpdateFeedUrl` (`scripts/electron-builder-config.mjs`) sets
  `publish.url`: an explicit `WOC_DESKTOP_UPDATE_URL` wins; otherwise a
  non-production origin derives `<origin>/downloads/desktop`, and the production
  origin keeps `package.json`'s `build.publish.url`. electron-builder writes
  `publish.url` + `channel` into the packaged `resources/app-update.yml`, and
  that file is what electron-updater reads at runtime, so the URL the app polls
  is by construction the URL the build published to. `electron/updater.cjs`
  re-derives the channel from the baked origin on top of it.
- Files on the host (`/var/www/downloads/desktop/`, served by Caddy's
  `handle_path /downloads/*`): `dev.yml` (version, sha512, artifact name, plus
  the `wocApiOrigin` stamp the build appends), `world-of-claudecraft-<version>-win-x64.exe`
  and its `.exe.blockmap`. Old installers and blockmaps stay there: electron-updater
  uses the previous version's blockmap for a differential download when both are
  present and falls back to a full download when not.
- Runtime: the app checks 15 s after launch and every 4 hours, refuses a feed
  entry whose `wocApiOrigin` stamp is not its own origin (cross-track guard,
  loud `[updater] REFUSED` in `main.log`), downloads a passing one in the
  background, shows the restart card, and otherwise installs on quit.
- The friends' link: `/var/www/downloads/Project-H-Setup.exe` is a byte copy of
  the newest versioned installer, so a fresh download and an auto-update land on
  the same build.

## Unsigned installs and updates (the finding)

The owner's build is unsigned (no `CSC_LINK`, `WIN_SIGN_*` or `AZURE_KEY_VAULT_*`
in the build env). electron-updater (`electron-updater` 6.8.x, `out/NsisUpdater.js`
`verifySignature`) verifies an update's Authenticode signature ONLY when the
packaged `app-update.yml` carries a `publisherName`; when that key is absent it
returns `null` and skips verification entirely. electron-builder
(`app-builder-lib` `out/publish/PublishManager.js`) writes `publisherName`
only from a configured certificate (`win.signtoolOptions.publisherName`,
`win.azureSignOptions.publisherName`, or the subject of a `CSC_LINK`
certificate). With none of those, the file has no `publisherName`, so an
unsigned update over an unsigned install is accepted as is: no
`verifyUpdateCodeSignature: false` flag is needed, and none is wired. The
flip side: if you ever sign the build, keep signing it, because a signed
install WILL verify the next installer's signature and refuse an unsigned one.

The usual unsigned caveats still apply to the first install: SmartScreen's
"unknown publisher" prompt on the downloaded installer, and the in-app update
later runs the same NSIS installer silently from the updater cache.

## Rollback

The feed is a plain file, so rolling back is re-pointing it:

1. The older release's `dev.yml`, installer and blockmap are still in
   `/var/www/downloads/desktop/` (the script never deletes). Keep a copy of each
   release's `dev.yml` as `dev-<version>.yml` if you want it one `cp` away.
2. On the droplet, copy the older feed file back over the live one and refresh
   the friends' link:

   ```sh
   cp /var/www/downloads/desktop/dev-0.45.8.yml /var/www/downloads/desktop/dev.yml
   cp /var/www/downloads/desktop/world-of-claudecraft-0.45.8-win-x64.exe /var/www/downloads/Project-H-Setup.exe
   ```

3. Installs already on the newer build will NOT downgrade (the updater sets
   `allowDowngrade = false`): they stay where they are until the next release,
   so after a rollback ship the fix as a NEW, higher version
   (`--version` greater than the bad one, or just the default bump, which reads
   the live feed and so bumps past whatever `dev.yml` currently says).

## Caveats

- The first self-hosted build must be installed by hand: installs made before
  this feed existed point at the official feed host and never see `dev.yml`.
- The build runs `npm run build` and electron-builder, so it takes as long as
  `pnpm run electron:build` did; run it from the repo root on the Windows PC.
- Caddy must keep serving `/downloads/*` with Range support (its default
  `file_server` does) for differential downloads; a full download works
  regardless.
