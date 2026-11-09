// The expansion frontier's ground (src/sim/frontier/): it stays out of the core
// world, reaches every hub on dry land, joins the old coasts with walkable
// causeways, and never reshapes the instance bands.
import { describe, expect, it } from 'vitest';
import { ROADS, ZONES, zoneContaining } from '../src/sim/data';
import { FRONTIER_ANCHORS, FRONTIER_TIE_INS } from '../src/sim/frontier/layout';
import { spreadPoint } from '../src/sim/frontier/spread';
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
// samples this close to the core edge belong to the shipped ground
const FRONTIER_SEAM_BAND_LIMIT = 4;
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

/** walkable over a path written in the AUTHORED frame (layout anchors and
 *  literals): each point is put through the frontier spread first. */
function walkableAuthored(points: readonly { x: number; z: number }[]) {
  return walkable(points.map((p) => spreadPoint(p.x, p.z)));
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
      { x: 378, z: -180 },
      { x: 257, z: -190 },
      { x: 378, z: -196 },
      A.causewayFoot,
      A.wardenPost,
      { x: 352, z: -292 },
      A.pressford,
    ];
    const walk = walkableAuthored(path);
    expect(walk.dry).toBe(true);
    expect(walk.maxSlope).toBeLessThan(1.1);
  });

  it('joins the Southern Reaches by land: Pressford to Ferncross to Coinwell', () => {
    const A = FRONTIER_ANCHORS;
    const walk = walkableAuthored([
      A.pressford,
      { x: 262, z: -340 },
      { x: 214, z: -368 },
      A.heathWay,
      { x: 120, z: -350 },
      A.ferncross,
    ]);
    expect(walk.dry).toBe(true);
    const west = walkableAuthored([
      A.ferncross,
      { x: -40, z: -322 },
      { x: -140, z: -372 },
      A.westHeath,
      { x: -240, z: -380 },
      A.coinwell,
    ]);
    expect(west.dry).toBe(true);
  });

  it('walks every frontier road dry and climbable, end to end', () => {
    const frontier = new Set(FRONTIER_ZONES.map((z) => z.id));
    const roads = ROADS.filter((r) =>
      r.some((p) => frontier.has(zoneContaining(p.x, p.z)?.id ?? '')),
    );
    // the Southern Reaches' dozen, the Low Reaches, the West March, the Southway
    expect(roads.length).toBeGreaterThanOrEqual(40);
    for (const road of roads) {
      const walk = walkable(road);
      const tag = `${road[0].x},${road[0].z}`;
      expect(walk.dry, tag).toBe(true);
      expect(walk.maxSlope, tag).toBeLessThan(1.1);
    }
  });

  it('joins the Kindlemoor to Eastbrook by the Southway, dry all the way', () => {
    const A = FRONTIER_ANCHORS;
    const walk = walkableAuthored([
      A.southwayLanding,
      { x: 72, z: -190 },
      A.southwayFoot,
      A.ferncross,
    ]);
    expect(walk.dry).toBe(true);
    expect(walk.maxSlope).toBeLessThan(1.1);
  });

  it('walks the second road from the Applewold to the Wardmere by land', () => {
    const A = FRONTIER_ANCHORS;
    const chain = [
      A.pressford,
      A.saltmeadsGate,
      A.panwick,
      A.saltWay,
      A.elmhallow,
      A.tinnersFord,
      A.whealPatience,
      A.rookFord,
      A.kestrelPoint,
      A.sedgeNeck,
      A.withyholt,
      A.fellNeck,
      A.fellgate,
      A.wardNeck,
      A.lanternfold,
    ];
    // anchor to anchor along the authored roads (each leg is a road in data)
    for (const a of chain) {
      const p = spreadPoint(a.x, a.z);
      expect(terrainHeight(p.x, p.z, seed), `${p.x},${p.z}`).toBeGreaterThan(WATER_LEVEL);
    }
  });

  it('keeps the West March clear of the Willowfen ferry lane', () => {
    // the lane runs north along x ~ -546..-552 from z 165; the March's coast
    // keeps 80yd of open water to it
    for (let z = 170; z <= 540; z += 10) {
      for (let x = -632; x <= -560; x += 8) {
        if (x >= CORE_WORLD.minX - FRONTIER_SEAM_BAND_LIMIT) continue;
        expect(terrainHeight(x, z, seed), `${x},${z}`).toBeLessThan(WATER_LEVEL);
      }
    }
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
