import { afterEach, describe, expect, it, vi } from 'vitest';
import { EconomyClient, startClaudiumPurchase } from '../src/net/economy_sdk';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EconomyClient store snapshot', () => {
  it('marks the snapshot available only when balance and catalog both load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/claudium/balance')) {
          return new Response(JSON.stringify({ balance: 750 }), { status: 200 });
        }
        if (url.endsWith('/api/claudium/store')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  itemId: 'ice_fang_sword',
                  name: 'Ice Fang',
                  kind: 'skin',
                  costClaudium: 3000,
                  owned: false,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );

    const snapshot = await new EconomyClient({
      token: () => 'token',
      base: 'https://game.example',
    }).storeSnapshot();

    expect(snapshot).toEqual({
      available: true,
      balance: 750,
      items: [
        {
          itemId: 'ice_fang_sword',
          name: 'Ice Fang',
          kind: 'skin',
          costClaudium: 3000,
          owned: false,
        },
      ],
    });
  });

  it('marks a partial refresh unavailable instead of presenting fallback rows as fresh data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/claudium/balance')) {
          return new Response(JSON.stringify({ balance: 250 }), { status: 200 });
        }
        return new Response(null, { status: 503 });
      }),
    );

    const snapshot = await new EconomyClient({
      token: () => 'token',
      base: 'https://game.example',
    }).storeSnapshot();

    expect(snapshot).toEqual({ available: false, balance: 250, items: [] });
  });

  it('preserves the upstream unavailable marker returned through the game proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/claudium/balance')) {
          return new Response(JSON.stringify({ balance: 250 }), { status: 200 });
        }
        if (url.endsWith('/api/claudium/store')) {
          return new Response(JSON.stringify({ available: false, items: [] }), { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const snapshot = await new EconomyClient({
      token: () => 'token',
      base: 'https://game.example',
    }).storeSnapshot();

    expect(snapshot).toEqual({ available: false, balance: 250, items: [] });
  });
});

describe('EconomyClient pack snapshot', () => {
  // Card (Stripe) is the only purchase rail, so the pack snapshot is the balance
  // plus the SKU ladder and nothing else: no native-rail or wallet read.
  function stubPacks(skusAvailable: boolean) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/claudium/balance')) {
        return new Response(JSON.stringify({ available: true, balance: 250 }), { status: 200 });
      }
      if (url.endsWith('/api/claudium/skus')) {
        return new Response(
          JSON.stringify({
            available: skusAvailable,
            skus: [{ sku: 'claudium_500', usd: 4.99, claudium: 500 }],
          }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('marks the snapshot available when balance and packs both load', async () => {
    const fetchMock = stubPacks(true);

    const snapshot = await new EconomyClient({
      token: () => 'token',
      base: 'https://game.example',
    }).packSnapshot();

    expect(snapshot).toEqual({
      available: true,
      balance: 250,
      skus: [{ sku: 'claudium_500', usd: 4.99, claudium: 500 }],
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/native/'))).toBe(false);
  });

  it('marks a partial pack refresh unavailable instead of presenting fallbacks as fresh data', async () => {
    stubPacks(false);

    const snapshot = await new EconomyClient({
      token: () => 'token',
      base: 'https://game.example',
    }).packSnapshot();

    expect(snapshot).toEqual({
      available: false,
      balance: 250,
      skus: [{ sku: 'claudium_500', usd: 4.99, claudium: 500 }],
    });
  });
});

describe('startClaudiumPurchase', () => {
  it('requests a card intent and hands it to the Stripe signer', async () => {
    const intent = { clientSecret: 'cs_1', publishableKey: 'pk_1' };
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            ok: true,
            purchaseId: 'p1',
            rail: 'stripe',
            claudium: 500,
            stripe: intent,
            reason: null,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const stripe = vi.fn(async () => {});

    const purchase = await startClaudiumPurchase(
      new EconomyClient({ token: () => 'token', base: 'https://game.example' }),
      'stripe',
      'claudium_500',
      { stripe },
    );

    expect(purchase.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/claudium/purchase');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ rail: 'stripe', sku: 'claudium_500' });
    expect(stripe).toHaveBeenCalledWith(intent, 'p1');
  });

  it('stops cleanly without charging when the service is off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const stripe = vi.fn(async () => {});

    const purchase = await startClaudiumPurchase(
      new EconomyClient({ token: () => 'token', base: 'https://game.example' }),
      'stripe',
      'claudium_500',
      { stripe },
    );

    expect(purchase.ok).toBe(false);
    expect(stripe).not.toHaveBeenCalled();
  });
});
