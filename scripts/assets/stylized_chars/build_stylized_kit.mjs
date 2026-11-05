// Build the stylized modular character kit for one body fit, on the EXACT shipped WOC rig:
//
//   public/models/chars/players/woc_stylized/base_<fit>.glb
//       the WOC rig (its own joints and inverse bind matrices, untouched) and every part a
//       stylized body draws without armor: the bare body cut into the armor slots'
//       regions (Stylized_Body_<Slot>, hidden by a worn piece), the faces
//       (Stylized_Face_<X>) and the hairstyles (Stylized_Hair_<X>): manifest appearance parts
//   public/models/chars/players/woc_stylized/armor/<fit>_<set>_{low,medium,top}.glb
//       one armor set per file in the WOC split contract (woc_armor_core.ts): low with its
//       own small colour map, medium with every map at half size, top the top mip levels
//
// Every Tripo auto-rigged model is conformed onto the WOC rest skeleton (conform_core.mjs:
// directions turned, lengths stretched along each bone, girth kept) and cut by the skin
// (segment_core.mjs), and the result is written in the base's own bind space under the
// base's own inverse bind matrices, so a set binds to a body exactly as a shipped WOC set
// does (woc_armor_bind.ts, rig_merge.ts). Plate keeps a controlled metal/roughness map
// (Tripo's ORM remapped: metal capped, roughness floored) so steel reads as painted steel.
//
// Usage: node scripts/assets/stylized_chars/build_stylized_kit.mjs --fit male|female
//          --kit <kit.json> [--out public/models/chars/players/woc_stylized] [--no-lod]
//          [--only <set,set>]
// kit.json names the inputs per fit (Tripo rigged GLBs, raw hair/helm GLBs); see the
// header of stylized_kit.json in the work folder this was first run from.
// Needs KTX_WEB_DIR (the libktx Web build, ../woc_character/painted/ktxlib.mjs).
// biome-ignore assist/source/organizeImports: sharp must initialize before @gltf-transform/functions on Windows.
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { addLodIndices } from '../woc_character/lod_indices.mjs';
import { keepLodIndices, WocLodExtension } from '../woc_character/woc_lod_extension.mjs';
import { splitKtx2TopLevel } from '../woc_character/ktx2_levels.mjs';
import { encodeKtx2 } from '../woc_character/painted/ktxlib.mjs';
import { invert4, transformPoint4 } from '../stylized_char_test/mat4_core.mjs';
import { remapInfluences, wocJointForTripo } from '../stylized_char_test/fit_woc_rig_core.mjs';
import { conformFrames, conformVertex } from './conform_core.mjs';
import { REGIONS, splitByRegion, vertexRegion } from './segment_core.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const REPO = resolve(import.meta.dirname, '../../..');
const FIT = opt('fit');
if (FIT !== 'male' && FIT !== 'female') throw new Error('--fit male|female');
const KIT = JSON.parse(readFileSync(resolve(opt('kit')), 'utf8'))[FIT];
const OUT = resolve(REPO, opt('out', 'public/models/chars/players/woc_stylized'));
const LOD = !args.includes('--no-lod');
// --only <set,set>: build just these sets (the base is measured, not rewritten)
const ONLY = opt('only') ? new Set(opt('only').split(',')) : null;
mkdirSync(resolve(OUT, 'armor'), { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([...ALL_EXTENSIONS, WocLodExtension])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const BASE_URL = resolve(REPO, `public/models/chars/players/woc/base_${FIT}.glb`);

// --- the WOC reference rig -----------------------------------------------------------
const ref = await io.read(BASE_URL);
const refSkin = ref.getRoot().listSkins()[0];
const wJoints = refSkin.listJoints();
const wNames = wJoints.map((j) => j.getName());
const wIndex = new Map(wNames.map((n, i) => [n, i]));
const wPos = new Map(wJoints.map((j) => [j.getName(), j.getWorldMatrix().slice(12, 15)]));
// rest world = D * bind space (the quantization the base folded into its IBMs)
const refIbm = refSkin.getInverseBindMatrices().getArray();
const hipsAt = wIndex.get('hips');
const D = mul4(
  wJoints[hipsAt].getWorldMatrix(),
  Array.from(refIbm.slice(hipsAt * 16, hipsAt * 16 + 16)),
);
const Dinv = invert4(D);
const Dn = normalMatrix(Dinv);
const toBind = (v) => transformPoint4(Dinv, v);
const toBindN = (n) => normalize3(mulVec3(Dn, n));

function mul4(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
/** Inverse-transpose of a 4x4's upper 3x3 (column-major 3x3 out). */
function normalMatrix(m) {
  const inv = invert4(m);
  return [inv[0], inv[4], inv[8], inv[1], inv[5], inv[9], inv[2], inv[6], inv[10]];
}
function mulVec3(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}
function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const face = ([x, y, z]) => [-z, y, x]; // Tripo faces +X, left at -Z; the WOC rig faces +Z

// --- conform one Tripo rigged model onto the WOC rest skeleton --------------------------
const conformedCache = new Map();
async function conformed(path) {
  if (conformedCache.has(path)) return conformedCache.get(path);
  const doc = await io.read(path);
  const skin = doc.getRoot().listSkins()[0];
  const tJoints = skin.listJoints();
  const tIbm = skin.getInverseBindMatrices().getArray();
  const tBind = tJoints.map((_, i) => {
    const m = invert4(Array.from(tIbm.slice(i * 16, i * 16 + 16)));
    return face([m[12], m[13], m[14]]);
  });
  const tSet = new Set(tJoints);
  const order = [];
  const visit = (n) => {
    order.push(tJoints.indexOf(n));
    for (const c of n.listChildren()) if (tSet.has(c)) visit(c);
  };
  for (const j of tJoints) if (!tSet.has(j.getParentNode())) visit(j);
  const at = new Map(order.map((s, k) => [s, k]));
  const joints = order.map((s) => {
    const p = tJoints[s].getParentNode();
    return {
      name: tJoints[s].getName(),
      parent: tSet.has(p) ? at.get(tJoints.indexOf(p)) : -1,
      pos: tBind[s],
    };
  });
  const { frames, fitScale } = conformFrames(joints, wPos);
  const tToW = tJoints.map((j) => wIndex.get(wocJointForTripo(j.getName()) ?? 'hips') ?? hipsAt);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const P = prim.getAttribute('POSITION');
  const N = prim.getAttribute('NORMAL');
  const UV = prim.getAttribute('TEXCOORD_0');
  const J = prim.getAttribute('JOINTS_0');
  const W = prim.getAttribute('WEIGHTS_0');
  const n = P.getCount();
  const pos = new Array(n);
  const nrm = new Array(n);
  const uv = new Array(n);
  const jt = new Array(n);
  const wt = new Array(n);
  const region = new Array(n);
  const knee = { l: wPos.get('lowerleg.l'), r: wPos.get('lowerleg.r') };
  const ankle = { l: wPos.get('foot.l'), r: wPos.get('foot.r') };
  let minY = Infinity;
  for (let v = 0; v < n; v++) {
    const j4 = J.getElement(v, []);
    const w4 = W.getElement(v, []);
    const r = conformVertex(
      face(P.getElement(v, [])),
      N ? face(N.getElement(v, [])) : null,
      j4.map((s) => at.get(s)),
      w4,
      frames,
    );
    pos[v] = r.v;
    nrm[v] = r.n ?? [0, 1, 0];
    uv[v] = UV ? UV.getElement(v, []) : [0, 0];
    const m = remapInfluences(j4, w4, tToW, hipsAt);
    jt[v] = m.idx;
    wt[v] = m.wts;
    region[v] = vertexRegion(wNames, m.idx, m.wts, r.v, knee, ankle);
    if (r.v[1] < minY) minY = r.v[1];
  }
  const mat = prim.getMaterial();
  const img = (t) => (t ? Buffer.from(t.getImage()) : null);
  const out = {
    path,
    pos,
    nrm,
    uv,
    jt,
    wt,
    region,
    indices: Array.from(prim.getIndices().getArray()),
    color: img(mat?.getBaseColorTexture()),
    normal: img(mat?.getNormalTexture()),
    orm: img(mat?.getMetallicRoughnessTexture()),
    fitScale,
    minY,
  };
  log(
    'conformed',
    path.split(/[\\/]/).slice(-2).join('/'),
    'scale',
    fitScale.toFixed(3),
    'soleY',
    minY.toFixed(4),
    'verts',
    n,
  );
  conformedCache.set(path, out);
  return out;
}

// --- textures ---------------------------------------------------------------------------
/** RGBA mip chain of an image at `size` (optionally edited per pixel first). */
async function mipLevels(buf, size, edit) {
  const { data, info } = await sharp(buf)
    .resize(size, size, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (edit) edit(data);
  const levels = [{ width: info.width, height: info.height, data }];
  for (let w = size >> 1; w >= 1; w >>= 1) {
    const lv = await sharp(data, { raw: { width: size, height: size, channels: 4 } })
      .resize(w, w, { kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    levels.push({ width: w, height: w, data: lv });
  }
  return levels;
}
async function ktx(buf, size, { srgb, codec = 'uastc', edit } = {}) {
  return encodeKtx2(await mipLevels(buf, size, edit), {
    srgb,
    codec,
    rdo: codec === 'uastc' ? 1 : 0,
  });
}
/** Tripo's ORM (R occlusion, G roughness, B metal) as a painted-steel data map: metal capped,
 *  roughness floored, so plate catches a soft highlight instead of mirroring the sky. */
const METAL_MAX = Number(opt('metal-max', 0.6));
const ROUGH_MIN = Number(opt('rough-min', 0.42));
function paintedSteel(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i + 1] / 255;
    data[i + 1] = Math.round(255 * (ROUGH_MIN + (1 - ROUGH_MIN) * r));
    data[i + 2] = Math.round(data[i + 2] * METAL_MAX);
  }
}

function newTexture(doc, name, bytes) {
  return doc.createTexture(name).setImage(new Uint8Array(bytes)).setMimeType('image/ktx2');
}
function matte(doc, name, color, normal) {
  const m = doc.createMaterial(name).setMetallicFactor(0).setRoughnessFactor(0.85);
  if (color) m.setBaseColorTexture(color);
  if (normal) m.setNormalTexture(normal);
  return m;
}

// --- scaffolding: a copy of the WOC base with its body taken out ------------------------
async function scaffold() {
  const doc = await io.read(BASE_URL);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const body = root.listNodes().find((nd) => nd.getMesh() && nd.getSkin() === skin);
  const rig = body.getParentNode();
  body.getMesh().dispose();
  body.dispose();
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) m.dispose();
  return { doc, root, skin, rig, buffer: root.listBuffers()[0] };
}

/** One skinned part node from a model's vertex subset, in the base's bind space. */
function addPart(s, name, src, piece, material) {
  const { doc, skin, rig, buffer } = s;
  const n = piece.vertices.length;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const jo = new Uint16Array(n * 4);
  const we = new Float32Array(n * 4);
  piece.vertices.forEach((v, i) => {
    pos.set(toBind(src.pos[v]), i * 3);
    nrm.set(toBindN(src.nrm[v]), i * 3);
    uv.set(src.uv[v], i * 2);
    jo.set(src.jt[v], i * 4);
    we.set(src.wt[v], i * 4);
  });
  const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setMaterial(material)
    .setAttribute('POSITION', acc(pos, 'VEC3'))
    .setAttribute('NORMAL', acc(nrm, 'VEC3'))
    .setAttribute('TEXCOORD_0', acc(uv, 'VEC2'))
    .setAttribute('JOINTS_0', acc(jo, 'VEC4'))
    .setAttribute('WEIGHTS_0', acc(we, 'VEC4'))
    .setIndices(acc(new Uint32Array(piece.indices), 'SCALAR'));
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)).setSkin(skin);
  rig.addChild(node);
  return piece.indices.length / 3;
}
const allOf = (src) => ({ vertices: src.pos.map((_, i) => i), indices: src.indices });

// --- rigid head pieces (hair, helm): Tripo text-to-model meshes fitted to the cranium ----
let cranium = null;
function measureCranium(base) {
  const headY = wPos.get('head')[1];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  base.pos.forEach((p, v) => {
    if (base.region[v] !== 'head' || p[1] < headY) return;
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  });
  cranium = {
    lo,
    hi,
    w: hi[0] - lo[0],
    d: hi[2] - lo[2],
    cx: (lo[0] + hi[0]) / 2,
    cz: (lo[2] + hi[2]) / 2,
  };
  log(
    'cranium',
    JSON.stringify(cranium, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)),
  );
}
async function rigid(path, { widthScale, topLift, back, dropShell }) {
  const doc = await io.read(path);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const mat = prim.getMaterial();
  const color = Buffer.from(mat.getBaseColorTexture().getImage());
  const P = prim.getAttribute('POSITION');
  const UV = prim.getAttribute('TEXCOORD_0');
  const N = prim.getAttribute('NORMAL');
  const idx = Array.from(prim.getIndices().getArray());
  let keep = idx;
  if (dropShell) {
    // Tripo fills a hairpiece's face opening with a white mannequin shell: drop every
    // triangle whose colour at its UV centroid is near-white and unsaturated.
    const { data, info } = await sharp(color)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (u, v) => {
      const x = Math.min(info.width - 1, Math.max(0, Math.round(u * (info.width - 1))));
      const y = Math.min(info.height - 1, Math.max(0, Math.round(v * (info.height - 1))));
      const o = (y * info.width + x) * 4;
      return [data[o], data[o + 1], data[o + 2]];
    };
    keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      let u = 0;
      let v = 0;
      for (let k = 0; k < 3; k++) {
        const e = UV.getElement(idx[t + k], []);
        u += e[0] / 3;
        v += e[1] / 3;
      }
      const [r, g, b] = at(u, v);
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const shell = mx > 170 && (mx - mn) / Math.max(1, mx) < 0.14;
      if (!shell) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    log('hair shell dropped', (idx.length - keep.length) / 3, 'of', idx.length / 3, 'tris');
  }
  const used = [...new Set(keep)];
  const pts = used.map((v) => face(P.getElement(v, [])));
  let top = -Infinity;
  let bottom = Infinity;
  for (const p of pts) {
    top = Math.max(top, p[1]);
    bottom = Math.min(bottom, p[1]);
  }
  // fit on the crown: the top 40% of the piece, where it hugs the skull
  const cut = top - 0.4 * (top - bottom);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    if (p[1] < cut) continue;
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  }
  const s = (cranium.w * widthScale) / (hi[0] - lo[0]);
  const ox = cranium.cx - ((lo[0] + hi[0]) / 2) * s;
  const oz = cranium.cz - back * cranium.d - ((lo[2] + hi[2]) / 2) * s;
  const oy = cranium.hi[1] + topLift * cranium.w - top * s;
  const head = wIndex.get('head');
  const src = { pos: [], nrm: [], uv: [], jt: [], wt: [], indices: [] };
  const remap = new Map();
  used.forEach((v, i) => {
    remap.set(v, i);
    const p = face(P.getElement(v, []));
    src.pos.push([p[0] * s + ox, p[1] * s + oy, p[2] * s + oz]);
    src.nrm.push(N ? face(N.getElement(v, [])) : [0, 1, 0]);
    src.uv.push(UV.getElement(v, []));
    src.jt.push([head, 0, 0, 0]);
    src.wt.push([1, 0, 0, 0]);
  });
  src.indices = keep.map((v) => remap.get(v));
  src.color = color;
  const nt = mat.getNormalTexture();
  src.normal = nt ? Buffer.from(nt.getImage()) : null;
  const orm = mat.getMetallicRoughnessTexture();
  src.orm = orm ? Buffer.from(orm.getImage()) : null;
  return src;
}

