import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { campSpawnOffset } from '../src/sim/camp_scatter';
import { colliderInternalsForTest, isBlocked } from '../src/sim/colliders';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import { LAKE } from '../src/sim/content/zone1';
import {
  CAMPS,
  GATHER_NODES,
  GROUND_OBJECTS,
  NPCS,
  PLAYER_START,
  ZONES,
  zoneAt,
} from '../src/sim/data';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import {
  ebv2AnchorOf,
  ebv2FieldHeight,
  ebv2OwnsAnchor,
  ebv2Point,
  ebv2RoadClearance,
  ebv2StandingColliderIndexes,
  ebv2UnanchoredTreeIndexes,
  ebv2Weight,
  inEbv2Field,
} from '../src/sim/eastbrook_v2';
import { EBV2_COLLIDERS, EBV2_POINTS, EBV2_TREES } from '../src/sim/eastbrook_v2/layout.generated';
import { EBV2_SITES } from '../src/sim/eastbrook_v2/sites.generated';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import {
  generateDecorationsInBounds,
  groundHeight,
  terrainHeight,
  terrainSteepnessAt,
  WATER_LEVEL,
  waterLevelAt,
} from '../src/sim/world';
import { WORLD_SEED as S } from '../src/sim/world_seed';

// Eastbrook Vale v2 laid into the built-in world: the design's ground, solids and
// trees stand where the Unreal client draws them, and every piece of the vale's
// content stands somewhere a player can reach. The golden counts below are the
// current design export (data/eastbrook_v2/manifest.json): a re-import that moves
// them re-pins them in the same change, after scripts/eastbrook_v2/resite.

const ROOT = join(__dirname, '..');
const sitesConfig = JSON.parse(
  readFileSync(join(ROOT, 'data/eastbrook_v2/sites_config.json'), 'utf8'),
);
const inVale = (x: number, z: number) => zoneAt(x, z)?.id === 'eastbrook_vale';
const hub = ZONES.find((z) => z.id === 'eastbrook_vale')!.hub;

function dry(x: number, z: number): boolean {
  const h = groundHeight(x, z, S);
  const w = waterLevelAt(x, z, S);
  return h >= WATER_LEVEL + 0.4 && (w === -Infinity || h >= w + 0.4);
}

describe('eastbrook v2: the import is the whole of the vale', () => {
  it('pins the golden counts of the current design export', () => {
    expect(EBV2_COLLIDERS.length).toBe(970);
    expect(EBV2_POINTS.length).toBe(44);
    expect(EBV2_TREES.length).toBe(223);
    expect(Object.keys(EBV2_SITES).length).toBe(109);
  });

  it('resolves every design point the content is tied to', () => {
    const ids = [
      ...Object.values(sitesConfig.anchors),
      ...Object.values(sitesConfig.lots),
    ] as string[];
    for (const id of ids) expect(() => ebv2Point(id), id).not.toThrow();
    for (const id of ['player_spawn', 'svc_inn', 'svc_bank', 'svc_mailbox', 'svc_noticeboard']) {
      expect(() => ebv2Point(id)).not.toThrow();
    }
  });

  it('stands the ground on the design inside the field and eases out at its edge', () => {
    for (const [x, z] of [
      [-18, -101],
      [0, 0],
      [100, 100],
      [-120, -10],
    ]) {
      expect(ebv2Weight(x, z)).toBe(1);
      expect(terrainHeight(x, z, S)).toBeCloseTo(ebv2FieldHeight(x, z), 9);
    }
    expect(inEbv2Field(181, 0)).toBe(false);
    expect(ebv2Weight(180, 0)).toBe(0);
    expect(ebv2Weight(-180, 50)).toBe(0);
    // the town terrace: design 9.8 m less the 8.3 m sea offset
    expect(terrainHeight(-22, -96, S)).toBeCloseTo(1.5, 1);
  });

  it('keeps the four server connectors, Mirror Lake and the Copper Dig on shipped ground', () => {
    for (const [x, z] of [
      [-28, 150],
      [-34, 142],
      [3, 170],
      [160, -36],
      [72, -175],
      [-140, -54],
      [LAKE.x, LAKE.z],
      [LAKE.x + LAKE.radius, LAKE.z],
    ]) {
      expect(ebv2Weight(x, z), `${x},${z}`).toBe(0);
    }
    // the lake basin is the shipped one: open water at its centre
    expect(groundHeight(LAKE.x, LAKE.z, S)).toBeLessThan(waterLevelAt(LAKE.x, LAKE.z, S) - 1);
  });
});

