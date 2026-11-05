// Wyndlewood 2D replacement, step 1: one painted subject per shipped icon.
//
// Bundles the live sim content (items, abilities, talents, deeds) with esbuild, walks each
// replaced icon folder on disk, and writes `subjects.json`: one record per file with the
// family, the file it replaces in place, and an ORIGINAL text subject composed from the
// game's own names and mechanics. No image, reference or upstream prompt is read; the
// subjects are the only creative input the generator sees (see sheets.json).
//
// usage: node scripts/assets/wyndlewood_2d/build_subjects.mjs [--content dump.json]
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { FAMILIES, composeSubject, varySubjects } from './subject_core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();

async function loadContent() {
  const i = process.argv.indexOf('--content');
  if (i !== -1) return JSON.parse(readFileSync(process.argv[i + 1], 'utf8'));
  const { build } = await import('esbuild');
  const dir = mkdtempSync(join(tmpdir(), 'w2d-'));
  const out = join(dir, 'content.mjs');
  await build({
    stdin: {
      contents: `export { ITEMS } from './src/sim/data.ts';
export { ABILITIES } from './src/sim/content/classes.ts';
export { TALENTS } from './src/sim/content/talents.ts';
export { DEEDS } from './src/sim/content/deeds.ts';`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    logLevel: 'error',
  });
  const mod = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
  const pick = (o) => {
    const r = {};
    for (const [k, v] of Object.entries(o ?? {})) {
      if ((typeof v === 'string' && v.length < 400) || typeof v === 'number') r[k] = v;
    }
    return r;
  };
  const talents = [];
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 8) return;
    if (typeof o.id === 'string' && typeof o.name === 'string') talents.push(pick(o));
    for (const v of Object.values(o)) walk(v, d + 1);
  };
  walk(mod.TALENTS);
  return {
    items: Object.values(mod.ITEMS).map(pick),
    abilities: Object.values(mod.ABILITIES).map(pick),
    talents,
    deeds: Object.values(mod.DEEDS).map(pick),
  };
}

function listFiles(dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...listFiles(`${dir}/${e.name}`));
    else if (/\.(webp|png|jpg)$/.test(e.name)) out.push(`${dir}/${e.name}`);
  }
  return out.sort();
}

const content = await loadContent();
const index = {
  items: new Map(content.items.map((x) => [x.id, x])),
  abilities: new Map(content.abilities.map((x) => [x.id, x])),
  talents: new Map(content.talents.map((x) => [x.id, x])),
  deeds: new Map(content.deeds.map((x) => [x.id, x])),
};
index.meta = new Map();
const sharpMod = (await import('sharp')).default;
for (const fam of FAMILIES.filter((f) => f.id === 'misc')) {
  for (const file of listFiles(fam.dir)) {
    const m = await sharpMod(join(root, file)).metadata();
    index.meta.set(file, { w: m.width, h: m.height, alpha: Boolean(m.hasAlpha), format: m.format });
  }
}
const keep = new Set(JSON.parse(readFileSync(join(here, 'keep.json'), 'utf8')));
const records = [];
for (const fam of FAMILIES) {
  for (const file of listFiles(fam.dir)) {
    if (keep.has(file)) continue;
    const rec = composeSubject(fam.id, file, index);
    if (rec) records.push(rec);
  }
}
varySubjects(records);
writeFileSync(join(here, 'subjects.json'), `${JSON.stringify(records, null, 1)}\n`);
const by = {};
for (const r of records) by[r.family] = (by[r.family] ?? 0) + 1;
console.log('[w2d] subjects', records.length, JSON.stringify(by));
