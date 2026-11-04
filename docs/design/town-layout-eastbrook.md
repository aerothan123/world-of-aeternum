# Eastbrook town layout: a New World style settlement (phase 2 plan)

Status: FOR OWNER REVIEW. Nothing in this document is wired into the game.
Phase 1 (this branch, `feature/town-kit`) only generated the building and
station asset set under `assets_src/town_kit/` and wrote this plan. Phase 2
relays the town in code once the owner signs off on the districts below.

Compass and units follow `docs/design/eastbrook-revamp/site-plan.md`:
distances in yards, positions as (x, z), world +z is NORTH and world +x is
WEST, so east is negative x. Every coordinate marked "proposed" is a design
target that phase 2 must re-solve against the live clearance tests before it
becomes a pinned literal; every coordinate marked "today" is read from
`src/sim/eastbrook_layout.ts` on `feature/player-housing`.

## 1. Goal

Make Eastbrook read like a New World settlement at a glance:

- one crafting district where every craft has its own, distinct,
  readable-at-distance station, grouped round a working yard;
- a trading post and a storage shed side by side, close to the square, so the
  "sell, stash, craft" loop is a few strides long;
- streets of varied houses (the player housing lots live here);
- the inn, the bank, the town board and the stable each in a predictable
  place, with the stable at the gate.

The bible (`docs/narrative/wyndlewood_bible.md`, branch
`docs/wyndlewood-bible`) describes Eastbrook as "a welcoming village with an
inn, farms, workshops, houses, merchants, crafting stations, and gathering
areas" whose unofficial leader keeps the inn, with a merchant of the Gilt
Measure and a carpenter living there, and graves on a nearby hill above the
Hollow Crypt. The plan keeps the inn as the town's emotional centre up the
lane, puts the merchant at the trading post, the carpenter by the housing
streets, and leaves the chapel and its burial ground where they are.

## 2. Eastbrook today (what the code says)

Source of truth: `src/sim/eastbrook_layout.ts` (`EASTBROOK_LAYOUT`), mirrored
by the Studio maps (`data/maps/eastbrook_rebuild.map.json`, the World of
ClaudeCraft map) and consumed by `src/sim/content/zone1.ts`,
`src/sim/content/professions.ts`, the renderer (`src/render/eastbrook_town.ts`,
`src/render/placed_town_buildings.ts`, `placed_town_interiors.ts`) and the
collider set.

| Thing | Today (x, z) | Notes |
|---|---|---|
| Player start (spawn) | (-94, -58) | on the quay; route `eastbrook_player_start_to_square` |
| Ferry bell landing (graduates) | (-92.5, -46.5), facing 2.12 | `FERRY_BELL_TOWN_LANDING`, faces up into town toward the chapel |
| Civic square centre | (-14, -102) | monument at (-14.75, -102), three benches, east quadrant kept open as the arrival lane |
| Main street (`east` road) | square to quay, 2 yd half width | (-20,-102) to (-44,-98) to (-62,-76) to (-92,-56) |
| Bank (walk-in) | anchor (-62, -118) | bursar (banker chest) and card master flank its door |
| Weekly Vault | (-73.7, -103.4) | on the bank's flank and shelf |
| Smithy (walk-in) | anchor (-4.2, -75.2) | Smith Haldren at its door, north of the square |
| Inn (walk-in tavern) | anchor (-30.3, -60.6) | up the `inn_lane`, rest area |
| Chapel (walk-in hall) | anchor (28.2, -119.6) | Brother Aldric; graveyard anchor (37.5, -99.3) |
| Apothecary shop (walk-in) | anchor (-30.6, -127.6) | on the strand; Apothecary Lin stands toward the square |
| Quay cottage (sealed) | anchor (-59.1, -51.4) | the only Eastbrook house lot (`HOUSE_LOTS`) |
| Crafts lane stations | forge, toolworks, loom south of the square; kitchens by the inn lane at about (-38, -88) | four Eastbrook stations; tannery is Fenbridge, apothecary Highwatch |
| Market stalls | world market (-20.5, -94), provisions (-19, -108) | The Merchant (World Market, the auction) at the gold stall |
| Notice board | (5, -89) | Marshal Redbrook beside it at (1.5, -95.3) |
| Mailbox | (-10, -98) | Chronicler Saul nearby |
| Farm beds | about (-21.5, -82) | Farmer Jessica |

