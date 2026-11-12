import type { ReferralParticipant } from '../../../sim/referral_cards';
import { REFERRAL_MILESTONES, RETIRED_REFERRAL_MILESTONES } from '../../../sim/referral_cards';
import type { ReferralCardsSnapshot, ReferralLinkSnapshot } from './types';

// Retired slots (the Hollow Crypt's) keep their persisted bit, but nothing can
// earn them any more: they never gate a later stamp, mirroring the sim's redeem.
const RETIRED_BITS = REFERRAL_MILESTONES.reduce(
  (mask, m, i) => (RETIRED_REFERRAL_MILESTONES.has(m.id) ? mask | (1 << i) : mask),
  0,
);

export function referralStampRows(participant: ReferralParticipant) {
  return REFERRAL_MILESTONES.map((milestone, index) => {
    const bit = 1 << index;
    const redeemed = (participant.redeemed & bit) !== 0;
    const earned = (participant.credited & bit) !== 0;
    const required = (bit - 1) & ~RETIRED_BITS;
    return {
      ...milestone,
      index,
      redeemed,
      earned,
      // A retired slot nobody earned before it closed is not a goal any more.
      retired: (RETIRED_BITS & bit) !== 0 && !earned,
      redeemable: earned && !redeemed && (participant.redeemed & required) === required,
    };
  });
}

export function referralOwnParticipant(link: ReferralLinkSnapshot, accountId: number) {
  return link.card.participants.find((participant) => participant.accountId === accountId);
}

export function referralReadyCount(snapshot: ReferralCardsSnapshot | null): number {
  if (!snapshot) return 0;
  if (snapshot.readyCount !== undefined) return snapshot.readyCount;
  let count = 0;
  for (const link of snapshot.links) {
    const own = referralOwnParticipant(link, snapshot.accountId);
    if (!own || own.characterId !== snapshot.characterId) continue;
    count += referralStampRows(own).filter((stamp) => stamp.earned && !stamp.redeemed).length;
  }
  return count;
}

/** Stable presentation identity; a move cannot reuse a prior character's animation. */
export function referralStampKey(linkId: number, characterId: number, milestone: string): string {
  return `${linkId}:${characterId}:${milestone}`;
}

/** The next unfinished milestone per active card, including a dungeon catch-up. */
export function referralQuestRows(snapshot: ReferralCardsSnapshot | null) {
  if (!snapshot) return [];
  return snapshot.links.flatMap((link) => {
    const own = referralOwnParticipant(link, snapshot.accountId);
    if (link.card.status !== 'active' || own?.characterId !== snapshot.characterId) return [];
    const next = referralStampRows(own).find((stamp) => !stamp.earned && !stamp.retired);
    return next ? [{ linkId: link.card.linkId, friendName: link.friendName, ...next }] : [];
  });
}

export function referralQuestAdvances(snapshot: ReferralCardsSnapshot | null, questId: string) {
  return referralQuestRows(snapshot).some((row) => row.questId === questId);
}
