// Build the painted storybook ground sets the World Style Refined terrain
// draws (src/render/world_style_ground_core.ts names which splat layer each
// one feeds). Thin orchestrator: sharp decodes and encodes, every pixel
// decision is in lib/painted_ground_core.mjs (pinned by
// tests/painted_ground_core.test.ts).
//
// Per item of the spec: verify the source sha256, resample to `size`
// (Lanczos), flatten the low-frequency shading a generated image bakes in
// (vignettes, a lit or shaded corner), make it tileable (offset-and-blend),
// then derive NormalGL, Roughness and AmbientOcclusion from the tiled colour.
// Output follows the AmbientCG convention every terrain set uses:
// public/textures/terrain/<Key>_{Color,NormalGL,Roughness,AmbientOcclusion}.jpg
// (1024 JPEG, colour sRGB, single-channel greyscale for roughness and AO).
//
// Usage: node scripts/assets/build_painted_ground.mjs [--src <dir>] [--pin]
//   --src <dir>  source directory (default: the spec's srcDir)
//   --pin        write each source's sha256 into the spec instead of checking it
// Then: node scripts/build_media_manifest.mjs generate
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { fromBytes, paintedGroundMaps, seamRatio, toBytes } from './lib/painted_ground_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC = path.join(ROOT, 'scripts/assets/specs/painted_ground.json');

const args = process.argv.slice(2);
const pin = args.includes('--pin');
const srcArg = args.indexOf('--src');
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const srcDir = path.resolve(ROOT, srcArg >= 0 ? args[srcArg + 1] : spec.srcDir);
const outDir = path.join(ROOT, spec.outDir);
const size = spec.size;

const jpeg = { quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' };

for (const item of spec.items) {
  const file = path.join(srcDir, item.src);
  const bytes = fs.readFileSync(file);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (pin) item.sha256 = sha;
  else if (item.sha256 && item.sha256 !== sha) {
    throw new Error(`${item.src}: sha256 ${sha} does not match the spec pin ${item.sha256}`);
  }
  const raw = await sharp(bytes)
    .removeAlpha()
    .toColourspace('srgb')
    .resize(size, size, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer();
  const rgb = fromBytes(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
  const maps = paintedGroundMaps(rgb, size, size, item.opts ?? {});
  const stem = path.join(outDir, item.key);
  const rgbOut = (data) =>
    sharp(Buffer.from(data), { raw: { width: size, height: size, channels: 3 } });
  const greyOut = (data) =>
    sharp(Buffer.from(data), { raw: { width: size, height: size, channels: 1 } });
  await rgbOut(toBytes(maps.color)).jpeg(jpeg).toFile(`${stem}_Color.jpg`);
  await rgbOut(maps.normal).jpeg(jpeg).toFile(`${stem}_NormalGL.jpg`);
  await greyOut(maps.roughness).jpeg(jpeg).toFile(`${stem}_Roughness.jpg`);
  await greyOut(maps.ao).jpeg(jpeg).toFile(`${stem}_AmbientOcclusion.jpg`);
  console.log(
    `${item.key}: seam ${seamRatio(rgb, size, size).toFixed(2)} -> ${seamRatio(maps.color, size, size).toFixed(2)}`,
  );
}
if (pin) fs.writeFileSync(SPEC, `${JSON.stringify(spec, null, 2)}\n`);
