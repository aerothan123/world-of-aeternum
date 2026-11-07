// Writes Unreal-importable copies of the game's WOC character GLBs (the originals stay
// untouched). Unreal's glTF importer reads neither meshopt/quantized data nor KTX2
// textures, and it builds one skeleton per file, so every output is rebuilt onto ONE
// rig per body fit:
//  - <fit> base: the base body plus every clip of the fit's animation libraries
//    (anims_<fit>.glb and the hand-keyed woc_<fit>.glb), retargeted onto the base's
//    nodes by name;
//  - each armor pack and head-library file: its pieces as SKINNED meshes on the base
//    rig. A piece already skinned keeps its weights (joints remapped by name, vertices
//    re-bound to the base rest pose); a rigid piece hung under a bone (a helm, a
//    shoulder, every head piece) is bound 100% to that bone at the same local offset
//    the web renderer hangs it at (woc_head_packs.ts hangWocHeadPieces), morph targets
//    included.
// Textures are transcoded KTX2 to PNG with asset-convert's scripts/unreal/ktx2_png.mjs
// (passed as the second argument), so the painted colour survives.
// Usage (cwd = worktree): node scripts/unreal/prep_characters.mjs <character_visuals.json> \
//   <ktx2_png.mjs> <publicModelsDir> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const [exportPath, ktxModule, modelsDir, outDir] = process.argv.slice(2);
const { ktx2ToPngBuffer } = await import(pathToFileURL(path.resolve(ktxModule)).href);
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const spec = JSON.parse(fs.readFileSync(exportPath, 'utf8')).files;

// --- small 4x4 column-major matrix helpers (glTF order) ---
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function inv(m) {
  const a = m;
  const o = new Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
  const b00 = a00 * a11 - a01 * a10,
    b01 = a00 * a12 - a02 * a10,
    b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11,
    b04 = a01 * a13 - a03 * a11,
    b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30,
    b07 = a20 * a32 - a22 * a30,
    b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31,
    b10 = a21 * a33 - a23 * a31,
    b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  const d = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return o;
}
const xfPoint = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
];
const xfDir = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
];
const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const addScaled = (acc, m, w) => {
  for (let i = 0; i < 16; i++) acc[i] += m[i] * w;
};

async function readDecoded(rel) {
  const doc = await io.read(path.join(modelsDir, `${rel}.glb`));
  await doc.transform(dequantize());
  return doc;
}

function stripCompression(doc) {
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (
      ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu'].includes(
        ext.extensionName,
      )
    )
      ext.dispose();
  }
}

/** KTX2 to PNG in place for one document's textures. */
async function pngTextures(doc) {
  for (const t of doc.getRoot().listTextures()) {
    if (t.getMimeType() !== 'image/ktx2') continue;
    const r = await ktx2ToPngBuffer(t.getImage());
    t.setImage(new Uint8Array(r.png)).setMimeType('image/png');
    t.setURI(`${t.getName() || 'tex'}.png`);
  }
}

/** The base rig: joint nodes by name, their world (rest) matrices, the skin. */
function rigOf(doc) {
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints();
  const byName = new Map(
    joints.map((j, i) => [j.getName(), { node: j, index: i, world: j.getWorldMatrix() }]),
  );
  // A skinned vertex lands at jointWorld * IBM * v, so the skin's own mesh frame is
  // jointWorld * IBM at bind (the same for every joint: the armature's placement). A rebuilt
  // vertex computed in world space goes back into that frame, or the rig's root transform
  // would apply twice.
  const ibm = [];
  skin.getInverseBindMatrices().getElement(0, ibm);
  const meshFromWorld = inv(mul(joints[0].getWorldMatrix(), ibm));
  return { skin, joints, byName, meshFromWorld };
}

const out = { written: [], pieces: {}, warnings: [] };

