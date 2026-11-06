// SteamPipe upload planning (scripts/lib/steam_depot_plan.mjs) and the VDF
// templates it renders (build/steam/). Pure: no fs writes, no steamcmd.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseDepotArgs,
  planDepotBuild,
  renderTemplate,
  setLiveBranch,
} from '../scripts/lib/steam_depot_plan.mjs';

const paths = {
  contentRoot: 'C:\\build\\release-steam\\win-unpacked',
  buildOutput: 'C:\\build\\release-steam\\steampipe\\output',
  appVdf: 'C:\\build\\release-steam\\steampipe\\app_build.vdf',
  depotVdf: 'C:\\build\\release-steam\\steampipe\\depot_build_win.vdf',
  stamp: '2026-11-05',
};
const tpl = (name: string) =>
  fs.readFileSync(path.resolve(process.cwd(), 'build/steam', name), 'utf8');

describe('steam depot plan', () => {
  it('reads ids from env and renders both templates with no placeholder left', () => {
    const opts = parseDepotArgs([], { STEAM_APP_ID: '1234560', STEAM_DEPOT_ID_WIN: '1234561' });
    const plan = planDepotBuild(opts, paths);
    const app = renderTemplate(tpl('app_build.vdf.template'), plan.values);
    const depot = renderTemplate(tpl('depot_build_win.vdf.template'), plan.values);
    expect(app).toContain('"AppID" "1234560"');
    expect(app).toContain(
      '"1234561" "C:\\\\build\\\\release-steam\\\\steampipe\\\\depot_build_win.vdf"',
    );
    expect(app).toContain('"SetLive" ""');
    expect(depot).toContain('"DepotID" "1234561"');
    expect(depot).toContain('"FileExclusion" "steam_appid.txt"');
    expect(`${app}${depot}`).not.toMatch(/\{\{/);
    expect(plan.steamcmdArgv).toBeNull();
  });

  it('refuses missing or non-numeric ids', () => {
    expect(() => planDepotBuild(parseDepotArgs([], {}), paths)).toThrow(/app id/);
    expect(() =>
      planDepotBuild(parseDepotArgs(['--app-id', '480', '--depot-id', 'abc'], {}), paths),
    ).toThrow(/depot id/);
  });

  it('never accepts a password, and never sets the default branch live', () => {
    expect(() => parseDepotArgs(['--password', 'x'], {})).toThrow(/never pass a password/);
    expect(() => setLiveBranch('default')).toThrow(/refused/);
    expect(setLiveBranch('beta')).toBe('beta');
  });

  it('builds the steamcmd argv with the build account only', () => {
    const opts = parseDepotArgs(
      ['--app-id', '480', '--depot-id', '481', '--steam-user', 'builder', '--set-live', 'beta'],
      {},
    );
    const plan = planDepotBuild(opts, paths);
    expect(plan.steamcmdArgv).toEqual([
      '+login',
      'builder',
      '+run_app_build',
      paths.appVdf,
      '+quit',
    ]);
    expect(plan.values.SET_LIVE).toBe('beta');
  });

  it('escapes quotes so a description cannot break out of the VDF string', () => {
    const plan = planDepotBuild(
      parseDepotArgs(['--app-id', '480', '--depot-id', '481', '--desc', 'a "quoted" desc'], {}),
      paths,
    );
    expect(renderTemplate('"Desc" "{{BUILD_DESC}}"', plan.values)).toBe(
      '"Desc" "a \\"quoted\\" desc"',
    );
  });
});
