// Boot refusal for ALLOW_DEV_COMMANDS=1 in production. The flag arms the whole
// /dev cheat set (level, teleport, item grants, mob spawns) and the dev-only
// /api/perf read; on a public realm that is a game-economy kill switch, so a
// production boot that carries it stops before it touches the database.
//
// "Production" is NODE_ENV=production (the Dockerfile sets it for every image)
// or WOC_ENV=production (an explicit operator marker for a bare-metal host).
// The ONE override is ALLOW_DEV_COMMANDS_LOCAL_OVERRIDE=1, and it is honored
// only when the database is on this machine (a loopback DATABASE_URL host):
// that is the local-dev case of running the production image against a local
// Postgres. A real deployment's database is never loopback from inside its
// container (compose names the service), so the override cannot reach one.
// Pure: env in, verdict out; server/main.ts startServer throws on a refusal.

export type DevCommandsBootVerdict =
  | { ok: true; devCommands: boolean; overridden: boolean }
  | { ok: false; reason: 'production' | 'override_not_local' };

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** The DATABASE_URL host is this machine (the only place the override counts). */
export function databaseIsLocal(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isProductionEnv(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'production' || (env.WOC_ENV ?? '').trim() === 'production';
}

export function devCommandsBootVerdict(env: NodeJS.ProcessEnv): DevCommandsBootVerdict {
  const devCommands = env.ALLOW_DEV_COMMANDS === '1';
  if (!devCommands || !isProductionEnv(env)) {
    return { ok: true, devCommands, overridden: false };
  }
  if (env.ALLOW_DEV_COMMANDS_LOCAL_OVERRIDE !== '1') return { ok: false, reason: 'production' };
  if (!databaseIsLocal(env.DATABASE_URL)) return { ok: false, reason: 'override_not_local' };
  return { ok: true, devCommands, overridden: true };
}

/** Throw (fail the boot) on a refusal; log loudly when the local override is used. */
export function assertDevCommandsBootSafe(
  env: NodeJS.ProcessEnv,
  log: (line: string) => void = console.warn,
): void {
  const verdict = devCommandsBootVerdict(env);
  if (!verdict.ok) {
    throw new Error(
      verdict.reason === 'production'
        ? 'refusing to boot: ALLOW_DEV_COMMANDS=1 in a production environment (NODE_ENV or WOC_ENV is production). Unset it.'
        : 'refusing to boot: ALLOW_DEV_COMMANDS_LOCAL_OVERRIDE=1 is only honored with a loopback DATABASE_URL (local dev).',
    );
  }
  if (verdict.overridden) {
    log(
      'WARNING: ALLOW_DEV_COMMANDS=1 under a production NODE_ENV via the LOCAL override (loopback database). Never do this on a public realm.',
    );
  }
}
