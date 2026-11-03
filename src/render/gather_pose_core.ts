// The gathering pose, pure (registered in RENDER_PURE_CORES): which tool a
// gathering body holds and which swing it loops, derived from public entity
// state only (the cast id every snapshot already carries, plus the body's
// position against the static node table), so a remote player's pose needs no
// wire field of its own. The renderer feeds `heldGatherMainhand` into the
// existing held-weapon swap (characters/visual.ts setWeapon), which restores
// the real weapon the frame the cast ends or is interrupted, and the cast clip
// key into the visual's cast pose (`gatherSwing` on the rig's ClipMap).
//
// No shipped gathering tool has a held model of its own, so each profession
// borrows a held weapon of the nearest family from the shared held-weapon set
// (src/ui/weapon_variants.ts, the bag-icon map): a hatchet for the axe, a
// one-hand mace head for the pick (the KayKit library has no pick), and a
// carving knife for the sickle. An equipped tool that ever gains a model of its
// own wins over the stand-in (`hasModel`).

import type { GatheringProfessionId } from '../sim/content/professions';
import {
  FISHING_CAST_ID,
  GATHER_CAST_ID,
  type GatherNodeDef,
  type GatherNodeType,
  INTERACT_RANGE,
  TREE_CHOP_CAST_ID,
} from '../sim/types';
import { TREE_CHOP_CAST_CLIP } from './tree_felling_core';

/** The cast-clip key a body mining a vein plays: the rig's overhead swing. */
export const GATHER_MINE_CAST_CLIP = 'gather_mine';
/** The cast-clip key a body gathering herbs plays: the rig's kneel. */
export const GATHER_HERB_CAST_CLIP = 'gather_herb';

/** The held stand-in per profession: an item id the held-weapon map resolves
 *  to a model of the tool's family. Fishing keeps the fishing visuals it has
 *  (the bobber and line), and farming has no cast, so neither swaps a weapon. */
export const HELD_TOOL_STAND_INS: Readonly<Partial<Record<GatheringProfessionId, string>>> =
  Object.freeze({
    logging: 'rusty_hatchet',
    mining: 'training_mace',
    herbalism: 'vale_carving_knife',
  });

const PROFESSION_BY_NODE_TYPE: Readonly<Record<GatherNodeType, GatheringProfessionId>> = {
  ore: 'mining',
  wood: 'logging',
  herb: 'herbalism',
};

/** Reach slack over the interact range: a node cast starts within reach, and a
 *  remote body's displayed position may trail its server position a little. */
const NODE_POSE_REACH = INTERACT_RANGE + 1.5;

/**
 * The gathering profession a body's cast is working, or null when it is not
 * gathering: a tree chop is logging, fishing is fishing, and a plain gather
 * cast is the type of the nearest node in reach (the cast started there).
 */
export function gatherProfessionForCast(
  castingAbility: string | null,
  pos: { x: number; z: number },
  nodes: readonly Pick<GatherNodeDef, 'type' | 'pos'>[],
): GatheringProfessionId | null {
  if (castingAbility === TREE_CHOP_CAST_ID) return 'logging';
  if (castingAbility === FISHING_CAST_ID) return 'fishing';
  if (castingAbility !== GATHER_CAST_ID) return null;
  let best: GatherNodeType | null = null;
  let bestD2 = NODE_POSE_REACH * NODE_POSE_REACH;
  for (const node of nodes) {
    const dx = node.pos.x - pos.x;
    const dz = node.pos.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = node.type;
    }
  }
  return best ? PROFESSION_BY_NODE_TYPE[best] : null;
}

/** The cast-clip key for a gathering profession, or null for none. */
export function gatherCastClipFor(profession: GatheringProfessionId | null): string | null {
  if (profession === 'logging') return TREE_CHOP_CAST_CLIP;
  if (profession === 'mining') return GATHER_MINE_CAST_CLIP;
  if (profession === 'herbalism') return GATHER_HERB_CAST_CLIP;
  return null;
}

/**
 * The item id the body's main hand shows: while gathering, the equipped
 * tool when it has a held model, else the profession's stand-in; otherwise
 * (and for a profession with no stand-in) the real mainhand.
 */
export function heldGatherMainhand(
  profession: GatheringProfessionId | null,
  realMainhand: string | null,
  equippedToolId: string | null,
  hasModel: (itemId: string) => boolean,
): string | null {
  if (!profession) return realMainhand;
  if (equippedToolId && hasModel(equippedToolId)) return equippedToolId;
  return HELD_TOOL_STAND_INS[profession] ?? realMainhand;
}

/** The rig clip a gathering cast key plays, given the rig's gather swings
 *  and its one-hand fallback swing: mining and chopping fall back to the
 *  one-hand swing the chop has always looped, herbalism to the cast loop. */
export function gatherSwingClip(
  castKey: string | null,
  swings: { mine?: string; chop?: string; herb?: string } | undefined,
  fallbackSwing: string | undefined,
  castLoop: string | undefined,
): string | undefined {
  if (castKey === TREE_CHOP_CAST_CLIP) return swings?.chop ?? fallbackSwing;
  if (castKey === GATHER_MINE_CAST_CLIP) return swings?.mine ?? fallbackSwing;
  if (castKey === GATHER_HERB_CAST_CLIP) return swings?.herb ?? castLoop;
  return undefined;
}
