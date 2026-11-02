// Player housing (Project H), phase 2: the placed furniture as WORLD ENTITIES
// inside the owner's claimed house instance. Each placed anchor stands a
// ground object (kind 'object', templateId `furniture_<itemId>`, no pickup
// item, never lootable, an Infinity respawn timer so the object-respawn sweep
// can never re-arm it: the shared feast's shape, professions/feast.ts) at the
// anchor's instance-local spot, facing the anchor's yaw. The renderer mirrors
// those entities (src/render/house_furniture.ts), the nameplate names the
// item, and freeInstance tears them down with the claim's other objects.
//
// The entity set is a PROJECTION of PlayerMeta.house.furniture: every
// place/remove while the house is claimed re-syncs it whole (a dozen anchors,
// so a rebuild is cheaper than a diff and cannot drift), and a fresh claim
// spawns it from the owner's record (instances/dungeons.ts claimInstance).
// Furniture is walk-through: no collider is derived here (cottage_layout.ts).
//
// Pure functions over SimContext (no rng, no clock); the instance slot's
// objectIds list is the ownership ledger, exactly as for a dungeon's own
// authored objects.

import { furnitureDefFor } from '../content/furniture';
import { createGroundObject } from '../entity';
import type { InstanceSlot, PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { HOUSE_COTTAGE_ANCHORS } from './cottage_layout';
import { furnitureTemplateId, isFurnitureTemplateId } from './furniture_template';
import type { HouseOwnership } from './house_state';

/** The house owner whose private copy `inst` is, or undefined (a real
 *  dungeon, an unclaimed slot, an owner no longer online). Keyed on the
 *  claim's partyKey, which ownership.ts houseInstanceKey mints per owner. */
export function houseInstanceOwner(
  players: ReadonlyMap<number, PlayerMeta>,
  partyKey: string | null,
  keyOf: (meta: PlayerMeta) => string,
): PlayerMeta | undefined {
  if (partyKey === null || !partyKey.startsWith('house:')) return undefined;
  for (const meta of players.values()) {
    if (meta.house && keyOf(meta) === partyKey) return meta;
  }
  return undefined;
}

/** Drops every furniture entity the claim stands and removes it from the
 *  slot's object ledger. */
export function despawnHouseFurniture(ctx: SimContext, inst: InstanceSlot): void {
  const kept: number[] = [];
  for (const id of inst.objectIds) {
    const e = ctx.entities.get(id);
    if (e && isFurnitureTemplateId(e.templateId)) ctx.dropEntity(id);
    else kept.push(id);
  }
  inst.objectIds = kept;
}

/** Stands one entity per placed anchor of `house` inside the claim at
 *  `origin` (the instance origin), replacing whatever furniture stood there. */
export function spawnHouseFurniture(
  ctx: SimContext,
  inst: InstanceSlot,
  origin: { x: number; z: number },
  house: HouseOwnership,
): void {
  despawnHouseFurniture(ctx, inst);
  for (const anchor of HOUSE_COTTAGE_ANCHORS) {
    const itemId = house.furniture[anchor.id];
    const def = furnitureDefFor(itemId);
    if (!def) continue;
    const e = createGroundObject(
      ctx.nextId++,
      '',
      anchor.id,
      ctx.groundPos(origin.x + anchor.x, origin.z + anchor.z),
    );
    e.templateId = furnitureTemplateId(def.itemId);
    e.objectItemId = null;
    e.lootable = false;
    e.respawnTimer = Infinity;
    e.facing = anchor.yaw;
    e.prevFacing = anchor.yaw;
    ctx.addEntity(e);
    inst.objectIds.push(e.id);
  }
}
