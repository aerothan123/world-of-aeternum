# Wyndlewood: progression math and band tables

Companion to `docs/design/wyndlewood-game-plan.md`, section 2. Every formula
here is read from the code: `XP_TABLE`, `xpForLevel`, `mobXpValue`,
`zeroDiff` and `MAX_LEVEL` in `src/sim/types.ts`, `grantXp` in
`src/sim/combat/damage.ts`, and quest turn-in in
`src/sim/quests/quest_commands.ts`. The only new numbers are design targets,
and each is marked **target**.

## 1. The curve as shipped

- Each level's bar is `xpForLevel(L)`, read from `XP_TABLE`.
- Kill XP at the same level is 45 + 5 x L (classic). A higher-level mob pays
  up to 20% more (+5% per level, max 4 levels). A lower-level mob pays less,
  falling linearly to 0 at `zeroDiff(L)` levels below.
- Quest XP is the flat `xpReward` on the quest record. It never scales with
  level, so out-leveled quests still pay in full.
- Rested XP doubles kill XP only, while the rested pool lasts.

| Level | Bar | Kill XP at level | Kills to fill one bar | 10% quest (target) | 25% ceiling |
|---|---|---|---|---|---|
| 1 | 400 | 50 | 8 | 40 | 100 |
| 2 | 900 | 55 | 17 | 90 | 225 |
| 3 | 1,400 | 60 | 24 | 140 | 350 |
| 4 | 2,100 | 65 | 33 | 210 | 525 |
| 5 | 2,800 | 70 | 40 | 280 | 700 |
| 6 | 3,600 | 75 | 48 | 360 | 900 |
| 7 | 4,500 | 80 | 57 | 450 | 1,125 |
| 8 | 5,400 | 85 | 64 | 540 | 1,350 |
| 9 | 6,500 | 90 | 73 | 650 | 1,625 |
| 10 | 7,600 | 95 | 80 | 760 | 1,900 |
| 11 | 8,800 | 100 | 88 | 880 | 2,200 |
| 12 | 10,100 | 105 | 97 | 1,010 | 2,525 |
| 13 | 11,400 | 110 | 104 | 1,140 | 2,850 |
| 14 | 12,900 | 115 | 113 | 1,290 | 3,225 |
| 15 | 14,400 | 120 | 120 | 1,440 | 3,600 |
| 16 | 16,000 | 125 | 128 | 1,600 | 4,000 |
| 17 | 17,700 | 130 | 137 | 1,770 | 4,425 |
| 18 | 19,400 | 135 | 144 | 1,940 | 4,850 |
| 19 | 21,300 | 140 | 153 | 2,130 | 5,325 |

The table is derived from `XP_TABLE`. If that table changes, regenerate this
one; do not edit it by hand.

XP by range: levels 1 to 13 take 54,100, levels 13 to 16 take 38,700, and
levels 16 to 20 take 74,400 (45% of the 167,200 total).

## 2. Quests per level

Model:
- q = average quest XP as a fraction of the current bar.
- k = kill XP picked up per quest, as a fraction of the bar. A typical quest
  needs about 8 to 12 kills. From level 8 up, that is roughly 10% of the bar.
  Below level 8 the share is much bigger, because the early bars are small,
  so quests at levels 1 to 7 should ask for fewer kills.
- Quests completed per level is about 0.65 / q when quests supply 65% of the
  XP. The rest comes from the kills those quests require plus free grinding.

| Convention | q | Quests completed per level | Offered per level (1.4x supply) | Offered for levels 1 to 20 |
|---|---|---|---|---|
| Shipped today | about 0.18 to 0.25 | about 3 | about 4 to 5 | about 85 |
| **Target** | 0.10 | about 6 to 7 (about 5 counting kills from dungeons and gathering) | about 7 | about 130 to 140, plus dailies |

Because quest XP is a share of each level's bar, quests per level stays flat
across the levels. Zones covering more levels need proportionally more
quests.

**Time to cap (target).**
- About 5 quests per level at 8 to 12 minutes each, including travel on the
  larger map.