describe('eastbrook v2: solids and trees', () => {
  it('retires every shipped prop collider standing on design ground, keeping the vein bodies', () => {
    const nodeSpots = new Set(GATHER_NODES.map((n) => `${n.pos.x},${n.pos.z}`));
    const onDesign = colliderInternalsForTest
      .staticWorldColliders(S)
      .filter((c) => !c.src?.startsWith('ebv2:') && ebv2Weight(c.x, c.z) >= 0.5);
    // only the gather nodes' own bodies stand there (content, not shipped props)
    expect(onDesign.filter((c) => !nodeSpots.has(`${c.x},${c.z}`))).toEqual([]);
    // every vale vein keeps its solid body (the stand-down never takes one)
    const veins = GATHER_NODES.filter((n) => n.zoneId === 'eastbrook_vale' && n.type === 'ore');
    expect(veins.length).toBe(6);
    for (const v of veins)
      expect(isBlocked(S, v.pos.x, v.pos.z, PLAYER_BODY_RADIUS), v.id).toBe(true);
  });

  it('builds every design box on owned ground and a trunk for each tree no anchor owns', () => {
    const all = colliderInternalsForTest.staticWorldColliders(S);
    const ours = all.filter((c) => c.src?.startsWith('ebv2:'));
    const standing = ebv2StandingColliderIndexes();
    expect(ours.length).toBe(standing.length + ebv2UnanchoredTreeIndexes().length);
    // most of the design stands; the rest sits in the edge band or a corridor
    expect(standing.length).toBeGreaterThan(EBV2_COLLIDERS.length * 0.8);
    for (const c of ours) expect(ebv2Weight(c.x, c.z), c.src).toBeGreaterThanOrEqual(0.5);
  });

  it('grows only design trees on the anchors the design owns, no procedural scatter', () => {
    const designed = new Set(EBV2_TREES.map(([x, z]) => `${x},${z}`));
    const field = generateDecorationsInBounds(S, { minX: -170, maxX: 170, minZ: -170, maxZ: 170 });
    const inside = field.filter((d) => {
      const { gx, gz } = ebv2AnchorOf(d.x, d.z);
      return ebv2OwnsAnchor(gx, gz);
    });
    expect(inside.length).toBeGreaterThan(80);
    for (const d of inside)
      expect(designed.has(`${d.x},${d.z}`), `${d.kind} at ${d.x},${d.z}`).toBe(true);
  });
});

