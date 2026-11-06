// Add-on manifest (addon.json) validation, API-version compatibility, and load
// ordering. Pure: no DOM, no storage, no IWorld. The Electron shell keeps a
// minimal mirror of the shape rules (electron/addons.cjs) for its folder scan;
// tests/electron_addons.test.ts pins the shared limits equal. Contract:
// docs/design/addon-api.md section 4.

/** The API version this runtime speaks. Additive changes never bump it. */
export const ADDON_API_VERSION = 1;
/** The oldest API version still loaded without the "out of date" override. */
export const ADDON_API_MIN = 1;

export const ADDON_PERMISSIONS = [
  'party',
  'combatLog',
  'chat',
  'minimap',
  'inventory',
  'quests',
  'secureActions',
] as const;
export type AddonPermission = (typeof ADDON_PERMISSIONS)[number];

/** The Workshop tag allowlist (configured by the owner in Steamworks). */
export const ADDON_WORKSHOP_TAGS = [
  'Addon',
  'Combat',
  'Meters',
  'Timers',
  'Map',
  'Interface',
  'Chat',
  'Social',
  'Library',
] as const;

/** Slash names the game or the runtime owns; an add-on may never claim one. */
export const ADDON_RESERVED_SLASH: readonly string[] = [
  'addons',
  'addon',
  'reloadui',
  'rl',
  's',
  'say',
  'y',
  'yell',
  'w',
  'whisper',
  't',
  'tell',
  'r',
  'reply',
  'p',
  'party',
  'g',
  'guild',
  'o',
  'officer',
  'raid',
  'ra',
  'rw',
  'bg',
  'join',
  'leave',
  'world',
  'lfg',
  'general',
  'invite',
  'inv',
  'kick',
  'who',
  'share',
  'roll',
  'random',
  'help',
  'afk',
  'dnd',
  'sit',
  'stand',
  'follow',
  'unfollow',
  'played',
  'playtime',
  'pull',
  'pvp',
  'ready',
  'readycheck',
  'unstuck',
  'hill',
  'e',
  'em',
  'me',
  'emote',
  'dance',
  'wave',
  'dungeon',
  'trade',
  'duel',
  'ignore',
  'unignore',
  'friend',
  'dev',
  'form',
  'stance',
  'consumable',
  'consumables',
  'eat',
  'drink',
  'queued',
  'onswing',
  'swingqueue',
  'group',
  'grp',
  'logout',
  'quit',
  'camp',
];

export const ADDON_LIMITS = {
  maxFiles: 16,
  maxTotalBytes: 512 * 1024,
  maxSettings: 32,
  maxSlash: 8,
  maxDeps: 16,
  savedBytesPerScope: 256 * 1024,
} as const;

export type AddonSettingDef =
  | { key: string; type: 'toggle'; label: string; default: boolean }
  | {
      key: string;
      type: 'slider';
      label: string;
      default: number;
      min: number;
      max: number;
      step: number;
    }
  | {
      key: string;
      type: 'choice';
      label: string;
      default: string;
      options: { value: string; label: string }[];
    };

export interface AddonManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  author: string;
  description: string;
  permissions: AddonPermission[];
  files: string[];
  savedVariables: { account: boolean; character: boolean };
  slashCommands: string[];
  dependencies: string[];
  optionalDependencies: string[];
  loadOrder: number;
  settings: AddonSettingDef[];
  tags: string[];
}

export type ManifestResult =
  | { ok: true; manifest: AddonManifest }
  | { ok: false; error: ManifestError };

/** Stable error codes; the Addons window maps each to a t() key. */
export type ManifestError = { code: 'json' } | { code: 'field'; field: string };

const ID_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
const SEMVER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const FILE_RE = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js$/;
const SLASH_RE = /^[a-z][a-z0-9]{1,23}$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null;
}

