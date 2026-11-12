import { describe, expect, it } from 'vitest';
import { createReferralCard } from '../src/sim/referral_cards';
import {
  referralQuestAdvances,
  referralQuestRows,
  referralReadyCount,
  referralStampRows,
} from '../src/ui/hud/referral_cards/referral_cards_view';
import type { ReferralCardsSnapshot } from '../src/ui/hud/referral_cards/types';

describe('referral stamp presentation', () => {
  it('shows out-of-order credit but permits only the next ordered redemption', () => {
    const participant = createReferralCard(1, 10, 20).participants[0];
    participant.credited = 0b11110;
    const rows = referralStampRows(participant);
    expect(rows.map((row) => row.earned)).toEqual([false, true, true, true, true]);
    expect(rows.every((row) => !row.redeemable)).toBe(true);
    participant.credited |= 1;
    expect(
      referralStampRows(participant)
        .filter((row) => row.redeemable)
        .map((row) => row.id),
    ).toEqual(['tutorial']);
    participant.redeemed = 3;
    expect(
      referralStampRows(participant)
        .filter((row) => row.redeemable)
        .map((row) => row.id),
    ).toEqual(['fogbinder']);
  });

  it('counts only the viewing account and current character across multiple cards', () => {
    const card = createReferralCard(1, 10, 20);
    Object.assign(card.participants[0], { characterId: 100, credited: 7, redeemed: 1 });
    Object.assign(card.participants[1], { characterId: 200, credited: 31 });
    const snapshot: ReferralCardsSnapshot = {
      revision: 1,
      accountId: 10,
      characterId: 100,
      characterName: 'One',
      inviteUrl: null,
      links: [{ card, friendName: 'Two', canMove: false, summonRemainingSeconds: 0 }],
      completedFriends: 0,
      rewardedTiers: [],
      notices: [],
    };
    expect(referralReadyCount(snapshot)).toBe(2);
    expect(referralReadyCount({ ...snapshot, characterId: 101 })).toBe(0);
    expect(referralReadyCount({ ...snapshot, accountId: 20, characterId: 200 })).toBe(5);
    expect(referralReadyCount(null)).toBe(0);
    card.status = 'active';
    expect(referralQuestRows(snapshot).map((row) => row.id)).toEqual(['gravewyrm']);
    expect(referralQuestAdvances(snapshot, 'q_gravewyrm')).toBe(true);
    expect(referralQuestAdvances(snapshot, 'q_mistcaller')).toBe(false);
    expect(referralQuestRows({ ...snapshot, characterId: 101 })).toEqual([]);
    card.participants[0].credited = 31;
    expect(referralQuestRows(snapshot)).toEqual([]);
  });

  it('greys out the retired hollow slot and never makes it a goal or a gate', () => {
    const card = createReferralCard(1, 10, 20);
    card.status = 'active';
    const own = card.participants[0];
    Object.assign(own, { characterId: 100, credited: 0b00101, redeemed: 0b00001 });
    const rows = referralStampRows(own);
    expect(rows.map((row) => row.retired)).toEqual([false, true, false, false, false]);
    // The unearned hollow slot does not hold the Fogbinder stamp back.
    expect(rows.filter((row) => row.redeemable).map((row) => row.id)).toEqual(['fogbinder']);
    const snapshot: ReferralCardsSnapshot = {
      revision: 1,
      accountId: 10,
      characterId: 100,
      characterName: 'One',
      inviteUrl: null,
      links: [{ card, friendName: 'Two', canMove: false, summonRemainingSeconds: 0 }],
      completedFriends: 0,
      rewardedTiers: [],
      notices: [],
    };
    // The next goal skips the slot nothing can earn any more.
    own.credited = 0b00001;
    expect(referralQuestRows(snapshot).map((row) => row.id)).toEqual(['fogbinder']);
    // A hollow stamp earned before the retirement stays a live, claimable stamp.
    own.credited = 0b00011;
    const kept = referralStampRows(own);
    expect(kept[1]).toMatchObject({ id: 'hollow', retired: false, earned: true, redeemable: true });
  });
});
