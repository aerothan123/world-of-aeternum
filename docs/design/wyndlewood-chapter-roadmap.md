# Wyndlewood: chapter roadmap

Status: proposal. This plan builds on the owner decisions recorded in
`docs/design/wyndlewood-game-plan.md`, section 11:
- the cap stays at 20 at launch;
- each later chapter raises the cap by 5;
- one house per account;
- membership off for Early Access, and crypto removed from the Steam build.

Read it alongside the story bible (`docs/narrative/wyndlewood_bible.md`, on
`docs/wyndlewood-bible`).

Naming. **Launch** is the whole bible campaign, The Unravelling, chapters One
to Seven, levels 1 to 20. Post-launch releases continue the numbering:
Chapter Eight, Nine, Ten. Each is one paid or free content release that
raises the cap by 5 (open question R1).

Labels: EXISTS, NEEDS WORK, MISSING, as in the main plan.

---

## Summary

| Release | Cap | XP for its levels | Opens | New group content | Story thread |
|---|---|---|---|---|---|
| Launch (Ch 1 to 7) | 20 | 167,200 (levels 1 to 20) | All 15 bible regions, plus the Southern Reaches rows | 5 five-player dungeons, The Last Keep and Dawnhold rebuilt, the Nythraxis raid, the forge raid (Ignivar) | The Unravelling; Vauldren sealed |
| Chapter Eight | 25 | 136,800 (20 to 25) | The first Hushmist ring past the Galecrest | 2 five-player dungeons, 1 ten-player raid | The broken forge network: the infrastructure is still damaged |
| Chapter Nine | 30 | 195,000 (25 to 30) | The second ring, a coast and a deep forest | 2 five-player dungeons, 1 raid | What else fed on the Unravelling (the Nythraxis line) |
| Chapter Ten | 35 | 274,100 (30 to 35) | The third ring, and the first guild town sites | 2 five-player dungeons, 1 raid, guild town control | The seal on Vauldren weakens; the Pale Accord's last schism |

Time per chapter: at the launch tuning of about 1.5 hours per level (owner
decision: about 30 hours to 20 by questing), each chapter is about 7 to 9
hours of leveling. That is the classic expansion shape: a short climb, then
a long cap.

---

## 1. The XP curve past 20 (grounded)

`XP_TABLE` in `src/sim/types.ts` is exactly the classic-era formula:

- XP to level = round_100((8 x L + Diff(L)) x (45 + 5 x L)).
- Diff is 0 up to level 28, then 1, 3 and 6 at levels 29 to 31, then
  5 x (L - 30) from 32.
- The term 45 + 5 x L is the same per-mob base that `mobXpValue` uses.

The formula reproduces every row of `XP_TABLE` for levels 1 to 20. So a cap
raise extends the table with the same formula, not with new numbers:

| Level | Bar | Kill XP at level | Average quest at 10% (target) |
|---|---|---|---|
| 20 | 23,200 | 145 | 2,320 |
| 21 | 25,200 | 150 | 2,520 |
| 22 | 27,300 | 155 | 2,730 |
| 23 | 29,400 | 160 | 2,940 |
| 24 | 31,700 | 165 | 3,170 |
| 25 | 34,000 | 170 | 3,400 |
| 26 | 36,400 | 175 | 3,640 |
| 27 | 38,900 | 180 | 3,890 |
| 28 | 41,400 | 185 | 4,140 |
| 29 | 44,300 | 190 | 4,430 |
| 30 | 47,400 | 195 | 4,740 |
| 31 | 50,800 | 200 | 5,080 |
| 32 | 54,500 | 205 | 5,450 |
| 33 | 58,600 | 210 | 5,860 |
| 34 | 62,800 | 215 | 6,280 |

Engineering notes:
- **NEEDS WORK: `zeroDiff`.** Today it returns 8 for every level above 15.
  The classic table is 9 for levels 16 to 19, 10 for levels 20 to 29, and 11
  for levels 30 to 39. Extend it when the cap rises past 20, and decide
  whether to correct levels 16 to 19 at the same time.
- **NEEDS WORK: post-cap XP.** `PRESTIGE_XP_PER_RANK` is `xpForLevel(MAX_LEVEL)`.
  The virtual-level table (`xpToReachLevel`) is built from `XP_TABLE`, then
  grows geometrically past the cap. Raising `MAX_LEVEL` moves both. Before
  Chapter Eight, a migration has to decide:
  - what happens to existing prestige ranks (recommended: freeze them as a
    cosmetic record);
  - whether post-cap XP banked at 20 converts into real levels (recommended:
    no, so the bar starts honestly at 20).
- Rested XP, the kill formula and quest grants need no change.
- Talent rows (`ROW_LEVELS`) and spell ranks (`docs/design/spell-ranks.md`)
  need new rows and ranks per chapter. Recommended: one new talent row at
  each chapter's cap (25, 30, 35), and new spell ranks at the classic learn
  cadence. Use the classic values; do not invent them.

---

## 2. Gear steps: a cap raise that feels good, not like a wipe

