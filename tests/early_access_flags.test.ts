// Early Access monetization switches (src/early_access_flags.ts): membership and
// the Claudium store are OFF unless a realm or build turns them on with '1'.
// Nothing stored is touched; these pin the gates, not any data migration.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { claudiumPathEnabled } from '../server/claudium';
import { gateMembershipService } from '../server/membership_service';
import {
  CLAUDIUM_ENABLED,
  MEMBERSHIP_ENABLED,
  parseEarlyAccessFlags,
} from '../src/early_access_flags';
import { MEMBERSHIP_OFF, membershipCharacterLocked } from '../src/membership_contract';
import { membershipSlotsHtml } from '../src/ui/character_membership_view';

describe('early access flags', () => {
  it('default off; only the literal 1 turns a switch on', () => {
    expect(parseEarlyAccessFlags({})).toEqual({ membership: false, claudium: false });
    expect(parseEarlyAccessFlags({ MEMBERSHIP_ENABLED: 'true', CLAUDIUM_ENABLED: '0' })).toEqual({
      membership: false,
      claudium: false,
    });
    expect(
      parseEarlyAccessFlags({ VITE_MEMBERSHIP_ENABLED: '1', VITE_CLAUDIUM_ENABLED: '1' }, 'VITE_'),
    ).toEqual({ membership: true, claudium: true });
    // The suite runs with both switched on (vite.config.ts test env) so the
    // inherited membership and store suites keep testing those systems; a
    // Steam build sets neither and reads false here.
    expect(MEMBERSHIP_ENABLED).toBe(import.meta.env.VITE_MEMBERSHIP_ENABLED === '1');
    expect(CLAUDIUM_ENABLED).toBe(import.meta.env.VITE_CLAUDIUM_ENABLED === '1');
  });
});

describe('membership switched off (realm default)', () => {
  it('every account reads as a non-member without touching storage', async () => {
    let reads = 0;
    const active = { active: true, expiresAt: Date.now() + 1e9, authorizedUntil: Date.now() + 1e9, recurringExpiresAt: null };
    const inner = {
      get: async () => {
        reads++;
        return active;
      },
      getBatch: async (ids: readonly number[]) => {
        reads++;
        return new Map(ids.map((id) => [id, active] as const));
      },
    };
    const off = gateMembershipService(inner, false);
    const m = await off.get(123);
    expect(m.active).toBe(false);
    expect(m.authorizedUntil).toBe(0);
    const batch = await off.getBatch([1, 2]);
    expect([...batch.values()].every((v) => !v.active)).toBe(true);
    expect(reads).toBe(0);
    expect((await gateMembershipService(inner, true).get(1)).active).toBe(true);
  });

  it('a membership-slot character stays playable while membership is off', () => {
    expect(membershipCharacterLocked(true, MEMBERSHIP_OFF, Date.now())).toBe(true);
    expect(membershipCharacterLocked(true, MEMBERSHIP_OFF, Date.now(), false)).toBe(false);
  });

  it('the character list offers no membership slots', () => {
    expect(membershipSlotsHtml([{ membershipSlot: false }], false, false)).toBe('');
    expect(membershipSlotsHtml([{ membershipSlot: false }], false, true)).not.toBe('');
  });
});

const OFF = parseEarlyAccessFlags({});

describe('Claudium switched off (realm and build default)', () => {
  it('no /api/claudium path is reachable', () => {
    for (const path of [
      '/api/claudium/balance',
      '/api/claudium/store',
      '/api/claudium/purchase',
      '/api/claudium/subscription/checkout',
      '/api/claudium/membership-token',
      '/api/claudium/stripe/webhook',
    ]) {
      expect(claudiumPathEnabled(path, OFF), path).toBe(false);
    }
    // Store on, membership off: the store answers, the membership offers do not.
    const storeOnly = { membership: false, claudium: true };
    expect(claudiumPathEnabled('/api/claudium/balance', storeOnly)).toBe(true);
    expect(claudiumPathEnabled('/api/claudium/subscription/checkout', storeOnly)).toBe(false);
    expect(claudiumPathEnabled('/api/claudium/membership-token', storeOnly)).toBe(false);
  });

  it('the client entry never statically imports the store or its economy SDK', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).not.toMatch(/from '\.\/net\/economy_sdk'/);
    expect(main).not.toMatch(/from '\.\/net\/claudium_store_wiring'/);
    expect(main).not.toMatch(/from '\.\/net\/stripe_checkout'/);
    expect(main).toMatch(/CLAUDIUM_ENABLED && !NATIVE_APP/);
    expect(main).toMatch(/import\('\.\/net\/claudium_store_wiring'\)/);
  });
});
