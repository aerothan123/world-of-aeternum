// The pure half of the Eastbrook Vale v2 import: turns the Unreal design's exports
// (heightfield.json, colliders.json, points.json, nodes.json, roads.json) into the
// server-frame tables src/sim/eastbrook_v2/*.generated.ts carry. No file system and
// no clock here, so tests/eastbrook_v2_import.test.ts runs it on small fixtures and
// the CLI (import_eastbrook_v2.ts) only reads, hashes and writes.
//
// Frames: the design is authored in the server's own x/z at 1 yard = 1 metre (the
// Unreal client maps sim (x, y, z) to Unreal (X, Z, Y) in centimetres), so x and z
// pass through unchanged. Heights move down by `yOffset` so the design's sea (y 4.0)
// lands on the server's WATER_LEVEL (-4.3). Inside the clip rect, water cells keep
// their depth below the server waterline (a brook or pond whose surface sits a little
// above the design's sea still reads as water of the same depth), and dry ground near
// water eases between the two offsets over `waterEdgeBlend` yards so no kerb forms.

export interface ImportConfig {
  yOffset: number;
  clip: { xMin: number; xMax: number; zMin: number; zMax: number };
  edgeBand: number;
  waterEdgeBlend: number;
  overheadClearance: number;
  flatTop: number;
  /** Boxes exported as one block across a walkable opening: kept as end posts. */
  openFrames?: readonly string[];
  openFramePost?: number;
  /** Boxes of a service prop the server stands as its own entity (dropped). */
  serviceProps?: readonly string[];
  /** Boxes of the buildings a body rests in (the inn): their footprints become the
   *  rest areas (rested XP), whatever happens to the box as a collider. */
  restBuildings?: readonly string[];
  corridors: readonly ImportCorridor[];
}

/** A rest area: [x, z, halfWidth, halfDepth, rot], the collider rows' convention. */
export type ServerRestArea = readonly [number, number, number, number, number];

/** The footprint of every rest building (cfg.restBuildings) from the design's own
 *  box, in the collider rows' convention. A named building missing from the export
 *  is an error: the inn would silently stop resting anyone. */
export function convertRestAreas(boxes: readonly DesignBox[], cfg: ImportConfig): ServerRestArea[] {
  return (cfg.restBuildings ?? []).map((name) => {
    const b = boxes.find((c) => c.name === name);
    if (!b) throw new Error(`rest building ${name} is not in colliders.json`);
    return [round2(b.x), round2(b.z), round2(b.hx), round2(b.hz), round4((-b.yaw * Math.PI) / 180)];
  });
}

export interface ImportCorridor {
  id: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
  blend: number;
}

export interface DesignHeightfield {
  grid: { x0: number; z0: number; cell_m: number; nx: number; nz: number };
  sea_level_cm: number;
  heights: number[][];
  water_surface: number[][];
}

export interface DesignBox {
  id: string;
  name: string;
  kind: string;
  src?: string;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
}

export interface DesignPoint {
  id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radius?: number;
  width?: number;
}

export interface DesignNode {
  id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  z: number;
  variant?: string;
  water?: string;
}

export interface DesignRoad {
  id: string;
  name: string;
  width_m: number;
  points: [number, number][];
}

/** The server's sea surface (src/sim/world.ts WATER_LEVEL), restated: this script
 *  must not import the sim. tests/eastbrook_v2_import.test.ts pins the two equal. */
export const SERVER_WATER_LEVEL = -4.3;

export interface ConvertedField {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Server-frame heights in centimetres, row-major (z rows of x). */
  heights: Int16Array;
  waterCells: number;
  /** Mean design water surface over the clipped water cells, metres. */
  meanWaterSurface: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

export function convertField(hf: DesignHeightfield, cfg: ImportConfig): ConvertedField {
  if (hf.grid.cell_m !== 1) throw new Error(`heightfield cell ${hf.grid.cell_m} m, expected 1`);
  const { xMin, xMax, zMin, zMax } = cfg.clip;
  const nx = xMax - xMin + 1;
  const nz = zMax - zMin + 1;
  const dryOffsetCm = Math.round(cfg.yOffset * 100);
  const waterCm = Math.round(SERVER_WATER_LEVEL * 100);
  const h = new Float64Array(nx * nz);
  const wetOffset = new Float64Array(nx * nz).fill(Number.NaN);
  let waterCells = 0;
  let surfaceSum = 0;
  for (let j = 0; j < nz; j++) {
    const row = zMin + j - hf.grid.z0;
    if (row < 0 || row >= hf.grid.nz)
      throw new Error(`clip z ${zMin + j} is outside the design grid`);
    for (let i = 0; i < nx; i++) {
      const col = xMin + i - hf.grid.x0;
      if (col < 0 || col >= hf.grid.nx)
        throw new Error(`clip x ${xMin + i} is outside the design grid`);
      const ground = hf.heights[row][col];
      const surface = hf.water_surface[row][col];
      h[j * nx + i] = ground;
      if (surface > ground) {
        wetOffset[j * nx + i] = waterCm - surface;
        waterCells++;
        surfaceSum += surface;
      }
    }
  }
  // Offset per cell: wet cells map their own surface to the server waterline, dry
  // cells take the flat offset, and dry cells within waterEdgeBlend of water ease
  // linearly from the nearest wet cell's offset (window search, ties by scan order).
  const R = Math.max(0, Math.round(cfg.waterEdgeBlend));
  const out = new Int16Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let offset = wetOffset[k];
      if (Number.isNaN(offset)) {
        offset = dryOffsetCm;
        let best = Number.POSITIVE_INFINITY;
        let bestOffset = dryOffsetCm;
        for (let dj = -R; dj <= R; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= nz) continue;
          for (let di = -R; di <= R; di++) {
            const ii = i + di;
            if (ii < 0 || ii >= nx) continue;
            const w = wetOffset[jj * nx + ii];
            if (Number.isNaN(w)) continue;
            const d = Math.hypot(di, dj);
            if (d < best) {
              best = d;
              bestOffset = w;
            }
          }
        }
        if (best <= R && R > 0) {
          const t = best / (R + 1);
          offset = bestOffset * (1 - t) + dryOffsetCm * t;
        }
      }
      const v = Math.round(h[k] + offset);
      if (v < -32768 || v > 32767) throw new Error(`height ${v} cm overflows int16`);
      out[k] = v;
    }
  }
  return {
    x0: xMin,
    z0: zMin,
    nx,
    nz,
    heights: out,
    waterCells,
    meanWaterSurface: waterCells ? round2(surfaceSum / waterCells / 100) : 0,
  };
}

