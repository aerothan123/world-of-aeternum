// Creator CLI: validate an add-on folder and publish it to the Steam Workshop
// (create on first run, update afterwards). Shares its code with the desktop
// shell's in-game Publish button (electron/addons.cjs + steam_workshop.cjs).
//
//   node scripts/addon_publish.mjs <folder> [--visibility private|friends|unlisted|public]
//                                  [--note "change note"] [--dry-run]
//
// Needs the Steam client running and logged in with an account that owns the
// app. The App ID comes from WYND_STEAM_APP_ID or WOC_STEAM_APP_ID (Spacewar 480
// is refused for publishing: its Workshop belongs to Valve's test app).
// docs/design/addon-api.md section 9.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { shellManifest, readAddonFolder, ADDON_WORKSHOP_TAGS } = require('../electron/addons.cjs');
const { publishAddonFolder } = require('../electron/steam_workshop.cjs');

function parseArgs(argv) {
  const out = { folder: null, visibility: 'private', note: '', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--visibility') out.visibility = argv[++i] ?? '';
    else if (a === '--note') out.note = argv[++i] ?? '';
    else if (a === '--dry-run') out.dryRun = true;
    else if (!out.folder) out.folder = a;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.folder) {
  console.error(
    'usage: node scripts/addon_publish.mjs <folder> [--visibility v] [--note n] [--dry-run]',
  );
  process.exit(2);
}
if (!['private', 'friends', 'unlisted', 'public'].includes(args.visibility)) {
  console.error(`unknown visibility "${args.visibility}"`);
  process.exit(2);
}
const dir = path.resolve(args.folder);
const pkg = readAddonFolder(dir, 'local', fs);
if (!pkg) {
  console.error(`no addon.json in ${dir}`);
  process.exit(1);
}
const manifest = shellManifest(pkg.manifestText);
if (!manifest) {
  console.error('addon.json failed validation (id, name, version, files)');
  process.exit(1);
}
const missing = manifest.files.filter((f) => typeof pkg.files[f] !== 'string');
if (missing.length > 0) {
  console.error(`files missing, unreadable or over the size cap: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`ok: ${manifest.id} ${manifest.version} (${manifest.files.length} files)`);
if (args.dryRun) process.exit(0);

const appId = Number(process.env.WYND_STEAM_APP_ID || process.env.WOC_STEAM_APP_ID || 0);
if (!Number.isInteger(appId) || appId <= 0 || appId === 480) {
  console.error('set WYND_STEAM_APP_ID (or WOC_STEAM_APP_ID) to the game App ID');
  process.exit(1);
}
let client;
try {
  client = require('steamworks.js').init(appId);
} catch (err) {
  console.error(`Steam init failed (is Steam running and logged in?): ${err?.message ?? err}`);
  process.exit(1);
}
const res = await publishAddonFolder({
  client,
  appId,
  dir,
  manifest,
  visibility: args.visibility,
  changeNote: args.note,
  fs,
  log: console,
  tagAllowlist: ADDON_WORKSHOP_TAGS,
});
if (!res.ok) {
  console.error(`publish failed: ${res.code}`);
  process.exit(1);
}
console.log(`published item ${res.itemId} (${res.code})`);
if (res.code === 'agreement') {
  console.log('Accept the Steam Workshop legal agreement on the item page to make it visible.');
}
process.exit(0);
