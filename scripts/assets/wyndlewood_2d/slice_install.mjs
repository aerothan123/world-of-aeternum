// Wyndlewood 2D replacement, step 4: cut each painted sheet into per-file masters and drop
// them where the family's own converter picks them up, replacing the shipped art in place
// (same ids, same paths, so no code path changes).
//   items, skills: opaque 512px PNG beside the webp (npm run assets:items / assets:skills)
//   auras:         encoded here straight to the 128px webp contract (no converter exists)
//   deeds:         keyed transparent 512px PNG in tmp/wyndlewood_2d/deeds_src
//                  (node scripts/convert_deed_icons_webp.mjs tmp/wyndlewood_2d/deeds_src)
// Writes provenance.json (committed): file -> sheet, cell, Tripo task, subject, master hash.
//
// usage: node scripts/assets/wyndlewood_2d/slice_install.mjs [--family skills]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cellRects, findRules, profile, refineRect } from './grid_core.mjs';
import { keepCenterComponent, keyAlpha } from './key_core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : process.argv[i + 1];
};
const fams = arg('--family', '').split(',').filter(Boolean);
const sheetDir = join(root, 'tmp/wyndlewood_2d/sheets');
const reviewDir = join(root, 'tmp/wyndlewood_2d/review');
const deedSrc = join(root, 'tmp/wyndlewood_2d/deeds_src');
mkdirSync(reviewDir, { recursive: true });
mkdirSync(deedSrc, { recursive: true });
const FULL_BLEED = new Set(['skills', 'auras', 'deeds']);
const NO_RULES = new Set(['wide']);
const subjects = new Map(
  JSON.parse(readFileSync(join(here, 'subjects.json'), 'utf8')).map((r) => [r.file, r]),
);
const ledger = new Map();
for (const l of readFileSync(join(here, 'ledger.jsonl'), 'utf8').split('\n')) {
  if (!l.trim()) continue;
  const r = JSON.parse(l);
  if (r.status === 'done') ledger.set(r.sheet, r);
}
const provPath = join(here, 'provenance.json');
const prov = existsSync(provPath) ? JSON.parse(readFileSync(provPath, 'utf8')) : {};
let sheets = JSON.parse(readFileSync(join(here, 'sheets.json'), 'utf8'));
if (fams.length) sheets = sheets.filter((s) => fams.includes(s.family));
const sha = (b) => createHash('sha256').update(b).digest('hex');
let count = 0;

