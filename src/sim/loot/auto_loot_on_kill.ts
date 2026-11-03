// Kill-time Auto Loot: an opted-in player's share of a fresh corpse goes
// straight into their bags the moment the corpse's loot is rolled, with no
// click. The preference is per-player SESSION state on PlayerMeta (the client
// re-pushes its stored "Auto Loot" option on every world entry and toggle, the
// stopAutoAttackOnTargetSwitch shape), never saved with the character.
//
// It takes EXACTLY what the current loot rules hand that player, and nothing a
// deliberate click would have had to decide:
// - Sole eligible looter (solo, or the only group member who shared the kill):
//   everything, coins and items, bind-on-pickup included (the classic auto
//   loot: nobody else could have wanted it).
// - In a group (two or more kill-time loot candidates):
//   - coins only under fair split (the split pays every candidate their share,
//     exactly as any member's manual loot does today); under looter-takes-all
//     the coin is first-come, so it stays for a click;
//   - a drop the master looter assigns stays on the corpse for them;
//   - a need/greed drop starts the EXISTING roll (nobody receives it until the
//     roll resolves; the winner's award is the existing grantOrHoldAwardedLoot
//     path, straight into their bags, and a loser never receives it);
//   - a round-robin drop only while the turn is THIS player's, and never a
//     bind-on-pickup one (that binds with no confirm, so it waits for a click);
//   - a looter-takes-all or open-to-all drop is first-come, so it stays.
// - A slot personal to the player (a quest drop they are eligible for) is
//   always theirs.
// Who: the kill-time loot recipients (the same participation rule loot rights
// use, judged at this kill) plus any player a personal slot names, living, not
// leaving, opted in, in entity-id order. A personal-slot recipient outside the
// recipient snapshot (a rare's damage contributor) must stand inside the party
// XP circle. Full bags leave the rest on the corpse with the one existing
// "Your bags are full." error for that corpse (one pass per player per kill).
//
// Determinism: with nobody opted in this returns before touching anything, so
// every existing trace is unchanged. With someone opted in it draws rng only
// through the existing loot paths (the fair-split remainder, a roll's own
// draws), in entity-id order.

import { ITEMS } from '../data';
import { corpseLootRights, lootCorpse } from '../interaction';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { dist2d, type Entity, type LootSlot, PARTY_XP_RANGE } from '../types';
import {
  corpseCurrencyStrategy,
  partyLootCandidatesForMob,
  roundRobinTurnPid,
  sharedLootRoute,
} from './loot_roll';

/** The per-player session flag behind the option (absent means off). */
export interface AutoLootPlayerState {
  autoLootOnKill?: boolean;
}

export function setAutoLootOnKill(ctx: SimContext, enabled: boolean, pid?: number): void {
  const r = ctx.resolve(pid);
  if (r) r.meta.autoLootOnKill = enabled === true;
}

function isSoulbound(itemId: string): boolean {
  return ITEMS[itemId]?.soulbound === true;
}

/** May this player's kill-time pass take this slot (one unit at a time)? */
function slotIsTheirs(
  ctx: SimContext,
  mob: Entity,
  meta: PlayerMeta,
  slot: LootSlot,
  grouped: boolean,
): boolean {
  if (!grouped) return true;
  if (slot.openToAll) return false;
  switch (sharedLootRoute(ctx, slot.itemId, mob)) {
    case 'need-greed':
      return true;
    case 'round-robin':
      return roundRobinTurnPid(ctx, mob) === meta.entityId && !isSoulbound(slot.itemId);
    default:
      return false;
  }
}

/** The players a fresh corpse auto-loots for, in entity-id order. */
function autoLooters(ctx: SimContext, mob: Entity): PlayerMeta[] {
  const recipients = new Set<number>(
    mob.lootRecipientIds && mob.lootRecipientIds.length > 0
      ? mob.lootRecipientIds
      : mob.tappedById !== null
        ? [mob.tappedById]
        : [],
  );
  const ids = new Set<number>(recipients);
  for (const s of mob.loot?.items ?? []) for (const id of s.personalFor ?? []) ids.add(id);
  const out: PlayerMeta[] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const meta = ctx.players.get(id);
    if (!meta?.autoLootOnKill || meta.leaving) continue;
    const e = ctx.entities.get(id);
    if (!e || e.dead || e.ghost) continue;
    if (!recipients.has(id) && dist2d(e.pos, mob.pos) > PARTY_XP_RANGE) continue;
    out.push(meta);
  }
  return out;
}

/** Allocation-free pre-check on the per-kill path: does ANY candidate opt in? */
function anyoneOptedIn(ctx: SimContext, mob: Entity): boolean {
  const ids = mob.lootRecipientIds;
  if (ids) for (const id of ids) if (ctx.players.get(id)?.autoLootOnKill) return true;
  if (mob.tappedById !== null && ctx.players.get(mob.tappedById)?.autoLootOnKill) return true;
  for (const s of mob.loot?.items ?? [])
    for (const id of s.personalFor ?? []) if (ctx.players.get(id)?.autoLootOnKill) return true;
  return false;
}

/** Called once per corpse right after its loot is rolled (combat/damage.ts). */
export function autoLootOnKill(ctx: SimContext, mob: Entity): void {
  if (!mob.lootable || !mob.loot || !anyoneOptedIn(ctx, mob)) return;
  const looters = autoLooters(ctx, mob);
  if (looters.length === 0) return;
  const grouped = partyLootCandidatesForMob(ctx, mob).length > 1;
  const groupCopper = !grouped || corpseCurrencyStrategy(ctx, mob) === 'fair-split';
  for (const meta of looters) {
    if (!mob.lootable || !mob.loot) return;
    // Never the FFA lapse: a fresh corpse is still owner-locked anyway.
    const rights = corpseLootRights(ctx, mob, meta.entityId, false);
    if (!rights.shared && !rights.personal && !rights.open) continue;
    // Range was judged by kill participation above, so the reach origin is the
    // corpse itself: the INTERACT_RANGE walk-up never applies to this pass.
    lootCorpse(ctx, mob.id, meta.entityId, false, false, mob.pos, {
      copper: groupCopper,
      slot: (s) => slotIsTheirs(ctx, mob, meta, s, grouped),
    });
  }
}
