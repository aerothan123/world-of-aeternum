// The Eastbrook Vale v2 play area (owner, 2026-11): the Unreal client draws ONE
// map, the v2 vale (/Game/WorldV2/EastbrookVale/EastbrookVale), and the old map's
// Proving Shore, Farshore isle, frontier slices and dungeon interiors are gone
// from it. On a host that opts in (SimConfig.valeOnly: the live server and the
// offline built-in world), the overworld a character can stand in is the vale
// slot, so nobody walks, swims, teleports or resumes a save into the sea where
// the old map used to be:
//
// - `resolveValeSave`: a save outside the vale resumes at the mainland start
//   (saved_pos_exit.ts, which the character list reads too);
// - `enforceValeBounds`: a body that strays a stride past the slot edge is held
//   at the edge, and one that arrives far outside it (any teleport) is set down
//   at the mainland start;
// - `valeGraveyards`: spirits rise at the vale's own graveyards only;
// - `valeDungeonOpen`: an instance whose door stands outside the vale (the old
//   dungeon slots, every raid) refuses entry; the vale's house lots stay open;
// - `retireOldMapEntities`: the old map's static cast outside the vale (and the
//   Proving Shore ferry bell's mainland twin) is dropped once at world build, so
//   nothing stands on the open sea at the vale's edges.
//
// The content tables themselves stay: every gate is a host opt-in, so tests,
// parity traces and the RL env keep the whole built-in world. Built-in world
// only: an authored map (isBuiltinWorldActive false) never sees any of this.
// Pure apart from the ctx consumers; draws no rng and reads no clock.

import {
  CAMPS,
  DUNGEONS,
  GROUND_OBJECTS,
  INSTANCE_X_BASE,
  isBuiltinWorldActive,
  MOBS,
  NPCS,
  PLAYER_START,
  QUESTS,
  ZONES,
} from './data';
import { displacePlayer } from './displacement';
import { FERRY_BELL_OBJECT_ID } from './interactions/ferry_bell';
import { dungeonDoorPos } from './moved_objects';
import type { SimContext } from './sim_context';
import type { Entity, ObjectMoves } from './types';

const VALE_ZONE = ZONES.find((zone) => zone.id === 'eastbrook_vale');
if (!VALE_ZONE || VALE_ZONE.xMin === undefined || VALE_ZONE.xMax === undefined) {
  throw new Error('vale_bounds: the eastbrook_vale zone rect is missing');
}

/** The vale slot (server yards): the ground the v2 Unreal level draws. */
export const VALE_PLAY_AREA = {
  xMin: VALE_ZONE.xMin,
  xMax: VALE_ZONE.xMax,
  zMin: VALE_ZONE.zMin,
  zMax: VALE_ZONE.zMax,
} as const;

/** Where a new character starts, and where every retired save resumes: the v2
 *  design's own player start at the foot of the south lane into Eastbrook
 *  (eastbrook_v2 site svc:playerStart), facing north up the lane toward Warden
 *  Corren Stoutvale, the first quest giver. Facing follows the player convention
 *  (f points along (sin f, cos f)), so 0 is +z, north. */
export const MAINLAND_START = { x: PLAYER_START.x, z: PLAYER_START.z, facing: 0 } as const;

/** How far inside the edge a held body stands, and how far past it a body must
 *  be before the move reads as a teleport rather than a stride. */
const EDGE_INSET = 0.5;
const TELEPORT_BEYOND = 8;

/** Whether this host keeps characters inside the vale (built-in world only). */
export function valeOnlyActive(cfg: { readonly valeOnly?: boolean }): boolean {
  return cfg.valeOnly === true && isBuiltinWorldActive();
}

export function isInValePlayArea(x: number, z: number): boolean {
  return (
    x >= VALE_PLAY_AREA.xMin &&
    x <= VALE_PLAY_AREA.xMax &&
    z >= VALE_PLAY_AREA.zMin &&
    z <= VALE_PLAY_AREA.zMax
  );
}

/** Overworld positions only: the instance plane (dungeons, houses, delves,
 *  rifts, battlegrounds) lies far east and keeps its own rules. */
function isOverworld(x: number): boolean {
  return x < INSTANCE_X_BASE;
}

/** How far outside the vale slot a point lies (0 inside). */
export function distanceOutsideVale(x: number, z: number): number {
  return Math.max(
    VALE_PLAY_AREA.xMin - x,
    x - VALE_PLAY_AREA.xMax,
    VALE_PLAY_AREA.zMin - z,
    z - VALE_PLAY_AREA.zMax,
    0,
  );
}

/** A save's resume spot under the vale gate: an overworld spot outside the vale
 *  (the Proving Shore, the Farshore, a frontier slice, any zone beyond) resumes
 *  at the world start (null), which on the built-in world is MAINLAND_START. */
export function resolveValeSave(
  pos: { x: number; z: number } | null,
  valeOnly: boolean,
): { x: number; z: number } | null {
  if (!pos || !valeOnly || !isBuiltinWorldActive()) return pos;
  if (!isOverworld(pos.x)) return pos;
  return isInValePlayArea(pos.x, pos.z) ? pos : null;
}

/** The per-tick hold (living players after movement, spirits on their run). */
export function enforceValeBounds(ctx: SimContext, p: Entity): void {
  if (p.kind !== 'player' || !valeOnlyActive(ctx.cfg)) return;
  if (!isOverworld(p.pos.x)) return;
  const outside = distanceOutsideVale(p.pos.x, p.pos.z);
  if (outside <= 0) return;
  if (outside > TELEPORT_BEYOND && !p.ghost) {
    displacePlayer(ctx, p, MAINLAND_START, 'You find your way back to Eastbrook Vale.');
    return;
  }
  p.pos.x = Math.min(
    Math.max(p.pos.x, VALE_PLAY_AREA.xMin + EDGE_INSET),
    VALE_PLAY_AREA.xMax - EDGE_INSET,
  );
  p.pos.z = Math.min(
    Math.max(p.pos.z, VALE_PLAY_AREA.zMin + EDGE_INSET),
    VALE_PLAY_AREA.zMax - EDGE_INSET,
  );
  ctx.rebucket(p);
}

