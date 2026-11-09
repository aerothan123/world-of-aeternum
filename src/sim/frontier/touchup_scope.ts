// The live-world touch-up patch (world_touchup.ts) pins a baseline token of the
// shipped world, so a reviewed patch can never land on a world that drifted
// under it. The expansion frontier is new ground the patch never saw: its
// zones, camps, roads and props append to the built-in tables, which would
// read as drift and refuse every existing patch. withoutFrontierContent strips
// the frontier back out before the token is taken, so the token keeps meaning
// "the shipped (core) world", and the frontier can grow row by row without
// rebasing anyone's map edits.
//
// Frontier records are recognised by VALUE, not identity (the editor deep
// clones the world): a zone whose rect lies outside the core rect, and any
// camp, road end or prop that stands past the core rect inside the frontier's
// extent. The instance bands far east sit outside that extent and are kept.

//
// The frontier spread (./spread.ts): the token is taken over the AUTHORED frame.
// withoutFrontierContent first maps the world back through the spread
// (unspreadFrontierContent, exact by construction), then filters against the
// authored extent, so spreading the frontier never moves the core token.

import type { WorldContent, ZoneDef } from '../types';
import { CORE_WORLD } from '../world_core_bounds';
import { FRONTIER_BLOBS, FRONTIER_NECKS, FRONTIER_TIE_INS } from './layout';
import { unspreadFrontierContent } from './spread';
import { frontierExtentOf, outsideCoreDistance } from './terrain';

/** The frontier extent in the authored (unspread) frame. */
const AUTHORED_EXTENT = frontierExtentOf(FRONTIER_BLOBS, FRONTIER_NECKS, FRONTIER_TIE_INS);

/** A point on frontier ground in the authored frame: past the core rect, inside
 *  the authored frontier extent. */
export function isFrontierPoint(x: number, z: number): boolean {
  return (
    outsideCoreDistance(x, z) > 0 &&
    x >= AUTHORED_EXTENT.minX &&
    x <= AUTHORED_EXTENT.maxX &&
    z >= AUTHORED_EXTENT.minZ &&
    z <= AUTHORED_EXTENT.maxZ
  );
}

/** A zone whose rect lies wholly outside the core rect. */
export function isFrontierZone(zone: ZoneDef): boolean {
  const x0 = zone.xMin ?? -180;
  const x1 = zone.xMax ?? 180;
  return (
    x1 <= CORE_WORLD.minX ||
    x0 >= CORE_WORLD.maxX ||
    zone.zMax <= CORE_WORLD.minZ ||
    zone.zMin >= CORE_WORLD.maxZ
  );
}

function entryPoint(entry: unknown): { x: number; z: number } | null {
  if (Array.isArray(entry)) {
    return typeof entry[0] === 'number' && typeof entry[1] === 'number'
      ? { x: entry[0], z: entry[1] }
      : null;
  }
  if (entry && typeof entry === 'object') {
    const e = entry as Record<string, unknown>;
    if (typeof e.x === 'number' && typeof e.z === 'number') return { x: e.x, z: e.z };
    if (typeof e.x1 === 'number' && typeof e.z1 === 'number') return { x: e.x1, z: e.z1 };
  }
  return null;
}

function keepEntry(entry: unknown): boolean {
  const p = entryPoint(entry);
  return p === null || !isFrontierPoint(p.x, p.z);
}

/** The world with every frontier record removed (the shipped world's view). */
export function withoutFrontierContent(spreadWorld: WorldContent): WorldContent {
  const world = unspreadFrontierContent(spreadWorld);
  const props = Object.fromEntries(
    Object.entries(world.props).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.filter(keepEntry) : value,
    ]),
  ) as WorldContent['props'];
  return {
    ...world,
    zones: world.zones.filter((zone) => !isFrontierZone(zone)),
    camps: world.camps.filter((camp) => !isFrontierPoint(camp.center.x, camp.center.z)),
    roads: world.roads.filter((road) => {
      const end = road[road.length - 1];
      return !end || !isFrontierPoint(end.x, end.z);
    }),
    props,
    // the frontier towns' Ravenpost perches (content/frontier/mailboxes.ts)
    ...(world.services
      ? {
          services: {
            ...world.services,
            mailboxes: world.services.mailboxes?.filter((box) => !isFrontierPoint(box.x, box.z)),
          },
        }
      : {}),
  };
}
