import { describe, expect, it, vi } from 'vitest';
import type {
  BotDetector,
  BotDetectorHost,
  PlayerSessionRef,
} from '../../server/bot_detector/contract';
import { createBotDetector, FLAG_ONLY_DEFAULTS } from '../../server/bot_detector/flag_only';

const REF: PlayerSessionRef = { accountId: 77, characterId: 5, name: 'Tester', ip: '203.0.113.9' };
const MIN = 60_000;
const HOUR = 60 * MIN;

function hostSpy(accept = true) {
  const recorded: Array<{ accountId: number; details: string }> = [];
  const refreshed: Array<{ accountId: number; details: string }> = [];
  const host: BotDetectorHost = {
    recordSuspicionFlag: vi.fn(async (o) => {
      recorded.push(o);
      return accept;
    }),
    refreshSuspicionFlagDetails: vi.fn(async (o) => {
      refreshed.push(o);
      return true;
    }),
  };
  return { host, recorded, refreshed };
}

/** Drive `perMinute` commands a minute for `minutes` minutes, ticking each minute. */
function flood(
  d: BotDetector,
  ctx: ReturnType<BotDetector['createTrackingContext']>,
  start: number,
  minutes: number,
  perMinute = 400,
) {
  let now = start;
  for (let m = 0; m < minutes; m++) {
    for (let i = 0; i < perMinute; i++) d.observeCommand(ctx, 'cast', now + (i * MIN) / perMinute);
    now += MIN;
    d.handleTick(ctx, now, true, null);
  }
  return now;
}

const settle = () => new Promise((r) => setImmediate(r));

