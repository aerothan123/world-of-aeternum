// Gear durability, the live system behind SimContext: wear on death and in
// combat, the broken-gear stat refresh, and repair at an armorer or weapon
// vendor. The pure rules (maxima, wear amounts, prices) are ./durability_rules.ts.
//
// State: wear is PER COPY, on the item's instance payload (`wear`, points lost),
// so it travels with the item into the bags, the bank, trades, mail and the
// market, persists through the existing payload save path, and reaches the
// owning client through the existing `einst`/`inv` self mirrors with no new
// wire key. A copy with no wear carries no `wear` key (and a payload that
// would hold nothing else is removed), so an undamaged save is byte-equal to
// before. The combat wear counters are runtime-only on the Entity
// (`Entity.durabilityWear`) and never saved: a relog restarts the count.
//
// Determinism: draws NO rng (combat wear is a deterministic counter, see the
// rules header) and reads no clock. Server-authoritative: every write happens
// here, inside the sim.

import { ITEMS, NPCS } from '../data';
import { recalcPlayerStats } from '../entity';
import { npcRoleFor, type NpcRole } from '../npc_role';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import {
  dist2d,
  type Entity,
  type EquipSlot,
  INTERACT_RANGE,
  type InvSlot,
  type ItemInstancePayload,
} from '../types';
import {
  DURABILITY_SLOTS,
  deathWearFor,
  HITS_DEALT_PER_POINT,
  HITS_TAKEN_PER_POINT,
  isBroken,
  maxDurabilityFor,
  repairCost,
  wearOf,
} from './durability_rules';

/** The vendor roles that repair (the classic armorer and weaponsmith counters). */
export const REPAIR_NPC_ROLES: ReadonlySet<NpcRole> = new Set<NpcRole>([
  'armorVendor',
  'weaponVendor',
  'armsDealer',
  'weaponsmithTrainer',
]);

/** The vendor-row service id the repair-all button buys (never an ITEMS entry;
 *  buyItem routes it here before any stock check, like Riding Training). */
export const REPAIR_ALL_SERVICE_ID = 'repair_all_service';

const NOTICE_REPAIRED = 'Your equipment has been repaired.';
const NOTICE_BROKEN = 'One of your items has broken. Repair it at an armorer or weaponsmith.';

/** Whether this NPC template repairs gear. */
export function npcRepairs(templateId: string | undefined): boolean {
  const def = templateId ? NPCS[templateId] : undefined;
  const role = def ? npcRoleFor(def) : null;
  return role !== null && REPAIR_NPC_ROLES.has(role);
}

/** The worn copy's current wear (0 when the slot is empty or undamaged). */
export function slotWear(meta: Pick<PlayerMeta, 'equipment' | 'equipmentInstance'>, slot: EquipSlot): number {
  const itemId = meta.equipment[slot];
  return itemId ? wearOf(ITEMS[itemId], meta.equipmentInstance[slot]?.wear) : 0;
}

/** Add `points` of wear to the worn copy in `slot`. Returns whether the copy
 *  just broke. A slot with no durability is untouched. */
function addSlotWear(meta: PlayerMeta, slot: EquipSlot, points: number): boolean {
  const itemId = meta.equipment[slot];
  const item = itemId ? ITEMS[itemId] : undefined;
  const max = maxDurabilityFor(item);
  if (max === 0 || points <= 0) return false;
  const before = wearOf(item, meta.equipmentInstance[slot]?.wear);
  if (before >= max) return false;
  const after = Math.min(max, before + points);
  const payload: ItemInstancePayload = meta.equipmentInstance[slot] ?? {};
  payload.wear = after;
  meta.equipmentInstance[slot] = payload;
  return after >= max;
}

function refresh(ctx: SimContext, meta: PlayerMeta, e: Entity, broke: boolean): void {
  meta.wireRev++;
  if (broke) {
    recalcPlayerStats(e, meta.cls, meta.equipment, ctx.playerMods(meta), meta.equipmentInstance);
    ctx.notice(meta.entityId, NOTICE_BROKEN);
  }
}

/** A death costs every worn piece 10% of its maximum, but only a death to the
 *  world: a player (or a player's pet) as the killer costs nothing. */
export function onPlayerDeathForDurability(ctx: SimContext, e: Entity, killer: Entity | null): void {
  if (e.kind !== 'player') return;
  const owner = killer?.ownerId != null ? ctx.entities.get(killer.ownerId) : undefined;
  if (killer?.kind === 'player' || owner?.kind === 'player') return;
  const meta = ctx.players.get(e.id);
  if (!meta) return;
  let changed = false;
  let broke = false;
  for (const slot of DURABILITY_SLOTS) {
    const itemId = meta.equipment[slot];
    const points = itemId ? deathWearFor(ITEMS[itemId]) : 0;
    if (points === 0) continue;
    changed = true;
    if (addSlotWear(meta, slot, points)) broke = true;
  }
  if (changed) refresh(ctx, meta, e, broke);
}