/** Bilinear server-frame height (yards) in a converted field; clamps at the edge. */
export function fieldHeightAt(f: ConvertedField, x: number, z: number): number {
  const fx = Math.max(0, Math.min(f.nx - 1, x - f.x0));
  const fz = Math.max(0, Math.min(f.nz - 1, z - f.z0));
  const i0 = Math.min(f.nx - 2, Math.floor(fx));
  const j0 = Math.min(f.nz - 2, Math.floor(fz));
  const tx = fx - i0;
  const tz = fz - j0;
  const a = f.heights[j0 * f.nx + i0];
  const b = f.heights[j0 * f.nx + i0 + 1];
  const c = f.heights[(j0 + 1) * f.nx + i0];
  const d = f.heights[(j0 + 1) * f.nx + i0 + 1];
  return ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz) / 100;
}

export function insideClip(cfg: ImportConfig, x: number, z: number): boolean {
  const c = cfg.clip;
  return x >= c.xMin && x <= c.xMax && z >= c.zMin && z <= c.zMax;
}

/** One server collider row: [x, z, halfWidth, halfDepth, rot, top]. rot is the
 *  three.js rotation.y the server OBB reads (rotY: local +x goes to (cos r, -sin r));
 *  the design's yaw turns local +X toward +Z, so rot = -yaw. top is server-frame. */
export type ColliderRow = readonly [number, number, number, number, number, number];

export interface ConvertedColliders {
  rows: ColliderRow[];
  ids: string[];
  skipped: {
    outside: number;
    overhead: number;
    flat: number;
    treeTrunk: number;
    nodeBody: number;
    serviceProp: number;
    openFrame: number;
  };
}

/** Design tree trunks: the server stands its trees as decorations (choppable, with
 *  their own trunk collider), so the design's trunk boxes would double them. */
export function isTreeTrunkBox(b: DesignBox): boolean {
  return b.src === 'env' && /tree/i.test(b.name);
}

/** An opening's frame box as its two end posts along the box's long local axis. */
export function framePosts(b: DesignBox, post: number): DesignBox[] {
  const alongX = b.hx >= b.hz;
  const half = alongX ? b.hx : b.hz;
  const yaw = (b.yaw * Math.PI) / 180;
  // local +X turns to (cos yaw, sin yaw) in (x, z); local +Z to (-sin yaw, cos yaw)
  const ax = alongX ? Math.cos(yaw) : -Math.sin(yaw);
  const az = alongX ? Math.sin(yaw) : Math.cos(yaw);
  return [-1, 1].map((side, i) => ({
    ...b,
    id: `${b.id}_post${i}`,
    x: b.x + ax * side * (half - post),
    z: b.z + az * side * (half - post),
    hx: alongX ? post : b.hx,
    hz: alongX ? b.hz : post,
  }));
}

