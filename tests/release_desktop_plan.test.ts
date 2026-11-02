import { describe, expect, it } from 'vitest';
import {
  bumpPatch,
  chooseReleaseVersion,
  compareSemver,
  DEFAULT_HOST,
  DEFAULT_ORIGIN,
  DEFAULT_REMOTE_DIR,
  FEED_FILE,
  feedArtifactNames,
  parseFeedVersion,
  parseReleaseArgs,
  primaryInstaller,
  releaseArtifacts,
  releaseBuildEnv,
  releaseFeedUrl,
  releaseSummary,
  remoteCommands,
  shellQuote,
} from '../scripts/lib/release_desktop_plan.mjs';

// Pins the pure half of scripts/release_desktop.mjs (the one-command
// self-hosted desktop release; docs/desktop-self-hosted-updates.md). The
// entry script is never executed here: it would build and scp.

const joinPath = (...parts: string[]) => parts.join('/');
const deps = { homedir: '/home/owner', joinPath };

// A realistic electron-builder Windows feed file (dev channel, nsis target),
// including the wocApiOrigin stamp scripts/electron-build.mjs appends.
const FEED = `version: 0.45.7
files:
  - url: world-of-claudecraft-0.45.7-win-x64.exe
    sha512: abc==
    size: 123456
path: world-of-claudecraft-0.45.7-win-x64.exe
sha512: abc==
releaseDate: '2026-11-02T10:00:00.000Z'
wocApiOrigin: "https://104-248-71-233.sslip.io"
`;

describe('parseReleaseArgs', () => {
  it('defaults to the droplet origin, host, key and feed directory', () => {
    const args = parseReleaseArgs([], deps);
    expect(args).toEqual({
      origin: DEFAULT_ORIGIN,
      version: '',
      host: DEFAULT_HOST,
      key: '/home/owner/.ssh/projecth_do',
      remoteDir: DEFAULT_REMOTE_DIR,
      installerName: 'Project-H-Setup.exe',
      feedUrl: '',
      dryRun: false,
    });
    expect(DEFAULT_ORIGIN).toBe('https://104-248-71-233.sslip.io');
    expect(DEFAULT_REMOTE_DIR).toBe('/var/www/downloads/desktop');
  });

  it('accepts both `--flag value` and `--flag=value`, plus --dry-run', () => {
    const args = parseReleaseArgs(
      ['--version', '0.50.0', '--key=C:\\Users\\me\\my key\\projecth_do', '--dry-run'],
      deps,
    );
    expect(args.version).toBe('0.50.0');
    expect(args.key).toBe('C:\\Users\\me\\my key\\projecth_do');
    expect(args.dryRun).toBe(true);
  });

  it('strips a trailing slash from the origin and refuses an origin with a path', () => {
    expect(parseReleaseArgs(['--origin', 'https://x.example/'], deps).origin).toBe(
      'https://x.example',
    );
    expect(() => parseReleaseArgs(['--origin', 'https://x.example/api'], deps)).toThrow(
      /bare http\(s\) origin/,
    );
  });

  it('refuses unknown flags and flags without a value', () => {
    expect(() => parseReleaseArgs(['--bogus'], deps)).toThrow(/unknown flag/);
    expect(() => parseReleaseArgs(['--version'], deps)).toThrow(/needs a value/);
    expect(() => parseReleaseArgs(['--version', '--dry-run'], deps)).toThrow(/needs a value/);
  });
});

describe('releaseFeedUrl', () => {
  it('derives the self-hosted feed under the origin', () => {
    expect(releaseFeedUrl({ origin: DEFAULT_ORIGIN })).toBe(
      'https://104-248-71-233.sslip.io/downloads/desktop',
    );
  });

  it('lets an explicit feed URL win and drops its trailing slash', () => {
    expect(releaseFeedUrl({ origin: DEFAULT_ORIGIN, feedUrl: 'https://cdn.example/d/' })).toBe(
      'https://cdn.example/d',
    );
  });

  it('refuses to self-host the production origin without an explicit feed URL', () => {
    expect(() => releaseFeedUrl({ origin: 'https://worldofclaudecraft.com' })).toThrow(
      /--feed-url/,
    );
  });
});

