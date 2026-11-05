// Pure model for the Addons window: maps runtime entries to rows carrying
// t() keys and values (the painter never decides wording), plus the structural
// signature that tells the painter when a rebuild is needed (stats repaint in
// place every second without rebuilding, so keyboard focus is never lost).

import type { TranslationKey } from '../../i18n';
import type { AddonPermission } from './addon_manifest_core';
import type {
  AddonStats,
  AddonStatus,
  AddonStopReason,
  SafeModeReason,
} from './addon_runtime_core';
import type { AddonOrigin } from './addon_sources';

export interface AddonsWindowEntryInput {
  key: string;
  origin: AddonOrigin;
  folder: string;
  name: string | null;
  version: string | null;
  author: string | null;
  description: string | null;
  status: AddonStatus;
  detail: string;
  stopReason: AddonStopReason | null;
  manifestErrorField: string | null;
  manifestErrorJson: boolean;
  enabled: boolean;
  permissions: AddonPermission[];
  hasSettings: boolean;
  stats: AddonStats;
  recentErrors: readonly string[];
}

export interface AddonsWindowInput {
  masterEnabled: boolean;
  loadOutdated: boolean;
  safeMode: SafeModeReason;
  desktop: boolean;
  workshopAvailable: boolean;
  entries: AddonsWindowEntryInput[];
  expandedErrors: ReadonlySet<string>;
}

export interface AddonsWindowRow {
  key: string;
  title: string;
  /** Null for an add-on whose manifest did not parse (folder shown instead). */
  version: string | null;
  author: string | null;
  description: string | null;
  originKey: TranslationKey;
  statusKey: TranslationKey;
  statusTone: 'good' | 'muted' | 'bad' | 'warn';
  detailKey: TranslationKey | null;
  detailValues: Record<string, string>;
  canToggle: boolean;
  enabled: boolean;
  permissionKeys: TranslationKey[];
  canOptions: boolean;
  canPublish: boolean;
  showErrors: boolean;
  errors: readonly string[];
  stats: AddonStats;
  running: boolean;
}

export interface AddonsWindowModel {
  masterEnabled: boolean;
  loadOutdated: boolean;
  bannerKey: TranslationKey | null;
  canLeaveSafe: boolean;
  workshopNoteKey: TranslationKey | null;
  desktop: boolean;
  rows: AddonsWindowRow[];
  emptyKey: TranslationKey | null;
  signature: string;
}

const STATUS_KEY: Record<AddonStatus, TranslationKey> = {
  disabled: 'hudChrome.addons.status.disabled',
  loading: 'hudChrome.addons.status.loading',
  running: 'hudChrome.addons.status.running',
  error: 'hudChrome.addons.status.error',
  stopped: 'hudChrome.addons.status.stopped',
  blocked: 'hudChrome.addons.status.blocked',
  tooNew: 'hudChrome.addons.status.tooNew',
  outdated: 'hudChrome.addons.status.outdated',
  invalid: 'hudChrome.addons.status.invalid',
};

const STATUS_TONE: Record<AddonStatus, AddonsWindowRow['statusTone']> = {
  disabled: 'muted',
  loading: 'muted',
  running: 'good',
  error: 'bad',
  stopped: 'bad',
  blocked: 'warn',
  tooNew: 'warn',
  outdated: 'warn',
  invalid: 'bad',
};

const STOP_KEY: Record<AddonStopReason, TranslationKey> = {
  errors: 'hudChrome.addons.stop.errors',
  hang: 'hudChrome.addons.stop.hang',
  flood: 'hudChrome.addons.stop.flood',
  load: 'hudChrome.addons.stop.load',
};

const ORIGIN_KEY: Record<AddonOrigin, TranslationKey> = {
  dev: 'hudChrome.addons.origin.dev',
  local: 'hudChrome.addons.origin.local',
  workshop: 'hudChrome.addons.origin.workshop',
};

