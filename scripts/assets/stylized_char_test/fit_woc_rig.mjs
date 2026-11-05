// Put a Tripo auto-rigged biped onto the shipped WOC_Armored_Rig so the WOC
// animation library (anims_male.glb + woc_keyed/woc_male.glb) drives it with
// the existing ClipMap, no new clips and no new dispatch. The math and the
// reasoning are the header of fit_woc_rig_core.mjs; this file is the IO.
//
// Usage:
//   node scripts/assets/stylized_char_test/fit_woc_rig.mjs --rigged <tripo rigged.glb> \
//     --out <out.glb> [--color 1024] [--aux 512] [--keep-orm] [--roughness 0.85]
//
// Output: the WOC base file's rig (every joint name, rest rotation and the
// handslots kept; joint positions refit to the new body) with ONE skinned body
// mesh in its bind pose, plus the Tripo PBR maps re-encoded WebP (base colour at
// --color px, normal and ORM at --aux px). No clips: the game composes them from
// the WOC library at load time, exactly as it does for the WOC bodies.
// biome-ignore assist/source/organizeImports: sharp must initialize before @gltf-transform/functions on Windows.
import sharp from 'sharp';
import { resolve } from 'node:path';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
import { openGlb, saveGlb } from '../../asset_pipeline/lib/glb.mjs';
import {
  ALIGN_CHAINS,
  WOC_POSITION_SOURCE,
  poseSkeleton,
  remapInfluences,
  reskinVertex,
  sub,
  wocJointForTripo,
} from './fit_woc_rig_core.mjs';
import { invert4, transformPoint4 } from './mat4_core.mjs';

void sharp;
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const REPO = resolve(import.meta.dirname, '../../..');
const rigged = opt('rigged');
const outPath = opt('out');
if (!rigged || !outPath) throw new Error('need --rigged <glb> --out <glb>');
const colorPx = Number(opt('color', 1024));
const auxPx = Number(opt('aux', 512));
const keepOrm = args.includes('--keep-orm');
const matteRoughness = Number(opt('roughness', 0.85));
const calmSkin = args.includes('--calm-skin');

/** Tone down painted skin blotches (Tripo's rosy cheeks and nose read as orange patches in the
 *  game's grade): only bright, strongly saturated red-orange texels are pulled back toward the
 *  skin around them; ordinary skin, dark leather and ochre cloth fall outside the gates. */
async function calmSkinBlotches(bytes) {
  const { data, info } = await sharp(Buffer.from(bytes))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { calmSkinTexel } = await import('./calm_skin_core.mjs');
  for (let i = 0; i < data.length; i += 4) {
    const out = calmSkinTexel(data[i], data[i + 1], data[i + 2]);
    data[i] = out[0];
    data[i + 1] = out[1];
    data[i + 2] = out[2];
  }
  return new Uint8Array(
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer(),
  );
}
const BASE = resolve(REPO, 'public/models/chars/players/woc/base_male.glb');

// --- WOC reference rig: rest world positions per joint -----------------------
const doc = await openGlb(BASE); // edited in place, saved to --out
const root = doc.getRoot();
const skin = root.listSkins()[0];
const wJoints = skin.listJoints();
const wIndex = new Map(wJoints.map((j, i) => [j.getName(), i]));
const wPos = new Map(wJoints.map((j) => [j.getName(), j.getWorldMatrix().slice(12, 15)]));

// --- Tripo rig: bind positions from its inverse bind matrices ----------------
const tdoc = await openGlb(resolve(rigged));
const tskin = tdoc.getRoot().listSkins()[0];
const tJoints = tskin.listJoints();
const tIbm = tskin.getInverseBindMatrices().getArray();
// Facing: Tripo's rig faces +X with its left side at -Z; the WOC rig faces +Z
// with its left at +X. A -90 degree turn about Y maps one onto the other.
const face = ([x, y, z]) => [-z, y, x];
const tBind = tJoints.map((_, i) => {
  const m = invert4(Array.from(tIbm.slice(i * 16, i * 16 + 16)));
  return face([m[12], m[13], m[14]]);
});
// Top-down order (parents first), parent as an index INTO that order.
const tSet = new Set(tJoints);
const order = [];
const visit = (node) => {
  order.push(tJoints.indexOf(node));
  for (const c of node.listChildren()) if (tSet.has(c)) visit(c);
};
for (const j of tJoints) if (!tSet.has(j.getParentNode())) visit(j);
const at = new Map(order.map((skinIdx, k) => [skinIdx, k]));
const joints = order.map((skinIdx) => {
  const node = tJoints[skinIdx];
  const p = node.getParentNode();
  return {
    name: node.getName(),
    parent: tSet.has(p) ? at.get(tJoints.indexOf(p)) : -1,
    pos: tBind[skinIdx],
  };
});
const align = new Map(
  ALIGN_CHAINS.map(([tj, tc, wj, wc]) => [tj, { child: tc, dir: sub(wPos.get(wc), wPos.get(wj)) }]),
);
for (const [tj, a] of align) {
  if (!joints.some((j) => j.name === tj) || !joints.some((j) => j.name === a.child)) {
    throw new Error(`tripo rig lacks ${tj} -> ${a.child}`);
  }
}
const pose = poseSkeleton(joints, align);
const restPos = joints.map((j) => j.pos);
const byT = new Map(joints.map((j, k) => [j.name, k]));

