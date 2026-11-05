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
  paintedReliefNormals,
  RELIEF_KINDS,
  rasterizeUvMask,
  remapUvsToAtlasCell,
  SPLIT_KINDS,
  subtractMask,
  treeAnchor,
} from './fable_foliage_fit_core.mjs';
import {
  atlasPlacements,
  backgroundColour,
  bleedColour,
  cellsOf,
  coniferCoreToCrown,
  DENSE_BASE_SHADE,
  denseStampPlan,
  groupGains,
  innerHull,
  isLeafTexel,
  KIND_ATLAS,
  keyAlpha,
  kindColourFactor,
  LEAF_ATLASES,
  LEAF_CARD_KINDS,
  LEAF_CARD_RECIPES,
  LEAF_GROUP_ALBEDO,
  mergeParts,
  scatterLeafCards,
  scatterTwigCards,
  seedOf,
  spriteIslands,
  surfaceCentre,
} from './fable_leaf_cards_core.mjs';
import {
  optimizeFoliageVertexDocument,
  triangleAttributeFingerprint,
} from './foliage_vertex_pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = path.join(ROOT, 'assets_src', 'fable_foliage');
const SHEET_DIR = path.join(SRC_DIR, 'leaf_sheets');
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

const srgbToLin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const linToSrgb = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

/** Every painted sheet the atlases cut from, keyed and islanded once. */
async function loadLeafSheets() {
  const names = new Set(
    Object.values(LEAF_ATLASES).flatMap((a) => a.cells.map((c) => c.sheet).filter(Boolean)),
  );
  const sheets = new Map();
  for (const name of [...names].sort()) {
    const { data, info } = await sharp(path.join(SHEET_DIR, `${name}.webp`))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const image = { data, width: info.width, height: info.height, channels: info.channels };
    const alpha = keyAlpha(image, backgroundColour(image));
    sheets.set(name, { image, alpha, islands: spriteIslands(alpha, info.width, info.height) });
  }
  return sheets;
}

/**
 * One leaf-card atlas: every cell's sprite island cut out of its painted
 * sheet by its background key and scaled into the cell, each card group
 * graded onto its mean, the dense cell stamped from the family's clusters
 * over a dark base, and the colour bled under the cut so the mip chain never
 * darkens a leaf edge. Returns the webp, the grade and each group's cells.
 */
