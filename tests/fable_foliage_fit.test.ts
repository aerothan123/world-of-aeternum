// The storybook foliage fit (scripts/assets/fit_fable_foliage.mjs): the pure
// split and fit core on built inputs, and the contract every shipped file it
// wrote keeps with the renderer (material names, the sculptor opt-out extra,
// one shared rock sheet) and with the sim's colliders (old height, sink and
// trunk position).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Document, Logger, NodeIO, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyFit,
  applyLeafGrade,
  atlasLayout,
  BARK_ALBEDO_TARGETS,
  BARK_GRADE_GAIN,
  BROADLEAF_TRUNK_TOP,
  classifyFableTriangles,
  coniferLabels,
  DEAD_HEIGHT_SCALE,
  FABLE_FOLIAGE_TARGETS,
  FABLE_KIND_MATERIALS,
  fitNormals,
  fitTransform,
  indexedBounds,
  LEAF_ALBEDO_TARGETS,
  LEAF_GRADE_GAIN,
  leafGradeGains,
  rasterizeUvMask,
  remapUvsToAtlasCell,
  removeSmallIslands,
  sampleTexel,
  srgbToLab,
  subtractMask,
  TREE_SPREAD_CAP,
  treeAnchor,
  triangleAdjacency,
  triangleGeometry,
  trunkAnchor,
  trunkCoreLabels,
} from '../scripts/assets/fable_foliage_fit_core.mjs';
import { sculptFoliageTreeGeometry } from '../src/render/foliage_tree_sculpt';

const ROOT = path.join(__dirname, '..');

/** A 2x1 texture: left half bark brown, right half leaf green. */
const IMAGE = {
  data: Uint8Array.from([110, 70, 40, 90, 150, 40]),
  width: 2,
  height: 1,
  channels: 3,
};
const BARK_U = 0.25;
const LEAF_U = 0.75;

/** Mesh builder: quads on a grid, each quad's two triangles share one uv. */
function meshBuilder() {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertex = (x: number, y: number, z: number, u: number) => {
    positions.push(x, y, z);
    uvs.push(u, 0.5);
    return positions.length / 3 - 1;
  };
  /** A vertical cylinder of quads between y0 and y1 (welded rings). */
  const cylinder = (
    r: number,
    y0: number,
    y1: number,
    rows: number,
    u: (row: number, seg: number) => number,
  ) => {
    const seg = 8;
    const ring: number[][] = [];
    for (let row = 0; row <= rows; row++) {
      const y = y0 + ((y1 - y0) * row) / rows;
      const ids: number[] = [];
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        ids.push(vertex(Math.cos(a) * r, y, Math.sin(a) * r, u(Math.min(row, rows - 1), s)));
      }
      ring.push(ids);
    }
    for (let row = 0; row < rows; row++) {
      for (let s = 0; s < seg; s++) {
        const a = ring[row][s];
        const b = ring[row][(s + 1) % seg];
        const c = ring[row + 1][s];
        const d = ring[row + 1][(s + 1) % seg];
        indices.push(a, b, c, b, d, c);
      }
    }
  };
  return { positions, uvs, indices, cylinder };
}

