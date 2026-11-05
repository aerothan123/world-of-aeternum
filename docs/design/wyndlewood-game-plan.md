# Wyndlewood: game design plan

Status: proposal for the owner. Written against `feature/player-housing` (the
owner's integration branch), the story bible and decisions on
`docs/wyndlewood-bible` (`docs/narrative/wyndlewood_bible.md`,
`docs/narrative/wyndlewood_decisions.md`), and the owner's Chapter One quest
file. Read this alongside them. Where the decisions file and this plan
disagree, the decisions file wins until the owner rules.

Labels used throughout:
- **EXISTS**: in the code today and playable.
- **NEEDS WORK**: in the code, but thin, provisional, or wrong for Wyndlewood.
- **MISSING**: design only, or not started.

Anchor rule: this plan cites paths and exported symbols. Counts that will go
stale are collected in one dated snapshot (Appendix A) and are not repeated
in the text.

Companion files:
- `docs/design/wyndlewood-game-plan-progression.md`: the XP math, the per-band
  quest and dungeon tables, and the zone order for the world crew.
- `docs/design/wyndlewood-game-plan-economy.md`: the sink and source table and
  the monetization options.
- `docs/design/wyndlewood-chapter-roadmap.md`: launch plus the post-launch
  chapters (+5 cap each).
- `docs/design/wyndlewood-chapter-two-outline.md`: the quest outline for
  levels 5 to 13.
- `docs/design/wyndlewood-faction-ladder.md`: standing formula, tiers and
  rewards.
- `docs/design/wyndlewood-last-keep-dawnhold.md`: encounter designs for the
  two story walks.

---

## One-page summary

**What Wyndlewood is.** A warm, hand-painted, storybook fantasy MMO for
desktop (Steam). It plays like a classic tab-target MMO. Its second spine,
equal to the first, is homes, crafting, gathering, farming and trade: a player
who mostly builds and makes things should still reach level 20, matter to the
economy and earn prestige.

**What the code already gives us.** The fork inherits a large and deep
engine. It has:
- 9 classes with 3 specs each and 6 talent choice rows.
- A level-20 cap on a classic XP curve.
- All 15 bible regions as zones, with the bible's own level ranges.
- 5 five-player dungeons with heroic modes, 2 ten-player raids, delves,
  procedural rifts, world quests, world bosses, a weekly vault and seasonal
  events.
- A deep professions system: a ten-craft ring, gathering, fishing and farming,
  a masterwork chance, a crafted top tier that rivals raid gear, commissions,
  and a World Market with buy orders.
- Guilds, mail, trading, PvP, the Book of Deeds and the Reliquary, plus Steam
  account linking and an achievement mirror.
- Housing phases 1 to 3: buy a lot, a private interior, crafted furniture,
  storage chests and home crafting stations.

**Biggest gaps for the Wyndlewood vision.**
1. Housing is a first slice. Only a few lots, anchored placement, and no
   trophies, recall, tax, guests, gardens or town projects.
2. The factions are three provisional placeholders, earned only from world
   quests. Another crew is replacing them with the bible's five.
3. Leveling is too fast. The one-time quests in the leveling zones pay out
   more than twice the XP needed to reach the cap.
4. The economy has no repair sink, and housing tax is not built.
5. Two inherited systems clash with Wyndlewood. Membership gives paid gear
   and bonus XP, which is pay-for-power. The crypto currency layer is a likely
   Steam policy problem.
6. Dawnhold Castle and the Last Keep are story walks with no fights. Wildheart
   Basin needs a reframe as the finale.

**Recommendations in brief.**
- Keep the **level cap at 20** for launch (now decided; later chapters
  raise it by 5). Every system is pinned to it, and
  levels 16 to 20 already hold 45% of all XP to cap. Raise the cap only in a
  paid expansion.
- **Re-tune quest XP to about 10% of a level per quest** (today it is about
  18 to 25%). Aim for about 5 quests completed per level and about 7 offered,
  for a first character's time to cap of roughly 25 to 35 hours.
- Make **life skills a real path to cap**: life-skill quest lines, faction
  work orders that pay normal quest XP, and town restoration projects.
- **Factions by activity, not by zone.** Lanternwardens for combat and
  defense, Hearthwright Compact for building and crafting, Bracken Circle for
  nature and herbs, Gilt Measure for trade and contracts. The Pale Accord is
  the enemy with no reputation.
- **Business model:** buy-to-play, a cosmetic-only shop, and paid
  expansions. Convert the membership gear and XP perks to cosmetics or remove
  them, and keep crypto out of the Steam build.
- **Minimum viable launch:** Chapters One to Seven playable to 20, the 5
  factions, housing phases 4 to 6 plus a garden plot, durability and repair,
  the economy pass, and a cleaned-up Steam build. Roadmap and risks are in
  section 10.

---

## 1. Pillars and core loop

### Pillars
1. **A home worth coming back to.** Your house is your save point, workshop,
   trophy room and garden. Owning one is never required for the story, but it
   pays off every session.
2. **Made by players.** Furniture, most consumables and much of the gear come
   from player crafters. The market and commissions connect makers with
   adventurers.
3. **A storybook world with real teeth.** It looks cozy, but the combat follows
   classic formulas, and the dungeons and raids need real groups.
4. **Every path reaches the cap.** Questing, dungeons and life skills each
   carry a character from 1 to 20.
5. **Fair by construction.** No pay-for-power. Graphics settings never hide
   information a player acts on (root `CLAUDE.md`, invariants). Deeds are
   cosmetic only.

### What makes it different
In most classic-style MMOs, housing and crafting are side modes. In
Wyndlewood:
- The main story says everyday work strengthens the Hearthbinding (bible
  section 5, Hearthwright Compact).
- Quests repair bridges, supply crafters and rebuild homes (bible section 11).
- The Chapter One file already gives most of its quests to the Hearthwright
  Compact (Appendix A).

The game should reward that fantasy mechanically, not just in quest text.

### The loops

| Loop | Adventurer | Maker |
|---|---|---|
| Moment to moment (1 to 5 min) | Pull, rotate, loot, turn in | Gather a node or patch, run a craft batch, list on the market |
| Session (1 to 2 h) | A zone quest chain, a dungeon run, a world quest circuit | A work-order circuit, a commission batch, a farm harvest, decorating the house |
| Daily | Faction quest board, heroic dungeon (daily lockout), world quests | Farm crops ripen (on a real-time clock), work orders refresh, market buy orders fill |
| Weekly | Raid lockout, weekly emissary, weekly vault, world bosses | House upkeep, town project milestones, the Perfecting attempts on top-tier crafted gear |
| Long term | Deeds, Reliquary pages, heroic and raid gear, PvP honor | Craft mastery, a masterwork hunt, a signed reputation as a crafter, a fully decorated home |

The two columns cross every day. Adventurers buy food, flasks, enchants and
furniture. Makers need monster materials from corpse harvesting, and rare
patterns from dungeons.

**Status.** Every loop above EXISTS in code except house upkeep and town
projects (MISSING), and faction boards for the five factions (being built by
the faction and quest-board crews).

---

## 2. Progression to cap

Full tables: `docs/design/wyndlewood-game-plan-progression.md`.

**Current cap and curve (EXISTS).**
- `MAX_LEVEL` is 20 (`src/sim/types.ts`). `XP_TABLE` is the per-level bar.
- Kill XP is the classic formula, `mobXpValue`: 45 + 5 x mob level, scaled
  by level difference, with `zeroDiff` setting when mobs turn gray.
- Rested XP doubles kill XP only (`grantXp` in `src/sim/combat/damage.ts`).
- Quest XP is a flat `xpReward` per quest, with no level scaling, granted in
  `src/sim/quests/quest_commands.ts`.
- XP past the cap feeds virtual levels and prestige (`xpToReachLevel`,
  `PRESTIGE_XP_PER_RANK`).
- Talent rows unlock at `ROW_LEVELS` (`src/sim/content/talent_rows.ts`).
- Spell ranks follow `docs/design/spell-ranks.md` for levels 1 to 20.

**Recommended launch cap: 20 (keep).** The bible fixes the campaign at
levels 1 to 20. Talent rows, spell ranks, heroics, raid item budgets and
faction vendor budgets all assume 20. Raising the cap is the classic shape
of a paid expansion (section 9).

**NEEDS WORK: leveling speed.** The shipped convention pays about 18 to 25%
of a level's XP bar per quest. `docs/design/master-spec.md` caps a single
reward at 25%. On top of that, quests ask for kills, and those kills pay XP
too. The packet review notes (`docs/design/professions-tuning-packet.md`)
that the one-time quests alone pay more than the whole climb to cap. With a
much larger seamless map, that means players out-level whole zones.

Recommendation (owner decision Q2):
- Target **about 10% of the current level's bar per average quest**, with
  25% kept as the ceiling for chapter finales.
- Design for about **65% of leveling XP from quests** and 35% from kills.
- Offer about **7 quests per level** (spare supply, so players can skip) for
  about **5 completed per level**.

**Zone order and bands (for the world crew).** The bible ranges (the same as
`ZoneDef.levelRange` in code) stay as each zone's allowed range. Each zone
also gets a narrower "core band" where its quest hubs sit:

| Order | Region | Allowed | Core band | Chapter | Dungeon |
|---|---|---|---|---|---|
| 1 | Proving Shore | 1 to 2 | 1 to 2 | 1 | none |
| 2 | Eastbrook Vale (hub) | 1 to 7 | 2 to 6, graveyard corner 7 to 10 | 1 and 2 | Hollow Crypt 7 to 10 |
| 3 | Farshore (side branch) | 3 to 7 | 4 to 7 | 2 | none |
| 4 | Mirefen Marsh | 6 to 13 | 7 to 13 | 3 | Sunken Bastion 12 to 13 |
| 5 | Thornpeak Heights | 13 to 20 | 13 to 16, high passes 18 to 20 | 4 | Drowned Temple 16 to 18, Gravewyrm Sanctum 19 to 20, Last Keep (walk) |
| 6 | Veiled Hollow (portal) | 15 to 20 | 15 to 17 | 5 | Dawnhold Castle (walk, needs fights) |
| 7 | Drakelands | 16 to 20 | 16 to 18 | 6 | none |
| 8 | Frostveil Reach | 17 to 20 | 17 to 19 | 6 | none |
| 9 | Amberfall | 18 to 20 | 18 to 20 | 7 | none |
| 10 | Willowfen | 19 to 20 | 19 to 20 | 7 | Wildheart Basin 20 (finale) |
| 11 to 15 | Nightbloom, Wraithwood, Palmreach, Evergarden, Galecrest | 20 | 20 | endgame | Nythraxis raid; forge raid (Ignivar) entered from Galecrest |

Why the top band is crowded, and why that is fine: levels 16 to 20 cost 45%
of all XP to cap. Six zones overlapping there are the right amount of
content. The 16 to 20 zones should branch, not run as one line, so players
pick their order.

**Quest volume per band (at the recommended ratio).**

| Band | Levels | Quests to offer | Notes |
|---|---|---|---|
| Proving Shore | 1 to 2 | 7 to 10 | The Chapter One file covers this |
| Eastbrook Vale | 2 to 7 | 28 to 36 | The Chapter One file covers levels 1 to 4; levels 5 to 7 need Chapter Two |
| Farshore | 4 to 7 | 15 to 20 | An alternative path, so it overlaps Eastbrook |
| Mirefen Marsh | 7 to 13 | 35 to 45 | The longest stretch of the climb |
| Thornpeak Heights | 13 to 16 | 25 to 35 | Plus a short 18 to 20 chain to the Gravewyrm Sanctum |
| Each 16 to 20 zone | 2 to 3 levels each | 12 to 16 per zone | Across the branching zones, 50 to 70 in all |
| Level-20 zones | 20 | 6 to 10 story quests each, plus faction dailies | Endgame, not leveling |

Each band also needs 2 to 4 faction daily templates (the quest-board crew)
and at least 1 life-skill chain (section 4).

**Dungeons per band.**

| Band | Have | Need |
|---|---|---|
| 1 to 6 | none | Optional: a short 3-player starter delve in Eastbrook (delves EXIST, `src/sim/delves/`) |
| 7 to 10 | Hollow Crypt | none |
| 11 to 13 | Sunken Bastion | none |
| 13 to 16 | none (MISSING) | The Last Keep as a real 5-player dungeon at 14 to 16 (the bible's Chapter Four dungeon) |
| 15 to 18 | Drowned Temple, plus Dawnhold Castle as a walk only | Build Dawnhold encounters at 16 to 18 (Chapter Five) |
| 19 to 20 | Gravewyrm Sanctum, Wildheart Basin | Reframe Wildheart as the final ritual (decisions file, item 2) |
| 20 | 5 heroics, Nythraxis raid, forge raid | See section 7 |

---

## 3. Classes and combat

**EXISTS.** Nine classes (`src/sim/content/classes.ts`) with classic
resources (rage, mana, energy, focus) and classic rage conversion
(`rageConversion`). Each class has 3 specs, defined in
`src/sim/content/talents_warrior.ts` and `talents_classic.ts`. Each spec has a
signature ability and a mastery. On top of that, every class shares one
choice-row tree with rows at `ROW_LEVELS` (`choice_rows.ts`,
`choice_rows_classic.ts`, `warrior_rows.ts`). Up to 10 saved loadouts.

| Class | Specs (display name, role) |
|---|---|
| Warrior | Battlecraft dps, Bloodrush dps, Ironguard tank |
| Paladin | Sunmender healer, Faithwarden tank, Dawnreaver dps |
| Hunter | Packlord dps, Coldsight dps, Fieldcraft dps |
| Rogue | Knifework dps, Thuggery dps, Skulduggery dps |
| Priest | Doctrine healer, Benison healer, Vespers dps |
| Shaman | Thundercall dps, Warspirit dps, Spiritcall healer |
| Mage | Chronomancy healer, Pyromancy dps, Cryomancy dps |
| Warlock | Hexcraft dps, Necromancy dps, Ruination dps |
| Druid | Moongrove dps, Wildfang tank, Groveheart healer |

Totals: 3 tank classes (warrior, paladin, druid) and 5 healer classes.

**Gaps and balance needs.**
- **NEEDS WORK: the finder skips the mage healer.**
  `FINDER_CLASS_ROLES` (`src/sim/content/dungeon_finder.ts`) lists paladin,
  priest, shaman and druid as healers, but not mage. Chronomancy is a healer
  spec. Either add mage there or redefine Chronomancy's role. Owner decision.
- **NEEDS WORK: tank scarcity.** Three tank classes is classic. On a small
  launch population, tanks will be the bottleneck in the finder. Options: keep
  queue rewards for tanks (`src/sim/content/queue_rewards.ts` EXISTS), and
  make sure each tank spec levels well solo.
- **NEEDS WORK: no cross-class balance view.** The v0.42 measurements
  (`docs/design/class-balance-v042-results.md`) use a different fixture for
  each probe, so their DPS numbers cannot be compared across classes.
  Build one shared level-20 fixture over the existing probes
  (`docs/design/spell-balance-framework.md`). Then run a pass that pulls the
  furthest-out specs toward the middle. Use the framework's numbers only. Do
  not invent coefficients.
- **NEEDS WORK: leveling feel at 1 to 10.** If quest XP drops (section 2),
  players spend longer at low levels. Each spec needs a check that it plays
  well before the first talent row.
- **MISSING: class-flavored story lines.** The bible allows class-specific
  dialogue but not a chosen-one hero. Add small class touches (a trainer
  quest at each talent row level), not separate campaigns.
- **Combat formulas** (hit tables, armor reduction, rage) already follow the
  classic era per root `CLAUDE.md`. They must stay that way.

---

## 4. Professions, gathering, crafting, housing

### What exists
| System | Status | Anchor |
|---|---|---|
| Ten-craft ring with archetype pairs and a hobby | EXISTS | `CRAFT_RING`, `src/sim/professions/archetype.ts` |
| Craft skill to 125, gathering to 100, fishing to 200 | EXISTS | `maxSkill` in `src/sim/content/professions.ts` |
| Mining, logging, herbalism, fishing, farming | EXISTS | `src/sim/professions/gathering.ts`, `fishing.ts`, `farming.ts` |
| Tree chopping of real trees | EXISTS | `src/sim/content/tree_chopping.ts` |
| Corpse harvesting of monster materials | EXISTS | `corpse_harvest_*.ts` |
| Tools by tier, a material grade, rare gather events | EXISTS | `tools.ts`, `material_grades.ts`, `gather_events.ts` |
| Masterwork chance, signed reagents, Masterwrought top tier, Perfecting | EXISTS | `masterwork.ts`, `perfecting.ts` |
| Stations (forge, kitchens, loom, toolworks, tannery, apothecary) | EXISTS | `src/sim/professions/stations.ts` |
| Work orders, commissions (Maker's Bond), letters, nudges | EXISTS | `cadence.ts`, `commission.ts` |
| Character XP from gathering and crafting | EXISTS (first-pass numbers) | `src/sim/professions/profession_xp.ts` |
| Furnishing profession and furniture items | EXISTS | `src/sim/housing/furnishing.ts`, `src/sim/content/furniture.ts` |
| House lots, purchase, private interior | EXISTS | `src/sim/content/house_lots.ts`, `src/sim/housing/ownership.ts` |
| House storage chests (one shared pool) | EXISTS | `house_storage.ts` |
| Home crafting stations | EXISTS | `house_stations.ts` |
| Trophies, recall home, weekly tax | MISSING (design, `docs/design/player-housing.md` phases 4 to 6) | |

### Exists but needs work
- **Gathering tiers by zone.** In `GATHER_NODES`
  (`src/sim/content/gather_nodes.ts`), the `tier` field is above 1 only in
  Mirefen and Thornpeak. Nodes in the later zones are tier 1, and their worth
  comes from zone-only materials instead. That is fine for exclusivity, but it
  breaks the tool ladder's pull. Recommended mapping for the world crew:

  | Band | Node tier | Example materials (keep existing ids) |
  |---|---|---|
  | 1 to 6 (Proving Shore, Eastbrook, Farshore) | 1 | starter ore, wood, herbs |
  | 7 to 13 (Mirefen) | 2 | marsh woods and herbs |
  | 13 to 17 (Thornpeak, Veiled Hollow) | 3 | mountain ores, gems |
  | 16 to 20 (Drakelands, Frostveil, Amberfall, Willowfen) | 4 | volcanic, frost and autumn exclusives |
  | 20 (endgame zones) | 5 | top-tier exclusives for Masterwrought |

  A tier above 3 needs a new tool rung in `vendor_row_gates.ts` and
  `tools.ts`. Gathering's `maxSkill` was meant to rise with new zones
  (see the professions tuning packet).
- **Gathering and crafting XP** are first-pass numbers. The module header
  says they are not classic formulas, so they can be tuned freely. To make
  life skills a real path to cap: tune them so an hour of steady gathering
  and crafting at the right level earns about 60% of the XP of an hour of
  questing, and let life-skill quests and work orders pay normal quest XP.
- **Only six station types**, all in the first three towns. Later towns
  need station masters. Each town should anchor at least one station type.
- **Housing slice.** Today:
  - A few lots in total, one each in Eastbrook, Fenbridge and Highwatch.
  - One house per character, owned by the character. The owner has since
    decided on one house per account, so ownership moves to the account.
  - Furniture snaps to fixed anchors.
  - Furniture reuses castle GLBs (the furniture crew is replacing them).

### Missing, in priority order
1. **Housing phases 4 to 6** (trophies, recall, tax), as already designed in
   `docs/design/player-housing.md`.
2. **More lots and house sizes** in every town of the new map, across 3 size
   tiers (cottage, house, manor). Each larger size has more anchors and more
   chest slots.
3. **A home garden plot.** Reuse the farming patch model
   (`farm_patches.ts`, `farm_persist.ts`) on an outdoor anchor of the house.
   The bible lists gardens as part of a home.
4. **Free placement**: grid and rotate within the room bounds. This needs
   static colliders recomputed when the player places an item.
5. **Guests**: let party members enter your copy of the house. The slot key
   already supports this (`house:char:<id>`).
6. **Town restoration projects** (Hearthwright Compact). A town building has
   stages. Players add materials and crafted parts to a shared counter, and
   each finished stage adds a vendor, a station, or decoration for everyone.
   This is the "everyday work strengthens the world" pillar, and a large
   material sink.
7. **Hired helpers.** NPC helpers that live in your house and gather or
   process on a timer. This is the generic version of a known worker idea.
   Do not copy another game's names or numbers. Build this after launch.
8. **Furniture depth.**
   - Recipe ladders per tier (rough, fine, masterwork) using planks, cloth,
     ingots and hides.
   - Sets with a cosmetic "room theme" deed.
   - Dyes.
   - Furniture rewards from faction vendors and dungeons. These should be
     patterns (recipes), not finished pieces, so makers stay in the loop.

What depth means here, described generically: crafting has a long chain
from raw to processed to finished goods. Higher material grades feed higher
results. Crafters build a known name through signed goods. Homes are built
up over many weeks and show what you have done. All of this feeds a market
where demand comes from both play styles.

---

## 5. Economy (summary)

Full table: `docs/design/wyndlewood-game-plan-economy.md`.

- **EXISTS.**
  - The World Market (`src/sim/market.ts`) with a 5% cut (`MARKET_CUT`), no
    listing deposit, a per-seller listing cap, and buy orders
    (`market_orders.ts`).
  - Mail with escrow (`src/sim/mail/post_office.ts`) and player-to-player
    trade (`src/sim/social/trade.ts`).
  - Sinks: training fees, riding fees (`riding_training.ts`), bank and vault
    expansions (`storage_prices.ts`), the unbind fee, the crafting gold sink,
    and house purchase.
  - Sources: mob coin, quest copper, dungeon finale gold
    (`docs/design/dungeon-gold.md`), vendored items, world quests, work
    orders.
- **MISSING: repair.** The item type has no durability field (see the
  comment in `src/sim/types.ts`). Classic MMOs drain a lot of gold through
  repairs. Recommendation: add classic-style durability and repair as a sim
  module, with no loss on death beyond durability. Owner decision Q8.
- **MISSING: housing tax** (phase 6). Make it scale with house size.
- **Inflation risks.**
  - Quest copper scales with today's quest oversupply.
  - Heroic finales pay a raised base every day, for every dungeon.
  - There is no listing deposit.
  - No sink grows with wealth.

  Fixes:
  - Trim quest copper together with quest XP.
  - Add a small market listing deposit.
  - Add town projects and repair.
  - Track the realm's money supply in the admin dashboard (the server-side
    ledger exists: `src/sim/account_ledger.ts`).

---

## 6. Factions and reputation

**Today.** `src/sim/factions.ts` has three provisional factions (`rift_watch`,
`church_order`, `automatons`), mapped by zone in `ZONE_TO_FACTION`. Standing
comes only from world quest turn-ins and the weekly emissary commendation.
There are six tiers (`STANDING_TIERS`), with quartermaster ladders in
`faction_vendors.ts` whose prices copy existing heroic and raid rows
(`docs/design/factions.md`). The decisions file (item 3) replaces these with
the bible's five. Another crew is building that now.

**Proposal: earn reputation by activity, not by zone.**

| Faction | Earned by | Daily board | Quartermaster sells (all budgets copied from existing rows) |
|---|---|---|---|
| Lanternwardens | Combat quests, patrols, defense events, dungeon clears, Pale Accord cell hunts | Bounties, patrols, escort | Neck, ring and off-set gear (the existing periphery rule), a mount, tabard, recall-to-town |
| Hearthwright Compact | Work orders, town projects, crafting and furniture quests, housing milestones | Supply runs, crafting commissions, repair jobs | Furniture patterns, larger house lot rights, extra station recipes, tool rungs |
| Bracken Circle | Herbalism, fishing, farming, spirit and forest quests, nature moral choices | Herb and seed gathering, spirit rites | Seeds and farm patterns, garden furniture, herb and fishing tools, a nature-themed mount |
| Gilt Measure | Market buy-order deliveries, prospecting, caravans, trade contracts | Delivery contracts, appraisals | Bag upgrades, merchant cosmetics, trade-focused patterns. No market fee cuts (that would be an economy power) |
| Pale Accord | Hostile. No reputation. | Their cells appear as enemy camps and world events | none |

Rules:
- Every faction can be maxed by one character. There is no exclusive choice
  at launch. Moral choices can grant a little standing to one faction over
  another without locking anything out (owner decision Q6).
- The Chapter One file already tags each quest with its faction. Every
  authored quest should carry a faction tag that feeds
  `awardFactionReputation`.
- Keep the existing level-bracket clamp (`maxStandingForLevel`) so new
  characters cannot max reputation early.

**The Pale Accord as the enemy thread.**
- Chapters One to Three: disguised cells and clues only. The Chapter One file
  says the player never learns the name.
- Chapters Four to Seven: open camps, then a lieutenant in each region.
- After the campaign: a weekly "Accord cell" world event that rotates through
  regions, plus the existing world quests reskinned.
- Reframe the shipped Gravecaller and Wyrmcult campaign as Accord cells
  (decisions file, item 1).
- Link the Pale Choir to the Accord on purpose (decisions file, item 4).

---

## 7. Endgame at launch

| Activity | Status | Anchor | For Wyndlewood |
|---|---|---|---|
| Heroic five-player dungeons (daily lockout) | EXISTS | `heroic_variants.ts`, `dungeon_finder.ts` | Keep. Add The Last Keep and Dawnhold when they are built |
| Nythraxis 10-player raid, normal and heroic | EXISTS | `src/sim/encounters/`, `nythraxis_*.ts` | The bible's post-campaign raid. Keep |
| Forge raid (Ignivar and Varkhul), weekly lockout | EXISTS (partly flagged as a dev tier) | `ignivar_*.ts`, `varkhul_*.ts` | This is the bible's Ancient Forge raid. Move its entrance to Galecrest and finish it for release |
| Mythic+ keystone ladder | MISSING (a PRD draft) | `docs/prd/mythic-plus-and-forged.md` | After launch |
| Delves (solo or small group) | EXISTS | `src/sim/delves/` | Good for low populations. Add one per endgame zone over time |
| Rifts (procedural, C to S ranks) | EXISTS | `src/sim/rift/`, `docs/design/rift-mode.md` | Keep. Reskin as Unravelling tears |
| World quests, weekly emissary, weekly vault | EXISTS | `world_quests.ts`, `weekly_quests.ts`, `docs/design/weekly-vault.md` | Re-key to the new factions |
| World bosses | EXISTS | `src/sim/world_boss.ts` | Put one in each endgame zone |
| Seasonal events (Gourdlight Eve) | EXISTS | `src/sim/seasonal/` | Fits the tone. Plan a calendar of 4 events a year |
| Reputation ladders | NEEDS WORK | section 6 | |
| Housing and crafting mastery | NEEDS WORK | section 4 | Masterwrought and Perfecting exist. Add housing deeds and room themes |
| PvP | EXISTS: duels, arenas, battlegrounds, opt-in world PvP, King of the Hill, honor, the Warfare rating | `src/sim/pvp/`, `src/sim/social/arena.ts`, `docs/design/warfare.md` | Keep it opt-in at launch. The bible holds back competitive PvP from the main story. Guild town control comes later |
| Book of Deeds, Reliquary, titles, borders | EXISTS (cosmetic only) | `docs/design/deeds.md`, `docs/design/reliquary.md` | Every new piece of content brings its own deeds and Reliquary pages |
| Post-cap virtual levels and prestige | EXISTS | `src/sim/types.ts` | Keep. Cosmetic |
| Minigames (glider races, card duels, cannon, wisp maze) | EXISTS | `src/sim/minigames/` | Keep as town fun |

---

## 8. Social

| Feature | Status | Anchor |
|---|---|---|
| Party, raid, ready check, pull timer | EXISTS | `src/sim/social/party.ts`, `ready_check.ts`, `pull_timer.ts` |
| Dungeon Finder (roles, listings, guild-only listings) | EXISTS | `src/sim/social/dungeon_finder.ts`, `finder_*.ts` |
| Chat: say, yell, whisper, party, general and more | EXISTS | `src/sim/social/chat.ts` |
| Guilds: ranks, roster, bank, tiers, contracts, quartermaster | EXISTS | `guild_ranks.ts`, `guild_bank.ts`, `guild_tier.ts`, `guild_contracts.ts` |
| Guild pledge board | MISSING (planned) | `docs/prd/guild-pledge-board.md` |
| Mail with item and coin escrow | EXISTS | `src/sim/mail/` |
| Player-to-player trade | EXISTS | `src/sim/social/trade.ts` |
| Discord bot (account link, roles, chat relay, activity feed, PvP feed) | EXISTS | `bot/` |
| House visits and a guild hall | MISSING | Guests (section 4), then a guild-owned house that reuses the lot model |

For Wyndlewood: rename the bot's branding and channels. Add "open house"
listings (a player marks their home as open to visitors, like a finder
listing). Add guild town projects, which share the code with faction town
projects.

---

## 9. Monetization (summary)

Full pros and cons: `docs/design/wyndlewood-game-plan-economy.md`.

**What the fork inherits:**
- Membership: a subscription or a tradeable 30-day token. It grants Rare gear
  at item level equal to character level + 5, 20% more XP with the armor set
  on, and half the market fee (`docs/design/membership.md`).
- A Stripe subscription service (`docs/design/game-subscription.md`).
- A paid storage SKU (`storage_charters.ts`).
- Store mount skins and weapon skins.
- A crypto soft currency and stakes layer (`server/claudium.ts`,
  `docs/prd/woc/`).
- Steam and Epic account linking and achievement mirrors (`server/steam/`).

**Fairness problems:**
- The membership gear and XP bonus are pay-for-power. So is the half market
  fee, because it is an economy advantage.
- The crypto layer is a high-risk item for a Steam release (Steam's rules
  restrict games built on blockchain tokens).

Recommended shape:
- Buy-to-play on Steam.
- A cosmetic shop: mount, weapon and armor appearances, house wallpapers and
  dyes. The shop never sells crafted furniture functions, so makers keep the
  market.
- Paid expansions that raise the cap and add regions.
- Optionally, a small cosmetic subscription.
- Remove the membership gear, XP and market perks, and remove crypto, from
  the Wyndlewood build.

---

## 10. Launch scope

### Minimum viable launch (must exist)
1. Chapters One to Seven playable from 1 to 20 on the new seamless map, at
   the quest volumes in section 2, with the retuned quest XP.
2. The five factions with daily boards and quartermasters.
3. Housing phases 4 to 6, more lots in every town, house size tiers, a
   garden plot, guests, and a full furniture catalog.
4. Durability and repair, a listing deposit, and the tax.
5. The Last Keep and Dawnhold as real dungeons, and Wildheart Basin as the
   finale.
6. Endgame: heroics, the Nythraxis raid, the forge raid, delves, rifts, world
   bosses, world quests.
7. A Steam build: desktop only, crypto and membership power removed, Steam
   login and achievements on, store cosmetics only.
8. A balance pass on the shared fixture, and localization of all new strings
   (English first, then every locale at release).

### Ranked roadmap (rough effort: S under 1 week, M 1 to 3 weeks, L 1 to 2 months, XL over 2 months)
| Rank | Item | Effort | Depends on |
|---|---|---|---|
| 1 | Strip crypto and membership power from the build; rebrand | M | none |
| 2 | Quest XP and copper retune, plus the life-skill XP tune | S | none |
| 3 | Five-faction sim swap (in progress) | M | none |
| 4 | Seamless map and region build-out (in progress) | XL | Bands in section 2 |
| 5 | Campaign quests, Chapters Two to Seven (Chapter One is written) | XL | 4 |
| 6 | Housing phases 4 to 6, lots, size tiers, garden | L | none |
| 7 | Durability and repair, economy sinks | M | none |
| 8 | Faction boards and quartermasters | M | 3 |
| 9 | The Last Keep and Dawnhold encounters, Wildheart reframe | L | 4 |
| 10 | Town restoration projects | L | 3, 6 |
| 11 | Furniture catalog, free placement, guests | L | 6 |
| 12 | Gathering node tiers 4 and 5 with tools | M | 4 |
| 13 | Shared-fixture class balance pass | M | none |
| 14 | Forge raid finish and its Galecrest entrance | L | 4 |
| 15 | Steam store cosmetics and storefront | M | 1 |
| 16 | Hired helpers, Mythic+, guild halls | after launch | |

### Top risks
1. **Scope.** A much larger seamless map plus seven chapters is the largest
   cost. Mitigation: ship the core bands densely and leave optional areas
   thin.
2. **Steam policy.** The crypto layer must be removed, not just hidden.
3. **Low population.** The game needs a single large realm, solo-friendly
   delves, a finder across the whole realm, and queue rewards for tanks.
4. **Inherited complexity.** The upstream engine is very large. Every change
   must respect the monolith budget and parity rules, and merges from
   upstream bring drift.
5. **Economy inflation** without repair and tax.
6. **Naming and IP.** Every new proper noun needs the naming check
   (`docs/design/naming-audit.md`).
7. **Localization load.** Every new string needs a `t()` key.

---

## 11. Owner decisions and open questions

### Decided (owner, 2026-11)
- **Level cap.** 20 at launch. Each later chapter raises it by 5
  (`docs/design/wyndlewood-chapter-roadmap.md`).
- **Time to cap.** About 30 hours by questing. Life skills are a path to cap
  at a slower pace, about 45 hours.
- **Housing.** One house per account. Today a house is owned per character
  (`CharacterState.house`), so this needs an account-level move.
- **Repair.** Classic durability and repair is in.
- **Paid systems.** Membership is off for Early Access. The crypto layer is
  removed from the Steam build. The systems crew is doing both on
  `feature/core-systems`.
- **Factions.** Reputation comes from activities
  (`docs/design/wyndlewood-faction-ladder.md`):
  - Lanternwardens for combat, patrol and escort;
  - Hearthwright for crafting, building, housing and restoration;
  - Bracken for gathering and cleansing;
  - Gilt for trading, the market and buy orders.
- **PvP.** Opt-in at launch. An arena or PvP zone comes later.
- **First mount.** At level 10 (systems crew).
- **The map.** It grows to include:
  - the Southern Reaches row at 6 to 13;
  - a further south row at 11 to 15;
  - a west column for the 16 to 20 branches;
  - a cart and ferry network;
  - the Hushmist frontier.
  The longest trip is about 15 minutes on foot at launch.

### Still open
1. **Business model after Early Access.** Buy-to-play plus cosmetics plus
   expansions, with or without a cosmetic-only subscription? Does membership
   return later, and if so as cosmetic only?
2. **Faction depth.** Can one character max all four factions, with moral
   choices only tilting standing? (Recommended: yes; the ladder assumes it.)
3. **Faction gear.** Re-budget the shipped quartermaster gear down to the
   quest tier, as the ladder proposes? (Recommended: yes.)
4. **Chapters as releases.** Are post-launch chapters paid expansions, free
   updates, or alternating (roadmap R1)? And at what cadence (R4)?
5. **Prestige at the first cap raise.** Freeze prestige ranks as a cosmetic
   record, or convert them (roadmap R2)?
6. **`zeroDiff`.** Correct it to the classic table for levels 16 to 19 at
   launch, or only when the cap rises (roadmap R3)?
7. **Mage Chronomancy.** List it as a finder healer, or change its role?
8. **Names.** Approve "the Oathless King" (decisions file, item 4), and
   rename the Royal Forgemaster (bible Garrick Vellthorn) to avoid the
   Garrick Holt clash.
9. **Realms.** One large realm at launch, or several?
10. **Eshmara's end.** Does she yield and survive at the end of Dawnhold
    (as designed), or die?

---

## Appendix A: snapshot (2026-11-04, `feature/player-housing` at 64d84727)

These numbers will go stale. Re-measure them; do not cite them.

| Measure | Value |
|---|---|
| XP to reach level 20 | 167,200 |
| Share of that XP in levels 16 to 20 | 45% |
| One-time quest XP in the leveling zones (Proving Shore to Willowfen) | about 400,000 (about 2.4 times the climb) |
| Quests by region (Proving Shore, Eastbrook, Farshore, Mirefen, Thornpeak, Veiled Hollow, Drakelands, Frostveil, Amberfall, Willowfen) | 10, 36, 9, 29, 35, 17, 8, 12, 8, 8 |
| Average quest XP in those regions | 115, 411, 538, 1305, 3351, 4576, 4325, 4166, 4125, 4400 |
| House lot prices | 10g, 25g, 50g |
| Chapter One file | 28 quests plus 12 daily templates at levels 1 to 4. Faction tags: Hearthwright 16, Lanternwardens 13, Bracken 6, Gilt 5 (dailies included) |
