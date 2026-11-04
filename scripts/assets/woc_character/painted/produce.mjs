// The stylized hand-painted pass (2026-11-04) over every WOC player body, class under-armor,
// head core, hairstyle, scalp cap and beard texture, IN PLACE under public/ (git holds the
// originals). Only image bytes change: the geometry, rig, clips, morphs and WOC_lod of every
// GLB stay byte for byte (glbraw.mjs; verify.mjs checks it against a git ref).
//
// Per texture: decode, upscale where its preset says (bodies, under-armor, hair and beards
// 2x), bake the mesh's own light, curvature and strand flow into its UV space (bake.mjs), paint
// in linear luminance only (paint.mjs: hue and saturation never move, and each material
// region keeps its median, which the head tint keys on), then re-encode with the codec its
// kind ships (UASTC for the bases and head cores, ETC1S for the under-armor and the grey hair).
// A head core keeps its own per-cell mip levels: the paint is carried down them as a light
// ratio. A texture this pass already wrote (its KTXwriter) is refused: run it on originals.
//
// Usage: node scripts/assets/woc_character/painted/produce.mjs [name filter]
//   KTX_WEB_DIR: the KTX-Software 4.4.2 Web libktx build (ktxlib.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { bakeMaps, primitivesFor } from './bake.mjs';
import { imageBytes, readGlb, writeGlb } from './glbraw.mjs';
import { decodeKtx2, encodeKtx2 } from './ktxlib.mjs';
import { paint } from './paint.mjs';
import { PRESETS } from './presets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PUB = path.join(ROOT, 'public');
const WOC = `${PUB}/models/chars/players/woc`;
const SKINS = `${PUB}/textures/skins/woc`;
const only = process.argv[2] ?? null;

const UASTC = { codec: 'uastc', srgb: true, rdo: 1.0 };
// the bases at a stronger RDO: each fit's login (base + library) stays inside its 1.5 MB
const BODY_UASTC = { codec: 'uastc', srgb: true, rdo: 3.0 };
const GREY = { codec: 'etc1s', srgb: true, qlevel: 255, clevel: 5 };
const CLOTH = { codec: 'etc1s', srgb: true, qlevel: 255, clevel: 5 };

function center(prims) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const p of prims)
    for (let i = 0; i < p.P.length; i += 3)
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], p.P[i + k]);
        mx[k] = Math.max(mx[k], p.P[i + k]);
      }
  return [(mn[0] + mx[0]) / 2, mx[1] - 0.18 * (mx[1] - mn[1]), (mn[2] + mx[2]) / 2];
}

async function mipChain(rgba, w, h) {
  const levels = [{ width: w, height: h, data: rgba }];
  let cur = rgba;
  let cw = w;
  let ch = h;
  while (cw > 1 || ch > 1) {
    const nw = Math.max(1, cw >> 1);
    const nh = Math.max(1, ch >> 1);
    cur = await sharp(cur, { raw: { width: cw, height: ch, channels: 4 } })
      .resize(nw, nh, { kernel: 'cubic', fit: 'fill' })
      .raw()
      .toBuffer();
    levels.push({ width: nw, height: nh, data: cur });
    cw = nw;
    ch = nh;
  }
  return levels;
}