describe('version choice', () => {
  it('compares and bumps numerically, not lexically', () => {
    expect(compareSemver('0.45.10', '0.45.9')).toBe(1);
    expect(compareSemver('1.0.0', '0.99.99')).toBe(1);
    expect(compareSemver('0.45.7', '0.45.7')).toBe(0);
    expect(bumpPatch('0.45.9')).toBe('0.45.10');
  });

  it('first release: next patch after package.json', () => {
    expect(chooseReleaseVersion({ packageVersion: '0.45.6', feedVersion: null })).toEqual({
      version: '0.45.7',
      reason: 'next patch after package.json',
    });
  });

  it('follows the live feed when it is ahead of package.json', () => {
    expect(chooseReleaseVersion({ packageVersion: '0.45.6', feedVersion: '0.45.9' })).toEqual({
      version: '0.45.10',
      reason: 'next patch after the live feed',
    });
  });

  it('follows package.json when a release branch bumped it past the feed', () => {
    expect(chooseReleaseVersion({ packageVersion: '0.46.0', feedVersion: '0.45.9' }).version).toBe(
      '0.46.1',
    );
    // Equal: still strictly greater than both.
    expect(chooseReleaseVersion({ packageVersion: '0.45.7', feedVersion: '0.45.7' }).version).toBe(
      '0.45.8',
    );
  });

  it('honors an explicit --version only when it is semver and greater than the feed', () => {
    expect(
      chooseReleaseVersion({ requested: '1.0.0', packageVersion: '0.45.6', feedVersion: '0.45.9' }),
    ).toEqual({ version: '1.0.0', reason: 'requested' });
    expect(() =>
      chooseReleaseVersion({
        requested: '0.45.9',
        packageVersion: '0.45.6',
        feedVersion: '0.45.9',
      }),
    ).toThrow(/not greater than the live feed version/);
    expect(() =>
      chooseReleaseVersion({
        requested: '0.45.8',
        packageVersion: '0.45.6',
        feedVersion: '0.45.9',
      }),
    ).toThrow(/re-upload the older feed file/);
    for (const requested of ['v1.2.3', '1.2', '2026-11-02', '1.2.3.4']) {
      expect(() => chooseReleaseVersion({ requested, packageVersion: '0.45.6' })).toThrow(
        /must be semver/,
      );
    }
  });

  it('refuses a non-semver package.json or feed version instead of guessing', () => {
    expect(() => chooseReleaseVersion({ packageVersion: 'latest' })).toThrow(/package.json/);
    expect(() => chooseReleaseVersion({ packageVersion: '0.45.6', feedVersion: 'x' })).toThrow(
      /live feed version/,
    );
  });
});

describe('feed file parsing', () => {
  it('reads the version and the artifact names out of a feed yml', () => {
    expect(parseFeedVersion(FEED)).toBe('0.45.7');
    expect(parseFeedVersion("version: '1.2.3'\n")).toBe('1.2.3');
    expect(parseFeedVersion('files: []\n')).toBeNull();
    expect(parseFeedVersion(undefined)).toBeNull();
    expect(feedArtifactNames(FEED)).toEqual(['world-of-claudecraft-0.45.7-win-x64.exe']);
    expect(feedArtifactNames('')).toEqual([]);
  });

  it('ignores a url with a path (the feed is flat) and dedupes files/path', () => {
    const yml = 'files:\n  - url: a.exe\n  - url: sub/b.exe\npath: a.exe\n';
    expect(feedArtifactNames(yml)).toEqual(['a.exe']);
  });
});

describe('releaseArtifacts', () => {
  const outDir = '/repo/release';

  it('lists the feed file, each artifact and its blockmap when present', () => {
    const present = new Set([
      `${outDir}/world-of-claudecraft-0.45.7-win-x64.exe`,
      `${outDir}/world-of-claudecraft-0.45.7-win-x64.exe.blockmap`,
    ]);
    const plan = releaseArtifacts({
      outDir,
      ymlText: FEED,
      exists: (p) => present.has(p),
      joinPath,
    });
    expect(plan.files).toEqual([
      `${outDir}/${FEED_FILE}`,
      `${outDir}/world-of-claudecraft-0.45.7-win-x64.exe`,
      `${outDir}/world-of-claudecraft-0.45.7-win-x64.exe.blockmap`,
    ]);
    expect(plan.installers).toEqual(['world-of-claudecraft-0.45.7-win-x64.exe']);
  });

  it('tolerates a missing blockmap but refuses a missing installer or an empty feed', () => {
    const exeOnly = new Set([`${outDir}/world-of-claudecraft-0.45.7-win-x64.exe`]);
    expect(
      releaseArtifacts({ outDir, ymlText: FEED, exists: (p) => exeOnly.has(p), joinPath }).files,
    ).toHaveLength(2);
    expect(() =>
      releaseArtifacts({ outDir, ymlText: FEED, exists: () => false, joinPath }),
    ).toThrow(/references missing/);
    expect(() =>
      releaseArtifacts({ outDir, ymlText: 'version: 1.0.0\n', exists: () => true, joinPath }),
    ).toThrow(/references no artifact/);
  });

  it('picks exactly one .exe as the primary installer', () => {
    expect(primaryInstaller(['a.exe'])).toBe('a.exe');
    expect(() => primaryInstaller([])).toThrow(/exactly one \.exe/);
    expect(() => primaryInstaller(['a.exe', 'b.exe'])).toThrow(/exactly one \.exe/);
  });
});

