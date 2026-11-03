// The slotted tool effects projected for the IWorld seam (`toolEffectSlots`)
// and the `tslot` self-wire delta. A MOVE out of Sim.toolEffectSlotsFor (the
// coordinator keeps a one-line delegate) to keep sim.ts under its monolith
// ceiling; the rows, their order and the shared empty instance are unchanged.
// Pure leaf: no SimContext, no rng.

import type { ToolEffectSlotView } from '../../world_api';
import { GATHERING_PROFESSION_IDS, type GatheringProfessionId } from '../content/professions';
import { EMPTY_TOOL_EFFECT_SLOT_VIEWS, type ToolEffectSlot } from './tools';

/**
 * Returns [] for the absent field, which is the default and must stay that
 * way: an empty object still serializes into the parity state digest, so
 * initialising the map would move every golden for a feature no scenario
 * uses. Sorted by professionId so the JSON form is a stable delta signature.
 */
export function toolEffectSlotViewsFor(
  meta:
    | { name: string; toolEffectSlots?: Partial<Record<GatheringProfessionId, ToolEffectSlot>> }
    | undefined,
): readonly ToolEffectSlotView[] {
  const slots = meta?.toolEffectSlots;
  // The empty arms return the shared frozen instance: this runs per tick
  // per session on the snapshot path, and a fresh [] here was two
  // allocations per player per tick (the array plus its serialized "[]")
  // for the overwhelming majority who never slot an effect.
  if (!meta || !slots) return EMPTY_TOOL_EFFECT_SLOT_VIEWS;
  const rows: ToolEffectSlotView[] = [];
  for (const professionId of GATHERING_PROFESSION_IDS) {
    const slot = slots[professionId];
    if (!slot) continue;
    rows.push({
      professionId,
      effectId: slot.effectId,
      charges: slot.durability,
      maxCharges: slot.maxDurability,
      confirmMode: slot.confirmMode,
      // The R48 privacy-preserving provenance projection: a boolean, never
      // the name (a foreign crafter's identity stays server-side).
      selfCrafted: slot.craftedBy !== undefined && slot.craftedBy === meta.name,
    });
  }
  if (rows.length === 0) return EMPTY_TOOL_EFFECT_SLOT_VIEWS;
  // GATHERING_PROFESSION_IDS is already a stable content order, but the sort
  // is what the signature contract actually promises, so state it. A plain
  // codepoint compare, never localeCompare: this runs per tick per session on
  // the snapshot path, and an ICU collation inside the deterministic core
  // would make the wire order depend on the host's locale data.
  return rows.sort((a, b) =>
    a.professionId < b.professionId ? -1 : a.professionId > b.professionId ? 1 : 0,
  );
}
