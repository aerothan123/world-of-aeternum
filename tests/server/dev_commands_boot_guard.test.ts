// The production boot refusal for ALLOW_DEV_COMMANDS=1 (server/dev_commands_boot_guard.ts)
// and its wiring at the top of server/main.ts startServer.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertDevCommandsBootSafe,
  databaseIsLocal,
  devCommandsBootVerdict,
} from '../../server/dev_commands_boot_guard';

const REMOTE_DB = 'postgres://eastbrook:pw@db:5432/eastbrook';
const LOCAL_DB = 'postgres://test:test@127.0.0.1:5433/wocc';

describe('devCommandsBootVerdict', () => {
  it('lets every non-dev-command boot through, production or not', () => {
    expect(devCommandsBootVerdict({ NODE_ENV: 'production', DATABASE_URL: REMOTE_DB }).ok).toBe(
      true,
    );
    expect(devCommandsBootVerdict({}).ok).toBe(true);
  });

  it('allows dev commands outside production (local dev, E2E)', () => {
    expect(devCommandsBootVerdict({ ALLOW_DEV_COMMANDS: '1' })).toEqual({
      ok: true,
      devCommands: true,
      overridden: false,
    });
  });

  it('refuses ALLOW_DEV_COMMANDS=1 under NODE_ENV or WOC_ENV production', () => {
    for (const env of [
      { ALLOW_DEV_COMMANDS: '1', NODE_ENV: 'production', DATABASE_URL: REMOTE_DB },
      { ALLOW_DEV_COMMANDS: '1', WOC_ENV: 'production', DATABASE_URL: LOCAL_DB },
    ]) {
      expect(devCommandsBootVerdict(env)).toEqual({ ok: false, reason: 'production' });
    }
  });

  it('honors the local override only with a loopback database', () => {
    const base = {
      ALLOW_DEV_COMMANDS: '1',
      NODE_ENV: 'production',
      ALLOW_DEV_COMMANDS_LOCAL_OVERRIDE: '1',
    };
    expect(devCommandsBootVerdict({ ...base, DATABASE_URL: LOCAL_DB })).toMatchObject({
      ok: true,
      overridden: true,
    });
    expect(devCommandsBootVerdict({ ...base, DATABASE_URL: REMOTE_DB })).toEqual({
      ok: false,
      reason: 'override_not_local',
    });
    expect(devCommandsBootVerdict({ ...base })).toEqual({
      ok: false,
      reason: 'override_not_local',
    });
  });

  it('recognizes loopback hosts only', () => {
    expect(databaseIsLocal('postgres://a@localhost/x')).toBe(true);
    expect(databaseIsLocal('postgres://a@[::1]:5432/x')).toBe(true);
    expect(databaseIsLocal('postgres://a@10.0.0.5/x')).toBe(false);
    expect(databaseIsLocal('not a url')).toBe(false);
  });
});

describe('assertDevCommandsBootSafe', () => {
  it('throws on a refusal and warns on the override', () => {
    expect(() =>
      assertDevCommandsBootSafe({
        ALLOW_DEV_COMMANDS: '1',
        NODE_ENV: 'production',
        DATABASE_URL: REMOTE_DB,
      }),
    ).toThrow(/refusing to boot/);
    const log = vi.fn();
    assertDevCommandsBootSafe(
      {
        ALLOW_DEV_COMMANDS: '1',
        NODE_ENV: 'production',
        ALLOW_DEV_COMMANDS_LOCAL_OVERRIDE: '1',
        DATABASE_URL: LOCAL_DB,
      },
      log,
    );
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('runs first thing in startServer', () => {
    const main = fs.readFileSync(path.resolve(process.cwd(), 'server/main.ts'), 'utf8');
    const start = main.indexOf('export async function startServer()');
    const guard = main.indexOf('assertDevCommandsBootSafe(process.env)', start);
    const config = main.indexOf('const config = activeConfig()', start);
    expect(start).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(start);
    expect(guard).toBeLessThan(config);
  });
});