// --- names (src/render/characters/stylized_kit_core.ts mirrors these) --------------------------------------
const P = FIT === 'female' ? 'Female_' : '';
const SLOT_LABEL = {
  chest: 'Chest',
  arms: 'Shoulders',
  hands: 'Gloves',
  waist: 'Waist',
  legs: 'Legs',
  feet: 'Boots',
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const bodyNode = (region) => `Stylized_${P}Body_${SLOT_LABEL[region]}`;
const faceNode = (id) => `Stylized_${P}Face_${id}`;
// Lettered, never numbered: a trailing `_<digits>` is a split primitive's suffix to the WOC
// part resolver (woc_parts_core.ts wocNodeNameOf), so `Hair_1` and `Hair_2` would be one part.
const hairNode = (i) => `Stylized_${P}Hair_${'ABC'[i - 1]}`;
const armorNode = (set, region) =>
  `Armor_${P}Stylized_${cap(set)}_${region === 'head' ? 'Helm' : SLOT_LABEL[region]}`;

/** Character height in the base's bind-space units (the LOD bound is a share of it). */
let bindHeight = 0;
async function finalize(doc, file) {
  if (LOD) {
    await addLodIndices(doc, { height: bindHeight });
    await doc.transform(
      prune(),
      keepLodIndices([meshopt({ encoder: MeshoptEncoder, level: 'high' })], {
        encoder: MeshoptEncoder,
      }),
    );
  } else {
    await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  }
  if (
    !doc
      .getRoot()
      .listExtensionsUsed()
      .some((e) => e.extensionName === 'KHR_texture_basisu')
  ) {
    doc.createExtension(KHRTextureBasisu).setRequired(true);
  }
  await io.write(file, doc);
  log('wrote', file.split(/[\\/]/).slice(-2).join('/'));
}
const report = { fit: FIT, parts: {}, files: {} };

// --- the base: bare body regions, faces, hairs -------------------------------------------
const base = await conformed(KIT.base);
measureCranium(base);
{
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of base.pos) {
    const b = toBind(p);
    lo = Math.min(lo, b[1]);
    hi = Math.max(hi, b[1]);
  }
  bindHeight = hi - lo;
}
if (!ONLY) {
  const s = await scaffold();
  const body = matte(
    s.doc,
    `stylized ${FIT} body`,
    newTexture(s.doc, `stylized_${FIT}_body_color`, await ktx(base.color, 1024, { srgb: true })),
    newTexture(s.doc, `stylized_${FIT}_body_normal`, await ktx(base.normal, 512, { srgb: false })),
  );
  const pieces = splitByRegion(base.indices, base.region);
  for (const region of REGIONS) {
    const piece = pieces.get(region);
    if (!piece) continue;
    const name = region === 'head' ? faceNode('A') : bodyNode(region);
    report.parts[name] = addPart(s, name, base, piece, body);
  }
  for (const [id, path] of Object.entries(KIT.faces)) {
    const src = await conformed(path);
    const head = splitByRegion(src.indices, src.region, (r) => r === 'head').get('head');
    const m = matte(
      s.doc,
      `stylized ${FIT} face ${id}`,
      newTexture(
        s.doc,
        `stylized_${FIT}_face_${id}_color`,
        await ktx(src.color, 512, { srgb: true }),
      ),
      newTexture(
        s.doc,
        `stylized_${FIT}_face_${id}_normal`,
        await ktx(src.normal, 256, { srgb: false }),
      ),
    );
    report.parts[faceNode(id)] = addPart(s, faceNode(id), src, head, m);
  }
  for (const [i, path] of KIT.hairs.entries()) {
    const src = await rigid(path, { widthScale: 1.12, topLift: 0.04, back: 0.06, dropShell: true });
    const m = matte(
      s.doc,
      `stylized ${FIT} hair ${i + 1}`,
      newTexture(
        s.doc,
        `stylized_${FIT}_hair_${i + 1}_color`,
        await ktx(src.color, 512, { srgb: true }),
      ),
      src.normal
        ? newTexture(
            s.doc,
            `stylized_${FIT}_hair_${i + 1}_normal`,
            await ktx(src.normal, 256, { srgb: false }),
          )
        : null,
    ).setRoughnessFactor(0.7);
    report.parts[hairNode(i + 1)] = addPart(s, hairNode(i + 1), src, allOf(src), m);
  }
  await finalize(s.doc, resolve(OUT, `base_${FIT}.glb`));
}