function strList(v: unknown, re: RegExp, max: number): string[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string' || !re.test(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function parseSetting(v: unknown): AddonSettingDef | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  const key = typeof s.key === 'string' && KEY_RE.test(s.key) ? s.key : null;
  const label = str(s.label, 64);
  if (!key || !label) return null;
  if (s.type === 'toggle') {
    return { key, type: 'toggle', label, default: s.default === true };
  }
  if (s.type === 'slider') {
    const min = Number(s.min);
    const max = Number(s.max);
    const step = s.step === undefined ? 1 : Number(s.step);
    const def = s.default === undefined ? min : Number(s.default);
    if (![min, max, step, def].every(Number.isFinite) || max <= min || step <= 0) return null;
    return {
      key,
      type: 'slider',
      label,
      min,
      max,
      step,
      default: Math.min(max, Math.max(min, def)),
    };
  }
  if (s.type === 'choice') {
    if (!Array.isArray(s.options) || s.options.length === 0 || s.options.length > 16) return null;
    const options: { value: string; label: string }[] = [];
    for (const o of s.options) {
      const value = o && typeof o === 'object' ? str((o as { value?: unknown }).value, 32) : null;
      const olabel = o && typeof o === 'object' ? str((o as { label?: unknown }).label, 64) : null;
      if (!value || !olabel) return null;
      options.push({ value, label: olabel });
    }
    const def =
      typeof s.default === 'string' && options.some((o) => o.value === s.default)
        ? s.default
        : options[0].value;
    return { key, type: 'choice', label, default: def, options };
  }
  return null;
}

/** Parse and validate addon.json text. Unknown top-level keys are ignored. */
export function parseAddonManifest(text: string): ManifestResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'json' } };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: { code: 'json' } };
  }
  const m = raw as Record<string, unknown>;
  const bad = (field: string): ManifestResult => ({ ok: false, error: { code: 'field', field } });
  const id = typeof m.id === 'string' && ID_RE.test(m.id) ? m.id : null;
  if (!id) return bad('id');
  const name = str(m.name, 64);
  if (!name) return bad('name');
  const version = typeof m.version === 'string' && SEMVER_RE.test(m.version) ? m.version : null;
  if (!version) return bad('version');
  const apiVersion =
    typeof m.apiVersion === 'number' && Number.isInteger(m.apiVersion) && m.apiVersion > 0
      ? m.apiVersion
      : null;
  if (apiVersion === null) return bad('apiVersion');
  const author = m.author === undefined ? '' : str(m.author, 64);
  if (author === null) return bad('author');
  const description = m.description === undefined ? '' : str(m.description, 400);
  if (description === null) return bad('description');
  const permissions = strList(m.permissions, /^[A-Za-z]+$/, ADDON_PERMISSIONS.length);
  if (
    !permissions ||
    !permissions.every((p) => (ADDON_PERMISSIONS as readonly string[]).includes(p))
  ) {
    return bad('permissions');
  }
  let files: string[] | null;
  if (m.files !== undefined) files = strList(m.files, FILE_RE, ADDON_LIMITS.maxFiles);
  else if (typeof m.entry === 'string' && FILE_RE.test(m.entry)) files = [m.entry];
  else files = null;
  if (!files || files.length === 0 || files.some((f) => f.split('/').includes('..'))) {
    return bad('files');
  }
  const sv = m.savedVariables;
  const savedVariables = {
    account: !!sv && typeof sv === 'object' && (sv as { account?: unknown }).account === true,
    character: !!sv && typeof sv === 'object' && (sv as { character?: unknown }).character === true,
  };
  const slashCommands = strList(m.slashCommands, SLASH_RE, ADDON_LIMITS.maxSlash);
  if (!slashCommands || slashCommands.some((s) => ADDON_RESERVED_SLASH.includes(s))) {
    return bad('slashCommands');
  }
  const dependencies = strList(m.dependencies, ID_RE, ADDON_LIMITS.maxDeps);
  if (!dependencies || dependencies.includes(id)) return bad('dependencies');
  const optionalDependencies = strList(m.optionalDependencies, ID_RE, ADDON_LIMITS.maxDeps);
  if (!optionalDependencies || optionalDependencies.includes(id)) {
    return bad('optionalDependencies');
  }
  const loadOrder =
    m.loadOrder === undefined
      ? 100
      : typeof m.loadOrder === 'number' && Number.isFinite(m.loadOrder)
        ? Math.max(0, Math.min(1000, Math.round(m.loadOrder)))
        : null;
  if (loadOrder === null) return bad('loadOrder');
  const settings: AddonSettingDef[] = [];
  if (m.settings !== undefined) {
    if (!Array.isArray(m.settings) || m.settings.length > ADDON_LIMITS.maxSettings) {
      return bad('settings');
    }
    for (const s of m.settings) {
      const parsed = parseSetting(s);
      if (!parsed || settings.some((x) => x.key === parsed.key)) return bad('settings');
      settings.push(parsed);
    }
  }
  const tags = strList(m.tags, /^[A-Za-z]+$/, ADDON_WORKSHOP_TAGS.length);
  if (!tags || !tags.every((x) => (ADDON_WORKSHOP_TAGS as readonly string[]).includes(x))) {
    return bad('tags');
  }
  return {
    ok: true,
    manifest: {
      id,
      name,
      version,
      apiVersion,
      author,
      description,
      permissions: permissions as AddonPermission[],
      files,
      savedVariables,
      slashCommands,
      dependencies,
      optionalDependencies,
      loadOrder,
      settings,
      tags,
    },
  };
}

