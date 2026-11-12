import { describe, expect, it } from 'vitest';
import { isBlocked, lineOfSightClear } from '../src/sim/colliders';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import { CAMPS, GROUND_OBJECTS, NPCS, PLAYER_START, QUESTS, ZONES, zoneAt } from '../src/sim/data';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import { ebv2Point } from '../src/sim/eastbrook_v2';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { Sim } from '../src/sim/sim';
import { DT, xpForLevel } from '../src/sim/types';
import { groundHeight, isInWaterBody, WATER_LEVEL, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED as S } from '../src/sim/world_seed';
import { EBV2_INN, ebv2InnDoorstepCandidates } from './helpers/ebv2_inn';

// Eastbrook Vale v2 town services, the gameplay guarantees the old-town layout
// contracts used to carry (the civic-square giver spread, the Grand Armoury and
// polish-capture reachability pins, the starter-giver visibility suite): on the
// v2 design, from the approved start (-16, -158), every Eastbrook quest giver
// and town service can be walked to, nothing stands in water or inside a solid,
// a body rests at the v2 inn, the Eastbrook quests' givers, turn-ins, camps and
// objects can all be reached, and no two givers are stacked on one spot.

const vale = ZONES.find((z) => z.id === 'eastbrook_vale');
if (!vale?.hub) throw new Error('missing the Eastbrook Vale zone hub');
const PLAZA = vale.hub;
const inVale = (x: number, z: number) => zoneAt(x, z)?.id === 'eastbrook_vale';

/** Every placed (non-dynamic) NPC in the vale. */
const VALE_NPCS = Object.values(NPCS).filter(
  (n) => !n.dynamic && (n.pos.x || n.pos.z) && inVale(n.pos.x, n.pos.z),
);
/** The vale NPCs who give or take quests. */
const VALE_GIVERS = VALE_NPCS.filter((n) => (n.questIds?.length ?? 0) > 0);
/** The quests an Eastbrook Vale NPC hands out. */
const VALE_QUESTS = Object.values(QUESTS).filter((q) => {
  const giver = NPCS[q.giverNpcId];
  return giver !== undefined && inVale(giver.pos.x, giver.pos.z);
});

function dry(x: number, z: number): boolean {
  const h = groundHeight(x, z, S);
  const w = waterLevelAt(x, z, S);
  return !isInWaterBody(x, z) && h >= WATER_LEVEL + 0.4 && (w === -Infinity || h >= w + 0.4);
}

// The walkable vale as seen on foot from the start: a 2 yd grid flood fill over
// open, dry-or-wadeable cells whose rise stays inside the climb slope (the same
// walker tests/eastbrook_v2_world.test.ts sends to every quest object).
const CELL = 2;
const key = (cx: number, cz: number) => `${cx},${cz}`;
const ride = (x: number, z: number) => Math.max(groundHeight(x, z, S), waterLevelAt(x, z, S));
const open = (x: number, z: number) => {
  for (const dx of [0, -0.8, 0.8])
    for (const dz of [0, -0.8, 0.8])
      if (!isBlocked(S, x + dx, z + dz, PLAYER_BODY_RADIUS)) return true;
  return false;
};
const REACHED = (() => {
  const start = { x: Math.round(PLAYER_START.x / CELL), z: Math.round(PLAYER_START.z / CELL) };
  const reached = new Set([key(start.x, start.z)]);
  const queue = [start];
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = c.x + dx;
        const nz = c.z + dz;
        // the vale's slot: x -270..180, z -180..180 (less a 2 yd margin)
        const outside = nx * CELL < -268 || nx * CELL > 178 || Math.abs(nz * CELL) > 178;
        if (outside || reached.has(key(nx, nz))) continue;
        if (!open(nx * CELL, nz * CELL)) continue;
        const rise = ride(nx * CELL, nz * CELL) - ride(c.x * CELL, c.z * CELL);
        if (rise / (CELL * Math.hypot(dx, dz)) > PLAYER_MAX_CLIMB_SLOPE) continue;
        reached.add(key(nx, nz));
        queue.push({ x: nx, z: nz });
      }
    }
  }
  return reached;
})();

/** A walker from the start gets within a cell or so of (x, z). */
function reachable(x: number, z: number): boolean {
  const cx = Math.round(x / CELL);
  const cz = Math.round(z / CELL);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) if (REACHED.has(key(cx + dx, cz + dz))) return true;
  return false;
}

