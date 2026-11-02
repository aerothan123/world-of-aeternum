// Player housing (Project H), phase 3: home crafting stations. A system module
// behind the SimContext seam (functions only, no state of its own: the placed
// pieces are PlayerMeta.house.furniture, their entities the claim's object
// ledger). Draws NO rng and reads no clock.
//
// A placed station piece (content/furniture.ts FurnitureDef.stationType, one
// per StationType) serves its owner exactly as the town station of that type
// does: standing within STATION_RADIUS of its ENTITY inside the owner's OWN
// house copy satisfies the recipe station gate (professions/crafting.ts), and
// the crafts that type serves join the viewer's served-craft set
// (professions/mobile_station.ts activeMobileStationCraftsForViewer, the ONE
// resolver the `mst` wire and the crafting window's row gate already read), so
// the craft window's station rows enable at home with no new wire surface.
// The town stations keep everything else: training, the Maker's Bond unbind
// and the Perfecting exchange are master services (the mobile-station
// precedent), never a home piece's.
//
// Bounded by construction: the walk is the claim's object ledger (the
// cottage's anchors plus its exit), and only for a player who owns a house and
// stands inside it (ownHouseInstanceAt is one instance lookup).

import { furnitureStationType } from '../content/furniture';
import { STATION_RADIUS } from '../content/professions';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { StationType } from '../types';
import { ownHouseInstanceAt } from './furnishing';
import { furnitureItemOf } from './furniture_template';

/** Every station type served by a placed home station within STATION_RADIUS
 *  of `pos`, for a player standing inside their own house; empty elsewhere.
 *  Allocates only when a station is in reach (the common per-tick answer for a
 *  player away from home is the shared empty set). */
export function houseStationTypesNear(
  ctx: SimContext,
  meta: PlayerMeta,
  pos: { x: number; y: number; z: number },
): ReadonlySet<StationType> {
  if (!meta.house) return NO_STATIONS;
  const inst = ownHouseInstanceAt(ctx, meta, pos);
  if (!inst) return NO_STATIONS;
  let found: Set<StationType> | null = null;
  for (const id of inst.objectIds) {
    const obj = ctx.entities.get(id);
    if (obj?.kind !== 'object') continue;
    const type = furnitureStationType(furnitureItemOf(obj.templateId));
    if (!type) continue;
    const dx = pos.x - obj.pos.x;
    const dz = pos.z - obj.pos.z;
    if (dx * dx + dz * dz > STATION_RADIUS * STATION_RADIUS) continue;
    if (!found) found = new Set();
    found.add(type);
  }
  return found ?? NO_STATIONS;
}

const NO_STATIONS: ReadonlySet<StationType> = new Set();

/** The crafting gate's home arm: true while a placed station of `type` serves
 *  the player where they stand. */
export function atHouseStation(
  ctx: SimContext,
  pid: number,
  pos: { x: number; y: number; z: number },
  type: StationType,
): boolean {
  const meta = ctx.players.get(pid);
  if (!meta?.house) return false;
  return houseStationTypesNear(ctx, meta, pos).has(type);
}