const RING = {
  bronze: ['#f0c27a', '#a8682c', '#5a3214'],
  silver: ['#f4f6f8', '#a4acb6', '#4c535c'],
  iron: ['#b8b4ae', '#6c6862', '#2c2a28'],
};
// Deed medallion built in code: the painted cell is cropped to a disc and framed by a metal
// ring, so every crest shares one silhouette and lands inside the converter's coverage window
// (disc radius 196 on 512: coverage ~0.46, padding 60, centred by construction).
async function deedMaster(cellPng, metal) {
  const [hi, mid, lo] = RING[metal] ?? RING.bronze;
  const art = await sharp(cellPng)
    .resize(360, 360, { fit: 'cover' })
    .removeAlpha()
    .png()
    .toBuffer();
  const disc = Buffer.from(
    '<svg width="360" height="360"><circle cx="180" cy="180" r="178" fill="#fff"/></svg>',
  );
  const face = await sharp(art)
    .ensureAlpha()
    .composite([{ input: disc, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const ring = Buffer.from(
    `<svg width="512" height="512"><defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${hi}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient>` +
      `<linearGradient id="b" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>` +
      `<circle cx="256" cy="256" r="186" fill="none" stroke="url(#m)" stroke-width="20"/>` +
      `<circle cx="256" cy="256" r="195" fill="none" stroke="${lo}" stroke-width="2"/>` +
      `<circle cx="256" cy="256" r="176.5" fill="none" stroke="url(#b)" stroke-width="3"/></svg>`,
  );
  return sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: face, left: 76, top: 76 },
      { input: ring, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

for (const s of sheets) {
  const src = join(sheetDir, `${s.id}.png`);
  if (!existsSync(src)) continue;
  const { data, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
  const xr = NO_RULES.has(s.family)
    ? []
    : findRules(profile(data, info.width, info.height, 'x'), s.grid);
  const yr = NO_RULES.has(s.family)
    ? []
    : findRules(profile(data, info.width, info.height, 'y'), s.grid);
  let rects =
    s.grid === 1
      ? [{ left: 0, top: 0, width: info.width, height: info.height }]
      : cellRects(xr, yr);
  if (FULL_BLEED.has(s.family)) rects = rects.map((r) => refineRect(data, info.width, r));
  const review = [];
  for (const cell of s.cells) {
    // `painted` names the grid cell the model actually painted this subject into, for a sheet
    // whose painting drifted from the prompt's order (an extra or a missing tile); the slot
    // `index` stays the prompt position. Unset, they are the same cell.
    const at = cell.painted ?? cell.index;
    const cellPng = await sharp(src).extract(rects[at]).png().toBuffer();
    const stem = cell.file.replace(/\.[a-z]+$/, '');
    let master;
    let dest;
    const rec = subjects.get(cell.file);
    if (s.family === 'misc' || s.family === 'wide') {
      const W = rec?.w ?? 128;
      const H = rec?.h ?? 128;
      let img;
      if (rec?.alpha) {
        const { data: rgb } = await sharp(cellPng)
          .resize(512, 512)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const rgba = keepCenterComponent(keyAlpha(rgb, 512), 512);
        img = sharp(rgba, { raw: { width: 512, height: 512, channels: 4 } }).resize(W, H, {
          fit: s.family === 'wide' ? 'fill' : 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        });
      } else {
        img = sharp(cellPng)
          .resize(W, H, { fit: 'cover' })
          .flatten({ background: '#26282b' })
          .removeAlpha();
      }
      master = await img.png().toBuffer();
      let out;
      if (rec?.format === 'png') out = await sharp(master).png({ compressionLevel: 9 }).toBuffer();
      else {
        const cap = Math.max(15 * 1024, Math.round((W * H) / 3));
        let q = 82;
        out = await sharp(master).webp({ quality: q, smartSubsample: true, effort: 6 }).toBuffer();
        while (out.length > cap && q > 55) {
          q -= 7;
          out = await sharp(master)
            .webp({ quality: q, smartSubsample: true, effort: 6 })
            .toBuffer();
        }
      }
      dest = join(root, cell.file);
      writeFileSync(dest, out);
    } else if (s.family === 'deeds') {
      master = await deedMaster(cellPng, rec?.metal);
      dest = join(deedSrc, `${cell.id}.png`);
      writeFileSync(dest, master);
    } else {
      master = await sharp(cellPng)
        .resize(512, 512, { kernel: 'lanczos3' })
        .flatten({ background: '#26282b' })
        .removeAlpha()
        .toColorspace('srgb')
        .png()
        .toBuffer();
      if (s.family === 'auras') {
        let q = 82;
        let webp = await sharp(master)
          .resize(128, 128)
          .webp({ quality: q, smartSubsample: true, effort: 6 })
          .toBuffer();
        while (webp.length > 15 * 1024 && q > 60) {
          q -= 7;
          webp = await sharp(master)
            .resize(128, 128)
            .webp({ quality: q, smartSubsample: true, effort: 6 })
            .toBuffer();
        }
        dest = join(root, cell.file);
        writeFileSync(dest, webp);
      } else {
        dest = join(root, `${stem}.png`);
        writeFileSync(dest, master);
      }
    }
    review.push(master);
    prov[cell.file] = {
      sheet: s.id,
      cell: at,
      grid: s.grid,
      taskId: ledger.get(s.id)?.taskId ?? null,
      model: 'Tripo text-to-image, seedream_v4',
      subject: cell.subject ?? subjects.get(cell.file)?.subject ?? null,
      masterSha256: sha(master),
    };
    count++;
  }
  // A sheet whose every cell moved to a fix sheet has nothing left to review.
  if (s.family === 'wide' || review.length === 0) continue;
  const g = Math.ceil(Math.sqrt(review.length));
  const tiles = await Promise.all(
    review.map((m) =>
      sharp(m).resize(200, 200).flatten({ background: '#808080' }).png().toBuffer(),
    ),
  );
  await sharp({ create: { width: g * 204, height: g * 204, channels: 3, background: '#ffffff' } })
    .composite(
      tiles.map((t, i) => ({
        input: t,
        left: (i % g) * 204 + 2,
        top: Math.floor(i / g) * 204 + 2,
      })),
    )
    .jpeg({ quality: 80 })
    .toFile(join(reviewDir, `${s.id}.jpg`));
}
const sorted = Object.fromEntries(Object.entries(prov).sort(([a], [b]) => (a < b ? -1 : 1)));
writeFileSync(provPath, `${JSON.stringify(sorted, null, 1)}\n`);
console.log('[w2d] sliced', count);