// --- Re-skin the body into the aligned pose ---------------------------------
const tPrims = tdoc
  .getRoot()
  .listMeshes()
  .flatMap((m) => m.listPrimitives());
const els = (acc) => {
  const n = acc.getCount();
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = acc.getElement(i, []);
  return out;
};
const posed = tPrims.map((prim) => {
  const P = els(prim.getAttribute('POSITION'));
  const N = prim.getAttribute('NORMAL') ? els(prim.getAttribute('NORMAL')) : null;
  const J = els(prim.getAttribute('JOINTS_0'));
  const W = els(prim.getAttribute('WEIGHTS_0'));
  const pos = [];
  const nrm = [];
  const jt = [];
  const wt = [];
  for (let v = 0; v < P.length; v++) {
    const idx = J[v].map((s) => at.get(s));
    const r = reskinVertex(face(P[v]), N ? face(N[v]) : null, idx, W[v], restPos, pose);
    pos.push(r.v);
    if (r.n) nrm.push(r.n);
    jt.push(J[v]);
    wt.push(W[v]);
  }
  return { prim, pos, nrm: N ? nrm : null, jt, wt };
});

// --- Scale so the hips stand where the WOC hips track puts them -------------
let ground = Infinity;
for (const p of posed) for (const v of p.pos) ground = Math.min(ground, v[1]);
const thighY = (pose.pos[byT.get('L_Thigh')][1] + pose.pos[byT.get('R_Thigh')][1]) / 2 - ground;
const wocThighY = (wPos.get('upperleg.l')[1] + wPos.get('upperleg.r')[1]) / 2;
const s = wocThighY / thighY;
const hipT = pose.pos[byT.get('Hip')];
const wHip = wPos.get('hips');
const place = (p) => [
  (p[0] - hipT[0]) * s + wHip[0],
  (p[1] - ground) * s,
  (p[2] - hipT[2]) * s + wHip[2],
];
for (const p of posed) p.pos = p.pos.map(place);
const tPosed = (name) => place(pose.pos[byT.get(name)]);

// --- Refit the WOC joints: posed positions in, rest rotations kept ----------
// Top-down over the WOC hierarchy. A joint with a source takes the posed
// position; any other (root, hand, handslots, skirt and tassel helpers) keeps
// its own rest local translation under its refit parent.
const wSet = new Set(wJoints);
const wOrder = [];
const wVisit = (node) => {
  if (wSet.has(node)) wOrder.push(node);
  for (const c of node.listChildren()) wVisit(c);
};
for (const j of wJoints) if (!wSet.has(j.getParentNode())) wVisit(j);
for (const node of wOrder) {
  const src = WOC_POSITION_SOURCE[node.getName()];
  if (!src) continue;
  const parentWorld = node.getParentNode()?.getWorldMatrix() ?? [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ];
  node.setTranslation(transformPoint4(invert4(parentWorld), tPosed(src)));
}
const report = { scale: +s.toFixed(4), joints: {} };
for (const node of wOrder) {
  const name = node.getName();
  const now = node.getWorldMatrix().slice(12, 15);
  const was = wPos.get(name);
  report.joints[name] = +Math.hypot(now[0] - was[0], now[1] - was[1], now[2] - was[2]).toFixed(3);
}
// New inverse bind matrices: the refit rest pose IS the bind pose (the body
// below is authored in rest-world units, so the old dequantization offset the
// quantized WOC base folded into its IBMs no longer applies).
const ibmArr = new Float32Array(wJoints.length * 16);
wJoints.forEach((j, i) => {
  ibmArr.set(invert4(j.getWorldMatrix()), i * 16);
});
skin.getInverseBindMatrices().setArray(ibmArr).setNormalized(false);

// --- Weights onto WOC joints, by bone name ----------------------------------
const hipsIdx = wIndex.get('hips');
const tToW = tJoints.map((j) => {
  const w = wocJointForTripo(j.getName());
  return w !== null && wIndex.has(w) ? wIndex.get(w) : hipsIdx;
});
const unmapped = tJoints
  .filter((j) => wocJointForTripo(j.getName()) === null)
  .map((j) => j.getName());

