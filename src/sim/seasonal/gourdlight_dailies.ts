// Gourdlight Eve's rotating dailies (the records: content/gourdlight_eve_dailies.ts).
//
// WHICH errand Hester offers is the realm's reset day, never a clock: the host feeds
// `ctx.resetDay` (the server's calendar online, the client's offline), its civil day
// number picks the pool entry, so every world on one realm day offers the same one and
// two days running never repeat. The other errands of the pool join the repeat-blocked
// set every host already shares (seasonal_quests.ts), so only the day's one is offered;
// an errand already in the log stays finishable after the day rolls.
//
// This module also owns the errands' world pieces (the stray patch pumpkins and the
// cursed candles, raised while the event runs under reserved ids that never touch the
// entity allocator or the rng). No rng anywhere here.

import { GOURDLIGHT_EVE_ID } from '../content/gourdlight_eve';
import {
  CURSED_CANDLE_ID,
  GOURDLIGHT_DAILY_POOL,
  PATCH_PUMPKIN_ID,
} from '../content/gourdlight_eve_dailies';
import { createGroundObject } from '../entity';
import { gourdlightDailySites } from '../seasonal_daily_sites';
import type { SimContext } from '../sim_context';
import { civilDayNumber } from '../world_quest_rotation';

// Reserved entity ids (the haunted pumpkins' scheme, haunted_pumpkins.ts -910000):
// negative, below every allocator id, one block per errand.
const PATCH_ENTITY_BASE = -912000;
const CANDLE_ENTITY_BASE = -913000;

/** The errand the pool offers on `resetDay` ('' or malformed: the first one). */
export function gourdlightDailyForDay(resetDay: string): string {
  const day = civilDayNumber(resetDay);
  const n = GOURDLIGHT_DAILY_POOL.length;
  const index = day === null ? 0 : ((day % n) + n) % n;
  return GOURDLIGHT_DAILY_POOL[index];
}

/** The errand open today: the /dev pick when one is set, else the day's. */
export function gourdlightDailyToday(resetDay: string, devDaily: string | null): string {
  return devDaily !== null && GOURDLIGHT_DAILY_POOL.includes(devDaily)
    ? devDaily
    : gourdlightDailyForDay(resetDay);
}

/** The pool's errands that are NOT today's (empty while the event is closed: its own
 *  close already blocks every one of them). */
export function offDayDailyQuestIds(
  activeEvent: string | null,
  resetDay: string,
  devDaily: string | null,
): readonly string[] {
  if (activeEvent !== GOURDLIGHT_EVE_ID) return [];
  const today = gourdlightDailyToday(resetDay, devDaily);
  return GOURDLIGHT_DAILY_POOL.filter((id) => id !== today);
}

function syncObjects(
  ctx: SimContext,
  active: boolean,
  base: number,
  itemId: string,
  name: string,
  sites: readonly { x: number; z: number; yaw: number }[],
): void {
  sites.forEach((site, i) => {
    const id = base - i;
    const existing = ctx.entities.get(id);
    if (!active) {
      if (existing?.objectItemId === itemId) ctx.dropEntity(id);
      return;
    }
    if (existing) return;
    const obj = createGroundObject(id, itemId, name, ctx.groundPos(site.x, site.z));
    obj.facing = site.yaw;
    obj.prevFacing = site.yaw;
    ctx.addEntity(obj);
  });
}

/** Raise the errands' world pieces when the event opens and clear them when it closes
 *  (called on the seasonal tick's open/close edge). */
export function updateGourdlightDailyObjects(ctx: SimContext, active: string | null): void {
  const open = active === GOURDLIGHT_EVE_ID;
  const sites = gourdlightDailySites(ctx.cfg.seed);
  syncObjects(ctx, open, PATCH_ENTITY_BASE, PATCH_PUMPKIN_ID, 'Patch Pumpkin', sites.patch);
  syncObjects(ctx, open, CANDLE_ENTITY_BASE, CURSED_CANDLE_ID, 'Cursed Candle Stub', sites.candles);
}
