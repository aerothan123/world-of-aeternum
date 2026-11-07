// Hand-written declarations for electron/addons.cjs (the electron/*.d.cts
// convention: the Vitest suite type-checks its imports). Keep in sync.

export const ADDON_SHELL_LIMITS: {
  maxFiles: number;
  maxTotalBytes: number;
  maxManifestBytes: number;
  maxFolders: number;
};
export const ADDON_WORKSHOP_TAGS: string[];
export const SAFE_MODE_FLAGS: string[];

export interface ShellManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  tags: string[];
  files: string[];
}

export interface ShellAddonPackage {
  origin: 'local' | 'workshop';
  folder: string;
  manifestText: string;
  files: Record<string, string>;
  workshopId?: string;
  pending?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: an injected node:fs subset.
type FsLike = any;

export function shellManifest(text: string): ShellManifest | null;
export function contained(dir: string, child: string): boolean;
export function readAddonFolder(
  dir: string,
  origin: 'local' | 'workshop',
  fs?: FsLike,
  extra?: Record<string, unknown>,
): ShellAddonPackage | null;
export function listLocalAddons(root: string, fs?: FsLike): ShellAddonPackage[];
export function resolveLocalRoot(input: {
  userDataDir: string;
  env?: Record<string, string | undefined>;
  isPackaged?: boolean;
}): string;

export interface AddonsShell {
  localRoot: string;
  safeMode: boolean;
  list(): Promise<{
    packages: ShellAddonPackage[];
    safeMode: boolean;
    workshopAvailable: boolean;
    localFolder: string;
  }>;
  openFolder(): Promise<boolean>;
  publish(request: {
    folder: string;
    visibility?: string;
    changeNote?: string;
  }): Promise<{ ok: boolean; code: string; itemId?: string }>;
}

export function createAddonsShell(input?: {
  userDataDir: string;
  env?: Record<string, string | undefined>;
  isPackaged?: boolean;
  argv?: string[];
  steamShell?: { enabled: boolean; appId: number; client?: () => unknown } | null;
  openPath?: (p: string) => Promise<string> | string;
  log?: { warn?: (...args: unknown[]) => void };
  fs?: FsLike;
}): AddonsShell;