export const ADDON_PERMISSION_KEYS: Record<AddonPermission, TranslationKey> = {
  party: 'hudChrome.addons.perm.party',
  combatLog: 'hudChrome.addons.perm.combatLog',
  chat: 'hudChrome.addons.perm.chat',
  minimap: 'hudChrome.addons.perm.minimap',
  inventory: 'hudChrome.addons.perm.inventory',
  quests: 'hudChrome.addons.perm.quests',
  secureActions: 'hudChrome.addons.perm.secureActions',
};

function detailFor(e: AddonsWindowEntryInput): {
  key: TranslationKey | null;
  values: Record<string, string>;
} {
  if (e.status === 'invalid') {
    if (e.manifestErrorJson) return { key: 'hudChrome.addons.invalidJson', values: {} };
    return { key: 'hudChrome.addons.invalidField', values: { field: e.manifestErrorField ?? '' } };
  }
  if (e.status === 'blocked') {
    if (e.detail === 'pending') return { key: 'hudChrome.addons.blockedPending', values: {} };
    if (e.detail.startsWith('dup:')) {
      return { key: 'hudChrome.addons.blockedDuplicate', values: { id: e.detail.slice(4) } };
    }
    return {
      key: 'hudChrome.addons.blockedDependency',
      values: { id: e.detail.replace(/^dep:/, '') },
    };
  }
  if (e.stopReason && (e.status === 'stopped' || e.status === 'error' || !e.enabled)) {
    return { key: STOP_KEY[e.stopReason], values: {} };
  }
  return { key: null, values: {} };
}

export function addonsWindowModel(input: AddonsWindowInput): AddonsWindowModel {
  const rows: AddonsWindowRow[] = input.entries.map((e) => {
    const d = detailFor(e);
    const toggleable =
      e.status !== 'invalid' &&
      e.status !== 'tooNew' &&
      !(e.status === 'blocked' && e.detail === 'pending');
    return {
      key: e.key,
      title: e.name ?? e.folder,
      version: e.version,
      author: e.author,
      description: e.description,
      originKey: ORIGIN_KEY[e.origin],
      statusKey: STATUS_KEY[e.status],
      statusTone: STATUS_TONE[e.status],
      detailKey: d.key,
      detailValues: d.values,
      canToggle: toggleable,
      enabled: e.enabled,
      permissionKeys: e.permissions.map((p) => ADDON_PERMISSION_KEYS[p]),
      canOptions: e.hasSettings,
      canPublish: input.desktop && e.origin === 'local' && e.status !== 'invalid',
      showErrors: input.expandedErrors.has(e.key),
      errors: e.recentErrors,
      stats: e.stats,
      running: e.status === 'running',
    };
  });
  const bannerKey: TranslationKey | null =
    input.safeMode === 'crash'
      ? 'hudChrome.addons.safeCrash'
      : input.safeMode === 'requested'
        ? 'hudChrome.addons.safeRequested'
        : input.safeMode === 'url'
          ? 'hudChrome.addons.safeUrl'
          : null;
  const signature = JSON.stringify([
    input.masterEnabled,
    input.loadOutdated,
    input.safeMode,
    input.workshopAvailable,
    rows.map((r) => [
      r.key,
      r.statusKey,
      r.enabled,
      r.detailKey,
      r.detailValues,
      r.showErrors,
      r.errors.length,
    ]),
  ]);
  return {
    masterEnabled: input.masterEnabled,
    loadOutdated: input.loadOutdated,
    bannerKey,
    canLeaveSafe: input.safeMode !== null,
    workshopNoteKey:
      input.desktop && !input.workshopAvailable ? 'hudChrome.addons.workshopUnavailable' : null,
    desktop: input.desktop,
    rows,
    emptyKey: rows.length === 0 ? 'hudChrome.addons.empty' : null,
    signature,
  };
}

/** Saved-data size in whole KB for the stats line (at least 0). */
export function savedKb(bytes: number): number {
  return Math.max(0, Math.round(bytes / 102.4) / 10);
}