Crafting coverage today: `STATION_TYPE_BY_CRAFT` gives a station type to
weaponcrafting and armorcrafting (forge), cooking (kitchens), alchemy
(apothecary), leatherworking (tannery), tailoring (loom) and engineering
(toolworks). Jewelcrafting, inscription and enchanting have no station of
their own and bind per recipe to a foreign one. Only four of the six types
stand in Eastbrook.

What does not read as New World today: the four stations are scattered
between the crafts lane and the inn lane; the auction is a stall on the
square edge; the bank (the storage service) is 50 yards down the main street
from the square; there is one house, and no stable.

## 3. The phase 1 asset set

`assets_src/town_kit/manifest.json` lists every generated asset (id,
category, the crafts or services it serves, the concept prompt, the Tripo
task ids, credits, triangle count, measured footprint, front yaw, GLB and
preview paths); `assets_src/town_kit/sheets/` holds one contact sheet per
category. All of them are prop-lane GLBs (base at y 0, centred, WebP 512
textures, meshopt), 2.5k to 4k triangles, with provisional heights.

- Crafting (13): forge under a timber canopy, open-air armorer's anvil,
  smelting furnace, tannery racks, loom under an awning, alchemy bench,
  cooking hearth under a lean-to, enchanting altar, jeweler's bench,
  engineering bench, scribe's desk, woodshop sawhorses, stonecutter's table.
- Housing (8): thatched plaster cottage, red-tile porch cottage, ochre
  townhouse with blue slate, whitewashed townhouse with green shingles,
  jettied timber-frame house, tall leaning timber corner house, fieldstone
  thatched cottage, three-house row terrace. Five roof materials and
  colours, single and twin chimneys, porch, porch hood and bay window
  variants.
- Civic: trading post, auction hall, open-front storage shed, storage barn,
  strongbox house, inn, stable, town board, two market stalls, roofed well,
  fountain, lamp post, hand cart, crate and barrel clutter set.

Known limits of single-image generation: the side the concept did not show
(usually the back) is plainly painted and sometimes soft in shape. Street
frontages and the yard read well; buildings whose backs face a street want
a back-to-back pairing, or a later multiview reroll.

## 4. The proposal (districts)

```
     +x WEST                                                         -x EAST
z  -40                                                                     .   ~~~~~~~
z  -44                                                                     .   ~~~~~~~
z  -48                                                                     B   ~~~~~~~
z  -52                                                     h               .   ~~~~~~~
z  -56                       .                                            ..S  ~~~~~~~
z  -60                      ..            INN      h                    ....   ~~~~~~~
z  -64                STABLE.                    ......h      h      ....  .   ~~~~~~~
z  -68                  ....                        h  ...h    .......     .   ~~~~~~~
z  -72               ....                      .         ... ...    h      .   ~~~~~~~
z  -76               .        SMITHY           .           ...             .   ~~~~~~~
z  -80               .                farm     .           .      h     h  .   ~~~~~~~
z  -84               .                          .         .                .   ~~~~~~~
z  -88               ..    N                    .       ..           h     .   ~~~~~~~
z  -92                                           .    ...                  .
z  -96                   ...                     .....
z -100 +graves             .......     .............
z -104                             @sq .       o                VAULT
z -108                         Co .        TRADE STORE
z -112                      Fo Al .               sb
z -116                     Ar     .  Lo
z -120      CHAPEL             En.w. Ta                   BANK
z -124                      Sm Je  ...
z -128                               Eg   APOTH
z -132                        Sc Wd  St
z -136
z -140 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    x   40        20        0         -20       -40       -60       -80       -100
```

