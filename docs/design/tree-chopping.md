# Tree chopping

Logging comes from the forest itself. Every overworld scatter tree (the `tree` and `tree2`
decorations `src/sim/world.ts` `generateDecorations` places) is a Logging source a player
walks up to and fells with F. It falls, leaves a stump you can walk over, and grows back
from a sapling five minutes later. The little wood-stand nodes this replaced are retired.

## What is choppable

- **Which trees.** `src/sim/trees/tree_registry.ts` `buildTree` decides. A scatter tree
  counts unless it is one of these:
  - a rock;
  - a far-only record (the impostor-band filler, never a collider);
  - in a settlement (within `TOWN_TREE_CLEARANCE` of a zone hub's radius, or within
    `PAINTED_TOWN_TREE_PAD` of a painted town's reach);
  - in a professions-free zone (`TREE_FREE_ZONE_IDS`: the Proving Shore).

  Great trees are not scatter decorations, and instanced interiors have none, so neither
  can be chopped.
- **Stable id.** A tree's id comes from its decoration-lattice cell
  (`treeAnchorId`: the anchor grid `generateDecorations` jitters from, so a tree never
  leaves its cell). The same seed gives the same ids on every host. The node id is
  `tree:<id>` (`treeNodeId`). Lookups are lazy and windowed: no host ever lists the
  whole forest.
- **Tier and level.** The tier comes from a stable hash of the id
  (`treeTierFor`), weighted by the zone's row in `TREE_TIER_WEIGHTS_BY_ZONE`
  (`src/sim/content/tree_chopping.ts`). Each row repeats the tier makeup of the wood stands
  that zone carried, so the Logging climb keeps the ladder it had: Eastbrook is all tier 1,
  Mirefen is mixed 1 and 2, and Thornpeak finishes the climb with tier 3. The content level
  follows the snapshot rule every gather node used (the ceil of the zone's levelRange
  midpoint).

## Chopping

- **Interaction.** F on a standing tree in reach
  (`src/game/interact_key_gather.ts` `withNearbyTrees`). Using an axe also targets the
  nearest standing tree (`src/game/gather_tool_use.ts`). Both send the ordinary harvest
  command with the tree's node id.
- **The cast.** A chop is the existing gather cast (`professions/gathering.ts`
  `harvestNode`), under its own cast id `TREE_CHOP_CAST_ID`. That id gives the cast bar its
  "Chopping" label and the character its swing animation, both from public entity state. It
  is interrupted exactly like any other gathering cast: by moving, by damage pushback, or
  by a cancel.
- **Swing count.** `src/sim/trees/tree_chop.ts` `treeChopSwings` sets it: three plus the
  tree's tier, minus one per wieldable axe tier above the tree's tier, minus the Logging
  proficiency band, clamped from `TREE_CHOP_MIN_SWINGS` to `TREE_CHOP_MAX_SWINGS`. Each swing
  is `TREE_CHOP_SWING_SECONDS`.
- **Tools.** Tier-1 trees need no axe (`treeRequiredToolTier`), so a new character can chop
  the starting forest. From tier 2 up, a tree needs an axe of at least its tier, with the
  same wield rule wood stands used. The refusals are the existing node lines ("Requires
  Logging N", "Requires a better axe").
- **Yield.** The zone's existing wood material (the `NODE_MATERIAL_TABLE` wood rows),
  rolled through the unchanged `resolveHarvest` two-draw contract on `ctx.rng`. Quest
  credit, proficiency XP and the rare-find events are those of any node.
- **Contention.** The first player to finish fells the tree, and nobody holds a lock on it.
  Anyone else still swinging at that tree is stopped with "The tree is already felled."
  (`src/sim/trees/tree_felling.ts` `fellTree`). Trees have no per-player respawn timer: a
  standing tree can always be chopped.

## Felled state (server-authoritative)

- **State.** `Sim.treeFells` (a `TreeFellState`, a live `SimContext` view) holds the
  felled set keyed by tree id, each entry with its `regrowAt` in sim seconds, plus a `rev`
  counter that bumps on every fell and every regrow. The state is not persisted: a restart
  regrows the forest.
- **Regrowth.** Every tree regrows `TREE_REGROW_SECONDS` after it falls. Because the delay
  is a constant, fell order is regrow order, so `updateTreeRegrowth` pops a FIFO queue. The
  per-tick cost is one comparison at the queue head. The set is bounded by recent chopping,
  never by realm age, and the regrow phase draws no rng.
- **Collision.** A felled trunk stops blocking. `src/sim/trees/tree_fell_collision.ts` is a
  process-wide collision view (the gate, berth and wall precedent in `src/sim/CLAUDE.md`).
  The owning world publishes it. `colliders.ts` `collidersInCell` filters felled trunks out
  and rebuilds a combined cell when the view's version moves. The online client publishes
  the same view from its mirror, so prediction agrees with the server.
- **Deed.** The first fell marks the visit `felling:tree` (the `felling` namespace in
  `src/sim/deeds.ts`), which grants `prog_first_felling`, "The First Fell". The deed is
  cosmetic Renown only. The name was IP-checked: the plain English phrase is shared
  generic fantasy, and no major game wiki uses it as a coined term.

## Wire

- **Event.** `treeFelled { treeId, x, z, yaw, fellerId }` is world-visible and anchored at
  the trunk, so the interest-scoped event fan-out delivers it to the chopper and to
  bystanders in event range. A far session never receives it.
- **Snapshot readout.** The self block carries `ftr` (`server/felled_trees_wire.ts`
  `appendFelledTreesSelfWire`): the felled trees within `FELLED_TREE_WIRE_RADIUS` of the
  player, sent as `[[id, regrowAt], ...]`. The readout is serialized once per `(rev, 32-yard
  cell)` and shared by every viewer in that cell. A session gets it again only when `rev`
  moves or the player crosses into a new cell. A quiet forest costs nothing per tick, and a
  felled tree costs a few bytes in the frame that changes.
- **Client mirror.** `src/net/felled_trees_wire.ts` `FelledTreeMirror` decodes `ftr`. It keeps
  entries outside the reported disc while the player is still well inside the area that
  readout covered. It exposes the same `FelledTreesView` that `Sim` does, through the
  `IWorld` member `felledTrees()` (`src/world_api/professions.ts`). A reconnecting client
  gets the current stumps in its first snapshot.

## Render

`src/render/tree_felling.ts` (`TreeFellingView`) is the thin Three consumer, and
`src/render/tree_felling_core.ts` (registered in `RENDER_PURE_CORES`) holds every curve and
set decision.

- **Hide.** The standing tree's instance is hidden without rebuilding its batch: its part
  matrices are zeroed, along with its shadow-caster slots (`TreeHideable.shadows`).
- **Fall.** A standalone copy, on the batch's own geometry shell and materials (no new
  program), tips away from the feller about its base. It eases in like gravity over
  `TREE_FALL_SECONDS`, gives a small rebound and settles. A dust burst and the crash cue
  fire once on impact (`impactCrossed`), then the trunk lies still and sinks away over
  `TREE_FADE_SECONDS`.
- **Stump.** A stump instance on the bark material, sized by `stumpDims`, draws for as
  long as the tree is down. A tree already felled when the client first sees it shows as a
  stump at once, with no fall.
- **Regrow.** A sapling eases up to full size over `TREE_REGROW_ANIM_SECONDS`
  (`regrowScaleAt`), then the batch instance is restored.
- **Chop beats.** The chopper plays the rig's one-hand swing (`TREE_CHOP_CAST_CLIP`), with
  one axe-hit cue per swing (`chopHitsBy`).
- **Fairness.** A stump or a missing trunk is world state a player navigates by, so the
  view draws on every graphics preset.
- **Shader programs.** Every program it draws is already linked by the foliage batch it
  borrows from, so it adds nothing to the prewarm manifest.

## Retired wood stands

The wood rows of `GATHER_NODES` are gone. Their sites survive only as
`RETIRED_WOOD_NODE_SITES` inside `GATHER_NODE_SITES_AS_SHIPPED`. The terrain calm anchors and
the seasonal road lanterns were laid around those sites, and both keep reading the
as-shipped list, so the terrain and the lantern network are unchanged. The material
source readouts now name the forest of each `TREE_SOURCE_ZONE_IDS` zone. Quests and deeds
that asked for wood now credit on a felled tree: the chronicle gatherer pages read "fell a
tree". A saved per-player timer for a retired node is dropped on load.

## Known limits

- Far impostor sprites (past the detail band) still draw a felled tree standing until the
  player is close enough for the instanced batch.
- There is no 3D click-pick for trees. F and axe use cover the interaction.
- The HUD has no free-standing interact prompt for trees. The cast bar and the tooltip
  carry the text.

Pinned by `tests/tree_chopping.test.ts`, `tests/felled_trees_wire.test.ts` and
`tests/tree_felling_core.test.ts`.
