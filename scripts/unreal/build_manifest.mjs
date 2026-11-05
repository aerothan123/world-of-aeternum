// Builds the import manifest for the Unreal asset-convert pipeline.
// Usage: node scripts/unreal/build_manifest.mjs <outJson>
// Asset id = path under public/models without the .glb extension (stable, unique).
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(process.cwd(), 'public', 'models');
const out = process.argv[2] ?? 'manifest.json';
const SKIP_DIRS = new Set(['foliage', 'chars', 'vfx']); // nature crew / characters / fx are out of scope
const FURNITURE = /(chair|table|bed|shelf|barrel|crate|chest|stool|bench|cabinet|lamp|candle|furnit|wardrobe|desk|rug|sofa|bookcase)/i;

function walk(dir, acc) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (n.toLowerCase().endsWith('.glb')) acc.push(p);
  }
  return acc;
}

function classify(rel) {
  const parts = rel.split('/');
  const top = parts[0];
  const base = parts[parts.length - 1];
  if (SKIP_DIRS.has(top)) return null;
  if (base.startsWith('eastbrook_')) return { tier: 1, cat: 'Buildings' };
  if (top === 'creatures' || top === 'mounts' || top === 'buddies') return { tier: 5, cat: 'Creatures' };
  if (top === 'weapons' || top === 'tools') return { tier: 4, cat: 'Weapons' };
  if (FURNITURE.test(base)) return { tier: 3, cat: 'Furniture' };
  return { tier: 2, cat: 'Props' };
}

function matClass(name) {
  const n = name.toLowerCase();
  if (/(thatch|roof|shingle|tile)/.test(n)) return 'Roof';
  if (/(stone|rock|brick|wall|cobble|castle|tower)/.test(n)) return 'Stone';
  if (/(plaster|daub)/.test(n)) return 'Plaster';
  if (/(iron|steel|metal|blade|sword|axe|anvil|bell|forge)/.test(n)) return 'Metal';
  if (/(cloth|banner|tent|sack|flag|rug|curtain)/.test(n)) return 'Cloth';
  return 'Wood';
}

const items = [];
for (const f of walk(root, [])) {
  const rel = relative(root, f).split(sep).join('/');
  const c = classify(rel);
  if (!c) continue;
  const id = rel.replace(/\.glb$/i, '');
  const safe = id.replace(/[^A-Za-z0-9_]+/g, '_');
  items.push({ id, glb: rel, tier: c.tier, cat: c.cat, mat: matClass(id), name: 'SM_' + safe,
    bytes: statSync(f).size });
}
items.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
writeFileSync(out, JSON.stringify({ modelsRoot: root, count: items.length, items }, null, 1));
const byCat = {};
for (const i of items) byCat[i.cat] = (byCat[i.cat] ?? 0) + 1;
console.log(items.length, JSON.stringify(byCat));
