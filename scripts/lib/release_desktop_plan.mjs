// Pure planning for scripts/release_desktop.mjs (the one-command self-hosted
// desktop release; runbook: docs/desktop-self-hosted-updates.md). Everything a
// Vitest can pin lives here: flag parsing, the version choice, feed-file
// parsing, the artifact list, the build env, and the exact scp/ssh argv the
// entry script spawns. No fs, no child_process, no network: the entry script
// injects what it read and runs what this module returns.

import { isSemver, resolveUpdateFeedUrl } from '../electron-builder-config.mjs';

export const DEFAULT_ORIGIN = 'https://104-248-71-233.sslip.io';
export const DEFAULT_HOST = 'root@104.248.71.233';
export const DEFAULT_KEY = ['.ssh', 'projecth_do'];
export const DEFAULT_REMOTE_DIR = '/var/www/downloads/desktop';
export const DEFAULT_INSTALLER_NAME = 'Project-H-Setup.exe';
// Self-hosted builds bake a non-production origin, so they publish and read
// the 'dev' update channel (electron/update_guard.cjs); its Windows feed file
// is dev.yml (electron-updater getChannelFilename: `${channel}.yml`).
export const FEED_CHANNEL = 'dev';
export const FEED_FILE = `${FEED_CHANNEL}.yml`;

const FLAGS = new Map([
  ['--origin', 'origin'],
  ['--version', 'version'],
  ['--host', 'host'],
  ['--key', 'key'],
  ['--remote-dir', 'remoteDir'],
  ['--installer-name', 'installerName'],
  ['--feed-url', 'feedUrl'],
]);

// Parse the CLI flags. Every flag takes one value (`--origin X` or
// `--origin=X`); `--dry-run` is the one boolean. Unknown flags and a missing
// value throw so a typo never silently releases with a default. homedir
// resolves the default key path; joinPath keeps the module path-library-free.
export function parseReleaseArgs(argv, { homedir, joinPath }) {
  const out = {
    origin: DEFAULT_ORIGIN,
    version: '',
    host: DEFAULT_HOST,
    key: joinPath(homedir, ...DEFAULT_KEY),
    remoteDir: DEFAULT_REMOTE_DIR,
    installerName: DEFAULT_INSTALLER_NAME,
    feedUrl: '',
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const field = FLAGS.get(name);
    if (!field) throw new Error(`release_desktop: unknown flag ${arg}`);
    let value;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
    } else {
      i += 1;
      value = argv[i];
    }
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
      throw new Error(`release_desktop: ${name} needs a value`);
    }
    out[field] = value;
  }
  if (out.origin.endsWith('/')) out.origin = out.origin.replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(out.origin)) {
    throw new Error(
      `release_desktop: --origin must be a bare http(s) origin (no path); got "${out.origin}"`,
    );
  }
  return out;
}

// The feed URL this release publishes to and the packaged app reads back:
// the same resolver the build uses, so the two cannot drift.
export function releaseFeedUrl({ origin, feedUrl = '' }) {
  const url = resolveUpdateFeedUrl({ baseUrl: '', apiOrigin: origin, updateFeedUrl: feedUrl });
  if (!url) {
    // The production origin keeps the official feed host (package.json
    // publish.url) and is released by CI; a self-hosted release of it must
    // say where its feed lives.
    throw new Error(`release_desktop: pass --feed-url to self-host a release for ${origin}`);
  }
  return url;
}

function semverParts(value) {
  const core = value.split(/[-+]/, 1)[0];
  return core.split('.').map((n) => Number(n));
}