Item level is the source level plus a quality bump (`QUALITY_ILVL_BONUS`:
uncommon +1, rare +3, epic +6). The stat budget is
`primaryStatBudget` = item level x quality multiplier x slot multiplier x
`STAT_PER_ILVL` (`src/sim/item_budget.ts`).

**The cap-20 ladder (EXISTS).** Budgets below are for a chest piece, so the
slot multiplier is 1.0.

| Tier | Source level (symbol) | Item level | Chest stat budget |
|---|---|---|---|
| Level-20 quest uncommon | 20 | 21 | 8 |
| Normal dungeon rare | 20 (mob level) | 23 | 13 |
| Heroic variant rare / epic | 22 (`HEROIC_VARIANT_SOURCE_LEVEL`) | 25 / 28 | 14 / 20 |
| Heroic loot epic | 25 (`HEROIC_LOOT_SOURCE_LEVEL`) | 31 | 22 |
| Forge raid epic | 26 (`IGNIVAR_RAID_LOOT_SOURCE_LEVEL`) | 32 | 22 |
| Nythraxis raid epic | 27 (`NYTHRAXIS_RAID_LOOT_SOURCE_LEVEL`) | 33 | 23 |
| Perfected crafted | 28 (`PERFECTED_SOURCE_LEVEL`) | crafted top tier | see `docs/design/power-verification.md` |

**The rule for each chapter: every tier's source level moves up by exactly
the cap step (+5).** A new tier is always written as "the old symbol + 5",
never hand-picked. This rule does three things:
- Leveling gear in the new zones overtakes the old heroic gear by about the
  third new level.
- Old raid epics stay competitive through most of the climb. Raiders feel
  strong, not wiped. They are passed by the new heroic tier at the new cap,
  not by the first green.
- Crafted Masterwrought and Perfected pieces follow the same +5 step through
  a new recipe tier, so crafters lead the new gear curve instead of trailing
  it.

Chapter Eight example (cap 25), from the same formula:

| Tier | Source | Item level | Chest budget | Beats |
|---|---|---|---|---|
| Quest rare at 23 to 25 | 23 to 25 | 26 to 28 | 15 to 16 | the old normal and heroic rares |
| Normal dungeon rare | 25 | 28 | 16 | as above |
| Heroic variant epic | 27 | 33 | 23 | ties the old raid epics |
| Heroic loot epic | 30 | 36 | 25 | the old raid epics |
| New raid epic | 32 | 38 | 27 | everything |

**Keep the old tokens working.** When a chapter ships, the old heroic and
raid vendors drop their prices (classic catch-up). The Weekly Vault
(`docs/design/weekly-vault.md`) and world quest reward brackets gain a row
for the new band.

---

## 3. What carries over

| System | Carries over | How a chapter extends it |
|---|---|---|
| Crafting skill | Yes | A new tier rung: crafts 125 to 150, gathering 100 to 125 (`maxSkill`, with tiers set by `TIER_SKILL_STEP`). New Masterwrought recipes at the new source level |
| Gathering tools | Yes | One new tool rung per chapter, sold behind a new `vendor_row_gates.ts` gate |
| Housing (one per account) | Yes, in full | New lot towns in the new region, new furniture sets, a new trophy family. No house is ever reset |
| Reputation with the four factions | Yes | Champion stays the top tier. A chapter adds a new regional faction, or new Champion-tier cosmetic rows, never a stat row above what the chapter's quests give |
| Deeds, Reliquary, titles, borders | Yes (permanent) | New chapter deeds and pages. Old Feats stay Feats |
| Cosmetics and mount appearances | Yes | |
| Gear | Kept, and outpaced by the +5 rule over the climb | Old sets get a "reforged look" in the cosmetics window (transmog-like, EXISTS as skins) |
| Gold | Yes | New sinks per chapter: a new lot tier and a new riding rung |

---

## 4. Catch-up leveling and alts

All of these are earned in game. None is sold (fairness rules).

- **A first Hearthbearer bonus (MISSING).** Once one character on the account
  reaches the current cap, every other character on the account earns more
  XP below that cap. This is account-earned. Size it from the existing rested
  rule: double kill XP only.
- **Old content at a lower price.** The previous cap's heroic and raid
  vendors cut their prices by half when a chapter ships.
- **Mount at 10, as the owner decided (systems crew).** It cuts travel time
  for alts on the larger map.
- **Skippable story (MISSING).** After one character finishes the launch
  campaign, alts may start a chapter at its hub. The chapter's breadcrumb
  quest is offered at the hub as an alternative to the full chain.
- Never sell level boosts. A boost is power, and the Early Access shop is
  cosmetic only.

---

## 5. Keeping old zones relevant

- **Materials.** Every tier of furniture, food and town restoration keeps
  pulling lower-tier woods, herbs, fish and crops. The material taxonomy
  (`src/sim/material_taxonomy.ts`) already lets recipes name low tiers. Each
  chapter's furniture sets should include at least one recipe that uses
  launch-zone materials.
- **Faction boards in every zone.** Dailies already scale by level bracket
  (`src/sim/world_quest_daily_levels.ts`). Keep one board per launch zone
  that always pays at the player's level.
