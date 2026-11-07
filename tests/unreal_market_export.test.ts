// Freshness and shape pins for the W10 market parity exports to the native client
// (scripts/unreal/market_export.ts): the suites the Unreal tests `Wyndlewood.Market.Parity.*`
// replay. Regenerate with UNREAL_PARITY_UPDATE=1 on this test.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMarketSuite, MARKET_PARITY_SUITES } from '../scripts/unreal/market_export';
import { PARITY_EXPORT_SUBDIR } from '../scripts/unreal/parity_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';

const DIR = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);
const UPDATE = process.env.UNREAL_PARITY_UPDATE === '1';

describe('unreal market parity export', () => {
  for (const name of Object.keys(MARKET_PARITY_SUITES)) {
    it(`committed suite ${name} is fresh`, () => {
      const fresh = buildMarketSuite(name);
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

  it('the buy suite covers partial buys and the one-copper floor', () => {
    const cases = buildMarketSuite('market_buy_price').cases;
    const partial = cases.filter((c) => {
      const o = c.out as { buyCount: number };
      return o.buyCount < (c.in.count as number);
    });
    expect(partial.length).toBeGreaterThan(0);
    expect(
      cases.some(
        (c) => (c.out as { buyPrice: number }).buyPrice === 1 && (c.in.count as number) > 1,
      ),
    ).toBe(true);
  });
});
