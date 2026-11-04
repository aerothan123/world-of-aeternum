// Fit the Tripo storybook (Fable-style) foliage sources onto the world
// foliage slots: split each single-mesh source into the bark / leaf / flower
// primitives the renderer's material policy keys on, scale and move it onto
// the old model's height, sink and trunk position, and write
// public/models/foliage/<name>.glb. Pure logic: fable_foliage_fit_core.mjs.
//
// Usage: node scripts/assets/fit_fable_foliage.mjs [--only oak_1,rock_2]
//
// Deterministic: the same sources and dependency versions give the same
// bytes. After a run, re-derive the field copies and the pins that cover
// these files (the steps are printed at the end).
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import {
  applyFit,
  applyLeafGrade,
  atlasLayout,
  BARK_ALBEDO_TARGETS,
  BARK_GRADE_GAIN,
  classifyFableTriangles,
  FABLE_FOLIAGE_TARGETS,
  FABLE_KIND_MATERIALS,
  fitNormals,
  fitTransform,
  indexedBounds,
  LEAF_ALBEDO_TARGETS,
  leafGradeGains,
  rasterizeUvMask,
  remapUvsToAtlasCell,
  SPLIT_KINDS,
  subtractMask,
  treeAnchor,
} from './fable_foliage_fit_core.mjs';
import {
  optimizeFoliageVertexDocument,
  triangleAttributeFingerprint,
} from './foliage_vertex_pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = path.join(ROOT, 'assets_src', 'fable_foliage');
const OUT_DIR = path.join(ROOT, 'public', 'models', 'foliage');
const ROCK_ATLAS_TILE = 512;

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.split('=')[1] ?? args[args.indexOf(onlyArg) + 1]).split(',') : null;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const QUIET = new Logger(Logger.Verbosity.WARN);
const io = new NodeIO()
  .setLogger(QUIET)
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** World-space float geometry of the one Tripo primitive, plus its texture. */
async function readSource(name) {
  const doc = await io.read(path.join(SRC_DIR, `${name}.glb`));
  const nodes = doc
    .getRoot()
    .listNodes()
    .filter((n) => n.getMesh());
  if (nodes.length !== 1) throw new Error(`${name}: expected one mesh node, found ${nodes.length}`);
  const prims = nodes[0].getMesh().listPrimitives();
  if (prims.length !== 1) throw new Error(`${name}: expected one primitive, found ${prims.length}`);
  const prim = prims[0];
  const e = nodes[0].getWorldMatrix();
  const pos = prim.getAttribute('POSITION');
  const nrm = prim.getAttribute('NORMAL');
  const uv = prim.getAttribute('TEXCOORD_0');
  const count = pos.getCount();
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const p = [0, 0, 0];
  const t = [0, 0];
  for (let i = 0; i < count; i++) {
    pos.getElement(i, p);
    positions[i * 3] = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12];
    positions[i * 3 + 1] = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13];
    positions[i * 3 + 2] = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
    nrm.getElement(i, p);
    // node transforms are translate + uniform scale: normals only renormalize
    const len = Math.hypot(p[0], p[1], p[2]) || 1;
    normals.set([p[0] / len, p[1] / len, p[2] / len], i * 3);
    uv.getElement(i, t);
    uvs.set(t, i * 2);
  }
  const indices = Uint32Array.from(prim.getIndices().getArray());
  const texture = prim.getMaterial().getBaseColorTexture();
  const webp = Buffer.from(texture.getImage());
  const { data, info } = await sharp(webp)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const image = { data, width: info.width, height: info.height, channels: info.channels };
  return { positions, normals, uvs, indices, webp, image };
}

