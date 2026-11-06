// Boot refusal for ALLOW_DEV_COMMANDS=1 in production. The flag arms the whole
// /dev cheat set (level, teleport, item grants, mob spawns) and the dev-only
// /api/perf read; on a public realm that is a game-economy kill switch, so a
// production boot that carries it stops before it touches the database.
//
// FAIL CLOSED: the flag is honored ONLY on a host that says it is not
// production, with an explicit WOC_ENV=development or WOC_ENV=test. An unset
// or unknown WOC_ENV refuses, so a realm whose operator forgot every marker can
// never come up with cheats on. WOC_ENV=production refuses outright, override
// or not.
//
// NODE_ENV=production (the Dockerfile sets it for every image) with a dev
// WOC_ENV still refuses unless ALLOW_DEV_COMMANDS_LOCAL_OVERRIDE=1 is set AND
// the database is on this machine (a loopback DATABASE_URL host): the local
// case of running the production image against a local Postgres. A real
// deployment's database is never loopback from inside its container (compose
// names the service), so the override cannot reach one.
// Pure: env in, verdict out; server/main.ts startServer throws on a refusal.

export type DevCommandsBootVerdict =
  | { ok: true; devCommands: boolean; overridden: boolean }
  | { ok: false; reason: 'production' | 'not_dev_env' | 'override_not_local' };

/** The WOC_ENV values that may arm dev commands. */
const DEV_ENVS = new Set(['development', 'test']);

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
  if (!devCommands) return { ok: true, devCommands, overridden: false };
  const wocEnv = (env.WOC_ENV ?? '').trim();
  if (wocEnv === 'production') return { ok: false, reason: 'production' };
  if (!DEV_ENVS.has(wocEnv)) return { ok: false, reason: 'not_dev_env' };
  if (env.NODE_ENV !== 'production') return { ok: true, devCommands, overridden: false };
  if (env.ALLOW_DEV_COMMANDS_LOCAL_OVERRIDE !== '1') return { ok: false, reason: 'production' };
  if (!databaseIsLocal(env.DATABASE_URL)) return { ok: false, reason: 'override_not_local' };
  return { ok: true, devCommands, overridden: true };
}

const BOOT_REFUSAL: Record<'production' | 'not_dev_env' | 'override_not_local', string> = {
  production:
    'refusing to boot: ALLOW_DEV_COMMANDS=1 in a production environment (NODE_ENV or WOC_ENV is production). Unset it.',
  not_dev_env:
    'refusing to boot: ALLOW_DEV_COMMANDS=1 needs an explicit WOC_ENV=development (or WOC_ENV=test) on this host.',
  override_not_local:
    'refusing to boot: ALLOW_DEV_COMMANDS_LOCAL_OVERRIDE=1 is only honored with a loopback DATABASE_URL (local dev).',
};

/** Throw (fail the boot) on a refusal; log loudly when the local override is used. */
export function assertDevCommandsBootSafe(
  env: NodeJS.ProcessEnv,
  log: (line: string) => void = console.warn,
): void {
  const verdict = devCommandsBootVerdict(env);
  if (!verdict.ok) {
    throw new Error(BOOT_REFUSAL[verdict.reason]);
  }
  if (verdict.overridden) {
    log(
      'WARNING: ALLOW_DEV_COMMANDS=1 under a production NODE_ENV via the LOCAL override (loopback database). Never do this on a public realm.',
    );
  }
}
