// Where Eastbrook's content stands on the v2 design (sites.generated.ts, written by
// scripts/eastbrook_v2/resite_eastbrook_v2.ts from data/eastbrook_v2/sites_config.json).
// A site is keyed by what it moves:
//   npc:<id>  station:<id>  svc:<playerStart|mailbox|noticeboard|graveyard>
//   lot:<id> (door plus the step out)  node:<id>
//   camp:<mobId>@<x>,<z>  obj:<itemId>@<x>,<z>  (the authored position, so a re-run
//   always starts from the content as written)
// Readers fall back to their authored position when no site exists. Ids never change.
// Pure leaf: no rng, no clock.

import type { CampDef, GroundObjectDef, NpcDef } from '../types';
import { EBV2_SITES, type Ebv2Site } from './sites.generated';

export type { Ebv2Site } from './sites.generated';

const SITES: Readonly<Record<string, Ebv2Site>> = EBV2_SITES;

/** The design site for `key`, or undefined (the content keeps its own spot). */
export function ebv2Site(key: string): Ebv2Site | undefined {
  return SITES[key];
}

/** `{ x, z }` of the site for `key`, else a copy of `fallback`. */
export function ebv2SiteOr(
  key: string,
  fallback: { x: number; z: number },
): { x: number; z: number } {
  const s = SITES[key];
  return s ? { x: s.x, z: s.z } : { x: fallback.x, z: fallback.z };
}

export function campSiteKey(c: { mobId: string; center: { x: number; z: number } }): string {
  return `camp:${c.mobId}@${c.center.x},${c.center.z}`;
}

export function objectSiteKey(itemId: string, p: { x: number; z: number }): string {
  return `obj:${itemId}@${p.x},${p.z}`;
}

/** What applyEbv2Sites moved, with the authored spot, in table order: the resite
 *  tool and the tests read it to start from the content as written. Filled once
 *  at data.ts load, never read by gameplay. */
export const EBV2_SITE_LOG: {
  key: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
}[] = [];

/** Moves the merged content tables onto their sites, once, at data.ts load (the
 *  frontier spread's idiom: in place, before anything reads a position). */
export function applyEbv2Sites(tables: {
  npcs: Record<string, NpcDef>;
  camps: CampDef[];
  objects: GroundObjectDef[];
}): void {
  for (const npc of Object.values(tables.npcs)) {
    const s = SITES[`npc:${npc.id}`];
    if (s && (s.x !== npc.pos.x || s.z !== npc.pos.z)) {
      EBV2_SITE_LOG.push({
        key: `npc:${npc.id}`,
        from: { x: s.fromX ?? npc.pos.x, z: s.fromZ ?? npc.pos.z },
        to: { x: s.x, z: s.z },
      });
      npc.pos = { ...npc.pos, x: s.x, z: s.z };
    }
  }
  for (let i = 0; i < tables.camps.length; i++) {
    const c = tables.camps[i];
    const key = campSiteKey(c);
    const s = SITES[key];
    if (!s) continue;
    EBV2_SITE_LOG.push({ key, from: { x: c.center.x, z: c.center.z }, to: { x: s.x, z: s.z } });
    tables.camps[i] = { ...c, center: { x: s.x, z: s.z } };
  }
  for (let i = 0; i < tables.objects.length; i++) {
    const o = tables.objects[i];
    let moved = false;
    const positions = o.positions.map((p) => {
      const key = objectSiteKey(o.itemId, p);
      const s = SITES[key];
      if (!s) return p;
      moved = true;
      EBV2_SITE_LOG.push({ key, from: { x: p.x, z: p.z }, to: { x: s.x, z: s.z } });
      return { ...p, x: s.x, z: s.z };
    });
    if (moved) tables.objects[i] = { ...o, positions };
  }
}