// --- Replace the WOC body mesh with the new one -----------------------------
const bodyNode = root.listNodes().find((n) => n.getSkin() === skin && n.getMesh());
if (!bodyNode) throw new Error('WOC base has no skinned body node');
bodyNode.getMesh().dispose();
const buffer = root.listBuffers()[0];
const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buffer);
const mesh = doc.createMesh('StylizedBody');
let tris = 0;
for (const p of posed) {
  const n = p.pos.length;
  const pos = new Float32Array(n * 3);
  const nrm = p.nrm ? new Float32Array(n * 3) : null;
  const jo = new Uint16Array(n * 4);
  const we = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    pos.set(p.pos[v], v * 3);
    if (nrm) nrm.set(p.nrm[v], v * 3);
    const r = remapInfluences(p.jt[v], p.wt[v], tToW, hipsIdx);
    jo.set(r.idx, v * 4);
    we.set(r.wts, v * 4);
  }
  const src = p.prim;
  const m = src.getMaterial();
  const mat = doc.createMaterial('StylizedBody');
  const copyTex = (tex) =>
    tex
      ? doc.createTexture(tex.getName()).setImage(tex.getImage()).setMimeType(tex.getMimeType())
      : null;
  const color = copyTex(m?.getBaseColorTexture());
  if (color && calmSkin)
    color.setImage(await calmSkinBlotches(color.getImage())).setMimeType('image/png');
  const normal = copyTex(m?.getNormalTexture());
  if (color) mat.setBaseColorTexture(color);
  if (normal) mat.setNormalTexture(normal);
  if (keepOrm) {
    const orm = copyTex(m?.getMetallicRoughnessTexture());
    if (orm) mat.setMetallicRoughnessTexture(orm);
    mat
      .setMetallicFactor(m?.getMetallicFactor() ?? 0)
      .setRoughnessFactor(m?.getRoughnessFactor() ?? 1);
  } else {
    // The hand-painted look carries its light in the albedo: Tripo's ORM reads
    // its plate as near-black chrome under the game's sky, so it is dropped
    // (one map fewer in memory) for a matte dielectric.
    mat.setMetallicFactor(0).setRoughnessFactor(matteRoughness);
  }
  const uv = src.getAttribute('TEXCOORD_0');
  const prim = doc
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute('POSITION', acc(pos, 'VEC3'))
    .setAttribute('JOINTS_0', acc(jo, 'VEC4'))
    .setAttribute('WEIGHTS_0', acc(we, 'VEC4'));
  if (nrm) prim.setAttribute('NORMAL', acc(nrm, 'VEC3'));
  if (uv) prim.setAttribute('TEXCOORD_0', acc(new Float32Array(els(uv).flat()), 'VEC2'));
  const ind = src.getIndices();
  if (ind) prim.setIndices(acc(new Uint32Array(ind.getArray()), 'SCALAR'));
  tris += (ind ? ind.getCount() : n) / 3;
  mesh.addPrimitive(prim);
}
bodyNode.setMesh(mesh);
// The quantized, meshopt-packed, basisu-textured base needs none of its
// extensions any more (the new body is plain float data with WebP maps).
for (const ext of root.listExtensionsUsed()) {
  if (/KHR_mesh_quantization|EXT_meshopt_compression|KHR_texture_basisu/.test(ext.extensionName)) {
    ext.dispose();
  }
}
await doc.transform(
  prune(),
  dedup(),
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [colorPx, colorPx],
    slots: /^baseColor/,
    quality: 90,
  }),
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [auxPx, auxPx],
    slots: /^(normal|metallicRoughness)/,
    quality: 90,
  }),
);
if (args.includes('--ktx2')) await toKtx2();
await saveGlb(doc, resolve(outPath));

/** GPU-compressed textures (KHR_texture_basisu, UASTC + zstd, full mip chain), the
 *  form every WOC body ships in, through the painted pass's libktx wasm encoder
 *  (no ktx CLI needed; KTX_WEB_DIR names the libktx Web build). */
async function toKtx2() {
  const { encodeKtx2 } = await import('../woc_character/painted/ktxlib.mjs');
  const { KHRTextureBasisu } = await import('@gltf-transform/extensions');
  const colorTex = new Set(
    root
      .listMaterials()
      .map((m) => m.getBaseColorTexture())
      .filter(Boolean),
  );
  for (const tex of root.listTextures()) {
    const { data, info } = await sharp(Buffer.from(tex.getImage()))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const levels = [{ width: info.width, height: info.height, data }];
    for (let w = info.width >> 1, h = info.height >> 1; w >= 1 && h >= 1; w >>= 1, h >>= 1) {
      const lv = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .resize(w, h, { kernel: 'lanczos3' })
        .raw()
        .toBuffer();
      levels.push({ width: w, height: h, data: lv });
      if (w === 1 || h === 1) break;
    }
    const srgb = colorTex.has(tex);
    const ktx = await encodeKtx2(levels, { srgb, codec: 'uastc', rdo: srgb ? 1 : 0 });
    tex.setImage(new Uint8Array(ktx)).setMimeType('image/ktx2');
  }
  doc.createExtension(KHRTextureBasisu).setRequired(true);
}
console.log(JSON.stringify({ out: outPath, tris, unmapped, ...report }, null, 1));