/** Paint one texture: decoded KTX2 bytes in, new KTX2 bytes out. */
async function paintTexture(bytes, kind, prims, enc, seed, keepLevels) {
  const p = PRESETS[kind];
  const d = await decodeKtx2(bytes);
  if (d.writer.includes('painted characters'))
    throw new Error('already painted: run on the originals');
  const w = d.width * p.scale;
  const h = d.height * p.scale;
  const l0 = d.levels[0];
  const up =
    p.scale === 1
      ? l0.data
      : await sharp(l0.data, { raw: { width: d.width, height: d.height, channels: 4 } })
          .resize(w, h, { kernel: 'lanczos3' })
          .raw()
          .toBuffer();
  const maps = bakeMaps(prims, w, h, {
    heightGain: p.heightGain,
    flowCenter: p.meshFlow ? center(prims) : null,
  });
  const out = paint(up, w, h, { ...p, maps, seed });
  let levels;
  if (keepLevels) {
    // the atlas brings its own per-cell levels: carry the paint down them as a light ratio,
    // box-reduced level by level, so no cell bleeds into another and each level keeps its own
    let ratio = new Float32Array(w * h);
    const lum = (b, i) => 0.2126 * b[4 * i] + 0.7152 * b[4 * i + 1] + 0.0722 * b[4 * i + 2];
    for (let i = 0; i < w * h; i++) {
      const a = lum(up, i);
      ratio[i] = a > 2 ? lum(out, i) / a : 1;
    }
    levels = [{ width: w, height: h, data: out }];
    let rw = w;
    let rh = h;
    for (let k = 1; k < d.levels.length; k++) {
      const lv = d.levels[k];
      const nr = new Float32Array(lv.width * lv.height);
      for (let y = 0; y < lv.height; y++)
        for (let x = 0; x < lv.width; x++) {
          let s = 0;
          let c = 0;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) {
              const sx = Math.min(rw - 1, 2 * x + dx);
              const sy = Math.min(rh - 1, 2 * y + dy);
              s += ratio[sy * rw + sx];
              c++;
            }
          nr[y * lv.width + x] = s / c;
        }
      ratio = nr;
      rw = lv.width;
      rh = lv.height;
      const data = Buffer.from(lv.data);
      for (let i = 0; i < rw * rh; i++)
        for (let ch = 0; ch < 3; ch++)
          data[4 * i + ch] = Math.max(0, Math.min(255, Math.round(lv.data[4 * i + ch] * ratio[i])));
      levels.push({ width: rw, height: rh, data });
    }
  } else levels = await mipChain(out, w, h);
  const ktx = await encodeKtx2(levels, enc);
  return { ktx, from: `${d.width}x${d.height}`, to: `${w}x${h}`, levels: levels.length };
}

const report = [];
async function doGlb(file, kindOf, enc, keepLevels = false) {
  if (only && !file.includes(only)) return;
  const t0 = Date.now();
  const full = path.join(WOC, file);
  const glb = readGlb(full);
  const replace = new Map();
  const rows = [];
  for (let i = 0; i < glb.json.images.length; i++) {
    const name = glb.json.images[i].name;
    const kind = kindOf(name);
    const prims = await primitivesFor(full, name);
    if (!prims.length) throw new Error(`${file}: no primitive draws ${name}`);
    const r = await paintTexture(imageBytes(glb, i), kind, prims, enc(kind), 11 + i, keepLevels);
    replace.set(i, r.ktx);
    rows.push(
      `${name} ${kind} ${r.from}->${r.to} L${r.levels} ${imageBytes(glb, i).length}->${r.ktx.length}`,
    );
  }
  const before = fs.statSync(full).size;
  writeGlb(glb, replace, full);
  const line = `${file} ${before}->${fs.statSync(full).size} ${Date.now() - t0}ms | ${rows.join(' | ')}`;
  console.log(line);
  report.push(line);
}

// bodies and their fit's under-armor atlases (same UVs)
for (const fit of ['male', 'female']) {
  await doGlb(
    `base_${fit}.glb`,
    () => 'body',
    () => BODY_UASTC,
  );
  const prims = await primitivesFor(path.join(WOC, `base_${fit}.glb`), null);
  for (const f of fs.readdirSync(SKINS).filter((f) => f.endsWith('_underarmor.ktx2'))) {
    if ((f.startsWith('female_') ? 'female' : 'male') !== fit) continue;
    if (only && !f.includes(only)) continue;
    const t0 = Date.now();
    const full = path.join(SKINS, f);
    const bytes = fs.readFileSync(full);
    const r = await paintTexture(bytes, 'underArmor', prims, CLOTH, 23, false);
    fs.writeFileSync(full, r.ktx);
    const line = `${f} ${r.from}->${r.to} L${r.levels} ${bytes.length}->${r.ktx.length} ${Date.now() - t0}ms`;
    console.log(line);
    report.push(line);
  }
}
for (const t of ['a', 'b'])
  await doGlb(
    `head_type_${t}_core.glb`,
    () => 'headCore',
    () => UASTC,
    true,
  );
for (const f of fs
  .readdirSync(WOC)
  .filter((f) => /^head_type_[ab]_(hair_|beard)/.test(f) && f.endsWith('.glb'))) {
  const beard = /beard/.test(f);
  await doGlb(
    f,
    (name) => (beard ? 'beard' : /scalp/i.test(name) ? 'scalp' : 'hair'),
    () => GREY,
  );
}
fs.mkdirSync(path.join(ROOT, 'tmp', 'painted'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'tmp', 'painted', `produce-report${only ? `-${only}` : ''}.txt`),
  `${report.join('\n')}\n`,
);
console.log('DONE');