describe('eastbrook v2: every giver and service is reachable on foot from the start', () => {
  it('starts at the approved v2 spawn', () => {
    expect(PLAYER_START).toEqual({ x: -16, z: -158 });
    expect(REACHED.size).toBeGreaterThan(1000);
  });

  it('reaches every placed vale NPC', () => {
    expect(VALE_GIVERS.length).toBeGreaterThan(15);
    const cut = VALE_NPCS.filter((n) => !reachable(n.pos.x, n.pos.z)).map(
      (n) => `${n.id} (${n.pos.x},${n.pos.z})`,
    );
    expect(cut).toEqual([]);
  });

  it('reaches every town service: stations, mailbox, noticeboard, inn, bank and house doors', () => {
    const services: { what: string; x: number; z: number }[] = [];
    for (const st of EASTBROOK_LAYOUT.services.stations)
      services.push({ what: `station ${st.id}`, ...st.position });
    services.push({
      what: 'mailbox',
      ...EASTBROOK_LAYOUT.services.mailbox.frontStandingPoint,
    });
    services.push({
      what: 'noticeboard',
      ...EASTBROOK_LAYOUT.services.noticeboard.frontStandingPoint,
    });
    for (const id of ['svc_bank', 'svc_vendors', 'svc_stables', 'svc_guardpost', 'svc_chapel'])
      services.push({ what: id, x: ebv2Point(id).x, z: ebv2Point(id).z });
    for (const lot of HOUSE_LOTS.filter((l) => l.zoneId === 'eastbrook_vale'))
      services.push({
        what: `house door ${lot.id}`,
        x: lot.doorPos.x + lot.leaveOffset.x,
        z: lot.doorPos.z + lot.leaveOffset.z,
      });
    const cut = services
      .filter((s) => !reachable(s.x, s.z))
      .map((s) => `${s.what} (${s.x.toFixed(1)},${s.z.toFixed(1)})`);
    expect(cut).toEqual([]);
    expect(ebv2InnDoorstepCandidates().some((p) => reachable(p.x, p.z))).toBe(true);
  });
});

describe('eastbrook v2: nothing in water or buried', () => {
  it('stands every vale NPC on dry, open ground', () => {
    const bad = VALE_NPCS.filter(
      (n) => !dry(n.pos.x, n.pos.z) || isBlocked(S, n.pos.x, n.pos.z, 0.5),
    ).map((n) => `${n.id} (${n.pos.x},${n.pos.z})`);
    expect(bad).toEqual([]);
  });

  it('stands every service standing point on dry, open ground', () => {
    const points = [
      ...EASTBROOK_LAYOUT.services.stations.map((st) => ({ what: st.id, ...st.position })),
      { what: 'mailbox', ...EASTBROOK_LAYOUT.services.mailbox.frontStandingPoint },
      { what: 'noticeboard', ...EASTBROOK_LAYOUT.services.noticeboard.frontStandingPoint },
    ];
    const bad = points
      .filter((p) => !dry(p.x, p.z) || isBlocked(S, p.x, p.z, 0.45))
      .map((p) => `${p.what} (${p.x.toFixed(1)},${p.z.toFixed(1)})`);
    expect(bad).toEqual([]);
  });
});

describe('eastbrook v2: rest works at the inn', () => {
  it('accrues rested XP for a body standing on an open, reachable spot at the v2 inn', () => {
    const spot = ebv2InnDoorstepCandidates().find(
      (p) => !isBlocked(S, p.x, p.z, 0.5) && reachable(p.x, p.z),
    );
    if (!spot) throw new Error('no open, reachable doorstep round the v2 inn');
    expect(Math.hypot(spot.x - EBV2_INN.x, spot.z - EBV2_INN.z)).toBeLessThan(20);
    const sim = new Sim({ seed: S, playerClass: 'warrior', autoEquip: true });
    const p = sim.player;
    p.pos = { x: spot.x, y: groundHeight(spot.x, spot.z, S), z: spot.z };
    p.prevPos = { ...p.pos };
    expect(sim.restedXp).toBe(0);
    for (let i = 0; i < 100; i++) sim.tick();
    // 5% of the level's XP per 8 in-game hours (8 * 60 sim seconds), as
    // tests/rested_xp.test.ts pins for every inn.
    const perSecond = (0.05 * xpForLevel(p.level)) / (8 * 60);
    expect(sim.restedXp).toBeCloseTo(perSecond * DT * 100, 4);
  });
});

