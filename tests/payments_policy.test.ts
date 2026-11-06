// The Steam Wallet rule (src/payments_policy.ts): the desktop build never opens
// an external checkout, and a web build only with an explicit opt-in flag.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { externalPaymentsAllowed } from '../src/payments_policy';

describe('external payments policy', () => {
  it('the desktop (Steam) build never opens an external checkout, flag or not', () => {
    expect(externalPaymentsAllowed({ flag: '1', desktop: true })).toBe(false);
    expect(externalPaymentsAllowed({ flag: undefined, desktop: true })).toBe(false);
  });

  it('a web build is off unless built with VITE_EXTERNAL_PAYMENTS=1', () => {
    expect(externalPaymentsAllowed({ flag: undefined, desktop: false })).toBe(false);
    expect(externalPaymentsAllowed({ flag: '', desktop: false })).toBe(false);
    expect(externalPaymentsAllowed({ flag: 'true', desktop: false })).toBe(false);
    expect(externalPaymentsAllowed({ flag: '1', desktop: false })).toBe(true);
  });

  it('the Stripe checkout checks the policy before loading Stripe.js', () => {
    const src = readFileSync(new URL('../src/net/stripe_checkout.ts', import.meta.url), 'utf8');
    const gate = src.indexOf(
      "if (!externalPaymentsEnabled()) throw new Error('external_payments_disabled');",
    );
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(src.indexOf('await loadStripeScript();'));
  });
});
