// W8 (housing) exports for the native Unreal client, beside the W0 parity exporter
// (scripts/unreal/parity_export.ts) and in its file shape. Two kinds of output:
//   - parity suites (scripts/unreal/protocol/parity/<suite>.json): the authoritative TS rules run
//     over fixed inputs; the Unreal tests `Wyndlewood.Housing.Parity.*` replay them, and the W8
//     acceptance driver replays housing_placement live against a dev server;
//   - the housing content (scripts/unreal/protocol/housing/housing_content.json): the house lots,
//     the cottage anchors, entry and exit points, the furniture catalog and the storage constants.
// Regenerate with `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_housing_export.test.ts`,
// then copy into the Unreal worktree (Data/Parity/, Data/Housing/).

import { FURNITURE_DEFS, HOUSE_STORAGE_CHEST_ITEM_ID } from '../../src/sim/content/furniture';
import { HOUSE_LOTS } from '../../src/sim/content/house_lots';
import { DUNGEONS, ITEMS, instanceOrigin } from '../../src/sim/data';
import {
  HOUSE_COTTAGE_ANCHORS,
  HOUSE_COTTAGE_ROOMS,
  HOUSE_ENTRY,
  HOUSE_EXIT,
} from '../../src/sim/housing/cottage_layout';
import { HOUSE_SEAT_PIECES, HOUSE_SEAT_STAND } from '../../src/sim/housing/house_seats';
import { HOUSE_CHEST_SLOTS, HOUSE_STORAGE_RANGE } from '../../src/sim/housing/house_storage';
import { HOUSE_PURCHASE_RANGE } from '../../src/sim/housing/ownership';
import { SEAT_REACH } from '../../src/sim/seat_anchor';
import { Sim } from '../../src/sim/sim';
import type { SimEvent } from '../../src/sim/types';
import { terrainHeight } from '../../src/sim/world';
import { furnishOptions, houseAnchorOrdinal } from '../../src/ui/hud/housing/house_furnish_view';
import { houseStorageDepositAllowed } from '../../src/ui/hud/housing/house_storage_view';
import { hudChromeStrings } from '../../src/ui/i18n.catalog/hud_chrome';
import type { ParityCase, ParitySuite } from './parity_export';

export const HOUSING_EXPORT_SUBDIR = 'housing';
export const HOUSING_CONTENT_FILE = 'housing_content.json';