async function buildLeafAtlas(spec, sheets) {
  const rects = spec.cells.map((c) => {
    if (!c.sheet) return null;
    const r = sheets.get(c.sheet).islands[c.island];
    if (!r) throw new Error(`leaf atlas: ${c.sheet} has no island ${c.island}`);
    return r;
  });
  const placements = atlasPlacements(rects, spec);
  const W = spec.width;
  const H = spec.height;
  const atlas = new Uint8Array(W * H * 4);
  const cellRgba = [];
  for (let i = 0; i < spec.cells.length; i++) {
    const c = spec.cells[i];
    if (!c.sheet) {
      cellRgba.push(null);
      continue;
    }
    const { image, alpha } = sheets.get(c.sheet);
    const r = rects[i];
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    const crop = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (r.y0 + y) * image.width + r.x0 + x;
        const o = (y * w + x) * 4;
        crop[o] = image.data[si * 3];
        crop[o + 1] = image.data[si * 3 + 1];
        crop[o + 2] = image.data[si * 3 + 2];
        crop[o + 3] = alpha[si];
      }
    }
    const pl = placements[i];
    // sharp premultiplies alpha for the resize: a key fringe never bleeds in
    const scaled = await sharp(crop, { raw: { width: w, height: h, channels: 4 } })
      .resize(pl.width, pl.height, { kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    cellRgba.push(Uint8Array.from(scaled));
  }
  // grade each group onto its mean over the texels the alpha test keeps
  const gradeGroup = (group, target, only = () => true) => {
    const idx = cellsOf(group, spec.cells);
    if (idx.length === 0) return null;
    const sum = [0, 0, 0];
    let n = 0;
    for (const i of idx) {
      const px = cellRgba[i];
      for (let o = 0; o < px.length; o += 4) {
        if (px[o + 3] < 128 || !only(px[o], px[o + 1], px[o + 2])) continue;
        for (let k = 0; k < 3; k++) sum[k] += srgbToLin(px[o + k]);
        n++;
      }
    }
    const gains = groupGains(
      sum.map((v) => v / Math.max(1, n)),
      target,
    );
    for (const i of idx) {
      const px = cellRgba[i];
      for (let o = 0; o < px.length; o += 4) {
        if (!only(px[o], px[o + 1], px[o + 2])) continue;
        for (let k = 0; k < 3; k++) px[o + k] = linToSrgb(srgbToLin(px[o + k]) * gains[k]);
      }
    }
    return gains.map((g) => +g.toFixed(3));
  };
  const gains = {
    broadleaf: gradeGroup('broadleaf', LEAF_GROUP_ALBEDO.broadleaf),
    conifer: gradeGroup('conifer', LEAF_GROUP_ALBEDO.conifer),
    blossom: gradeGroup('blossom', LEAF_GROUP_ALBEDO.broadleaf, isLeafTexel),
  };
  const blit = (px, left, top, width, height, clip) => {
    for (let y = 0; y < height; y++) {
      const ay = top + y;
      if (ay < clip.top || ay >= clip.top + clip.height) continue;
      for (let x = 0; x < width; x++) {
        const ax = left + x;
        if (ax < clip.left || ax >= clip.left + clip.width) continue;
        const o = (y * width + x) * 4;
        const a = px[o + 3] / 255;
        if (a <= 0) continue;
        const d = (ay * W + ax) * 4;
        for (let k = 0; k < 3; k++)
          atlas[d + k] = Math.round(px[o + k] * a + atlas[d + k] * (1 - a));
        atlas[d + 3] = Math.max(atlas[d + 3], px[o + 3]);
      }
    }
  };
  for (let i = 0; i < spec.cells.length; i++) {
    const c = spec.cells[i];
    const pl = placements[i];
    if (c.sheet) {
      blit(cellRgba[i], pl.left, pl.top, pl.width, pl.height, pl.cell);
      continue;
    }
    // dense cell: an opaque dark base of the family's tone under seeded stamps
    const clip = pl.cell;
    const base = LEAF_GROUP_ALBEDO[c.of].map((v) => linToSrgb(v * DENSE_BASE_SHADE));
    for (let y = clip.top; y < clip.top + clip.height; y++) {
      for (let x = clip.left; x < clip.left + clip.width; x++) {
        atlas.set([base[0], base[1], base[2], 255], (y * W + x) * 4);
      }
    }
    const side = Math.min(clip.width, clip.height);
    for (const st of denseStampPlan(seedOf(`dense:${c.of}`), cellsOf(c.of, spec.cells))) {
      const src = placements[st.cell];
      const k = (st.size * side) / Math.max(src.width, src.height);
      const w = Math.max(2, Math.round(src.width * k));
      const h = Math.max(2, Math.round(src.height * k));
      let img = sharp(Buffer.from(cellRgba[st.cell]), {
        raw: { width: src.width, height: src.height, channels: 4 },
      }).resize(w, h, { kernel: 'lanczos3' });
      if (st.flip) img = img.flop();
      const px = Uint8Array.from(await img.raw().toBuffer());
      for (let o = 0; o < px.length; o += 4) {
        for (let q = 0; q < 3; q++) px[o + q] = Math.round(px[o + q] * st.shade);
      }
      blit(
        px,
        Math.round(clip.left + st.x * clip.width - w / 2),
        Math.round(clip.top + st.y * clip.height - h / 2),
        w,
        h,
        clip,
      );
    }
  }
  const bled = bleedColour(atlas, W, H);
  const webp = await sharp(Buffer.from(bled), { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toBuffer();
  const cells = {};
  for (const group of new Set(spec.cells.map((c) => c.group))) {
    if (group === 'dense') continue;
    cells[group] = cellsOf(group, spec.cells).map((i) => ({
      uv: placements[i].uv,
      aspect: placements[i].aspect,
      hang: !!spec.cells[i].hang,
    }));
  }
  const dense = {};
  spec.cells.forEach((c, i) => {
    if (c.group === 'dense') dense[c.of] = placements[i].uv;
  });
  return { name: spec.name, webp, gains, cells, dense };
}

/** Simplify one part to a triangle budget (positions only, seams free). */
function simplifyPart(part, budget) {
  if (part.indices.length / 3 <= budget) return part;
  const [indices] = MeshoptSimplifier.simplify(
    Uint32Array.from(part.indices),
    part.positions,
    3,
    budget * 3,
    1,
    ['Permissive'],
  );
  return { ...part, indices };
}

/** Union bounds of primitive data sets. */
function partsBounds(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const b = indexedBounds(p.indices, p.positions);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], b.min[k]);
      max[k] = Math.max(max[k], b.max[k]);
    }
  }
  return { min, max };
}

