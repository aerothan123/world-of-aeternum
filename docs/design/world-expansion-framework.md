# World expansion framework

How Wyndlewood grows chapter by chapter without loading screens and without
ever moving the ground a shipped zone stands on. Code anchors:
`src/sim/frontier/` (slots, layout, terrain, touch-up scope),
`src/sim/world_core_bounds.ts`, `src/sim/content/frontier/`,
`src/render/zone_eviction_core.ts` `pickZoneToEvict`. Pinned by
`tests/world_core_terrain_parity.test.ts`, `tests/frontier_terrain.test.ts`,
`tests/world_slots.test.ts` and `tests/zone_eviction_desktop.test.ts`.

## 1. The region slot grid

The world is a set of named rectangles (`WORLD_SLOTS` in
`src/sim/frontier/slots.ts`), each one of:

- **shipped**: a live zone whose ground is frozen. The fifteen bible regions
  are chapter 0, listed rect for rect (their rects are irregular because the
  old strip grew row by row).
- **open**: a frontier zone live in this build (chapter 1 is the Southern
  Reaches: the Applewold, the Kindlemoor, the Chalkbarrow Coast).
- **reserved**: named ground held for a later chapter, still behind the edge.

Frontier slots sit on a regular 360 yd lattice (`SLOT_SIZE`, column 0 is the
old strip x -180..180, row 0 is Eastbrook's row z -180..180), one or two
cells per slot. Opening a slot is a data change:

1. a `ZoneDef` whose rect equals the slot rect, with `openBorders: true`;
2. land shapes inside the slot in `src/sim/frontier/layout.ts` (blobs, ridges,
   necks, flats, lakes) and, if the slot meets an old coast, a tie-in neck;
3. its camps, roads and props in `src/sim/content/frontier/<row>.ts`, merged
   LAST in `data.ts` (rng-stream rule; every frontier camp is `offStream`);
4. its connector(s) in `SLOT_CONNECTORS`.

Nothing outside the slot moves. The generalised frozen-core rule:

- Every shipped terrain rule that used to read the live world box reads
  `CORE_WORLD` instead (`world_core_bounds.ts`). The live bounds
  (`WORLD_MIN_X` and friends) still drive the grid-wide consumers: terrain
  chunk grid, decoration anchors (which stay on the same 10 yd lattice because
  every slot edge is a multiple of 10), far terrain, minimap strip.
- `applyFrontierTerrain` is the identity inside the core rect except on a
  declared tie-in neck, and outside the frontier's own extent (so the instance
  bands at x ~100k are never touched).
- The parity test hashes `terrainHeight` over the whole core rect on the
  pre-expansion code and skips only the listed tie-in footprints. A new
  tie-in adds its footprint and re-pins the hash on the pre-expansion world.ts
  (a detached worktree at the base commit), never on the new code.
- The live-world touch-up patch token is taken over the core world only
  (`frontier/touchup_scope.ts`), so frontier rows never invalidate a reviewed
  map patch.

## 2. Seams that must not need rework later

