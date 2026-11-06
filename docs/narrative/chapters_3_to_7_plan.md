# Wyndlewood: Chapters Three to Seven plan

The rest of the "Unravelling" campaign, built as data on the Chapter Two
bundle seam (`src/sim/content/chapter_two.ts` `applyChapterTwoBundle`), one
module per chapter, merged by `src/sim/content/story_chapters.ts`. Read with
`wyndlewood_bible.md` (section 7) and `wyndlewood_decisions.md`; where this
file differs from the bible, it is because the owner chose to bend chapters
to the shipped dungeon levels and the existing zones (no map expansion).

## Rules this plan follows

- **Zones and dungeons as shipped.** Every quest stands in a live zone and
  every dungeon tie-in is a shipped instance at its shipped level band. Where
  the shipped instance is a walk-in with no fight (the Last Keep, Dawnhold
  Castle), the chapter's villain is met outside and the dungeon step is an
  ownership objective on the keepsake waiting inside (`keepsCollectedItems`).
- **Objectives the sim supports today:** kill, collect (ground pickups,
  dungeon keepsakes), interact (inspect, use a loaned item on an object, pick,
  craft at a quest station) and talk. No escort, no branching choice (the
  bible's moral choices are told in the prose; branching waits for its sim
  module, decisions section 5).
- **Rewards at quest-reward strength:** the Chapter Two builder, so the
  authored XP is the outline size on the quest level's bar (small 7, medium
  10, large 20 percent; `quests/quest_xp.ts` prices the live turn-in), copper
  on the shipped ladder, and the faction's story standing
  (`questStandingReward`, 75). No item rewards, so no new unique loot and no
  Reliquary pages.
- **No new art.** Every new item is a `kind: 'quest'` id on the procedural
  quest icon (`STORY_CHAPTERS_ART_PENDING_ITEM_IDS`); new foes reuse shipped
  bodies (same per-level coefficients, so no invented balance numbers); new
  NPCs use the default NPC look until the look crew dresses them.
- **Same-change obligations:** world entity names (`src/ui/world_entity_i18n.ts`),
  English item names (`src/ui/i18n.catalog/items.ts`), one cosmetic chronicle
  deed per chapter, ground-pickup proofs (`src/sim/deeds.ts`), pending art,
  wiki regen, and a test file per chapter on the shared suite
  (`tests/story_chapter_suite.ts`).

## Level bands, redrawn

| Chapter | Levels | Zones | Dungeon tie-in (shipped band) |
|---|---|---|---|
| Three: The Marsh That Remembers | 13 to 16 | Mirefen Marsh, Thornpeak Heights (Glimmermere) | The Drowned Temple (16 to 18), Ysolei |
| Four: Iron Hearts and Empty Crowns | 16 to 18 | Thornpeak Heights, Eastbrook Vale (Brunna), the Drakelands | The Last Keep (walk-in), the garrison signet |
| Five: The Kingdom Behind the Mist | 18 to 19 | The Veiled Hollow, the Evergarden lawn, the Drakelands (hand-off) | Dawnhold Castle (walk-in), the garden posy |
| Six: Ash, Ice, and the Sleeping Crown | 19 to 20 | The Drakelands, the Frostveil Reach, Thornpeak Heights | Gravewyrm Sanctum (19 to 20), Korzul |
| Seven: The Last Hearthlight | 20 | The Amberfall, the Willowfen, Eastbrook Vale | The Wildheart Basin (20), Zulgar, Voice of the Basin |

Chapter Two already carries the bible's Mirefen beats to level 13 and closes
at the Sunken Bastion, so Chapter Three opens after `q_mistcaller`.

## Chapter Three: The Marsh That Remembers (13 to 16)

Faction beats: the Bracken Circle reads the marsh's memory, the Lanternwardens
break the Pale Accord's harvest, the Hearthwright Compact takes the forge
script up the mountain.

