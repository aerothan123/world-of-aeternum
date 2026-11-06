// Pure planning for scripts/steam_depot_build.mjs (SteamPipe upload of the
// Windows Steam build; runbook: docs/launch/steam-depot-builds.md). Everything
// a Vitest can pin lives here: flag parsing, id validation, template rendering
// and the exact steamcmd argv. No fs, no child_process, no network.
//
// Wyndlewood ships Windows only, so there is ONE depot (the win-unpacked
// layout from `npm run electron:build:steam`). The same templates serve the
// Steam Playtest app: pass its own app id and depot id.

export const DEFAULT_CONTENT_ROOT = 'release-steam/win-unpacked';
export const DEFAULT_OUTPUT_DIR = 'release-steam/steampipe';

const FLAGS = new Map([
  ['--app-id', 'appId'],
  ['--depot-id', 'depotId'],
  ['--content-root', 'contentRoot'],
  ['--output-dir', 'outputDir'],
  ['--desc', 'desc'],
  ['--set-live', 'setLive'],
  ['--steam-user', 'steamUser'],
]);

/** Parse argv (after the script path) into options. Env fills the ids so a
 *  CI or a local shell never has to type them; nothing here is a secret
 *  (app and depot ids are public), and there is deliberately NO password
 *  flag: steamcmd prompts for it, and Steam Guard caches the login. */
export function parseDepotArgs(argv, env = {}) {
  const opts = {
    appId: env.STEAM_APP_ID ?? env.WOC_STEAM_APP_ID ?? '',
    depotId: env.STEAM_DEPOT_ID_WIN ?? '',
    contentRoot: DEFAULT_CONTENT_ROOT,
    outputDir: DEFAULT_OUTPUT_DIR,
    desc: '',
    setLive: '',
    steamUser: env.STEAM_BUILD_USER ?? '',
    run: false,
    preview: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--run') opts.run = true;
    else if (arg === '--preview') opts.preview = true;
    else if (arg === '--password' || arg.startsWith('--password=')) {
      throw new Error('steam_depot_build: never pass a password; steamcmd prompts for it');
    } else if (FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      opts[FLAGS.get(arg)] = value;
      i++;
    } else throw new Error(`unknown flag ${arg}`);
  }
  return opts;
}

function steamId(value, label) {
  if (!/^[1-9]\d{0,9}$/.test(String(value))) {
    throw new Error(
      `${label} must be a numeric Steamworks id (got ${value === '' ? 'nothing' : value})`,
    );
  }
  return String(value);
}

/** Branch names Steamworks accepts for SetLive. "default" is refused here on
 *  purpose: promoting to the public branch is a click in the partner site after
 *  a smoke test, never a side effect of an upload. */
export function setLiveBranch(value) {
  if (value === '' || value === undefined) return '';
  if (!/^[a-z0-9_-]{1,32}$/i.test(value)) throw new Error(`invalid --set-live branch ${value}`);
  if (value.toLowerCase() === 'default') {
    throw new Error(
      '--set-live default is refused: promote to default in Steamworks after testing',
    );
  }
  return value;
}

/** VDF string escape (backslash and quote). Paths are absolute and may hold
 *  spaces; VDF quoting handles those. */
export function vdfEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_m, key) => {
    if (!(key in values)) throw new Error(`template placeholder {{${key}}} has no value`);
    return vdfEscape(values[key]);
  });
}

/**
 * The whole upload plan. `paths` carries the absolute paths the entry script
 * resolved (content root, output dir, and where the rendered VDFs land).
 */
export function planDepotBuild(opts, paths) {
  const appId = steamId(opts.appId, 'app id (--app-id or STEAM_APP_ID)');
  const depotId = steamId(opts.depotId, 'Windows depot id (--depot-id or STEAM_DEPOT_ID_WIN)');
  const setLive = setLiveBranch(opts.setLive);
  const desc = (opts.desc || `Wyndlewood build ${paths.stamp}`).slice(0, 120);
  const values = {
    APP_ID: appId,
    DEPOT_WIN: depotId,
    BUILD_DESC: desc,
    BUILD_OUTPUT: paths.buildOutput,
    CONTENT_ROOT: paths.contentRoot,
    SET_LIVE: setLive,
    PREVIEW: opts.preview ? '1' : '0',
    DEPOT_WIN_VDF: paths.depotVdf,
  };
  const steamcmdArgv =
    opts.steamUser === ''
      ? null
      : ['+login', opts.steamUser, '+run_app_build', paths.appVdf, '+quit'];
  return { appId, depotId, setLive, desc, values, steamcmdArgv };
}
