# Wyndlewood: faction reputation ladder

Status: proposal for the faction crew. It builds on the owner decision that
reputation comes from **activities**, not zones:
- **Lanternwardens:** combat, patrol, escort.
- **Hearthwright Compact:** crafting, building, housing, restoration.
- **Bracken Circle:** gathering, cleansing.
- **Gilt Measure:** trading, the market, buy orders.
- **Pale Accord:** hostile, with no reputation.

The code anchors today are:
- `src/sim/factions.ts`: `STANDING_TIERS`, `STANDING_THRESHOLDS`,
  `maxStandingForLevel`, `awardFactionReputation`,
  `worldQuestStandingReward`;
- `src/sim/content/faction_vendors.ts`: `FACTION_VENDOR_GATES`;
- `docs/design/factions.md`.

## Summary
- Keep the six shipped tiers and thresholds. Keep `awardFactionReputation`
  as the only mutation, and keep the level-bracket clamp.
- Standing per action = **base value for the activity x a content-level
  factor**. The factor uses the same green-to-gray shape as `mobXpValue` and
  `profession_xp.ts`, but with a floor of 20%, so old zones still pay a
  little.
- The daily nominal is **400 standing per faction at levels 16 to 20**. That
  matches the shipped synchronized world-quest rate, and gives Champion in
  about 4 to 6 weeks of focused play per faction, counting the weekly
  commendation.
- Repeatable activities have **daily caps**. Story quests do not. There is no
  weekly cap besides the shipped weekly commendation.
- **Rewards never give raw power above what quests give.** This changes the
  shipped quartermaster ladders, which copy heroic and raid budgets (see
  section 5).

---

## 1. Tiers (EXISTS: keep)

| Tier | Threshold (`STANDING_THRESHOLDS`) | To next | Clamp |
|---|---|---|---|
| Unknown | 0 | 1,000 | |
| Recognized | 1,000 | 2,000 | |
| Trusted | 3,000 | 4,000 | Levels 15 and below stop here (`LOW_LEVEL_MAX_STANDING`) |
| Proven | 7,000 | 6,000 | |
| Vanguard | 13,000 | 7,000 | |
| Champion | 20,000 | none | `MAX_STANDING` |

Flavor titles per faction come from `FACTION_TIER_TITLES` (`t()` keys under
`hudChrome.reputation`). Proposed English sets are below. They are plain
generic words, but each still gets the naming check.

| Tier | Lanternwardens | Hearthwright Compact | Bracken Circle | Gilt Measure |
|---|---|---|---|---|
| Recognized | Lamp Runner | Apprentice Hand | Hedge Friend | Ledger Clerk |
| Trusted | Road Warden | Journeyman | Grove Walker | Broker |
| Proven | Watch Sergeant | Master Hand | Rootkeeper | Factor |
| Vanguard | Lantern Captain | Hearthwright | Circle Elder | Merchant Prince |
| Champion | Keeper of the Long Night | Builder of Hearths | Voice of the Old Wood | Gilt Councillor |

When a chapter raises the cap (`docs/design/wyndlewood-chapter-roadmap.md`),
the clamp moves with it: Trusted for anyone 5 or more levels below the cap.

## 2. The standing formula

```
standing(action) = round( base(activity) x bracket(playerLevel) x levelFactor(contentLevel, playerLevel) )

bracket(L)  = 0.3 for L <= 15, 1.0 for L >= 16
              (the shipped ratio: 30 against 80 to 100 per world quest)

levelFactor = 1.0                            if content is at or above the player's level
            = max(0.2, 1 - diff / zeroDiff(L)) if content is diff levels below
```

- Content level is the quest's level, the node's `level`, the recipe's
  level, the dungeon's finder band, or the zone's `levelRange` for an open
  activity.
- The 0.2 floor is deliberate. Gray content gives no XP, but it still gives
  a fifth of its standing, so a cap player farming launch-zone materials
  for a town project is still credited.