/** Simplify to the triangle budget, keeping original vertices, then compact. */
function simplifyToBudget(src, budget) {
  let indices = src.indices;
  if (indices.length / 3 > budget) {
    // Seams first (the texture stays put); a fragmented Tripo atlas can pin
    // too many seam vertices to reach the budget, and only then may the
    // collapse cross a seam.
    [indices] = MeshoptSimplifier.simplify(indices, src.positions, 3, budget * 3, 1, []);
    if (indices.length / 3 > budget * 1.1) {
      [indices] = MeshoptSimplifier.simplify(indices, src.positions, 3, budget * 3, 1, [
        'Permissive',
      ]);
    }
  }
  const remap = new Map();
  const keep = [];
  const outIndices = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    let id = remap.get(indices[i]);
    if (id === undefined) {
      id = keep.length;
      remap.set(indices[i], id);
      keep.push(indices[i]);
    }
    outIndices[i] = id;
  }
  const pick = (arr, size) => {
    const out = new Float32Array(keep.length * size);
    keep.forEach((v, i) => {
      for (let k = 0; k < size; k++) out[i * size + k] = arr[v * size + k];
    });
    return out;
  };
  return {
    ...src,
    indices: outIndices,
    positions: pick(src.positions, 3),
    normals: pick(src.normals, 3),
    uvs: pick(src.uvs, 2),
  };
}

/** The triangles of `labels === label` as their own compacted primitive data. */
function partOf(geo, labels, label) {
  const remap = new Map();
  const keep = [];
  const idx = [];
  for (let t = 0; t < geo.indices.length / 3; t++) {
    if (labels && labels[t] !== label) continue;
    for (let k = 0; k < 3; k++) {
      const v = geo.indices[t * 3 + k];
      let id = remap.get(v);
      if (id === undefined) {
        id = keep.length;
        remap.set(v, id);
        keep.push(v);
      }
      idx.push(id);
    }
  }
  const pick = (arr, size) => {
    const out = new Float32Array(keep.length * size);
    keep.forEach((v, i) => {
      for (let k = 0; k < size; k++) out[i * size + k] = arr[v * size + k];
    });
    return out;
  };
  return {
    indices: Uint16Array.from(idx),
    positions: pick(geo.positions, 3),
    normals: pick(geo.normals, 3),
    uvs: pick(geo.uvs, 2),
  };
}

/** One shared atlas for the rocks: the renderer draws all three (and their
 *  merged cluster) with ONE material, so they must share one texture. */
async function buildRockAtlas(sources) {
  const layout = atlasLayout(sources.length);
  const composites = await Promise.all(
    sources.map(async (s, i) => ({
      input: await sharp(s.webp).resize(ROCK_ATLAS_TILE, ROCK_ATLAS_TILE).png().toBuffer(),
      left: (i % layout.cols) * ROCK_ATLAS_TILE,
      top: Math.floor(i / layout.cols) * ROCK_ATLAS_TILE,
    })),
  );
  const atlas = await sharp({
    create: {
      width: layout.cols * ROCK_ATLAS_TILE,
      height: layout.rows * ROCK_ATLAS_TILE,
      channels: 3,
      background: { r: 128, g: 128, b: 120 },
    },
  })
    .composite(composites)
    .webp({ quality: 88, effort: 6, alphaQuality: 100 })
    .toBuffer();
  return { atlas, layout };
}

const ALPHA = {
  Bark_NormalTree: ['MASK', 0.2],
  Leaves_NormalTree: ['MASK', 0.2],
  Leaves_Pine: ['MASK', 0.2],
  Leaves_TwistedTree: ['MASK', 0.2],
  Flowers: ['MASK', 0.2],
};

