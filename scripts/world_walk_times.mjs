#!/usr/bin/env node
// Road travel times across the overworld, from the sim's own tables: every
// road polyline becomes a graph (vertices, plus a link wherever a road end
// meets another road within SNAP yd), every zone hub snaps to its nearest road
// vertex, and Dijkstra gives the hub-to-hub road distance. Reports the
// shortest and longest hub-to-hub trips, each zone's crossing (its longest
// in-zone road trip between two road vertices inside the zone rect, and its
// rect diagonal), at RUN_SPEED and at the trained riding speeds
// (src/sim/riding_training.ts ridingMoveSpeedPct: basic +70%, advanced +110%).
//
//   node scripts/world_walk_times.mjs [out.json]
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd().replace(/\\/g, '/');
const temp = mkdtempSync(path.join(tmpdir(), 'woc-walk-'));
const entry = path.join(temp, 'entry.ts');
writeFileSync(
  entry,
  `export { ZONES, ROADS } from '${root}/src/sim/data';
export { RUN_SPEED } from '${root}/src/sim/types';
export { ridingMoveSpeedPct } from '${root}/src/sim/riding_training';
`,
);
const outfile = path.join(temp, 'walk.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'error',
  define: { 'import.meta.env': '{}' },
});
const W = await import(pathToFileURL(outfile).href);
rmSync(temp, { recursive: true, force: true });

const SNAP = 10;
const nodes = [];
const adj = [];
const addNode = (p) => {
  nodes.push(p);
  adj.push([]);
  return nodes.length - 1;
};
const link = (a, b) => {
  const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
  adj[a].push([b, d]);
  adj[b].push([a, d]);
};
const roadIds = [];
for (const road of W.ROADS) {
  const ids = road.map((p) => addNode(p));
  for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]);
  roadIds.push(ids);
}
// join every road vertex to coincident vertices (SNAP), and each road END to
// the nearest vertex of every other road within JOIN: authored road ends stop
// short of the road they meet, and a player simply walks the gap
const JOIN = Number(process.env.JOIN ?? 45);
for (let r = 0; r < roadIds.length; r++) {
  const ends = new Set([roadIds[r][0], roadIds[r][roadIds[r].length - 1]]);
  for (const a of roadIds[r]) {
    for (let s = 0; s < roadIds.length; s++) {
      if (s === r) continue;
      let best = -1;
      let bd = Infinity;
      for (const v of roadIds[s]) {
        const d = Math.hypot(nodes[a].x - nodes[v].x, nodes[a].z - nodes[v].z);
        if (d < bd) {
          bd = d;
          best = v;
        }
      }
      if (best >= 0 && (bd <= SNAP || ((ends.has(a) || process.env.LOOSE) && bd <= JOIN)))
        link(a, best);
    }
  }
}
function dijkstra(src) {
  const dist = new Float64Array(nodes.length).fill(Infinity);
  dist[src] = 0;
  const done = new Uint8Array(nodes.length);
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!done[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u < 0) break;
    done[u] = 1;
    for (const [v, d] of adj[u]) if (dist[u] + d < dist[v]) dist[v] = dist[u] + d;
  }
  return dist;
}
const nearest = (p) => {
  let best = -1;
  let bd = Infinity;
  nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return { id: best, off: bd };
};
const speeds = {
  run: W.RUN_SPEED,
  basicRiding: W.RUN_SPEED * (1 + W.ridingMoveSpeedPct(1)),
  advancedRiding: W.RUN_SPEED * (1 + W.ridingMoveSpeedPct(2)),
};
const mins = (yd) =>
  Object.fromEntries(Object.entries(speeds).map(([k, s]) => [k, +(yd / s / 60).toFixed(1)]));
const hubs = W.ZONES.map((z) => ({ zone: z.id, name: z.hub.name, ...nearest(z.hub) }));
const trips = [];
for (let i = 0; i < hubs.length; i++) {
  const dist = dijkstra(hubs[i].id);
  for (let j = i + 1; j < hubs.length; j++) {
    const d = dist[hubs[j].id];
    trips.push({
      from: hubs[i].name,
      to: hubs[j].name,
      yd: Number.isFinite(d) ? Math.round(d) : null,
    });
  }
}
const reachable = trips.filter((t) => t.yd !== null).sort((a, b) => a.yd - b.yd);
const unreachable = trips.filter((t) => t.yd === null);
const inRect = (n, z) =>
  n.x >= (z.xMin ?? -180) && n.x < (z.xMax ?? 180) && n.z >= z.zMin && n.z < z.zMax;
const zones = W.ZONES.map((z) => {
  const ids = nodes.map((n, i) => (inRect(n, z) ? i : -1)).filter((i) => i >= 0);
  let longest = 0;
  for (const a of ids) {
    const dist = dijkstra(a);
    for (const b of ids) if (Number.isFinite(dist[b]) && dist[b] > longest) longest = dist[b];
  }
  const w = (z.xMax ?? 180) - (z.xMin ?? -180);
  const h = z.zMax - z.zMin;
  return {
    zone: z.id,
    roadCrossingYd: Math.round(longest),
    roadCrossingMin: mins(longest),
    diagonalYd: Math.round(Math.hypot(w, h)),
    diagonalRunMin: +(Math.hypot(w, h) / speeds.run / 60).toFixed(1),
  };
});
const totalRoad = W.ROADS.reduce(
  (s, r) => s + r.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - r[i].x, p.z - r[i].z), 0),
  0,
);
const report = {
  speeds,
  totalRoadYd: Math.round(totalRoad),
  shortestHubTrip: { ...reachable[0], min: mins(reachable[0].yd) },
  longestHubTrip: {
    ...reachable[reachable.length - 1],
    min: mins(reachable[reachable.length - 1].yd),
  },
  unreachablePairs: unreachable.length,
  hubSnaps: hubs.map((h) => `${h.name} ${Math.round(h.off)}yd`),
  unreachableSample: unreachable.slice(0, 12).map((t) => `${t.from} -> ${t.to}`),
  zones,
};
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
