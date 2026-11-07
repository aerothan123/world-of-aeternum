// Freshness and shape pins for the W8 housing exports to the native client
// (scripts/unreal/housing_export.ts): the parity suites the Unreal tests
// `Wyndlewood.Housing.Parity.*` replay (and the W8 acceptance replays live) and
// the housing content the client presents. Regenerate with UNREAL_PARITY_UPDATE=1.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildHousingContent,
  buildHousingSuite,
  HOUSING_CONTENT_FILE,
  HOUSING_EXPORT_SUBDIR,
  HOUSING_PARITY_SUITES,
  HOUSING_PLACEMENT_STEPS,
} from '../scripts/unreal/housing_export';
import { PARITY_EXPORT_SUBDIR } from '../scripts/unreal/parity_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';

const DIR = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);
const UPDATE = process.env.UNREAL_PARITY_UPDATE === '1';

describe('unreal housing parity export', () => {
  for (const name of Object.keys(HOUSING_PARITY_SUITES)) {
    it(`committed suite ${name} is fresh`, () => {
      const fresh = buildHousingSuite(name);
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

  it('the placement scenario has ten placements that both pass and fail', () => {
    const cases = buildHousingSuite('housing_placement').cases;
    expect(cases).toHaveLength(HOUSING_PLACEMENT_STEPS.length);
    const places = cases.filter((c) => c.in.op === 'place');
    expect(places.length).toBeGreaterThanOrEqual(10);
    const outs = places.map((c) => c.out as { ok: boolean; reason: string });
    expect(outs.filter((o) => o.ok).length).toBeGreaterThanOrEqual(5);
    const reasons = new Set(outs.filter((o) => !o.ok).map((o) => o.reason));
    expect([...reasons].sort()).toEqual(['anchor_kind', 'anchor_taken', 'bad_anchor', 'no_item']);
    // the chest went in first, so storage is reachable from the arrival point
    expect((cases[0].out as { ok: boolean }).ok).toBe(true);
  });
});

describe('unreal housing storage admission export', () => {
  it('covers both an admitted and a refused copy', () => {
    const outs = buildHousingSuite('housing_storage_admission').cases.map(
      (c) => (c.out as { allowed: boolean }).allowed,
    );
    expect(outs).toContain(true);
    expect(outs).toContain(false);
  });
});

describe('unreal housing content export', () => {
  it('committed content is fresh', () => {
    const fresh = buildHousingContent();
    const dir = join(DIR, HOUSING_EXPORT_SUBDIR);
    const path = join(dir, HOUSING_CONTENT_FILE);
    if (UPDATE) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, `${JSON.stringify(fresh)}\n`);
    }
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('the arrival point is within storage reach of the first hearth floor spot', () => {
    const c = buildHousingContent();
    const a = c.anchors.find((x) => x.id === 'hearth_floor_1')!;
    expect(Math.hypot(a.x - c.entry.x, a.z - c.entry.z)).toBeLessThanOrEqual(c.storageRange);
    expect(c.lots.length).toBeGreaterThan(0);
    expect(c.furniture.some((f) => f.station !== null)).toBe(true);
  });
});
