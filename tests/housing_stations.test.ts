// Player housing (Project H), phase 3: home crafting stations. One station
// furniture piece per StationType, its Furnishing recipe, the home arm of the
// crafting station gate (satisfied only inside the OWN house near the placed
// station), the served-craft set the crafting window reads (`mst`), and the
// tooltip role line.
import { describe, expect, it } from 'vitest';
import {
  FURNITURE_ITEM_IDS,
  furnitureStationType,
  HOUSE_STATION_FURNITURE_DEFS,
} from '../src/sim/content/furniture';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import { STATION_RADIUS, STATION_TYPE_BY_CRAFT, STATIONS } from '../src/sim/content/professions';
import { ALL_RECIPES, FURNISHING_RECIPES, HOUSE_STATION_RECIPES } from '../src/sim/content/recipes';
import { DUNGEON_X_THRESHOLD, ITEMS } from '../src/sim/data';
import { furnitureItemOf } from '../src/sim/housing/furniture_template';
import { atHouseStation, houseStationTypesNear } from '../src/sim/housing/house_stations';
import { craftsForStationType, inRangeStationTypes } from '../src/sim/professions/stations';
import { Sim } from '../src/sim/sim';
import type { Entity, StationType } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { furnitureTooltipLines } from '../src/ui/hud/housing/furniture_tooltip_view';

const LOT = HOUSE_LOTS[0];
const FORGE_PIECE = 'furn_station_forge';
const WORKSHOP_ANCHOR = 'workshop_floor_1';
const STATION_TYPES: StationType[] = [
  'forge',
  'kitchens',
  'apothecary',
  'tannery',
  'loom',
  'toolworks',
];

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

function slotOf(sim: Sim, pid: number, itemId: string): number {
  return metaOf(sim, pid).inventory.findIndex((s: { itemId: string }) => s.itemId === itemId);
}

function stationEntity(sim: Sim, anchorId: string): Entity {
  const e = [...((sim as any).entities.values() as Iterable<Entity>)].find(
    (x) => x.name === anchorId && furnitureItemOf(x.templateId) !== null,
  );
  expect(e).toBeDefined();
  return e!;
}

/** An owner standing inside their own house with a forge piece placed on the
 *  workshop anchor and the owner stood beside it. */
