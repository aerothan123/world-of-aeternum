// The expansion frontier's ground (src/sim/frontier/): it stays out of the core
// world, reaches every hub on dry land, joins the old coasts with walkable
// causeways, and never reshapes the instance bands.
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/sim/data';
import { FRONTIER_ANCHORS, FRONTIER_TIE_INS } from '../src/sim/frontier/layout';
import {
  applyFrontierTerrain,
  FRONTIER_EXTENT,
  FRONTIER_WATER_LEVEL,
  outsideCoreDistance,
} from '../src/sim/frontier/terrain';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { CORE_WORLD } from '../src/sim/world_core_bounds';
import { WORLD_SEED } from '../src/sim/world_seed';

const seed = WORLD_SEED;
const FRONTIER_ZONES = ZONES.filter((z) => {
  const x0 = z.xMin ?? -180;
  const x1 = z.xMax ?? 180;
  return (
    x0 < CORE_WORLD.minX ||
    x1 > CORE_WORLD.maxX ||
    z.zMin < CORE_WORLD.minZ ||
    z.zMax > CORE_WORLD.maxZ
  );
});

/** Walk a polyline in 1yd steps: every step dry and no step steeper than 1.1. */
function walkable(points: readonly { x: number; z: number }[]): { dry: boolean; maxSlope: number } {
  let dry = true;
  let maxSlope = 0;
  let prev: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len));
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const z = a.z + ((b.z - a.z) * s) / steps;
      const h = terrainHeight(x, z, seed);
      if (h < WATER_LEVEL + 0.2) dry = false;
      if (prev !== null) maxSlope = Math.max(maxSlope, Math.abs(h - prev) / (len / steps));
      prev = h;
    }
  }
  return { dry, maxSlope };
}

describe('frontier terrain', () => {
  it('mirrors the sim water level', () => {
    expect(FRONTIER_WATER_LEVEL).toBe(WATER_LEVEL);
  });

  it('is the identity inside the core rect away from the tie-ins', () => {
    for (let i = 0; i < 400; i++) {
      const x = CORE_WORLD.minX + ((i * 37) % 1080);
      const z = CORE_WORLD.minZ + ((i * 113) % 2600);
      const onTie = FRONTIER_TIE_INS.some(
        (n) => Math.hypot(x - (n.ax + n.bx) / 2, z - (n.az + n.bz) / 2) < 120,
      );
      if (onTie) continue;
      expect(applyFrontierTerrain(x, z, seed, 3.25)).toBe(3.25);
    }
  });

  it('never reaches the instance bands far east', () => {
    expect(FRONTIER_EXTENT.maxX).toBeLessThan(2000);
    for (const [x, z] of [
      [100_300, -1250],
      [103_600, -1000],
      [129_800, -1500],
    ]) {
      expect(applyFrontierTerrain(x, z, seed, 1.5)).toBe(1.5);
    }
  });

  it('declares every frontier zone outside the core rect', () => {
    expect(FRONTIER_ZONES.length).toBeGreaterThanOrEqual(3);
    for (const zone of FRONTIER_ZONES) {
      const x0 = zone.xMin ?? -180;
      const x1 = zone.xMax ?? 180;
      const inside = x0 >= CORE_WORLD.minX && x1 <= CORE_WORLD.maxX && zone.zMin >= CORE_WORLD.minZ;
      expect(inside && zone.zMax <= CORE_WORLD.maxZ, zone.id).toBe(false);
    }
  });

  it('stands every frontier hub and graveyard on dry, level ground', () => {
    for (const zone of FRONTIER_ZONES) {
      for (const p of [zone.hub, zone.graveyard]) {
        const h = terrainHeight(p.x, p.z, seed);
        expect(h, `${zone.id} ${p.x},${p.z}`).toBeGreaterThan(WATER_LEVEL + 1);
        const dh = Math.abs(terrainHeight(p.x + 4, p.z, seed) - h);
        expect(dh, `${zone.id} pad slope`).toBeLessThan(0.6);
        expect(outsideCoreDistance(p.x, p.z), zone.id).toBeGreaterThan(0);
      }
    }
  });

  it('crosses the Applewold causeway dry and walkable from the Farshore', () => {
    const A = FRONTIER_ANCHORS;
    const path = [
      { x: 382, z: -118 },
      { x: 380, z: -160 },
      { x: 378, z: -200 },
      A.causewayFoot,
      A.wardenPost,
      { x: 352, z: -292 },
      A.pressford,
    ];
    const walk = walkable(path);
    expect(walk.dry).toBe(true);
    expect(walk.maxSlope).toBeLessThan(1.1);
  });

  it('joins the Southern Reaches by land: Pressford to Ferncross to Coinwell', () => {
    const A = FRONTIER_ANCHORS;
    const walk = walkable([
      A.pressford,
      { x: 262, z: -340 },
      { x: 214, z: -368 },
      A.heathWay,
      { x: 120, z: -350 },
      A.ferncross,
    ]);
    expect(walk.dry).toBe(true);
    const west = walkable([
      A.ferncross,
      { x: -40, z: -322 },
      { x: -140, z: -372 },
      A.westHeath,
      { x: -240, z: -380 },
      A.coinwell,
    ]);
    expect(west.dry).toBe(true);
  });

  it('keeps open sea between the frontier and the Proving Shore island', () => {
    // the island's south shore stands near z -60; the frontier coast may come
    // no closer than the band below it
    for (let x = -520; x <= -200; x += 8) {
      for (let z = -250; z <= -190; z += 6) {
        expect(terrainHeight(x, z, seed), `${x},${z}`).toBeLessThan(WATER_LEVEL);
      }
    }
  });
});
