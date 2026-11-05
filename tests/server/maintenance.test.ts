// Realm maintenance (server/maintenance.ts): the countdown ladder, the gate
// phases, the internal routes, and the client re-localization of every
// broadcast (src/ui/maintenance_text_i18n.ts), so emitter and matcher cannot
// drift. Also the minimum client version compare (server/client_version_gate.ts).
import type * as http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { clientVersionAllowed, parseClientVersion } from '../../server/client_version_gate';
import { routes } from '../../server/internal';
import {
  createMaintenanceController,
  MAINTENANCE_CANCELLED_TEXT,
  MAINTENANCE_ENDED_TEXT,
  maintenance,
  maintenanceStepText,
  parseMaintenanceMinutes,
  planMaintenanceSteps,
  resetMaintenanceForTests,
} from '../../server/maintenance';
import { userFacingApiError } from '../../src/ui/api_error_i18n';
import { localizeMaintenanceText } from '../../src/ui/maintenance_text_i18n';
import { localizeServerText } from '../../src/ui/server_i18n';
import { type FakeRes, fakeCtx } from './helpers';

function fakeClock() {
  let now = 0;
  const timers: { at: number; fn: () => void; dead: boolean }[] = [];
  const broadcasts: string[] = [];
  const deps = {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const t = { at: now + ms, fn, dead: false };
      timers.push(t);
      return t;
    },
    clearTimer: (h: unknown) => {
      (h as { dead: boolean }).dead = true;
    },
    broadcast: (text: string) => broadcasts.push(text),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((x) => !x.dead && x.at <= now).sort((a, b) => a.at - b.at)) {
      t.dead = true;
      t.fn();
    }
  };
  return { deps, advance, broadcasts };
}

describe('maintenance countdown', () => {
  it('announces the ladder for 10 minutes and closes the gate at zero', () => {
    const clock = fakeClock();
    const m = createMaintenanceController(clock.deps);
    expect(m.start(10).started).toBe(true);
    expect(m.gateActive()).toBe(false);
    clock.advance(9 * 60_000 + 59_000);
    expect(m.gateActive()).toBe(false);
    expect(m.status()).toEqual({ phase: 'countdown', remainingSeconds: 1 });
    clock.advance(1000);
    expect(m.gateActive()).toBe(true);
    expect(clock.broadcasts).toEqual([
      'Realm maintenance begins in 10 minutes.',
      'Realm maintenance begins in 5 minutes.',
      'Realm maintenance begins in 2 minutes.',
      'Realm maintenance begins in 1 minute.',
      'Realm maintenance begins in 30 seconds.',
      'Realm maintenance begins in 10 seconds.',
      'Realm maintenance has begun. New logins are closed.',
    ]);
  });

  it('cancel stops the countdown; end reopens an active gate; double start refuses', () => {
    const clock = fakeClock();
    const m = createMaintenanceController(clock.deps);
    m.start(5);
    expect(m.start(5).started).toBe(false);
    expect(m.cancel().cancelled).toBe(true);
    clock.advance(10 * 60_000);
    expect(m.gateActive()).toBe(false);
    expect(clock.broadcasts.at(-1)).toBe(MAINTENANCE_CANCELLED_TEXT);
    const booted = createMaintenanceController(clock.deps, { startActive: true });
    expect(booted.gateActive()).toBe(true);
    expect(booted.cancel().cancelled).toBe(false);
    expect(booted.end().ended).toBe(true);
    expect(booted.gateActive()).toBe(false);
    expect(clock.broadcasts.at(-1)).toBe(MAINTENANCE_ENDED_TEXT);
  });

  it('clamps operator minutes', () => {
    expect(parseMaintenanceMinutes(undefined)).toBe(10);
    expect(parseMaintenanceMinutes(30)).toBe(30);
    expect(parseMaintenanceMinutes('3')).toBe(3);
    for (const bad of [0, 121, 1.5, 'x', -2]) expect(parseMaintenanceMinutes(bad)).toBeNull();
  });

  it('every line the server can broadcast re-localizes on the client', () => {
    const lines = new Set<string>([MAINTENANCE_CANCELLED_TEXT, MAINTENANCE_ENDED_TEXT]);
    for (const minutes of [1, 2, 7, 30, 120]) {
      for (const step of planMaintenanceSteps(minutes)) lines.add(maintenanceStepText(step));
    }
    for (const line of lines) {
      expect(localizeMaintenanceText(line), line).toBe(line);
      expect(localizeServerText(line), line).toBe(line);
    }
    expect(localizeMaintenanceText('Realm maintenance begins in soon.')).toBeNull();
  });

  it('the WS refusal literals localize through the client matcher', () => {
    expect(userFacingApiError(new Error('realm is under maintenance'))).toBe(
      'The realm is closed for maintenance. Please try again soon.',
    );
    expect(userFacingApiError(new Error('client update required'))).toMatch(/^Update required/);
  });
});

describe('/internal/maintenance', () => {
  const saved = process.env.RESTART_COUNTDOWN_SECRET;
  afterEach(() => {
    resetMaintenanceForTests();
    if (saved === undefined) delete process.env.RESTART_COUNTDOWN_SECRET;
    else process.env.RESTART_COUNTDOWN_SECRET = saved;
  });

  async function call(method: 'GET' | 'POST', body: unknown, secret = 's3cret') {
    const route = routes.find((r) => r.method === method && r.path === '/internal/maintenance');
    if (!route) throw new Error('route missing');
    const ctx = fakeCtx({
      method,
      url: '/internal/maintenance',
      headers: { 'x-woc-deploy-secret': secret, 'content-type': 'application/json' },
      body,
    });
    const chain = route.middleware ?? [];
    let i = -1;
    const next = async (): Promise<void> => {
      i++;
      if (i < chain.length) await chain[i](ctx, next);
      else await route.handler(ctx);
    };
    await next();
    const res = ctx.res as unknown as FakeRes & http.ServerResponse;
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }

  it('is secret-gated and drives the controller', async () => {
    process.env.RESTART_COUNTDOWN_SECRET = 's3cret';
    expect((await call('POST', { action: 'start' }, 'wrong')).status).not.toBe(200);
    const started = await call('POST', { action: 'start', minutes: 5 });
    expect(started.status).toBe(200);
    expect(maintenance().status().phase).toBe('countdown');
    expect((await call('POST', { action: 'start', minutes: 5 })).status).toBe(409);
    expect((await call('GET', undefined)).body.data.phase).toBe('countdown');
    expect((await call('POST', { action: 'cancel' })).status).toBe(200);
    expect((await call('POST', { action: 'nope' })).status).toBe(400);
    expect((await call('POST', { action: 'start', minutes: 999 })).status).toBe(400);
    maintenance().cancel();
  });
});

describe('client version gate', () => {
  it('compares x.y.z numerically and fails open on a garbage minimum', () => {
    expect(parseClientVersion('0.45.10')).toEqual([0, 45, 10]);
    expect(parseClientVersion('v1.2.3-beta.1')).toEqual([1, 2, 3]);
    expect(clientVersionAllowed('0.45.9', '0.45.10')).toBe(true);
    expect(clientVersionAllowed('0.46.0', '0.45.10')).toBe(false);
    expect(clientVersionAllowed('0.46.0', undefined)).toBe(false);
    expect(clientVersionAllowed(undefined, undefined)).toBe(true);
    expect(clientVersionAllowed('latest', '0.0.1')).toBe(true);
  });
});
