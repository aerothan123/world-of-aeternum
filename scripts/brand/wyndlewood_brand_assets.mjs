// Regenerate the shipped brand set (logos, favicons, app icons, splash, home
// background) from the owner's original Wyndlewood art, replacing the World of
// ClaudeCraft marks IN PLACE: every target keeps its file name and its pixel
// size, so no HTML, CSS, manifest, or test reference has to move.
//
// Usage: node scripts/brand/wyndlewood_brand_assets.mjs <crest.png> <banner.png>
//   crest:  the square Wyndlewood crest (logos and icons)
//   banner: the square Vale banner (home background and loading screen)
// Needs the repo's sharp and ffmpeg-static/ffprobe-static dev dependencies.

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [crestPath, bannerPath] = process.argv.slice(2);
if (!crestPath || !bannerPath) {
  console.error('usage: node scripts/brand/wyndlewood_brand_assets.mjs <crest.png> <banner.png>');
  process.exit(1);
}
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const INK = { r: 5, g: 7, b: 10, alpha: 1 };

/** Logos: the crest centered inside the old logo's canvas, transparent around it. */
const LOGOS = [
  'public/worldofclaudecraft-logo.png',
  'public/worldofclaudecraft-logo.webp',
  'public/worldofclaudecraft-logo-540.webp',
  'public/woc-logo-hero.webp',
  'public/woc-logo-guide.webp',
];
/** Square marks: the crest filling the square (transparent where the art is). */
const SQUARES = [
  'public/woc_logo_square.webp',
  'public/favicon-16x16.png',
  'public/favicon-32x32.png',
  'public/icon-192.png',
  'public/icon-512.png',
  'public/cc-studio-icon.png',
  'build/icon.png',
];
/** Opaque square marks (iOS ignores transparency and paints it black). */
const OPAQUE_SQUARES = ['public/apple-touch-icon.png'];
/** Backgrounds: the banner covering the old frame. */
const BACKGROUNDS = ['public/home-bg.png', 'public/home-bg.webp', 'public/loading-screen.jpg'];

function encode(img, file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.webp') return img.webp({ quality: 88, alphaQuality: 90, effort: 6 });
  if (ext === '.jpg' || ext === '.jpeg') return img.jpeg({ quality: 86, mozjpeg: true });
  return img.png({ compressionLevel: 9 });
}

async function sizeOf(file) {
  const meta = await sharp(readFileSync(path.join(root, file))).metadata();
  return { width: meta.width, height: meta.height };
}

async function write(file, pipeline) {
  const out = path.join(root, file);
  const buf = await encode(pipeline, file).toBuffer();
  writeFileSync(out, buf);
  const { width, height } = await sharp(buf).metadata();
  console.log(`${file} ${width}x${height} ${buf.length}B`);
}

async function logo(file) {
  const { width, height } = await sizeOf(file);
  await write(file, sharp(crestPath).resize(width, height, { fit: 'contain', background: CLEAR }));
}

async function square(file, background = CLEAR) {
  const { width, height } = await sizeOf(file);
  let img = sharp(crestPath).resize(width, height, { fit: 'contain', background });
  if (background.alpha === 1) img = img.flatten({ background });
  await write(file, img);
}

async function backdrop(file) {
  const { width, height } = await sizeOf(file);
  await write(file, sharp(bannerPath).resize(width, height, { fit: 'cover', position: 'centre' }));
}

/** A Windows .ico holding PNG-compressed entries (valid since Windows Vista). */
async function ico(file, sizes) {
  const images = [];
  for (const size of sizes) {
    images.push({
      size,
      data: await sharp(crestPath)
        .resize(size, size, { fit: 'contain', background: CLEAR })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  const buf = Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
  writeFileSync(path.join(root, file), buf);
  console.log(`${file} ico[${sizes.join(',')}] ${buf.length}B`);
}

/** The looping home background video: the banner as a still, same frame and length. */
function video(file) {
  const out = path.join(root, file);
  const probe = JSON.parse(
    execFileSync(ffprobe.path, [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=width,height:format=duration', '-of', 'json', out,
    ]).toString(),
  );
  const { width, height } = probe.streams[0];
  const duration = Math.max(2, Math.min(20, Number(probe.format?.duration) || 8));
  const tmp = `${out}.tmp.mp4`;
  execFileSync(ffmpegPath, [
    '-y', '-loglevel', 'error', '-loop', '1', '-i', bannerPath, '-t', String(duration),
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=yuv420p`,
    '-r', '24', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart',
    '-an', tmp,
  ]);
  writeFileSync(out, readFileSync(tmp));
  rmSync(tmp);
  console.log(`${file} ${width}x${height} ${duration}s`);
}

for (const f of LOGOS) await logo(f);
for (const f of SQUARES) await square(f);
for (const f of OPAQUE_SQUARES) await square(f, INK);
for (const f of BACKGROUNDS) await backdrop(f);
await ico('public/favicon.ico', [16, 32, 48]);
await ico('build/icon.ico', [16, 24, 32, 48, 64, 128, 256]);
video('public/home-bg.mp4');