| Seam | State after this pass | Remaining work |
|---|---|---|
| World bounds | Derived from all zone rects; core rules frozen to `CORE_WORLD`. | None for west/south/north. |
| Border ridges | Generated per shared edge between shipped zones; frontier zones set `openBorders` and shape their own transitions (no ridge can reach into frozen ground). | If a later chapter wants a ridge between two frontier slots, author it as a `FrontierRidge`. |
| Terrain cost | Frontier shapes are bucketed in a 64 yd grid, so a sample walks only nearby shapes however many rows open. | Measure chunk build time per row as rows grow. |
| Zone eviction | Desktop now sheds the farthest zone past `ZONE_EVICTION_RADIUS` once more than `DESKTOP_RESIDENT_ZONE_BUDGET` (12) zones are resident; constrained hosts unchanged. | Stage 4 of `chunk-streaming.md` (chunk-level residency). |
| Server interest | Interest is per player (90 yd players, 120 yd NPCs) and idle mobs outside it skip their AI tick, so realm cost scales with players and camps, not area. | Watch total camp count per realm host as rows open. |
| Save positions | West, south and north are safe. EAST past x 600 is not: `migrateLegacyInstancePos` treats any saved x in 600..99400 as a pre-move instance position. | Add a save epoch stamp (new saves write `posEpoch: 2`; only unstamped saves take the legacy rule), with seeded legacy-save tests. Owner approved; not built in this pass. |
| Editor caps | coords +-10000, 16000 placements per map document, 24 zones. | Raise `MAX_ZONES` when the zone count passes 24 (chapter 3). Placements are per document; the touch-up patch should split per row before it nears 16000. |
| Minimap / world map | The minimap strip plate spans the live bounds; the world map frames per zone. | The continent map needs frontier art (baked backgrounds) per opened slot; tiling by slot is the natural unit. |
| Roads | Polylines; a new slot attaches only at a declared connector (`SLOT_CONNECTORS`). | Promote connectors into a graph module when a router needs it. |
| Fog / far view | Unchanged; frontier land streams like any zone and the fog clamps on the nearest unbuilt chunk. | The edge phenomenon below needs a render module (a scheduler client per `src/render/CLAUDE.md`). |

## 3. A believable edge

Past the open slots the world is not empty sea, it is **unfinished**: the
Unravelling frays the Hearthbinding at the world's rim, and the land beyond
sleeps behind a bank of grey, sound-swallowing sea mist. Each chapter's
restoration lifts one section, the way the campaign's end "awakened" the
level-20 regions.

Name options for the phenomenon (exact-phrase web searches, no game hits):

1. **the Hushmist**: the mist that swallows sound. Plain, readable, fits the
   cosy tone.
2. **the Greywrack**: storm-wrack and mist rolled into one grey wall over the
   sea; harsher, better for stormy coasts.

(Rejected on the IP check: "Frayline" and "Rimefall" are existing Steam games.)

How it plays: open sea between the open slots and a reserved slot carries the
mist bank; swim fatigue already turns swimmers back. Distant landmarks inside
reserved slots (a lighthouse, a broken tower, a far peak) are visible as
silhouettes over the mist so the edge reads as "not yet", not "nothing".
Rendering the bank is a new GPU producer and is left to a render pass with
the environment crew (prewarm or gate it like every producer).

## 4. Sense of scale without padding

- **Varied travel**: roads; causeways (the Ferrywalk, the Applewold
  causeway); the Proving Shore ferry; the Veiled Hollow portal (note: it uses
  the blocking teleport path, which holds the loading curtain until the
  landing neighbourhood streams).
- **Stops**: a settlement or outpost every 250 to 400 yd of road (a hub per
  slot plus a camp or watch post on each connector).
- **Sightlines**: hubs and ruins sit on rises with a view to the next slot's
  landmark; ridges frame passes rather than walls.

### Chapter growth table

| Chapter | Slots opened | Land (approx.) | Levels |
|---|---|---|---|
| 0 (shipped) | 15 bible regions | 1.79 M sq yd | 1 to 20 |
| 1 (this pass) | Applewold, Kindlemoor, Chalkbarrow Coast | measured by `scripts/world_survey_map.mjs` | 6 to 13 |
| 2 | south row east, mid, west | | 11 to 15 |
| 3 | west march south, downs | | 14 to 18 |
| 4 | west march fens, heights | | 17 to 20 |
| 5 | west march rime, east march south (after the save epoch) | | 15 to 20 |
| 6 | east march isles | | 20 |

Walk times are measured along the road polylines at RUN_SPEED and at the
trained riding speeds by `scripts/world_walk_times.mjs`; see the world crew's
report for the current numbers.

## 5. The edge is the Hushmist (owner decision)