export type ApiCompat = 'ok' | 'tooNew' | 'outdated';

/** Whether this runtime can load an add-on written against `apiVersion`. */
export function apiCompatibility(
  apiVersion: number,
  current = ADDON_API_VERSION,
  min = ADDON_API_MIN,
): ApiCompat {
  if (apiVersion > current) return 'tooNew';
  if (apiVersion < min) return 'outdated';
  return 'ok';
}

export type LoadOrderIssue = { id: string; code: 'missingDependency' | 'cycle'; detail: string };

/** Dependencies first (topological), then loadOrder, then id. Add-ons with a
 *  missing required dependency or caught in a cycle are reported, not ordered. */
export function resolveLoadOrder(manifests: readonly AddonManifest[]): {
  order: string[];
  issues: LoadOrderIssue[];
} {
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const issues: LoadOrderIssue[] = [];
  const blocked = new Set<string>();
  // Missing required deps block the add-on and everything that requires it.
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of manifests) {
      if (blocked.has(m.id)) continue;
      const missing = m.dependencies.find((d) => !byId.has(d) || blocked.has(d));
      if (missing !== undefined) {
        blocked.add(m.id);
        issues.push({ id: m.id, code: 'missingDependency', detail: missing });
        changed = true;
      }
    }
  }
  const sorted = [...manifests]
    .filter((m) => !blocked.has(m.id))
    .sort((a, b) => a.loadOrder - b.loadOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: AddonManifest, stack: string[]): boolean => {
    const s = state.get(m.id);
    if (s === 'done') return true;
    if (s === 'visiting') return false;
    state.set(m.id, 'visiting');
    const deps = [...m.dependencies, ...m.optionalDependencies.filter((d) => byId.has(d))];
    for (const d of deps) {
      const dm = byId.get(d);
      if (!dm || blocked.has(d)) continue;
      if (!visit(dm, [...stack, m.id])) {
        state.set(m.id, 'done');
        if (!blocked.has(m.id)) {
          blocked.add(m.id);
          issues.push({ id: m.id, code: 'cycle', detail: d });
        }
        return false;
      }
    }
    state.set(m.id, 'done');
    if (!blocked.has(m.id)) order.push(m.id);
    return true;
  };
  for (const m of sorted) visit(m, []);
  return { order, issues };
}
