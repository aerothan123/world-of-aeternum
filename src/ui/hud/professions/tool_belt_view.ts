// Pure view core for the character sheet's Tools section: the gathering tool
// belt (src/sim/professions/gather_tool_slots.ts), one cell per gathering
// profession in content order, separate from the combat paperdoll. DOM-free,
// i18n-free, rng-free; tool_belt_painter.ts is the thin DOM consumer and
// tests/tool_belt_view.test.ts drives this directly with both a Sim-shaped
// and a ClientWorld-mirror-shaped belt.

import {
  GATHERING_PROFESSION_IDS,
  type GatheringProfessionId,
} from '../../../sim/content/professions';
import {
  type GatherToolSlots,
  gatherToolSlotFor,
} from '../../../sim/professions/gather_tool_slots';
import type { InvSlot, ItemDef, ItemInstancePayload } from '../../../sim/types';

/** One Tools cell: the slot, the tool equipped there (null when empty), its
 *  per-copy payload (a signed or crafted tool), and its tier (0 when empty). */
export interface ToolBeltCell {
  professionId: GatheringProfessionId;
  item: ItemDef | null;
  instance: ItemInstancePayload | null;
  tier: number;
}

function tierOf(def: ItemDef | null): number {
  const use = def?.use;
  if (!use) return 0;
  if (use.type === 'gatherTool') return use.tier;
  return use.type === 'fishing' ? 1 : 0;
}

/** The belt as cells, every slot present (empty ones included) so the row
 *  never reflows when a tool is equipped. An id the item table no longer
 *  knows reads as an empty cell. */
export function buildToolBeltView(
  slots: Readonly<GatherToolSlots> | undefined,
  items: Readonly<Record<string, ItemDef>>,
): ToolBeltCell[] {
  return GATHERING_PROFESSION_IDS.map((professionId) => {
    const slot: InvSlot | undefined = slots?.[professionId];
    const item = slot ? (items[slot.itemId] ?? null) : null;
    return {
      professionId,
      item,
      instance: item ? (slot?.instance ?? null) : null,
      tier: tierOf(item),
    };
  });
}

/** Whether a dragged item may drop on this Tools cell: it is a gathering tool
 *  of exactly this cell's profession (the sim's own slot rule). */
export function toolBeltDropAccepts(
  item: ItemDef | undefined,
  professionId: GatheringProfessionId,
): boolean {
  return gatherToolSlotFor(item) === professionId;
}

/** A value signature of the belt for change detection (the painter repaints
 *  only when it moves). */
export function toolBeltSignature(cells: readonly ToolBeltCell[]): string {
  return cells.map((c) => `${c.professionId}:${c.item?.id ?? ''}`).join('|');
}
