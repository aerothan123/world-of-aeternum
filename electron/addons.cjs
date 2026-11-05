'use strict';

// The desktop shell's add-on surface: lists the local AddOns folder and the
// installed Steam Workshop items, opens the folder, and publishes a LOCAL add-on
// to the Workshop. It only READS files (size-capped, contained to the add-on
// folder, no symlinks) and hands their text to the renderer, where the
// sandboxed runtime validates and runs them (src/ui/hud/addons/). It never
// executes add-on code itself. Node-testable: fs, the Steam client and the
// folder opener are injected. Contract: docs/design/addon-api.md section 9.

const nodeFs = require('node:fs');
const path = require('node:path');
const { listSubscribedItems, publishAddonFolder } = require('./steam_workshop.cjs');

/** The shape limits shared with src/ui/hud/addons/addon_manifest_core.ts
 *  (ADDON_LIMITS); tests/electron_addons.test.ts pins the two equal. */
const ADDON_SHELL_LIMITS = {
  maxFiles: 16,
  maxTotalBytes: 512 * 1024,
  maxManifestBytes: 64 * 1024,
  maxFolders: 200,
};
const ID_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
const SEMVER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const FILE_RE = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js$/;
const FOLDER_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
/** Mirrors ADDON_WORKSHOP_TAGS in addon_manifest_core.ts. */
const ADDON_WORKSHOP_TAGS = [
  'Addon',
  'Combat',
  'Meters',
  'Timers',
  'Map',
  'Interface',
  'Chat',
  'Social',
  'Library',
];
const SAFE_MODE_FLAGS = ['--safe-mode', '--wynd-safe-mode'];

/** Minimal manifest check for the shell (the renderer re-validates fully). */
function shellManifest(text) {
  let m;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return null;
  if (typeof m.name !== 'string' || m.name.trim() === '' || m.name.length > 64) return null;
  if (typeof m.version !== 'string' || !SEMVER_RE.test(m.version)) return null;
  let files;
  if (Array.isArray(m.files)) files = m.files;
  else if (typeof m.entry === 'string') files = [m.entry];
  else return null;
  if (files.length === 0 || files.length > ADDON_SHELL_LIMITS.maxFiles) return null;
  if (!files.every((f) => typeof f === 'string' && FILE_RE.test(f))) return null;
  return {
    id: m.id,
    name: m.name.trim(),
    version: m.version,
    description: typeof m.description === 'string' ? m.description.slice(0, 400) : '',
    tags: Array.isArray(m.tags) ? m.tags.filter((t) => ADDON_WORKSHOP_TAGS.includes(t)) : [],
    files,
  };
}

/** True when `child` resolves strictly inside `dir` (no traversal). */
function contained(dir, child) {
  const base = path.resolve(dir);
  const full = path.resolve(base, child);
  return full.startsWith(base + path.sep);
}

/** Read one regular, non-symlink file under the cap, or null. */
function readCapped(fs, file, cap) {
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > cap) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Read one add-on folder into the IPC package shape, or null when it is not an
 * add-on. A folder whose manifest parses but whose files fail the caps is still
 * returned (with the files it could read) so the Addons window can show why.
 */
function readAddonFolder(dir, origin, fs = nodeFs, extra = {}) {
  const manifestText = readCapped(
    fs,
    path.join(dir, 'addon.json'),
    ADDON_SHELL_LIMITS.maxManifestBytes,
  );
  if (manifestText === null) return null;
  const files = {};
  const m = shellManifest(manifestText);
  if (m) {
    let total = 0;
    for (const f of m.files) {
      if (!contained(dir, f)) continue;
      const text = readCapped(fs, path.resolve(dir, f), ADDON_SHELL_LIMITS.maxTotalBytes);
      if (text === null) continue;
      total += Buffer.byteLength(text, 'utf8');
      if (total > ADDON_SHELL_LIMITS.maxTotalBytes) break;
      files[f] = text;
    }
  }
  return { origin, folder: path.basename(dir), manifestText, files, ...extra };
}

