# Chapter One placements

Where Wyndlewood Chapter One (`src/sim/content/chapter_one.ts`) puts its people,
camps, objects and fishing spots. Every point was picked with the worktree's own
terrain and collider queries (dry ground, unblocked, in the Proving Shore or
Eastbrook Vale) and is pinned by `tests/chapter_one_content.test.ts`. Eastbrook
spots sit on the town's edges and outskirts, outside the hub buildings the
town-kit relayout owns; anything here that lands inside a relaid lot moves
with a coordinate edit only (no id changes).

Coordinates are world x, z in yards. The Eastbrook hub centre is about
(-14, -100); the town noticeboard (the quest board) is at (5, -89); the Hollow
Crypt door is at (80, 90).

## New townsfolk

| NPC (template id) | Display name | Position |
| --- | --- | --- |
| `scout_neris` | Neris Snowmantle | (75, -40), the eastern lookout past Meadow Lane |
| `gravekeeper_holven` | Bertram Ashcombe | (25, -106), the burial gate |
| `innkeeper_jorren` | Jorren | (12, -84), the riverside inn counter |
| `herbalist_olvessa` | Olvessa | (-30, -76), the herb terrace |
| `gardener_della` | Della Brindlepot | (-13.2, -72.8), the riverside garden |
| `carpenter_pella` | Wenna Nookwright | (-45, -87), the carpenter's yard north of the main street |
| `fisherman_tobbin` | Tobbin Wickerby | (-278, -4), the Proving Shore jetty |

## Camps (all `offStream`, so no shipped spawn shifts)

| Mob | Centre | Radius | Count |
| --- | --- | --- | --- |
| `bristlejaw_shore_rat` | (-312.4, 64.6) | 5 | 3 |
| `gravestirred_fieldhand` | (45, -118) | 7 | 4 |
| `briarbitten_fox` | (5, -55) | 7 | 4 |
| `orchard_boar` | (-15.7, -138.1) | 8 | 4 |
| `veiled_rite_tender` | (92, -46) | 5 | 3 |
| `culvert_rat` | (-60, -135) | 7 | 5 |
| `quarry_burrower` | (5, 175) | 7 | 4 |

## Objects

Ground objects use reserved entity ids from 2_147_200_000 upward in authoring
order; new objects are appended at the end of `CHAPTER_ONE_OBJECTS` so no
earlier id moves. The full coordinate list lives in the source; the groups are:

- Proving Shore wreck and beacon: supply bundles and the broken lifeboat on the
  southern beach (around -295, -34); the Northern Beacon and its wick knots
  (-320.7, 68.3).
- Tobbin's jetty: the crab pot (-272.6, -12.6), bait tub (-281, -6), loan rod
  (-279.5, -1.5) and keep-net (-271.5, 4).
- Fenlow's ferry walkway: tool chest axe (-286, -11), deck nails
  (-285.2, -12.2), ferry workbench (-282, -12.5), timber rack (-288, -7), the
  two walkway gaps (-276, 0) and (-274.5, 2.5), and four marked shore pines in
  the western copse around (-303, -5).
- Eastbrook garden and herb terrace: turnips, root samples, fence stake and
  root ties (around -12, -70); carrots (around -16.5, -72); windwhistle patches
  and balm by the old footbridge (around -35, -70).
- Chapel and burial ground: disturbed graves (around 23, -116), the cloth snag
  at the gate (26, -104.5), name stones and the grave lamp (around 45, -118),
  prayer boards, founding map and reading desk (around 15, -111).
- The inn: tapping panels, rent notice, speaking pipe, bread heel and saucer
  (around 14, -85), and the public hearth (10.3, -86.5).
- Silven's stall: parcels, delivery slips and the cart tag (around -26, -96),
  in front of the row terrace's street face rather than under it.
- Brunna's public furnace (-4.6, -116.8), beside the forge.
- Wenna's yard: workbench (-46.5, -84), housing noticeboard (-43, -83),
  furnishing practice marker (-44, -80.5), on the free ground the town layout
  keeps for it north of the main street.
- The root hedge and the bone pit: silvermint and waxed bindings (around
  5, -56); lamp oil cups by the eastern lookout (around 73, -40); face veils
  on the approach (70.4, -49.6) and (74.5, -47); the three bound grave lamps
  (96, -43), (88, -50) and (96, -50). The bone pit moved east of Meadow Lane
  so the town kit's houses (Meadow Lane along z -24) keep their clearance.
- The Crypt Road: two boundary warnings (40, 25) and (48, 40); the outer
  wicket (55, 55), well outside the restless-bones camp at (82, 78).
- Board dailies: road checkposts on the south road, quay posts on the riverside
  walk, watch lanterns on the Briar Gate circuit, water-level gauges at the
  brook crossings, and the carried goods beside their posters.

## Fishing spots (quest catches on open sea)

| Catch | Stand point | Radius |
| --- | --- | --- |
| Shore Minnow (quest 03) | (-273.5, 5.5), Tobbin's jetty | 6 |
| Brook Trout (quest 27) | (-94, -60), the town fishing steps | 6 |

## Escorts

- Neris (quest 21): from the lane milepost (70, -56) through (71, -51) and
  (73, -46) to the eastern lookout (75, -42.5); two briarbitten foxes ambush
  at the second waypoint.
- Della (quest 17): from the willow footbridge end of the brook path
  (-14.1, -58.4) by (-10, -48), (8, -36), (30, -45) and (55, -45) to the
  eastern lookout (75, -42.5). The start keeps 45 yards
  clear of the Eastbrook freight yard world quest.

## Reconciled with the town layout

The town crew's Eastbrook relayout puts Meadow Lane along z -24 off (30, -30)
with houses at (36.3, -14.2), (48.8, -17.6), (18.7, -33.4) and (45.8, -30.8)
and a well at (57, -29); a row terrace at (-22.5, -86.3); a stone cottage at
(-72, -86); and a red cottage at (-72.5, -45.1), every door facing north or
south. Chapter One keeps clear of all of them
(`tests/chapter_one_content.test.ts`, the town-lot clearance case): Silven's
stall goods and the board's rivet and hinge drops moved out from under the
terrace, Wenna's yard moved to the free ground at about (-45, -87), and
Della's escort passes behind the Meadow Lane houses' back gardens. Every camp keeps at
least 11 yards past its radius from every lot. The spot at about (-78, -45)
beside the red cottage stays free for a later garden or board.
