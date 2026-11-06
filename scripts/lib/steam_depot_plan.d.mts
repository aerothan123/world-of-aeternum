export const DEFAULT_CONTENT_ROOT: string;
export const DEFAULT_OUTPUT_DIR: string;
export interface DepotOptions {
  appId: string;
  depotId: string;
  contentRoot: string;
  outputDir: string;
  desc: string;
  setLive: string;
  steamUser: string;
  run: boolean;
  preview: boolean;
}
export interface DepotPaths {
  contentRoot: string;
  buildOutput: string;
  appVdf: string;
  depotVdf: string;
  stamp: string;
}
export function parseDepotArgs(
  argv: string[],
  env?: Record<string, string | undefined>,
): DepotOptions;
export function setLiveBranch(value: string | undefined): string;
export function vdfEscape(value: string): string;
export function renderTemplate(template: string, values: Record<string, string>): string;
export function planDepotBuild(
  opts: DepotOptions,
  paths: DepotPaths,
): {
  appId: string;
  depotId: string;
  setLive: string;
  desc: string;
  values: Record<string, string>;
  steamcmdArgv: string[] | null;
};