describe('eastbrook v2: the Eastbrook quests can be finished', () => {
  it('hands out a real quest list', () => {
    expect(VALE_QUESTS.length).toBeGreaterThan(40);
  });

  it('reaches every vale giver and turn-in of an Eastbrook quest', () => {
    const cut: string[] = [];
    for (const q of VALE_QUESTS) {
      for (const id of [q.giverNpcId, q.turnInNpcId]) {
        const npc = NPCS[id];
        if (!npc) {
          cut.push(`${q.id}: missing NPC ${id}`);
          continue;
        }
        if (npc.dynamic || !inVale(npc.pos.x, npc.pos.z)) continue;
        if (!reachable(npc.pos.x, npc.pos.z)) cut.push(`${q.id}: ${id}`);
      }
    }
    expect(cut).toEqual([]);
  });

  it('reaches a vale camp for every kill target and every vale object an objective needs', () => {
    const cut: string[] = [];
    for (const q of VALE_QUESTS) {
      for (const o of q.objectives) {
        if (o.type === 'kill') {
          const camps = CAMPS.filter((c) => c.mobId === o.targetMobId);
          const valeCamps = camps.filter((c) => inVale(c.center.x, c.center.z));
          // A target that lives outside the vale, or that its own quest spawns,
          // is not the town's to place.
          if (valeCamps.length === 0) continue;
          if (!valeCamps.some((c) => reachable(c.center.x, c.center.z)))
            cut.push(`${q.id}: no reachable ${o.targetMobId} camp`);
        }
        const itemId =
          o.type === 'interact' ? o.targetObjectItemId : o.type === 'collect' ? o.itemId : null;
        if (!itemId) continue;
        const spots = GROUND_OBJECTS.filter((g) => g.itemId === itemId)
          .flatMap((g) => g.positions)
          .filter((p) => inVale(p.x, p.z));
        if (spots.length === 0) continue;
        const need = o.type === 'interact' && !o.station ? o.count : 1;
        const ok = spots.filter((p) => reachable(p.x, p.z)).length;
        if (ok < Math.min(need, spots.length))
          cut.push(`${q.id}: ${ok}/${need} reachable ${itemId}`);
      }
    }
    expect(cut).toEqual([]);
  });
});

describe('eastbrook v2: givers keep their own ground', () => {
  it('stacks no two vale quest givers within 2 yd (a body width of room between them)', () => {
    const stacked: string[] = [];
    for (let i = 0; i < VALE_GIVERS.length; i++) {
      for (let j = i + 1; j < VALE_GIVERS.length; j++) {
        const a = VALE_GIVERS[i];
        const b = VALE_GIVERS[j];
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
        if (d < 2) stacked.push(`${a.id} / ${b.id} ${d.toFixed(2)}`);
      }
    }
    expect(stacked).toEqual([]);
  });

  it('gathers the town givers round the v2 main plaza, each reachable and on open ground', () => {
    // The v2 equivalent of the old civic-square spread: the zone hub is the
    // plaza (the market stalls, mailbox and notice board), and the town's
    // givers stand round it rather than piled at its middle.
    const plaza = VALE_GIVERS.filter(
      (n) => Math.hypot(n.pos.x - PLAZA.x, n.pos.z - PLAZA.z) <= PLAZA.radius,
    );
    expect(plaza.length).toBeGreaterThanOrEqual(6);
    for (const id of ['marshal_redbrook', 'trader_wilkes'])
      expect(
        plaza.map((n) => n.id),
        id,
      ).toContain(id);
    for (const n of plaza) {
      expect(isBlocked(S, n.pos.x, n.pos.z, 0.5), n.id).toBe(false);
      expect(reachable(n.pos.x, n.pos.z), n.id).toBe(true);
      // round the plaza, not on its centre point
      expect(Math.hypot(n.pos.x - PLAZA.x, n.pos.z - PLAZA.z), n.id).toBeGreaterThan(3);
    }
  });
});

describe('eastbrook v2: the first sixty seconds', () => {
  it('walks out from the start to the nearest wolf and boar camps and sights a ranged pull at each', () => {
    // The level-1 quest targets: the first camps a fresh character is sent at.
    const starterMobs = new Set(['wild_boar', 'forest_wolf']);
    const nearest = [...CAMPS]
      .filter((camp) => starterMobs.has(camp.mobId))
      .map((camp) => ({
        camp,
        d: Math.hypot(camp.center.x - PLAYER_START.x, camp.center.z - PLAYER_START.z),
      }))
      .sort((a, b) => a.d - b.d);
    for (const mobId of starterMobs) {
      const hit = nearest.find(({ camp }) => camp.mobId === mobId);
      if (!hit) throw new Error(`no ${mobId} camp`);
      const { camp } = hit;
      // A pull spot a walker from the start reaches: open, within 25 yd of the
      // camp's heart, with a clear sight lane to it.
      let pull: { x: number; z: number } | null = null;
      for (const k of REACHED) {
        const [cx, cz] = k.split(',').map(Number);
        const x = cx * CELL;
        const z = cz * CELL;
        if (Math.hypot(x - camp.center.x, z - camp.center.z) > 25) continue;
        if (isBlocked(S, x, z, 0.5) || !lineOfSightClear(S, { x, z }, camp.center)) continue;
        pull = { x, z };
        break;
      }
      expect(pull, `${mobId} at ${camp.center.x},${camp.center.z}`).not.toBeNull();
    }
  });
});
