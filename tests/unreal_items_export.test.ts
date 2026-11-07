// Freshness and shape pins for the W3 items exports to the native client
// (scripts/unreal/items_export.ts): the parity suites the Unreal tests
// `Wyndlewood.Items.Parity.*` replay and the items content the client presents.
// Regenerate with UNREAL_PARITY_UPDATE=1 on this test.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildItemsContent,
  buildItemsSuite,
  ITEMS_CONTENT_FILE,
  ITEMS_EXPORT_SUBDIR,
  ITEMS_PARITY_SUITES,
} from '../scripts/unreal/items_export';
import { PARITY_EXPORT_SUBDIR } from '../scripts/unreal/parity_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';

const DIR = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);
const UPDATE = process.env.UNREAL_PARITY_UPDATE === '1';

describe('unreal items parity export', () => {
  for (const name of Object.keys(ITEMS_PARITY_SUITES)) {
    it(`committed suite ${name} is fresh`, () => {
      const fresh = buildItemsSuite(name);
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

  it('the durability suite covers ok, low and broken', () => {
    const states = new Set(
      buildItemsSuite('items_durability').cases.map((c) => (c.out as { state: string }).state),
    );
    expect([...states].sort()).toEqual(['broken', 'low', 'ok']);
  });
});

describe('unreal items content export', () => {
  it('committed content is fresh', () => {
    const fresh = buildItemsContent();
    const dir = join(DIR, ITEMS_EXPORT_SUBDIR);
    const path = join(dir, ITEMS_CONTENT_FILE);
    if (UPDATE) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, `${JSON.stringify(fresh)}\n`);
    }
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('carries vendors that repair, a banker and the repair service id', () => {
    const c = buildItemsContent();
    expect(c.vendors.some((v) => v.repairs)).toBe(true);
    expect(c.vendors.some((v) => v.banker)).toBe(true);
    expect(c.vendors.some((v) => v.stock.length > 0)).toBe(true);
    expect(c.repairAllServiceId).toBe('repair_all_service');
    expect(c.items.some((i) => i.maxDur > 0)).toBe(true);
  });
});
