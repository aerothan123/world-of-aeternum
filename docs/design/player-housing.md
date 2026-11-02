# Player housing (Project H)

Status: phases 1 to 3 implemented (lots and purchase, Furnishing and
furniture, storage chests and home stations); phases 4 to 6 are design only.
Working project name: Project H.

Phase 3 status: shipped on the fork as `src/sim/housing/house_storage.ts`,
`house_storage_state.ts` and `house_stations.ts`. The implementation deviates
from the two sketches below in one way each, recorded here so the doc and the
code agree: the chest storage is NOT a bank capacity term but its own pooled
slot list on `HouseOwnership.storage` (persisted inside the character save,
omitted when empty), reached only inside the owner's house near a placed chest
through the `hst` self key, deposit and withdraw reusing the bank's
container-agnostic move; and taking back a chest the stored items still need is
refused (`storage_in_use`) rather than tolerated as over-capacity. Home stations
inject no `StationDef`: the craft gate gained a home arm and the placed station's
crafts join the served-craft set the crafting window already reads, while
training, unbind and the Perfecting exchange stay town services.

Player housing in the New World style: buy a house in a town, step through its
door into your own private interior, furnish it with player-crafted furniture,
and get real benefits from owning it. This document fixes the decisions and the
build order so each phase can land as its own reviewable change.

## Decisions (agreed with the project owner)
- **Town houses with private interiors.** A house lot is a door in a town. Every
  player who owns that lot gets their OWN copy of the interior behind it, so lots
  are never contested and nobody fights over land (the New World model).
- **Four perks:** extra storage chests, home crafting stations, trophy buffs, and
  a recall-home ability.
- **Furniture is player-crafted** through a new Furnishing profession, so housing
  feeds the economy rather than bypassing it.
- **Weekly gold upkeep** (property tax) as an economy sink.

## Design choices made here (open to revision)
- **Per-character ownership.** A house belongs to one character, stored in that
  character's save blob, exactly like the bank vault. This keeps the anti-dupe
  rule (one blob, one owner, one write path) and avoids a new account-level
  table. Account-wide housing can come later if wanted.
- **One house per character to start.** A lot table supports more later.
- **Anchored furniture first, free placement later.** Each interior layout has
  fixed anchor points (wall, floor, table, trophy plaque). Placing furniture
  means choosing an anchor. This keeps colliders static and the renderer simple.
  Free placement is a later phase.
- **Taxes never destroy anything.** An unpaid house goes dormant: you can still
  walk in and withdraw from chests, but deposits, trophy buffs, home stations and
  recall are suspended until the arrears are paid. No item or house is ever
  deleted by the tax.
- **Prices are placeholders.** Lot prices, tax, and trophy strengths live in one
  tuning module and are flagged for a balance pass; they are not classic-era
  formulas.

## Architecture (how it fits the engine)

### House lots (static content)
`src/sim/content/house_lots.ts`: a `HOUSE_LOTS` table, one row per door, with a
stable never-reused id, zone, door position and facing, interior layout id, tier,
and price. Modeled on `content/farm_patches.ts` (static rows plus per-player
state, stable ids because they are persisted). Placement gets its own test like
`tests/farm_patch_placement.test.ts`.

### Ownership state (persisted)
New optional `house` field on `CharacterState` (`src/sim/character_state.ts`):
lot id, purchase reset-day, placed furniture (anchor id to item id), last taxed
week, and dormant flag. Added end-to-end the standard way: `PlayerMeta` default,
a `houseSaveFragment` spread in `serializeCharacter` (omitted when no house, so
old saves stay byte-equal), a sanitize-on-load helper, and the key classified in
`tests/professions_blob_growth.test.ts`. Logic lives in a new
`src/sim/housing/` module behind `SimContext`, never inline in `sim.ts`
(`tests/monolith_budget.test.ts`).

### Private interiors (instance band)
A new instance band beside delves and rifts in `src/sim/data.ts`:
`HOUSE_X_MIN`, `houseOrigin(slot)`, `isHousePos(x)`, with a slot pool modeled on
the delve run pool (`src/sim/delves/runs.ts`) rather than `DungeonDef`, because
houses need many concurrent copies and one door per lot, not one door per
dungeon. Slots are keyed `house:char:<ownerCharacterId>` (never the party key) so
future guests join the owner's copy, and freed after `INSTANCE_EMPTY_TIMEOUT`.

