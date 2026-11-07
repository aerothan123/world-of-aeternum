// Freshness and shape pins for the native client's W0 exports: the parity case suites
// (scripts/unreal/parity_export.ts) and the string table (scripts/unreal/strings_export.ts).
// The committed copies under scripts/unreal/protocol/ must equal a fresh build from the TS
// sources, so the Unreal automation tests that replay them always see the authoritative answers.
// Regenerate with UNREAL_PARITY_UPDATE=1 on this test.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildParitySuite,
  PARITY_EXPORT_SUBDIR,
  PARITY_SUITES,
} from '../scripts/unreal/parity_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';
import {
  buildStringsCsv,
  catalogLeaves,
  csvField,
  STRINGS_EXPORT_FILE,
} from '../scripts/unreal/strings_export';
import { mobXpValue } from '../src/sim/types';
import { en } from '../src/ui/i18n.catalog';

const DIR = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);
const UPDATE = process.env.UNREAL_PARITY_UPDATE === '1';

describe('unreal parity export', () => {
  for (const name of Object.keys(PARITY_SUITES)) {
    it(`committed parity suite ${name} is fresh`, () => {
      const fresh = buildParitySuite(name);
      expect(fresh.suite).toBe(name);
      expect(fresh.cases.length).toBeGreaterThan(0);
      const dir = join(DIR, PARITY_EXPORT_SUBDIR);
      const path = join(dir, `${name}.json`);
      if (UPDATE) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(path, `${JSON.stringify(fresh, null, 2)}\n`);
      }
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
    });
  }

  it('the mob xp suite covers gray, even and above-level kills', () => {
    const outs = buildParitySuite('xp_mob_value').cases.map((c) => (c.out as { xp: number }).xp);
    expect(outs).toContain(0);
    expect(mobXpValue(5, 5)).toBe(70);
    expect(new Set(outs).size).toBeGreaterThan(20);
  });

  it('the profanity suite masks confusables and leaves clean text alone', () => {
    const cases = buildParitySuite('chat_profanity_mask').cases;
    const out = (text: string, terms: string) => {
      const hit = cases.find((c) => c.in.text === text && c.in.terms === terms);
      return (hit?.out as { masked: string } | undefined)?.masked;
    };
    expect(out('d4rn and h3ck', 'darn,heck')).toBe('**** and ****');
    expect(out('hello there', 'darn,heck')).toBe('hello there');
    expect(out('darn it', '')).toBe('darn it');
  });

  it('the keybind conflict suite covers eviction, refusal and shared actions', () => {
    const cases = buildParitySuite('keybind_conflicts').cases;
    const bind = (id: string, combo: string) =>
      cases.find(
        (c) =>
          c.in.kind === 'bind' &&
          c.in.steps === '' &&
          c.in.id === id &&
          c.in.combo === combo &&
          c.in.index === 0,
      )?.out as { conflict: { id: string } | null; ok: boolean } | undefined;
    expect(bind('slot1', 'KeyW')?.conflict?.id).toBe('forward');
    expect(bind('slot1', 'Escape')?.ok).toBe(false);
    expect(bind('forward', 'WheelUp')?.ok).toBe(false);
    expect(bind('slot1', 'Shift+Digit1')?.conflict).toBeNull();
    const registry = buildParitySuite('keybind_registry').cases;
    expect(registry.some((c) => (c.out as { shared: boolean }).shared)).toBe(true);
  });
});

describe('unreal string table export', () => {
  it('committed string table is fresh', () => {
    const fresh = buildStringsCsv();
    const path = join(DIR, STRINGS_EXPORT_FILE);
    if (UPDATE) writeFileSync(path, fresh);
    expect(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).toBe(fresh);
  });

  it('every row is a string leaf of the catalog with a unique key', () => {
    const leaves = catalogLeaves(en);
    const keys = leaves.map(([k]) => k);
    expect(new Set(keys).size).toBe(keys.length);
    expect(leaves.length).toBeGreaterThan(1000);
    expect(leaves.find(([k]) => k === 'realmTypes.normal')?.[1]).toBe('Normal');
  });

  it('quotes only the fields that need it', () => {
    expect(csvField('plain text')).toBe('plain text');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });
});
