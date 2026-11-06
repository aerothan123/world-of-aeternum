// Life-skill per-character state: the runtime-only fatigue
// (./life_skill_xp.ts) and the PERSISTED daily standing ledger behind the
// daily caps (./standing_seam.ts). A pure leaf: no SimContext, no rng, no
// clock beyond the host's reset-day key passed in.
//
// Persisted shape (CharacterState.lifeSkillStanding): { day, earned } where
// `day` is the realm reset-day key the counts belong to and `earned` maps an
// activity id to the standing earned that day. Absent until the first grant,
// so every other save stays byte-equal (zero-default omission). A ledger
// whose day is not today's reads as empty; nothing is ever lost by that, it
// only re-opens the cap.

import type { LifeSkillFatigue } from './life_skill_xp';

export interface LifeSkillStandingLedger {
  day: string;
  earned: Record<string, number>;
}

/** The fields PlayerMeta carries for life skills (joined through
 *  character_storage.ts CharacterVaultStorageState). */
export interface LifeSkillPlayerState {
  /** Runtime-only anti-bot fatigue. Never persisted. */
  lifeSkillFatigue?: LifeSkillFatigue;
  /** The persisted daily standing ledger. */
  lifeSkillStanding?: LifeSkillStandingLedger;
}

/** Standing still allowed today for an activity under its cap. A host with
 *  no calendar (resetDay '') keeps one open-ended ledger, so the cap still
 *  bounds a session. */
export function lifeSkillDailyRoom(
  holder: LifeSkillPlayerState,
  activity: string,
  dailyCap: number,
  resetDay: string,
): number {
  const ledger = holder.lifeSkillStanding;
  const earned = ledger && ledger.day === resetDay ? (ledger.earned[activity] ?? 0) : 0;
  return Math.max(0, dailyCap - earned);
}

export function recordLifeSkillStanding(
  holder: LifeSkillPlayerState,
  activity: string,
  gained: number,
  resetDay: string,
): void {
  if (!holder.lifeSkillStanding || holder.lifeSkillStanding.day !== resetDay) {
    holder.lifeSkillStanding = { day: resetDay, earned: {} };
  }
  const earned = holder.lifeSkillStanding.earned;
  earned[activity] = (earned[activity] ?? 0) + gained;
}

/** The one load path: a record with a string day and finite non-negative
 *  counts; anything else loads as no ledger. */
export function sanitizeLifeSkillStanding(raw: unknown): LifeSkillStandingLedger | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as { day?: unknown; earned?: unknown };
  if (typeof r.day !== 'string' || r.day.length > 32) return undefined;
  const earned: Record<string, number> = {};
  if (r.earned !== null && typeof r.earned === 'object') {
    for (const [k, v] of Object.entries(r.earned as Record<string, unknown>)) {
      if (k.length <= 32 && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        earned[k] = Math.floor(v);
      }
    }
  }
  return { day: r.day, earned };
}

/** The saved form, or undefined when there is nothing worth saving. */
export function savedLifeSkillStanding(
  ledger: LifeSkillStandingLedger | undefined,
): LifeSkillStandingLedger | undefined {
  if (!ledger || Object.keys(ledger.earned).length === 0) return undefined;
  return { day: ledger.day, earned: { ...ledger.earned } };
}
