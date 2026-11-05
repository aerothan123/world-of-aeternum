// Character riding progression, shared by movement, persistence, and vendor previews.
//
// The ladder (Wyndlewood, owner decision 2026-11: a slower first mount before
// the cap, because the world is larger):
//   0 untrained
//   3 Apprentice Riding: level 10, +40% (APPRENTICE_RIDING_TIER)
//   1 Riding: level 20, +70% (the shipped basic rank, unchanged)
//   2 Advanced Riding: level 20, +110% (unchanged)
// The tier VALUES are persisted (CharacterState.ridingTier) and never renumbered,
// so the apprentice rank takes the new value 3 and every rank comparison goes
// through ridingRankOrder, never through `<` on the raw value.
export type RidingTier = 0 | 1 | 2 | 3;
/** The apprentice rank's persisted tier value (ranks below Riding, see above). */
export const APPRENTICE_RIDING_TIER = 3;
/** Apprentice Riding: 2 gold at level 10. With the 10 gold stable horse it is a
 *  12 gold goal, against roughly 3 gold of quest copper (plus drops and vendor
 *  sales) earned by level 10 on the shipped Eastbrook and Mirefen quests. */
export const APPRENTICE_RIDING_FEE_COPPER = 20_000;
export const BASIC_RIDING_FEE_COPPER = 800_000;
export const ADVANCED_RIDING_FEE_COPPER = 10_000_000;
/** The level each rank is taught at. */
export const APPRENTICE_RIDING_MIN_LEVEL = 10;
export const RIDING_MIN_LEVEL = 20;

/** Rank order for comparisons: untrained, apprentice, riding, advanced. */
export function ridingRankOrder(tier: number): number {
  return tier === APPRENTICE_RIDING_TIER ? 1 : tier === 1 ? 2 : tier === 2 ? 3 : 0;
}

/** Whether this tier may summon and ride a mount (any rank above untrained). */
export function ridingTierCanRide(tier: number): boolean {
  return ridingRankOrder(tier) > 0;
}

/** Whether the character may summon and ride (apprentice or better). The legacy
 *  ridingTrained flag still means the level 20 Riding rank. */
export function canRide(
  state: { ridingTier?: number; ridingTrained?: boolean } | undefined,
): boolean {
  return ridingTierCanRide(ridingTrainingTier(state));
}

/** The rank the next purchase teaches from `tier`, or null when fully trained. */
export function nextRidingTier(tier: RidingTier): RidingTier | null {
  return tier === 0
    ? APPRENTICE_RIDING_TIER
    : tier === APPRENTICE_RIDING_TIER
      ? 1
      : tier === 1
        ? 2
        : null;
}

/** The tier a player holds when the row teaching `rank` is offered (the
 *  inverse of nextRidingTier), sent back as the purchase's stale-quote guard. */
export function ridingTierBefore(rank: 1 | 2 | 3): 0 | 1 | 3 {
  return rank === APPRENTICE_RIDING_TIER ? 0 : rank === 1 ? APPRENTICE_RIDING_TIER : 1;
}

/** The level the next rank from `tier` requires. */
export function ridingTrainingMinLevel(tier: RidingTier): number {
  return tier === 0 ? APPRENTICE_RIDING_MIN_LEVEL : RIDING_MIN_LEVEL;
}

export function ridingTrainingTier(
  state:
    | {
        ridingTier?: number;
        ridingTrained?: boolean;
      }
    | undefined,
): RidingTier {
  if (state?.ridingTier === 2) return 2;
  if (state?.ridingTier === 1 || state?.ridingTrained === true) return 1;
  return state?.ridingTier === APPRENTICE_RIDING_TIER ? APPRENTICE_RIDING_TIER : 0;
}

/** The fee for the NEXT rank from `tier` (0 when fully trained). */
export function ridingTrainingFee(tier: RidingTier): number {
  if (tier === 0) return APPRENTICE_RIDING_FEE_COPPER;
  if (tier === APPRENTICE_RIDING_TIER) return BASIC_RIDING_FEE_COPPER;
  return tier === 1 ? ADVANCED_RIDING_FEE_COPPER : 0;
}

// Mounted speed bonus by rank. An untrained lesson participant uses the basic
// lesson horse's speed. The apprentice +40% is the classic early travel speed
// (the classic druid Travel Form and shaman Ghost Wolf), below the +70% rank.
export function ridingMoveSpeedPct(tier: number): number {
  if (tier === APPRENTICE_RIDING_TIER) return 0.4;
  return tier === 2 ? 1.1 : 0.7;
}

/** The persisted riding fields (zero-default omission: an untrained save is
 *  byte-equal to before). Riding keeps its legacy ridingTrained flag; the
 *  apprentice and advanced ranks persist their tier value. */
export function savedRidingFields(meta: { ridingTrained?: boolean; ridingTier?: 1 | 2 | 3 }): {
  ridingTrained?: true;
  ridingTier?: 2 | 3;
} {
  return {
    ...(meta.ridingTrained ? { ridingTrained: true as const } : {}),
    ...(meta.ridingTier === 2 || meta.ridingTier === APPRENTICE_RIDING_TIER
      ? { ridingTier: meta.ridingTier }
      : {}),
  };
}

export function restoreRidingTraining(
  meta: {
    ridingTier?: 1 | 2 | 3;
    ridingTrained?: boolean;
    mountTrainingFeePaid?: boolean;
    questLog: ReadonlyMap<string, unknown>;
    questsDone: ReadonlySet<string>;
  },
  saved: { ridingTier?: number; ridingTrained?: boolean; mountTrainingFeePaid?: boolean },
): RidingTier {
  if (saved.mountTrainingFeePaid === true) meta.mountTrainingFeePaid = true;
  // Old fee payments and accepted/completed lessons prove that basic training was purchased.
  if (
    saved.ridingTrained === true ||
    saved.mountTrainingFeePaid === true ||
    meta.questLog.has('q_riding_lessons') ||
    meta.questsDone.has('q_riding_lessons')
  )
    meta.ridingTrained = true;
  if (saved.ridingTier === 1 || saved.ridingTier === 2) {
    meta.ridingTier = saved.ridingTier;
    meta.ridingTrained = true;
  } else if (saved.ridingTier === APPRENTICE_RIDING_TIER && !meta.ridingTrained) {
    // Apprentice only: a save that also proves Riding loads as Riding.
    meta.ridingTier = APPRENTICE_RIDING_TIER;
  }
  return ridingTrainingTier(meta);
}

/** Character progression and transient host ownership authority. */
export interface RidingPlayerState {
  // Legacy 100g lesson payment, preserved for basic riding grandfathering.
  mountTrainingFeePaid?: boolean;
  // Basic riding legacy flag; advanced progression adds ridingTier, and the
  // level 10 apprentice rank is ridingTier 3 without ridingTrained.
  ridingTrained?: boolean;
  ridingTier?: 1 | 2 | 3;
  // Host-supplied collectible ownership from this account's other characters.
  accountMountSkinIds?: readonly string[];
  // False until a successful complete account item projection has arrived.
  accountMountItemsHydrated?: boolean;
}
