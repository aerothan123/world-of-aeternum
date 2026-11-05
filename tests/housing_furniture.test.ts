// Player housing (Project H), phase 2: the Furnishing profession, the furniture
// catalog, the cottage anchors, placing and taking back furniture inside the
// owner's house, the furniture entities, the save round trip, the wire decode,
// and the HUD's pure furnish core.
import { describe, expect, it } from 'vitest';
import { decodeHouseWire } from '../src/net/housing_self_wire';
import {
  FURNITURE_DEFS,
  FURNITURE_ITEM_IDS,
  FURNITURE_ITEMS,
  furnitureDefFor,
  isFurnitureItemId,
} from '../src/sim/content/furniture';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import {
  CRAFT_RING,
  craftById,
  craftMaxSkillFor,
  FURNISHING_CRAFT_ID,
  isSecondaryCraft,
  PERK_THRESHOLDS,
  STATIONS,
} from '../src/sim/content/professions';
import {
  ALL_RECIPES,
  FURNISHING_RECIPES,
  FURNISHING_STARTER_RECIPE_IDS,
  HOUSE_STATION_RECIPES,
} from '../src/sim/content/recipes';
import { DUNGEON_X_THRESHOLD, ITEMS } from '../src/sim/data';
import {
  HOUSE_COTTAGE_ANCHORS,
  HOUSE_COTTAGE_DECOR,
  HOUSE_COTTAGE_DOORS,
  HOUSE_COTTAGE_ROOMS,
  HOUSE_ENTRY,
  HOUSE_EXIT,
  houseAnchorById,
} from '../src/sim/housing/cottage_layout';
import { ownHouseInstanceAt } from '../src/sim/housing/furnishing';
import {
  furnitureItemOf,
  furnitureTemplateId,
  isFurnitureTemplateId,
} from '../src/sim/housing/furniture_template';
import {
  type DroppedFurnitureRow,
  sanitizeFurnishingSkill,
  sanitizeHouseState,
  savedHouseState,
} from '../src/sim/housing/house_state';
import { houseInstanceKey } from '../src/sim/housing/ownership';
import { enterDungeon, freeInstance, leaveDungeon } from '../src/sim/instances/dungeons';
import { gainSecondaryCraftSkill } from '../src/sim/professions/secondary_skill';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { bagItemContextActions } from '../src/ui/bag_item_context_menu';
import { furnitureTooltipLines } from '../src/ui/hud/housing/furniture_tooltip_view';
import { houseFeedbackPlan } from '../src/ui/hud/housing/house_feedback_view';
import {
  furnishOptions,
  houseAnchorLabel,
  houseAnchorOrdinal,
  insideOwnHouse,
} from '../src/ui/hud/housing/house_furnish_view';

const LOT = HOUSE_LOTS[0];
const CHAIR = 'furn_wooden_chair';
const RUG = 'furn_woven_rug';
const FLOOR_ANCHOR = 'hearth_floor_1';
const RUG_ANCHOR = 'hearth_rug_1';

function makeSim(): Sim {
  return new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
}

function place(sim: Sim, pid: number, x: number, z: number): void {
  const e = (sim as any).entities.get(pid);
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = terrainHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  (sim as any).ctx.rebucket(e);
}

function metaOf(sim: Sim, pid: number) {
  return (sim as any).players.get(pid);
}

function eventsOfType<T extends SimEvent['type']>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