function counters(e: Entity): NonNullable<Entity['durabilityWear']> {
  if (!e.durabilityWear) e.durabilityWear = { taken: 0, dealt: 0, turn: 0 };
  return e.durabilityWear;
}

/** A landed hit on a player from a non-player source wears one worn armor
 *  piece a point every HITS_TAKEN_PER_POINT hits (round-robin). */
export function onPlayerHitTakenForDurability(ctx: SimContext, target: Entity, source: Entity | null): void {
  if (target.kind !== 'player' || target.dead || !source || source.kind === 'player') return;
  const c = counters(target);
  if (++c.taken < HITS_TAKEN_PER_POINT) return;
  c.taken = 0;
  const meta = ctx.players.get(target.id);
  if (!meta) return;
  const armor = DURABILITY_SLOTS.filter(
    (slot) => slot !== 'mainhand' && maxDurabilityFor(ITEMS[meta.equipment[slot] ?? '']) > 0,
  );
  if (armor.length === 0) return;
  const slot = armor[c.turn % armor.length];
  c.turn = (c.turn + 1) % 1024;
  refresh(ctx, meta, target, addSlotWear(meta, slot, 1));
}

/** A player's landed physical hit on a non-player wears the main-hand weapon
 *  a point every HITS_DEALT_PER_POINT hits. */
export function onPlayerHitDealtForDurability(ctx: SimContext, source: Entity | null, target: Entity, school: string): void {
  if (!source || source.kind !== 'player' || target.kind === 'player' || school !== 'physical') return;
  const c = counters(source);
  if (++c.dealt < HITS_DEALT_PER_POINT) return;
  c.dealt = 0;
  const meta = ctx.players.get(source.id);
  if (!meta || maxDurabilityFor(ITEMS[meta.equipment.mainhand ?? '']) === 0) return;
  refresh(ctx, meta, source, addSlotWear(meta, 'mainhand', 1));
}

/** The copper a full repair (worn gear and bagged copies) costs right now. */
export function repairAllCost(
  meta: Pick<PlayerMeta, 'equipment' | 'equipmentInstance'> & {
    inventory: readonly InvSlot[];
  },
): number {
  let total = 0;
  for (const slot of DURABILITY_SLOTS) {
    const itemId = meta.equipment[slot];
    if (itemId) total += repairCost(ITEMS[itemId], meta.equipmentInstance[slot]?.wear);
  }
  for (const s of meta.inventory) {
    if (s.instance?.wear) total += repairCost(ITEMS[s.itemId], s.instance.wear);
  }
  return total;
}

function clearWear(payload: ItemInstancePayload): boolean {
  delete payload.wear;
  return Object.keys(payload).length === 0;
}

/** Repair everything worn and bagged at a repairing NPC, for repairAllCost.
 *  Refuses (charging nothing) out of range, at a non-repairing NPC, with
 *  nothing to repair, or without the copper. */
export function repairAllAtNpc(ctx: SimContext, meta: PlayerMeta, e: Entity, npc: Entity): boolean {
  if (!npcRepairs(npc.templateId)) {
    ctx.error(meta.entityId, 'This merchant cannot repair your equipment.');
    return false;
  }
  if (dist2d(e.pos, npc.pos) > INTERACT_RANGE + 2) {
    ctx.error(meta.entityId, 'Too far away.');
    return false;
  }
  const cost = repairAllCost(meta);
  if (cost === 0) {
    ctx.error(meta.entityId, 'Nothing needs repairing.');
    return false;
  }
  if (meta.copper < cost) {
    ctx.error(meta.entityId, 'Not enough money.');
    return false;
  }
  meta.copper -= cost;
  let wasBroken = false;
  for (const slot of DURABILITY_SLOTS) {
    const payload = meta.equipmentInstance[slot];
    if (payload?.wear === undefined) continue;
    if (isBroken(ITEMS[meta.equipment[slot] ?? ''], payload.wear)) wasBroken = true;
    if (clearWear(payload)) delete meta.equipmentInstance[slot];
  }
  for (const s of meta.inventory) {
    if (s.instance?.wear === undefined) continue;
    if (clearWear(s.instance)) delete s.instance;
  }
  meta.wireRev++;
  if (wasBroken) {
    recalcPlayerStats(e, meta.cls, meta.equipment, ctx.playerMods(meta), meta.equipmentInstance);
  }
  ctx.notice(meta.entityId, NOTICE_REPAIRED);
  return true;
}