export function buildHousingContent() {
  return {
    purchaseRange: HOUSE_PURCHASE_RANGE,
    storageRange: HOUSE_STORAGE_RANGE,
    chestSlots: HOUSE_CHEST_SLOTS,
    chestItemId: HOUSE_STORAGE_CHEST_ITEM_ID,
    entry: { ...HOUSE_ENTRY },
    exit: { ...HOUSE_EXIT },
    lots: HOUSE_LOTS.map((lot) => ({
      id: lot.id,
      dungeonId: lot.dungeonId,
      // Server data (the walk-in def's name); the client prefers the string table row
      // entities.dungeons.<dungeonId>.name when it has one.
      name: DUNGEONS[lot.dungeonId]?.name ?? lot.name,
      buildingId: lot.buildingId,
      zoneId: lot.zoneId,
      index: lot.index,
      door: { ...lot.doorPos },
      leave: { ...lot.leaveOffset },
      price: lot.priceCopper,
      // The lot's instance band (data.ts instanceOrigin): slot k's origin is
      // (originX, originZ0 + k * slotStrideZ); a body within 300 yd of originX is inside it.
      originX: instanceOrigin(lot.index, 0).x,
      originZ0: instanceOrigin(lot.index, 0).z,
      slotStrideZ: instanceOrigin(lot.index, 1).z - instanceOrigin(lot.index, 0).z,
    })),
    rooms: HOUSE_COTTAGE_ROOMS.map((r) => ({ id: r.id, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 })),
    anchors: HOUSE_COTTAGE_ANCHORS.map((a) => ({
      id: a.id,
      room: a.room,
      kind: a.kind,
      x: a.x,
      z: a.z,
      yaw: a.yaw,
      ordinal: houseAnchorOrdinal(a),
    })),
    // House seats (housing/house_seats.ts): the pieces a body sits on and how far in front of
    // a piece its stand spot lies; the seat id is `house:<entityId>`.
    seatStand: HOUSE_SEAT_STAND,
    seatReach: SEAT_REACH,
    seatPieces: Object.keys(HOUSE_SEAT_PIECES).sort(),
    // Borrowed gear (ItemDef.lentGear): the house storage refuses it like a quest item.
    lentGear: Object.keys(ITEMS)
      .filter((id) => (ITEMS[id] as { lentGear?: unknown }).lentGear)
      .sort(),
    furniture: FURNITURE_DEFS.map((d) => ({
      item: d.itemId,
      kind: d.kind,
      render: d.renderKey,
      scale: d.scale,
      station: d.stationType ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Parity suites

/** One scripted step of the placement scenario (the W8 acceptance replays it live). */
export interface HousingPlacementStep {
  op: 'place' | 'remove';
  anchor: string;
  /** The furniture item the place step names (its first bag stack), '' for a remove. */
  item: string;
}

// Ten placements on valid and invalid spots (ea-plan.md W8), plus an uncarried piece and two
// take-backs. The storage chest goes first, on the hearth floor spot within storage reach of
// the arrival point, so the storage step needs no walking inside.
export const HOUSING_PLACEMENT_STEPS: readonly HousingPlacementStep[] = Object.freeze([
  { op: 'place', anchor: 'hearth_floor_1', item: 'furn_storage_chest' },
  { op: 'place', anchor: 'hearth_floor_1', item: 'furn_wooden_chair' },
  { op: 'place', anchor: 'hearth_floor_2', item: 'furn_woven_rug' },
  { op: 'place', anchor: 'hearth_rug_1', item: 'furn_woven_rug' },
  { op: 'place', anchor: 'hearth_wall_1', item: 'furn_bookcase' },
  { op: 'place', anchor: 'bedroom_floor_1', item: 'furn_candlestick' },
  { op: 'place', anchor: 'workshop_table_1', item: 'furn_candlestick' },
  { op: 'place', anchor: 'cellar_floor_1', item: 'furn_keg' },
  { op: 'place', anchor: 'hearth_floor_2', item: 'furn_wooden_chair' },
  { op: 'place', anchor: 'workshop_floor_1', item: 'furn_station_forge' },
  { op: 'place', anchor: 'bedroom_floor_2', item: 'furn_oak_bench' },
  { op: 'remove', anchor: 'hearth_floor_3', item: '' },
  { op: 'remove', anchor: 'hearth_floor_2', item: '' },
]);

/** The furniture the scenario's owner carries into the house (one of each). */
export const HOUSING_PLACEMENT_CARRIED: readonly string[] = Object.freeze([
  'furn_storage_chest',
  'furn_wooden_chair',
  'furn_woven_rug',
  'furn_bookcase',
  'furn_candlestick',
  'furn_keg',
  'furn_station_forge',
]);

/** The bag slot the client sends for a piece it does not carry: past every bag, so the sim's
 *  slot read is empty (furnishing.ts denies no_item). */
export const HOUSING_UNCARRIED_SLOT = 99;

function furnitureString(furniture: Record<string, string>): string {
  return Object.keys(furniture)
    .sort()
    .map((k) => `${k}=${furniture[k]}`)
    .join(';');
}

function placement(): ParitySuite {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
  const s = sim as unknown as {
    players: Map<number, { house: unknown; inventory: { itemId: string }[] }>;
    entities: Map<number, { pos: { x: number; y: number; z: number }; prevPos: unknown }>;
    ctx: { rebucket(e: unknown): void };
  };
  const pid = sim.player.id;
  const meta = s.players.get(pid)!;
  const lot = HOUSE_LOTS[0];
  meta.house = { lot: lot.id, boughtDay: '', furniture: {}, storage: [] };
  for (const id of HOUSING_PLACEMENT_CARRIED) sim.addItem(id, 1, pid);
  const e = s.entities.get(pid)!;
  e.pos = {
    x: lot.doorPos.x,
    y: terrainHeight(lot.doorPos.x, lot.doorPos.z, 42),
    z: lot.doorPos.z,
  };
  e.prevPos = { ...e.pos };
  s.ctx.rebucket(e);
  sim.tick();
  const house = meta.house as { furniture: Record<string, string> };
  const cases: ParityCase[] = [];
  for (const step of HOUSING_PLACEMENT_STEPS) {
    const carried = meta.inventory.filter((x) => x).map((x) => x.itemId);
    const before = furnitureString(house.furniture);
    const slot =
      step.op === 'place' ? meta.inventory.findIndex((x) => x && x.itemId === step.item) : -1;
    if (step.op === 'place') {
      sim.placeFurniture(step.anchor, slot < 0 ? HOUSING_UNCARRIED_SLOT : slot, pid);
    } else {
      sim.removeFurniture(step.anchor, pid);
    }
    const events = sim.tick() as SimEvent[];
    const denied = events.find((ev) => ev.type === 'houseDenied');
    const done = events.find((ev) => ev.type === 'houseFurniture');
    cases.push({
      in: {
        op: step.op,
        anchor: step.anchor,
        item: step.item,
        furniture: before,
        carried: carried.join(','),
      },
      out: {
        ok: done !== undefined,
        reason: denied && denied.type === 'houseDenied' ? denied.reason : '',
        furniture: furnitureString(house.furniture),
      },
    });
  }
  return {
    suite: 'housing_placement',
    source: 'src/sim/housing/furnishing.ts placeFurniture, removeFurniture (a live Sim)',
    note: 'owner inside their own Quay Cottage copy; furniture is anchor=item sorted, carried is bag item ids',
    cases,
  };
}

/** The furnish picker rows (house_furnish_view.ts furnishOptions) per furniture item over a few
 *  furnishing states. */
function furnishPicker(): ParitySuite {
  const states: Record<string, string>[] = [
    {},
    { hearth_floor_1: 'furn_storage_chest', hearth_rug_1: 'furn_woven_rug' },
    Object.fromEntries(
      HOUSE_COTTAGE_ANCHORS.filter((a) => a.kind === 'floor').map((a) => [a.id, 'furn_barrel']),
    ),
  ];
  const cases: ParityCase[] = [];
  for (const furniture of states) {
    for (const item of [...FURNITURE_DEFS.map((d) => d.itemId), 'ironbark_log']) {
      const rows = furnishOptions(item, { lotId: HOUSE_LOTS[0].id, furniture });
      cases.push({
        in: { item, furniture: furnitureString(furniture) },
        out: rows.map((r) => `${r.action}:${r.anchorId}${r.itemId ? `:${r.itemId}` : ''}`),
      });
    }
  }
  return {
    suite: 'housing_furnish_picker',
    source: 'src/ui/hud/housing/house_furnish_view.ts furnishOptions',
    note: 'rows are action:anchor[:item]; free anchors of the kind first, then every occupied anchor',
    cases,
  };
}

/** The house storage deposit admission (house_storage_view.ts houseStorageDepositAllowed). */
function storageAdmission(): ParitySuite {
  const cases: ParityCase[] = [];
  const sorted = Object.keys(ITEMS).sort();
  const quest = sorted.filter((id) => ITEMS[id].kind === 'quest').slice(0, 3);
  const lent = sorted.filter((id) => (ITEMS[id] as { lentGear?: unknown }).lentGear).slice(0, 2);
  const plain = sorted.filter((id) => ITEMS[id].kind !== 'quest').slice(0, 4);
  const ids = ['furn_wooden_chair', ...plain, ...quest, ...lent];
  for (const itemId of ids) {
    cases.push({
      in: { item: itemId },
      out: { allowed: houseStorageDepositAllowed({ itemId, count: 1 }) },
    });
  }
  return {
    suite: 'housing_storage_admission',
    source: 'src/ui/hud/housing/house_storage_view.ts houseStorageDepositAllowed',
    note: 'plain copies (no instance, no lock); a quest item or lent gear is refused',
    cases,
  };
}

export const HOUSING_PARITY_SUITES: Record<string, () => ParitySuite> = {
  housing_placement: placement,
  housing_furnish_picker: furnishPicker,
  housing_storage_admission: storageAdmission,
};

// ---------------------------------------------------------------------------
// Supplement string table

/** The housing catalog subtree as a supplement table (Data/Strings/housing_strings_en.csv): the
 *  netclient string table predates the keys housing added since; WyndText merges only the rows
 *  the main table lacks. */
export const HOUSING_STRINGS_FILE = 'housing_strings_en.csv';

function flattenStrings(prefix: string, node: unknown, out: Array<[string, string]>): void {
  if (typeof node === 'string') {
    out.push([prefix, node]);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) flattenStrings(`${prefix}.${k}`, v, out);
  }
}

const csvCell = (s: string): string =>
  /[",\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

/** WyndText's CSV shape (Key,SourceString), sorted by key. */
export function housingStringsCsv(): string {
  const rows: Array<[string, string]> = [];
  flattenStrings('hudChrome.housing', hudChromeStrings.housing, rows);
  rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `Key,SourceString\n${rows.map(([k, v]) => `${k},${csvCell(v)}`).join('\n')}\n`;
}

export function buildHousingSuite(name: string): ParitySuite {
  const f = HOUSING_PARITY_SUITES[name];
  if (!f) throw new Error(`unknown housing suite ${name}`);
  return f();
}
