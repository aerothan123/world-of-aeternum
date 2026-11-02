# The sandbox hybrid (Project H)

Status: design, built in four packets after the housing phases. Working project
name: Project H.

The direction: keep the classic tab-target class combat as it is, and lean into
the New World sandbox on top of it: crafting at the center of the economy, guild
territory wars over towns, open-world PvP zones, and a contained dodge roll as
the one combat-feel addition. Each packet below is its own playable change.

## What already exists (and is reused, never rebuilt)
- World PvP: the `/pvp` flag, honor, stakes, bounties, spoils and the trophy
  skull (`src/sim/pvp/world_pvp.ts`, rules in `world_pvp_rules.ts`, zone policy
  in `world_pvp_zones.ts` off `ZoneDef.worldPvp`). King of the Hill
  (`src/sim/pvp/hill.ts`) already FORCES the flag on anyone inside an active
  hill (`worldPvpOnHillPresence`) and defers disarm while they stand there.
- Guilds: server-owned (`server/social.ts`), but the sim sees each player's
  `PlayerMeta.guildMembership` (stamped by `Sim.setPlayerGuildMembership`), and
  guild-scoped sim state already has a load/save template in the guild bank
  (`src/sim/guild_bank.ts`, `server/guild_bank_op_coordinator.ts`).
- Towns: `ZoneDef.hub` (one circle per zone), per-town crafting stations
  (`STATIONS` in `src/sim/content/professions.ts`, six today, no tier field).
- Realm-wide persisted state: the `world_state` JSONB row model with a
  versioned, validated sim projection (`src/sim/rift/persistence.ts` is the
  template; `loadWorldState`/`saveWorldState` in `server/db.ts`).
- Scheduling: the sim never reads a clock; the host feeds `resetDay` and
  friends each tick (`server/sim_calendar_feed.ts`). Weekly windows are pure
  weekday arithmetic on `resetDay` (the Double Honor Weekend in
  `src/sim/pvp/honor_event.ts` is the precedent).
- The battleground engine (`src/sim/social/battleground.ts`): `startBgMatch`
  takes explicit team arrays, so a war can seat two guild rosters without the
  queue; the team hostility arm, desertion, outcomes and Elo are reusable. Team
  size (5), the Thornhollow map and the per-player rating are the hardcoded
  parts.

## Packet A: open-world PvP zones (contested bands)
Not the Frostreach Frontier (`docs/prd/frontier-pvp-honor.md` and its handoff):
that plan is an INSTANCED two-team battlefield on the far-east band with its
own honor rules, written before WARFARE shipped. Packet A is the opposite shape,
contested ground inside the open world's existing zones, riding the shipped
world PvP rules unchanged. The Frontier stays a separate, later option.
- A `ContestedZoneDef` table (`src/sim/content/contested_zones.ts`): a named
  circle or rectangle inside an existing zone (never a whole zone, so the hub
  and the questing road stay safe), its reward tuning id, and a notice key.
- The flag is FORCED inside a band exactly the way the hill does it: a
  `worldPvpOnContestedPresence` arm in `updateWorldPvp` raises the ordinary
  flag (same gates: level 10, sanctuary, instanced, kill switch) and the
  disarm pass defers while the player stays inside. Forcing the flag, rather
  than marking the ground `ffa`, keeps the full stake, spoils and honor path.
- Rewards: kills inside a band pay the normal honor plus a band bonus, and
  gather nodes inside a band roll an extra yield (the "risk pays" rule of New
  World's open world). Both are tuning constants in one module.
- Player text: enter/leave notices as sim English with `sim_i18n.ts` matcher
  rows; the map paints the band (a `map_marker_semantics_core.ts` kind).
- First band: the Riftfields road south of Highwatch (level 15 to 20 ground),
  placed by a test that pins it clear of the hub and graveyard.

## Packet B: guild territory wars over towns
- Town control record, realm-wide and persisted: `src/sim/territory/` with
  `TownControlState { version, towns: { [zoneId]: { ownerGuildId|null,
  ownerGuildName, claimedWeek, challengerGuildId|null, warWeek } } }`, a
  versioned projection on the rift persistence pattern, loaded and saved by the
  server under `town_control:<realm>`; offline and headless start empty.
- Claiming: an unowned town is claimed by a guild officer at the town's
  noticeboard for a gold charter fee; an owned town is CHALLENGED by another
  guild the same way (one challenger per week, first come). Both are sim
  commands on a new `IWorldTerritory` facet, validated against
  `guildMembership` (officer or leader rank).
- The war: a scheduled weekly window (weekday arithmetic on `resetDay`, the
  honor-event precedent) in which the two guilds fight ONE match on the
  battleground engine: `startBgMatch` seated from the two rosters present and
  flagged at the town when the window opens, a team-size parameter instead of
  the fixed 5, the existing flag objective, and the result written to the
  control record (the defender holds on a draw). No queue, no proposal.
- Perks for the owning guild: a town tax (a small cut of vendor and market
  fees in that town, paid into the guild bank through the existing guild bank
  op path), a crafting bonus at that town's stations for guild members, and
  the guild's name on the town banner (nameplate-style text on the hub
  noticeboard). Perks are read from the control record, never from the
  server directly.

## Packet C: crafting at the center (town projects)
- Stations gain a TIER (a new `tier` on a per-town project record, not on the
  static `StationDef`): tier 1 as shipped, up to tier 3.
- A town project is a community material drive: the noticeboard lists the
  current project (which station, which materials, how many turned in of how
  many), any player turns materials in at the board for a craft-skill reward,
  and when the drive completes the station's tier rises for everyone for the
  rest of the season (a fixed number of weeks, then it decays one tier so the
  drive is a living loop).
- Tier effects: a reagent discount at that station (`requiredReagentCount`
  in `src/sim/professions/crafting.ts`) and a masterwork chance bump, both
  read through the existing crafting admission path.
- The project record lives beside town control in the same realm-wide blob;
  the owning guild (packet B) gets a bonus share of the project reward, which
  is what ties territory to the economy.

## Packet D: the dodge roll
- A GW2-style dodge: a short forced move in the input direction on a
  two-charge resource (charges refill on a timer), with brief avoidance
  (incoming melee and ranged hits are dodged, telegraphed ground effects are
  not, by design, so boss mechanics stay honest).
- Contained addition: a new movement MODE in the player movement modes order
  (`src/sim/player_movement_modes.ts`, the Heroic Leap and Charge family), a
  combat predicate in the hit table (an "evading" window the roll opens), and a
  keybind. Predicted on the client through the same input-frame path the kernel
  already runs, so it feels immediate online.
- Never a rewrite: no aimed attacks, no animation canceling, no new netcode.