async function writeDoc(doc, rel) {
  stripCompression(doc);
  // only data blocks: nodes stay (a leaf bone is a joint, not litter)
  await doc.transform(
    prune({ propertyTypes: ['Accessor', 'Mesh', 'Material', 'Texture'], keepAttributes: true }),
  );
  const file = path.join(outDir, `${rel}.glb`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await io.write(file, doc);
  out.written.push(rel);
}

/** Base + every clip of the fit's libraries, retargeted by node name. */
async function buildBase(fit) {
  const base = await readDecoded(spec.bases[fit]);
  await pngTextures(base);
  const nodes = new Map(
    base
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  );
  const buf = base.getRoot().listBuffers()[0] ?? base.createBuffer();
  let clips = 0;
  for (const rel of spec.anims[fit]) {
    const src = await readDecoded(rel);
    for (const a of src.getRoot().listAnimations()) {
      const anim = base.createAnimation(a.getName());
      for (const ch of a.listChannels()) {
        const target = ch.getTargetNode() && nodes.get(ch.getTargetNode().getName());
        if (!target) continue;
        const s = ch.getSampler();
        const copy = (acc) => {
          const n = acc.getCount();
          const size = acc.getElementSize();
          const arr = new Float32Array(n * size);
          const el = [];
          for (let i = 0; i < n; i++) {
            acc.getElement(i, el);
            for (let k = 0; k < size; k++) arr[i * size + k] = el[k];
          }
          return base.createAccessor().setType(acc.getType()).setArray(arr).setBuffer(buf);
        };
        const sampler = base
          .createAnimationSampler()
          .setInput(copy(s.getInput()))
          .setOutput(copy(s.getOutput()))
          .setInterpolation(s.getInterpolation());
        anim.addSampler(sampler);
        anim.addChannel(
          base
            .createAnimationChannel()
            .setTargetNode(target)
            .setTargetPath(ch.getTargetPath())
            .setSampler(sampler),
        );
      }
      clips++;
    }
  }
  out.pieces[spec.bases[fit]] = { clips };
  await writeDoc(base, spec.bases[fit]);
}

/** The nearest ancestor of a node that is a joint of the base rig. */
function boneAncestor(node, rig) {
  for (let p = node.getParentNode(); p; p = p.getParentNode())
    if (rig.byName.has(p.getName())) return p;
  return null;
}

/** Copies one material (and its textures, once each) into the output document. */
function copyMaterial(dst, cache, m) {
  if (!m) return null;
  if (cache.has(m)) return cache.get(m);
  const tex = (t) => {
    if (!t) return null;
    if (cache.has(t)) return cache.get(t);
    const c = dst
      .createTexture(t.getName())
      .setImage(t.getImage())
      .setMimeType(t.getMimeType())
      .setURI(t.getURI());
    cache.set(t, c);
    return c;
  };
  const c = dst
    .createMaterial(m.getName())
    .setBaseColorFactor(m.getBaseColorFactor())
    .setMetallicFactor(m.getMetallicFactor())
    .setRoughnessFactor(m.getRoughnessFactor())
    .setEmissiveFactor(m.getEmissiveFactor())
    .setAlphaMode(m.getAlphaMode())
    .setAlphaCutoff(m.getAlphaCutoff())
    .setDoubleSided(m.getDoubleSided())
    .setBaseColorTexture(tex(m.getBaseColorTexture()))
    .setNormalTexture(tex(m.getNormalTexture()))
    .setMetallicRoughnessTexture(tex(m.getMetallicRoughnessTexture()))
    .setEmissiveTexture(tex(m.getEmissiveTexture()));
  cache.set(m, c);
  return c;
}

/** One part file's pieces, rebuilt as skinned meshes on the fit's base rig. */
async function buildParts(fit, rel) {
  const part = await readDecoded(rel);
  await pngTextures(part);
  const dst = await readDecoded(spec.bases[fit]);
  for (const a of dst.getRoot().listAnimations()) a.dispose();
  for (const n of dst.getRoot().listNodes()) if (n.getMesh()) n.setMesh(null);
  for (const m of dst.getRoot().listMeshes()) m.dispose();
  for (const m of dst.getRoot().listMaterials()) m.dispose();
  for (const t of dst.getRoot().listTextures()) t.dispose();
  const rig = rigOf(dst);
  const buf = dst.getRoot().listBuffers()[0] ?? dst.createBuffer();
  const scene = dst.getRoot().listScenes()[0];
  const cache = new Map();
  const names = [];
  let worstRest = 0;
  for (const node of part.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const skin = node.getSkin();
    let perJoint = null; // skinned: part joint index -> { baseIndex, matrix to base world }
    let rigid = null; // rigid: { baseIndex, matrix }
    if (skin) {
      const ibms = skin.getInverseBindMatrices();
      perJoint = skin.listJoints().map((j, i) => {
        const b = rig.byName.get(j.getName());
        if (!b) return null;
        const ibm = [];
        ibms.getElement(i, ibm);
        const pw = j.getWorldMatrix();
        for (let k = 0; k < 16; k++) worstRest = Math.max(worstRest, Math.abs(pw[k] - b.world[k]));
        return { baseIndex: b.index, matrix: mul(b.world, ibm) };
      });
    } else {
      const bone = boneAncestor(node, rig);
      if (!bone) {
        out.warnings.push(`${rel}: ${node.getName()} hangs on no bone of the ${fit} rig`);
        continue;
      }
      const b = rig.byName.get(bone.getName());
      const local = mul(inv(bone.getWorldMatrix()), node.getWorldMatrix());
      rigid = { baseIndex: b.index, matrix: mul(b.world, local) };
    }
    // named after the NODE: the part name the manifests select, and what Unreal names the asset
    const outMesh = dst.createMesh(node.getName());
    if (mesh.getExtras()) outMesh.setExtras(mesh.getExtras());
    outMesh.setWeights(mesh.getWeights());
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const nrm = prim.getAttribute('NORMAL');
      const n = pos.getCount();
      const P = new Float32Array(n * 3);
      const N = nrm ? new Float32Array(n * 3) : null;
      const J = new Uint16Array(n * 4);
      const W = new Float32Array(n * 4);
      const vertMats = new Array(n);
      const jl = prim.getAttribute('JOINTS_0');
      const wl = prim.getAttribute('WEIGHTS_0');
      const v = [],
        nv = [],
        jv = [],
        wv = [];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, v);
        let m;
        if (rigid) {
          m = rigid.matrix;
          J[i * 4] = rigid.baseIndex;
          W[i * 4] = 1;
        } else {
          jl.getElement(i, jv);
          wl.getElement(i, wv);
          m = new Array(16).fill(0);
          let sum = 0;
          for (let k = 0; k < 4; k++) {
            const pj = perJoint[jv[k]];
            if (!pj || wv[k] <= 0) continue;
            addScaled(m, pj.matrix, wv[k]);
            J[i * 4 + k] = pj.baseIndex;
            W[i * 4 + k] = wv[k];
            sum += wv[k];
          }
          if (sum <= 0) {
            m = rig.byName.values().next().value.world;
            J[i * 4] = 0;
            W[i * 4] = 1;
          } else for (let k = 0; k < 4; k++) W[i * 4 + k] /= sum;
        }
        m = mul(rig.meshFromWorld, m);
        vertMats[i] = m;
        P.set(xfPoint(m, v), i * 3);
        if (N) {
          nrm.getElement(i, nv);
          N.set(norm3(xfDir(m, nv)), i * 3);
        }
      }
      const p = dst.createPrimitive().setMode(prim.getMode());
      p.setAttribute('POSITION', dst.createAccessor().setType('VEC3').setArray(P).setBuffer(buf));
      if (N)
        p.setAttribute('NORMAL', dst.createAccessor().setType('VEC3').setArray(N).setBuffer(buf));
      p.setAttribute('JOINTS_0', dst.createAccessor().setType('VEC4').setArray(J).setBuffer(buf));
      p.setAttribute('WEIGHTS_0', dst.createAccessor().setType('VEC4').setArray(W).setBuffer(buf));
      for (const sem of ['TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']) {
        const a = prim.getAttribute(sem);
        if (!a) continue;
        const size = a.getElementSize();
        const arr = new Float32Array(a.getCount() * size);
        const el = [];
        for (let i = 0; i < a.getCount(); i++) {
          a.getElement(i, el);
          for (let k = 0; k < size; k++) arr[i * size + k] = el[k];
        }
        p.setAttribute(sem, dst.createAccessor().setType(a.getType()).setArray(arr).setBuffer(buf));
      }
      const idx = prim.getIndices();
      if (idx) {
        const arr = new Uint32Array(idx.getCount());
        for (let i = 0; i < arr.length; i++) arr[i] = idx.getScalar(i);
        p.setIndices(dst.createAccessor().setType('SCALAR').setArray(arr).setBuffer(buf));
      }
      for (const t of prim.listTargets()) {
        const tp = t.getAttribute('POSITION');
        const tn = t.getAttribute('NORMAL');
        const target = dst.createPrimitiveTarget(t.getName());
        const dP = new Float32Array(n * 3);
        const dN = tn ? new Float32Array(n * 3) : null;
        const e = [];
        for (let i = 0; i < n; i++) {
          tp.getElement(i, e);
          dP.set(xfDir(vertMats[i], e), i * 3);
          if (dN) {
            tn.getElement(i, e);
            dN.set(xfDir(vertMats[i], e), i * 3);
          }
        }
        target.setAttribute(
          'POSITION',
          dst.createAccessor().setType('VEC3').setArray(dP).setBuffer(buf),
        );
        if (dN)
          target.setAttribute(
            'NORMAL',
            dst.createAccessor().setType('VEC3').setArray(dN).setBuffer(buf),
          );
        p.addTarget(target);
      }
      p.setMaterial(copyMaterial(dst, cache, prim.getMaterial()));
      outMesh.addPrimitive(p);
    }
    const outNode = dst.createNode(node.getName()).setMesh(outMesh).setSkin(rig.skin);
    scene.addChild(outNode);
    names.push(node.getName());
  }
  if (worstRest > 1e-3)
    out.warnings.push(`${rel}: rest pose differs from the ${fit} base by ${worstRest.toFixed(4)}`);
  out.pieces[rel] = { fit, nodes: names };
  await writeDoc(dst, rel);
}

const fitOfFile = (rel) => (/female_|type_b_/.test(rel.split('/').pop()) ? 'female' : 'male');

for (const fit of ['male', 'female']) await buildBase(fit);
for (const rel of spec.armor) await buildParts(fitOfFile(rel), rel);
for (const type of ['a', 'b'])
  for (const rel of spec.heads[type]) await buildParts(type === 'b' ? 'female' : 'male', rel);
fs.writeFileSync(path.join(outDir, 'prep_report.json'), JSON.stringify(out, null, 1));
console.log('wrote', out.written.length, 'files;', out.warnings.length, 'warnings');
for (const w of out.warnings.slice(0, 20)) console.log('WARN', w);
