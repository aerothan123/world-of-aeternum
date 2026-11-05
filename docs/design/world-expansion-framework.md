# World expansion framework

How Wyndlewood grows chapter by chapter without loading screens and without
ever moving the ground a shipped zone stands on. Code anchors:
`src/sim/frontier/` (slots, layout, terrain, touch-up scope, hub plots),
`src/sim/world_core_bounds.ts`, `src/sim/content/frontier/`
(`southern_reaches.ts`, `low_reaches.ts`, `west_march.ts`),
`src/sim/saved_pos_exit.ts` + `src/sim/data.ts` `SAVE_POS_EPOCH`,
`src/render/zone_eviction_core.ts` `pickZoneToEvict`. Pinned by
`tests/world_core_terrain_parity.test.ts`, `tests/frontier_terrain.test.ts`,
`tests/world_slots.test.ts`, `tests/frontier_hub_plots.test.ts`,
`tests/saved_pos_exit.test.ts` and `tests/zone_eviction_desktop.test.ts`.

## 1. The region slot grid

The world is a set of named rectangles (`WORLD_SLOTS` in
`src/sim/frontier/slots.ts`), each one of:

- **shipped**: a live zone whose ground is frozen. The fifteen bible regions
  are chapter 0, listed rect for rect (their rects are irregular because the
  old strip grew row by row).
- **open**: a frontier zone live in this build.
- **reserved**: named ground held for a later chapter, still behind the
  Hushmist.

Frontier slots sit on a regular 360 yd lattice (`SLOT_SIZE`; column 0 is the
old strip x -180..180, row 0 is Eastbrook's row z -180..180), one or more
cells per slot. The `chapter` column is the planned release, not a promise.

### The launch frontier (chapter 1, live in this build)

```
 z \ x      col -2 (-900..-540)   col -1 (-540..-180)   col 0 (-180..180)   col 1 (180..540)
 row 1      the Wardmere 18-20    Willowfen (shipped)   Mirefen (shipped)   Galecrest (shipped)
 row 0      the Harrowfells 17-19 Proving Shore         Eastbrook Vale      the Farshore
 row -1     the Sedgemarch 16-18  Chalkbarrow Coast 10-13  Kindlemoor 8-11  Applewold 6-9
 row -2     the Rookcliffs 14-16  the Tinmarch 13-15    the Wychwold 12-14  the Saltmeads 11-13
```

| Row / column | Zone | Levels | Hub (quest room) | Lead faction | Entered from |
|---|---|---|---|---|---|
| Southern Reaches | The Applewold | 6 to 9 | Pressford, Causeway Watch | Hearthwright Compact, Lanternwardens | the Applewold causeway off the Farshore |
| Southern Reaches | The Kindlemoor | 8 to 11 | Ferncross, the First Hearth Ring | Bracken Circle | the Heath Way; the Southway from Eastbrook |
| Southern Reaches | The Chalkbarrow Coast | 10 to 13 | Coinwell Camp (the Unlit Dig is hostile) | Gilt Measure | the west heath |
| Low Reaches | The Saltmeads | 11 to 13 | Panwick | Hearthwright Compact | the Saltmeads Gate off the Applewold's south downs |
| Low Reaches | The Wychwold | 12 to 14 | Elmhallow | Bracken Circle | the Salt Way |
| Low Reaches | The Tinmarch | 13 to 15 | Wheal Patience | Gilt Measure | Tinners' Ford; the Chalk Pass from the Chalkbarrow Coast |
| West March | The Rookcliffs | 14 to 16 | Kestrel Point | Lanternwardens | the Rook Ford |
| West March | The Sedgemarch | 16 to 18 | Withyholt | (story crew) | the Sedge Neck |
| West March | The Harrowfells | 17 to 19 | Fellgate | (story crew) | the Fell Neck |
| West March | The Wardmere | 18 to 20 | Lanternfold | Lanternwardens | the Ward Neck; planned ferry stop at the Westering Pier |

How it plays: the Southern Reaches fill 6 to 13 beside Mirefen; both roads
meet in the Kindlemoor (the Southway makes the Mirefen road reach it by land).
At 11 to 13 the Chalkbarrow Coast is the convergence point, and from there a
player either goes north (Thornpeak, the Veiled Hollow, the Drakelands, the
Frostveil) or south and west down the Low Reaches into the West March. The 16
to 20 band therefore BRANCHES into two roads the player can take in either
order, as the game plan asks.

Every hub has a level pad with room for a quest board and five givers,
authored as `FRONTIER_HUB_PLOTS` (`src/sim/frontier/hub_plots.ts`, the first
spot is the board), including the two secondary sites Causeway Watch and the
First Hearth Ring. The quest and story crews stand their NPCs on those spots.

### Opening a slot is a data change

1. a `ZoneDef` whose rect equals the slot rect, with `openBorders: true`;
2. land shapes inside the slot in `src/sim/frontier/layout.ts` (blobs, ridges,
   necks, flats, lakes) and, if the slot meets an old coast, a tie-in neck;
   every link between two frontier zones also gets a neck, so the crossing
   stays dry however the coast noise wobbles;
3. its camps, roads and props in `src/sim/content/frontier/<row>.ts`, merged
   LAST in `data.ts` (rng-stream rule; every frontier camp is `offStream`);
4. its connector(s) in `SLOT_CONNECTORS` and its hub plots;
5. its guide stem (`src/guide/data.ts` `ZONE_KEY_STEM`) and English guide
   prose (`src/ui/i18n.catalog/guide.ts`), then `npm run i18n:gen` and
   `npm run wiki:content`.

Nothing outside the slot moves. The frozen-core rule:

- Every shipped terrain rule that used to read the live world box reads
  `CORE_WORLD` instead (`world_core_bounds.ts`). The live bounds still drive
  the grid-wide consumers: terrain chunk grid, decoration anchors (which stay
  on the same 10 yd lattice because every slot edge is a multiple of 10), far
  terrain, minimap strip.
- `applyFrontierTerrain` is the identity inside the core rect except on a
  declared tie-in neck, and outside the frontier's own extent (so the instance
  bands at x ~100k are never touched).
