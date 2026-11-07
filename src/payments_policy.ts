// Whether this build may open ANY payment flow that bypasses the Steam Wallet
// (the Stripe Embedded Checkout behind the Claudium store and the membership
// subscription, src/net/stripe_checkout.ts).
//
// Steam's review rules require in-game purchases in a Steam build to go
// through the Steam Wallet (Steam MicroTxn), so the desktop app NEVER opens an
// external checkout, whatever the build flags say. A web build opens one only
// when it was built with VITE_EXTERNAL_PAYMENTS=1; Wyndlewood ships none, so
// the default is off everywhere. Donation links were removed outright (no
// build config brings them back).
//
// Pure: callers pass the two inputs; externalPaymentsEnabled() reads the live
// build env.

import { isDesktopAppRuntime } from './runtime';

export interface PaymentsPolicyInputs {
  /** The VITE_EXTERNAL_PAYMENTS build flag ('1' opts a WEB build in). */
  flag: unknown;
  /** True inside the desktop (Steam) shell. */
  desktop: boolean;
}

export function externalPaymentsAllowed(inputs: PaymentsPolicyInputs): boolean {
  if (inputs.desktop) return false;
  return String(inputs.flag ?? '').trim() === '1';
}

/** The live build's answer. */
export function externalPaymentsEnabled(): boolean {
  return externalPaymentsAllowed({
    flag: import.meta.env.VITE_EXTERNAL_PAYMENTS,
    desktop: isDesktopAppRuntime(),
  });
}
