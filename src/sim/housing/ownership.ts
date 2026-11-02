// Player housing (Project H), phase 1: buying a house and the owner-only door.
// A system module behind the SimContext seam: functions only, state on
// PlayerMeta (housing/house_state.ts HousingPlayerState). Draws NO rng and reads
// no clock beyond ctx.time (the offer throttle) and ctx.resetDay (recorded on
// purchase for the upkeep phase).
//
// Every outcome is a personal, text-free SimEvent (houseOffer / housePurchased
// / houseDenied); the client localizes from the ids.

import { type HouseLotDef, houseLotById, houseLotForDungeon } from '../content/house_lots';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { dist2d, type Entity } from '../types';

/** How close to a lot's door a purchase must be made (yards). Generous next to
 *  the 2yd walk-in trigger, so the prompt the door raised can still be
 *  accepted after the buyer steps back out of the trigger. */
export const HOUSE_PURCHASE_RANGE = 10;

/** Seconds between door prompts for a player standing in a lot's trigger. */
export const HOUSE_OFFER_NOTICE_SECONDS = 4;

/** The client-facing view of a player's own house (IWorld myHouse). */
export interface HouseView {
  lotId: string;
}

/** The instance key a house owner's private copy claims: keyed on the OWNER,
 *  never the party, so grouping never redirects anyone into another copy.
 *  The durable character id when the host supplies one (relogs rejoin the same
 *  copy), else the entity id (offline and headless hosts). */
export function houseInstanceKey(meta: PlayerMeta): string {
  return meta.characterId !== undefined
    ? `house:char:${meta.characterId}`
    : `house:pid:${meta.entityId}`;
}

/**
 * The house-lot arm of the dungeon door (instances/dungeons.ts enterDungeon):
 * `undefined` when `dungeonId` is not a house lot (the caller runs the normal
 * dungeon rules); the owner's instance key when they may enter; `null` when the
 * door refuses. A refusal to a living non-owner raises the purchase prompt,
 * throttled because the walk-in trigger fires every tick. A released spirit is
 * refused silently: a house is never a place to resurrect.
 */
export function houseEntryKey(
  ctx: SimContext,
  meta: PlayerMeta,
  e: Entity,
  dungeonId: string,
  preflightOnly: boolean,
): string | null | undefined {
  const lot = houseLotForDungeon(dungeonId);
  if (!lot) return undefined;
  if (e.ghost) return null;
  if (meta.house?.lot === lot.id) return houseInstanceKey(meta);
  if (preflightOnly) return null;
  if (ctx.time >= (meta.houseOfferAt ?? -Infinity) + HOUSE_OFFER_NOTICE_SECONDS) {
    meta.houseOfferAt = ctx.time;
    ctx.emit({
      type: 'houseOffer',
      pid: meta.entityId,
      lotId: lot.id,
      priceCopper: lot.priceCopper,
      ...(meta.house ? { ownedLotId: meta.house.lot } : {}),
    });
  }
  return null;
}

function deny(
  ctx: SimContext,
  pid: number,
  lotId: string,
  reason: 'bad_lot' | 'owned' | 'range' | 'money' | 'dead',
): false {
  ctx.emit({ type: 'houseDenied', pid, lotId, reason });
  return false;
}

/**
 * Buy the house on `lotId` for the calling player. Server-authoritative: the
 * lot must exist, the buyer must be alive, own no house yet, stand within
 * HOUSE_PURCHASE_RANGE of its door and carry the price. Returns whether the
 * purchase went through.
 */
export function buyHouse(ctx: SimContext, lotId: string, pid?: number): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  const id = r.meta.entityId;
  const lot: HouseLotDef | undefined = houseLotById(lotId);
  if (!lot) return deny(ctx, id, lotId, 'bad_lot');
  if (r.e.dead || r.e.ghost) return deny(ctx, id, lotId, 'dead');
  if (r.meta.house) return deny(ctx, id, lotId, 'owned');
  const door = { x: lot.doorPos.x, y: r.e.pos.y, z: lot.doorPos.z };
  if (dist2d(r.e.pos, door) > HOUSE_PURCHASE_RANGE) return deny(ctx, id, lotId, 'range');
  if (r.meta.copper < lot.priceCopper) return deny(ctx, id, lotId, 'money');
  r.meta.copper -= lot.priceCopper;
  r.meta.house = { lot: lot.id, boughtDay: ctx.resetDay };
  ctx.emit({ type: 'housePurchased', pid: id, lotId: lot.id });
  return true;
}

/** The player's own house view (IWorld myHouse), or null. */
export function houseViewFor(meta: PlayerMeta | undefined): HouseView | null {
  return meta?.house ? { lotId: meta.house.lot } : null;
}