- The parity test hashes `terrainHeight` over the whole core rect and skips
  only the listed tie-in footprints. A new tie-in adds its footprint and
  re-pins the hash on the PRE-expansion code (a detached worktree at
  `64d84727`), and the new code must give the same hash. The Southway did
  exactly this: base and new code both hash to `9c722d62:c3665b52`.
- The live-world touch-up patch token is taken over the core world only
  (`frontier/touchup_scope.ts`).

### Reserved slots and the Hushmist rings

The roadmap asks for three rings reserved past the launch edge now
(`docs/design/wyndlewood-chapter-roadmap.md` section 6). They are lattice
slots, so a chapter opens one by flipping its gate and adding content:

| Chapter | Slot id | Lattice | Ground | Levels |
|---|---|---|---|---|
| Eight | `hushmist_galecrest` | col 2, rows 1 to 2 | past the Galecrest (the forge complex's far side) | 20 to 25 |
| Nine | `hushmist_palmreach` | col -2, rows 2 to 3 | past the Palmreach (north of the Wardmere) | 25 to 30 |
| Nine | `hushmist_wraithwood` | col 2, rows 4 to 5 | past the Wraithwood | 25 to 30 |
| Ten | `hushmist_evergarden` | col 2, row 3 | past the Evergarden | 30 to 35 |
| Ten | `hushmist_nightbloom` | col -2, rows 4 to 5 | past the Nightbloom | 30 to 35 |
| Ten | `guild_sites_west` | col -3, rows 0 to 1 | the first guild town sites, west of the March | 30 to 35 |
| later | `east_reach` | col 2, rows -2 to 0 | past the Farshore and the Saltmeads | 35+ |
| later | `deep_south_row` | cols -2 to 1, row -3 | past the Low Reaches | 35+ |

Ring ground counts: the launch frontier opens 10 lattice cells; the three
rings reserve 12 more, and the later slots 7 more.

## 2. Seams that must not need rework later

| Seam | State after this pass | Remaining work |
|---|---|---|
| World bounds | Derived from all zone rects (now x -900..540, z -900..2420); core rules frozen to `CORE_WORLD`. | None in any direction. |
| Save positions | DONE: every save stamps `posEpoch: 2` (`saved_pos_exit.ts` `savedPlacement`); `migrateLegacyInstancePos` remaps only unstamped saves, so east of x 600 is safe. | None. See section 8 for the checklist. |
| Border ridges | Generated per shared edge between shipped zones; frontier zones set `openBorders` and shape their own transitions. | A ridge between two frontier slots is authored as a `FrontierRidge`. |
| Terrain cost | Frontier shapes are bucketed in a 64 yd grid, so a sample walks only nearby shapes however many rows open. | Measure chunk build time per row as rows grow. |
| Zone eviction | Desktop sheds the farthest zone past `ZONE_EVICTION_RADIUS` once more than `DESKTOP_RESIDENT_ZONE_BUDGET` (12) zones are resident; constrained hosts unchanged. A scripted 4-lap tour of all 25 hubs (5,896 steps) evicts 84 times, never exceeds its bound by more than 1 zone and never thrashes (`tests/zone_eviction_desktop.test.ts`). | Stage 4 of `chunk-streaming.md` (chunk-level residency) should absorb this. |
| Server interest | Interest is per player (90 yd players, 120 yd NPCs) and idle mobs outside it skip their AI tick, so realm cost scales with players and camps, not area. | Watch total camp count per realm host: 270 camps now, up from 235. |
| Editor caps | coords +-10000; `MAX_ZONES` raised 24 to 48 (the built-in world is 25 zones); roads 144 of `MAX_ROADS` 256; camps 270 of `MAX_CAMPS` 600. | The touch-up patch should split per row before it nears 16000 placements. |
| Minimap / world map | The minimap strip plate spans the live bounds; the world map frames per zone. | The continent map needs frontier art per opened slot; tiling by slot is the natural unit. |
| Roads | Polylines; a new slot attaches only at a declared connector (`SLOT_CONNECTORS`, now 13). | Promote connectors into a graph module when the cart router needs it (section 6). |
| Fog / far view | Unchanged; frontier land streams like any zone and the fog clamps on the nearest unbuilt chunk. | The Hushmist bank needs a render module (section 3). |

## 3. A believable edge: the Hushmist

The frontier phenomenon is **the Hushmist** (owner decision). The name lives
in one place, `FRONTIER_EDGE_NAME` in `src/sim/frontier/slots.ts` (dev
reference only); player text ships as `t()` keys. The first player-facing
uses are the Rookcliffs' POI "The Hushmist Light" and the two West March
guide blurbs.

Story: the Hushmist is the visible edge of the Unravelling. Where the
Hearthbinding is strong it lifts; each chapter repairs part of the old
infrastructure and one ring pulls back.

Design for the render and gate pieces (not built in this pass):

- **Gate, not terrain.** Per the roadmap's engineering rule, the mist is a
  world gate (`src/sim/world_gates.ts`): one gate record per reserved slot,
  closed until its chapter. A closed gate is a soft wall at the slot rect
  (the swim-fatigue clock already turns swimmers back past the open sea; the
  gate adds a turn-back line and a short message for anyone who reaches the
  rect edge). Opening a ring is flipping its gate.
- **The bank.** A render module draws a low, slowly rolling mist wall along
  every open-slot edge that faces a reserved slot or open sea, with distance
  fog that swallows the sea surface behind it. It is a new GPU producer, so it
  needs a prewarm home or a gate per `src/render/CLAUDE.md`, and it must stay
  cosmetic (fairness rule: it never hides a mob or a player).
- **Distant landmarks.** Inside each reserved slot a few silhouettes stand
  over the mist (a lighthouse, a broken tower, a far peak) so the edge reads
  as "not yet", not "nothing". They are far-view impostors only, never
  walkable, and they become real props when the ring opens.
- **Sound.** The Hushmist swallows sound: ambience and music fade toward
  silence over the last 60 yd toward the bank.

## 4. Sense of scale and the walk-time target

Owner target: the longest road trip about **15 minutes on foot** at
`RUN_SPEED` 7 yd/s (about 6,300 yd of road), growing toward 20+ in later
chapters.

Measured by `scripts/world_walk_times.mjs` (road graph over every polyline,
hub to hub, Dijkstra; `JOIN` is how far a road end may be from another road to
count as joined):

| Measure | Before the Low Reaches | Now |
|---|---|---|
| Total road | 16,256 yd | 20,553 yd |
| Land | about 1.79 M sq yd shipped + the Southern Reaches | 2.30 M sq yd |
| Shortest hub trip | Pressford to Ferncross, 318 yd (0.8 min) | Withyholt to Fellgate, 309 yd (0.7 min) |
| Longest hub trip, default JOIN 45 | Icemantle to Wickharbor, 2,828 yd (6.7 min run) | unchanged (the frontier graph is not joined to the core roads at JOIN 45) |
| Longest hub trip, JOIN 70 | | Highwatch to Lanternfold, 3,108 yd (7.4 min run, 4.4 basic riding, 3.5 advanced) |

Per-zone road crossing (longest in-zone road trip, minutes at run): the new
zones are 0.5 to 0.9 min each (Saltmeads 359 yd, Wychwold 302, Tinmarch 352,
Rookcliffs 344, Sedgemarch 308, Harrowfells 311, Wardmere 207), the same
scale as the Southern Reaches and the old strip zones (0.8 to 1.0 min).

Honest read: the frontier doubles the leveling ground and adds a second
16 to 20 road, but a frontier zone is still a 360 yd cell crossed in under a
minute, so the longest trip is about half the target. Two levers close the
gap, in this order: (1) the zone warp (section 5) stretches the shipped
zones from Mirefen onward and, applied with the same factors to the frontier
rows, roughly doubles every crossing; (2) the road graph has real gaps (257
hub pairs have no road route today: the portal zones, the ferry-only island,
and road ends that stop short of each other) that the travel network
(section 6) and a pass of road joins should close.

Stops: a settlement or outpost every 250 to 400 yd of road (a hub per slot
plus a named neck, ford or pass on each connector). Sightlines: hubs sit on
pads with a view down the next connector.

## 5. Planned: the zone warp (enlarging shipped zones)

DESIGN ONLY. No `W(x, z)` code is written until the owner says so.

Owner direction: reach the walk-time target mainly by ENLARGING the shipped
zones from Mirefen onward, with the Proving Shore and Eastbrook Vale
unchanged. Starts only after the town and story crews merge their current
edits in those zones.

**Method: one coordinate warp, never hand edits.** A monotone, piecewise
linear map `W(x, z)` (a new pure leaf, `src/sim/world_warp.ts`):

- identity on the Proving Shore, Eastbrook Vale and the Farshore rects and
  on every instance band (x past `INSTANCE_X_BASE`);
- per zone band a stretch factor (z for the strip rows, x for the columns),
  continuous at every band edge, so no point ever lands in two places;
- the frontier rows ride the same map: their slots move with the band they
  border, and their own shapes stretch with the same factors, so the
  Southern Reaches and the March keep their joins;
- its inverse `W^-1` is exact (piecewise linear), so the ground is
  `newHeight(p) = shippedHeight(W^-1(p), seed)`: every hand-tuned coast, pad,
  ramp and editor stamp stays self-consistent, heights never change and slopes
  only get gentler.

Starting factors to reach about 6,300 yd on the longest trip (to be tuned
against `scripts/world_walk_times.mjs` on the warped tables): Mirefen and the
Kindlemoor x1.6; Thornpeak, the Veiled Hollow and the Low Reaches x1.8; the
16 to 20 zones (both roads) x2.0; the endgame columns x1.5. The saved-position
rule needs a second epoch (`posEpoch: 3`) so an unwarped save maps through
`W` exactly once on load.

**Content:** every positional record passes through `W` once, at table
assembly in `data.ts` (zones, hubs, POIs, lakes, camps, NPCs, ground objects,
gather nodes, roads, props, dungeon doors, portals, graveyards, painted-town
anchors, touch-up placements and object moves, frontier hub plots).
Footprints, radii, rotations and building sizes do NOT scale. Collider bakes
are rebuilt from the warped tables.

**The position sweep test** (`tests/world_warp_positions.test.ts`):
enumerate every exported position in `src/sim/content/` and every sim/render
module that holds literal world coordinates, assert each resolves through `W`
and stands on walkable ground, and fail on any literal that bypasses `W`. A
second test pins `W` as identity on the unchanged zones and the instance
bands.

**Moved-positions list:** the warp run writes
`docs/design/world-warp-moves.md`, one row per moved record, for the story
crew to reconcile quest text and map notes.

**Risks:** render modules with their own literal coordinates (set pieces,
dungeon entrances, harbor houses, maze grids) must be converted to read
warped anchors; seeded goldens re-pin; quest distances need a prose pass;
the ferry lanes (`content/transport_ships.ts`) must warp with the coasts.

## 6. Travel network (design; sim pieces go to the systems crew)

Seamless rides along a path, no curtain: the rider is seated on a vehicle
that follows an authored polyline through the streamed world (the Proving
Shore ferry voyage and `transport_ferry.ts` are the precedent), and can step
off at any stop. Names are IP-checked (section 7).

| Line | Kind | Route | Stops | Fare |
|---|---|---|---|---|
| **The Wainway** | Hearthwright Compact carts | the main roads | Eastbrook, Fenbridge, Highwatch, Pressford, Ferncross, Coinwell Camp, Panwick, Elmhallow, Wheal Patience | 25 copper a stop, capped at 1 silver a ride |
| **The March Wain** | carts, the Wainway's west branch | Wheal Patience to Lanternfold over the Rook Ford and the three necks | Wheal Patience, Kestrel Point, Withyholt, Fellgate, Lanternfold | as above |
| **Reed barges** | slow river and lake barges | Mirefen's channels, the Willowfen braids, the Sedgemarch withy channels | each zone's hub landing | 10 copper |
| **The Proving Shore ferry** | ship (shipped) | as today | | as today |
| **The Westering ferry** | ship, a new stop on the shipped Willowfen lane | Eastbrook pier, the Willowfen landing, the Westering Pier | 3 stops | as the shipped ferry |
| **The salt packet** | coastal boat | Gullhaven to Panwick round the Applewold's east shore | 2 stops | 50 copper |
| Portals, hearthstone, dungeon doors | blocking teleport | as today | | |

Flag: portals, the hearthstone and dungeon doors use the blocking teleport
path, which holds the loading curtain until the landing neighbourhood streams
(`zone_streaming.ts` `ARRIVAL_NEIGHBOR_STREAM_RADIUS`). Nothing in the walked
expansion needs a loading screen.

**Sim pieces for the systems crew** (a `src/sim/travel/` system module behind
`SimContext`, modelled on `transport_ferry.ts`):

1. `travel/routes.ts` (pure data leaf): route records (`id`, `kind`, polyline,
   stop list with stop anchors, speed profile, fare table), validated at
   import; the ferry lanes stay in `content/transport_ships.ts`.
2. `travel/seated_ride.ts`: the seated-rider movement mode (same family as
   `climb.ts` and the ferry carry): owns the body's position, steps it along
   the polyline at `DT`, dismount at a stop or on demand onto the nearest
   walkable roadside point; never draws rng.
3. `travel/fares.ts`: fare charge through the existing money path (the
   vendor/market copper seam), refund on a failed board.
4. `travel/stops.ts`: the stop prompt (an NPC or post at each stop, a
   `travel` interaction), plus `IWorld` facet members for the HUD route map
   (both worlds and the parity pin).
5. Save rule: a ride saved mid-route resumes at the last stop passed
   (the `ferrySavePosition` pattern) and stamps `posEpoch`.
6. Interest: the cart is an entity only while ridden; idle carts are props.
7. The Westering Pier stop: add the stop to the shipped Willowfen lane in
   `content/transport_ships.ts` (a berth at x ~ -672, z ~ 300) plus a pier
   prop. Until then the Wardmere connects to the Willowfen only by ship, which
   the connector table marks as `ferry`.

## 7. Names and the IP check

Every new player-visible proper noun was web-checked (exact phrase plus
coined token against the major game wikis) in the change that authored it.

| Name | Role | Verdict |
|---|---|---|
| the Hushmist | frontier phenomenon | no game hits (previous crew; owner pick) |
| The Saltmeads, Panwick | zone, hub | no game hits; real-world style English place forms |
| The Wychwold, Elmhallow | zone, hub | no game hits |
| The Tinmarch, Wheal Patience | zone, hub | no game hits; "Wheal" is the generic Cornish mine word |
| Blackadit | POI | no game hits |
| The Rookcliffs, Kestrel Point | zone, hub | no game hits; Kestrel Point is a generic real-world place form |
| The Sedgemarch | zone | no game hits |
| Withyholt | hub | no game hits. Replaced the first pick "Reedholm", which is an existing indie game (moddb/indiedb) |
| The Harrowfells, Fellgate | zone, hub | no exact hits; LOTRO has "Harrowdale" and "Underharrow", but "harrow" is generic English and the full names differ |
| The Wardmere, Lanternfold | zone, hub | no game hits |
| the Westering Pier, the Westering ferry | POI, travel line | no game hits |
| the Southway, the Salt Way, the Chalk Pass, Tinners' Ford, the Rook Ford, the Sedge Neck, the Fell Neck, the Ward Neck, the Brine Pans, Gannet Stack, the Wrack Shallows, the Knotted Elm, Charcoal Hollow, the Sunk Lane, the Stannary Stones, the Sea Stacks, Rook Hollow, the Hushmist Light, the Withy Beds, Heron Mere, the Drowned Causey, the Cairn Field, Harrow Tarn, the Iron Ring, the Ward Mere, the Last Beacon, the March Wain, the salt packet | connectors, POIs, travel | generic English, not checked as coined |

## 8. Save-position epoch: migration-safety checklist

The change: `CharacterState.posEpoch?: number` (`character_state.ts`),
written as `2` on every save by `saved_pos_exit.ts` `savedPlacement`; read by
`resolveSavedPosExit` / `savedZoneId` (the sim's `addPlayer` and the server's
character list) and by `migrateLegacyInstancePos`.

- **Additive JSONB, no DDL.** One optional key in `characters.state`; no
  schema, index or SQL change.
- **Old saves load as before.** Absent `posEpoch` keeps the legacy rule
  byte-identical (the existing `saved_pos_exit` suites pass unchanged, and a
  seeded sweep of 400 legacy positions across x 601..6000 all resolve to a real
  door).
- **Written on every save.** `serializeCharacter` spreads `savedPlacement`,
  so every autosave, logout and shutdown save carries the stamp; pinned by a
  test on a real `Sim`.
- **Rollback safe.** An older binary ignores the key and re-saves without it;
  an older binary never had east-march ground, so the legacy rule it applies
  can only touch positions it already treated that way.
- **Malformed input.** A non-number or `NaN` epoch counts as unstamped (the
  legacy rule), never as literal; pinned.
- **Other writers.** Server fixups that rewrite `pos` (jail moves, the
  newborn spawn) write known west-of-600 positions, so an unstamped result
  there is harmless. Any future server writer that can place a character east
  of x 600 must also set `posEpoch` (or go through `savedPlacement`).
- **Instance bands unaffected.** Stamped or not, positions on the real bands
  (x past `INSTANCE_X_BASE`) resolve through the band rules; pinned.

## 9. Door placement asks (story crews)

| Ask | Status | Why | Road link given now |
|---|---|---|---|
| The Sunken Bastion door "where Mirefen meets the Chalkbarrow Coast" (`wyndlewood-chapter-two-outline.md`) | Not moved | Mirefen (x -180..180, z 180..540) and the Chalkbarrow Coast (x -540..-180, z -540..-180) do not touch: Eastbrook and the Proving Shore lie between them, and the Chalkbarrow ground is frontier while the door's facade, colliders and `q_bastion_door` live in shipped Mirefen. | The Southway (Eastbrook's south shore to Ferncross) makes both roads end at the same door by land: Coinwell Camp to the Bastion door is now Coinwell, the west heath, Ferncross, the Southway, Eastbrook, Mirefen's south road. With the warp, the door can move onto a Mirefen/Kindlemoor meeting edge if the story crew still wants it. |
| The Last Keep door to Thornpeak Heights (`wyndlewood-last-keep-dawnhold.md`) | Not moved | A door move is a `doorPos` + `staticDoor` facade + collider + leave-text change on shipped ground that the warp will move again; doing it twice risks two rounds of quest-text and collider churn. | Deferred to the warp phase: the door moves to a Thornpeak site picked on the warped map (a pass shelf off the Highwatch road). The current door keeps its existing road access. |
| Dawnhold to the Veiled Hollow (same doc) | Not moved | Same reason; the Veiled Hollow is portal-entered, so its door site depends on the warp's room and the portal landing. | Deferred to the warp phase, beside the Duskfall Passage landing so the portal is the road link. |

## 10. Chapter growth table

| Chapter | Slots opened | Levels |
|---|---|---|
| 0 (shipped) | 15 bible regions | 1 to 20 |
| 1 (launch frontier, this build) | Southern Reaches, Low Reaches, West March (10 cells) | 6 to 20 |
| Eight | Hushmist ring past the Galecrest | 20 to 25 |
| Nine | rings past the Palmreach and the Wraithwood | 25 to 30 |
| Ten | rings past the Evergarden and the Nightbloom, guild town sites | 30 to 35 |
| later | east reach, deep south row | 35+ |
