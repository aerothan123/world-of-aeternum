// Wyndlewood 2D replacement, step 6: contact sheets of the SHIPPED icons (the converted webp,
// at the served 128px size) for review, under docs/screenshots/asset-rights/.
// usage: node scripts/assets/wyndlewood_2d/contact_sheets.mjs [--family skills]
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : process.argv[i + 1];
};
const fams = arg('--family', '').split(',').filter(Boolean);
const outDir = join(root, 'docs/screenshots/asset-rights');
mkdirSync(outDir, { recursive: true });
const prov = JSON.parse(readFileSync(join(here, 'provenance.json'), 'utf8'));
const byFam = new Map();
for (const f of Object.keys(prov)) {
  const fam = prov[f].sheet.replace(/_\d+$/, '');
  if (fams.length && !fams.includes(fam)) continue;
  if (!byFam.has(fam)) byFam.set(fam, []);
  byFam.get(fam).push(f);
}
const COLS = 12;
const PER = 144;
for (const [fam, files] of byFam) {
  files.sort((a, b) => (prov[a].sheet + String(prov[a].cell).padStart(2, '0') < prov[b].sheet + String(prov[b].cell).padStart(2, '0') ? -1 : 1));
  for (let p = 0; p * PER < files.length; p++) {
    const page = files.slice(p * PER, (p + 1) * PER).filter((f) => existsSync(join(root, f)));
    const tiles = await Promise.all(page.map((f) => sharp(join(root, f)).resize(128, 128).flatten({ background: '#3a3a3a' }).png().toBuffer()));
    const rows = Math.ceil(tiles.length / COLS);
    await sharp({ create: { width: COLS * 132, height: rows * 132, channels: 3, background: '#1c1c1c' } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % COLS) * 132 + 2, top: Math.floor(i / COLS) * 132 + 2 })))
      .jpeg({ quality: 78 })
      .toFile(join(outDir, `${fam}_${String(p + 1).padStart(2, '0')}.jpg`));
  }
  console.log('[w2d] contact', fam, files.length);
}
