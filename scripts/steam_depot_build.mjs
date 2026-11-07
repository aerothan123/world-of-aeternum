#!/usr/bin/env node
// SteamPipe upload for the Windows Steam build. Renders build/steam/*.vdf.template
// into release-steam/steampipe/ and prints (or, with --run, spawns) the steamcmd
// command. Build first: `WOC_STEAM_APP_ID=<appid> npm run electron:build:steam`.
//
//   node scripts/steam_depot_build.mjs --app-id <appid> --depot-id <depotid>
//   node scripts/steam_depot_build.mjs --steam-user <builder> --set-live beta --run
//
// Ids come from flags or STEAM_APP_ID / STEAM_DEPOT_ID_WIN; the build account from
// --steam-user or STEAM_BUILD_USER. No password flag exists: steamcmd prompts, and
// Steam Guard caches the login on the build machine. Runbook:
// docs/launch/steam-depot-builds.md. Pure planning: scripts/lib/steam_depot_plan.mjs.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDepotArgs, planDepotBuild, renderTemplate } from './lib/steam_depot_plan.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const opts = parseDepotArgs(process.argv.slice(2), process.env);
  const contentRoot = path.resolve(repoRoot, opts.contentRoot);
  const outputDir = path.resolve(repoRoot, opts.outputDir);
  const exe = fs.existsSync(contentRoot)
    ? fs.readdirSync(contentRoot).filter((f) => f.toLowerCase().endsWith('.exe'))
    : [];
  if (exe.length === 0) {
    throw new Error(
      `no .exe under ${contentRoot}: run WOC_STEAM_APP_ID=<appid> npm run electron:build:steam first`,
    );
  }
  if (fs.existsSync(path.join(contentRoot, 'steam_appid.txt'))) {
    throw new Error('steam_appid.txt must not ship in the depot (docs/desktop-release.md, Steam)');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const paths = {
    contentRoot,
    buildOutput: path.join(outputDir, 'output'),
    appVdf: path.join(outputDir, 'app_build.vdf'),
    depotVdf: path.join(outputDir, 'depot_build_win.vdf'),
    stamp,
  };
  const plan = planDepotBuild(opts, paths);
  fs.mkdirSync(paths.buildOutput, { recursive: true });
  const tpl = (name) => fs.readFileSync(path.join(repoRoot, 'build', 'steam', name), 'utf8');
  fs.writeFileSync(paths.appVdf, renderTemplate(tpl('app_build.vdf.template'), plan.values));
  fs.writeFileSync(
    paths.depotVdf,
    renderTemplate(tpl('depot_build_win.vdf.template'), plan.values),
  );
  console.log(
    `app ${plan.appId}, depot ${plan.depotId}, content ${contentRoot} (${exe.join(', ')})`,
  );
  console.log(`set live: ${plan.setLive || '(none, promote in Steamworks)'}`);
  console.log(`wrote ${paths.appVdf}`);
  console.log(`wrote ${paths.depotVdf}`);
  if (!plan.steamcmdArgv) {
    console.log(
      'next: steamcmd +login <build account> +run_app_build "' + paths.appVdf + '" +quit',
    );
    return;
  }
  console.log(`steamcmd ${plan.steamcmdArgv.join(' ')}`);
  if (!opts.run) {
    console.log('dry run: add --run to upload');
    return;
  }
  const result = spawnSync(process.env.STEAMCMD ?? 'steamcmd', plan.steamcmdArgv, {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

try {
  main();
} catch (err) {
  console.error(`steam_depot_build: ${err.message}`);
  process.exit(1);
}