The frontier phenomenon is **the Hushmist**. The name lives in one place,
`FRONTIER_EDGE_NAME` in `src/sim/frontier/slots.ts` (dev reference only); when a
player first sees it (a zone banner, a tooltip, a map label) the text ships as
an English `t()` key in the matching `src/ui/i18n.catalog/` module, never as a
literal, so renaming it is one key.

## 6. Planned: the zone warp (enlarging shipped zones)

Owner direction: the launch world's longest road trip should take about 15
minutes on foot at RUN_SPEED (about 6,300 yd of road), mainly by ENLARGING the
shipped zones from Mirefen onward, with the Proving Shore and Eastbrook Vale
unchanged. Starts only after the town and story crews merge their current
edits in those zones.

**Method: one coordinate warp, never hand edits.** A monotone, piecewise
linear map `W(x, z)` (a new pure leaf, `src/sim/world_warp.ts`):

- identity on the Proving Shore, Eastbrook Vale and the Farshore rects, on
  the frontier slots, and on every instance band (x past 600 in the old plane
  and the far-east bands);
- per zone band a stretch factor (z for the strip rows, x for the columns),
  continuous at every band edge, so no point ever lands in two places;
- its inverse `W^-1` is exact (piecewise linear), so the ground is
  `newHeight(p) = shippedHeight(W^-1(p), seed)`: every hand-tuned coast, pad,
  ramp and editor stamp stays self-consistent, heights never change and slopes
  only get gentler.

**Content:** every positional record passes through `W` once, at table
assembly in `data.ts` (zones, hubs, POIs, lakes, camps, NPCs, ground objects,
gather nodes, roads, props, dungeon doors, portals, graveyards, painted-town
anchors, touch-up placements and object moves). Footprints, radii, rotations
and building sizes do NOT scale: the buildings stay their size, the land
around them grows. Collider bakes are rebuilt from the warped tables.

**The position sweep test** (`tests/world_warp_positions.test.ts`):
enumerate every exported position in `src/sim/content/` and every sim/render
module that holds literal world coordinates (found by a scan for numeric
`{ x, z }` literals in the overworld range), assert each resolves through `W`
and stands on walkable ground (dry, slope under the movement kernel's limit,
outside colliders), and fail on any literal that bypasses `W`. A second test
pins `W` as identity on the unchanged zones and the instance bands.

**Moved-positions list:** the warp run writes
`docs/design/world-warp-moves.md`, one row per moved record (id, old x,z, new
x,z, zone), for the story crew to reconcile quest text and map notes.

**Risks:** render modules with their own literal coordinates (set pieces,
dungeon entrances, harbor houses, maze grids) must be converted to read
warped anchors; seeded goldens re-pin; quest distances ("a short walk") need a
prose pass.

## 7. Travel network (design; sim pieces go to the systems crew)

Seamless rides along a path, no curtain: the rider is seated on a vehicle that
follows an authored polyline through the streamed world (the Proving Shore
ferry voyage is the precedent), and can step off at any stop.

- **The Wainway** (IP-checked, no game hits): the Hearthwright Compact's cart
  line along the main roads, a stop at every hub (Eastbrook, Fenbridge,
  Highwatch, Pressford, Ferncross, Coinwell Camp, and each later slot's hub).
  Cheap: 25 copper per stop, capped at 1 silver a ride.
- **Reed barges**: slow river and lake barges where a zone has a navigable
  waterway (Mirefen's channels, the Willowfen braids), a scenic alternative.
- **Ferries**: the Proving Shore ferry as today; a coastal ferry Gullhaven to
  Pressford once the south coast is dressed.
- **The Duskfall Passage portal** stays as is. Flag: it, the hearthstone and
  dungeon doors use the blocking teleport path, which holds the loading
  curtain until the landing neighbourhood streams (`zone_streaming.ts`
  `ARRIVAL_NEIGHBOR_STREAM_RADIUS`).

Sim pieces (a `travel/` system module: route records, seated-rider motion,
fares through the economy seam, stop prompts) belong to the systems crew.