Generated from the coordinates in this document at 2 yards per character
across and 4 yards per row (so it is stretched north to south). Dots are
roads (today's main street, inn lane, north road, crafts lane, plus the
proposed housing street A), `~` is water (the cove east of the quay, the
strand to the south). Kept: `S` quay spawn, `B` ferry bell landing, `@sq`
the square and monument, `N` town board, INN, SMITHY, CHAPEL, graves, BANK,
VAULT, APOTH, farm. Proposed: `TRADE` trading post, `STORE` storage shed,
`o` fountain, `sb` strongbox annex, STABLE, `h` house plots, and the yard
stations: `Fo` forge canopy, `Ar` armorer anvil, `Sm` smelter, `Al` alchemy,
`En` enchanting, `Je` jeweler, `Lo` loom, `Ta` tannery, `Eg` engineering,
`Co` cooking hearth, `Sc` scribe desk, `Wd` woodshop, `St` stonecutter, `w`
the yard well.

### 4.1 The square (kept as the hub)

The civic square at (-14, -102) stays: the monument, its benches and the
open east arrival lane are pinned by `tests/eastbrook_layout_suite.test.ts`,
`tests/realm_builder_monument.test.ts` and
`tests/eastbrook_combat_giver_visibility.test.ts`, and the starter combat
givers already work it. The provisions stall stays; two new stalls (the
fruit and cloth stall variants) close the square's north-west and south-east
corners so it reads as a market square. The mailbox stays.

### 4.2 Market Row: trading post and storage shed together

On the south side of the main street, between the square's east mouth and the
apothecary's frontage, a short paved frontage of three pieces facing north
onto the street (proposed, about x -24 to -45, z -104 to -116):

1. Trading post (`civic_trading_post`) nearest the square, proposed about
   (-27, -109). The Merchant (World Market) moves from the gold stall to its
   counter; the gold stall is retired. This is New World's trading post: the
   first service a player passes after the square on the way out, and the
   last on the way in.
2. Storage shed (`civic_storage_shed`) beside it, proposed about (-39, -108),
   open front to the street, chests visible. The bursar and the banker chest
   (`bankerChest`, `attachedToNpcId: 'bursar_fernando'`) move here, so storage
   sits next to the trading post exactly as in New World. The small
   strongbox house (`civic_bank_strongbox`) stands behind it as the shed's
   locked annex.
3. A small fountain plaza (`civic_fountain`) between them and the street,
   giving the row a gathering point and a sightline from the square.