export function convertColliders(
  boxes: readonly DesignBox[],
  field: ConvertedField,
  cfg: ImportConfig,
  nodeIds: ReadonlySet<string> = new Set(),
): ConvertedColliders {
  const rows: ColliderRow[] = [];
  const ids: string[] = [];
  const skipped = {
    outside: 0,
    overhead: 0,
    flat: 0,
    treeTrunk: 0,
    nodeBody: 0,
    serviceProp: 0,
    openFrame: 0,
  };
  const seen = new Set<string>();
  const frames = new Set(cfg.openFrames ?? []);
  const serviceProps = new Set(cfg.serviceProps ?? []);
  const expanded: DesignBox[] = [];
  for (const b of boxes) {
    if (frames.has(b.name)) {
      skipped.openFrame++;
      expanded.push(...framePosts(b, cfg.openFramePost ?? 0.35));
    } else expanded.push(b);
  }
  for (const b of expanded) {
    if (b.kind !== 'box') throw new Error(`collider ${b.id} has kind ${b.kind}, expected box`);
    if (seen.has(b.id)) throw new Error(`duplicate collider id ${b.id}`);
    seen.add(b.id);
    if (!insideClip(cfg, b.x, b.z)) {
      skipped.outside++;
      continue;
    }
    if (isTreeTrunkBox(b)) {
      skipped.treeTrunk++;
      continue;
    }
    // A gather node's own body: the server builds a vein or patch collider itself.
    if (nodeIds.has(b.name)) {
      skipped.nodeBody++;
      continue;
    }
    // A service prop the server stands as its own entity with its own footprint
    // (the notice board): the design's box would wall the server's board in.
    if (serviceProps.has(b.name)) {
      skipped.serviceProp++;
      continue;
    }
    const ground = fieldHeightAt(field, b.x, b.z);
    const bottom = b.y - b.hy + cfg.yOffset;
    const top = b.y + b.hy + cfg.yOffset;
    if (bottom > ground + cfg.overheadClearance) {
      skipped.overhead++;
      continue;
    }
    if (top < ground + cfg.flatTop) {
      skipped.flat++;
      continue;
    }
    const rot = (-b.yaw * Math.PI) / 180;
    rows.push([round2(b.x), round2(b.z), round2(b.hx), round2(b.hz), round4(rot), round2(top)]);
    ids.push(b.id);
  }
  return { rows, ids, skipped };
}

export interface ServerPoint {
  id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radius?: number;
  width?: number;
}

export function convertPoints(points: readonly DesignPoint[], cfg: ImportConfig): ServerPoint[] {
  const seen = new Set<string>();
  return points.map((p) => {
    if (seen.has(p.id)) throw new Error(`duplicate point id ${p.id}`);
    seen.add(p.id);
    const out: ServerPoint = {
      id: p.id,
      kind: p.kind,
      name: p.name,
      x: round2(p.x),
      y: round2(p.y + cfg.yOffset),
      z: round2(p.z),
    };
    if (p.radius !== undefined) out.radius = p.radius;
    if (p.width !== undefined) out.width = p.width;
    return out;
  });
}

export interface ServerNode {
  id: string;
  kind: 'ore' | 'herb' | 'berry' | 'fishing';
  x: number;
  y: number;
  z: number;
}

export interface ConvertedNodes {
  nodes: ServerNode[];
  /** Wild trees inside the clip: [x, z] pairs in export order. */
  trees: [number, number][];
  treeIds: string[];
  outside: Record<string, number>;
}

export function convertNodes(nodes: readonly DesignNode[], cfg: ImportConfig): ConvertedNodes {
  const out: ServerNode[] = [];
  const trees: [number, number][] = [];
  const treeIds: string[] = [];
  const outside: Record<string, number> = {};
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) throw new Error(`duplicate node id ${n.id}`);
    seen.add(n.id);
    if (!insideClip(cfg, n.x, n.z)) {
      outside[n.kind] = (outside[n.kind] ?? 0) + 1;
      continue;
    }
    if (n.kind === 'tree') {
      trees.push([round2(n.x), round2(n.z)]);
      treeIds.push(n.id);
      continue;
    }
    if (n.kind !== 'ore' && n.kind !== 'herb' && n.kind !== 'berry' && n.kind !== 'fishing') {
      throw new Error(`node ${n.id} has unknown kind ${n.kind}`);
    }
    out.push({
      id: n.id,
      kind: n.kind,
      x: round2(n.x),
      y: round2(n.y + cfg.yOffset),
      z: round2(n.z),
    });
  }
  return { nodes: out, trees, treeIds, outside };
}

export interface ServerRoad {
  id: string;
  width: number;
  points: [number, number][];
}

/** Roads clipped to the rect: each run of consecutive inside points is one road
 *  (suffix `#n` when a road leaves and re-enters). */
export function convertRoads(roads: readonly DesignRoad[], cfg: ImportConfig): ServerRoad[] {
  const out: ServerRoad[] = [];
  for (const r of roads) {
    let run: [number, number][] = [];
    let part = 0;
    const flush = () => {
      if (run.length >= 2)
        out.push({ id: part ? `${r.id}#${part}` : r.id, width: r.width_m, points: run });
      if (run.length >= 2) part++;
      run = [];
    };
    for (const [x, z] of r.points) {
      if (insideClip(cfg, x, z)) run.push([round2(x), round2(z)]);
      else flush();
    }
    flush();
  }
  return out;
}

/** Base64 of an Int16Array's little-endian bytes (the generated field's encoding). */
export function int16ToBase64(a: Int16Array): string {
  const bytes = new Uint8Array(a.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < a.length; i++) view.setInt16(i * 2, a[i], true);
  return Buffer.from(bytes).toString('base64');
}