// Numeric x.y.z comparison (pre-release tags are ignored: the release script
// never emits them, and electron-updater treats 1.2.3-x as older than 1.2.3).
export function compareSemver(a, b) {
  const pa = semverParts(a);
  const pb = semverParts(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

export function bumpPatch(value) {
  const [major, minor, patch] = semverParts(value);
  return `${major}.${minor}.${patch + 1}`;
}

// The version this release is stamped with. electron-updater only installs a
// STRICTLY greater semver, so without --version the answer is the next patch
// after whichever is newer: the repo's package.json version or the version
// the live feed already serves. That keeps every release greater than the
// last published one even when package.json lags (it is never bumped here:
// it fingerprints shipped GLB assets) and never below package.json when a
// release branch bumps it. An explicit --version must be semver and greater
// than the live feed version; rolling back is a feed-file operation
// (docs/desktop-self-hosted-updates.md), never a lower stamp.
export function chooseReleaseVersion({ requested = '', packageVersion, feedVersion = null }) {
  if (!isSemver(packageVersion)) {
    throw new Error(`package.json version is not semver: "${packageVersion}"`);
  }
  if (feedVersion !== null && !isSemver(feedVersion)) {
    throw new Error(`live feed version is not semver: "${feedVersion}"`);
  }
  if (requested !== '' && requested !== null && requested !== undefined) {
    if (!isSemver(requested)) {
      throw new Error(`--version must be semver (x.y.z); got "${requested}"`);
    }
    if (feedVersion !== null && compareSemver(requested, feedVersion) <= 0) {
      throw new Error(
        `--version ${requested} is not greater than the live feed version ${feedVersion}; ` +
          'installed apps would never pick it up (to roll back, re-upload the older feed file)',
      );
    }
    return { version: requested, reason: 'requested' };
  }
  const newest =
    feedVersion !== null && compareSemver(feedVersion, packageVersion) > 0
      ? { version: feedVersion, reason: 'next patch after the live feed' }
      : { version: packageVersion, reason: 'next patch after package.json' };
  return { version: bumpPatch(newest.version), reason: newest.reason };
}

// `version: x.y.z` from an electron-builder feed yml; null when absent.
export function parseFeedVersion(ymlText) {
  if (typeof ymlText !== 'string') return null;
  const m = ymlText.match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m);
  return m ? m[1] : null;
}

// Every artifact file name a feed yml references: the `files: - url:` entries
// plus the top-level `path:` (electron-builder writes both; the set is
// deduplicated). Names only, never URLs with slashes: the feed is flat.
export function feedArtifactNames(ymlText) {
  if (typeof ymlText !== 'string') return [];
  const names = new Set();
  for (const m of ymlText.matchAll(/^\s*(?:-\s*url|path):\s*['"]?([^'"\s]+)['"]?\s*$/gm)) {
    if (!m[1].includes('/')) names.add(m[1]);
  }
  return [...names];
}

// The local files one release uploads: the feed file, every artifact it
// references, and each artifact's `.blockmap` when the build emitted one
// (differential downloads; optional, a full download works without it).
// `exists` is injected so the planner stays fs-free. A referenced artifact
// that is missing on disk throws: a feed pointing at a file the host does not
// have would brick every install's update check until the next release.
export function releaseArtifacts({ outDir, ymlText, exists, joinPath }) {
  const names = feedArtifactNames(ymlText);
  if (names.length === 0) {
    throw new Error(`release_desktop: ${FEED_FILE} references no artifact; refusing to upload`);
  }
  const files = [joinPath(outDir, FEED_FILE)];
  const installers = [];
  for (const name of names) {
    const local = joinPath(outDir, name);
    if (!exists(local)) throw new Error(`release_desktop: ${FEED_FILE} references missing ${name}`);
    files.push(local);
    installers.push(name);
    const blockmap = `${local}.blockmap`;
    if (exists(blockmap)) files.push(blockmap);
  }
  return { files, installers };
}

// The installer whose copy becomes the friends' stable download link: the
// one .exe the feed names (the NSIS installer; a zip target never rides the
// Windows feed). More than one .exe is ambiguous and refused.
export function primaryInstaller(installers) {
  const exes = installers.filter((name) => name.toLowerCase().endsWith('.exe'));
  if (exes.length !== 1) {
    throw new Error(
      `release_desktop: expected exactly one .exe in ${FEED_FILE}, found ${exes.length}`,
    );
  }
  return exes[0];
}

// Env for `node scripts/electron-build.mjs build website`: the baked origin
// (which also selects the 'dev' channel), the feed URL, and the version
// stamp. The caller spreads process.env underneath.
export function releaseBuildEnv({ origin, feedUrl, version }) {
  return {
    VITE_DESKTOP_API_ORIGIN: origin,
    WOC_DESKTOP_UPDATE_URL: feedUrl,
    WOC_DESKTOP_VERSION: version,
  };
}

// A remote path quoted for the droplet's POSIX shell. Our remote paths are
// operator-chosen and plain, but single-quoting keeps a space or glob
// character in a flag value from becoming shell syntax over ssh.
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// The exact commands the entry script runs after the build, in order:
//  1. ssh: make sure the feed directory exists;
//  2. scp: upload the feed file, installer(s) and blockmap(s) in one call
//     (the installer lands before the feed file is swapped only in the sense
//     that scp writes them in argv order; a client that polls mid-upload sees
//     the old dev.yml or a new one whose artifact is already there);
//  3. ssh: copy the versioned installer over the friends' stable link name in
//     the parent directory, so the plain download always serves the newest.
// scp and ssh are real executables on every platform that has OpenSSH
// (Windows ships ssh.exe/scp.exe), so no shell is involved locally; the argv
// is passed straight to the binary and a local path with spaces survives.
export function remoteCommands({ host, key, files, remoteDir, installerName, friendlyName }) {
  const auth = ['-i', key, '-o', 'StrictHostKeyChecking=accept-new'];
  const friendly = `${remoteDir.replace(/\/[^/]+$/, '')}/${friendlyName}`;
  return [
    {
      step: 'ensure the remote feed directory exists',
      command: 'ssh',
      args: [...auth, host, `mkdir -p ${shellQuote(remoteDir)}`],
    },
    {
      step: 'upload the feed file, installer and blockmap',
      command: 'scp',
      args: [...auth, ...files, `${host}:${remoteDir}/`],
    },
    {
      step: `refresh the stable download link ${friendlyName}`,
      command: 'ssh',
      args: [
        ...auth,
        host,
        `cp -f ${shellQuote(`${remoteDir}/${installerName}`)} ${shellQuote(friendly)}`,
      ],
    },
  ];
}

// What the operator reads at the end (and what a dry run prints instead of
// running anything).
// The friends' link sits one directory above the feed, mirroring the remote
// `cp` in remoteCommands (feed dir /var/www/downloads/desktop, link in
// /var/www/downloads, both served under the same Caddy handle_path).
export function releaseSummary({ feedUrl, version, installerName, friendlyName }) {
  const downloads = feedUrl.replace(/\/[^/]+$/, '');
  return [
    `version:        ${version}`,
    `feed:           ${feedUrl}/${FEED_FILE}`,
    `installer:      ${feedUrl}/${installerName}`,
    `friends' link:  ${downloads}/${friendlyName}`,
  ];
}