describe('eastbrook v2: content stands where a player can use it', () => {
  it('starts a new character on dry, open, walkable design ground', () => {
    const start = ebv2Point('player_spawn');
    expect(PLAYER_START).toEqual({ x: start.x, z: start.z });
    expect(dry(start.x, start.z)).toBe(true);
    expect(isBlocked(S, start.x, start.z, 0.5)).toBe(false);
    expect(terrainSteepnessAt(start.x, start.z, S)).toBeLessThanOrEqual(PLAYER_MAX_CLIMB_SLOPE);
  });

  it('spawns nothing inside a collider or under water', () => {
    const spots: { what: string; x: number; z: number; r: number }[] = [];
    for (const n of Object.values(NPCS)) {
      if (!n.dynamic && (n.pos.x || n.pos.z) && inVale(n.pos.x, n.pos.z))
        spots.push({ what: `npc ${n.id}`, ...n.pos, r: 0.5 });
    }
    for (const o of GROUND_OBJECTS) {
      for (const p of o.positions)
        if (inVale(p.x, p.z)) spots.push({ what: `object ${o.itemId}`, x: p.x, z: p.z, r: 0.35 });
    }
    for (const l of HOUSE_LOTS.filter((lot) => lot.zoneId === 'eastbrook_vale')) {
      spots.push({ what: `lot door ${l.id}`, ...l.doorPos, r: 0.35 });
      spots.push({
        what: `lot step ${l.id}`,
        x: l.doorPos.x + l.leaveOffset.x,
        z: l.doorPos.z + l.leaveOffset.z,
        r: 0.45,
      });
    }
    for (const st of EASTBROOK_LAYOUT.services.stations)
      spots.push({ what: `station ${st.id}`, ...st.position, r: 0.45 });
    spots.push({
      what: 'mailbox front',
      ...EASTBROOK_LAYOUT.services.mailbox.frontStandingPoint,
      r: 0.45,
    });
    spots.push({
      what: 'noticeboard front',
      ...EASTBROOK_LAYOUT.services.noticeboard.frontStandingPoint,
      r: 0.45,
    });
    for (const c of CAMPS) {
      if (
        !inVale(c.center.x, c.center.z) ||
        c.mobId.startsWith('training_') ||
        c.mobId.includes('dummy')
      )
        continue;
      for (let i = 0; i < c.count; i++) {
        const o = campSpawnOffset(i, c.count, c.radius, 0, 0);
        spots.push({
          what: `camp ${c.mobId} slot ${i}`,
          x: c.center.x + o.x,
          z: c.center.z + o.z,
          r: 0.45,
        });
      }
    }
    // the design's ground only: content in the edge band and the corridors stands on
    // shipped ground as authored (the harbor cove keeps its ferry bell on its pier)
    const bad = spots
      .filter((s) => ebv2Weight(s.x, s.z) >= 0.5)
      .filter((s) => !dry(s.x, s.z) || isBlocked(S, s.x, s.z, s.r))
      .map((s) => `${s.what} (${s.x.toFixed(1)},${s.z.toFixed(1)})`);
    expect(bad).toEqual([]);
  });

  it('keeps every NPC the resite placed out of the design road lanes', () => {
    const sited = Object.keys(EBV2_SITES).filter((k) => k.startsWith('npc:'));
    expect(sited.length).toBeGreaterThan(20);
    for (const key of sited) {
      const npc = NPCS[key.slice(4)];
      expect(npc, key).toBeDefined();
      expect(ebv2RoadClearance(npc.pos.x, npc.pos.z), key).toBeGreaterThanOrEqual(0.6 - 1e-9);
    }
  });

  it('keeps every vale camp disc 60 yd beyond the town edge', () => {
    for (const c of CAMPS) {
      if (
        !inVale(c.center.x, c.center.z) ||
        c.mobId.startsWith('training_') ||
        c.mobId.includes('dummy')
      )
        continue;
      const gap = Math.hypot(c.center.x - hub.x, c.center.z - hub.z) - c.radius - hub.radius;
      expect(gap, `${c.mobId}@${c.center.x},${c.center.z}`).toBeGreaterThanOrEqual(60);
    }
  });

  it('stands every vale gather node on dry design ground clear of the design solids', () => {
    for (const n of GATHER_NODES.filter((g) => g.zoneId === 'eastbrook_vale')) {
      expect(dry(n.pos.x, n.pos.z), n.id).toBe(true);
      for (const [x, z, hw, hd] of EBV2_COLLIDERS) {
        const reach = Math.hypot(hw, hd);
        if (Math.hypot(n.pos.x - x, n.pos.z - z) > reach + 1) continue;
        expect(
          isBlocked(S, n.pos.x + 1.2, n.pos.z, PLAYER_BODY_RADIUS) &&
            isBlocked(S, n.pos.x - 1.2, n.pos.z, PLAYER_BODY_RADIUS) &&
            isBlocked(S, n.pos.x, n.pos.z + 1.2, PLAYER_BODY_RADIUS) &&
            isBlocked(S, n.pos.x, n.pos.z - 1.2, PLAYER_BODY_RADIUS),
          `${n.id} walled in`,
        ).toBe(false);
      }
    }
  });

  it('can walk from the town to every quest object in the vale', () => {
    const CELL = 2;
    const key = (cx: number, cz: number) => `${cx},${cz}`;
    const ride = (x: number, z: number) => Math.max(groundHeight(x, z, S), waterLevelAt(x, z, S));
    const open = (x: number, z: number) => {
      for (const dx of [0, -0.8, 0.8])
        for (const dz of [0, -0.8, 0.8])
          if (!isBlocked(S, x + dx, z + dz, PLAYER_BODY_RADIUS)) return true;
      return false;
    };
    let start = { x: Math.round(hub.x / CELL), z: Math.round(hub.z / CELL) };
    for (let r = 0; r < 12 && !open(start.x * CELL, start.z * CELL); r++)
      start = { x: start.x + 1, z: start.z };
    const reached = new Set([key(start.x, start.z)]);
    const queue = [start];
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = c.x + dx;
          const nz = c.z + dz;
          if (Math.abs(nx * CELL) > 178 || Math.abs(nz * CELL) > 178 || reached.has(key(nx, nz)))
            continue;
          if (!open(nx * CELL, nz * CELL)) continue;
          const rise = ride(nx * CELL, nz * CELL) - ride(c.x * CELL, c.z * CELL);
          if (rise / (CELL * Math.hypot(dx, dz)) > PLAYER_MAX_CLIMB_SLOPE) continue;
          reached.add(key(nx, nz));
          queue.push({ x: nx, z: nz });
        }
      }
    }
    const near = (x: number, z: number) => {
      const cx = Math.round(x / CELL);
      const cz = Math.round(z / CELL);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) if (reached.has(key(cx + dx, cz + dz))) return true;
      return false;
    };
    const cut: string[] = [];
    for (const o of GROUND_OBJECTS) {
      for (const p of o.positions)
        if (inVale(p.x, p.z) && !near(p.x, p.z)) cut.push(`${o.itemId} (${p.x},${p.z})`);
    }
    expect(cut).toEqual([]);
  });
});
