// Player housing (Project H): decode of the `hse` self-delta key (the caller's
// own house, IWorldHousing.myHouse). DOM-free and ClientWorld-free, following
// the wire-decode sibling idiom: every field is re-validated and a malformed
// value decodes to null (no house shown) rather than rendering a half record.
//
// Delta contract: the key is omitted when unchanged; the CALLER keeps the prior
// mirror on omission and only calls this for a present key. An explicit null is
// "no house".

import { houseLotById } from '../sim/content/house_lots';
import type { HouseView } from '../world_api';

export function decodeHouseWire(raw: unknown): HouseView | null {
  if (raw === null || typeof raw !== 'object') return null;
  const lotId = (raw as Record<string, unknown>).lotId;
  if (typeof lotId !== 'string' || !houseLotById(lotId)) return null;
  return { lotId };
}
