// Player housing (Project H), phase 1: buying a house and the owner-only door.
// A system module behind the SimContext seam: functions only, state on
// PlayerMeta (housing/house_state.ts HousingPlayerState). Draws NO rng and reads
// no clock beyond ctx.time (the offer throttle) and ctx.resetDay (recorded on
// purchase for the upkeep phase).
//
// Every outcome is a personal, text-free SimEvent (houseOffer / housePurchased
// / houseDenied); the client localizes from the ids.

import { type HouseLotDef, houseLotById, houseLotForDungeon } from '../content/house_lots';
import { FURNISHING_STARTER_RECIPE_IDS } from '../content/recipes';
import { recordFactionActivityOnce } from '../faction_activity';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { DT, dist2d, type Entity } from '../types';
import type { HousingPlayerState } from './house_state';

/** How close to a lot's door a purchase must be made (yards). Generous next to
 *  the 2yd walk-in trigger, so the prompt the door raised can still be
 *  accepted after the buyer steps back out of the trigger. */
export const HOUSE_PURCHASE_RANGE = 10;

/** The floor between two door prompts to the same player (seconds): a buyer
 *  oscillating on the trigger's edge is offered at most this often. The
 *  per-approach rule below is what actually silences a player who stands in
 *  the trigger. */
export const HOUSE_OFFER_NOTICE_SECONDS = 4;

/** The walk-in trigger fires every tick a player stands in it; a stand whose
 *  last trigger tick is older than this gap (seconds) has been broken, so the
 *  next trigger tick is a fresh approach. One tick plus slack. */
const HOUSE_DOOR_STAND_GAP_SECONDS = DT * 1.5;

/**
 * Whether this trigger tick owes the player a purchase prompt, and records
 * the tick as the player's current stand at this lot's door either way. A
 * prompt is owed ONCE per approach: the first trigger tick after the player
 * was NOT standing in this lot's trigger on the previous tick (they walked
 * in, or came back after leaving), never while the stand continues (the
 * reported bug: a 20 Hz trigger re-prompting the same standing player), and
 * never inside HOUSE_OFFER_NOTICE_SECONDS of the last prompt.
 */
export function houseOfferDue(meta: HousingPlayerState, lotId: string, time: number): boolean {
  const stand = meta.houseDoorStand;
  const standing =
    stand !== undefined && stand.lotId === lotId && time - stand.at <= HOUSE_DOOR_STAND_GAP_SECONDS;
  meta.houseDoorStand = { lotId, at: time };
  if (standing) return false;
  if (time < (meta.houseOfferAt ?? -Infinity) + HOUSE_OFFER_NOTICE_SECONDS) return false;
  meta.houseOfferAt = time;
  return true;
}

/** The client-facing view of a player's own house (IWorld myHouse). */
export interface HouseView {
  lotId: string;
  /** Placed furniture: anchor id to furniture item id (a boundary copy). */
  furniture: Record<string, string>;
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
 * once per approach (houseOfferDue, since the walk-in trigger fires every
 * tick). A released spirit is refused silently: a house is never a place to
 * resurrect. `devBypass` (the dev-command door bypass, never in production)
 * admits a tester into their own copy of any lot as if they owned it.
 */
export function houseEntryKey(
  ctx: SimContext,
  meta: PlayerMeta,
  e: Entity,
  dungeonId: string,
  preflightOnly: boolean,
  devBypass = false,
): string | null | undefined {
  const lot = houseLotForDungeon(dungeonId);
  if (!lot) return undefined;
  if (e.ghost) return null;
  if (meta.house?.lot === lot.id || devBypass) return houseInstanceKey(meta);
  if (preflightOnly) return null;
  if (houseOfferDue(meta, lot.id, ctx.time)) {
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
  r.meta.house = { lot: lot.id, boughtDay: ctx.resetDay, furniture: {}, storage: [] };
  // Phase 2: a new owner knows the two starter Furnishing recipes outright
  // (the rest are taught at the toolworks), so the house is furnishable from
  // the day it is bought. Idempotent: knownRecipes is a set.
  for (const recipeId of FURNISHING_STARTER_RECIPE_IDS) r.meta.knownRecipes.add(recipeId);
  ctx.emit({ type: 'housePurchased', pid: id, lotId: lot.id });
  // Hearthwright Compact standing for founding a household, once per
  // character (faction_activity.ts; a resale and rebuy never pays again).
  recordFactionActivityOnce(ctx, r.meta, 'house_founded', 'first_house', null);
  return true;
}

/** The player's own house view (IWorld myHouse), or null. The furniture map is
 *  a boundary copy, so a caller can never write through to the live record. */
export function houseViewFor(meta: PlayerMeta | undefined): HouseView | null {
  return meta?.house ? { lotId: meta.house.lot, furniture: { ...meta.house.furniture } } : null;
}
