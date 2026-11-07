// The gathering and crafting exports for the native client (scripts/unreal/professions_export.ts)
// stay fresh: every committed file under scripts/unreal/protocol/{parity,professions} equals what
// the sim answers now. UNREAL_PROF_UPDATE=1 rewrites them (then copy them into the Unreal repo:
// Data/Parity/prof_*.json and Data/Professions/*.json).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  exportTrees,
  PROF_PARITY_SUITES,
  professionTables,
} from '../scripts/unreal/professions_export';

const ROOT = join(__dirname, '..', 'scripts', 'unreal', 'protocol');
const UPDATE = process.env.UNREAL_PROF_UPDATE === '1';

function check(path: string, text: string): void {
  if (UPDATE) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
    return;
  }
  expect(existsSync(path), `${path} missing: run with UNREAL_PROF_UPDATE=1`).toBe(true);
  expect(readFileSync(path, 'utf8')).toBe(text);
}

describe('unreal professions export', () => {
  for (const [name, build] of Object.entries(PROF_PARITY_SUITES)) {
    it(`parity suite ${name} is fresh`, () => {
      const suite = build();
      expect(suite.cases.length).toBeGreaterThan(20);
      check(join(ROOT, 'parity', `${name}.json`), `${JSON.stringify(suite, null, 1)}\n`);
    });
  }

  it('content tables are fresh', () => {
    for (const [name, table] of Object.entries(professionTables())) {
      check(join(ROOT, 'professions', `prof_${name}.json`), `${JSON.stringify(table, null, 1)}\n`);
    }
  });

  it('the exported forest is non-empty and every tree id is unique', () => {
    const trees = exportTrees();
    expect(trees.length).toBeGreaterThan(50);
    expect(new Set(trees.map((t) => t.id)).size).toBe(trees.length);
  });
});