describe('build env and remote commands', () => {
  it('hands the build the origin, the feed URL and the version stamp', () => {
    expect(
      releaseBuildEnv({
        origin: DEFAULT_ORIGIN,
        feedUrl: `${DEFAULT_ORIGIN}/downloads/desktop`,
        version: '0.45.7',
      }),
    ).toEqual({
      VITE_DESKTOP_API_ORIGIN: DEFAULT_ORIGIN,
      WOC_DESKTOP_UPDATE_URL: `${DEFAULT_ORIGIN}/downloads/desktop`,
      WOC_DESKTOP_VERSION: '0.45.7',
    });
  });

  it('prepends node_modules/.bin to PATH so the bare electron-builder launcher resolves', () => {
    const sep = process.platform === 'win32' ? ';' : ':';
    const env = releaseBuildEnv({
      origin: DEFAULT_ORIGIN,
      feedUrl: `${DEFAULT_ORIGIN}/downloads/desktop`,
      version: '0.45.7',
      binDir: '/repo/node_modules/.bin',
      pathValue: '/usr/bin',
    });
    expect(env.PATH).toBe(`/repo/node_modules/.bin${sep}/usr/bin`);
    expect(
      releaseBuildEnv({
        origin: DEFAULT_ORIGIN,
        feedUrl: '',
        version: '0.45.7',
        binDir: '/repo/node_modules/.bin',
      }).PATH,
    ).toBe('/repo/node_modules/.bin');
    expect(
      releaseBuildEnv({ origin: DEFAULT_ORIGIN, feedUrl: '', version: '0.45.7' }).PATH,
    ).toBeUndefined();
  });

  it('single-quotes remote paths for the droplet shell', () => {
    expect(shellQuote('/var/www/downloads/desktop')).toBe("'/var/www/downloads/desktop'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it('plans mkdir, one scp of every file, then the stable-link cp, in that order', () => {
    const files = [
      'C:\\repo with space\\release\\dev.yml',
      'C:\\repo with space\\release\\world-of-claudecraft-0.45.7-win-x64.exe',
      'C:\\repo with space\\release\\world-of-claudecraft-0.45.7-win-x64.exe.blockmap',
    ];
    const cmds = remoteCommands({
      host: DEFAULT_HOST,
      key: 'C:\\Users\\me\\.ssh\\projecth_do',
      files,
      remoteDir: DEFAULT_REMOTE_DIR,
      installerName: 'world-of-claudecraft-0.45.7-win-x64.exe',
      friendlyName: 'Project-H-Setup.exe',
    });
    const auth = [
      '-i',
      'C:\\Users\\me\\.ssh\\projecth_do',
      '-o',
      'StrictHostKeyChecking=accept-new',
    ];
    expect(cmds.map((c) => c.command)).toEqual(['ssh', 'scp', 'ssh']);
    expect(cmds[0].args).toEqual([...auth, DEFAULT_HOST, "mkdir -p '/var/www/downloads/desktop'"]);
    // Local paths ride argv verbatim (no shell): a space never splits them.
    expect(cmds[1].args).toEqual([
      ...auth,
      ...files,
      `${DEFAULT_HOST}:/var/www/downloads/desktop/`,
    ]);
    expect(cmds[2].args).toEqual([
      ...auth,
      DEFAULT_HOST,
      "cp -f '/var/www/downloads/desktop/world-of-claudecraft-0.45.7-win-x64.exe' " +
        "'/var/www/downloads/Project-H-Setup.exe'",
    ]);
  });

  it('summarizes the feed, the versioned installer and the friends link one level up', () => {
    const lines = releaseSummary({
      feedUrl: `${DEFAULT_ORIGIN}/downloads/desktop`,
      version: '0.45.7',
      installerName: 'world-of-claudecraft-0.45.7-win-x64.exe',
      friendlyName: 'Project-H-Setup.exe',
    });
    expect(lines.join('\n')).toContain(`${DEFAULT_ORIGIN}/downloads/desktop/dev.yml`);
    expect(lines.join('\n')).toContain(
      `${DEFAULT_ORIGIN}/downloads/desktop/world-of-claudecraft-0.45.7-win-x64.exe`,
    );
    expect(lines.join('\n')).toContain(`${DEFAULT_ORIGIN}/downloads/Project-H-Setup.exe`);
  });
});
