// Player housing (Project H), phase 3: the owner-only `hst` self key (the
// pooled house storage, IWorldHousing.houseStorage), emitted through the
// caller's delta-eliding `maybe`. game.ts keeps a one-line call; the posture
// is documented HERE, beside the emission (the bank_wire.ts shape).
//
// `hst` is null unless the player stands inside their own house within reach
// of a placed storage chest (src/sim/housing/house_storage.ts nearHouseChest),
// so it rides the wire only for owners at a chest. REVISION-GATED like `bank`:
// houseStorageInfoFor clones the whole slot list, so the projection is built
// only when lastSent has no value, the anchor changed, or the sim revision
// (houseStorageWireRevFor: null away from a chest, PlayerMeta.houseStorageRev
// beside one, bumped by every deposit, withdrawal and chest placement change)
// moved. The proximity probe runs every snapshot (one instance lookup plus a
// walk of the claim's object ledger, bounded by the cottage's anchor count),
// so reach gained or lost re-emits at once. Keyed on the ANCHOR session, the
// posture every proximity-gated owner-only key shares.

import type { HouseStorageView } from '../src/world_api';

export interface HouseStorageSelfWireSim {
  houseStorageInfoFor(pid: number): HouseStorageView | null;
  houseStorageWireRevFor(pid: number): number | null;
}

export interface HouseStorageSelfWireSession {
  lastSent: Readonly<Record<string, string>>;
  lastHouseStorageWirePid: number | null;
  lastHouseStorageWireRev: number | null;
}

export function emitHouseStorageSelfKey(
  emit: (key: string, value: unknown) => void,
  sim: HouseStorageSelfWireSim,
  session: HouseStorageSelfWireSession,
  anchorPid: number,
): void {
  const rev = sim.houseStorageWireRevFor(anchorPid);
  if (
    session.lastSent.hst === undefined ||
    anchorPid !== session.lastHouseStorageWirePid ||
    rev !== session.lastHouseStorageWireRev
  ) {
    emit('hst', rev === null ? null : sim.houseStorageInfoFor(anchorPid));
    session.lastHouseStorageWirePid = anchorPid;
    session.lastHouseStorageWireRev = rev;
  }
}