| Id | Level, size | Giver to turn-in | Objectives | Faction |
|---|---|---|---|---|
| c3_01_fog_takes_a_village | 13, medium | Chronicler Osric Fenn | inspect 3 Fogbound Doorsteps (Fenbridge) | Bracken Circle |
| c3_02_mud_remembers | 13, medium | Herbalist Yara | collect 5 Memory Silt (ground); kill 6 Bog Bloat | Bracken Circle |
| c3_03_machine_in_the_reeds | 14, large | Scout Maren | kill 6 Gravecaller Summoner; inspect 3 Accord Memory Engines; collect 3 Brass Memory Cogs (ground) | Lanternwardens |
| c3_04_letters_for_the_tarn | 14, small | Brother Aldric (Fenbridge) to Ondrel Vane | talk to Ondrel carrying the Accord Harvest Ledger | Lanternwardens |
| c3_05_frightened_or_dangerous | 15, medium | Ondrel Vane | lay Calming Reeds on 3 wader nests (loaned); kill 6 Drowned Votary | Bracken Circle |
| c3_06_mistress_of_the_harvest | 16, large | Ondrel Vane | kill Mistress Veska Noll; collect 4 Harvested Memory Jars (ground) | Lanternwardens |
| c3_07_what_the_temple_keeps | 16, large | Ondrel Vane | kill Ysolei in the Drowned Temple | Bracken Circle |
| c3_08_records_in_the_mountain | 16, medium | Ondrel Vane to Loremaster Caddis | talk to Caddis carrying the First Age Temple Rubbing | Hearthwright Compact |

New named entities: **Mistress Veska Noll** (Pale Accord elite, level 16, on
the Threnos body, one offStream camp on the Glimmermere's east shore; listed
under the Pale Accord in `factions.ts`). Deed: **The Marsh That Remembers**.

## Chapter Four: Iron Hearts and Empty Crowns (16 to 18)

Faction beats: the Compact's miners and Brunna read the willful ore, the
Lanternwardens stop the forgemaster at the keep gate, the Compact carries the
forge plan into the Hollow.

| Id | Level, size | Giver to turn-in | Objectives | Faction |
|---|---|---|---|---|
| c4_01_metal_with_a_will | 16, small | Loremaster Caddis to Odrik Caskwell | talk to Odrik | Hearthwright Compact |
| c4_02_dig_down_not_tomorrow | 16, medium | Odrik Caskwell | kill 10 Deeprock Kobold; collect 5 Willful Ore (ground) | Hearthwright Compact |
| c4_03_forges_without_fuel | 17, medium | Odrik Caskwell | kill 8 Stormcrag Elemental; inspect 3 Unfed Mountain Forges | Lanternwardens |
| c4_04_what_metal_tells | 17, medium | Odrik Caskwell to Brunna Flintmorrow (Eastbrook) | talk to Brunna carrying a Sample of Willful Ore | Hearthwright Compact |
| c4_05_the_keep_road | 17, small | Brunna to Scout Yerrin (Drakelands) | talk to Yerrin carrying Brunna's Sealed Letter | Hearthwright Compact |
| c4_06_forgemaster_at_the_gate | 18, large | Scout Yerrin | kill Forgemaster Hamlin Vellthorn; collect 2 Scorched Forge Plans (ground) | Lanternwardens |
| c4_07_last_keep_remembers | 18, large | Scout Yerrin to Keeper Saelwyn (Veiled Hollow) | carry the Signet of the Last Keep out of the keep (kept) | Hearthwright Compact |

New named entities: **Odrik Caskwell** (Mine Foreman, new NPC by the mine
road east of Highwatch), **Forgemaster Hamlin Vellthorn** (the bible's
Garrick Vellthorn, renamed so he never reads as the shipped Garrick Holt;
elite level 18 on the Threnos body, one offStream camp at the keep road).
Deed: **Iron Hearts and Empty Crowns**.

## Chapter Five: The Kingdom Behind the Mist (18 to 19)

Faction beats: the Circle watches the veil fray, the Compact and the Gilt
Measure read the two histories, the Lanternwardens open the barrier. Eshmara
is not fought: she chooses to let her people go.