/** A card or hull part narrowed to 16-bit indices for the writer. */
const asWritable = (p) => ({ ...p, indices: Uint16Array.from(p.indices) });

const ALPHA = {
  Bark_NormalTree: ['MASK', 0.2],
  Leaves_NormalTree: ['MASK', 0.2],
  Leaves_Pine: ['MASK', 0.2],
  Leaves_TwistedTree: ['MASK', 0.2],
  Flowers: ['MASK', 0.2],
};

/** The painted relief normal map of a sheet (webp bytes in, webp bytes out). */
async function reliefFor(webp, opts) {
  const { data, info } = await sharp(webp)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = paintedReliefNormals(
    { data, width: info.width, height: info.height, channels: info.channels },
    opts,
  );
  return sharp(Buffer.from(rgb), { raw: { width: info.width, height: info.height, channels: 3 } })
    .webp({ quality: 90, effort: 6 })
    .toBuffer();
}

async function writeModel(target, parts, webp, textureName, atlas = null, relief = null) {
  const doc = new Document().setLogger(QUIET);
  doc.createExtension(EXTTextureWebP).setRequired(true);
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const buffer = doc.createBuffer();
  // the model's own baked sheet only when a part still samples it (a bush
  // whose whole crown became cards draws from the shared atlas alone)
  const texture = parts.some((p) => !p.atlas)
    ? doc.createTexture(textureName).setImage(webp).setMimeType('image/webp')
    : null;
  const atlasTexture = parts.some((p) => p.atlas)
    ? doc.createTexture(atlas.name).setImage(atlas.webp).setMimeType('image/webp')
    : null;
  const reliefTexture = relief
    ? doc.createTexture(`${textureName}_Relief`).setImage(relief).setMimeType('image/webp')
    : null;
  const mesh = doc.createMesh(`Fable_${target.name}`);
  for (const part of parts) {
    const [alphaMode, cutoff] = ALPHA[part.material] ?? ['OPAQUE', 0.5];
    const material = doc
      .createMaterial(part.material)
      .setBaseColorTexture(part.atlas ? atlasTexture : texture)
      .setBaseColorFactor([...(part.colorFactor ?? [1, 1, 1]), 1])
      .setRoughnessFactor(1)
      .setMetallicFactor(0)
      .setDoubleSided(true)
      .setAlphaMode(alphaMode)
      .setAlphaCutoff(cutoff);
    if (reliefTexture && !part.atlas) material.setNormalTexture(reliefTexture);
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

const leafAtlases = {};
if (targets.some((t) => LEAF_CARD_KINDS[t.kind])) {
  const sheets = await loadLeafSheets();
  for (const [family, spec] of Object.entries(LEAF_ATLASES)) {
    leafAtlases[family] = await buildLeafAtlas(spec, sheets);
    const a = leafAtlases[family];
    console.log(`  ${a.name} ${a.webp.length} bytes, grade ${JSON.stringify(a.gains)}`);
  }
}

const report = [];
for (const target of targets) {
  const geo = simplifyToBudget(sources.get(target.name), target.budget);
  const materials = FABLE_KIND_MATERIALS[target.kind];
  let labels = null;
  if (SPLIT_KINDS.includes(target.kind)) {
    ({ labels } = classifyFableTriangles(target.kind, geo));
  }
  const bounds = indexedBounds(geo.indices, geo.positions);
  const isTree = target.kind === 'broadleaf' || target.kind === 'conifer' || target.kind === 'dead';
  const barkMask = new Uint8Array(geo.indices.length / 3).map((_, t) =>
    labels ? labels[t] === 0 : 1,
  );
  // x/z the fit lands on the target: the trunk base for a tree, the bounds
  // centre otherwise, read against the bounds the fit scales (the cards'
  // own once a crown wears them, so the shipped file anchors where it reads)
  const anchorFor = (b) =>
    isTree
      ? treeAnchor(geo.indices, geo.positions, barkMask, b)
      : { x: (b.min[0] + b.max[0]) / 2, z: (b.min[2] + b.max[2]) / 2 };
  const anchor = anchorFor(bounds);
  // a carded conifer's upper trunk core joins the crown (it would poke
  // through the needle cards as bark)
  if (target.kind === 'conifer' && LEAF_CARD_KINDS.conifer) {
    labels = coniferCoreToCrown(labels, geo, bounds);
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
  // Leaf cards (fable_leaf_cards_core.mjs), in source units before the fit
  // so the fitted bounds, height and spread cover the cards too.
  const cardKind = LEAF_CARD_KINDS[target.kind];
  const leafAtlas = cardKind ? leafAtlases[KIND_ATLAS[target.kind]] : null;
  const cardReport = [];
  if (cardKind?.hull) {
    const leafName = materials.leaf;
    const crown = parts.find((p) => p.material === leafName);
    const centre = surfaceCentre(crown.indices, crown.positions);
    const srcHeight = bounds.max[1] - bounds.min[1];
    const hullPart = simplifyPart(crown, cardKind.hull.budget);
    const hull = innerHull(hullPart, centre, leafAtlas.dense[cardKind.hull.dense], {
      shrink: cardKind.hull.shrink,
      shrinkY: cardKind.hull.shrinkY ?? cardKind.hull.shrink,
      cellsPerUnit: 1.6 / srcHeight,
      seed: seedOf(`hull:${target.name}`),
    });
    const cards = scatterLeafCards(crown, {
      recipe: LEAF_CARD_RECIPES[cardKind.recipe],
      cells: leafAtlas.cells,
      height: srcHeight,
      centre,
      seed: seedOf(`cards:${target.name}`),
    });
    const leafCards = cards.broadleaf ?? cards.conifer;
    const leaf = mergeParts([hull, leafCards]);
    const factor = kindColourFactor(target.kind);
    const out = parts.filter((p) => p.material !== leafName && p.material !== materials.flower);
    out.push({ material: leafName, atlas: true, colorFactor: factor, ...asWritable(leaf) });
    if (cards.blossom) {
      out.push({ material: materials.flower, atlas: true, ...asWritable(cards.blossom) });
    }
    parts.length = 0;
    parts.push(...out);
    cardReport.push(`hull:${hull.indices.length / 3}`, `cards:${leafCards.cards}`);
    if (cards.blossom) cardReport.push(`blossoms:${cards.blossom.cards}`);
  } else if (cardKind?.twigs) {
    const bark = parts[0];
    const srcHeight = bounds.max[1] - bounds.min[1];
    const twigs = scatterTwigCards(bark, {
      cells: leafAtlas.cells.twig,
      height: srcHeight,
      axis: [anchor.x, anchor.z],
      seed: seedOf(`twigs:${target.name}`),
    });
    parts.push({ material: materials.twig, atlas: true, ...asWritable(twigs) });
    cardReport.push(`twigs:${twigs.cards}`);
  }
  const fitBounds = cardKind ? partsBounds(parts) : bounds;
  const fit = fitTransform(fitBounds, cardKind ? anchorFor(fitBounds) : anchor, target);
  for (const part of parts) {
    part.positions = applyFit(part.positions, fit);
    part.normals = fitNormals(part.normals, fit);
  }
  if (target.kind === 'rock') {
    parts[0].uvs = remapUvsToAtlasCell(parts[0].uvs, rocks.indexOf(target), rockAtlas.layout, 0);
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
  const reliefOpts = RELIEF_KINDS[target.kind];
  if (reliefOpts && target.kind === 'rock' && !rockAtlas.relief) {
    rockAtlas.relief = await reliefFor(rockAtlas.atlas, reliefOpts);
  }
  const relief = !reliefOpts
    ? null
    : target.kind === 'rock'
      ? rockAtlas.relief
      : await reliefFor(webp, reliefOpts);
  const written =
    target.kind === 'rock'
      ? await writeModel(target, parts, rockAtlas.atlas, 'Fable_Rocks', null, relief)
      : await writeModel(target, parts, webp, `Fable_${target.name}`, leafAtlas, relief);
  const { bytes, ...pins } = written;
  report.push({
    name: target.name,
    scale: fit.scale.map((v) => +v.toFixed(4)),
    parts: parts.map((p) => `${p.material}:${p.indices.length / 3}`).join(' '),
    cards: cardReport.join(' '),
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
