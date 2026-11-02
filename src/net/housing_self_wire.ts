// Player housing (Project H): decode of the `hse` self-delta key (the caller's
// own house, IWorldHousing.myHouse). DOM-free and ClientWorld-free, following
// the wire-decode sibling idiom: every field is re-validated and a malformed
// value decodes to null (no house shown) rather than rendering a half record.
// The furniture map (phase 2) is re-validated row by row against the live
// anchors and furniture catalog; a bad row is dropped, never rendered.
//
// Delta contract: the key is omitted when unchanged; the CALLER keeps the prior
// mirror on omission and only calls this for a present key. An explicit null is
// "no house".

import { furnitureDefFor } from '../sim/content/furniture';
import { houseLotById } from '../sim/content/house_lots';
import { houseAnchorById } from '../sim/housing/cottage_layout';
import type { HouseView } from '../world_api';

export function decodeHouseWire(raw: unknown): HouseView | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const lotId = record.lotId;
  if (typeof lotId !== 'string' || !houseLotById(lotId)) return null;
  const furniture: Record<string, string> = {};
  const rawFurniture = record.furniture;
  if (rawFurniture !== null && typeof rawFurniture === 'object') {
    for (const [anchorId, itemId] of Object.entries(rawFurniture as Record<string, unknown>)) {
      if (!houseAnchorById(anchorId)) continue;
      if (typeof itemId !== 'string' || !furnitureDefFor(itemId)) continue;
      furniture[anchorId] = itemId;
    }
  }
  return { lotId, furniture };
}