| Id | Level, size | Giver to turn-in | Objectives | Faction |
|---|---|---|---|---|
| c5_01_the_mist_opens | 18, medium | Keeper Saelwyn | inspect 3 Thinning Veils | Bracken Circle |
| c5_02_the_feast_that_repeats | 18, medium | Loremother Bryn | kill 8 Corrupted Sporeling; inspect 4 Thrice-Lit Festival Lanterns | Hearthwright Compact |
| c5_03_two_histories | 18, medium | Archivist Tullo | collect 4 Court Chronicle Pages (ground) | Gilt Measure |
| c5_04_lady_of_dawnhold | 19, small | Archivist Tullo to Eshmara Veilthorn | talk to Eshmara | Lanternwardens |
| c5_05_a_garden_out_of_season | 19, medium | Eshmara Veilthorn | kill 6 Hedge Knight | Bracken Circle |
| c5_06_the_palace_that_remembers | 19, medium | Eshmara Veilthorn | carry the Dawnhold Garden Posy out of the castle (kept) | Gilt Measure |
| c5_07_the_barrier_breaks | 19, large | Eshmara Veilthorn | touch the Borrowed Hearthpin Fragment to 3 Dawnhold Barrier Stones (loaned) | Lanternwardens |
| c5_08_dragons_stir | 19, small | Eshmara Veilthorn to Raska Emberhollow (Wyrmwatch) | talk to Raska | Gilt Measure |

New named entities: **Lady Eshmara Veilthorn** (Lady of Dawnhold, new NPC on
the lawn before the castle door), **Raska Emberhollow** (Dragon Researcher,
new NPC in Wyrmwatch; placed with this chapter because its close is the first
quest to name her). Deed: **The Kingdom Behind the Mist**.

## Chapter Six: Ash, Ice, and the Sleeping Crown (19 to 20)

Faction beats: the Circle warms the nests, the Lanternwardens bring down
Skarveth and the corrupted guardian, the Gilt Measure carries the pact north,
the Compact learns that the pins need renewal, not repair.

| Id | Level, size | Giver to turn-in | Objectives | Faction |
|---|---|---|---|---|
| c6_01_technically_a_success | 19, small | Raska Emberhollow | kill 6 Dragonkin Broodguard; collect 3 Scorched Pact Tablet Shards (ground) | Bracken Circle |
| c6_02_eggs_gone_cold | 19, medium | Raska Emberhollow | warm 4 Cold Dragon Nests with Raska's Ember Lantern (loaned) | Bracken Circle |
| c6_03_the_cinderbound | 20, large | Raska Emberhollow | kill Skarveth the Cinderbound | Lanternwardens |
| c6_04_north_to_the_frost | 19, small | Raska to Warden Kaldra (Frostveil) | talk to Kaldra carrying the Rubbing of the Dragon Pact | Gilt Measure |
| c6_05_if_the_snow_speaks | 19, medium | Warden Kaldra | kill 8 Rime Elemental; inspect 3 Dragon Barrow Stones | Lanternwardens |
| c6_06_the_sleeping_crown | 20, large | Warden Kaldra to Brother Aldric (Highwatch) | kill Korzul the Gravewyrm in the Gravewyrm Sanctum | Lanternwardens |
| c6_07_renewal_not_repair | 20, medium | Brother Aldric (Highwatch) to Reeve Ottoline (Amberfall) | talk to Ottoline carrying the Pact Keeper's Testament | Hearthwright Compact |

New named entities: **Skarveth the Cinderbound** (elite dragon, level 20, on
the Drakemaw Broodlord body without its rare window, nest roar or quest drop;
one offStream camp above the Drakemaw nests). Neris Snowmantle is named in
prose only (she ships in Eastbrook). Deed: **Ash, Ice, and the Sleeping Crown**.

## Chapter Seven: The Last Hearthlight (20)

Faction beats: all four allied banners answer (one talk each to the four
quartermasters), the dragons are the ring's fifth people, and the player is
the link, not a chosen one. The Wildheart Basin is the ritual ground; its
final boss is reframed in quest prose as the voice through which the Oathless
King's power manifests.

