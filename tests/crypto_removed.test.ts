// Wyndlewood ships no cryptocurrency, token or wallet feature (owner decision
// for the Steam Early Access launch; Steam does not allow blockchain games, so
// the stack is removed, not hidden). This suite is the grep evidence: the
// wallet packages are out of the manifest AND the lockfile, no shipped module
// imports one, the legal and landing pages name no chain or token, the notices
// file carries no wallet license, and the retired crypto tables are dropped
// rather than re-created.
//
// Historical references are allowed to stay where they are history: the
// append-only error-code catalog and its client mirror (codes are permanent),
// the retired i18n catalog entries nothing renders, the design docs and the
// changelog. Every pin here is on a SHIPPING surface.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_CRYPTO_TABLES } from '../server/legacy_crypto_drop_db';

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/** The package families the wallet feature pulled in, as manifest name tests. */
const WALLET_PACKAGE_RE =
  /^(@reown\/|@solana\/|@wallet-standard\/|@walletconnect\/|bs58$|tweetnacl$|@noble\/curves$|web3$|ethers$|viem$|wagmi$)/;

/** Import specifiers no shipped module may name. */
const WALLET_IMPORT_RE =
  /from\s+['"](@reown\/|@solana\/|@wallet-standard\/|@walletconnect\/|bs58|tweetnacl|@noble\/curves|web3|ethers|viem|wagmi)|require\(\s*['"](@reown\/|@solana\/|@wallet-standard\/|@walletconnect\/|bs58|tweetnacl|@noble\/curves|web3|ethers|viem|wagmi)/;

function walk(dir: string, out: string[], skip: ReadonlySet<string>): void {
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out, skip);
    else if (/\.(ts|mts|cts|js|mjs|cjs|svelte|html)$/.test(entry)) out.push(full);
  }
}

describe('crypto removal: dependencies', () => {
  const pkg = JSON.parse(read('package.json')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    pnpm?: {
      overrides?: Record<string, string>;
      onlyBuiltDependencies?: string[];
      patchedDependencies?: Record<string, string>;
    };
  };

  it('declares no wallet, chain or token package in any dependency block', () => {
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
      ...(pkg.pnpm?.onlyBuiltDependencies ?? []),
      ...Object.keys(pkg.pnpm?.patchedDependencies ?? {}).map((k) => k.replace(/@[^@]+$/, '')),
    ];
    expect(names.filter((n) => WALLET_PACKAGE_RE.test(n))).toEqual([]);
    // The transitive pins that only guarded the wallet stack left with it.
    expect(Object.keys(pkg.pnpm?.overrides ?? {})).not.toContain('stream-json@1');
    expect(pkg.pnpm?.onlyBuiltDependencies ?? []).not.toContain('bigint-buffer');
    expect(existsSync(path.join(REPO_ROOT, 'patches/zod@3.22.4.patch'))).toBe(false);
  });

  it('resolves none of them in the lockfile either (removed, not merely undeclared)', () => {
    const lock = read('pnpm-lock.yaml');
    for (const needle of [
      '@reown/',
      '@solana/',
      '@wallet-standard/',
      '@walletconnect/',
      '\n  bs58@',
      '\n  tweetnacl@',
      "'@noble/curves@",
      '\n  jayson@',
      '\n  bigint-buffer@',
      '\n  stream-json@',
      '\n  zod@3.22.4',
    ]) {
      expect(lock, `${needle.trim()} is still resolved in pnpm-lock.yaml`).not.toContain(needle);
    }
  });

  it('is imported by no shipped module (client, server, desktop, headless, bot, scripts)', () => {
    const files: string[] = [];
    const skip = new Set(['node_modules', 'dist', 'dist-server', '.git', 'tests']);
    for (const root of ['src', 'server', 'electron', 'headless', 'bot', 'scripts', 'index.html']) {
      const full = path.join(REPO_ROOT, root);
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full, files, skip);
      else files.push(full);
    }
    expect(files.length).toBeGreaterThan(500);
    const offenders = files
      .filter((file) => WALLET_IMPORT_RE.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(REPO_ROOT, file));
    // The malware scanner names these specifiers as SIGNATURES it hunts for,
    // never as imports; it is the one file allowed to spell them.
    expect(offenders.filter((f) => f !== 'scripts/malware_scan.mjs')).toEqual([]);
  });
});

describe('crypto removal: notices and licenses', () => {
  it('carries no wallet license in the notices or the license directory', () => {
    const notices = read('THIRD_PARTY_NOTICES.md');
    expect(notices).not.toMatch(/^## Reown AppKit/m);
    expect(notices).not.toMatch(/^## WalletConnect/m);
    expect(notices).not.toMatch(/^## @solana\/web3\.js/m);
    expect(notices).not.toMatch(/^## bs58/m);
    expect(notices).not.toMatch(/^## TweetNaCl/m);
    expect(notices).toContain('Removed: the wallet-linking stack');
    const licenses = readdirSync(path.join(REPO_ROOT, 'third_party/licenses'));
    expect(licenses.filter((f) => /reown|walletconnect|solana/i.test(f))).toEqual([]);
  });
});

describe('crypto removal: shipping pages', () => {
  // The landing page, the play shell and every static page the server serves
  // (the legal pages among them) name no chain, token, wallet link or wallet SDK.
  const PAGE_RE = /solana|reown|walletconnect|web3|\$WOC\b|phantom wallet|connect (a|your) wallet/i;

  it('names no chain, token or wallet on the landing, play or static pages', () => {
    const pages = ['index.html', 'play.html'];
    for (const entry of readdirSync(path.join(REPO_ROOT, 'public'))) {
      if (entry.endsWith('.html')) pages.push(path.join('public', entry));
    }
    expect(pages.length).toBeGreaterThan(5);
    for (const page of pages) {
      const match = PAGE_RE.exec(read(page));
      expect(match?.[0] ?? null, `${page} still mentions ${match?.[0]}`).toBeNull();
    }
  });

  it('names no chain or token in the player agreement drafts', () => {
    for (const doc of ['TERMS_AND_CONDITIONS.md', 'PRIVACY_POLICY.md']) {
      const match = PAGE_RE.exec(read(doc));
      expect(match?.[0] ?? null, `${doc} still mentions ${match?.[0]}`).toBeNull();
    }
  });

  it('loads no wallet SDK from the desktop shell content policy', () => {
    const guards = read('electron/shell_guards.cjs');
    expect(guards).not.toMatch(/reown|walletconnect|solana|phantom|solflare/i);
  });
});

describe('crypto removal: database', () => {
  it('creates none of the retired crypto tables and drops every one of them', () => {
    const db = read('server/db.ts');
    for (const table of LEGACY_CRYPTO_TABLES) {
      expect(db).not.toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(existsSync(path.join(REPO_ROOT, 'server/legacy_crypto_schema_db.ts'))).toBe(false);
    for (const table of ['wallet_links', 'wallet_link_challenges', 'seeker_entitlement_claims']) {
      expect(LEGACY_CRYPTO_TABLES).toContain(table);
    }
    expect(LEGACY_CRYPTO_TABLES.filter((t) => t.startsWith('woc_market_')).length).toBe(10);
  });
});
