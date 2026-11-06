// Wyndlewood ships no non-Steam payment or donation link (owner decision for
// the Steam Early Access launch: Steam build review fails a game that sends
// players to an outside payment page, and in-game purchases go through the
// Steam Wallet only). This suite is the grep evidence over every shipping
// surface: the client source (HUD, menus, guide), the static and landing
// pages, the desktop shell, and the legal pages.
//
// The one payment host that may still be NAMED is Stripe, and only in the
// files that gate it off or validate its links: the embedded checkout (src/net/stripe_checkout.ts,
// refused by src/payments_policy.ts in the desktop build) and the desktop
// shell CSP (electron/shell_guards.cjs, allowed only under the cardCheckout
// build stamp). Both gates are pinned in tests/payments_policy.test.ts and the
// electron shell tests; this suite pins that no other file names Stripe.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.join(__dirname, '..');

/** Donation, tip-jar and off-platform checkout hosts no shipping file may name. */
const PAYMENT_HOST_RE =
  /\b(?:ko-fi\.com|kofi\.com|patreon\.com|paypal\.com|paypal\.me|buymeacoffee\.com|buymeacoff\.ee|liberapay\.com|opencollective\.com|github\.com\/sponsors|gumroad\.com|venmo\.com|cash\.app|streamlabs\.com|streamelements\.com|tipeee\.com|donorbox\.org|givebutter\.com|square\.link|checkout\.square\.site|paddle\.com|lemonsqueezy\.com|fourthwall\.com|teespring\.com|spri\.ng|xsolla\.com|tebex\.io)\b/i;

/** A donate call to action wired as a link, whatever host it points at. */
const DONATE_LINK_RE = /<a\b[^>]*\b(?:donate|donation|tip-jar|support-us)\b[^>]*>/i;

const STRIPE_HOST_RE = /\b[a-z0-9.-]*stripe\.com\b|\blink\.com\b/i;
// src/subscription_contract.ts only VALIDATES a link the server returns (behind the
// membership switch), it never builds one.
const STRIPE_ALLOWED = new Set([
  'src/net/stripe_checkout.ts',
  'electron/shell_guards.cjs',
  'src/subscription_contract.ts',
]);

const SCANNED_EXT = /\.(ts|mts|cts|js|mjs|cjs|svelte|html|md|json)$/;

function walk(rel: string, out: string[]): void {
  const full = path.join(REPO_ROOT, rel);
  if (!existsSync(full)) return;
  const st = statSync(full);
  if (st.isFile()) {
    out.push(rel);
    return;
  }
  for (const entry of readdirSync(full)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const child = path.posix.join(rel, entry);
    if (statSync(path.join(REPO_ROOT, child)).isDirectory()) walk(child, out);
    else if (SCANNED_EXT.test(entry)) out.push(child);
  }
}

function shippingFiles(): string[] {
  const files: string[] = [];
  walk('src', files);
  walk('electron', files);
  for (const entry of readdirSync(path.join(REPO_ROOT, 'public'))) {
    if (entry.endsWith('.html')) files.push(`public/${entry}`);
  }
  for (const entry of readdirSync(REPO_ROOT)) {
    if (entry.endsWith('.html')) files.push(entry);
  }
  // The legal pages: the Markdown sources and the docs/legal drafts the
  // public /terms, /privacy and /eula pages are generated from.
  for (const legal of [
    'PRIVACY_POLICY.md',
    'TERMS_AND_CONDITIONS.md',
    'TERMS_AND_CONDITIONS_MARKETPLACE_DRAFT.md',
  ]) {
    if (existsSync(path.join(REPO_ROOT, legal))) files.push(legal);
  }
  walk('docs/legal', files);
  return files;
}

const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

describe('payment links removed', () => {
  const files = shippingFiles();

  it('scans every shipping surface (the walk is not silently empty)', () => {
    for (const must of [
      'index.html',
      'play.html',
      'public/terms.html',
      'public/privacy.html',
      'public/support.html',
      'electron/main.cjs',
      'electron/shell_guards.cjs',
      'src/ui/hud.ts',
      'src/guide/chrome.ts',
      'PRIVACY_POLICY.md',
      'TERMS_AND_CONDITIONS.md',
    ]) {
      expect(files, must).toContain(must);
    }
  });

  it('no shipping file names a donation or off-platform payment host', () => {
    const hits: string[] = [];
    for (const rel of files) {
      const text = read(rel);
      const m = PAYMENT_HOST_RE.exec(text);
      if (m) hits.push(`${rel}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it('no page or HUD template wires a donate link', () => {
    const hits: string[] = [];
    for (const rel of files) {
      if (!/\.(html|ts|svelte)$/.test(rel)) continue;
      const m = DONATE_LINK_RE.exec(read(rel));
      if (m) hits.push(`${rel}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it('Stripe is named only by the two files that gate it off', () => {
    const hits: string[] = [];
    for (const rel of files) {
      if (STRIPE_ALLOWED.has(rel)) continue;
      if (/\.md$/.test(rel)) continue; // legal prose may describe payment processors
      const m = STRIPE_HOST_RE.exec(read(rel));
      if (m) hits.push(`${rel}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it('the retired donate strings have no live caller outside the i18n catalog', () => {
    const hits: string[] = [];
    for (const rel of files) {
      if (!/\.(ts|html|svelte)$/.test(rel)) continue;
      if (/i18n\.(catalog|locales|resolved\.generated)\//.test(rel)) continue;
      const text = read(rel);
      for (const key of ['nav.donate', 'a11y.donateProject', 'donateProject']) {
        if (text.includes(key)) hits.push(`${rel}: ${key}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