// --- the armor sets: medium + top from one encode, low on its own ------------------------
for (const [set, path] of Object.entries(KIT.sets)) {
  if (ONLY && !ONLY.has(set)) continue;
  const setId = `stylized_${set}`;
  const src = await conformed(path);
  const pieces = splitByRegion(src.indices, src.region, (r) => r !== 'head');
  const helm =
    KIT.helm?.set === set
      ? await rigid(KIT.helm.path, { widthScale: 1.24, topLift: 0.07, back: 0, dropShell: false })
      : null;
  const maps = {
    color: splitKtx2TopLevel(await ktx(src.color, 2048, { srgb: true })),
    normal: splitKtx2TopLevel(await ktx(src.normal, 1024, { srgb: false })),
    data: splitKtx2TopLevel(await ktx(src.orm, 1024, { srgb: false, edit: paintedSteel })),
  };
  const texName = (k) => `${FIT}_${setId}_${k}`;
  // medium
  {
    const s = await scaffold();
    const data = newTexture(s.doc, texName('data'), maps.data.half);
    const m = s.doc
      .createMaterial(`${setId} atlas`)
      .setMetallicFactor(1)
      .setRoughnessFactor(1)
      .setBaseColorTexture(newTexture(s.doc, texName('color'), maps.color.half))
      .setNormalTexture(newTexture(s.doc, texName('normal'), maps.normal.half))
      .setMetallicRoughnessTexture(data)
      .setOcclusionTexture(data);
    for (const [region, piece] of pieces)
      report.parts[armorNode(set, region)] = addPart(s, armorNode(set, region), src, piece, m);
    if (helm) {
      const hd = newTexture(
        s.doc,
        `${texName('helm')}_data`,
        await ktx(helm.orm ?? helm.color, 256, {
          srgb: false,
          edit: helm.orm ? paintedSteel : undefined,
        }),
      );
      const hm = s.doc
        .createMaterial(`${setId} helm`)
        .setMetallicFactor(helm.orm ? 1 : 0)
        .setRoughnessFactor(helm.orm ? 1 : 0.6)
        .setBaseColorTexture(
          newTexture(s.doc, `${texName('helm')}_color`, await ktx(helm.color, 512, { srgb: true })),
        );
      if (helm.normal)
        hm.setNormalTexture(
          newTexture(
            s.doc,
            `${texName('helm')}_normal`,
            await ktx(helm.normal, 256, { srgb: false }),
          ),
        );
      if (helm.orm) hm.setMetallicRoughnessTexture(hd).setOcclusionTexture(hd);
      report.parts[armorNode(set, 'head')] = addPart(
        s,
        armorNode(set, 'head'),
        helm,
        allOf(helm),
        hm,
      );
    }
    await finalize(s.doc, resolve(OUT, `armor/${FIT}_${setId}_medium.glb`));
  }
  // low: its own small colour map, matte, nothing else (the WOC low contract)
  {
    const s = await scaffold();
    const m = matte(
      s.doc,
      `${setId} low`,
      newTexture(
        s.doc,
        `${texName('low')}_color`,
        await ktx(src.color, 512, { srgb: true, codec: 'etc1s' }),
      ),
    );
    for (const [region, piece] of pieces) addPart(s, armorNode(set, region), src, piece, m);
    if (helm) {
      const hm = matte(
        s.doc,
        `${setId} helm low`,
        newTexture(
          s.doc,
          `${texName('helm')}_low_color`,
          await ktx(helm.color, 256, { srgb: true, codec: 'etc1s' }),
        ),
      );
      addPart(s, armorNode(set, 'head'), helm, allOf(helm), hm);
    }
    await finalize(s.doc, resolve(OUT, `armor/${FIT}_${setId}_low.glb`));
  }
  // top: the top mip level of each atlas map under the same image name, on one degenerate
  // mesh (woc_armor_top_levels.ts pairs by name; the helm keeps its medium maps)
  {
    const { Document } = await import('@gltf-transform/core');
    const doc = new Document();
    const buffer = doc.createBuffer();
    const m = doc
      .createMaterial(`${setId} atlas top`)
      .setMetallicFactor(1)
      .setRoughnessFactor(1)
      .setBaseColorTexture(newTexture(doc, texName('color'), maps.color.top))
      .setNormalTexture(newTexture(doc, texName('normal'), maps.normal.top));
    const dt = newTexture(doc, texName('data'), maps.data.top);
    m.setMetallicRoughnessTexture(dt).setOcclusionTexture(dt);
    const prim = doc
      .createPrimitive()
      .setMaterial(m)
      .setAttribute(
        'POSITION',
        doc.createAccessor().setArray(new Float32Array(9)).setType('VEC3').setBuffer(buffer),
      );
    doc
      .createScene('top_levels')
      .addChild(
        doc.createNode('top_levels').setMesh(doc.createMesh('top_levels').addPrimitive(prim)),
      );
    doc.createExtension(KHRTextureBasisu).setRequired(true);
    await io.write(resolve(OUT, `armor/${FIT}_${setId}_top.glb`), doc);
    log('wrote top', setId);
  }
}
console.log(JSON.stringify(report, null, 1));
