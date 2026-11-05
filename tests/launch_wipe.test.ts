// The launch wipe's pure policy (server/launch_wipe_core.ts): what a wiped
// character keeps, the dry-run plan, and the confirmation phrase.
import { describe, expect, it } from 'vitest';
import { initialCharacterState } from '../server/character_newborn';
import {
  planLaunchWipe,
  WIPE_BLOCKERS,
  WIPE_KEEP_KEYS,
  WIPE_REALM_CLEARS,
  wipeBankState,
  wipeCharacterState,
  wipeConfirmationPhrase,
} from '../server/launch_wipe_core';

const veteran = {
  level: 20,
  xp: 999,
  copper: 123456,
  inventory: [{ id: 'epic_blade' }],
  bank: { slots: ['x'] },
  questsDone: ['q1', 'q2'],
  professions: { smithing: 300 },
  house: { plot: 4 },
  deeds: { first_blood: '2026-10-01', dragon_slayer: '2026-10-20' },
  deedStats: { kills: 4000 },
  renown: 75,
  activeTitle: 'the Dauntless',
  activeBorder: 'gilded',
  reliquary: { pages: ['wyrm_fang'] },
  skin: 3,
  skinCatalog: 'stylized',
  mountSkinId: 'ember_saddle',
  helmHidden: true,
  buddies: { owned: ['moth'] },
  totalPlayedSeconds: 360000,
};

describe('wipeCharacterState', () => {
  it('keeps the Book of Deeds and cosmetics, resets everything else to the newborn', () => {
    const fresh = initialCharacterState('warrior', 'Veteran', 3) as unknown as Record<
      string,
      unknown
    >;
    const next = wipeCharacterState(veteran, fresh);
    expect(next.level).toBe(1);
    expect(next.copper).toBe(fresh.copper);
    expect(next.inventory).toEqual(fresh.inventory);
    expect(next.questsDone).toEqual(fresh.questsDone);
    expect(next.house).toEqual(fresh.house);
    expect(next.pos).toEqual(fresh.pos);
    for (const key of WIPE_KEEP_KEYS) {
      if (key in veteran) expect(next[key], key).toEqual((veteran as Record<string, unknown>)[key]);
    }
  });

  it('never adds a kept key the old save did not have', () => {
    const next = wipeCharacterState({ level: 9 }, { level: 1, copper: 0 });
    expect(next).toEqual({ level: 1, copper: 0 });
    expect(wipeCharacterState(null, { level: 1 })).toEqual({ level: 1 });
  });

  it('the kept list is the owner policy: deeds and cosmetics only, never power', () => {
    expect([...WIPE_KEEP_KEYS]).toEqual([
      'deeds',
      'deedStats',
      'renown',
      'unlockedMilestones',
      'activeTitle',
      'activeBorder',
      'reliquary',
      'skin',
      'skinCatalog',
      'mountSkinId',
      'helmHidden',
      'weaponStowed',
      'buddies',
      'totalPlayedSeconds',
    ]);
    for (const power of ['level', 'xp', 'copper', 'inventory', 'equipment', 'bank', 'talents']) {
      expect(WIPE_KEEP_KEYS as readonly string[]).not.toContain(power);
    }
  });
});

describe('planLaunchWipe', () => {
  it('reports counts and the exact confirmation phrase', () => {
    const plan = planLaunchWipe('Wyndlewood', [
      { id: 1, name: 'A', cls: 'warrior', level: 20, state: veteran },
      { id: 2, name: 'B', cls: 'mage', level: 1, state: { level: 1 } },
    ]);
    expect(plan.characters).toBe(2);
    expect(plan.levelsReset).toBe(1);
    expect(plan.withDeeds).toBe(1);
    expect(plan.keptKeyCounts.deeds).toBe(1);
    expect(plan.realmClears).toBe(WIPE_REALM_CLEARS);
    expect(plan.confirmation).toBe('WIPE Wyndlewood 2 CHARACTERS');
    expect(wipeConfirmationPhrase('x', 0)).toBe('WIPE x 0 CHARACTERS');
  });
});

describe('wipeBankState: paid capacity is an entitlement, not progress', () => {
  const fresh = { inventory: [], purchasedSlots: 0, bonusSlots: 0 };
  const paidBank = {
    inventory: [{ id: 'gold_bar', count: 9 }],
    purchasedSlots: 24,
    bonusSlots: 6,
    appliedStorageKeys: ['k1', 'k2'],
  };

  it('keeps exactly the receipt-proven paid slots and the applied keys, drops the items', () => {
    expect(wipeBankState(paidBank, fresh, 12)).toEqual({
      inventory: [],
      purchasedSlots: 12,
      bonusSlots: 0,
      appliedStorageKeys: ['k1', 'k2'],
    });
  });

  it('keeps the whole purchasedSlots when a receipt cannot say (never takes paid capacity)', () => {
    expect(wipeBankState(paidBank, fresh, null)).toMatchObject({ purchasedSlots: 24 });
  });

  it('never grants more than the old bank had, and lands on a ladder rung', () => {
    expect(wipeBankState(paidBank, fresh, 99)).toMatchObject({ purchasedSlots: 24 });
    expect(wipeBankState(paidBank, fresh, 13)).toMatchObject({ purchasedSlots: 12 });
  });

  it('a bank with no paid grant resets to the fresh bank (gold rungs are progress)', () => {
    expect(wipeBankState({ purchasedSlots: 18, inventory: [] }, fresh, null)).toBe(fresh);
    expect(wipeBankState(undefined, fresh, null)).toBe(fresh);
  });

  it('wipeCharacterState carries the paid bank through the full reset', () => {
    const next = wipeCharacterState({ level: 30, bank: paidBank }, { level: 1, bank: fresh }, 6);
    expect(next.bank).toMatchObject({ purchasedSlots: 6, appliedStorageKeys: ['k1', 'k2'] });
    expect((next.bank as { inventory: unknown[] }).inventory).toEqual([]);
  });

  it('lists every in-flight paid obligation that refuses a real wipe', () => {
    expect(WIPE_BLOCKERS).toContain('woc_market unfinished settlements');
    expect(WIPE_BLOCKERS).toContain('referral bond deliveries in flight');
    expect(WIPE_BLOCKERS).toContain('storage purchases pending or unresolved');
    expect(WIPE_REALM_CLEARS).toContain('account_houses (when present)');
  });
});