Touchpoints: `isInstancedRegion` (`src/sim/colliders.ts`) so interiors use the
instanced collision path; `interior_collider_sets.ts` for the layout colliders;
`resolveSavedPosExit` (`src/sim/saved_pos_exit.ts`) so logging out inside a house
rejoins at that lot's door; the renderer gets an interior builder beside
`src/render/dungeon.ts`.

### Doors and interaction
House doors and furniture are ground objects with an F-interact arm in
`src/sim/interaction.ts` (`house_door`, `house_exit`, `house_chest`,
`house_station`, `house_trophy`), teleporting through `displacePlayer`
(`src/sim/displacement.ts`). Not proximity `PORTALS`, since one door leads to
many private copies.

### Furnishing profession
Off the crafting ring, as a standalone secondary profession. Adding an eleventh
craft to `CRAFT_RING` would break the opposite-craft math and archetype pairs
that assume an even ring. Furnishing reuses the recipe record shape
(`ProfessionRecipeRecord`, its own `FURNISHING_RECIPES` appended to the END of
`ALL_RECIPES`), consumes existing gathered materials (planks, hides, cloth,
ingots), and gets a trainer and a workshop station in each housing town.

### Storage chests
A new additive capacity term `houseSlots` in the bank model (`src/sim/bank.ts`,
beside `bonusSlots`): each placed chest adds slots, and a chest object counts as
a banker for the proximity gate. One pooled vault, no second container to
duplicate items through. Removing a chest shrinks capacity the way a bonus
shrink does today: over-capacity blocks deposits, never destroys items.

### Home crafting stations
Placed station furniture injects a per-owner `StationDef` into the station
placements the craft gate reads (`src/sim/professions/stations.ts`), so
`isAtStation`, training, and the HUD station list all just work inside the
house.

### Trophies
Trophies are crafted furniture placed on trophy anchors (cap of five, like New
World). Their bonuses fold into `computeCharacterModifiers`
(`src/sim/set_bonus_mods.ts`) through a new `applyHouseTrophyModifiers`, next to
the set-bonus path, so combat stats need no new plumbing. New modifier fields for
gathering yield, crafting reagent discount, and damage versus a mob family, read
at the gather grant, `crafting.ts` reagent counting, and `combat/damage.ts`.
Not auras: auras would need permanent exemptions from persistence, dispel, and
display.

### Recall home
A 10 second non-spell cast on the Allied Hearthstone pattern
(`content/faction_rewards.ts`), landing inside your house. Unlike that
hearthstone, the cooldown persists across logout via `cooldown_persist.ts` and
a restorable id in `restorableCooldown`, following `unstuck_cooldown.ts`.

### Weekly tax
The sim never reads the clock. The tax keys off `ctx.resetDay` (fed by
`server/sim_calendar_feed.ts` online and `src/game/utc_day.ts` offline), turned
into a week id the way `src/sim/weekly_quests.ts` does. On login and at each
reset, every elapsed week since `lastTaxWeek` is charged once; an empty reset day
(headless, replay) skips the tax. Insufficient gold sets the house dormant.

### Client seam
A new `src/world_api/housing.ts` facet: static lot table, the caller's own house
view, and commands (`buyHouse`, `enterHouse`, `placeFurniture`,
`removeFurniture`, `payHouseTax`, `recallHome`). Implemented in both `Sim` and
`ClientWorld` (`src/net/online.ts`), pinned in
`tests/world_api_parity.test.ts`, with new wire command names appended. All
player text is English `t()` keys in a new `src/ui/i18n.catalog/housing.ts`.

## Build order
Each phase is playable on its own and lands as one change with tests.

1. **Lots, purchase, private interior.** Lot table and placement test, purchase
   at the door, persisted ownership, the house instance band, enter and exit,
   logout-inside handling. Result: buy a house and walk around an empty interior.
2. **Furnishing and furniture.** The Furnishing profession, trainer, workshop,
   recipes and furniture items, anchors, placing and removing furniture, and
   rendering it. Result: craft furniture and decorate.
3. **Storage chests and home stations.** `houseSlots` capacity and chest
   access; per-house crafting stations.
4. **Trophies.** Trophy items, the modifier fold, and the three new modifier
   reads.
5. **Recall home.** Cast, landing, persisted cooldown.
6. **Weekly tax.** Week accounting, payment, dormancy, and the UI for arrears.

Later: free furniture placement, inviting friends in, multiple houses per
character, account-wide houses, workers living in the house (BDO-style worker
lodging feeds the worker system on the roadmap).
