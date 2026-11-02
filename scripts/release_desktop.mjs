// One-command self-hosted Windows desktop release (runbook:
// docs/desktop-self-hosted-updates.md). Builds the website-channel installer
// against the owner's own API origin, stamps a strictly greater version,
// uploads the feed file + installer + blockmap to the droplet's feed
// directory over scp, and refreshes the friends' stable download link.
//
//   node scripts/release_desktop.mjs [--origin URL] [--version x.y.z]
//       [--host user@ip] [--key PATH] [--remote-dir DIR]
//       [--installer-name NAME] [--feed-url URL] [--dry-run]
//
// Deliberately NOT an npm script: package.json is a fingerprint input for
// shipped GLB assets (scripts/CLAUDE.md), so neither a script entry nor a
// version bump lands there; the version is stamped at build time instead
// (WOC_DESKTOP_VERSION, scripts/electron-build.mjs). All decisions are pure
// in scripts/lib/release_desktop_plan.mjs; this file only reads, spawns and
// prints. Works from PowerShell on Windows: node, ssh and scp are real
// executables, so every spawn is shell-less and paths with spaces survive.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chooseReleaseVersion,
  FEED_FILE,
  parseFeedVersion,
  parseReleaseArgs,
  primaryInstaller,
  releaseArtifacts,
  releaseBuildEnv,
  releaseFeedUrl,
  releaseSummary,
  remoteCommands,
} from './lib/release_desktop_plan.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = (line) => console.log(`[release_desktop] ${line}`);

let args;
try {
  args = parseReleaseArgs(process.argv.slice(2), { homedir: homedir(), joinPath: path.join });
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
const feedUrl = releaseFeedUrl({ origin: args.origin, feedUrl: args.feedUrl });
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageVersion = pkg.version;

// The live feed decides the next version. A 404 means "first release" (no
// feed yet); any other failure aborts a real run, because the host that
// cannot serve its feed is the host scp is about to write to. A dry run
// tolerates it and plans as if there were no feed.
async function fetchFeedVersion() {
  const url = `${feedUrl}/${FEED_FILE}`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  } catch (err) {
    if (args.dryRun) {
      log(`dry run: ${url} unreachable (${err?.message ?? err}); planning as a first release`);
      return null;
    }
    throw new Error(`cannot reach the live feed ${url}: ${err?.message ?? err}`);
  }
  if (res.status === 404) {
    log(`no live feed at ${url} yet (first release)`);
    return null;
  }
  if (!res.ok) throw new Error(`live feed ${url} answered HTTP ${res.status}`);
  const version = parseFeedVersion(await res.text());
  if (version === null) throw new Error(`live feed ${url} has no version line`);
  log(`live feed serves ${version}`);
  return version;
}

function run({ step, command, args: argv, env }) {
  log(`${step}: ${command} ${argv.join(' ')}`);
  const result = spawnSync(command, argv, {
    cwd: root,
    stdio: 'inherit',
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (result.error) throw new Error(`failed to spawn ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status ?? 'signal'}`);
}

try {
  const feedVersion = await fetchFeedVersion();
  const { version, reason } = chooseReleaseVersion({
    requested: args.version,
    packageVersion,
    feedVersion,
  });
  log(`releasing ${version} (${reason}) to ${feedUrl}`);
  const env = releaseBuildEnv({ origin: args.origin, feedUrl, version });
  const build = {
    step: 'build the website installer',
    command: process.execPath,
    args: [path.join(root, 'scripts', 'electron-build.mjs'), 'build', 'website'],
    env,
  };
  const outDir = path.join(root, 'release');
  if (args.dryRun) {
    log(`dry run: would run ${build.command} ${build.args.join(' ')}`);
    log(`dry run: with env ${JSON.stringify(env)}`);
    // The expected artifact name (package.json build.artifactName with the
    // win x64 nsis target); the real run reads the names from the built feed.
    const expectedExe = `${pkg.name}-${version}-win-x64.exe`;
    const placeholder = [
      path.join(outDir, FEED_FILE),
      path.join(outDir, expectedExe),
      path.join(outDir, `${expectedExe}.blockmap`),
    ];
    for (const cmd of remoteCommands({
      host: args.host,
      key: args.key,
      files: placeholder,
      remoteDir: args.remoteDir,
      installerName: expectedExe,
      friendlyName: args.installerName,
    })) {
      log(`dry run: would run ${cmd.command} ${cmd.args.join(' ')}`);
    }
    for (const line of releaseSummary({
      feedUrl,
      version,
      installerName: expectedExe,
      friendlyName: args.installerName,
    })) {
      log(line);
    }
    process.exit(0);
  }

  run(build);
  const ymlPath = path.join(outDir, FEED_FILE);
  if (!existsSync(ymlPath)) {
    throw new Error(`build emitted no ${FEED_FILE} under ${outDir}; is the origin non-production?`);
  }
  const ymlText = readFileSync(ymlPath, 'utf8');
  const built = parseFeedVersion(ymlText);
  if (built !== version) {
    throw new Error(`built feed reports version ${built}, expected ${version}`);
  }
  const { files, installers } = releaseArtifacts({
    outDir,
    ymlText,
    exists: existsSync,
    joinPath: path.join,
  });
  const installerName = primaryInstaller(installers);
  for (const cmd of remoteCommands({
    host: args.host,
    key: args.key,
    files,
    remoteDir: args.remoteDir,
    installerName,
    friendlyName: args.installerName,
  })) {
    run(cmd);
  }
  log('done');
  for (const line of releaseSummary({
    feedUrl,
    version,
    installerName,
    friendlyName: args.installerName,
  })) {
    log(line);
  }
} catch (err) {
  console.error(`[release_desktop] ${err?.message ?? err}`);
  process.exit(1);
}
