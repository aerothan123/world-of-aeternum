// Add a WYN_PROP_MODELS row (src/sim/content/wyndlewood_props.ts) for every
// shipped public/models/props/wyn_*.glb that has none yet, measured off the
// file: normalized height and ground extents, category from the kit. The rows
// land above the fill_rows marker line; biome formats them afterwards.
// usage: node scripts/assets/wyndlewood_props/fill_rows.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const TABLE = 'src/sim/content/wyndlewood_props.ts';
const MARKER = '  // fill_rows: new rows land above this line';
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const kit = JSON.parse(readFileSync('assets_src/wyndlewood_props/kit.json', 'utf8')).assets;
const category = new Map();
for (const a of kit) {
  if (a.sheet) for (const p of a.sheet) category.set(p.id, p.category ?? a.category);
  else category.set(a.id, a.category);
}
const pascal = (s) => s.replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
export const propKeyFor = (id) => `wyn${pascal(id.replace(/^[a-z]+_/, ''))}`;
let text = readFileSync(TABLE, 'utf8');
const at = text.indexOf(MARKER);
if (at < 0) throw new Error('no fill_rows marker');
const rows = [];
for (const f of readdirSync('public/models/props').filter((n) => /^wyn_.*\.glb$/.test(n)).sort()) {
  const id = f.slice(4, -4);
  if (text.includes(`  ${id}: wynModel(`)) continue;
  const cat = category.get(id);
  if (!cat) throw new Error(`no kit category for ${id}`);
  const doc = await io.read(`public/models/props/${f}`);
  const b = getBounds(doc.getRoot().listScenes()[0]);
  const r = (v) => +v.toFixed(2);
  rows.push(
    `  ${id}: wynModel('${id}', '${propKeyFor(id)}', '${cat}', ${r(b.max[1] - b.min[1])}, ${r(b.max[0] - b.min[0])}, ${r(b.max[2] - b.min[2])}),\n`,
  );
}
text = text.slice(0, at) + rows.join('') + text.slice(at);
writeFileSync(TABLE, text);
console.log(`fill_rows: ${rows.length} new row(s)`, rows.map((x) => x.trim().split(':')[0]).join(' '));