| Id | Level, size | Giver to turn-in | Objectives | Faction |
|---|---|---|---|---|
| c7_01_trees_that_remember | 20, medium | Reeve Ottoline | kill 8 Gloam Fox; inspect 3 Remembering Oaks | Bracken Circle |
| c7_02_rivers_change_course | 20, medium | Ferrymaster Caddow | kill 6 Mere Lurker; inspect 3 Wandering Mooring Stones | Lanternwardens |
| c7_03_the_last_hearthpin | 20, small | Ferrymaster Caddow to Mother Sedge (Willowfen) | talk to Mother Sedge | Bracken Circle |
| c7_04_five_banners | 20, large | Mother Sedge | talk to Captain Althea, Artificer Tobrin, Herbalist Yara and Quartermaster Vaelen | Lanternwardens |
| c7_05_lanterns_for_the_rite | 20, medium | Mother Sedge | pick 5 Pale Willow Withies; bend a Hearthlight Lantern at the rite bench | Hearthwright Compact |
| c7_06_the_wildheart_rite | 20, large | Mother Sedge | kill Zulgar, Voice of the Basin, in the Wildheart Basin | Lanternwardens |
| c7_07_supper_is_getting_cold | 20, large | Mother Sedge to Jorren (Eastbrook inn) | talk to Jorren | Hearthwright Compact |

New named entities: none (all shipped people). Deed: **The Last Hearthlight**.

## IP checks (naming protocol, `docs/design/naming-audit.md`)

Exact-phrase web searches on 2026-11-06 against the major game wikis
(WoW, FFXIV, ESO via UESP, GW2, BDO codex, New World and general results).

| Name | Kind | Verdict |
|---|---|---|
| Veska Noll | mob | Clear: no game hit; only real-world surname results. |
| Hamlin Vellthorn | mob | Clear: no hit for the full name or "Vellthorn" in any game wiki. "Osgar" was considered and rejected (a WoW NPC, Osgar Smitehammer). |
| Odrik Caskwell | NPC | Clear: no hit for the full name or "Caskwell"; ESO's "Odril" and "Odrethin" are different names. Internal near-miss: Foreman Odell in Eastbrook (owner call below). |
| Eshmara Veilthorn | NPC | Clear: no hit for "Eshmara", "Lady Eshmara" or "Veilthorn". |
| Raska Emberhollow | NPC | Clear: no hit for the full name or "Emberhollow". |
| Skarveth the Cinderbound | mob | Clear: no hit for "Skarveth"; "Cinderbound" has no game-wiki hit. |
| The Marsh That Remembers, Iron Hearts and Empty Crowns, The Kingdom Behind the Mist | deeds | Clear: no game hits (book titles only, none exact). |
| Ash, Ice, and the Sleeping Crown | deed | Clear: no exact hit. |
| The Last Hearthlight | deed | Clear: "Hearthlight" is an itch.io title, not a game term; the full phrase has no hit. |

Quest titles, item and object names are plain descriptive English
(Fogbound Doorstep, Willful Ore, Thinning Veil) and need no check.

## Owner decisions for review

1. **Marla Copperbell** is not shipped; the campaign's last line is spoken by
   Jorren at the Eastbrook inn. Ship Marla, or keep Jorren?
2. **Odrik Caskwell vs Foreman Odell**: two foremen with near names. Keep the
   bible's name, or rename one?
3. **Vellthorn vs Veilthorn**: the bible's two surnames read alike. Keep both?
4. **Raska and Eshmara** ship as new NPCs with the default look; Raska stands
   in Wyrmwatch beside the shipped hub.
5. **Moral choices** (forgive or kill the waders, burn or keep the forge
   plans) are written as prose, not branches, until a choice module exists.
6. **The Oathless King** title is read from `wyndlewood_lore.ts`, still
   awaiting sign-off.
7. Gameplay pacing: 37 quests across 13 to 20 on top of the shipped zone
   chains; the live turn-in prices XP through `quest_xp.ts`.
