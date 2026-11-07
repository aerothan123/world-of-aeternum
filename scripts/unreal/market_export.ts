// W10 market parity suites for the native client (ea-plan.md decision D1). The Unreal tests
// `Wyndlewood.Market.Parity.*` replay these through the C++ ports in WyndMarketRules:
//   market_buy_price  - src/ui/market_buy_confirm_core.ts marketBuyConfirm (whole and partial
//                       buys of a stack: what the confirm quotes and the server settles)
//   market_sweep_view - src/ui/market_sweep_core.ts sweepQuoteView and sweepCountFromInput
// Regenerate with `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_market_export.test.ts`,
// then copy scripts/unreal/protocol/parity/market_*.json to the Unreal repo's Data/Parity/.

import { marketBuyConfirm } from '../../src/ui/market_buy_confirm_core';
import { sweepCountFromInput, sweepQuoteView } from '../../src/ui/market_sweep_core';
import type { MarketInfo, MarketListingView } from '../../src/world_api';
import type { ParityCase, ParitySuite } from './parity_export';

function listing(count: number, price: number): MarketListingView {
  return { id: 1, sellerName: 'A', itemId: 'copper_ore', count, price, mine: false, house: false };
}

/** Whole and partial buys over stack sizes 1 to 20 and a spread of asks. */
function marketBuyPrice(): ParitySuite {
  const cases: ParityCase[] = [];
  const prices = [1, 2, 3, 5, 7, 10, 19, 20, 33, 100, 101, 999, 1234, 50000];
  for (const count of [1, 2, 3, 4, 5, 7, 10, 20]) {
    for (const price of prices) {
      if (price < 1) continue;
      for (const requested of [0, 1, 2, 3, count - 1, count, count + 1, -1]) {
        const req = requested === -1 ? undefined : requested;
        const c = marketBuyConfirm(listing(count, price), req);
        cases.push({
          in: { count, price, requested: req === undefined ? -1 : req },
          out: { buyCount: c.buyCount, buyPrice: c.buyPrice, unitPrice: c.unitPrice ?? -1 },
        });
      }
    }
  }
  return {
    suite: 'market_buy_price',
    source: 'src/ui/market_buy_confirm_core.ts marketBuyConfirm',
    note: 'requested -1 means omitted (whole stack); unitPrice -1 means null (a single)',
    cases,
  };
}

/** The sweep card's quote line and the typed count clamp. */
function marketSweepView(): ParitySuite {
  const cases: ParityCase[] = [];
  for (const units of [0, 1, 2, 3, 7, 10, 200]) {
    for (const total of [0, 1, 5, 10, 11, 99, 100, 12345]) {
      for (const short of [false, true]) {
        const info = {
          sweepQuote: { itemId: 'copper_ore', count: 5, units, listings: 2, total, short },
        } as unknown as MarketInfo;
        const v = sweepQuoteView(info, { itemId: 'copper_ore', count: 5 });
        cases.push({
          in: { kind: 'quote', units, total, short, raw: '' },
          out:
            v.state === 'ok' || v.state === 'short'
              ? { state: v.state, each: v.each }
              : { state: v.state, each: -1 },
        });
      }
    }
  }
  for (const raw of ['', '0', '1', '5', '-3', '12abc', 'x', '199', '200', '201', '100000', '7.9']) {
    cases.push({
      in: { kind: 'count', units: 0, total: 0, short: false, raw },
      out: { count: sweepCountFromInput(raw) },
    });
  }
  return {
    suite: 'market_sweep_view',
    source: 'src/ui/market_sweep_core.ts sweepQuoteView, sweepCountFromInput',
    note: 'kind quote: the staged quote line (each = ceil(total / units)); kind count: parseInt clamp to 1..200',
    cases,
  };
}

export const MARKET_PARITY_SUITES: Record<string, () => ParitySuite> = {
  market_buy_price: marketBuyPrice,
  market_sweep_view: marketSweepView,
};

export function buildMarketSuite(name: string): ParitySuite {
  const build = MARKET_PARITY_SUITES[name];
  if (!build) throw new Error(`unknown market parity suite ${name}`);
  return build();
}
