// Wyndlewood 2D replacement, step 2: subjects.json -> sheets.json (one Tripo task per sheet).
// usage: node scripts/assets/wyndlewood_2d/plan_sheets.mjs [--grid 4] [--family items,skills]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSheets } from './plan_core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : process.argv[i + 1];
};
const grid = Number(arg('--grid', '4'));
const fams = arg('--family', '').split(',').filter(Boolean);
let records = JSON.parse(readFileSync(join(here, 'subjects.json'), 'utf8'));
if (fams.length) records = records.filter((r) => fams.includes(r.family));
const sheets = planSheets(records, { grid });
const out = join(here, 'sheets.json');
let existing = [];
try {
  existing = JSON.parse(readFileSync(out, 'utf8'));
} catch {}
const keepOthers = existing.filter((s) => !sheets.some((t) => t.family === s.family));
writeFileSync(out, `${JSON.stringify([...keepOthers, ...sheets], null, 1)}\n`);
console.log('[w2d] sheets', sheets.length, 'cells', records.length);
