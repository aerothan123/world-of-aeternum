'use strict';

// Steam Workshop (ISteamUGC) glue for add-ons, shared by the desktop shell
// (electron/addons.cjs) and the creator CLI (scripts/addon_publish.mjs). Every
// Steam call goes through an injected steamworks.js client (the existing
// optional dependency; no new package), so the whole module is Node-testable
// with fakes. Nothing here executes add-on code: Workshop content is files that
// the game's sandboxed runtime later loads. Contract: docs/design/addon-api.md
// section 9.

const path = require('node:path');

/** Steam's EItemState bits (ISteamUGC::GetItemState). */
const ITEM_STATE = {
  subscribed: 1,
  legacy: 2,
  installed: 4,
  needsUpdate: 8,
  downloading: 16,
  downloadPending: 32,
};

/** UgcItemVisibility in steamworks.js. */
const VISIBILITY = { public: 0, friends: 1, private: 2, unlisted: 3 };

/** The tag every add-on carries; the rest come from addon.json `tags`. */
const BASE_TAG = 'Addon';

/** The sidecar that remembers a local add-on's published Workshop id. */
const WORKSHOP_SIDECAR = 'workshop.json';

function bigId(id) {
  return typeof id === 'bigint' ? id : BigInt(String(id));
}

/**
 * Subscribed items with their install folders. Not-yet-installed items are
 * returned with `folder: null` and a download is requested (high priority), so
 * they appear on a later listing. Never throws: a failing item is skipped.
 */
function listSubscribedItems(client, log) {
  const ws = client?.workshop;
  if (!ws || typeof ws.getSubscribedItems !== 'function') return [];
  let ids = [];
  try {
    ids = ws.getSubscribedItems() ?? [];
  } catch (err) {
    log?.warn?.('[workshop] getSubscribedItems failed', err?.message ?? err);
    return [];
  }
  const out = [];
  for (const id of ids.slice(0, 500)) {
    try {
      const state = Number(ws.state(id)) || 0;
      const info = state & ITEM_STATE.installed ? ws.installInfo(id) : null;
      if (info?.folder) {
        out.push({
          id: String(id),
          folder: info.folder,
          needsUpdate: !!(state & ITEM_STATE.needsUpdate),
        });
        if (state & ITEM_STATE.needsUpdate) ws.download(id, false);
      } else {
        ws.download(id, true);
        out.push({ id: String(id), folder: null, needsUpdate: false });
      }
    } catch (err) {
      log?.warn?.('[workshop] item probe failed', err?.message ?? err);
    }
  }
  return out;
}

function readSidecar(fs, dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, WORKSHOP_SIDECAR), 'utf8');
    const v = JSON.parse(raw);
    return v && /^\d{1,20}$/.test(String(v.publishedFileId)) ? String(v.publishedFileId) : null;
  } catch {
    return null;
  }
}

/** Workshop tags for a manifest: the base tag plus allowlisted manifest tags. */
function workshopTags(manifestTags, allowlist) {
  const tags = [BASE_TAG];
  for (const t of Array.isArray(manifestTags) ? manifestTags : []) {
    if (allowlist.includes(t) && !tags.includes(t)) tags.push(t);
  }
  return tags;
}

/**
 * Create (first time) or update the Workshop item for one validated add-on
 * folder. Returns { ok, code, itemId? } with code one of published | agreement
 * | noSteam | failed. `manifest` is the shell's validated summary.
 */
async function publishAddonFolder({
  client,
  appId,
  dir,
  manifest,
  visibility,
  changeNote,
  fs,
  log,
  tagAllowlist,
}) {
  const ws = client?.workshop;
  if (!ws || typeof ws.createItem !== 'function' || typeof ws.updateItem !== 'function') {
    return { ok: false, code: 'noSteam' };
  }
  try {
    let itemId = readSidecar(fs, dir);
    let agreement = false;
    if (!itemId) {
      const created = await ws.createItem(appId);
      itemId = String(created.itemId);
      agreement = !!created.needsToAcceptAgreement;
      fs.writeFileSync(
        path.join(dir, WORKSHOP_SIDECAR),
        `${JSON.stringify({ publishedFileId: itemId }, null, 2)}\n`,
      );
    }
    const preview = path.join(dir, 'preview.png');
    const update = {
      title: String(manifest.name).slice(0, 128),
      description: String(manifest.description || '').slice(0, 8000),
      changeNote: String(changeNote || '').slice(0, 400),
      contentPath: dir,
      tags: workshopTags(manifest.tags, tagAllowlist),
      visibility: VISIBILITY[visibility] ?? VISIBILITY.private,
    };
    if (fs.existsSync(preview)) update.previewPath = preview;
    const res = await ws.updateItem(bigId(itemId), update, appId);
    agreement = agreement || !!res?.needsToAcceptAgreement;
    return { ok: true, code: agreement ? 'agreement' : 'published', itemId };
  } catch (err) {
    log?.warn?.('[workshop] publish failed', err?.message ?? err);
    return { ok: false, code: 'failed' };
  }
}

module.exports = {
  ITEM_STATE,
  VISIBILITY,
  BASE_TAG,
  WORKSHOP_SIDECAR,
  listSubscribedItems,
  publishAddonFolder,
  workshopTags,
};
