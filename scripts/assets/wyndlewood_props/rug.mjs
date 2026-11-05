// Procedural rugs for the Wyndlewood kit: a generated top-down texture (Tripo
// text-to-image, 5 credits) on an oval disc or a rounded rectangle with a soft
// rolled rim, then normalizeProp for the shipped encoding (meshopt, WebP <=
// 512). Tripo's model lane cannot build a flat rug (it keeps only the rim), so
// rugs take this path (kit.json `procedural`).
// usage: node scripts/assets/wyndlewood_props/rug.mjs <kitId> [--reuse]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Document } from '@gltf-transform/core';
import sharp from 'sharp';
import * as tripo from '../../asset_pipeline/lib/tripo.mjs';
import { normalizeProp, saveGlb } from '../../asset_pipeline/lib/glb.mjs';

const id = process.argv[2];
const reuse = process.argv.includes('--reuse');
const a = JSON.parse(readFileSync('assets_src/wyndlewood_props/kit.json', 'utf8')).assets.find((x) => x.id === id);
if (!a?.procedural) throw new Error(`${id} is not a procedural kit entry`);
const LEDGER = 'tmp/props_kit/ledger.json';
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
const entry = (ledger[id] ??= { concepts: [] });
entry.textures ??= [];
let texFile = entry.textures.at(-1)?.file;
if (!reuse || !texFile || !existsSync(texFile)) {
  mkdirSync('tmp/props_kit/concepts', { recursive: true });
  const { url, taskId } = await tripo.textToImage({ prompt: a.texturePrompt });
  texFile = `tmp/props_kit/concepts/${id}_tex${entry.textures.length}.png`;
  await tripo.download(url, texFile);
  const detail = await tripo.getTask(taskId).catch(() => null);
  entry.textures.push({ taskId, file: texFile, prompt: a.texturePrompt, credits: detail?.credits_consumed ?? null });
  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
}
const [L, Wd] = a.size ?? [2.6, 1.8];
const H = a.height;
const oval = a.procedural === 'rug_disc';
const tex = await sharp(texFile).trim({ background: '#ffffff', threshold: 30 }).resize(1024, 1024, { fit: 'fill' }).png().toBuffer();

// Outline: an ellipse, or a rectangle with rounded corners (superellipse).
const SEG = 72;
const RIM = 3;
const outline = (t) => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  if (oval) return [c, s];
  const n = 8;
  return [Math.sign(c) * Math.abs(c) ** (2 / n), Math.sign(s) * Math.abs(s) ** (2 / n)];
};
const pos = [];
const nor = [];
const uv = [];
const ind = [];
const push = (x, y, z, nx, ny, nz, u, v) => {
  pos.push(x, y, z);
  nor.push(nx, ny, nz);
  uv.push(u, v);
  return pos.length / 3 - 1;
};
const centre = push(0, H, 0, 0, 1, 0, 0.5, 0.5);
const rings = [];
for (let r = 0; r <= RIM; r++) {
  const t = r / RIM;
  const k = 0.94 + 0.06 * Math.sin((t * Math.PI) / 2);
  const y = H * Math.cos((t * Math.PI) / 2);
  const ny = Math.cos((t * Math.PI) / 2);
  const nh = Math.sin((t * Math.PI) / 2);
  const row = [];
  for (let s = 0; s < SEG; s++) {
    const [ox, oz] = outline((s / SEG) * Math.PI * 2);
    const ku = Math.min(k, 0.985);
    row.push(push((ox * Wd * k) / 2, y, (oz * L * k) / 2, ox * nh, ny, oz * nh, 0.5 + 0.5 * ox * ku, 0.5 + 0.5 * oz * ku));
  }
  rings.push(row);
}
for (let s = 0; s < SEG; s++) ind.push(centre, rings[0][(s + 1) % SEG], rings[0][s]);
for (let r = 0; r < RIM; r++)
  for (let s = 0; s < SEG; s++) {
    const p0 = rings[r][s];
    const p1 = rings[r][(s + 1) % SEG];
    const p2 = rings[r + 1][s];
    const p3 = rings[r + 1][(s + 1) % SEG];
    ind.push(p0, p1, p2, p1, p3, p2);
  }
const doc = new Document();
const buf = doc.createBuffer();
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const texture = doc.createTexture(`Color_${id}`).setImage(new Uint8Array(tex)).setMimeType('image/png');
const mat = doc.createMaterial(id).setBaseColorTexture(texture).setRoughnessFactor(1).setMetallicFactor(0);
const prim = doc
  .createPrimitive()
  .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
  .setAttribute('NORMAL', acc('VEC3', new Float32Array(nor)))
  .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
  .setIndices(acc('SCALAR', new Uint32Array(ind)))
  .setMaterial(mat);
doc.createScene().addChild(doc.createNode(id).setMesh(doc.createMesh(id).addPrimitive(prim)));
mkdirSync('tmp/props_kit/procedural', { recursive: true });
const raw = `tmp/props_kit/procedural/wyn_${id}_raw.glb`;
await saveGlb(doc, raw);
await normalizeProp(raw, `tmp/props_kit/procedural/wyn_${id}.glb`, { height: H, maxTex: 512 });
console.log('rug', id, { tris: ind.length / 3, tex: texFile });
