import { describe, expect, it } from 'vitest';
import '../src/sim/data';
import { FATIGUE_WARNING, updateSwimFatigue } from '../src/sim/fatigue';
import { inOpenOcean, opensToOcean } from '../src/sim/open_ocean';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity } from '../src/sim/types';
import { inHollowOpenSea, isOpenSeaAt, waterLevel } from '../src/sim/world';

// "The open sea saps your strength" must fire only in the real open ocean. The
// band test (inHollowOpenSea) reads "far from every land lobe's shape field" and
// so also claimed enclosed water: ponds, meres and lagoons inland of the coast.
const SEED = 20061;

// Enclosed water the band test still calls open sea: land in every compass
// direction within the ocean reach.
const INLAND_WATER = [
  { x: -304, z: 1008 },
  { x: 344, z: 1776 },
  { x: 432, z: 1360 },
];
// Genuine open ocean off the starter coast and beyond. The west point sits in
// the strait off the vale's west coast: Eastbrook Vale v2 made (-200, 0) dry
// land (the design's west shore runs near x -240), so the open sea there now
// starts further out.
const OPEN_OCEAN = [
  { x: 0, z: -200 },
  { x: -255, z: -100 },
  { x: 250, z: 100 },
  { x: -300, z: -150 },
];

function swimmerAt(x: number, z: number): Entity {
  return {
    id: 1,
    kind: 'player',
    dead: false,
    pos: { x, y: waterLevel(), z },
    maxHp: 100,
    fatigueTicks: 0,
  } as unknown as Entity;
}

function fakeCtx(events: { type: string; text?: string }[]): SimContext {
  return {
    cfg: { seed: SEED },
    emit: (e: { type: string; text?: string }) => events.push(e),
    dealDamage: () => {},
  } as unknown as SimContext;
}

describe('open-sea fatigue only in the open ocean', () => {
  it('reproduces the bug: the band test claims enclosed inland water', () => {
    for (const p of INLAND_WATER) {
      expect(isOpenSeaAt(p.x, p.z, SEED), `(${p.x},${p.z}) is water`).toBe(true);
      expect(inHollowOpenSea(p.x, p.z), `(${p.x},${p.z}) band`).toBe(true);
    }
  });

  it('never treats enclosed ponds, lakes or lagoons as open ocean', () => {
    for (const p of INLAND_WATER) {
      expect(opensToOcean(p.x, p.z, SEED), `(${p.x},${p.z}) has a way out`).toBe(false);
      expect(inOpenOcean(p.x, p.z, SEED), `(${p.x},${p.z})`).toBe(false);
    }
  });

  it('keeps the open ocean as open ocean', () => {
    for (const p of OPEN_OCEAN) {
      expect(inOpenOcean(p.x, p.z, SEED), `(${p.x},${p.z})`).toBe(true);
    }
  });

  it('warns a swimmer in the open ocean and stays silent in inland water', () => {
    const atSea: { type: string; text?: string }[] = [];
    const sea = swimmerAt(OPEN_OCEAN[0].x, OPEN_OCEAN[0].z);
    updateSwimFatigue(fakeCtx(atSea), sea);
    expect(atSea.some((e) => e.text === FATIGUE_WARNING)).toBe(true);
    expect(sea.fatigueTicks).toBe(1);

    for (const p of INLAND_WATER) {
      const inland: { type: string; text?: string }[] = [];
      const swimmer = swimmerAt(p.x, p.z);
      for (let i = 0; i < 40; i++) updateSwimFatigue(fakeCtx(inland), swimmer);
      expect(inland, `no warning at (${p.x},${p.z})`).toEqual([]);
      expect(swimmer.fatigueTicks).toBe(0);
    }
  });
});