The big walk-in bank building keeps its place, the Weekly Vault and the card
master (the vault and the cards are the bank's grand-hall role; storage is
the shed's errand role). If the owner prefers ONE storage place, the
alternative is to leave the bursar at the bank and use the shed as dressing,
at the cost of the 50-yard walk.

### 4.3 The crafting yard

South of the square, between the chapel's plat and the apothecary, down the
existing crafts lane (`bandit` and `northwest` roads), a U-shaped yard open
to the square (proposed x +4 to -20, z -106 to -134, east of the chapel's
reach and west of the apothecary's), with a well (`civic_well`) at about
(-10, -118) on the lane, which becomes the yard's central aisle, and lamp
posts on its rim. Fire and metal trades take the west rim, the fine trades
(alchemy, enchanting, jewels, ink) the inner row, cloth and hide the east
rim, and wood and stone the south edge by the strand:

| Station asset | Craft served | Station type (today or new) | Proposed spot |
|---|---|---|---|
| `station_forge_canopy` | weaponcrafting, armorcrafting | forge (move `station_eastbrook_forge`) | about (2, -111) |
| `station_anvil_armorer` | armorcrafting | forge (dressing beside it) | about (3, -117) |
| `station_smelter` | mining refinement | forge (dressing, or a new smelting type) | about (2, -123) |
| `station_alchemy_table` | alchemy | apothecary (NEW Eastbrook station) | about (-4, -113) |
| `station_enchanting_altar` | enchanting | toolworks today; own type later | about (-4, -119) |
| `station_jeweler_bench` | jewelcrafting | forge today; own type later | about (-4, -125) |
| `station_scribe_desk` | inscription | apothecary today; own type later | about (-2, -131) |
| `station_engineering_bench` | engineering | toolworks (move `station_eastbrook_toolworks`) | about (-17, -127) |
| `station_loom_awning` | tailoring | loom (`station_eastbrook_loom`, about where it is) | about (-17, -115) |
| `station_tannery_rack` | leatherworking | tannery (NEW Eastbrook station) | about (-17, -121) |
| `station_cooking_hearth` | cooking | kitchens (move `station_eastbrook_kitchens` from the inn lane) | about (-4, -107), the yard mouth |
| `station_woodshop` | logging refinement, furnishing | furnishing workshop (housing phase) | about (-9, -132) |
| `station_stonecutter` | masonry refinement | dressing until a stone craft exists | about (-16, -132) |

`STATION_RADIUS` is 20 yards, so one compact yard keeps every station inside
every other station's gate: a player standing in the middle can craft every
recipe the town serves without walking. That is exactly the New World
feeling and needs no new rule.

The kitchens move is an owner choice: the inn yard hearth is charming, but a
cook standing 45 yards from the other masters breaks the one-district read.
The proposal keeps a decorative hearth at the inn and moves the station.

### 4.4 Housing streets

The new house variants (cottages, townhouses, timber-frame, stone, row
terrace) stand as SEALED exteriors whose front doors are house lots, the way
the quay cottage is today (`src/sim/content/house_lots.ts`: one walk-in
`DungeonDef` per lot, the shared cottage interior behind every door).

- Housing street A (proposed): a lane off the main street at about (-62, -76)
  climbing north-west across the rise toward the inn, six to eight plots on
  both sides, about x -40 to -62, z -56 to -75, on the rise shelf the inn and
  the quay cottage already stand on (`RISE_SHELF`). The quay cottage becomes
  its first house.
- Housing street B (proposed): four to six plots along the main street's
  south side between the bank and the quay, about x -70 to -88, z -72 to -88,
  with the row terrace facing the street.
- The carpenter's woodshop stands in the yard (4.3), and a second furnishing
  workbench can stand at the head of street A once the housing phase wants a
  workshop beside the houses.

Mixed roofs (thatch, red tile, blue slate, green shingle, brown shingle) are
spread so no two neighbours repeat.

### 4.5 Inn, bank, board, chapel (kept)

- Inn: stays up the inn lane (walk-in tavern, rest area, its kitchen yard
  keeps a decorative hearth). The phase 1 `civic_inn_tavern` asset is a
  spare for other towns, or a second inn by the quay if the owner wants a
  harbour tavern.
- Bank: stays (walk-in, Weekly Vault, card master), see 4.2.
- Town board: stays at (5, -89) beside Marshal Redbrook. Its F-range
  clearances are pinned (`tests/noticeboard_interaction.test.ts`) and the
  board is already on the square. The `civic_town_board` asset can replace
  its model in place (same footprint class) or serve other towns.
- Chapel, graveyard, smithy: stay. Smith Haldren keeps his shop as the
  weapons vendor; the forge STATION leaves his forge shelter for the yard.

### 4.6 Stable at the gate

The town has no stable today. The `civic_stable` stands where the north road
leaves town toward the Wolf Run and the old heart (proposed about (10, -64),
beside the road, out of the smithy's reach), with a small corral fence. A
second hitching rail (dressing only) stands at the quay head by the spawn, so
the arrival and the overland exit both offer the mount. Mount vendor or
stable master NPC is a later content call.

## 5. Walking flow from arrival

1. Ferry bell landing (-92.5, -46.5) or the quay spawn (-94, -58): the quay,
   piers and ferry berth are unchanged.
2. Main street south-west: housing street A opens to the right (north) after
   about 25 yards, housing street B lines the left.
3. The bank and the Weekly Vault stand on the left about 60 yards in.
4. Market Row on the left about 75 yards in: storage shed, fountain, trading
   post.
5. The square about 95 yards in: monument, board, mailbox, starter quest
   givers, stalls.
6. From the square: the crafting yard is straight on through the crafts lane
   (15 to 30 yards), the inn is up the inn lane to the north (about 45
   yards), the chapel green west, the stable and the north gate north-west.

The New World rule of thumb this follows: arrival to trading post plus
storage under a minute of walking, and storage to every crafting station
under 30 seconds.

## 6. NPC and service moves

| NPC or service | Today | Proposed |
|---|---|---|
| The Merchant (World Market) | gold stall at (-20.5, -94) | trading post counter |
| Bursar Fernando + banker chest | bank door | storage shed front |
| Card master | bank door | stays |
| Forgemistress Darva (forge) | crafts lane | forge canopy in the yard |
| Tinker Gizzel (toolworks) | crafts lane | engineering bench in the yard |
| Weaver Ottilie (loom) | (-20.5, -117.5) | loom awning, about the same spot |
| Cook Marlow (kitchens) | inn lane yard | cooking hearth at the yard mouth |
| New tannery master | none in Eastbrook | tannery rack (new NPC, names IP-checked) |
| New apothecary station master | none in Eastbrook | alchemy table (Apothecary Lin is the natural master; she keeps her shop) |
| Trader Wilkes (provisioner) | (-25, -94) | stays on the square edge |
| Marshal, Brandt, Odell, Aldric, Saul, Haldren, Jessica | as today | stay |
| Farm beds | north of the square | stay |

## 7. What phase 2 has to change (code and data)

Placement records (sim, data-as-code):
- `src/sim/eastbrook_layout.ts`: new `makePlacedBuilding` records for the
  trading post, storage shed, strongbox annex, stable and every house (sealed,
  `walkIn` false, reach and wall boxes measured off the shipped GLBs), new
  `STATIONS` rows and lots for the yard, the moved NPC positions, the market
  stall list, the new roads (housing streets A and B, the yard paths), and
  the level `PADS` under each new building.
- `src/sim/content/professions.ts` `STATIONS`: Eastbrook gains tannery and
  apothecary rows; decide whether jewelcrafting, inscription, enchanting
  (and smelting) get their own `StationType` (a union change in sim types,
  recipe `stationType` stamps, the HUD station list and
  `tests/professions_crafting_hub.test.ts`), or stay bound to the forge,
  apothecary and toolworks with the new benches as their visible faces.
  Recommended: visible faces first (phase 2), own types later (phase 3).
- `src/sim/content/house_lots.ts`: new lot rows (stable, never reused ids,
  unique instance `index`), door positions from each new record's
  `frontStandingPoint`, prices in the placeholder band.
- `src/sim/content/zone1.ts`: NPC defs read positions from the layout already;
  new masters need NpcDefs, `src/ui/world_entity_i18n.ts` names, the
  Naming originality check (`src/sim/content/CLAUDE.md`), and wiki regen.
- The Studio maps (`data/maps/eastbrook_rebuild.map.json` and the World of
  ClaudeCraft map) must carry the same placements, and their generated
  modules regenerate (never hand-edited), because
  `tests/eastbrook_placed_buildings.test.ts` pins every building to the map's
  anchor and `tests/custom_map_parity.test.ts` pins the built-in and custom
  worlds equal.

Assets and render:
- Integrate each kept GLB through the pipeline's `--apply` (copies to
  `public/models/props/`, appends `CREDITS.md`), add `PROP_ASSET_DEFS` rows
  (`src/render/props.ts`), and run `npm run asset:budget`. Buildings at 4k
  tris and stations at 3k each, 30-plus new draw calls in the hub: dispatch
  `render-performance-reviewer`, give each new GLB a prewarm home
  (`src/render/prewarm_policy.ts`), and extend the town visibility cull
  (`src/render/eastbrook_town_visibility_core.ts`).
- Front yaw: phase 1 re-normalized every GLB so its presentation side (the
  door, the open front, the worked face of a bench) faces +Z, the prop
  convention (`rotateYDeg` per asset in the manifest). The town's placed
  Tidehold buildings face local -Z, so a kit building placed through
  `makePlacedBuilding` needs a half turn in its record, or its own record
  shape.

Collision and pathing:
- Colliders matched to the visuals (`src/sim/colliders.ts` WYSIWYG contract):
  OBB per sealed building plus annex boxes; station benches as small boxes;
  open-front sheds collide on their walls and counter only.
- Pathing: `tests/pathfind.test.ts`, the service `routes` in
  `EASTBROOK_LAYOUT.services`, and the wolves guidance curve
  (`src/render/eastbrook_wolves_guidance_core.ts`, which must stay clear of
  fences and walls) re-solved round the new blocks.
- Foliage and grass clearing read each record's `reach`; the farm beds and
  gather nodes keep their own placement tests
  (`tests/farm_patch_placement.test.ts`, `tests/gather_node_placement.test.ts`).

Map and minimap:
- The painted map plate `public/map_art/eastbrook_vale.png` shows today's
  town; it needs a repaint (or a buildings overlay) so the map matches, plus
  map markers for the trading post, storage shed, yard and stable
  (`src/ui/map_window_view.ts`, `tests/map_window_view.test.ts`).

Tests that pin today's positions (all must be updated in the same change):
`tests/eastbrook_layout_suite.test.ts`, `eastbrook_placed_buildings`,
`eastbrook_combat_giver_visibility`, `professions_station_placement` (the
"four Eastbrook anchors" pin and the camp-safety margin),
`professions_crafting_hub`, `noticeboard_interaction`, `housing`
(lot door equals building front), `custom_map_parity`,
`eastbrook_wolves_guidance_core`, `quest_compass_truth`, `spawn_footing`,
`persisted_position_escape`, `town_walk_in`, `eastbrook_town_renderer`,
`eastbrook_town_preload`, `map_window_view`, `pathfind`,
`weekly_vault_building`, `world_audio` (the forge ambience keys on the smithy
id), and the parity scenarios in `tests/parity/scenarios.ts`.

## 8. Risks

- Pinned positions: dozens of tests pin literals (section 7). Phase 2 must be
  one coordinated change per district, each landing green, never a single
  sweeping move.
- The Proving Shore graduation lands players at `FERRY_BELL_TOWN_LANDING`
  facing up into town toward the chapel, and the golden guidance leads from
  there to Marshal Redbrook. New housing on street A or B must not wall that
  first sightline, and the guidance curve must still route clear of the new
  buildings.
- The first-visit arrival cinematic (`src/game/arrival_cinematic.ts`) frames
  the Proving Shore, and its establishing shot shows "the town they just left
  small below" across the strait. Taller new buildings near the quay change
  that silhouette; check it from the island start before shipping.
- Saved positions: a character logged out where a new building now stands
  must be lifted out (`tests/persisted_position_escape.test.ts`); sealed boxes
  over old open ground need that check.
- Quests: NPC positions come from the layout, so quests follow their givers,
  but work orders (`q_prof_workorder_*`) and the profession intro quests
  point at stations; their compass targets must follow the moved stations.
- Camp safety: stations and masters must clear the strictest camp margin
  (`tests/professions_station_placement.test.ts`); the yard sits far from
  camps, but the stable at the north gate is closer to the wolf runs.
- Terrain: the yard and Market Row sit on the plat's south strip near the
  strand; each new pad needs its taper to end on dry ground, the lesson the
  apothecary and chapel pads already record.
- Performance: the hub town is the busiest scene in the game; budget the new
  GLBs, share materials where possible, and keep far-LOD cull distances.
- Generated look: the Tripo models are stylized and slightly crooked by
  design; colliders must follow the real walls, not the eaves.

## 9. Decisions for the owner

1. Storage: bursar to the storage shed by the trading post (recommended), or
   keep storage at the bank?
2. Kitchens: move the cooking station into the yard (recommended), or keep it
   at the inn?
3. Station types: new types for jewelcrafting, inscription, enchanting and
   smelting now, or bind the new benches to the existing types first
   (recommended)?
4. Housing: how many lots on streets A and B (proposal: 10 to 14 total)?
5. Stable: north gate only, or also at the quay?