- About 20 minutes per level of dungeons, kills and life skills on top.
- Total: roughly 1.3 to 1.8 hours per level, which is 25 to 35 hours to
  reach 20.

Faster options:
- q = 0.15 gives about 15 to 20 hours.
- Today's ratio gives about 10 to 12 hours.

## 3. Per-band quest budget (target ratio)

| Band | Core levels | Level spans | Offered quests | Main story quests (bible: 20 to 30 total) | Life-skill chains | Faction dailies |
|---|---|---|---|---|---|---|
| Proving Shore | 1 to 2 | 1 | 7 to 10 | 3 to 4 | 1 (fishing) | 0 |
| Eastbrook Vale | 2 to 7 | 5 | 28 to 36 | 6 to 8 | 2 (carpentry and housing intro, farming) | 4 |
| Farshore | 4 to 7 | 3 (parallel) | 15 to 20 | 2 to 3 | 1 (boat repair: needs the new mechanic) | 2 |
| Mirefen Marsh | 7 to 13 | 6 | 35 to 45 | 4 to 5 | 2 (herbalism, tannery) | 4 |
| Thornpeak Heights | 13 to 16 (and 18 to 20) | 3 plus a chain | 25 to 35 | 3 to 4 | 2 (mining, forge) | 4 |
| Veiled Hollow | 15 to 17 | 2 | 12 to 16 | 2 to 3 | 1 | 2 |
| Drakelands | 16 to 18 | 2 | 12 to 16 | 2 | 1 | 2 |
| Frostveil Reach | 17 to 19 | 2 | 12 to 16 | 2 | 1 | 2 |
| Amberfall | 18 to 20 | 2 | 12 to 16 | 2 | 1 | 2 |
| Willowfen | 19 to 20 | 1 to 2 | 12 to 16 | 2 to 3 (finale) | 1 | 2 |
| Each level-20 zone | 20 | none | 6 to 10 story | 0 to 1 | 1 | 3 to 4 |

Notes:
- The 16 to 20 zones overlap on purpose. Together they offer about 60 to 80
  quests for 4 levels (74,400 XP). A player completes about 25 to 30 of them,
  plus dungeons, and can skip a zone.
- The Chapter One file supplies the Proving Shore and Eastbrook levels 1 to 4
  (28 quests and 12 dailies), which roughly fills levels 1 to 4 at the
  target ratio. Eastbrook levels 5 to 7 still need about 15 quests (Chapter
  Two and side quests).
- Quest objectives must stay within the supported types listed in the bible
  (kill, collect, interact, escort, gather, craft). Boat repair, moral
  branches, and quest credit for fishing and real-tree chopping need sim
  modules first (decisions file, item 5).

## 4. Dungeons per band

| Band | Dungeon | Finder levels (`dungeon_finder.ts`) | Status |
|---|---|---|---|
| 7 to 10 | Hollow Crypt | 7 to 10 | EXISTS |
| 12 to 13 | Sunken Bastion | 12 to 13 | EXISTS |
| 14 to 16 | The Last Keep | none | MISSING: today it is a walk with no fights. Build it as a 5-player dungeon at 14 to 16 to fill the gap |
| 16 to 18 | Drowned Temple | 16 to 18 | EXISTS |
| 16 to 18 | Dawnhold Castle | none | MISSING: a walk today. Build it at 16 to 18, or at 17 to 19 to spread the bands |
| 19 to 20 | Gravewyrm Sanctum | 19 to 20 | EXISTS |
| 20 | Wildheart Basin | 20 | EXISTS. Reframe it as the final ritual |
| 20 | Heroic versions of each | 20 | EXISTS (daily lockout) |
| 20 | Nythraxis raid (10-player) | 20 | EXISTS |
| 20 | Forge raid (10-player) | 20 | EXISTS, partly a dev tier |

Dungeon XP: per-member dungeon kill XP is lower than solo kill XP by design
(`docs/design/master-spec.md`). Dungeons are loot and story stops, not the
fastest XP. Keep that.
