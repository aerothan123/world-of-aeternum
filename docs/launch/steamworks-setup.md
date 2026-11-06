# Steamworks setup: the owner's checklist

Everything that has to be done by hand in the Steamworks partner site
(https://partner.steamgames.com) for Wyndlewood's Early Access launch, in
order. The code side (Steam login, the depot upload script, the overlay, the
achievement mirror, the wipe tool) is already on `feature/steam-platform`;
this list is what only the account owner can do. Tick each box in a copy of
this file or the tracking issue.

Values to write down as you go (none of them go in git; ids are public, the
key and passwords are secrets):

| Value | Where it ends up |
|---|---|
| App ID (main game) | build env `WOC_STEAM_APP_ID` + `STEAM_APP_ID`; server env `STEAM_APP_ID` |
| Windows depot ID | build env `STEAM_DEPOT_ID_WIN` |
| Playtest App ID + its depot ID | the same variables for Playtest uploads |
| Publisher Web API key | server env `STEAM_WEB_API_KEY` ONLY (secret) |
| Build account login | build PC `STEAM_BUILD_USER` (its password is typed into steamcmd, never stored) |

## 1. Account and payment (one time)

- [ ] Steamworks partner account in the name of the publishing entity (the
      same legal entity the privacy policy and terms name).
- [ ] Tax interview and bank details completed (payouts and the app fee need them).
- [ ] Pay the Steam Direct fee for one app (USD 100, recouped after the game
      earns USD 1,000). Note the date: Valve requires a waiting period after
      payment before the app can release, so do this at least 30 days before
      the target launch.
- [ ] Turn on Steam Guard (mobile authenticator) for every account with partner access.

## 2. Create the app

- [ ] Create the app ("Wyndlewood") and write down the **App ID**.
- [ ] App type: Game. Supported OS: **Windows only**, 64-bit.
- [ ] SteamPipe > Depots: one depot, Windows 64-bit. Write down the **depot ID**.
      Remove any default macOS or Linux depots.
- [ ] Installation > General: launch option `<productName>.exe` (see
      `docs/launch/steam-depot-builds.md`), plus an optional second option with
      arguments `--no-steam-overlay` described "Start without the Steam overlay".
- [ ] Packages: confirm the default store package contains the Windows depot.
- [ ] DRM: do NOT apply the Steam DRM wrapper (`docs/desktop-release.md`, Steam).
- [ ] Steam Cloud: leave OFF (saves live on the server).
- [ ] Publish the app configuration (Publish tab) after each change.

## 3. Web API key and server config

- [ ] Users & Permissions > Manage Groups > your publisher group > create a
      **Web API key**. It is a publisher key: it only works on
      `partner.steam-api.com` and must never reach a client or a log.
- [ ] Give it to the server as `STEAM_WEB_API_KEY`, with `STEAM_ENABLED=1` and
      `STEAM_APP_ID=<app id>` (`DEPLOY.md`, "Steam link + achievement mirror").
      Steam login turns on with it (`STEAM_LOGIN_ENABLED=0` keeps link-only).
- [ ] After the first server deploy with these, check `GET /api/status` shows
      `"steam":{"enabled":true,"login":true}`.

## 4. Build account and first upload

- [ ] Create a separate Steam account for builds; give it only "Edit App
      Metadata" and "Publish App Changes To Steam" for this app.
- [ ] On the build PC: install steamcmd, then follow
      `docs/launch/steam-depot-builds.md` (build with `WOC_STEAM_APP_ID`, dry
      run `node scripts/steam_depot_build.mjs`, upload with `--set-live beta`).
- [ ] SteamPipe > Builds: confirm the build landed; install it from the `beta`
      branch on a clean Windows PC and test: Continue with Steam signs in with
      no account, Shift+Tab opens the overlay, a deed unlocks its achievement.
- [ ] Promote to `default` only for release (by hand; the script refuses to).

## 5. Achievements

- [ ] Stats & Achievements > Achievements: create one achievement per entry in
      `server/steam/achievement_map.ts`, with the API name EXACTLY as the map
      spells it (`ACH_...`). A shipped API name is permanent: never rename one.
- [ ] Each needs a display name, description and two 64x64 icons (achieved and
      unachieved). Use original Wyndlewood art only.
- [ ] Set them "Set By: Official GS" (game server): the server's Book of Deeds
      mirror unlocks them through the Web API, never the client.
- [ ] Publish.

## 6. Steam Workshop (for the addon crew)

- [ ] Workshop > General: enable Steam Workshop for the app.
- [ ] Choose the visibility model (start with "items visible to everyone, uploaded
      by any owner"); turn on the legal agreement requirement for uploaders.
- [ ] Workshop > Tags: create the addon categories the addon crew asks for
      (for example UI, Combat, Maps, Social).
- [ ] Decide moderation: who can ban items, and an email for reports.
- [ ] Publish, then give the addon crew the App ID. (Workshop uploads use the
      same App ID; no extra depot is needed.)

## 7. Steam Playtest (the free stress test before Early Access)

- [ ] On the app's landing page: create the **Playtest** app. Write down its
      App ID and create its Windows depot.
- [ ] Choose "open" (anyone can request access) or "limited" signups; set a cap.
- [ ] Upload a build with the Playtest ids (`steam-depot-builds.md`, "The
      Playtest app"). The server it points at needs the Playtest App ID in
      `STEAM_APP_ID`, so run the Playtest realm separately or accept that one
      server verifies one app.
- [ ] Use the Playtest weekend as the load and wipe rehearsal: run
      `scripts/launch_wipe.ts` against a COPY of the Playtest database.

## 8. Content survey (age ratings and AI disclosure)

- [ ] Store Admin > Content Survey: answer every question honestly (fantasy
      violence, blood, online interaction with other players, user-generated
      content through chat and Workshop). This generates the regional ratings
      (IARC, PEGI, USK, and others).
- [ ] **AI-generated content disclosure.** Wyndlewood uses pre-generated AI
      content made during development: 3D models (Tripo), concept and texture
      images, and generated audio (ElevenLabs). Describe each kind in the
      "Pre-Generated" section and state that every asset is reviewed by the
      developer before it ships and that the tools were used on paid plans
      with commercial rights. Fix any free-tier asset first: the audit
      (`docs/launch/early-access-readiness.md`, area 7) found free-tier
      ambience that must be regenerated before this can be answered truthfully.
- [ ] Live-generated content: answer NO only if `RIFT_UPGRADER_URL` and
      `RIFT_RUNTIME_ASSETS` stay unset in production (no AI runs while people
      play). If either is turned on, disclose it and describe the guardrails.
- [ ] The AI disclosure text appears on the store page: keep it short and plain.

## 9. Early Access questionnaire

Store page > Early Access. Steam shows these answers on the store page; draft
them with the game plan in `docs/wyndlewood-game-design` and keep them honest
and specific:

- [ ] Why Early Access?
- [ ] Approximately how long will this game be in Early Access?
- [ ] How is the full version planned to differ from the Early Access version?
      (Include the ONE wipe at 1.0 and what is kept: paste the note in
      `docs/launch/early-access-wipe.md`.)
- [ ] What is the current state of the Early Access version?
- [ ] Will the game be priced differently during and after Early Access?
- [ ] How are you planning on involving the Community in your development process?
      (Discord, Steam forums, the in-game bug report.)
- [ ] Account requirement: Steam login means no third-party account is
      required; say so. If Steam login is ever turned off, disclose the
      separate account on the store page instead.

## 10. Store page

- [ ] Description, short description (300 characters), About section, tags,
      genres (MMORPG, RPG, Massively Multiplayer, Early Access), languages
      (claim only locales that are fully filled; see the readiness audit, area 10).
- [ ] System requirements: minimum and recommended, measured on the painted
      world (not yet measured; see the audit, area 12).
- [ ] Legal: EULA (Steam can show it at first launch), privacy policy URL,
      support email and website.
- [ ] Coming Soon page live at least two weeks before launch (wishlists).
- [ ] Graphics (current Steamworks sizes, from https://partner.steamgames.com/doc/store/assets;
      old sizes are no longer accepted):

  | Asset | Size |
  |---|---|
  | Header capsule | 920 x 430 |
  | Small capsule | 462 x 174 |
  | Main capsule | 1232 x 706 |
  | Vertical capsule | 748 x 896 |
  | Page background (optional) | 1438 x 810 |
  | Screenshots (at least 5, real gameplay) | 1920 x 1080 or larger, 16:9 |
  | Library capsule | 600 x 900 |
  | Library hero | 3840 x 1240 (.png) |
  | Library logo | 1280 wide and/or 720 tall (.png, transparent) |
  | Library header capsule | 920 x 430 |
  | Shortcut icon | 256 x 256 (.ico or .png) |
  | App icon | 184 x 184 (.jpg) |
  | Event cover / header | 800 x 450 / 1920 x 622 |
  | Achievement icons | 64 x 64 each, achieved and unachieved |

  Capsules must show the game's name and art, no review quotes or award
  laurels. Every image must be original Wyndlewood art (no inherited
  rights-reserved assets; `CREDITS.md`).
- [ ] Trailer: gameplay footage, at least one, 1080p or better.
- [ ] Submit the store page for review (several business days).

## 11. Pricing

- [ ] Choose the base price (owner decision: buy-to-play plus cosmetics).
      Use Valve's recommended regional pricing for every region, then adjust
      only where you have a reason.
- [ ] Optional launch discount (up to the normal discount rules; a launch
      discount cannot overlap a sale shortly after).
- [ ] No in-game store at Early Access unless it uses Steam Wallet
      microtransactions (Steam review fails other payment paths; the audit,
      area 8). Claudium and membership stay off (`feature/core-systems`).
- [ ] Decide whether the price rises at 1.0 and say so in the questionnaire.

## 12. Release

- [ ] Build review: Valve checks a build on the default branch before
      release (allow several business days).
- [ ] Set the release date; at release, set the reviewed build live on `default`.
- [ ] Server ready first (`DEPLOY.md`, "Client/server deploy order"): realm up,
      backups and alerts on (`docs/launch/live-ops-runbook.md`), dev commands
      off (the boot refuses them anyway), maintenance off.