function ownerAtHomeForge(): { sim: Sim; pid: number; station: Entity } {
  const sim = makeSim();
  const pid = sim.player.id;
  metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
  sim.addItem(FORGE_PIECE, 1, pid);
  place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
  sim.tick();
  expect(sim.player.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
  sim.placeFurniture(WORKSHOP_ANCHOR, slotOf(sim, pid, FORGE_PIECE), pid);
  sim.tick();
  const station = stationEntity(sim, WORKSHOP_ANCHOR);
  place(sim, pid, station.pos.x + 2, station.pos.z);
  sim.tick();
  return { sim, pid, station };
}

/** A forge-bound recipe with every reagent in the bags and the recipe known. */
function readyForgeRecipe(sim: Sim, pid: number) {
  const recipe = ALL_RECIPES.find((r) => r.id === 'recipe_copper_bearded_axe')!;
  expect(recipe.stationType).toBe('forge');
  const meta = metaOf(sim, pid);
  meta.knownRecipes.add(recipe.id);
  for (const reagent of recipe.reagents) sim.addItem(reagent.itemId, reagent.count * 2, pid);
  meta.copper = 100_00;
  return recipe;
}

describe('home station content', () => {
  it('ships one floor piece per StationType with a trainer-taught Furnishing recipe each', () => {
    expect(HOUSE_STATION_FURNITURE_DEFS.map((d) => d.stationType)).toEqual(STATION_TYPES);
    for (const def of HOUSE_STATION_FURNITURE_DEFS) {
      expect(def.kind).toBe('floor');
      expect(def.itemId).toBe(`furn_station_${def.stationType}`);
      expect(ITEMS[def.itemId]?.kind).toBe('tool');
      expect(furnitureStationType(def.itemId)).toBe(def.stationType);
    }
    expect(furnitureStationType('furn_wooden_chair')).toBeUndefined();
    expect(furnitureStationType('furn_storage_chest')).toBeUndefined();
    expect(HOUSE_STATION_RECIPES.map((r) => r.resultItemId)).toEqual(
      HOUSE_STATION_FURNITURE_DEFS.map((d) => d.itemId),
    );
    for (const recipe of HOUSE_STATION_RECIPES) {
      expect(recipe.professionId).toBe('furnishing');
      expect(recipe.stationType).toBe('toolworks');
      expect(recipe.acquisition).toEqual(['trainer']);
      for (const reagent of recipe.reagents)
        expect(ITEMS[reagent.itemId], reagent.itemId).toBeDefined();
    }
    // appended after the phase-2 rows, at the very end
    expect(ALL_RECIPES.slice(-HOUSE_STATION_RECIPES.length)).toEqual(HOUSE_STATION_RECIPES);
    expect(FURNISHING_RECIPES.length + HOUSE_STATION_RECIPES.length).toBe(
      FURNITURE_ITEM_IDS.length,
    );
    // every town station type has a home piece and vice versa
    expect(new Set(STATIONS.map((s) => s.type))).toEqual(new Set(STATION_TYPES));
  });

  it('the tooltip names the station the piece stands in for', () => {
    expect(furnitureTooltipLines({ id: FORGE_PIECE })).toContain('Forge');
    expect(furnitureTooltipLines({ id: 'furn_storage_chest' })).toContain('12');
    expect(furnitureTooltipLines({ id: 'furn_wooden_chair' })).not.toContain('Once placed');
  });
});

describe('the home station gate (sim)', () => {
  it('resolves the placed station type only inside the own house within STATION_RADIUS', () => {
    const { sim, pid, station } = ownerAtHomeForge();
    const ctx = (sim as any).ctx;
    const meta = metaOf(sim, pid);
    const e = (sim as any).entities.get(pid);
    expect([...houseStationTypesNear(ctx, meta, e.pos)]).toEqual(['forge']);
    expect(atHouseStation(ctx, pid, e.pos, 'forge')).toBe(true);
    expect(atHouseStation(ctx, pid, e.pos, 'loom')).toBe(false);
    // the served-craft resolver (the mst key) carries the forge's two crafts
    expect(sim.activeMobileStationCrafts).toEqual(craftsForStationType('forge').sort());
    expect(
      inRangeStationTypes(sim.stationPlacements, e.pos, sim.activeMobileStationCrafts),
    ).toEqual(new Set(['forge']));
    // beyond the radius inside the house: nothing
    place(sim, pid, station.pos.x - STATION_RADIUS - 1, station.pos.z - 10);
    sim.tick();
    expect(houseStationTypesNear(ctx, meta, e.pos).size).toBe(0);
    expect(sim.activeMobileStationCrafts).toEqual([]);
    // outside the house: nothing, even standing at the lot's door
    sim.leaveDungeon(pid);
    sim.tick();
    expect(sim.player.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
    expect(houseStationTypesNear(ctx, meta, e.pos).size).toBe(0);
    expect(atHouseStation(ctx, pid, e.pos, 'forge')).toBe(false);
  });

  it('a non-owner standing by the piece (the dev door bypass) is never served', () => {
    const { sim, pid, station } = ownerAtHomeForge();
    const ctx = (sim as any).ctx;
    // a second player with no house of their own, dropped beside the piece
    // (never reachable in play without the dev bypass; the gate stays closed)
    const other = sim.addPlayer('mage', 'Guest');
    place(sim, other, station.pos.x + 1, station.pos.z);
    sim.tick();
    expect(atHouseStation(ctx, other, (sim as any).entities.get(other).pos, 'forge')).toBe(false);
    expect(sim.activeMobileStationCraftsFor(other)).toEqual([]);
    // the owner's own read is unaffected
    expect(atHouseStation(ctx, pid, (sim as any).entities.get(pid).pos, 'forge')).toBe(true);
  });

  it('a forge recipe crafts at the home forge exactly as at the town forge', () => {
    const { sim, pid } = ownerAtHomeForge();
    const recipe = readyForgeRecipe(sim, pid);
    sim.craftItem(recipe.id, false, pid, 1);
    for (let i = 0; i < 20 * 8; i++) sim.tick();
    // the axe may auto-equip on a warrior, so the result record is the proof
    expect(metaOf(sim, pid).lastCraftResult).toMatchObject({ ok: true, recipeId: recipe.id });
  });

  it('the same recipe is refused with station_required away from any station', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    metaOf(sim, pid).house = { lot: LOT.id, boughtDay: '', furniture: {}, storage: [] };
    const recipe = readyForgeRecipe(sim, pid);
    // inside the house with NO station placed: still refused
    place(sim, pid, LOT.doorPos.x, LOT.doorPos.z);
    sim.tick();
    expect(sim.player.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    sim.craftItem(recipe.id, false, pid, 1);
    for (let i = 0; i < 20 * 8; i++) sim.tick();
    expect(metaOf(sim, pid).lastCraftResult).toMatchObject({
      ok: false,
      reason: 'station_required',
    });
  });

  it('a home station of one type never serves another type', () => {
    const { sim, pid } = ownerAtHomeForge();
    const loomRecipe = ALL_RECIPES.find(
      (r) => r.stationType === 'loom' && r.skillReq === 0 && !r.comboRequirement,
    )!;
    const meta = metaOf(sim, pid);
    meta.knownRecipes.add(loomRecipe.id);
    for (const reagent of loomRecipe.reagents) sim.addItem(reagent.itemId, reagent.count * 2, pid);
    meta.copper = 100_00;
    sim.craftItem(loomRecipe.id, false, pid, 1);
    for (let i = 0; i < 20 * 8; i++) sim.tick();
    expect(sim.countItem(loomRecipe.resultItemId, pid)).toBe(0);
    expect(meta.lastCraftResult?.reason).toBe('station_required');
    expect(STATION_TYPE_BY_CRAFT.tailoring).toBe('loom');
  });
});