/** An owner standing inside their own house, with a chair and a rug in the bags. */
function ownerInside(sim = makeSim()): { sim: Sim; pid: number } {
  const pid = sim.player.id;
  metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
  sim.addItem(CHAIR, 1, pid);
  sim.addItem(RUG, 1, pid);
  place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
  sim.tick();
  expect(sim.player.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
  return { sim, pid };
}

function slotOf(sim: Sim, pid: number, itemId: string): number {
  return metaOf(sim, pid).inventory.findIndex((s: { itemId: string }) => s.itemId === itemId);
}

function furnitureEntities(sim: Sim): Entity[] {
  return [...((sim as any).entities.values() as Iterable<Entity>)].filter((e) =>
    isFurnitureTemplateId(e.templateId),
  );
}

describe('the furniture catalog (content)', () => {
  it('every furniture def is a merged, non-equippable, non-junk common item with a name', () => {
    // twelve phase-2 pieces, the six phase-3 home stations, and the painted
    // Wyndlewood kit pieces (assets_src/wyndlewood_props/furniture_catalog.json)
    expect(FURNITURE_ITEM_IDS.length).toBe(63);
    for (const def of FURNITURE_DEFS) {
      const item = ITEMS[def.itemId];
      expect(item, def.itemId).toBe(FURNITURE_ITEMS[def.itemId]);
      expect(item.kind).toBe('tool');
      expect(item.slot).toBeUndefined();
      expect(item.use).toBeUndefined();
      expect(item.quality).toBe('common');
      expect(def.itemId.startsWith('furn_')).toBe(true);
      expect(furnitureDefFor(def.itemId)).toBe(def);
      expect(isFurnitureItemId(def.itemId)).toBe(true);
    }
    expect(isFurnitureItemId('ironbark_log')).toBe(false);
    expect(furnitureDefFor(undefined)).toBeUndefined();
    // the chest (phase 3 storage) and the reserved trophy plaque
    expect(furnitureDefFor('furn_storage_chest')?.kind).toBe('floor');
    expect(furnitureDefFor('furn_trophy_plaque')?.kind).toBe('wall');
  });

  it('every anchor kind has at least one piece that fits it', () => {
    for (const kind of ['floor', 'wall', 'rug', 'table'] as const) {
      expect(
        FURNITURE_DEFS.some((def) => def.kind === kind),
        kind,
      ).toBe(true);
    }
  });

  it('the templateId leaf round-trips every furniture id and refuses the rest', () => {
    for (const id of FURNITURE_ITEM_IDS) {
      const templateId = furnitureTemplateId(id);
      expect(isFurnitureTemplateId(templateId)).toBe(true);
      expect(furnitureItemOf(templateId)).toBe(id);
    }
    expect(furnitureItemOf('furniture_not_a_thing')).toBeNull();
    expect(furnitureItemOf('ground_ironbark_log')).toBeNull();
    expect(isFurnitureTemplateId(null)).toBe(false);
  });

  it('every furniture item renders a tooltip card', () => {
    for (const id of FURNITURE_ITEM_IDS) expect(furnitureTooltipLines({ id })).not.toBe('');
    expect(furnitureTooltipLines({ id: 'ironbark_log' })).toBe('');
  });
});

describe('the Furnishing profession (a secondary craft off the ring)', () => {
  it('stays off CRAFT_RING but resolves through the shared craft lookups', () => {
    expect(CRAFT_RING).toHaveLength(10);
    expect(CRAFT_RING.some((craft) => craft.id === FURNISHING_CRAFT_ID)).toBe(false);
    expect(isSecondaryCraft(FURNISHING_CRAFT_ID)).toBe(true);
    expect(isSecondaryCraft('engineering')).toBe(false);
    expect(craftById(FURNISHING_CRAFT_ID).name).toBe('Furnishing');
    expect(craftMaxSkillFor(FURNISHING_CRAFT_ID)).toBe(125);
    expect(PERK_THRESHOLDS[FURNISHING_CRAFT_ID]).toBeDefined();
  });

  it('has one trainer-taught toolworks recipe per furniture item, appended at the end', () => {
    // the phase-2 rows, then the phase-3 station rows (tests/housing_stations.test.ts)
    const furnishing = [...FURNISHING_RECIPES, ...HOUSE_STATION_RECIPES];
    expect(furnishing).toHaveLength(FURNITURE_ITEM_IDS.length);
    expect(ALL_RECIPES.slice(-furnishing.length)).toEqual(furnishing);
    const outputs = new Set<string>();
    for (const recipe of furnishing) {
      expect(recipe.professionId).toBe(FURNISHING_CRAFT_ID);
      expect(recipe.stationType).toBe('toolworks');
      expect(recipe.acquisition).toEqual(['trainer']);
      expect(recipe.skillReq).toBe(0);
      expect(isFurnitureItemId(recipe.resultItemId)).toBe(true);
      outputs.add(recipe.resultItemId);
      for (const reagent of recipe.reagents)
        expect(ITEMS[reagent.itemId], reagent.itemId).toBeDefined();
    }
    expect([...outputs].sort()).toEqual([...FURNITURE_ITEM_IDS].sort());
    for (const id of FURNISHING_STARTER_RECIPE_IDS) {
      expect(
        FURNISHING_RECIPES.some((recipe) => recipe.id === id),
        id,
      ).toBe(true);
    }
  });

  it('the Furnishing skill counter gains additively, clamps at cap, and loads clamped', () => {
    const host = { furnishingSkill: 0 };
    expect(gainSecondaryCraftSkill(host, FURNISHING_CRAFT_ID, 5)).toBe(5);
    expect(gainSecondaryCraftSkill(host, 'engineering', 5)).toBe(0);
    expect(gainSecondaryCraftSkill(host, FURNISHING_CRAFT_ID, -1)).toBe(0);
    expect(gainSecondaryCraftSkill(host, FURNISHING_CRAFT_ID, 1000)).toBe(120);
    expect(host.furnishingSkill).toBe(125);
    expect(sanitizeFurnishingSkill(undefined)).toBe(0);
    expect(sanitizeFurnishingSkill(-3)).toBe(0);
    expect(sanitizeFurnishingSkill(Number.NaN)).toBe(0);
    expect(sanitizeFurnishingSkill(900)).toBe(125);
    expect(sanitizeFurnishingSkill(12.5)).toBe(12.5);
  });

  it('crafting a furniture recipe advances the Furnishing skill, never a ring craft', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    const meta = metaOf(sim, pid);
    const recipe = FURNISHING_RECIPES[0];
    meta.knownRecipes.add(recipe.id);
    for (const reagent of recipe.reagents) sim.addItem(reagent.itemId, reagent.count * 2, pid);
    meta.copper = 100_00;
    // stand at the Eastbrook toolworks
    const station = STATIONS.find((s) => s.type === 'toolworks')!;
    place(sim, pid, station.pos.x, station.pos.z);
    const ringBefore = { ...meta.craftSkills };
    sim.craftItem(recipe.id, false, pid, 1);
    for (let i = 0; i < 20 * 8; i++) sim.tick();
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(1);
    expect(meta.furnishingSkill).toBeGreaterThan(0);
    expect(meta.craftSkills).toEqual(ringBefore);
    expect(Object.keys(meta.craftSkills)).toHaveLength(CRAFT_RING.length);
    // and the counter persists, omitted at zero
    const saved = sim.serializeCharacter(pid)!;
    expect(saved.furnishingSkill).toBe(meta.furnishingSkill);
    const fresh = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    expect(
      fresh.serializeCharacter(fresh.addPlayer('mage', 'Zero'))?.furnishingSkill,
    ).toBeUndefined();
  });

  it('buying a house grants the two starter recipes', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    const meta = metaOf(sim, pid);
    meta.copper = LOT.priceCopper;
    place(sim, pid, LOT.doorPos.x + LOT.leaveOffset.x, LOT.doorPos.z + LOT.leaveOffset.z);
    sim.buyHouse(LOT.id, pid);
    sim.tick();
    expect(meta.house?.lot).toBe(LOT.id);
    for (const id of FURNISHING_STARTER_RECIPE_IDS) expect(meta.knownRecipes.has(id)).toBe(true);
  });
});