- **Housing towns.** Lots in launch towns (Eastbrook, Fenbridge, Highwatch,
  the Southern Reaches hubs) stay the most social places to live. Never
  make a new lot town strictly better.
- **Scaled old dungeons (MISSING, after launch).** A weekly "echo" mode
  scales a launch dungeon up to the current cap. It needs level scaling,
  which the sim does not have today. Build it as its own module.
- **Seasonal events** rotate through the launch towns (`src/sim/seasonal/`).
- **Treasure maps and clue scrolls** (`src/sim/content/treasure_maps.ts`,
  `clue_hunts.ts`) can send cap players back to old zones for cosmetic
  rewards.

---

## 6. The Hushmist and the map

The world crew is naming the map's frontier "the Hushmist". The launch map
places the 15 bible regions plus the Southern Reaches rows (Applewold,
Kindlemoor, Chalkbarrow Coast, and a further row at 11 to 15) inside it.
West branches serve levels 16 to 20.

**Story rule.** The Hushmist is the visible edge of the Unravelling. Where
the Hearthbinding is strong, it lifts. The bible's ending says the Hearthpins
are "restored enough to prevent immediate catastrophe, yet the ancient
magical infrastructure remains damaged". So each chapter repairs part of
that infrastructure, and one ring of mist pulls back.

**Engineering rule.** Ask the world crew to reserve the map cells for three
rings past the launch edge now. Gates and colliders should treat the
Hushmist as a world gate (`src/sim/world_gates.ts`), not as terrain, so a
chapter opens a ring by flipping a gate and adding the zone content. No
re-layout of the launch map.

| Release | Ring opened | Travel |
|---|---|---|
| Chapter Eight | Past the Galecrest (the forge complex's far side) | A new ferry or cart line from the Galecrest |
| Chapter Nine | Past the Palmreach and the Wraithwood | A coast ferry plus one land road |
| Chapter Ten | Past the Evergarden and the Nightbloom, with guild town sites | A new long road ring linking the outer zones |

Region names for the new rings are left to the world and story crews, and
each one gets the naming check before it is used.

---

## 7. Story beats per chapter (from the bible's post-campaign threads)

### Launch: The Unravelling (Chapters One to Seven, levels 1 to 20)
As the bible describes it. Endgame at 20:
- The Nythraxis raid: something older that fed on the Unravelling (bible
  section 9).
- The forge raid: the original forging process and the true cost of the
  Hearthbinding. The bible says its ending "opens the door to future story
  expansions".
- The five level-20 zones carry their own threads: the Nightbloom's memory
  eaters, the Wraithwood's spirits who believe the world should have ended,
  the Palmreach's rivals for recovered magical technology, the Evergarden's
  perfection that costs freedom, and the Galecrest's forge entrance.

### Chapter Eight (cap 25): the broken forge network
- **Hook.** The forge raid's ending opens the far side of the forge complex.
  The Hearthpins need a network of lesser forges to hold, and the first
  smiths built that network beyond the mist.
- **Factions.** The Hearthwright Compact leads this chapter. It is
  restoration-driven, and the town restoration projects scale up to whole
  villages.
- **Antagonist.** Pale Accord remnants. With Vauldren sealed, they split
  into cells that try to seize the lesser forges.
- **Dungeons.** Two five-player dungeons: a flooded forge works, and a smith
  hall where the first smiths' sacrificed identities linger. One raid: the
  forge network's heart.

### Chapter Nine (cap 30): what fed on the weakness
- **Hook.** Nythraxis was not alone (bible section 9: "something older that
  benefited from the world's weakening defenses").
- **Threads.** The Wraithwood spirits who believe the world should have ended
  become an open antagonist. The Palmreach's trading interests split the
  Gilt Measure over recovered magical technology. That split gives a moral
  choice that tilts standing, but locks nothing out.
- **Dungeons.** A spirit-haunted dungeon, a coastal ruin, and a raid against
  an elder entity.

### Chapter Ten (cap 35): the seal and the towns
- **Hook.** Vauldren was "sealed away", not destroyed, and the seal weakens.
- **Threads.**
  - The bible's long-term direction: guilds compete for influence over towns
    (bible section 11, "Guilds and Future Town Control").
  - Lady Eshmara's freed people (Chapter Five) found a new town, which is
    the first guild-contestable town site.
- **Shape.** Guild town control arrives as opt-in, faction-flavored
  competition. It is PvE contribution first, with PvP only where players
  flag for it (owner decision: PvP opt-in).
- **Dungeons.** Two five-player dungeons and a raid at the seal.

---

## 8. Open questions (roadmap only)
- **R1.** Are chapters paid expansions, free updates, or alternating?
- **R2.** When the cap first rises, freeze prestige ranks as a cosmetic
  record (recommended), or convert them?
- **R3.** Correct `zeroDiff` for levels 16 to 19 to the classic table (9) at
  launch, or only when the cap rises?
- **R4.** Release cadence: one chapter every 6 to 9 months (recommended for
  the team size)?