async function writeModel(target, parts, webp, textureName) {
  const doc = new Document().setLogger(QUIET);
  doc.createExtension(EXTTextureWebP).setRequired(true);
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const buffer = doc.createBuffer();
  const texture = doc.createTexture(textureName).setImage(webp).setMimeType('image/webp');
  const mesh = doc.createMesh(`Fable_${target.name}`);
  for (const part of parts) {
    const [alphaMode, cutoff] = ALPHA[part.material] ?? ['OPAQUE', 0.5];
    const material = doc
      .createMaterial(part.material)
      .setBaseColorTexture(texture)
      .setRoughnessFactor(1)
      .setMetallicFactor(0)
      .setDoubleSided(true)
      .setAlphaMode(alphaMode)
      .setAlphaCutoff(cutoff);
    const acc = (array, type) =>
      doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const prim = doc
      .createPrimitive()
      .setMaterial(material)
      .setAttribute('POSITION', acc(part.positions, 'VEC3'))
      .setAttribute('NORMAL', acc(part.normals, 'VEC3'))
      .setAttribute('TEXCOORD_0', acc(part.uvs, 'VEC2'))
      .setIndices(acc(part.indices, 'SCALAR'))
      // read by src/render/foliage_tree_sculpt.ts: an authored storybook
      // model is drawn as shipped, never re-sculpted like the stock kit
      .setExtras({ fableFoliage: true });
    mesh.addPrimitive(prim);
  }
  const node = doc.createNode(`Fable_${target.name}`).setMesh(mesh);
  doc.createScene().addChild(node);
  await doc.transform(quantize());
  // The vertex finalization stage runs over the encoded document exactly as
  // scripts/assets/optimize_foliage_vertices.mjs runs it over a shipped file,
  // so that migration's input pin is this pre-stage encoding.
  const staged = await io.writeBinary(doc);
  const finished = await io.readBinary(staged);
  await optimizeFoliageVertexDocument(finished, MeshoptEncoder);
  const out = path.join(OUT_DIR, `${target.name}.glb`);
  const tmp = `${out}.fit.tmp.glb`;
  try {
    await io.write(tmp, finished);
    renameSync(tmp, out);
  } finally {
    rmSync(tmp, { force: true });
  }
  const bytes = readFileSync(out);
  const shipped = await io.readBinary(bytes);
  let vertices = 0;
  let triangles = 0;
  for (const mesh of shipped.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      vertices += prim.getAttribute('POSITION').getCount();
      triangles += prim.getIndices().getCount() / 3;
    }
  }
  return {
    bytes,
    inputSha256: sha256(staged),
    semanticSha256: triangleAttributeFingerprint(shipped),
    vertices,
    triangles,
  };
}

const targets = FABLE_FOLIAGE_TARGETS.filter((t) => !only || only.includes(t.name));
const sources = new Map();
for (const t of FABLE_FOLIAGE_TARGETS) {
  if (targets.includes(t) || (t.kind === 'rock' && targets.some((x) => x.kind === 'rock'))) {
    sources.set(t.name, await readSource(t.name));
  }
}
const rocks = FABLE_FOLIAGE_TARGETS.filter((t) => t.kind === 'rock');
const rockAtlas = targets.some((t) => t.kind === 'rock')
  ? await buildRockAtlas(rocks.map((t) => sources.get(t.name)))
  : null;

