// Hand-written declarations for electron/steam_workshop.cjs. Keep in sync.

export const ITEM_STATE: Record<
  'subscribed' | 'legacy' | 'installed' | 'needsUpdate' | 'downloading' | 'downloadPending',
  number
>;
export const VISIBILITY: Record<'public' | 'friends' | 'private' | 'unlisted', number>;
export const BASE_TAG: string;
export const WORKSHOP_SIDECAR: string;

// biome-ignore lint/suspicious/noExplicitAny: the injected steamworks.js client.
type SteamClientLike = any;
// biome-ignore lint/suspicious/noExplicitAny: an injected node:fs subset.
type FsLike = any;

export function listSubscribedItems(
  client: SteamClientLike,
  log?: { warn?: (...args: unknown[]) => void },
): { id: string; folder: string | null; needsUpdate: boolean }[];

export function workshopTags(manifestTags: unknown, allowlist: string[]): string[];

export function publishAddonFolder(input: {
  client: SteamClientLike;
  appId: number;
  dir: string;
  manifest: { name: string; description?: string; tags?: string[] };
  visibility: string;
  changeNote?: string;
  fs: FsLike;
  log?: { warn?: (...args: unknown[]) => void };
  tagAllowlist: string[];
}): Promise<{ ok: boolean; code: string; itemId?: string }>;
