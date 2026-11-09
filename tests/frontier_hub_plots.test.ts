// Every frontier settlement keeps room for a quest board and three to five
// givers (src/sim/frontier/hub_plots.ts): each spot is dry, on the hub's level
// pad, clear of every prop the content files stand there, and spaced so two
// NPCs never share a footprint.
import { describe, expect, it } from 'vitest';
import { PROPS, ZONES } from '../src/sim/data';
import { FRONTIER_HUB_PLOTS } from '../src/sim/frontier/hub_plots';
import { FRONTIER_ANCHORS } from '../src/sim/frontier/layout';
import { WORLD_SLOTS } from '../src/sim/frontier/slots';
import { spreadPoint } from '../src/sim/frontier/spread';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const H = (x: number, z: number) => terrainHeight(x, z, WORLD_SEED);

function obstacles(): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const t of PROPS.tents) out.push({ x: t.x, z: t.z, r: 4 });
  for (const c of PROPS.campfires) out.push({ x: c[0], z: c[1], r: 2.5 });
  for (const c of PROPS.crates) out.push({ x: c[0], z: c[1], r: 2 });
  for (const w of PROPS.wells) out.push({ x: w.x, z: w.z, r: 3 });
  for (const g of PROPS.graveyards) out.push({ x: g.x, z: g.z, r: 5 });
  for (const f of PROPS.fences) {
    for (let t = 0; t <= 1; t += 0.1) {
      out.push({ x: f.x1 + (f.x2 - f.x1) * t, z: f.z1 + (f.z2 - f.z1) * t, r: 2 });
    }
  }
  for (const ring of PROPS.ruinRings) {
    for (let i = 0; i < ring.columns; i++) {
      const a = (i / ring.columns) * Math.PI * 2;
      out.push({
        x: ring.x + ring.ringR * Math.cos(a),
        z: ring.z + ring.ringR * Math.sin(a),
        r: 2,
      });
    }
  }
  return out;
}

describe('frontier hub plots', () => {
  const open = new Set(WORLD_SLOTS.filter((s) => s.status === 'open').map((s) => s.zoneId));
  const obs = obstacles();

  it('gives every open frontier zone hub a board and three to five givers', () => {
    for (const zone of ZONES.filter((z) => open.has(z.id))) {
      const hubPoi = zone.pois.find((p) => p.x === zone.hub.x && p.z === zone.hub.z);
      const plots = FRONTIER_HUB_PLOTS.find((h) => h.id === hubPoi?.id);
      expect(plots, zone.id).toBeDefined();
      expect(plots?.zoneId).toBe(zone.id);
      expect(plots?.givers.length).toBeGreaterThanOrEqual(3);
      expect(plots?.givers.length).toBeLessThanOrEqual(5);
    }
  });

  it('stands every spot dry and level on its pad, clear of props and of each other', () => {
    for (const hub of FRONTIER_HUB_PLOTS) {
      const authored = FRONTIER_ANCHORS[hub.anchor as keyof typeof FRONTIER_ANCHORS];
      expect(authored, hub.id).toBeDefined();
      // plots are authored; the live hub stands where the frontier spread put it
      const anchor = spreadPoint(authored.x, authored.z);
      const h0 = H(anchor.x, anchor.z);
      const spots = [hub.board, ...hub.givers].map((p) => spreadPoint(p.x, p.z));
      spots.forEach((s, i) => {
        const tag = `${hub.id} #${i} ${s.x},${s.z}`;
        const h = H(s.x, s.z);
        expect(h, tag).toBeGreaterThan(WATER_LEVEL + 1);
        expect(Math.abs(h - h0), tag).toBeLessThan(0.6);
        expect(Math.hypot(s.x - anchor.x, s.z - anchor.z), tag).toBeLessThan(13);
        for (const o of obs) expect(Math.hypot(s.x - o.x, s.z - o.z), tag).toBeGreaterThan(o.r);
        for (let j = i + 1; j < spots.length; j++) {
          expect(Math.hypot(s.x - spots[j].x, s.z - spots[j].z), tag).toBeGreaterThan(3.5);
        }
      });
    }
  });
});
