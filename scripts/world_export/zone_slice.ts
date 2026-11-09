// Named export areas for export_slice.mjs, and the gameplay spots inside one
// that an engine's set dressing must keep clear.
//
// Two kinds of name: the look-dev slices (eastbrook_vale, a padded 448 yd
// square round the hub, and proving_shore, the island padded 4 yd) that the
// Unreal environment slice was tuned on, and one slice per zone id, whose
// bounds are exactly the zone's own rectangle (zoneInfos, with a strip
// zone's width cut back where an island zone owns the side). Zone slices
// that share an edge sample it at the same points (the grid starts on each
// zone's own min corner and the cell size is the same), so neighbouring
// terrains meet vertex for vertex.

import { OVERWORLD_GRAVEYARDS } from '../../src/sim/content/graveyards';
import { CAMPS, GROUND_OBJECTS, gatherNodesInActiveWorld, NPCS, PORTALS } from '../../src/sim/data';
import { type ZoneInfo, zoneInfos } from './ue_zone_export';
import { EASTBROOK_VALE_SLICE, type ExportBounds } from './world_slice_export';

/** The Proving Shore look-dev slice: the starter island (zone rect x -540 to
 *  -180, z -180 to 180) padded 4 yd to a 368 yd square. */
export const PROVING_SHORE_SLICE: ExportBounds = { minX: -544, maxX: -176, minZ: -184, maxZ: 184 };

/** The look-dev slices by output name (export_slice.mjs --slice). */
export const LOOK_SLICES: Readonly<Record<string, ExportBounds>> = {
  eastbrook_vale: EASTBROOK_VALE_SLICE,
  proving_shore: PROVING_SHORE_SLICE,
};

/**
 * A zone's own rectangle. A strip zone spans the strip's width, but where a
 * zone with its own x range covers the strip zone's whole z band at a side
 * (the Proving Shore and the Farshore beside Eastbrook Vale), that side is
 * the other zone's, so the strip zone stops at its edge.
 */
export function zoneRect(id: string, zones: readonly ZoneInfo[] = zoneInfos()): ExportBounds {
  const z = zones.find((q) => q.id === id);
  if (!z) throw new Error(`unknown zone ${id}; one of ${zones.map((q) => q.id).join(', ')}`);
  const r = { ...z.rect };
  for (const o of zones) {
    if (o.id === id || o.rect.minZ > r.minZ || o.rect.maxZ < r.maxZ) continue;
    if (o.rect.minX <= r.minX && o.rect.maxX > r.minX && o.rect.maxX < r.maxX) r.minX = o.rect.maxX;
    if (o.rect.maxX >= r.maxX && o.rect.minX < r.maxX && o.rect.minX > r.minX) r.maxX = o.rect.minX;
  }
  return r;
}

/**
 * The export bounds for `--zone <id>`: the zone's rectangle. The raster grid
 * has one cell size for both axes, so a zone that is not square is refused
 * here (none of wave 1 is; a later wave splits such a zone into squares).
 */
export function zoneSliceBounds(id: string): ExportBounds {
  const r = zoneRect(id);
  if (r.maxX - r.minX !== r.maxZ - r.minZ) {
    throw new Error(
      `zone ${id} is ${r.maxX - r.minX} by ${r.maxZ - r.minZ} yd; the slice export needs a square`,
    );
  }
  return r;
}

/** Bounds for a slice name: a zone id first, then a look-dev slice. */
export function resolveSlice(opts: { zone?: string; slice?: string }): {
  name: string;
  kind: 'zone' | 'look';
  bounds: ExportBounds;
} {
  if (opts.zone) return { name: opts.zone, kind: 'zone', bounds: zoneSliceBounds(opts.zone) };
  const name = opts.slice ?? 'eastbrook_vale';
  const bounds = LOOK_SLICES[name];
  if (!bounds) {
    throw new Error(`unknown --slice ${name}; one of ${Object.keys(LOOK_SLICES).join(', ')}`);
  }
  return { name, kind: 'look', bounds };
}

export type KeepOutKind = 'npc' | 'camp' | 'node' | 'object' | 'portal' | 'graveyard';

/** A disc of the ground dressing must leave free (game x, z and radius, yd). */
export interface KeepOut {
  kind: KeepOutKind;
  id: string;
  x: number;
  z: number;
  r: number;
}

/** Clearance radii in yd: an NPC's stand and talk spot, a gather node's
 *  strike circle, a quest object's pick-up, a portal's trigger; a camp keeps
 *  its whole spawn and wander radius plus a margin. */
export const KEEP_OUT_RADIUS = {
  npc: 3,
  node: 2.5,
  object: 1.5,
  portal: 4,
  graveyard: 4,
  campPad: 2,
};

/**
 * Every gameplay spot inside `b` that dressing must not block: quest and
 * service NPCs, mob camps, gather nodes, ground quest objects, portals and
 * graveyards. Read from the live content tables, sorted for stable output.
 */
export function zoneKeepOuts(b: ExportBounds): KeepOut[] {
  const inside = (x: number, z: number, r = 0): boolean =>
    x + r >= b.minX && x - r <= b.maxX && z + r >= b.minZ && z - r <= b.maxZ;
  const out: KeepOut[] = [];
  const R = KEEP_OUT_RADIUS;
  for (const n of Object.values(NPCS)) {
    if (inside(n.pos.x, n.pos.z))
      out.push({ kind: 'npc', id: n.id, x: n.pos.x, z: n.pos.z, r: R.npc });
  }
  for (const c of CAMPS) {
    const r = c.radius + R.campPad;
    if (inside(c.center.x, c.center.z, r)) {
      out.push({ kind: 'camp', id: c.mobId, x: c.center.x, z: c.center.z, r });
    }
  }
  for (const g of gatherNodesInActiveWorld()) {
    if (inside(g.pos.x, g.pos.z))
      out.push({ kind: 'node', id: g.id, x: g.pos.x, z: g.pos.z, r: R.node });
  }
  for (const o of GROUND_OBJECTS) {
    for (const p of o.positions) {
      if (inside(p.x, p.z)) out.push({ kind: 'object', id: o.itemId, x: p.x, z: p.z, r: R.object });
    }
  }
  for (const p of PORTALS) {
    for (const s of [p.a, p.b] as unknown as { x?: number; z?: number }[]) {
      if (typeof s?.x === 'number' && typeof s?.z === 'number' && inside(s.x, s.z)) {
        out.push({ kind: 'portal', id: p.id, x: s.x, z: s.z, r: Math.max(R.portal, p.radius) });
      }
    }
  }
  for (const g of OVERWORLD_GRAVEYARDS) {
    if (inside(g.x, g.z)) out.push({ kind: 'graveyard', id: g.id, x: g.x, z: g.z, r: R.graveyard });
  }
  return out.sort((a, c) => a.kind.localeCompare(c.kind) || a.id.localeCompare(c.id) || a.x - c.x);
}