describe('flag-only bot detector', () => {
  it('never acts: handleTick answers none even with enforce on and heavy evidence', async () => {
    const d = createBotDetector();
    const { host } = hostSpy();
    d.attachHost?.(host);
    const ctx = d.createTrackingContext(REF);
    let now = flood(d, ctx, 1_000_000, 10);
    for (let i = 0; i < 20; i++) d.observeProtocolAnomaly(ctx, 'invalid_json', '{', now);
    for (const enforce of [true, false]) {
      expect(d.handleTick(ctx, now, enforce, null)).toBe('none');
      now += MIN;
    }
    expect(d.listSuspiciousPlayers()).not.toHaveLength(0);
  });

  it('ordinary play files nothing', async () => {
    const d = createBotDetector();
    const { host, recorded } = hostSpy();
    d.attachHost?.(host);
    const ctx = d.createTrackingContext(REF);
    let now = 5_000_000;
    for (let m = 0; m < 300; m++) {
      for (let i = 0; i < 40; i++) d.observeCommand(ctx, 'cast', now + i * 1000);
      now += MIN;
      d.handleTick(ctx, now, true, null);
    }
    d.observeProtocolAnomaly(ctx, 'unknown_command', 'x', now);
    d.handleTick(ctx, now, true, null);
    await settle();
    expect(recorded).toEqual([]);
    expect(d.listSuspiciousPlayers()).toEqual([]);
  });

  it('one signal alone stays below the default flag threshold', async () => {
    const d = createBotDetector();
    const { host, recorded } = hostSpy();
    d.attachHost?.(host);
    const ctx = d.createTrackingContext(REF);
    flood(d, ctx, 2_000_000, 8);
    await settle();
    expect(d.listSuspiciousPlayers()[0]?.evidence.map((e) => e.kind)).toEqual(['command_flood']);
    expect(recorded).toEqual([]);
  });

  it('flags the account once two signals add up, without leaking the ip', async () => {
    const d = createBotDetector();
    const { host, recorded } = hostSpy();
    d.attachHost?.(host);
    const ctx = d.createTrackingContext(REF);
    const now = flood(d, ctx, 3_000_000, 8);
    for (let i = 0; i < FLAG_ONLY_DEFAULTS.anomalyCount; i++)
      d.observeProtocolAnomaly(ctx, 'unknown_type', 'z', now);
    d.handleTick(ctx, now, true, null);
    d.handleTick(ctx, now + 1000, true, null);
    await settle();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].accountId).toBe(77);
    expect(recorded[0].details).toContain('score 110');
    expect(recorded[0].details).not.toContain('203.0.113.9');
    expect(recorded[0].details).not.toContain('Tester');
  });

  it('retries a flag the host could not persist, and refreshes details after one lands', async () => {
    const d = createBotDetector();
    const spy = hostSpy(false);
    d.attachHost?.(spy.host);
    const ctx = d.createTrackingContext(REF);
    let now = flood(d, ctx, 4_000_000, 8);
    for (let i = 0; i < 5; i++) d.observeProtocolAnomaly(ctx, 'unknown_type', 'z', now);
    d.handleTick(ctx, now, true, null);
    await settle();
    now += 1000;
    d.handleTick(ctx, now, true, null);
    await settle();
    expect(spy.recorded.length).toBeGreaterThanOrEqual(2);

    const ok = hostSpy(true);
    const d2 = createBotDetector();
    d2.attachHost?.(ok.host);
    const c2 = d2.createTrackingContext(REF);
    now = flood(d2, c2, 6_000_000, 8);
    for (let i = 0; i < 5; i++) d2.observeProtocolAnomaly(c2, 'unknown_type', 'z', now);
    d2.handleTick(c2, now, true, null);
    await settle();
    for (let i = 0; i < 10; i++) d2.observeProtocolAnomaly(c2, 'unknown_type', 'z', now);
    d2.handleTick(c2, now + 1000, true, null);
    await settle();
    expect(ok.recorded).toHaveLength(1);
    expect(ok.refreshed).toHaveLength(1);
    expect(ok.refreshed[0].details).toContain('15 malformed');
  });

  it('works without a host (lists, never throws) and forgets a released session', () => {
    const d = createBotDetector();
    const ctx = d.createTrackingContext(REF);
    const now = flood(d, ctx, 7_000_000, 8);
    for (let i = 0; i < 5; i++) d.observeProtocolAnomaly(ctx, 'invalid_json', '', now);
    expect(d.handleTick(ctx, now, true, null)).toBe('none');
    expect(d.listSuspiciousPlayers()).toHaveLength(1);
    d.releaseTrackingContext(ctx);
    expect(d.listSuspiciousPlayers()).toEqual([]);
    expect(d.handleTick(ctx, now, true, null)).toBe('none');
  });

  it('flags a marathon with no pause only alongside another signal', async () => {
    const d = createBotDetector();
    const { host, recorded } = hostSpy();
    d.attachHost?.(host);
    const ctx = d.createTrackingContext(REF);
    let now = 9_000_000;
    for (let i = 0; i < 7 * 60 * 2; i++) {
      d.observeCommand(ctx, 'cast', now);
      now += 30_000;
      d.handleTick(ctx, now, true, null);
    }
    await settle();
    expect(d.listSuspiciousPlayers()[0].evidence.map((e) => e.kind)).toContain('no_breaks');
    expect(recorded).toEqual([]);
    expect(now - 9_000_000).toBeGreaterThan(6 * HOUR);
  });

  it('applyConfig validates, replaces overrides and can switch flagging off', () => {
    const d = createBotDetector();
    expect(d.describeConfig().length).toBe(9);
    expect(d.applyConfig({ flagThreshold: 5, bogus: 1, noBreakHours: 'x' }).errors).toHaveLength(2);
    expect(d.describeConfig().find((f) => f.id === 'flagThreshold')?.value).toBe(5);
    expect(d.applyConfig({}).errors).toEqual([]);
    expect(d.describeConfig().find((f) => f.id === 'flagThreshold')?.value).toBe(
      FLAG_ONLY_DEFAULTS.flagThreshold,
    );
    d.applyConfig({ enabled: false });
    const ctx = d.createTrackingContext(REF);
    flood(d, ctx, 1_000_000, 10);
    expect(d.listSuspiciousPlayers()).toEqual([]);
  });
});
