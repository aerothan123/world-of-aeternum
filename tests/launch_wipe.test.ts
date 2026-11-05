// The launch wipe's pure policy (server/launch_wipe_core.ts): what a wiped
// character keeps, the dry-run plan, and the confirmation phrase.
import { describe, expect, it } from 'vitest';
import { initialCharacterState } from '../server/character_newborn';
import {
  planLaunchWipe,
  WIPE_KEEP_KEYS,
  WIPE_REALM_CLEARS,
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