describe('the cottage anchors (placement)', () => {
  const roomOf = (id: string) => HOUSE_COTTAGE_ROOMS.find((r) => r.id === id);

  it('ids are unique, kinds are known, and every anchor stands inside its room', () => {
    expect(new Set(HOUSE_COTTAGE_ANCHORS.map((a) => a.id)).size).toBe(HOUSE_COTTAGE_ANCHORS.length);
    expect(HOUSE_COTTAGE_ANCHORS.length).toBeGreaterThanOrEqual(14);
    for (const anchor of HOUSE_COTTAGE_ANCHORS) {
      const room = roomOf(anchor.room);
      expect(room, anchor.id).toBeDefined();
      if (!room) continue;
      expect(anchor.x).toBeGreaterThan(room.x0 + 0.5);
      expect(anchor.x).toBeLessThan(room.x1 - 0.5);
      expect(anchor.z).toBeGreaterThan(room.z0 + 0.5);
      expect(anchor.z).toBeLessThan(room.z1 - 0.5);
      expect(['floor', 'wall', 'rug', 'table']).toContain(anchor.kind);
      expect(houseAnchorById(anchor.id)).toBe(anchor);
    }
    expect(houseAnchorById('nowhere')).toBeUndefined();
  });

  it('every anchor clears the shell decor, the door lanes, the entry and exit triggers, and its neighbours', () => {
    const LANE = 1.5;
    for (const anchor of HOUSE_COTTAGE_ANCHORS) {
      for (const decor of HOUSE_COTTAGE_DECOR) {
        if (decor.key === 'rug') continue; // a flat cloth, no footprint
        const d = Math.hypot(anchor.x - decor.x, anchor.z - decor.z);
        expect(d, `${anchor.id} vs ${decor.key}`).toBeGreaterThan((decor.r ?? 0) + 0.6);
      }
      for (const door of HOUSE_COTTAGE_DOORS) {
        const inLaneX = Math.abs(anchor.x - door.x) <= door.hw + LANE;
        const inLaneZ = Math.abs(anchor.z - door.z) <= door.hd + LANE;
        expect(inLaneX && inLaneZ, `${anchor.id} blocks the door at ${door.x},${door.z}`).toBe(
          false,
        );
      }
      for (const pt of [HOUSE_ENTRY, HOUSE_EXIT]) {
        expect(Math.hypot(anchor.x - pt.x, anchor.z - pt.z), anchor.id).toBeGreaterThan(2.5);
      }
      for (const other of HOUSE_COTTAGE_ANCHORS) {
        if (other === anchor) continue;
        expect(
          Math.hypot(anchor.x - other.x, anchor.z - other.z),
          `${anchor.id} vs ${other.id}`,
        ).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('each room carries the authored mix of kinds', () => {
    const count = (room: string, kind: string) =>
      HOUSE_COTTAGE_ANCHORS.filter((a) => a.room === room && a.kind === kind).length;
    expect(count('hearth_room', 'floor')).toBe(4);
    expect(count('hearth_room', 'rug')).toBe(1);
    expect(count('hearth_room', 'wall')).toBe(1);
    expect(count('bedroom', 'floor')).toBe(3);
    expect(count('bedroom', 'wall')).toBe(1);
    expect(count('bedroom', 'rug')).toBe(1);
    expect(count('workshop', 'floor')).toBe(3);
    expect(count('workshop', 'wall')).toBe(1);
    expect(count('workshop', 'table')).toBe(1);
  });
});

describe('placing and taking back furniture', () => {
  it('places the named bag copy on a free anchor and stands its entity', () => {
    const { sim, pid } = ownerInside();
    const meta = metaOf(sim, pid);
    const slot = slotOf(sim, pid, CHAIR);
    sim.placeFurniture(FLOOR_ANCHOR, slot, pid);
    const events = sim.tick();
    expect(eventsOfType(events, 'houseFurniture')).toEqual([
      { type: 'houseFurniture', pid, action: 'placed', anchorId: FLOOR_ANCHOR, itemId: CHAIR },
    ]);
    expect(meta.house.furniture).toEqual({ [FLOOR_ANCHOR]: CHAIR });
    expect(sim.countItem(CHAIR, pid)).toBe(0);
    expect(sim.myHouse).toEqual({ lotId: LOT.id, furniture: { [FLOOR_ANCHOR]: CHAIR } });
    const pieces = furnitureEntities(sim);
    expect(pieces).toHaveLength(1);
    const piece = pieces[0];
    const anchor = houseAnchorById(FLOOR_ANCHOR)!;
    expect(piece.templateId).toBe(furnitureTemplateId(CHAIR));
    expect(piece.lootable).toBe(false);
    expect(piece.objectItemId).toBeNull();
    expect(piece.respawnTimer).toBe(Number.POSITIVE_INFINITY);
    expect(piece.facing).toBe(anchor.yaw);
    // it stands at the anchor inside the owner's own claim
    const inst = ownHouseInstanceAt((sim as any).ctx, meta, sim.player.pos)!;
    expect(inst).not.toBeNull();
    expect(inst.objectIds).toContain(piece.id);
    expect(Math.abs(piece.pos.z - (sim.player.pos.z - HOUSE_ENTRY.z + anchor.z))).toBeLessThan(
      0.01,
    );
    // the respawn sweep never re-arms it
    for (let i = 0; i < 40; i++) sim.tick();
    expect(piece.lootable).toBe(false);
  });

  it('takes a piece back into the bags and despawns its entity', () => {
    const { sim, pid } = ownerInside();
    const meta = metaOf(sim, pid);
    sim.placeFurniture(FLOOR_ANCHOR, slotOf(sim, pid, CHAIR), pid);
    sim.tick();
    sim.removeFurniture(FLOOR_ANCHOR, pid);
    const events = sim.tick();
    expect(eventsOfType(events, 'houseFurniture')).toEqual([
      { type: 'houseFurniture', pid, action: 'removed', anchorId: FLOOR_ANCHOR, itemId: CHAIR },
    ]);
    expect(meta.house.furniture).toEqual({});
    expect(sim.countItem(CHAIR, pid)).toBe(1);
    expect(furnitureEntities(sim)).toHaveLength(0);
  });

  it('refuses every bad placement without spending anything', () => {
    const { sim, pid } = ownerInside();
    const meta = metaOf(sim, pid);
    const chair = slotOf(sim, pid, CHAIR);
    const rug = slotOf(sim, pid, RUG);
    const reasonOf = (run: () => void): string | undefined => {
      run();
      return eventsOfType(sim.tick(), 'houseDenied')[0]?.reason;
    };
    expect(reasonOf(() => sim.placeFurniture('no_such_anchor', chair, pid))).toBe('bad_anchor');
    expect(reasonOf(() => sim.placeFurniture(RUG_ANCHOR, chair, pid))).toBe('anchor_kind');
    expect(reasonOf(() => sim.placeFurniture(FLOOR_ANCHOR, 99, pid))).toBe('no_item');
    expect(reasonOf(() => sim.placeFurniture(FLOOR_ANCHOR, -1, pid))).toBe('no_item');
    // a non-furniture slot
    sim.addItem('ironbark_log', 1, pid);
    expect(
      reasonOf(() => sim.placeFurniture(FLOOR_ANCHOR, slotOf(sim, pid, 'ironbark_log'), pid)),
    ).toBe('no_item');
    // a locked copy
    sim.setItemLocked(CHAIR, true, pid, chair);
    expect(reasonOf(() => sim.placeFurniture(FLOOR_ANCHOR, chair, pid))).toBe('no_item');
    sim.setItemLocked(CHAIR, false, pid, chair);
    expect(reasonOf(() => sim.placeFurniture(FLOOR_ANCHOR, chair, pid))).toBeUndefined();
    expect(reasonOf(() => sim.placeFurniture(FLOOR_ANCHOR, rug, pid))).toBe('anchor_taken');
    expect(reasonOf(() => sim.removeFurniture(RUG_ANCHOR, pid))).toBe('anchor_empty');
    expect(reasonOf(() => sim.removeFurniture('nowhere', pid))).toBe('bad_anchor');
    expect(sim.countItem(RUG, pid)).toBe(1);
    expect(meta.house.furniture).toEqual({ [FLOOR_ANCHOR]: CHAIR });
    // dead
    sim.player.dead = true;
    expect(reasonOf(() => sim.placeFurniture(RUG_ANCHOR, slotOf(sim, pid, RUG), pid))).toBe('dead');
    sim.player.dead = false;
    // full bags refuse a take-back and leave the piece standing
    const ctx = (sim as any).ctx;
    for (const item of Object.values(ITEMS)) {
      if (!ctx.canAddItem(CHAIR, 1, pid)) break;
      if (item.kind === 'weapon' && !item.id.startsWith('heroic_')) sim.addItem(item.id, 1, pid);
    }
    expect(ctx.canAddItem(CHAIR, 1, pid)).toBe(false);
    expect(reasonOf(() => sim.removeFurniture(FLOOR_ANCHOR, pid))).toBe('bags_full');
    expect(meta.house.furniture).toEqual({ [FLOOR_ANCHOR]: CHAIR });
    expect(furnitureEntities(sim)).toHaveLength(1);
  });

  it('refuses outside the house, in another house, and with no house', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    const meta = metaOf(sim, pid);
    sim.addItem(CHAIR, 1, pid);
    const chair = slotOf(sim, pid, CHAIR);
    const reasonOf = (run: () => void): string | undefined => {
      run();
      return eventsOfType(sim.tick(), 'houseDenied')[0]?.reason;
    };
    expect(reasonOf(() => sim.placeFurniture(FLOOR_ANCHOR, chair, pid))).toBe('no_house');
    meta.house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
    expect(reasonOf(() => sim.placeFurniture(FLOOR_ANCHOR, chair, pid))).toBe('not_inside');
    expect(reasonOf(() => sim.removeFurniture(FLOOR_ANCHOR, pid))).toBe('not_inside');
    // inside the house of ANOTHER lot (the dev bypass), still not inside your own
    const dev = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true, devCommands: true });
    const dpid = dev.player.id;
    metaOf(dev, dpid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
    dev.addItem(CHAIR, 1, dpid);
    expect(enterDungeon((dev as any).ctx, HOUSE_LOTS[1].dungeonId, dpid, true)).toBe(true);
    dev.placeFurniture(FLOOR_ANCHOR, slotOf(dev, dpid, CHAIR), dpid);
    expect(eventsOfType(dev.tick(), 'houseDenied')[0]?.reason).toBe('not_inside');
    expect(sim.countItem(CHAIR, pid)).toBe(1);
  });

  it('a claim re-stands the saved furniture, and a freed claim drops it', () => {
    const { sim, pid } = ownerInside();
    const meta = metaOf(sim, pid);
    sim.placeFurniture(FLOOR_ANCHOR, slotOf(sim, pid, CHAIR), pid);
    sim.placeFurniture(RUG_ANCHOR, slotOf(sim, pid, RUG), pid);
    sim.tick();
    expect(furnitureEntities(sim)).toHaveLength(2);
    expect(leaveDungeon((sim as any).ctx, pid)).toBe(true);
    const ctx = (sim as any).ctx;
    const key = houseInstanceKey(meta);
    const inst = ctx.instances.find((i: { partyKey: string | null }) => i.partyKey === key);
    freeInstance(ctx, inst);
    expect(furnitureEntities(sim)).toHaveLength(0);
    expect(meta.house.furniture).toEqual({ [FLOOR_ANCHOR]: CHAIR, [RUG_ANCHOR]: RUG });
    // walking back in stands both again
    place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
    sim.tick();
    const pieces = furnitureEntities(sim);
    expect(pieces.map((p) => p.templateId).sort()).toEqual(
      [furnitureTemplateId(CHAIR), furnitureTemplateId(RUG)].sort(),
    );
  });

  it('two owners of one lot see only their own furniture', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const a = sim.addPlayer('warrior', 'Alda');
    const b = sim.addPlayer('mage', 'Brenn');
    for (const pid of [a, b])
      metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
    sim.addItem(CHAIR, 1, a);
    for (const pid of [a, b]) place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
    sim.tick();
    sim.placeFurniture(FLOOR_ANCHOR, slotOf(sim, a, CHAIR), a);
    sim.tick();
    const pieces = furnitureEntities(sim);
    expect(pieces).toHaveLength(1);
    const ea = (sim as any).entities.get(a);
    const eb = (sim as any).entities.get(b);
    expect(Math.abs(pieces[0].pos.z - ea.pos.z)).toBeLessThan(30);
    expect(Math.abs(pieces[0].pos.z - eb.pos.z)).toBeGreaterThan(100);
    expect(sim.houseFor(b)).toEqual({ lotId: LOT.id, furniture: {} });
  });
});

describe('furniture persistence and wire', () => {
  it('round-trips placed furniture through the character save', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Saver');
    metaOf(sim, pid).house = {
      lot: LOT.id,
      boughtDay: '',
      furniture: { [FLOOR_ANCHOR]: CHAIR, [RUG_ANCHOR]: RUG },
      storage: [],
    };
    const saved = sim.serializeCharacter(pid)!;
    expect(saved.house).toEqual({
      lot: LOT.id,
      furniture: { [FLOOR_ANCHOR]: CHAIR, [RUG_ANCHOR]: RUG },
    });
    const sim2 = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid2 = sim2.addPlayer('warrior', 'Saver', { state: saved });
    expect(metaOf(sim2, pid2).house.furniture).toEqual({
      [FLOOR_ANCHOR]: CHAIR,
      [RUG_ANCHOR]: RUG,
    });
  });

  it('sanitizes: unknown anchors, unknown items, and kind mismatches are dropped and reported', () => {
    const dropped: DroppedFurnitureRow[] = [];
    const loaded = sanitizeHouseState(
      {
        lot: LOT.id,
        furniture: {
          [FLOOR_ANCHOR]: CHAIR,
          gone_anchor: CHAIR,
          [RUG_ANCHOR]: 'ironbark_log',
          hearth_floor_2: RUG,
          bedroom_rug_1: 7,
        },
      },
      dropped,
    );
    expect(loaded?.furniture).toEqual({ [FLOOR_ANCHOR]: CHAIR });
    expect(dropped.map((row) => row.anchorId).sort()).toEqual(
      ['bedroom_rug_1', 'gone_anchor', 'hearth_floor_2', RUG_ANCHOR].sort(),
    );
    expect(sanitizeHouseState({ lot: LOT.id, furniture: 'x' })?.furniture).toEqual({});
    expect(savedHouseState({ lot: LOT.id, boughtDay: '', furniture: {}, storage: [] })).toEqual({
      lot: LOT.id,
    });
  });

  it('decodes the hse wire with the furniture map, dropping bad rows', () => {
    expect(decodeHouseWire({ lotId: LOT.id })).toEqual({ lotId: LOT.id, furniture: {} });
    expect(
      decodeHouseWire({
        lotId: LOT.id,
        furniture: { [FLOOR_ANCHOR]: CHAIR, nope: CHAIR, [RUG_ANCHOR]: 'ironbark_log', x: 3 },
      }),
    ).toEqual({ lotId: LOT.id, furniture: { [FLOOR_ANCHOR]: CHAIR } });
    expect(decodeHouseWire({ lotId: 'gone', furniture: {} })).toBeNull();
    expect(decodeHouseWire(null)).toBeNull();
  });
});