describe('fable foliage fit core', () => {
  it('converts sRGB to CIELAB at the anchors', () => {
    const [Lw, aw, bw] = srgbToLab(255, 255, 255);
    expect(Lw).toBeCloseTo(100, 1);
    expect(Math.abs(aw)).toBeLessThan(0.5);
    expect(Math.abs(bw)).toBeLessThan(0.5);
    expect(srgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 5);
    // a leaf green has a negative a*, a bark brown a positive one
    expect(srgbToLab(90, 150, 40)[1]).toBeLessThan(0);
    expect(srgbToLab(110, 70, 40)[1]).toBeGreaterThan(0);
  });

  it('splits a broadleaf by texture colour and sweeps the crown speckle', () => {
    const m = meshBuilder();
    // trunk 0..3 brown, crown 3..10 green, with one brown speck in the crown
    m.cylinder(0.3, 0, 3, 6, () => BARK_U);
    m.cylinder(2, 3, 10, 14, (row, seg) => (row === 7 && seg === 3 ? BARK_U : LEAF_U));
    const { labels } = classifyFableTriangles('broadleaf', {
      indices: m.indices,
      positions: m.positions,
      uvs: m.uvs,
      image: IMAGE,
    });
    const trunkTris = 6 * 8 * 2;
    expect(Array.from(labels.slice(0, trunkTris)).every((l) => l === 0)).toBe(true);
    // the brown speck is a small island inside the leaves: it reads as leaf
    expect(Array.from(labels.slice(trunkTris)).every((l) => l === 1)).toBe(true);
  });

  it('finds a conifer trunk by geometry whatever its colour', () => {
    const m = meshBuilder();
    // an amber pine: trunk and needles share one colour
    m.cylinder(0.25, 0, 10, 40, () => LEAF_U);
    m.cylinder(2.5, 2, 8, 12, () => LEAF_U);
    const geometry = triangleGeometry(m.indices, m.positions);
    const bounds = indexedBounds(m.indices, m.positions);
    const { labels, radius } = coniferLabels(geometry, bounds);
    expect(radius).toBeGreaterThan(0.25);
    expect(radius).toBeLessThan(2.5);
    const trunkTris = 40 * 8 * 2;
    for (let t = 0; t < trunkTris; t++) {
      const yN = geometry.centroids[t * 3 + 1] / 10;
      // the apex cut falls on the 24 height slices the trunk is tracked over
      const slice = (Math.floor(yN * 24) + 0.5) / 24;
      expect(labels[t], `trunk tri at ${yN.toFixed(2)}`).toBe(slice > 0.85 ? 1 : 0);
    }
    expect(Array.from(labels.slice(trunkTris)).every((l) => l === 1)).toBe(true);
  });

  it('keeps a curved broadleaf trunk in the bark whatever its colour', () => {
    const m = meshBuilder();
    // a storybook oak: the trunk below the crown is painted the leaves'
    // olive (only its root band reads brown) and bends well off its base
    m.cylinder(0.3, 0, 5, 20, (row) => (row < 2 ? BARK_U : LEAF_U));
    const trunkVerts = m.positions.length / 3;
    m.cylinder(2.2, 4.5, 10, 14, () => LEAF_U);
    const positions = m.positions.map((v, i) => {
      const vertex = Math.floor(i / 3);
      if (i % 3 !== 0 || vertex >= trunkVerts) return v;
      const y = m.positions[vertex * 3 + 1];
      return v + 0.06 * y * y; // up to 1.5 off axis at the crown base
    });
    const src = { indices: m.indices, positions, uvs: m.uvs, image: IMAGE };
    const { labels } = classifyFableTriangles('broadleaf', src);
    const geometry = triangleGeometry(m.indices, positions);
    const bounds = indexedBounds(m.indices, positions);
    const height = bounds.max[1] - bounds.min[1];
    const trunkTris = 20 * 8 * 2;
    for (let t = 0; t < trunkTris; t++) {
      const yN = (geometry.centroids[t * 3 + 1] - bounds.min[1]) / height;
      // the core is tracked over 24 height slices up to the trunk top
      const slice = (Math.floor(yN * 24) + 0.5) / 24;
      if (slice <= BROADLEAF_TRUNK_TOP) expect(labels[t], `trunk tri at ${yN.toFixed(2)}`).toBe(0);
    }
    // the crown stays leaf
    const crown = Array.from(labels.slice(trunkTris));
    expect(crown.filter((l) => l === 1).length / crown.length).toBeGreaterThan(0.95);
    // the geometric core alone agrees on the bent trunk
    const { labels: core } = trunkCoreLabels(geometry, bounds, BROADLEAF_TRUNK_TOP);
    expect(core[trunkTris - 1]).toBe(1);
    expect(core[trunkTris / 4]).toBe(0);
  });

  it('keeps the classification deterministic', () => {
    const m = meshBuilder();
    m.cylinder(0.3, 0, 3, 6, () => BARK_U);
    m.cylinder(2, 3, 10, 14, () => LEAF_U);
    const src = { indices: m.indices, positions: m.positions, uvs: m.uvs, image: IMAGE };
    expect(Array.from(classifyFableTriangles('broadleaf', src).labels)).toEqual(
      Array.from(classifyFableTriangles('broadleaf', src).labels),
    );
  });

  it('relabels a small island to the label it borders, unless kept', () => {
    const m = meshBuilder();
    m.cylinder(1, 0, 10, 10, () => LEAF_U);
    const geometry = triangleGeometry(m.indices, m.positions);
    const adjacency = triangleAdjacency(m.indices, m.positions);
    const labels = new Int8Array(geometry.areas.length).fill(1);
    labels[50] = 0;
    labels[51] = 0;
    expect(Array.from(removeSmallIslands(adjacency, labels, geometry.areas, 1))).toEqual(
      new Array(labels.length).fill(1),
    );
    const kept = removeSmallIslands(adjacency, labels, geometry.areas, 1, (l) => l === 0);
    expect([kept[50], kept[51]]).toEqual([0, 0]);
  });

  it('anchors on the trunk band, and on the band centroid when no bark reaches it', () => {
    const m = meshBuilder();
    m.cylinder(0.3, 0, 10, 20, () => BARK_U);
    const bounds = indexedBounds(m.indices, m.positions);
    const tris = m.indices.length / 3;
    const shifted = m.positions.map((v, i) => (i % 3 === 0 ? v + 1.5 : v));
    const all = new Uint8Array(tris).fill(1);
    const anchor = trunkAnchor(m.indices, shifted, all, indexedBounds(m.indices, shifted));
    expect(anchor?.x).toBeCloseTo(1.5, 5);
    expect(anchor?.z).toBeCloseTo(0, 5);
    const none = new Uint8Array(tris);
    expect(trunkAnchor(m.indices, m.positions, none, bounds)).toBeNull();
    const fallback = treeAnchor(m.indices, shifted, none, indexedBounds(m.indices, shifted));
    expect(fallback.x).toBeCloseTo(1.5, 5);
  });

  it('lands the height, sink and anchor on the target', () => {
    const bounds = { min: [-1, 0, -2], max: [3, 5, 2] };
    const fit = fitTransform(bounds, { x: 1, z: 0.5 }, { height: 10, minY: -0.25, x: 0, z: 0 });
    expect(fit.scale).toEqual([2, 2, 2]);
    const out = applyFit([1, 0, 0.5, 1, 5, 0.5], fit);
    expect(Array.from(out)).toEqual([0, -0.25, 0, 0, 9.75, 0]);
  });

  it('narrows a tree crown that would spread past the cap, and only then', () => {
    const bounds = { min: [-4, 0, -4], max: [4, 7, 4] };
    const wide = fitTransform(
      bounds,
      { x: 0, z: 0 },
      { height: 7, minY: 0, x: 0, z: 0, oldFootprint: [4, 4] },
    );
    expect(wide.scale[1]).toBe(1);
    expect(wide.scale[0]).toBeCloseTo((TREE_SPREAD_CAP * 4) / 8, 10);
    expect(wide.scale[2]).toBe(wide.scale[0]);
    const narrow = fitTransform(
      bounds,
      { x: 0, z: 0 },
      { height: 7, minY: 0, x: 0, z: 0, oldFootprint: [8, 8] },
    );
    expect(narrow.scale).toEqual([1, 1, 1]);
  });

  it('fits a rock footprint with one horizontal scale and corrects its normals', () => {
    const bounds = { min: [0, 0, 0], max: [2, 1, 2] };
    const fit = fitTransform(
      bounds,
      { x: 1, z: 1 },
      { height: 2, minY: 0, x: 0, z: 0, footprint: [6, 6] },
    );
    expect(fit.scale).toEqual([3, 2, 3]);
    const n = fitNormals([0, 1, 0, Math.SQRT1_2, Math.SQRT1_2, 0], fit);
    expect(Array.from(n.slice(0, 3))).toEqual([0, 1, 0]);
    // a 45 degree slope squashed vertically against a wider footprint tips up
    expect(n[4]).toBeGreaterThan(n[3]);
    expect(Math.hypot(n[3], n[4], n[5])).toBeCloseTo(1, 6);
  });

  it('grades only the leaf uv footprint onto the kit leaf albedo', () => {
    // two triangles: the left half of a 4x2 image is leaf, the right half bark
    const indices = [0, 1, 2, 3, 4, 5];
    const uvs = [0, 0, 0.5, 0, 0, 1, 0.5, 0, 1, 0, 1, 1];
    const mask = rasterizeUvMask(indices, uvs, [1, 0], 4, 2, 0);
    // texel centres on the hypotenuse count (a small edge tolerance)
    expect(Array.from(mask)).toEqual([1, 1, 0, 0, 1, 0, 0, 0]);
    const image = {
      data: Uint8Array.from(new Array(8).fill([200, 190, 60]).flat()),
      width: 4,
      height: 2,
      channels: 3,
    };
    const target = LEAF_ALBEDO_TARGETS.broadleaf;
    const gains = leafGradeGains(image, mask, target);
    const graded = applyLeafGrade(image, mask, gains);
    // the leaf texels turn green, the bark texels keep their colour
    expect(graded.data[1]).toBeGreaterThan(graded.data[0]);
    expect(Array.from(graded.data.slice(6, 9))).toEqual([200, 190, 60]);
    for (const g of gains) {
      expect(g).toBeGreaterThanOrEqual(LEAF_GRADE_GAIN[0]);
      expect(g).toBeLessThanOrEqual(LEAF_GRADE_GAIN[1]);
    }
  });

  it('grades a shared texel as bark, never as leaf', () => {
    // a pine's tier undersides sample the trunk's texels: the bark footprint
    // takes the bark grade and leaves the leaf footprint
    const leaf = Uint8Array.from([1, 1, 1, 0]);
    const bark = Uint8Array.from([0, 1, 0, 1]);
    const leafOnly = subtractMask(leaf, bark);
    expect(Array.from(leafOnly)).toEqual([1, 0, 1, 0]);
    const image = {
      data: Uint8Array.from([90, 80, 20, 90, 80, 20, 90, 80, 20, 90, 80, 20]),
      width: 4,
      height: 1,
      channels: 3,
    };
    const barked = applyLeafGrade(
      image,
      bark,
      leafGradeGains(image, bark, BARK_ALBEDO_TARGETS.broadleaf, BARK_GRADE_GAIN),
    );
    const graded = applyLeafGrade(
      barked,
      leafOnly,
      leafGradeGains(barked, leafOnly, LEAF_ALBEDO_TARGETS.broadleaf),
    );
    const px = (i: number) => Array.from(graded.data.slice(i * 3, i * 3 + 3));
    for (const i of [1, 3]) expect(px(i)[0], `bark texel ${i}`).toBeGreaterThan(px(i)[1]);
    for (const i of [0, 2]) expect(px(i)[1], `leaf texel ${i}`).toBeGreaterThan(px(i)[0]);
  });

  it('remaps uvs into an atlas cell', () => {
    const layout = atlasLayout(3);
    expect(layout).toEqual({ cols: 2, rows: 2 });
    expect(Array.from(remapUvsToAtlasCell([0, 0, 0.5, 0.5, 1.25, 0.5], 2, layout))).toEqual([
      0, 0.5, 0.25, 0.75, 0.125, 0.75,
    ]);
  });
});

