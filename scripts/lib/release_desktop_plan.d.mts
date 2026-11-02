// Hand-written declarations for scripts/lib/release_desktop_plan.mjs so
// tests/release_desktop_plan.test.ts type-checks its imports. Keep in sync
// with the .mjs exports.

export const DEFAULT_ORIGIN: string;
export const DEFAULT_HOST: string;
export const DEFAULT_KEY: string[];
export const DEFAULT_REMOTE_DIR: string;
export const DEFAULT_INSTALLER_NAME: string;
export const FEED_CHANNEL: string;
export const FEED_FILE: string;

export interface ReleaseArgs {
  origin: string;
  version: string;
  host: string;
  key: string;
  remoteDir: string;
  installerName: string;
  feedUrl: string;
  dryRun: boolean;
}

export function parseReleaseArgs(
  argv: string[],
  deps: { homedir: string; joinPath: (...parts: string[]) => string },
): ReleaseArgs;

export function releaseFeedUrl(input: { origin: string; feedUrl?: string }): string;
export function compareSemver(a: string, b: string): -1 | 0 | 1;
export function bumpPatch(value: string): string;
export function chooseReleaseVersion(input: {
  requested?: string | null;
  packageVersion: string;
  feedVersion?: string | null;
}): { version: string; reason: string };
export function parseFeedVersion(ymlText: unknown): string | null;
export function feedArtifactNames(ymlText: unknown): string[];
export function releaseArtifacts(input: {
  outDir: string;
  ymlText: string;
  exists: (path: string) => boolean;
  joinPath: (...parts: string[]) => string;
}): { files: string[]; installers: string[] };
export function primaryInstaller(installers: string[]): string;
export function releaseBuildEnv(input: {
  origin: string;
  feedUrl: string;
  version: string;
  binDir?: string;
  pathValue?: string;
}): {
  VITE_DESKTOP_API_ORIGIN: string;
  WOC_DESKTOP_UPDATE_URL: string;
  WOC_DESKTOP_VERSION: string;
  PATH?: string;
};
export function shellQuote(value: unknown): string;
export interface RemoteCommand {
  step: string;
  command: 'ssh' | 'scp';
  args: string[];
}
export function remoteCommands(input: {
  host: string;
  key: string;
  files: string[];
  remoteDir: string;
  installerName: string;
  friendlyName: string;
}): RemoteCommand[];
export function releaseSummary(input: {
  feedUrl: string;
  version: string;
  installerName: string;
  friendlyName: string;
}): string[];