describe('the HUD furnish core', () => {
  it('labels anchors by room, kind and ordinal', () => {
    const a = houseAnchorById('hearth_floor_2')!;
    expect(houseAnchorOrdinal(a)).toBe(2);
    expect(houseAnchorOrdinal(houseAnchorById('workshop_table_1')!)).toBe(1);
    expect(houseAnchorLabel('hearth_floor_2')).toBe('Hearth room, floor 2');
    expect(houseAnchorLabel('bedroom_wall_1')).toBe('Bedroom, wall 1');
    expect(houseAnchorLabel('nowhere')).toBe('');
  });

  it('lists free anchors of the item kind to place, then every occupied anchor to take back', () => {
    const house = { lotId: LOT.id, furniture: { [FLOOR_ANCHOR]: CHAIR } };
    const options = furnishOptions(RUG, house);
    const places = options.filter((o) => o.action === 'place');
    expect(places.map((o) => o.anchorId)).toEqual(
      HOUSE_COTTAGE_ANCHORS.filter((a) => a.kind === 'rug').map((a) => a.id),
    );
    expect(options.filter((o) => o.action === 'remove')).toEqual([
      { action: 'remove', anchorId: FLOOR_ANCHOR, itemId: CHAIR },
    ]);
    // a chair sees every free floor anchor but not the taken one
    const chairPlaces = furnishOptions(CHAIR, house).filter((o) => o.action === 'place');
    expect(chairPlaces.some((o) => o.anchorId === FLOOR_ANCHOR)).toBe(false);
    expect(chairPlaces.length).toBe(
      HOUSE_COTTAGE_ANCHORS.filter((a) => a.kind === 'floor').length - 1,
    );
    expect(furnishOptions('ironbark_log', house)).toEqual([]);
    expect(furnishOptions(RUG, null)).toEqual([]);
  });

  it('insideOwnHouse answers the same for both worlds (a pure position read)', () => {
    const { sim } = ownerInside();
    const house = { lotId: LOT.id, furniture: {} };
    expect(insideOwnHouse(sim.player.pos.x, house)).toBe(true);
    expect(insideOwnHouse(LOT.doorPos.x, house)).toBe(false);
    expect(insideOwnHouse(sim.player.pos.x, { lotId: HOUSE_LOTS[1].id, furniture: {} })).toBe(
      false,
    );
    expect(insideOwnHouse(sim.player.pos.x, null)).toBe(false);
  });

  it('plans the furniture events and the appended deny reasons', () => {
    expect(
      houseFeedbackPlan({
        type: 'houseFurniture',
        pid: 1,
        action: 'placed',
        anchorId: FLOOR_ANCHOR,
        itemId: CHAIR,
      }),
    ).toEqual({
      kind: 'furniture',
      key: 'hudChrome.housing.furniturePlaced',
      item: 'Wooden Chair',
      anchor: 'Hearth room, floor 1',
    });
    expect(
      houseFeedbackPlan({ type: 'houseDenied', pid: 1, lotId: LOT.id, reason: 'anchor_kind' }),
    ).toMatchObject({ kind: 'error', key: 'hudChrome.housing.denied.anchorKind' });
    expect(
      houseFeedbackPlan({ type: 'houseDenied', pid: 1, lotId: '', reason: 'no_house' }),
    ).toMatchObject({ kind: 'error', key: 'hudChrome.housing.denied.noHouse', house: '' });
  });

  it('the bag context menu keeps its default row first for a furniture item', () => {
    const rows = bagItemContextActions(ITEMS[CHAIR], CHAIR);
    expect(rows[0].id).toBe('default');
  });
});