const report = [];
for (const target of targets) {
  const geo = simplifyToBudget(sources.get(target.name), target.budget);
  const materials = FABLE_KIND_MATERIALS[target.kind];
  let labels = null;
  if (SPLIT_KINDS.includes(target.kind)) {
    ({ labels } = classifyFableTriangles(target.kind, geo));
  }
  const bounds = indexedBounds(geo.indices, geo.positions);
  let anchor = {
    x: (bounds.min[0] + bounds.max[0]) / 2,
    z: (bounds.min[2] + bounds.max[2]) / 2,
  };
  if (target.kind === 'broadleaf' || target.kind === 'conifer' || target.kind === 'dead') {
    const mask = new Uint8Array(geo.indices.length / 3).map((_, t) =>
      labels ? labels[t] === 0 : 1,
    );
    anchor = treeAnchor(geo.indices, geo.positions, mask, bounds);
  }
  const fit = fitTransform(bounds, anchor, target);
  geo.positions = applyFit(geo.positions, fit);
  geo.normals = fitNormals(geo.normals, fit);
  if (target.kind === 'rock') {
    geo.uvs = remapUvsToAtlasCell(geo.uvs, rocks.indexOf(target), rockAtlas.layout, 0);
  }
  const parts = [];
  if (target.kind === 'broadleaf' || target.kind === 'conifer') {
    parts.push({ material: materials.bark, ...partOf(geo, labels, 0) });
    parts.push({ material: materials.leaf, ...partOf(geo, labels, 1) });
  } else if (target.kind === 'flowering_bush') {
    parts.push({ material: materials.leaf, ...partOf(geo, labels, 0) });
    parts.push({ material: materials.flower, ...partOf(geo, labels, 1) });
  } else {
    const name = materials.bark ?? materials.leaf ?? materials.whole;
    parts.push({ material: name, ...partOf(geo, null, 0) });
  }
  for (const part of parts) {
    if (part.indices.length === 0) throw new Error(`${target.name}: empty ${part.material} part`);
  }
  // Grade the leaf texels onto the kit sheet the renderer's tints expect,
  // and a split tree's bark onto the kit bark. A Tripo sheet reuses texels
  // across parts (a pine's brown tier undersides sample the trunk's), so the
  // bark footprint is graded as bark and taken out of the leaf footprint:
  // the leaf grade never turns a trunk green.
  let webp = sources.get(target.name).webp;
  const leafTarget = LEAF_ALBEDO_TARGETS[target.kind];
  if (leafTarget && target.kind !== 'rock') {
    const leafLabel = target.kind === 'flowering_bush' ? 0 : 1;
    const triMask = (label) =>
      new Uint8Array(geo.indices.length / 3).map((_, t) =>
        labels ? Number(labels[t] === label) : 1,
      );
    let { image } = sources.get(target.name);
    let leafMask = rasterizeUvMask(
      geo.indices,
      geo.uvs,
      triMask(leafLabel),
      image.width,
      image.height,
    );
    const barkTarget = BARK_ALBEDO_TARGETS[target.kind];
    if (barkTarget) {
      const barkMask = rasterizeUvMask(geo.indices, geo.uvs, triMask(0), image.width, image.height);
      image = applyLeafGrade(
        image,
        barkMask,
        leafGradeGains(image, barkMask, barkTarget, BARK_GRADE_GAIN),
      );
      leafMask = subtractMask(leafMask, barkMask);
    }
    const graded = applyLeafGrade(image, leafMask, leafGradeGains(image, leafMask, leafTarget));
    webp = await sharp(Buffer.from(graded.data), {
      raw: { width: image.width, height: image.height, channels: image.channels },
    })
      .webp({ quality: 90, effort: 6 })
      .toBuffer();
  }
  const written =
    target.kind === 'rock'
      ? await writeModel(target, parts, rockAtlas.atlas, 'Fable_Rocks')
      : await writeModel(target, parts, webp, `Fable_${target.name}`);
  const { bytes, ...pins } = written;
  report.push({
    name: target.name,
    scale: fit.scale.map((v) => +v.toFixed(4)),
    parts: parts.map((p) => `${p.material}:${p.indices.length / 3}`).join(' '),
    bytes: bytes.length,
    sha256: sha256(bytes),
    ...pins,
  });
  console.log(
    `  ${target.name.padEnd(13)} x${fit.scale[1].toFixed(3)}  ${report.at(-1).parts}  ${bytes.length} bytes  ${report.at(-1).sha256.slice(0, 12)}`,
  );
}

if (process.env.FIT_REPORT) writeFileSync(process.env.FIT_REPORT, JSON.stringify(report, null, 2));
console.log(
  [
    '\nNext steps:',
    '  1. node scripts/assets/decimate_foliage_bark.mjs --write-pins (and its printed steps)',
    '  2. re-pin tests/foliage_vertex_pipeline.test.ts and any other sha pin of these files',
    '  3. node scripts/gen_prop_natural_size.mjs; node scripts/assets/bake_collision.mjs',
    '     (commit only the foliage/<name> collision rows if other rows drifted)',
    '  4. node scripts/build_media_manifest.mjs generate',
  ].join('\n'),
);
