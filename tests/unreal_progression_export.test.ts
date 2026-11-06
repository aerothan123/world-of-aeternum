// Freshness and shape pins for the W4 progression exports to the native client
// (scripts/unreal/progression_export.ts): the parity suites the Unreal tests
// `Wyndlewood.Progression.Parity.*` replay and the progression content the client presents.
// Regenerate with UNREAL_PARITY_UPDATE=1 on this test.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARITY_EXPORT_SUBDIR } from '../scripts/unreal/parity_export';
import {
  buildProgressionContent,
  buildProgressionSuite,
  PROGRESSION_CONTENT_FILE,
  PROGRESSION_EXPORT_SUBDIR,
  PROGRESSION_PARITY_SUITES,
} from '../scripts/unreal/progression_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';

const DIR = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);
const UPDATE = process.env.UNREAL_PARITY_UPDATE === '1';

describe('unreal progression parity export', () => {
  for (const name of Object.keys(PROGRESSION_PARITY_SUITES)) {
    it(`committed suite ${name} is fresh`, () => {
      const fresh = buildProgressionSuite(name);
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

  it('the rested suite covers a bonus, a level-up and the accrual', () => {
    const cases = buildProgressionSuite('progression_xp_rested').cases;
    const outs = cases.map((c) => c.out as { bonus?: number; level?: number });
    expect(outs.some((o) => (o.bonus ?? 0) > 0)).toBe(true);
    expect(cases.some((c) => c.in.kind === 'accrue')).toBe(true);
    expect(
      cases.some(
        (c) => c.in.kind === 'grant' && (c.out as { level: number }).level > Number(c.in.level),
      ),
    ).toBe(true);
  });
});

describe('unreal progression content export', () => {
  it('committed content is fresh', () => {
    const fresh = buildProgressionContent();
    const dir = join(DIR, PROGRESSION_EXPORT_SUBDIR);
    const path = join(dir, PROGRESSION_CONTENT_FILE);
    if (UPDATE) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, `${JSON.stringify(fresh)}\n`);
    }
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('carries the Proving Shore and chapter one with givers, objectives and four factions', () => {
    const c = buildProgressionContent();
    const gauntlet = c.quests.find((q) => q.id === 'q_ps_the_gauntlet');
    expect(gauntlet?.giver).toBe('warden_tam');
    expect(gauntlet?.objectives.length).toBeGreaterThan(0);
    expect(c.quests.filter((q) => q.chapter === 'chapter1').length).toBeGreaterThan(20);
    expect(c.factions.map((f) => f.id)).toHaveLength(4);
    expect(c.npcs.find((n) => n.id === 'warden_tam')?.questIds).toContain('q_ps_the_gauntlet');
  });
});
