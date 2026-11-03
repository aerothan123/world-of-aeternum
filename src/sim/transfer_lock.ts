// The one per-copy transfer-lock predicate, as its own dependency-free leaf:
// item_instance_transfer.ts re-exports it for the exchange pipes (World
// Market, Ravenpost, guild bank). Kept a leaf so any consumer can share the
// exact rule without inheriting the transfer module's runtime import graph
// (which reaches the whole content tree through the sanitize-on-load helpers).
import type { ItemInstancePayload } from './types';

/** True when this copy is locked out of the anonymous exchange pipes (market
 *  listing, mail attachment): armed (bindOnTrade) or bound (boundTo). The
 *  def-level rules (soulbound/quest/noMarketList) stay with each pipe; this is
 *  only the per-copy lock. A plain copy is never locked. NOT the same axis as
 *  the PLAYER item lock (item_lock_flag.ts `locked`, issue 3042): that one is
 *  the owner's own salvage/craft/vendor safety mark, not consulted by the
 *  gold market, Ravenpost, or the guild bank. */
export function isTransferLockedInstance(instance: ItemInstancePayload | undefined): boolean {
  return (
    instance !== undefined && (instance.bindOnTrade === true || instance.boundTo !== undefined)
  );
}
