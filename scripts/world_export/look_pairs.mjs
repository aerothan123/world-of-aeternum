// Labelled side-by-side pairs (Three.js left, Unreal right) of the look
// shots, from the files threejs_shots.mjs and the Unreal run_slice.py write.
//
//   node scripts/world_export/look_pairs.mjs [dir] [pairsSubdir]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.resolve(process.argv[2] ?? 'E:/WyndlewoodUnreal/out');
const pairsDir = path.join(dir, process.argv[3] ?? 'pairs');
const W = 1280;
const H = 720;
const BAR = 48;
const label = (text) =>
  Buffer.from(
    `<svg width="${W}" height="${BAR}"><rect width="100%" height="100%" fill="#1d1a16"/>` +
      `<text x="16" y="32" font-family="Segoe UI, Arial" font-size="24" fill="#f1e6cf">${text}</text></svg>`,
  );
const shots = JSON.parse(fs.readFileSync(path.join(dir, 'shots.json'), 'utf8')).shots;
const three = JSON.parse(fs.readFileSync(path.join(dir, 'threejs_shots.json'), 'utf8'));
fs.mkdirSync(pairsDir, { recursive: true });
for (const u of shots) {
  const t = three.find((s) => s.name === u.name);
  const side = async (file, text) =>
    file && fs.existsSync(file)
      ? sharp(file).resize(W, H, { fit: 'cover' }).toBuffer()
      : sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
          .png()
          .toBuffer();
  const left = await side(t?.file, 'three');
  const right = await side(u.file, 'unreal');
  const lt = t
    ? `Three.js (Refined, high) ${u.time}, ${t.meanFrameMs.toFixed(1)} ms`
    : 'Three.js: missing';
  const rt = `Unreal 5.8 (Lumen, VSM) ${u.time}, ${u.meanFrameMs.toFixed(1)} ms`;
  const out = path.join(pairsDir, `pair_${u.name}.jpg`);
  await sharp({ create: { width: W * 2, height: H + BAR, channels: 3, background: '#000' } })
    .composite([
      { input: label(lt), left: 0, top: 0 },
      { input: label(rt), left: W, top: 0 },
      { input: left, left: 0, top: BAR },
      { input: right, left: W, top: BAR },
    ])
    .jpeg({ quality: 86 })
    .toFile(out);
  console.log(out);
}
