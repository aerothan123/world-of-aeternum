# Early Access wipe: policy, store-page note, and the wipe tool

Owner decision (Nov 4): progress is kept for the whole of Early Access, and
there is ONE wipe, at full launch (1.0). Cosmetics and the Book of Deeds are
kept. Steam requires Early Access games to disclose planned wipes on the store
page, so the player-facing note below goes into the Early Access questionnaire
("How is the full version planned to differ?" and the progress question) and
onto the store page About section.

## Player-facing note (paste as is)

> **Progress and the 1.0 wipe**
>
> Your progress carries through the whole of Early Access: no resets between
> updates. When Wyndlewood leaves Early Access (version 1.0), the world gets
> ONE fresh start, so everyone begins the full game on equal footing.
>
> What you keep at 1.0:
> - your account and every character name;
> - your Book of Deeds: every deed earned, your titles, borders and Renown;
> - every cosmetic: appearances, weapon and mount skins, companions, and
>   anything you bought;
> - your Reliquary of unique finds and your total time played.
>
> What starts over: levels, gear, gold, bags and bank, quests, professions and
> recipes, homes and farms, guild banks, and the market.
>
> There is no other planned wipe. If an emergency ever forced a rollback
> (a server fault, an exploit), we will announce it in-game, on Discord and in
> Steam news with the exact time restored.

## The wipe tool (operators)

Code: `server/launch_wipe_core.ts` (what is kept, what is cleared),
`server/launch_wipe_db.ts` (the transaction and the safety rails),
`scripts/launch_wipe.ts` (the command). Tests: `tests/launch_wipe.test.ts`
(policy) and `tests/launch_wipe_pg_integration.test.ts` (a seeded real
Postgres: dry run, refusals, the wipe, kept and cleared stores, the one-wipe
rule; runs when `TEST_DATABASE_URL` is set).

Kept: accounts and everything account-level (logins and Steam links,
moderation history, account cosmetics, purchases and entitlements, friends,
the deeds and relic ledgers); every character row with its name and class, and
the `WIPE_KEEP_KEYS` inside its state (deeds, deed stats, Renown, titles,
borders, Reliquary, appearance, worn cosmetics, companions, played time);
the `character_deeds` board rows; guilds and their members; the item and bank
audit ledgers.

Cleared for the realm (`WIPE_REALM_CLEARS`): the World Market and Ravenpost
books, rift state, mail custody parcels, guild bank books, world quest scores,
sold-volume price history, and the derived account wealth rows. Every
character's state is reset to a newborn of its class on the starting shore.

### Procedure (launch day)

1. Announce the date weeks ahead (in game MOTD, Discord, Steam news), repeating
   the note above.
2. Start maintenance with a long countdown (`docs/launch/live-ops-runbook.md`),
   then stop the game when it ends: `sudo docker compose stop game`.
3. Take a manual off-machine backup and keep it forever
   (`docs/launch/backup-restore-runbook.md`); check it restores into a scratch
   database.
4. Dry run (it changes nothing but an audit row):

   ```sh
   cd /opt/eastbrook && sudo docker compose run --rm game npx tsx scripts/launch_wipe.ts --realm <realm>
   ```

   Read the JSON: character count, how many have deeds, kept-key counts, and
   the confirmation phrase. (On a host without the dev toolchain, run it from
   any machine that can reach the database with the same `DATABASE_URL`.)
5. Run it for real with the exact phrase from the dry run:

   ```sh
   npx tsx scripts/launch_wipe.ts --realm <realm> --execute \
     --confirm "WIPE <realm> <N> CHARACTERS" --operator "<your name>"
   ```

   It refuses if any character lease is live (the game is still running), if
   the phrase does not match the current count, or if this realm was already
   wiped (`--allow-repeat` exists only for a restore-and-rewipe drill on a
   copy). It is one transaction: an error changes nothing.
6. Start the game with `MAINTENANCE_MODE=1`, log in as staff, check a veteran
   character (level 1, deeds and title intact, appearance intact), then end
   maintenance.

Every run is recorded in `launch_wipe_runs` (realm, dry or real, operator,
time, the plan and the cleared row counts). Keep that table forever.

### What the tool does not do

- It does not touch other realms (it is per `--realm`).
- It does not reset account-level housing or durability: those features are
  on other branches; when they land, their tables join `WIPE_REALM_CLEARS`
  (or the kept list, if the owner decides they are cosmetic) in the same
  change, with a seeded-DB case.
