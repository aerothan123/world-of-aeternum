// W3 (items) exports for the native Unreal client, beside the W0 parity exporter
// (scripts/unreal/parity_export.ts) and in its file shape. Two kinds of output:
//   - parity suites (scripts/unreal/protocol/parity/<suite>.json): the authoritative TS rule run
//     over a fixed input grid; the Unreal tests `Wyndlewood.Items.Parity.*` replay them;
//   - the items content (scripts/unreal/protocol/items/items_content.json): per item the fields
//     the bags, paperdoll, vendor, durability and bank views read, per vendor NPC its stock and
//     whether it repairs, the equip slot order and the bank constants.
// Regenerate with `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_items_export.test.ts`,
// then copy into the Unreal worktree (Data/Parity/, Data/Items/).

import { BANK_BASE_SLOTS, BANK_EXPANSION_SLOTS } from '../../src/sim/bank';
import { ITEMS, NPCS } from '../../src/sim/data';
import { npcRepairs, REPAIR_ALL_SERVICE_ID } from '../../src/sim/durability/durability';
import {
  currentDurability,
  DURABILITY_LOW_FRACTION,
  DURABILITY_SLOTS,
  durabilityState,
  isBroken,
  maxDurabilityFor,
  repairCopperPerPoint,
  repairCost,
  wearOf,
} from '../../src/sim/durability/durability_rules';
import { npcRoleFor } from '../../src/sim/npc_role';
import { ALL_EQUIP_SLOTS, type ItemDef } from '../../src/sim/types';
import { tEntity } from '../../src/ui/entity_i18n';
import type { ParityCase, ParitySuite } from './parity_export';

export const ITEMS_EXPORT_SUBDIR = 'items';
export const ITEMS_CONTENT_FILE = 'items_content.json';

function itemName(id: string): string {
  return ITEMS[id] ? tEntity({ kind: 'item', id, field: 'name' }) : id;
}

function itemRecord(id: string, def: ItemDef) {
  const d = def as ItemDef & {
    slot?: string;
    quality?: string;
    buyValue?: number;
    noVendorSell?: boolean;
    soulbound?: boolean;
    stackSize?: number;
    bagSlots?: number;
    requiredLevel?: number;
  };
  const max = maxDurabilityFor(def);
  return {
    id,
    name: itemName(id),
    kind: d.kind,
    slot: d.slot ?? null,
    quality: d.quality ?? 'common',
    sell: Number.isFinite(d.sellValue) ? d.sellValue : 0,
    buy: d.buyValue !== undefined && Number.isFinite(d.buyValue) && d.buyValue > 0 ? d.buyValue : 0,
    stack: d.stackSize ?? 1,
    noSell: d.noVendorSell === true || d.soulbound === true || d.kind === 'quest',
    bagSlots: d.bagSlots ?? 0,
    reqLevel: d.requiredLevel ?? 0,
    maxDur: max,
    repairPerPoint: max > 0 ? repairCopperPerPoint(def) : 0,
  };
}

function vendorRecords() {
  const out: {
    id: string;
    name: string;
    role: string | null;
    repairs: boolean;
    banker: boolean;
    stock: string[];
    pos: { x: number; z: number } | null;
  }[] = [];
  for (const [id, npc] of Object.entries(NPCS)) {
    const stock = (npc as { vendorItems?: string[] }).vendorItems ?? [];
    const repairs = npcRepairs(id);
    const banker = (npc as { banker?: boolean }).banker === true;
    if (stock.length === 0 && !repairs && !banker) continue;
    out.push({
      id,
      name: tEntity({ kind: 'npc', id, field: 'name' }),
      role: npcRoleFor(npc),
      repairs,
      banker,
      stock: [...stock],
      pos: (npc as { pos?: { x: number; z: number } }).pos
        ? {
            x: (npc as { pos: { x: number } }).pos.x,
            z: (npc as { pos: { z: number } }).pos.z,
          }
        : null,
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

export function buildItemsContent() {
  const items = Object.entries(ITEMS)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, def]) => itemRecord(id, def));
  return {
    equipSlots: [...ALL_EQUIP_SLOTS],
    durabilitySlots: [...DURABILITY_SLOTS],
    durabilityLowFraction: DURABILITY_LOW_FRACTION,
    repairAllServiceId: REPAIR_ALL_SERVICE_ID,
    bankBaseSlots: BANK_BASE_SLOTS,
    bankExpansionSlots: BANK_EXPANSION_SLOTS,
    items,
    vendors: vendorRecords(),
  };
}

// ---------------------------------------------------------------------------
// Parity suites

/** Every durable item at a grid of wear values: max, current, state and repair cost. */
function durability(): ParitySuite {
  const cases: ParityCase[] = [];
  const ids = Object.keys(ITEMS)
    .filter((id) => maxDurabilityFor(ITEMS[id]) > 0)
    .sort();
  // A spread over the catalog keeps the suite small but covers every slot and quality.
  const seen = new Set<string>();
  for (const id of ids) {
    const def = ITEMS[id] as ItemDef & { slot?: string; quality?: string };
    const key = `${def.slot}|${def.quality ?? 'common'}|${(def as { hand?: string }).hand ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const max = maxDurabilityFor(def);
    for (const wear of [
      0,
      1,
      Math.floor(max * 0.5),
      Math.ceil(max * 0.76),
      max - 1,
      max,
      max + 5,
      -3,
    ]) {
      cases.push({
        in: { item: id, wear },
        out: {
          max,
          lost: wearOf(def, wear),
          current: currentDurability(def, wear),
          broken: isBroken(def, wear),
          state: durabilityState(def, wear),
          cost: repairCost(def, wear),
        },
      });
    }
  }
  return {
    suite: 'items_durability',
    source: 'src/sim/durability/durability_rules.ts',
    note: 'one item per slot, quality and hand; wear past max and negative wear clamp',
    cases,
  };
}

export const ITEMS_PARITY_SUITES: Record<string, () => ParitySuite> = {
  items_durability: durability,
};

export function buildItemsSuite(name: string): ParitySuite {
  const f = ITEMS_PARITY_SUITES[name];
  if (!f) throw new Error(`unknown items suite ${name}`);
  return f();
}
