// Small JPG previews of render PNGs, written to a fresh folder so image
// viewers that cache by path never show a stale frame.
//
//   node scripts/world_export/preview.mjs <outDir> <png...>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [outDir, ...files] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
for (const f of files) {
  const out = path.join(outDir, `${path.basename(f, path.extname(f))}.jpg`);
  await sharp(f).resize(1280, 720, { fit: 'inside' }).jpeg({ quality: 84 }).toFile(out);
  console.log(out);
}