/** Every add-on folder directly under `root` (created on first use). */
function listLocalAddons(root, fs = nodeFs) {
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch {
    return [];
  }
  let names = [];
  try {
    names = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const d of names.slice(0, ADDON_SHELL_LIMITS.maxFolders)) {
    if (!d.isDirectory() || !FOLDER_RE.test(d.name)) continue;
    const pkg = readAddonFolder(path.join(root, d.name), 'local', fs);
    if (pkg) out.push(pkg);
  }
  return out;
}

function resolveLocalRoot({ userDataDir, env, isPackaged }) {
  const override = env?.WYND_ADDONS_DIR;
  if (isPackaged !== true && typeof override === 'string' && override.trim() !== '') {
    return path.resolve(override);
  }
  return path.join(userDataDir, 'AddOns');
}

/**
 * Build the shell's add-on facade. `steamShell` is electron/steam.cjs's facade
 * (its `client()` answers the initialized steamworks.js client or null). Every
 * method resolves; none throws across IPC.
 */
function createAddonsShell({
  userDataDir,
  env,
  isPackaged,
  argv,
  steamShell,
  openPath,
  log,
  fs = nodeFs,
} = {}) {
  const localRoot = resolveLocalRoot({ userDataDir, env, isPackaged });
  const safeMode = Array.isArray(argv) && argv.some((a) => SAFE_MODE_FLAGS.includes(a));

  function steamClient() {
    if (!steamShell?.enabled || typeof steamShell.client !== 'function') return null;
    try {
      return steamShell.client();
    } catch {
      return null;
    }
  }

  async function list() {
    const packages = listLocalAddons(localRoot, fs);
    const client = steamClient();
    let workshopAvailable = false;
    if (client) {
      workshopAvailable = true;
      for (const item of listSubscribedItems(client, log)) {
        if (!item.folder) {
          packages.push({
            origin: 'workshop',
            folder: item.id,
            manifestText: '',
            files: {},
            workshopId: item.id,
            pending: true,
          });
          continue;
        }
        const pkg = readAddonFolder(item.folder, 'workshop', fs, { workshopId: item.id });
        if (pkg) packages.push({ ...pkg, folder: item.id });
      }
    }
    return { packages, safeMode, workshopAvailable, localFolder: localRoot };
  }

  async function openFolder() {
    try {
      fs.mkdirSync(localRoot, { recursive: true });
      if (typeof openPath !== 'function') return false;
      const err = await openPath(localRoot);
      return !err;
    } catch {
      return false;
    }
  }

  async function publish(request) {
    const folder = typeof request?.folder === 'string' ? request.folder : '';
    if (!FOLDER_RE.test(folder) || folder.includes('..')) return { ok: false, code: 'notFound' };
    const dir = path.join(localRoot, folder);
    if (!contained(localRoot, folder)) return { ok: false, code: 'notFound' };
    const pkg = readAddonFolder(dir, 'local', fs);
    if (!pkg) return { ok: false, code: 'notFound' };
    const manifest = shellManifest(pkg.manifestText);
    if (!manifest || Object.keys(pkg.files).length !== manifest.files.length) {
      return { ok: false, code: 'invalid' };
    }
    const client = steamClient();
    if (!client) return { ok: false, code: 'noSteam' };
    const visibility = ['public', 'friends', 'private', 'unlisted'].includes(request.visibility)
      ? request.visibility
      : 'private';
    return publishAddonFolder({
      client,
      appId: steamShell.appId,
      dir,
      manifest,
      visibility,
      changeNote: typeof request.changeNote === 'string' ? request.changeNote : '',
      fs,
      log,
      tagAllowlist: ADDON_WORKSHOP_TAGS,
    });
  }

  return { localRoot, safeMode, list, openFolder, publish };
}

module.exports = {
  ADDON_SHELL_LIMITS,
  ADDON_WORKSHOP_TAGS,
  SAFE_MODE_FLAGS,
  shellManifest,
  contained,
  readAddonFolder,
  listLocalAddons,
  resolveLocalRoot,
  createAddonsShell,
};
