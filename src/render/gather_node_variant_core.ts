import { nodeMaterialFor } from '../sim/professions/gathering_materials';
import type { GatherNodeType } from '../sim/types';

// Which model a gather node draws (pure, Node-tested in
// tests/gather_node_variant_core.test.ts). A node's yield is decided per zone
// (sim/professions/gathering_materials.ts nodeMaterialFor), so the model is too:
// a copper vein looks like copper, a thorium vein like thorium. The variant is
// the MATERIAL, never the tier: tier stays the size step in
// gather_nodes_lookup.ts nodeTierScale, so a player still reads tier by size on
// every preset (the fairness invariant), and the variant only adds which ore or
// herb it is, which the tooltip already names.
//
// A material with no authored model (logs, a future ore) draws its type's
// shared model, so a new zone row never needs an asset to render.

export type GatherNodeVariant =
  | 'ore_copper'
  | 'ore_iron'
  | 'ore_thorium'
  | 'herb_silverleaf'
  | 'herb_goldleaf'
  | 'herb_sunpetal';

const VARIANT_BY_MATERIAL: Readonly<Record<string, GatherNodeVariant>> = {
  copper_ore: 'ore_copper',
  iron_ore: 'ore_iron',
  thorium_ore: 'ore_thorium',
  silverleaf_herb: 'herb_silverleaf',
  goldleaf_herb: 'herb_goldleaf',
  sunpetal_herb: 'herb_sunpetal',
};

/** Every authored variant, in a stable order (the preload set). */
export const GATHER_NODE_VARIANTS: readonly GatherNodeVariant[] = [
  'ore_copper',
  'ore_iron',
  'ore_thorium',
  'herb_silverleaf',
  'herb_goldleaf',
  'herb_sunpetal',
];

/** The variant a node of `type` in `zoneId` draws, or null for the type's shared model. */
export function gatherNodeVariantFor(
  type: GatherNodeType,
  zoneId: string,
): GatherNodeVariant | null {
  const itemId = nodeMaterialFor(type, zoneId).itemId;
  return Object.hasOwn(VARIANT_BY_MATERIAL, itemId) ? VARIANT_BY_MATERIAL[itemId] : null;
}

/** The node type a variant belongs to. */
export function gatherNodeVariantType(variant: GatherNodeVariant): GatherNodeType {
  return variant.startsWith('ore_') ? 'ore' : 'herb';
}

/** The node types that show a harvested (depleted) model while their timer runs. */
export const DEPLETED_NODE_TYPES: readonly GatherNodeType[] = ['ore', 'herb'];

/** True when a node reads as harvested for this viewer: its respawn countdown
 *  (IWorld nodeRespawnSeconds, per viewer in both worlds) is still running. */
export function nodeShowsDepleted(respawnSeconds: number | null): boolean {
  return respawnSeconds !== null && respawnSeconds > 0;
}

/** Uniform render scale per authored model, applied to the template root
 *  before it is batched (so the base anchor and the tier step scale with it).
 *  The pipeline normalized each model to its generation height; these bring
 *  the drawn size to the target: an ore vein about 1.25 to 1.4 yd tall (the
 *  old shared vein stood under 0.8), its collision body matched in
 *  sim/prop_layout.ts GATHER_NODE_BODIES. */
export const GATHER_NODE_MODEL_SCALE: Readonly<Record<string, number>> = {
  ore_copper: 0.78,
  ore_iron: 0.78,
  ore_thorium: 0.78,
  herb_silverleaf: 1,
  herb_goldleaf: 1,
  herb_sunpetal: 1,
  depleted_ore: 1.15,
  depleted_herb: 1,
};

/** Frames between depleted-state polls. The countdown is minutes long, so a
 *  quarter-second poll is instant to the eye and keeps the walk off the frame. */
export const DEPLETED_POLL_FRAMES = 15;
