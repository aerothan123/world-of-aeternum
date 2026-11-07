import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Collider } from '../src/sim/colliders';
import { queryOpenWorldColliders } from '../src/sim/colliders';
import { STRIP_MAX_X, STRIP_MIN_X, ZONES } from '../src/sim/data';
import { SUPPORT_OVERLAP } from '../src/sim/parkour_heights';
import { traversalBand } from '../src/sim/traversal_band';
import { WORLD_SEED } from '../src/sim/world_seed';

// W17: the server's open-world colliders per zone (fences, walls, building
// footprints, rocks, decks), for the Unreal client's swept-collision port in
// its self-prediction kernel (WyndCollision). Exactly what the server's
// character solver queries (queryOpenWorldColliders); berth-gated colliders
// (a ship's gangway, transport_gates.ts) are left out because they come and go.
//
// UNREAL_COLLIDERS_OUT=<dir> writes colliders.records.json (every chosen zone,
// deduplicated) and colliders.json (the manifest);
// UNREAL_COLLIDERS_ZONES=a,b limits the zones (EA: every zone up to
// proving_shore). One record per collider:
//   c: [x, z, r]                          circle
//   o: [x, z, hw, hd, rot, fence]         oriented box (fence 1 = jumpable rail)
//   p: [x, z, br, poly, polyLo?, polyHi?] convex prism, outlines relative to (x, z)
// plus t (moveTopY, absent = full height), s (standable), b (baseY), sl
// (topSlope [kind 0 ridge 1 cone, axis 0 x 1 z, pitch, eaveY, fall]).

function record(c: Collider): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if (c.type === 'circle') r.c = [c.x, c.z, c.r];
  else if (c.type === 'obb') r.o = [c.x, c.z, c.hw, c.hd, c.rot, c.isFence ? 1 : 0];
  else
    r.p = [
      c.x,
      c.z,
      c.br,
      [...c.poly],
      c.polyLo ? [...c.polyLo] : null,
      c.polyHi ? [...c.polyHi] : null,
    ];
  if (c.moveTopY !== undefined) r.t = c.moveTopY;
  if (c.standable) r.s = 1;
  if (c.baseY !== undefined) r.b = c.baseY;
  if (c.passUnderY !== undefined) r.u = c.passUnderY;
  if (c.topSlope) {
    const s = c.topSlope;
    r.sl = [s.kind === 'cone' ? 1 : 0, s.axis === 'z' ? 1 : 0, s.pitch, s.eaveY, s.fall ?? 0];
  }
  return r;
}

describe('unreal collider export', () => {
  it('writes the open-world colliders per zone', () => {
    const wanted = (process.env.UNREAL_COLLIDERS_ZONES ?? '').split(',').filter(Boolean);
    const zones = ZONES.filter((z) => !wanted.length || wanted.includes(z.id));
    const out = process.env.UNREAL_COLLIDERS_OUT;
    const manifest = {
      source: 'tests/unreal_collider_export.test.ts',
      supportOverlap: SUPPORT_OVERLAP,
      stepHeight: traversalBand(),
      zones: [] as Array<{
        id: string;
        xMin: number;
        xMax: number;
        zMin: number;
        zMax: number;
        count: number;
      }>,
    };
    // One deduplicated list across every chosen zone: a collider near a zone
    // seam is in both zones' grids, and a body must meet it exactly once.
    const seen = new Set<Collider>();
    const records: Record<string, unknown>[] = [];
    for (const z of zones) {
      const xMin = z.xMin ?? STRIP_MIN_X;
      const xMax = z.xMax ?? STRIP_MAX_X;
      const list: Collider[] = [];
      queryOpenWorldColliders(WORLD_SEED, xMin, z.zMin, xMax, z.zMax, list);
      let count = 0;
      for (const c of list) {
        if (c.gate || seen.has(c)) continue;
        seen.add(c);
        records.push(record(c));
        count++;
      }
      manifest.zones.push({ id: z.id, xMin, xMax, zMin: z.zMin, zMax: z.zMax, count });
    }
    if (out) {
      if (!existsSync(out)) mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'colliders.records.json'), `${JSON.stringify(records)}\n`);
      writeFileSync(join(out, 'colliders.json'), `${JSON.stringify(manifest, null, 1)}\n`);
    }
    for (const m of manifest.zones) console.log(`colliders ${m.id} ${m.count}`);
    expect(manifest.zones.length).toBeGreaterThan(0);
  }, 600_000);
});
