// Wyndlewood 2D replacement, step 5: point each family's mapping.json at the new art.
// Every replaced id leaves its upstream entry or batch (an emptied upstream batch is dropped)
// and joins one Wyndlewood record, so each icon keeps exactly one provenance owner.
//
// usage: node scripts/assets/wyndlewood_2d/apply_provenance.mjs [--family items,skills,auras]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLE } from './plan_core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : process.argv[i + 1];
};
const fams = arg('--family', 'items,skills,auras').split(',').filter(Boolean);
const prov = JSON.parse(readFileSync(join(here, 'provenance.json'), 'utf8'));
export const LICENSE = 'Wyndlewood original art (owned by the Wyndlewood project owner, created for this game)';
export const SOURCE =
  "Tripo text-to-image (seedream_v4) from original text prompts on the Wyndlewood owner's paid Tripo plan; no reference images";
const PACK = 'wyndlewood-2d-v1';
const REC = 'scripts/assets/wyndlewood_2d/provenance.json';
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const writeJson = (p, v) => writeFileSync(join(root, p), `${JSON.stringify(v, null, 2)}\n`);
const replaced = (prefix) =>
  Object.keys(prov)
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(f.lastIndexOf('/') + 1).replace(/\.[a-z]+$/, ''));

if (fams.includes('items')) {
  const p = 'public/ui/items/mapping.json';
  const m = readJson(p);
  const ids = new Set(replaced('public/ui/items/'));
  m.entries = (m.entries ?? []).filter((e) => !ids.has(e.itemId));
  m.generatedBatches = (m.generatedBatches ?? [])
    .filter((b) => b.batchId !== 'wyndlewood-2d-items-v1')
    .map((b) => ({ ...b, itemIds: (b.itemIds ?? []).filter((i) => !ids.has(i)) }))
    .filter((b) => b.itemIds.length > 0);
  m.generatedBatches.push({
    batchId: 'wyndlewood-2d-items-v1',
    source: SOURCE,
    owner: 'Wyndlewood',
    license: LICENSE,
    styleReference: 'none: original text prompts only',
    commonPrompt: STYLE,
    provenanceRecord: REC,
    itemIds: [...ids].sort(),
  });
  writeJson(p, m);
  console.log('[w2d] items mapping', ids.size);
}

if (fams.includes('skills')) {
  for (const cls of ['druid', 'hunter', 'mage', 'paladin', 'pet', 'priest', 'rogue', 'shaman', 'shardpike', 'warlock', 'warrior']) {
    const p = `public/ui/skills/${cls}/mapping.json`;
    if (!existsSync(join(root, p))) continue;
    const m = readJson(p);
    const ids = new Set(replaced(`public/ui/skills/${cls}/`));
    let n = 0;
    for (const a of m.abilities ?? []) {
      const id = (a.output ?? '').replace(/\.webp$/, '');
      const key = `public/ui/skills/${cls}/${a.output}`;
      if (!ids.has(id)) continue;
      for (const k of Object.keys(a)) if (!['abilityId', 'output'].includes(k)) delete a[k];
      a.sourcePack = PACK;
      a.sourceFile = `${REC}#${prov[key].sheet}/${prov[key].cell}`;
      a.source = SOURCE;
      a.owner = 'Wyndlewood';
      a.license = LICENSE;
      n++;
    }
    m.license = LICENSE;
    m.sourcePacks = [PACK];
    delete m.licenseScope;
    writeJson(p, m);
    console.log('[w2d] skills mapping', cls, n);
  }
}

if (fams.includes('auras')) {
  const p = 'public/ui/auras/mapping.json';
  const m = readJson(p);
  let n = 0;
  for (const a of m.assets ?? []) {
    const key = `public/ui/auras/${a.output}`;
    const r = prov[key];
    if (!r) continue;
    for (const k of Object.keys(a)) if (!['auraId', 'output'].includes(k)) delete a[k];
    Object.assign(a, {
      sourcePack: PACK,
      sourceFile: `${REC}#${r.sheet}/${r.cell}`,
      source: SOURCE,
      owner: 'Wyndlewood',
      license: LICENSE,
      intendedVisualSubject: r.subject,
      sourceSha256: r.masterSha256,
    });
    n++;
  }
  m.license = LICENSE;
  writeJson(p, m);
  console.log('[w2d] auras mapping', n);
}

if (fams.includes('misc') || fams.includes('wide')) {
  // The small UI families keep their own mapping shapes; rewrite only the licence fields of
  // the rows that name a replaced file, plus the file-level licence.
  const files = Object.keys(prov).filter((f) => /^public\/(ui|textures\/loading)\//.test(f));
  const dirs = new Set();
  for (const f of files) {
    const parts = f.split('/');
    for (let i = 3; i < parts.length; i++) {
      const d = parts.slice(0, i).join('/');
      if (existsSync(join(root, d, 'mapping.json'))) dirs.add(d);
    }
  }
  for (const d of dirs) {
    if (/ui\/(items|skills|auras)(\/|$)/.test(d)) continue;
    const p = `${d}/mapping.json`;
    const m = readJson(p);
    const names = new Set(files.filter((f) => f.startsWith(`${d}/`)).map((f) => f.slice(d.length + 1)));
    const stems = new Set([...names].map((n) => n.replace(/^.*\//, '').replace(/\.[a-z]+$/, '')));
    let n = 0;
    const visit = (o) => {
      if (Array.isArray(o)) return o.forEach(visit);
      if (!o || typeof o !== 'object') return;
      const vals = Object.values(o).filter((v) => typeof v === 'string');
      const hit = vals.some((v) => names.has(v) || stems.has(v) || [...names].some((x) => v.endsWith(`/${x}`)));
      if (hit) {
        for (const k of Object.keys(o)) if (/sha256|bytes|reference|prompt|lineage/i.test(k)) delete o[k];
        if ('license' in o || 'licence' in o || 'source' in o || 'owner' in o) {
          o.license = LICENSE;
          o.source = SOURCE;
          o.owner = 'Wyndlewood';
        }
        n++;
      }
      for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v);
    };
    visit(m);
    if (typeof m.license === 'string') m.license = LICENSE;
    if (typeof m.source === 'string') m.source = SOURCE;
    writeJson(p, m);
    console.log('[w2d] mapping', p, n);
  }
}