/** The graveyards a spirit may rise at: the vale's own under the gate (every
 *  list keeps at least one yard, so a world with none inside is left whole). */
export function valeGraveyards<T extends { x: number; z: number }>(
  cfg: { readonly valeOnly?: boolean },
  graveyards: readonly T[],
): readonly T[] {
  if (!valeOnlyActive(cfg)) return graveyards;
  const inside = graveyards.filter((g) => isInValePlayArea(g.x, g.z));
  return inside.length > 0 ? inside : graveyards;
}

/** Whether an instance admits players under the gate: only one whose overworld
 *  door stands in the vale (the vale's house lots). A door-less room (a raid's
 *  inner wing) has no way in from the vale either. */
export function valeDungeonOpen(
  cfg: { readonly valeOnly?: boolean },
  objectMoves: ObjectMoves | undefined,
  dungeonId: string,
): boolean {
  if (!valeOnlyActive(cfg)) return true;
  const dungeon = DUNGEONS[dungeonId];
  if (!dungeon || dungeon.overworldDoor === false) return false;
  const door = dungeonDoorPos(objectMoves, dungeon);
  return isInValePlayArea(door.x, door.z);
}

/** Whether a static world entity belongs to the old map under the gate. */
export function isRetiredOldMapEntity(e: Entity): boolean {
  if (e.kind === 'player') return false;
  if (!isOverworld(e.pos.x)) return false;
  if (e.kind === 'object' && e.objectItemId === FERRY_BELL_OBJECT_ID) return true;
  return !isInValePlayArea(e.pos.x, e.pos.z);
}

/** Drop the old map's static cast once the world is built. Returns the count. */
export function retireOldMapEntities(ctx: SimContext): number {
  if (!valeOnlyActive(ctx.cfg)) return 0;
  const retired: number[] = [];
  for (const e of ctx.entities.values()) {
    if (e.kind === 'npc' || e.kind === 'mob' || e.kind === 'object') {
      if (isRetiredOldMapEntity(e)) retired.push(e.id);
    }
  }
  for (const id of retired) ctx.dropEntity(id);
  return retired.length;
}

type Spot = { readonly x: number; readonly z: number };

/** True when a place list is non-empty and every place lies off the vale. */
function allOffVale(spots: readonly Spot[]): boolean {
  return spots.length > 0 && spots.every((s) => !isInValePlayArea(s.x, s.z));
}

function npcSpots(npcId: string): Spot[] {
  const npc = NPCS[npcId];
  return npc && !npc.dynamic ? [npc.pos] : [];
}

function objectSpots(itemId: string): Spot[] {
  return GROUND_OBJECTS.filter((o) => o.itemId === itemId).flatMap((o) => o.positions);
}

function mobSpots(mobId: string): Spot[] {
  return CAMPS.filter((c) => c.mobId === mobId).map((c) => c.center);
}

function lootSpots(itemId: string): Spot[] {
  const spots: Spot[] = [...objectSpots(itemId)];
  for (const mob of Object.values(MOBS)) {
    if (mob.loot?.some((l) => l.itemId === itemId)) spots.push(...mobSpots(mob.id));
  }
  return spots;
}

/** Whether a quest needs a place the vale-only world no longer has: its giver or
 *  turn-in NPC, an NPC or object it sends the player to, the only camps of a
 *  mob it asks for, or the only sources of an item it collects stand off the
 *  vale. A quest with no authored place for a step (a fished or crafted item)
 *  is never judged off the vale by that step. */
export function questLeavesVale(questId: string): boolean {
  const q = QUESTS[questId];
  if (!q) return false;
  if (allOffVale(npcSpots(q.giverNpcId)) || allOffVale(npcSpots(q.turnInNpcId))) return true;
  for (const o of q.objectives) {
    if (o.type === 'interact' && o.targetNpcId && allOffVale(npcSpots(o.targetNpcId))) return true;
    if (
      o.type === 'interact' &&
      o.targetObjectItemId &&
      allOffVale(objectSpots(o.targetObjectItemId))
    )
      return true;
    if (o.type === 'kill' && o.targetMobId && allOffVale(mobSpots(o.targetMobId))) return true;
    if (o.type === 'collect' && o.itemId && allOffVale(lootSpots(o.itemId))) return true;
  }
  return false;
}

// The off-vale quest set over the built-in content tables, which never change
// after data.ts assembles them; derived once on first use and read-only after.
let offValeQuests: ReadonlySet<string> | null = null;

/** The quests the vale-only world refuses to offer (empty off the gate). Fed into
 *  quests/quest_commands.ts repeatBlockedQuestIds, so the online client's quest
 *  markers read the same refusal through the cprof mirror. */
export function valeBlockedQuestIds(cfg: { readonly valeOnly?: boolean }): readonly string[] {
  if (!valeOnlyActive(cfg)) return [];
  // Only quests a vale NPC still offers: every other giver stands down at world
  // build, so listing its quests would only grow the cprof mirror.
  offValeQuests ??= new Set(
    Object.keys(QUESTS).filter(
      (id) => !allOffVale(npcSpots(QUESTS[id].giverNpcId)) && questLeavesVale(id),
    ),
  );
  return [...offValeQuests];
}
