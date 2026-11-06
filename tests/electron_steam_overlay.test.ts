// The Windows Steam overlay hook decision (electron/steam_overlay.cjs) and its
// wiring in electron/main.cjs (before app ready, never on other channels).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applySteamOverlay,
  OVERLAY_OPT_OUT_FLAG,
  planSteamOverlay,
} from '../electron/steam_overlay.cjs';

describe('planSteamOverlay', () => {
  it('enables on the Windows Steam build only', () => {
    expect(planSteamOverlay({ distribution: 'steam', platform: 'win32', argv: [] })).toEqual({
      enable: true,
      reason: 'steam-windows',
    });
    expect(planSteamOverlay({ distribution: 'website', platform: 'win32', argv: [] }).enable).toBe(
      false,
    );
    expect(planSteamOverlay({ distribution: 'epic', platform: 'win32', argv: [] }).enable).toBe(
      false,
    );
    // Linux keeps the GPU-sandbox guard; in-process GPU is what it measured and rejected.
    expect(planSteamOverlay({ distribution: 'steam', platform: 'linux', argv: [] }).reason).toBe(
      'platform',
    );
  });

  it('honors the --no-steam-overlay launch option', () => {
    expect(OVERLAY_OPT_OUT_FLAG).toBe('--no-steam-overlay');
    expect(
      planSteamOverlay({
        distribution: 'steam',
        platform: 'win32',
        argv: ['x.exe', OVERLAY_OPT_OUT_FLAG],
      }),
    ).toEqual({ enable: false, reason: 'opted-out' });
  });

  it('the unpackaged WOC_STEAM_DEV loop can exercise it', () => {
    expect(
      planSteamOverlay({ distribution: 'website', platform: 'win32', steamEnabled: true }).enable,
    ).toBe(true);
  });
});

describe('applySteamOverlay', () => {
  it('calls the steamworks.js hook WITHOUT the per-frame invalidator', () => {
    const hook = vi.fn();
    const ok = applySteamOverlay({
      plan: { enable: true, reason: 'steam-windows' },
      requireSteamworks: () => ({ electronEnableSteamOverlay: hook }),
    });
    expect(ok).toBe(true);
    expect(hook).toHaveBeenCalledWith(true);
  });

  it('never loads steamworks.js when the plan is off, and never throws', () => {
    const load = vi.fn(() => ({ electronEnableSteamOverlay: vi.fn() }));
    expect(
      applySteamOverlay({ plan: { enable: false, reason: 'not-steam' }, requireSteamworks: load }),
    ).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(
      applySteamOverlay({
        plan: { enable: true, reason: 'steam-windows' },
        requireSteamworks: () => {
          throw new Error('native module missing');
        },
      }),
    ).toBe(false);
  });

  it('is wired in main.cjs before app ready', () => {
    const main = fs.readFileSync(path.resolve(process.cwd(), 'electron/main.cjs'), 'utf8');
    const apply = main.indexOf('applySteamOverlay({');
    const firstReady = main.indexOf('app.whenReady()');
    expect(apply).toBeGreaterThan(0);
    expect(apply).toBeLessThan(firstReady);
  });
});