interface Shipped {
  doc: Document;
  prims: { prim: Primitive; positions: Float32Array; indices: Uint32Array; uvs: Float32Array }[];
}

describe('fable foliage shipped models', () => {
  let io: NodeIO;
  const shipped = new Map<string, Shipped>();

  beforeAll(async () => {
    await MeshoptDecoder.ready;
    io = new NodeIO()
      .setLogger(new Logger(Logger.Verbosity.WARN))
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    for (const target of FABLE_FOLIAGE_TARGETS) {
      const doc = await io.read(path.join(ROOT, 'public/models/foliage', `${target.name}.glb`));
      const prims: Shipped['prims'] = [];
      for (const node of doc.getRoot().listNodes()) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const e = node.getWorldMatrix();
        for (const prim of mesh.listPrimitives()) {
          const pos = prim.getAttribute('POSITION');
          if (!pos) throw new Error('no POSITION');
          const positions = new Float32Array(pos.getCount() * 3);
          const v = [0, 0, 0];
          for (let i = 0; i < pos.getCount(); i++) {
            pos.getElement(i, v);
            positions[i * 3] = e[0] * v[0] + e[4] * v[1] + e[8] * v[2] + e[12];
            positions[i * 3 + 1] = e[1] * v[0] + e[5] * v[1] + e[9] * v[2] + e[13];
            positions[i * 3 + 2] = e[2] * v[0] + e[6] * v[1] + e[10] * v[2] + e[14];
          }
          const indices = Uint32Array.from(prim.getIndices()?.getArray() ?? []);
          const uv = prim.getAttribute('TEXCOORD_0');
          const uvs = new Float32Array((uv?.getCount() ?? 0) * 2);
          for (let i = 0; i < (uv?.getCount() ?? 0); i++) {
            uv?.getElement(i, v);
            uvs[i * 2] = v[0];
            uvs[i * 2 + 1] = v[1];
          }
          prims.push({ prim, positions, indices, uvs });
        }
      }
      shipped.set(target.name, { doc, prims });
    }
  });

  it('covers every replaced model and nothing the fit leaves alone', () => {
    expect(FABLE_FOLIAGE_TARGETS.map((t) => t.name).sort()).toEqual(
      [
        ...[1, 2, 3, 4, 5].flatMap((i) => [`oak_${i}`, `pine_${i}`]),
        ...[1, 2, 3].flatMap((i) => [`dead_${i}`, `rock_${i}`]),
        'bush',
        'bush_flowers',
        'mushroom',
      ].sort(),
    );
  });

  for (const target of FABLE_FOLIAGE_TARGETS) {
    it(`ships ${target.name} on the renderer's names and the old model's fit`, () => {
      const { prims, doc } = shipped.get(target.name) as Shipped;
      const m = FABLE_KIND_MATERIALS[target.kind];
      const expected = [m.bark, m.leaf, m.flower, m.whole].filter(Boolean);
      expect(prims.map(({ prim }) => prim.getMaterial()?.getName()).sort()).toEqual(
        expected.sort(),
      );
      let triangles = 0;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const { prim, positions, indices } of prims) {
        // the sculptor opt-out travels on every primitive
        expect(prim.getExtras()).toEqual({ fableFoliage: true });
        expect(prim.getMaterial()?.getBaseColorTexture()?.getMimeType()).toBe('image/webp');
        triangles += indices.length / 3;
        const b = indexedBounds(indices, positions);
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], b.min[k]);
          max[k] = Math.max(max[k], b.max[k]);
        }
      }
      expect(triangles).toBeLessThanOrEqual(Math.ceil(target.budget * 1.1));
      expect(max[1] - min[1]).toBeCloseTo(target.height, 2);
      expect(min[1]).toBeCloseTo(target.minY, 2);
      // one baked sheet, shared by every part of the file
      expect(doc.getRoot().listTextures()).toHaveLength(1);
      if (target.kind === 'broadleaf' || target.kind === 'conifer' || target.kind === 'dead') {
        const bark = prims.find(({ prim }) => prim.getMaterial()?.getName() === m.bark);
        if (!bark) throw new Error('no bark primitive');
        const all = new Uint8Array(bark.indices.length / 3).fill(1);
        const anchor = trunkAnchor(bark.indices, bark.positions, all, { min, max });
        // a conifer whose crown skirts the ground hides its trunk above the
        // band (the fit anchored on the whole band instead); a trunk that
        // reaches the band must stand on the target
        if (target.kind !== 'conifer') expect(anchor).not.toBeNull();
        if (anchor) {
          expect(Math.abs(anchor.x - target.x)).toBeLessThan(0.05);
          expect(Math.abs(anchor.z - target.z)).toBeLessThan(0.05);
        }
      } else {
        expect((min[0] + max[0]) / 2).toBeCloseTo(target.x, 2);
        expect((min[2] + max[2]) / 2).toBeCloseTo(target.z, 2);
      }
      if (target.oldFootprint) {
        const spread = (max[0] - min[0] + max[2] - min[2]) / 2;
        const old = (target.oldFootprint[0] + target.oldFootprint[1]) / 2;
        expect(spread).toBeLessThanOrEqual(old * (target.spreadCap ?? TREE_SPREAD_CAP) + 0.01);
      }
      if (target.footprint) {
        expect((max[0] - min[0] + max[2] - min[2]) / 2).toBeCloseTo(
          (target.footprint[0] + target.footprint[1]) / 2,
          2,
        );
      }
    });
  }

  /** One shipped model as a single soup, with each triangle's material. */
  const soup = (name: string) => {
    const { prims } = shipped.get(name) as Shipped;
    const positions: number[] = [];
    const indices: number[] = [];
    const material: string[] = [];
    for (const { prim, positions: p, indices: idx } of prims) {
      const base = positions.length / 3;
      positions.push(...p);
      for (const i of idx) indices.push(base + i);
      for (let t = 0; t < idx.length / 3; t++) material.push(prim.getMaterial()?.getName() ?? '');
    }
    return { positions, indices, material };
  };

  /** Area-weighted mean sRGB of a primitive's triangles on its sheet. */
  const meanColour = async (name: string, materialName: string) => {
    const { prims, doc } = shipped.get(name) as Shipped;
    const image = doc.getRoot().listTextures()[0].getImage();
    if (!image) throw new Error(`${name} has no sheet`);
    const { data, info } = await sharp(Buffer.from(image))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const sheet = { data, width: info.width, height: info.height, channels: info.channels };
    const part = prims.find(({ prim }) => prim.getMaterial()?.getName() === materialName);
    if (!part) throw new Error(`${name} has no ${materialName}`);
    const { areas } = triangleGeometry(part.indices, part.positions);
    const sum = [0, 0, 0];
    let w = 0;
    for (let t = 0; t < areas.length; t++) {
      let u = 0;
      let v = 0;
      for (let k = 0; k < 3; k++) {
        u += part.uvs[part.indices[t * 3 + k] * 2] / 3;
        v += part.uvs[part.indices[t * 3 + k] * 2 + 1] / 3;
      }
      const c = sampleTexel(sheet, u, v);
      for (let k = 0; k < 3; k++) sum[k] += c[k] * areas[t];
      w += areas[t];
    }
    return sum.map((x) => x / w);
  };

  for (const target of FABLE_FOLIAGE_TARGETS.filter(
    (t) => t.kind === 'broadleaf' || t.kind === 'conifer',
  )) {
    it(`keeps ${target.name}'s trunk core in the bark, drawn bark brown`, async () => {
      const bark = FABLE_KIND_MATERIALS[target.kind].bark as string;
      const { positions, indices, material } = soup(target.name);
      const geometry = triangleGeometry(indices, positions);
      const bounds = indexedBounds(indices, positions);
      const top = target.kind === 'broadleaf' ? BROADLEAF_TRUNK_TOP : 0.85;
      const { labels } = trunkCoreLabels(geometry, bounds, top);
      let core = 0;
      let inBark = 0;
      for (let t = 0; t < labels.length; t++) {
        if (labels[t] !== 0) continue;
        core += geometry.areas[t];
        if (material[t] === bark) inBark += geometry.areas[t];
      }
      expect(core).toBeGreaterThan(0);
      expect(inBark / core).toBeGreaterThan(0.97);
      // a trunk sheet reads brown, not leaf green: red leads green and blue
      const [r, g, b] = await meanColour(target.name, bark);
      expect(r, `${target.name} bark rgb ${[r, g, b].map(Math.round)}`).toBeGreaterThan(g * 1.2);
      expect(r).toBeGreaterThan(b * 1.5);
    });
  }

  it('grades the bushes onto the dark kit green, not a yellow', async () => {
    for (const [name, leaf] of [
      ['bush', 'Leaves_TwistedTree'],
      ['bush_flowers', 'Leaves_NormalTree'],
    ]) {
      const [r, g] = await meanColour(name, leaf);
      expect(g, `${name} leaf rgb`).toBeGreaterThan(r * 1.2);
    }
  });

  it('stands the dead trees under the old snags and inside their spread', () => {
    for (const target of FABLE_FOLIAGE_TARGETS.filter((t) => t.kind === 'dead')) {
      expect(target.height).toBeCloseTo((target.oldHeight ?? 0) * DEAD_HEIGHT_SCALE, 2);
      expect(target.spreadCap).toBe(1);
    }
  });

  it('keeps the whole Tripo source on every model but the rocks', () => {
    for (const target of FABLE_FOLIAGE_TARGETS) {
      const triangles = (shipped.get(target.name) as Shipped).prims.reduce(
        (n, p) => n + p.indices.length / 3,
        0,
      );
      // the old kit counts these replaced: the storybook set is denser
      expect(triangles, target.name).toBeGreaterThan(target.kind === 'rock' ? 1500 : 3000);
    }
  });

  it('bakes an opaque sheet, so the leaf alpha test never punches holes', async () => {
    for (const target of FABLE_FOLIAGE_TARGETS) {
      const texture = (shipped.get(target.name) as Shipped).doc.getRoot().listTextures()[0];
      const image = texture.getImage();
      if (!image) throw new Error(`${target.name} has no image`);
      const stats = await sharp(Buffer.from(image)).stats();
      expect(stats.channels.length === 3 || stats.channels[3].min === 255, target.name).toBe(true);
    }
  });

  it('gives each tree its own sheet name and the three rocks one shared sheet', () => {
    const sheet = (name: string) => {
      const t = (shipped.get(name) as Shipped).doc.getRoot().listTextures()[0];
      return { name: t.getName(), bytes: Buffer.from(t.getImage() ?? []) };
    };
    const trees = FABLE_FOLIAGE_TARGETS.filter((t) => t.kind !== 'rock').map(
      (t) => sheet(t.name).name,
    );
    expect(new Set(trees).size).toBe(trees.length);
    const rocks = ['rock_1', 'rock_2', 'rock_3'].map(sheet);
    expect(new Set(rocks.map((r) => r.name))).toEqual(new Set(['Fable_Rocks']));
    expect(rocks[1].bytes.equals(rocks[0].bytes)).toBe(true);
    expect(rocks[2].bytes.equals(rocks[0].bytes)).toBe(true);
  });

  it('keys the foliage material cache on the map name and carries the geometry extras', () => {
    const src = readFileSync(path.join(ROOT, 'src/render/foliage.ts'), 'utf8');
    expect(src).toContain(
      "const key = `${role}:${src.name}:${(src as THREE.MeshStandardMaterial).map?.name ?? ''}`;",
    );
    expect(src).toContain(
      'const out = Object.assign(new THREE.BufferGeometry(), { userData: { ...src.userData } });',
    );
  });

  it('draws an authored model as shipped instead of re-sculpting it', () => {
    for (const [url, name] of [
      ['/models/foliage/oak_1.glb', 'Leaves_NormalTree'],
      ['/models/foliage/oak_2.glb', 'Bark_NormalTree'],
      ['/models/foliage/pine_1.glb', 'Leaves_Pine'],
    ]) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.userData = { fableFoliage: true };
      const before = geo.getAttribute('position').array.slice();
      const out = sculptFoliageTreeGeometry(url, name, geo, true);
      expect(out, `${url} ${name}`).toBe(geo);
      expect(Array.from(out.getAttribute('position').array)).toEqual(Array.from(before));
      expect(out.getAttribute('color')).toBeUndefined();
    }
  });
});