- Implement the formula as one pure module (`src/sim/faction_standing.ts`,
  MISSING) that every activity grant calls. Do not add a per-activity rule
  in each system.

## 3. Standing per activity (base values at bracket 1.0)

| Faction | Activity | Base | Daily cap | Hook point (EXISTS unless marked) |
|---|---|---|---|---|
| All | Faction daily board quest | 100 | 4 per faction per day | Quest boards (quest-board crew) |
| All | One-time story or side quest tagged with the faction | 75 | none | Quest turn-in, `quest_commands.ts`. The Chapter One file already tags every quest |
| All | Weekly emissary commendation | shipped value | 1 a week | `commendWeeklyQuest`, `WEEKLY_QUEST_REWARD` |
| Lanternwardens | World quest in the zone (combat, patrol, defense) | 80 | shipped circuit | `awardWorldQuest`, re-keyed by activity |
| Lanternwardens | Five-player dungeon final boss, normal | 150 | 2 per day | Dungeon clear (`dungeonClears`) |
| Lanternwardens | Heroic dungeon final boss | 250 | daily lockout | `awardHeroicMarks` path |
| Lanternwardens | Escort completed | 75 | none (quest) | `src/sim/escort.ts` |
| Lanternwardens | Pale Accord elite or cell leader killed | 10 | 100 | Mob kill, tag `paleAccord` (MISSING tag) |
| Hearthwright | Work order turned in | 100 | the order cadence | `src/sim/professions/cadence.ts` |
| Hearthwright | Commission fulfilled (Maker's Bond) | 50 | 150 | `commission.ts` |
| Hearthwright | Town restoration contribution bundle | 25 | 200 | Town projects (MISSING) |
| Hearthwright | Housing milestone (first house, a room theme deed, first trophy) | 250 | one-time each | Deeds, `src/sim/housing/` |
| Hearthwright | Craft a recipe at or above your tier (first time) | 10 | 100 | `crafting.ts` |
| Bracken Circle | Gather a node, patch or catch in the faction's marked areas | 2 | 150 | `gathering.ts`, `farming.ts`, `fishing.ts` |
| Bracken Circle | Cleanse a corrupted object or spirit site | 25 | 200 | Use item on object (story crew) |
| Bracken Circle | Farm or fish delivery to a Circle keeper | 50 | 150 | Delivery quests |
| Gilt Measure | Buy order filled for another account | 1 per 1 silver of order value, at most 50 per fill | 200 | `market_orders.ts` |
| Gilt Measure | Market sale completed | 5 | 100 | `market_sale_log.ts` |
| Gilt Measure | Caravan or trade contract | 100 | 2 per day | `world_quest_caravans.ts`, contract quests |

**Anti-abuse rules for Gilt Measure.**
- Fills between characters on the same account never pay standing.
- A buy order must be at least one daily reset old before its fills pay.
- Standing is paid on the order's value, capped at the market's own recent
  median price for the item (`market_sale_log.ts`), so wash trading at
  silly prices pays nothing extra.

**Pace check, at levels 16 to 20.**
- The four board dailies give 400 a day.
- One commendation a week (1,000 today, `commendationStanding`) adds about
  140 a day.
- Repeatable caps add 100 to 200 a day for a player who leans into an
  activity.
- That is 540 to 740 a day, so Champion (20,000) takes 4 to 6 weeks for one
  faction. Spreading across all four gives every Champion in about 4 to 5
  months.

## 4. Weekly caps
- No new weekly cap. Daily caps on repeatables plus the cadence of dailies
  already bound the pace.
- Keep the shipped one-claim weekly commendation.
- **Catch-up.** Once a character holds Champion with a faction, standing
  earned with that faction converts to +25% standing with the account's
  lowest faction. This rewards alts and spread play without buying anything.

## 5. Rewards per tier (no pay-for-power; no raw power above quests)

Rule: a faction's gear is capped at the **budget of the level-20 quest
reward for its slot** (item level = quest source level + quality bump, by
`primaryStatBudget`). Factions fill empty slots and supply looks, patterns,
furniture, titles and mount appearances. Heroic and raid budgets stay in
heroics and raids.

**NEEDS WORK: the shipped ladders break this rule.** `FACTION_VENDOR_STOCK`
copies the heroic five-man and raid offset budgets
(`docs/design/factions.md`). For Wyndlewood:
- re-budget those rows down to the quest tier, or replace them with
  cosmetic twins;
- keep the existing pin pattern (`tests/faction_vendors.test.ts`), but point
  each mirror at a quest-reward row instead of a heroic or raid row.

Enchant formulas whose effect beats quest-tier enchants move to crafting
trainers or drops.

| Tier | Lanternwardens | Hearthwright Compact | Bracken Circle | Gilt Measure |
|---|---|---|---|---|
| Recognized | Tabard; a quest-tier neck | Furniture pattern set 1 (benches, lanterns); a work apron look | Seed packets (rare crops); a herb satchel look | A merchant's ledger toy; bag dye |
| Trusted | Quest-tier ring; a lantern-staff toy; title | Pattern set 2 (beds, wardrobes); +1 house storage chest pattern (furniture, not slots for sale) | Garden furniture patterns; a fishing rod look | Bag at the quest-reward bag size; a market stall cosmetic for your house |
| Proven | Patrol armor look set (cosmetic); a recall-to-watch-post item on a long cooldown (travel, not power) | Station furniture patterns for a second home station; town project blueprint unlocks | Herbalism and logging tool looks; a spirit lantern pet | Trade caravan cosmetic; a counting-house wall set |
| Vanguard | Mount appearance (same speed as the level-10 mount) | A room theme set with a theme deed | Mount appearance (a moor elk look) | Mount appearance (a gilded cart horse look) |
| Champion | Title; a heraldry border; a warden's banner for your house | Title; a hearth-forge centerpiece (decor); a border | Title; a living-tree centerpiece; a border | Title; a gilded border; a vault-door furniture piece |

All mount appearances ride the existing skin plumbing
(`src/sim/content/mount_skins.ts`) and never change speed.

Every Champion and Vanguard reward also gets:
- a Book of Deeds record (cosmetic, `docs/design/deeds.md`);
- a Reliquary relic slot on a per-faction Horizons page
  (`docs/design/reliquary.md`).

Currency: keep the shipped mark costs for formula, toy and mount rows
(`FORMULA_MARKS`, `TOY_MARKS`, `MOUNT_MARKS`). Coin-priced cosmetic rows are
a gold sink.

## 6. Vendors and where they stand

The main quartermaster stands in Eastbrook, the launch hub. A branch
quartermaster in a later hub sells the same ladder.

| Faction | Main quartermaster | Branch quartermasters |
|---|---|---|
| Lanternwardens | Corren, Eastbrook training yard | Causeway Watch, Fenbridge (Warden Fenwick), Highwatch |
| Hearthwright Compact | Pella Nookwright, Eastbrook carpenter's yard | Pressford, Highwatch forge |
| Bracken Circle | Ivara, Eastbrook apothecary | Ferncross, the First Hearth Ring |
| Gilt Measure | Silven, Eastbrook market stall | Coinwell Camp, the Palmreach |
| Pale Accord | none | none (hostile camps only) |

The world quest taskmaster role (Taskmaster Kaelen today) becomes a neutral
board keeper in Eastbrook.

## 7. Migration from the three shipped factions
The faction crew owns this. Recommended map for existing saves:
- `church_order` standing goes to Lanternwardens.
- `rift_watch` goes to Bracken Circle.
- `automatons` goes to Hearthwright Compact.
- Gilt Measure starts at 0.
- Each map keeps the tier reached, so no character loses a tier.
