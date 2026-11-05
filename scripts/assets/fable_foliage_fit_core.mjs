// Pure core of the Fable foliage fit (scripts/assets/fit_fable_foliage.mjs).
//
// The storybook foliage replacements under assets_src/fable_foliage/ are
// single-mesh Tripo props: one material, one baked texture. The world foliage
// renderer (src/render/foliage.ts) keys its render policy on MATERIAL NAMES
// (leaves sway, take the biome leaf tint and drive the canopy pivot; bark does
// not), and the sim's trunk and rock colliders were fitted to the old models.
// So each source is split into a bark and a leaf part by the colour of the
// baked texture under each triangle, and fitted onto the old model's height,
// sink and trunk position.
//
// The split: every triangle gets the mean CIELAB colour of four texture taps
// across its face. Seed triangles that can only be one part (the trunk band
// near the axis low on a tree, the crown top; for blossoms, petal-pink and
// leaf-green texels) fit one diagonal Gaussian per part, every triangle takes
// the likelier part, and a few rounds of an area-weighted majority vote over
// shared edges plus a small-island sweep remove the speckle a texture-only
// verdict leaves on a fragmented Tripo atlas.
//
// No IO, no clock, no randomness: the same inputs give the same labels.

/** Material names the renderer's MAT_POLICY keys on, per source kind. */
export const FABLE_KIND_MATERIALS = Object.freeze({
  broadleaf: Object.freeze({ bark: 'Bark_NormalTree', leaf: 'Leaves_NormalTree' }),
  conifer: Object.freeze({ bark: 'Bark_NormalTree', leaf: 'Leaves_Pine' }),
  // The snags' twig cards (fable_leaf_cards_core.mjs) wear the kit's
  // twisted-tree leaf name: a leaf policy (alpha cut, double sided) that no
  // storybook tree's crown uses, so the renderer's per-(role, name, map)
  // material cache gives the twigs a material of their own.
  dead: Object.freeze({ bark: 'Bark_DeadTree', twig: 'Leaves_TwistedTree' }),
  // The bushes keep the leaf names their old models wore: `Leaves` is the
  // fern's name, and dressing materials are shared per (role, name), so a
  // bush named `Leaves` would draw with the fern's texture (or the fern
  // with the bush's) on a tier without impostors.
  bush: Object.freeze({ leaf: 'Leaves_TwistedTree' }),
  flowering_bush: Object.freeze({ leaf: 'Leaves_NormalTree', flower: 'Flowers' }),
  mushroom: Object.freeze({ whole: 'Mushrooms' }),
  rock: Object.freeze({ whole: 'Rocks' }),
});

/** Kinds whose source is split into parts (the rest ship as one primitive). */
export const SPLIT_KINDS = Object.freeze(['broadleaf', 'conifer', 'flowering_bush']);

// Old-model measurements (re-measured from the shipped files this fit
// replaced): height, minimum y (the sink below the ground), and the x/z the
// fit anchors on. For trees the anchor is the trunk base (the bbox centre of
// the lowest bark band), which is where the sim's trunk collider stands
// (src/sim/decoration_collider.ts, centred on the decoration); for the rest
// it is the bounds centre. `budget` caps the output triangle count: every
// tree, bush and the mushroom keep their whole Tripo source (no source is
// past FULL_SOURCE), well above the old kit counts, because a near tree or
// bush is where the detail is seen and the far field is carried by the
// bark-decimated `_field` copies and the baked sprites; the rocks, the
// densest scatter out to the farthest real-model radius, keep a capped
// budget. A rock also keeps the old footprint (`footprint`: width, depth):
// the renderer scales a rock to its sim height (src/sim/decoration_dims.ts)
// and the collider radius follows the old proportions, so a narrower stone
// would stand inside an invisible wall. A tree or bush keeps its old
// footprint as `oldFootprint` and may spread at most `spreadCap` (default
// `TREE_SPREAD_CAP`) times wider: the storybook crowns are broad, and the
// field's spacing, the town dressing and the camera's tree fade were all
// laid out around the old ones, so an uncapped crown fills the chase camera
// in a dense wood; past the cap the model narrows (x/z only). The bushes are
// dressing with no camera fade at all, so they keep the old spread exactly.
// The dead trees stand at `DEAD_HEIGHT_SCALE` of the old height inside the
// old spread: the old snags were thin poles whose bounds were mostly
// branches, and the storybook snags are thick gnarled trunks, so at the old
// height they read as far bulkier and taller than the trees they replace.
const T = (name, kind, height, minY, x, z, budget, extra = {}) =>
  Object.freeze({ name, kind, height, minY, x, z, budget, ...extra });

/** Triangle budget that keeps a whole Tripo source (every one is under it). */
export const FULL_SOURCE = 4400;
/** Triangle budget of a rock: the densest scatter, so a capped one, but
 *  rich enough that a near boulder's silhouette stops reading as facets
 *  (its own baked normal map, with the painted relief over it, carries the
 *  surface). */
export const ROCK_BUDGET = 4200;
/** Height of a fitted dead tree as a fraction of the old snag's. */
export const DEAD_HEIGHT_SCALE = 0.8;
const dead = (name, oldHeight, x, z, oldFootprint) =>
  T(name, 'dead', +(oldHeight * DEAD_HEIGHT_SCALE).toFixed(3), -0.336, x, z, FULL_SOURCE, {
    oldHeight,
    oldFootprint,
    spreadCap: 1,
  });

export const FABLE_FOLIAGE_TARGETS = Object.freeze([
  T('oak_1', 'broadleaf', 7.265, -0.243, 0, 0, FULL_SOURCE, { oldFootprint: [4.311, 4.577] }),
  T('oak_2', 'broadleaf', 7.643, -0.243, 0, 0, FULL_SOURCE, { oldFootprint: [4.464, 4.276] }),
  T('oak_3', 'broadleaf', 9.425, -0.243, 0, 0, FULL_SOURCE, { oldFootprint: [4.063, 4.241] }),
  T('oak_4', 'broadleaf', 9.438, -0.243, 0, -0.063, FULL_SOURCE, { oldFootprint: [3.826, 3.755] }),
  T('oak_5', 'broadleaf', 7.006, -0.243, 0, 0, FULL_SOURCE, { oldFootprint: [3.671, 4.22] }),
  T('pine_1', 'conifer', 7.317, -0.235, 0.002, -0.001, FULL_SOURCE, {
    oldFootprint: [4.944, 4.539],
  }),
  T('pine_2', 'conifer', 7.376, -0.235, 0.002, -0.001, FULL_SOURCE, {
    oldFootprint: [5.728, 5.221],
  }),
  T('pine_3', 'conifer', 7.392, -0.235, 0.002, -0.001, FULL_SOURCE, {
    oldFootprint: [3.612, 3.996],
  }),
  T('pine_4', 'conifer', 10.236, -0.235, 0, 0, FULL_SOURCE, { oldFootprint: [5.803, 5.371] }),
  T('pine_5', 'conifer', 8.724, -0.235, 0.003, 0, FULL_SOURCE, { oldFootprint: [6.42, 6.222] }),
  dead('dead_1', 9.495, 0.051, 0, [6.149, 5.749]),
  dead('dead_2', 11.488, 0.05, 0, [6.729, 6.379]),
  dead('dead_3', 13.28, 0.055, 0.012, [6.388, 6.43]),
  T('bush', 'bush', 1.572, -0.235, 0.038, -0.022, FULL_SOURCE, {
    oldFootprint: [1.69, 1.7],
    spreadCap: 1,
  }),
  T('bush_flowers', 'flowering_bush', 1.572, -0.235, 0.083, 0.028, FULL_SOURCE, {
    oldFootprint: [1.78, 1.9],
    spreadCap: 1,
  }),
  T('mushroom', 'mushroom', 0.464, -0.017, -0.052, -0.056, FULL_SOURCE),
  T('rock_1', 'rock', 2.26, -0.271, -0.115, 0.345, ROCK_BUDGET, { footprint: [3.225, 2.989] }),
  T('rock_2', 'rock', 1.899, -0.051, -0.189, 0.08, ROCK_BUDGET, { footprint: [3.049, 2.479] }),
  T('rock_3', 'rock', 2.316, -0.316, -0.114, 0.848, ROCK_BUDGET, { footprint: [3.42, 3.476] }),
]);

/** How much wider than the old model a fitted tree crown may spread. */
export const TREE_SPREAD_CAP = 1.5;

/** Height band (fraction of the model height above its base) the trunk
 *  anchor is read from: above the Tripo ground mound, below the crown. */
export const TRUNK_ANCHOR_BAND = Object.freeze([0.04, 0.12]);

// ---------------------------------------------------------------------------
// colour

const srgbToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** sRGB bytes to CIELAB (D65). */
export function srgbToLab(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Hue (degrees), saturation and value of sRGB bytes. */
export function srgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx / 255];
}

/** Nearest texel of an RGBA/RGB image at glTF uv (v down from the top), wrapped. */
export function sampleTexel(image, u, v) {
  const { data, width, height, channels } = image;
  const wrap = (t) => t - Math.floor(t);
  const x = Math.min(width - 1, Math.floor(wrap(u) * width));
  const y = Math.min(height - 1, Math.floor(wrap(v) * height));
  const o = (y * width + x) * channels;
  return [data[o], data[o + 1], data[o + 2]];
}

const TAPS = [
  [1 / 3, 1 / 3, 1 / 3],
  [2 / 3, 1 / 6, 1 / 6],
  [1 / 6, 2 / 3, 1 / 6],
  [1 / 6, 1 / 6, 2 / 3],
];

/** Mean sRGB and CIELAB colour of every triangle over four face taps. */
export function triangleColours(indices, uvs, image) {
  const n = indices.length / 3;
  const rgb = new Float64Array(n * 3);
  const lab = new Float64Array(n * 3);
  for (let t = 0; t < n; t++) {
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sl = 0;
    let sa = 0;
    let sbb = 0;
    for (const [wa, wb, wc] of TAPS) {
      const u = wa * uvs[a * 2] + wb * uvs[b * 2] + wc * uvs[c * 2];
      const v = wa * uvs[a * 2 + 1] + wb * uvs[b * 2 + 1] + wc * uvs[c * 2 + 1];
      const [r, g, bl] = sampleTexel(image, u, v);
      const [L, A, B] = srgbToLab(r, g, bl);
      sr += r;
      sg += g;
      sb += bl;
      sl += L;
      sa += A;
      sbb += B;
    }
    const k = TAPS.length;
    rgb.set([sr / k, sg / k, sb / k], t * 3);
    lab.set([sl / k, sa / k, sbb / k], t * 3);
  }
  return { rgb, lab };
}

// ---------------------------------------------------------------------------
// geometry

/** Per-triangle centroid and area. */
export function triangleGeometry(indices, positions) {
  const n = indices.length / 3;
  const centroids = new Float64Array(n * 3);
  const areas = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const p = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]].map((i) => [
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
    ]);
    for (let k = 0; k < 3; k++) centroids[t * 3 + k] = (p[0][k] + p[1][k] + p[2][k]) / 3;
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    areas[t] = Math.hypot(cx, cy, cz) / 2;
  }
  return { centroids, areas };
}

/** Axis-aligned bounds of the vertices `indices` references. */
export function indexedBounds(indices, positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const i of indices) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

/**
 * Triangles sharing an edge, with vertices welded by position (a UV seam
 * splits vertices but not the surface), as CSR arrays.
 */
export function triangleAdjacency(indices, positions, weldEpsilon = 1e-5) {
  const ids = new Map();
  const vertexId = new Int32Array(positions.length / 3);
  for (let i = 0; i < vertexId.length; i++) {
    const key = [0, 1, 2].map((k) => Math.round(positions[i * 3 + k] / weldEpsilon)).join(',');
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    vertexId[i] = id;
  }
  const n = indices.length / 3;
  const edges = new Map();
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const a = vertexId[indices[t * 3 + k]];
      const b = vertexId[indices[t * 3 + ((k + 1) % 3)]];
      if (a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const list = edges.get(key);
      if (list) list.push(t);
      else edges.set(key, [t]);
    }
  }
  const neighbours = Array.from({ length: n }, () => new Set());
  for (const list of edges.values()) {
    for (const a of list) for (const b of list) if (a !== b) neighbours[a].add(b);
  }
  const offsets = new Int32Array(n + 1);
  for (let t = 0; t < n; t++) offsets[t + 1] = offsets[t] + neighbours[t].size;
  const list = new Int32Array(offsets[n]);
  for (let t = 0; t < n; t++) {
    let o = offsets[t];
    for (const b of [...neighbours[t]].sort((x, y) => x - y)) list[o++] = b;
  }
  return { offsets, list };
}

// ---------------------------------------------------------------------------
// classification

/** Height fraction above which a broadleaf triangle seeds the crown. */
export const BROADLEAF_CROWN = 0.72;

/**
 * Seed labels (-1 = unseeded) for a colour-split kind. Broadleaf: class 0 (bark) is the
 * trunk band low on the model and near its axis, class 1 (leaf) is the crown
 * top. Flowering bush: class 0 (leaf) is leaf-green, class 1 (flower) is
 * petal-pink, both by hue.
 */
export function seedLabels(kind, { centroids, areas }, colours, bounds) {
  const n = areas.length;
  const seeds = new Int8Array(n).fill(-1);
  const minY = bounds.min[1];
  const height = bounds.max[1] - minY;
  if (kind === 'flowering_bush') {
    for (let t = 0; t < n; t++) {
      const [h, s, v] = srgbToHsv(
        colours.rgb[t * 3],
        colours.rgb[t * 3 + 1],
        colours.rgb[t * 3 + 2],
      );
      if ((h < 22 || h > 330) && s > 0.12 && s < 0.6 && v > 0.62) seeds[t] = 1;
      else if (h > 40 && h < 100 && s > 0.35) seeds[t] = 0;
    }
    return seeds;
  }
  // trunk axis: the area-weighted centroid of the anchor band
  const [lo, hi] = TRUNK_ANCHOR_BAND;
  let ax = 0;
  let az = 0;
  let aw = 0;
  const band = [];
  for (let t = 0; t < n; t++) {
    const yN = (centroids[t * 3 + 1] - minY) / height;
    if (yN >= lo && yN <= hi) {
      ax += centroids[t * 3] * areas[t];
      az += centroids[t * 3 + 2] * areas[t];
      aw += areas[t];
      band.push(t);
    }
  }
  ax /= aw || 1;
  az /= aw || 1;
  const radial = (t) => Math.hypot(centroids[t * 3] - ax, centroids[t * 3 + 2] - az);
  const radii = band.map(radial).sort((a, b) => a - b);
  const rMedian = radii[Math.floor(radii.length / 2)] ?? 0;
  for (const t of band) if (radial(t) <= rMedian * 1.25) seeds[t] = 0;
  for (let t = 0; t < n; t++) {
    if ((centroids[t * 3 + 1] - minY) / height >= BROADLEAF_CROWN) seeds[t] = 1;
  }
  return seeds;
}

/** Fit a diagonal Gaussian per class from labelled samples (area weighted). */
export function fitGaussians(features, dims, labels, areas, classes) {
  const out = [];
  for (let c = 0; c < classes; c++) {
    const mean = new Float64Array(dims);
    const variance = new Float64Array(dims);
    let w = 0;
    for (let t = 0; t < areas.length; t++) {
      if (labels[t] !== c) continue;
      w += areas[t];
      for (let k = 0; k < dims; k++) mean[k] += features[t * dims + k] * areas[t];
    }
    if (w === 0) throw new Error(`class ${c} has no samples`);
    for (let k = 0; k < dims; k++) mean[k] /= w;
    for (let t = 0; t < areas.length; t++) {
      if (labels[t] !== c) continue;
      for (let k = 0; k < dims; k++)
        variance[k] += (features[t * dims + k] - mean[k]) ** 2 * areas[t];
    }
    for (let k = 0; k < dims; k++) variance[k] = Math.max(variance[k] / w, 4);
    out.push({ mean, variance, weight: w });
  }
  return out;
}

/** Label every sample with its likeliest class (seeds keep their label). */
export function classifyGaussian(features, dims, gaussians, seeds) {
  const n = seeds.length;
  const labels = new Int8Array(n);
  const total = gaussians.reduce((s, g) => s + g.weight, 0);
  for (let t = 0; t < n; t++) {
    if (seeds[t] >= 0) {
      labels[t] = seeds[t];
      continue;
    }
    let best = 0;
    let bestScore = -Infinity;
    for (const [c, g] of gaussians.entries()) {
      let score = Math.log(g.weight / total);
      for (let k = 0; k < dims; k++) {
        const d = features[t * dims + k] - g.mean[k];
        score -= (0.5 * (d * d)) / g.variance[k] + 0.5 * Math.log(g.variance[k]);
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    labels[t] = best;
  }
  return labels;
}

/** Area-weighted majority vote over edge neighbours, `rounds` times. */
export function smoothLabels(adjacency, labels, areas, classes, rounds = 3) {
  let cur = Int8Array.from(labels);
  for (let r = 0; r < rounds; r++) {
    const next = Int8Array.from(cur);
    const votes = new Float64Array(classes);
    for (let t = 0; t < cur.length; t++) {
      votes.fill(0);
      votes[cur[t]] += areas[t] * 1.5;
      for (let o = adjacency.offsets[t]; o < adjacency.offsets[t + 1]; o++) {
        const b = adjacency.list[o];
        votes[cur[b]] += areas[b];
      }
      let best = cur[t];
      for (let c = 0; c < classes; c++) if (votes[c] > votes[best]) best = c;
      next[t] = best;
    }
    cur = next;
  }
  return cur;
}

/**
 * Relabel every edge-connected same-label island whose area is below
 * `minArea` to the label it borders most (by shared-neighbour area).
 */
export function removeSmallIslands(adjacency, labels, areas, minArea, keep = () => false) {
  const out = Int8Array.from(labels);
  const n = out.length;
  const island = new Int32Array(n).fill(-1);
  let id = 0;
  for (let s = 0; s < n; s++) {
    if (island[s] >= 0) continue;
    const members = [];
    const stack = [s];
    island[s] = id;
    while (stack.length) {
      const t = stack.pop();
      members.push(t);
      for (let o = adjacency.offsets[t]; o < adjacency.offsets[t + 1]; o++) {
        const b = adjacency.list[o];
        if (island[b] < 0 && out[b] === out[s]) {
          island[b] = id;
          stack.push(b);
        }
      }
    }
    id++;
    const area = members.reduce((sum, t) => sum + areas[t], 0);
    if (area >= minArea || keep(out[s])) continue;
    const border = new Map();
    for (const t of members) {
      for (let o = adjacency.offsets[t]; o < adjacency.offsets[t + 1]; o++) {
        const b = adjacency.list[o];
        if (out[b] !== out[s]) border.set(out[b], (border.get(out[b]) ?? 0) + areas[b]);
      }
    }
    let best = -1;
    let bestArea = 0;
    for (const [label, a] of [...border.entries()].sort((x, y) => x[0] - y[0])) {
      if (a > bestArea) {
        bestArea = a;
        best = label;
      }
    }
    if (best >= 0) for (const t of members) out[t] = best;
  }
  return out;
}

/** Conifer trunk core radius, as a fraction of the model height. */
export const CONIFER_TRUNK_RADIUS = Object.freeze({ min: 0.03, max: 0.11, gain: 1.35 });
/** Above this height fraction a conifer is all crown (the apex tuft). */
export const CONIFER_APEX = 0.85;
const CONIFER_SLICES = 24;

/**
 * A trunk by geometry, not colour: the core within a radius of an axis
 * tracked up the model slice by slice (trunks lean and curve), below the
 * height fraction `top`. The radius is the narrowest low slice's median
 * radius times a gain, at least the band's floor. A crown that skirts the
 * ground leaves no low slice narrow enough (the median lands past the band's
 * ceiling): the trunk is hidden, and only the floor radius is bark.
 * 0 = trunk core, 1 = the rest.
 */
export function trunkCoreLabels({ centroids, areas }, bounds, top) {
  const n = areas.length;
  const minY = bounds.min[1];
  const height = bounds.max[1] - minY;
  const slices = Array.from({ length: CONIFER_SLICES }, () => []);
  for (let t = 0; t < n; t++) {
    const yN = (centroids[t * 3 + 1] - minY) / height;
    slices[Math.min(CONIFER_SLICES - 1, Math.max(0, Math.floor(yN * CONIFER_SLICES)))].push(t);
  }
  // start axis: area-weighted centroid of the anchor band
  let ax = 0;
  let az = 0;
  let aw = 0;
  for (let t = 0; t < n; t++) {
    const yN = (centroids[t * 3 + 1] - minY) / height;
    if (yN < TRUNK_ANCHOR_BAND[0] || yN > TRUNK_ANCHOR_BAND[1]) continue;
    ax += centroids[t * 3] * areas[t];
    az += centroids[t * 3 + 2] * areas[t];
    aw += areas[t];
  }
  ax /= aw || 1;
  az /= aw || 1;
  // narrowest median radius among the low slices (above the ground mound)
  let narrowest = Infinity;
  for (let s = 1; s <= 4; s++) {
    const radii = slices[s]
      .map((t) => Math.hypot(centroids[t * 3] - ax, centroids[t * 3 + 2] - az))
      .sort((a, b) => a - b);
    if (radii.length) narrowest = Math.min(narrowest, radii[Math.floor(radii.length / 2)]);
  }
  const { min, max, gain } = CONIFER_TRUNK_RADIUS;
  const core = narrowest * gain;
  const radius = core > max * height ? min * height : Math.max(min * height, core);
  const labels = new Int8Array(n).fill(1);
  let cx = ax;
  let cz = az;
  // Each slice re-centres on the trunk it holds before taking its core (the
  // previous slice's centre is only the search start), so a curving trunk
  // is followed without a slice of lag.
  const recentre = (slice, x, z) => {
    let sx = 0;
    let sz = 0;
    let sw = 0;
    for (const t of slice) {
      if (Math.hypot(centroids[t * 3] - x, centroids[t * 3 + 2] - z) > radius * 1.5) continue;
      sx += centroids[t * 3] * areas[t];
      sz += centroids[t * 3 + 2] * areas[t];
      sw += areas[t];
    }
    return sw > 0 ? [sx / sw, sz / sw] : [x, z];
  };
  for (let s = 0; s < CONIFER_SLICES; s++) {
    if ((s + 0.5) / CONIFER_SLICES > top) break;
    [cx, cz] = recentre(slices[s], cx, cz);
    for (const t of slices[s]) {
      if (Math.hypot(centroids[t * 3] - cx, centroids[t * 3 + 2] - cz) <= radius) labels[t] = 0;
    }
  }
  return { labels, radius };
}

/**
 * A conifer's trunk: the painted tier undersides of a Tripo pine are
 * trunk-brown and an amber pine's needles are too, so the texture cannot
 * tell them apart, and the trunk is the geometric core up to the apex tuft.
 */
export function coniferLabels(geometry, bounds) {
  return trunkCoreLabels(geometry, bounds, CONIFER_APEX);
}

/**
 * Below this height fraction a broadleaf's trunk core is bark whatever its
 * colour: a storybook oak's leaves and bark share one olive-brown family, so
 * the colour split alone hands the mid trunk of a curved or leaning tree
 * (oak_4, oak_5) to the leaves, which then take the leaf grade, the leaf
 * tint and the sway, and a close trunk draws green.
 */
export const BROADLEAF_TRUNK_TOP = 0.45;

/**
 * Split a source into labels: 0 = bark (trees) or leaf (flowering bush),
 * 1 = leaf (trees) or flower. Deterministic for identical inputs.
 */
export function classifyFableTriangles(kind, { indices, positions, uvs, image }) {
  if (!SPLIT_KINDS.includes(kind)) throw new Error(`${kind} is not a split kind`);
  const geometry = triangleGeometry(indices, positions);
  const bounds = indexedBounds(indices, positions);
  let seeds;
  let labels;
  if (kind === 'conifer') {
    ({ labels } = coniferLabels(geometry, bounds));
    seeds = Int8Array.from(labels);
  } else {
    const colours = triangleColours(indices, uvs, image);
    seeds = seedLabels(kind, geometry, colours, bounds);
    const gaussians = fitGaussians(colours.lab, 3, seeds, geometry.areas, 2);
    labels = classifyGaussian(colours.lab, 3, gaussians, seeds);
  }
  const adjacency = triangleAdjacency(indices, positions);
  // A conifer's geometric split is already contiguous: voting would only
  // erode its thin trunk core.
  if (kind !== 'conifer') labels = smoothLabels(adjacency, labels, geometry.areas, 2, 3);
  const totalArea = geometry.areas.reduce((s, a) => s + a, 0);
  // Blossoms are small islands by nature, and so is a conifer's trunk core
  // hidden inside a ground-skirting crown: only the other part's speckle is
  // swept.
  const keep =
    kind === 'broadleaf' ? () => false : (label) => label === (kind === 'conifer' ? 0 : 1);
  labels = removeSmallIslands(adjacency, labels, geometry.areas, totalArea * 0.004, keep);
  if (kind === 'broadleaf') {
    const { labels: core } = trunkCoreLabels(geometry, bounds, BROADLEAF_TRUNK_TOP);
    for (let t = 0; t < core.length; t++) if (core[t] === 0) labels[t] = 0;
  }
  return { labels, seeds, bounds };
}

// ---------------------------------------------------------------------------
// fit

/**
 * x/z of the trunk base: the bounds centre of the vertices of `mask`
 * triangles inside the anchor band. Null when the band holds none.
 */
export function trunkAnchor(indices, positions, mask, bounds, band = TRUNK_ANCHOR_BAND) {
  const minY = bounds.min[1];
  const height = bounds.max[1] - minY;
  const lo = minY + band[0] * height;
  const hi = minY + band[1] * height;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let t = 0; t < indices.length / 3; t++) {
    if (!mask[t]) continue;
    for (let k = 0; k < 3; k++) {
      const i = indices[t * 3 + k];
      const y = positions[i * 3 + 1];
      if (y < lo || y > hi) continue;
      x0 = Math.min(x0, positions[i * 3]);
      x1 = Math.max(x1, positions[i * 3]);
      z0 = Math.min(z0, positions[i * 3 + 2]);
      z1 = Math.max(z1, positions[i * 3 + 2]);
    }
  }
  if (x0 > x1) return null;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
}

/**
 * x/z of a tree's trunk base: `trunkAnchor` over its bark, or, when no bark
 * reaches the band (a conifer whose crown skirts the ground hides its
 * trunk), the area-weighted centroid of everything in the band.
 */
export function treeAnchor(indices, positions, barkMask, bounds, band = TRUNK_ANCHOR_BAND) {
  const trunk = trunkAnchor(indices, positions, barkMask, bounds, band);
  if (trunk) return trunk;
  const { centroids, areas } = triangleGeometry(indices, positions);
  const minY = bounds.min[1];
  const height = bounds.max[1] - minY;
  let x = 0;
  let z = 0;
  let w = 0;
  for (let t = 0; t < areas.length; t++) {
    const yN = (centroids[t * 3 + 1] - minY) / height;
    if (yN < band[0] || yN > band[1]) continue;
    x += centroids[t * 3] * areas[t];
    z += centroids[t * 3 + 2] * areas[t];
    w += areas[t];
  }
  if (w === 0) throw new Error('no geometry in the trunk anchor band');
  return { x: x / w, z: z / w };
}

/**
 * Scale plus translation that lands a model of `bounds` on the target height
 * and minimum y, with `anchor` (its trunk base or bounds centre, x/z in
 * source units) on the target x/z. Uniform, unless the target names a
 * `footprint` (width, depth): then x/z share one scale onto the mean of it;
 * or an `oldFootprint`: then x/z shrink, if they must, so the mean spread is
 * at most `spreadCap` (default `TREE_SPREAD_CAP`) times the old one.
 */
export function fitTransform(bounds, anchor, target) {
  const height = bounds.max[1] - bounds.min[1];
  if (!(height > 0)) throw new Error('degenerate source height');
  const sy = target.height / height;
  let sh = sy;
  const w = bounds.max[0] - bounds.min[0];
  const d = bounds.max[2] - bounds.min[2];
  if (target.footprint) {
    sh = (target.footprint[0] + target.footprint[1]) / (w + d);
  } else if (target.oldFootprint) {
    const spread = target.spreadCap ?? TREE_SPREAD_CAP;
    const cap = (spread * (target.oldFootprint[0] + target.oldFootprint[1])) / (w + d);
    sh = Math.min(sy, cap);
  }
  return {
    scale: [sh, sy, sh],
    translation: [
      target.x - anchor.x * sh,
      target.minY - bounds.min[1] * sy,
      target.z - anchor.z * sh,
    ],
  };
}

/** Apply a fit to a flat xyz position array, returning a new array. */
export function applyFit(positions, { scale, translation }) {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) out[i + k] = positions[i + k] * scale[k] + translation[k];
  }
  return out;
}

/** Normals under a fit: the inverse scale, renormalized. */
export function fitNormals(normals, { scale }) {
  const out = new Float32Array(normals.length);
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i] / scale[0];
    const y = normals[i + 1] / scale[1];
    const z = normals[i + 2] / scale[2];
    const len = Math.hypot(x, y, z) || 1;
    out[i] = x / len;
    out[i + 1] = y / len;
    out[i + 2] = z / len;
  }
  return out;
}

/** Cell layout of a shared texture atlas of `count` square tiles. */
export function atlasLayout(count) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

/** Remap glTF uvs (wrapped into [0, 1)) into atlas cell `index`. */
export function remapUvsToAtlasCell(uvs, index, layout, inset = 0) {
  const { cols, rows } = layout;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const span = 1 - 2 * inset;
  const out = new Float32Array(uvs.length);
  for (let i = 0; i < uvs.length; i += 2) {
    const u = uvs[i] - Math.floor(uvs[i]);
    const v = uvs[i + 1] - Math.floor(uvs[i + 1]);
    out[i] = (col + inset + u * span) / cols;
    out[i + 1] = (row + inset + v * span) / rows;
  }
  return out;
}

// ---------------------------------------------------------------------------
// leaf albedo grade

/**
 * Mean linear albedo each kind's leaf texels are graded onto. The renderer
 * multiplies a leaf map by a per-species lift and a per-biome tint
 * (src/render/foliage.ts), calibrated on the old kit sheets: the oak value
 * is the one measured there over the texels its alpha test keeps, the pine
 * sheet is darker, and the dressing tint carries a ground-keyed gain for a
 * dark kit albedo and needs the dark kit sheet under it: the bush value is
 * the old bush sheet's own (its kept texels carry almost no red, which is
 * what made the storybook bush read yellow under that gain). Without the
 * grade a brighter, yellower storybook sheet comes out amber; with it the
 * painted variation stays around these means.
 */
export const LEAF_ALBEDO_TARGETS = Object.freeze({
  broadleaf: Object.freeze([0.099, 0.197, 0.012]),
  conifer: Object.freeze([0.06, 0.12, 0.01]),
  bush: Object.freeze([0.012, 0.13, 0.026]),
  flowering_bush: Object.freeze([0.07, 0.15, 0.012]),
});
/** Clamp on the per-channel linear gain of the leaf grade. */
export const LEAF_GRADE_GAIN = Object.freeze([0.08, 1.6]);

/**
 * Mean linear albedo the bark texels of a split tree are graded onto: the
 * old kit bark sheet measures (0.267, 0.101, 0.057) and draws red-brown
 * under the warm trunk tint; a storybook trunk is about a third of that and
 * nearly blue-free, so under the same tint and shade it read dark olive.
 * The target keeps it a little under the kit's red.
 */
export const BARK_ALBEDO_TARGETS = Object.freeze({
  broadleaf: Object.freeze([0.2, 0.09, 0.04]),
  conifer: Object.freeze([0.2, 0.09, 0.04]),
});
/** Clamp on the per-channel linear gain of the bark grade. */
export const BARK_GRADE_GAIN = Object.freeze([0.5, 3]);

/**
 * Mean linear albedo each rock sheet is graded onto before it joins the
 * shared atlas: the renderer multiplies every rock by its biome tint (about
 * 0.6 in the vale) and a baked top tint, so a storybook sheet at its own
 * mean (about 0.13) drew a near-black boulder against the painted sand.
 * A warm, nearly neutral grey keeps the painted moss and lichen readable.
 */
export const ROCK_ALBEDO_TARGET = Object.freeze([0.2, 0.19, 0.165]);
/** Clamp on the per-channel linear gain of the rock grade. */
export const ROCK_GRADE_GAIN = Object.freeze([0.8, 1.8]);

/** Texels of a sheet that carry paint (not the flat black of unused atlas space). */
export function paintedTexelMask(image, floor = 12) {
  const { data, width, height, channels } = image;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const o = i * channels;
    if (data[o] + data[o + 1] + data[o + 2] > floor) out[i] = 1;
  }
  return out;
}

const linearToSrgbByte = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

/**
 * Texels covered by the uv footprint of the `mask` triangles, grown by
 * `dilate` texels so the mip chain at an island edge grades with it.
 */
export function rasterizeUvMask(indices, uvs, mask, width, height, dilate = 2) {
  const out = new Uint8Array(width * height);
  for (let t = 0; t < indices.length / 3; t++) {
    if (!mask[t]) continue;
    const p = [0, 1, 2].map((k) => {
      const i = indices[t * 3 + k];
      return [uvs[i * 2] * width, uvs[i * 2 + 1] * height];
    });
    // a triangle that spans the wrap seam is rasterized in its own cell
    const ox = Math.floor(Math.min(p[0][0], p[1][0], p[2][0]) / width) * width;
    const oy = Math.floor(Math.min(p[0][1], p[1][1], p[2][1]) / height) * height;
    for (const q of p) {
      q[0] -= ox;
      q[1] -= oy;
    }
    const x0 = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])));
    const d = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside;
        if (Math.abs(d) < 1e-12) {
          inside = true; // a sliver: mark its bounds
        } else {
          const w1 =
            ((px - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (py - p[0][1])) / d;
          const w2 =
            ((p[1][0] - p[0][0]) * (py - p[0][1]) - (px - p[0][0]) * (p[1][1] - p[0][1])) / d;
          inside = w1 >= -0.02 && w2 >= -0.02 && 1 - w1 - w2 >= -0.02;
        }
        if (inside) out[y * width + x] = 1;
      }
    }
  }
  let cur = out;
  for (let r = 0; r < dilate; r++) {
    const next = Uint8Array.from(cur);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (cur[y * width + x]) continue;
        if (
          (x > 0 && cur[y * width + x - 1]) ||
          (x < width - 1 && cur[y * width + x + 1]) ||
          (y > 0 && cur[(y - 1) * width + x]) ||
          (y < height - 1 && cur[(y + 1) * width + x])
        ) {
          next[y * width + x] = 1;
        }
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * Per-channel linear gains that land the masked texels' mean on `target`,
 * each clamped to `clamp` (the leaf clamp unless told otherwise).
 */
export function leafGradeGains(image, mask, target, clamp = LEAF_GRADE_GAIN) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    for (let k = 0; k < 3; k++) sum[k] += srgbToLinear(image.data[i * image.channels + k]);
    n++;
  }
  if (n === 0) throw new Error('empty grade mask');
  const [lo, hi] = clamp;
  return sum.map((s, k) => Math.min(hi, Math.max(lo, target[k] / Math.max(s / n, 1e-4))));
}

/** Texels of `mask` that `exclude` does not cover. */
export function subtractMask(mask, exclude) {
  const out = Uint8Array.from(mask);
  for (let i = 0; i < out.length; i++) if (exclude[i]) out[i] = 0;
  return out;
}

/** A copy of the image with the masked texels scaled by linear `gains`. */
export function applyLeafGrade(image, mask, gains) {
  const data = Uint8Array.from(image.data);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    for (let k = 0; k < 3; k++) {
      const o = i * image.channels + k;
      data[o] = linearToSrgbByte(srgbToLinear(image.data[o]) * gains[k]);
    }
  }
  return { ...image, data };
}

// ---------------------------------------------------------------------------
// painted relief

/**
 * Painted relief for a stone or cap sheet: a tangent-space normal map
 * (glTF convention, green up) derived from the sheet's own painted value,
 * so the brush strokes, cracks and moss clumps catch the light instead of
 * the low-poly facets carrying all the shading. The value is box-blurred
 * `blur` texels (twice) into a height field, darker meaning lower, and its
 * slope at `strength` texels of height per unit of value tilts the normal.
 * Returns rgb bytes, width by height, row-major from the image top.
 */
export function paintedReliefNormals(image, { strength = 3.2, blur = 2 } = {}) {
  const { data, width, height, channels } = image;
  let h = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    h[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
  }
  const boxPass = (src, horizontal) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let s = 0;
        let n = 0;
        for (let k = -blur; k <= blur; k++) {
          const xx = horizontal ? Math.min(width - 1, Math.max(0, x + k)) : x;
          const yy = horizontal ? y : Math.min(height - 1, Math.max(0, y + k));
          s += src[yy * width + xx];
          n++;
        }
        out[y * width + x] = s / n;
      }
    }
    return out;
  };
  for (let pass = 0; pass < 2; pass++) h = boxPass(boxPass(h, true), false);
  const at = (x, y) =>
    h[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      // image rows run down the sheet; the normal map's green runs up it
      const dy = (at(x, y - 1) - at(x, y + 1)) * 0.5 * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * width + x) * 3;
      out[o] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

/**
 * Whiteout blend of two tangent-space normal maps (rgb bytes, same size):
 * the `base` map (a source's own baked normal, which carries the sculpted
 * chips and cracks) with the `detail` map (the painted relief) layered on at
 * `detailWeight`. The xy slopes add and z multiplies, so a flat detail texel
 * returns the base texel and a flat base returns the scaled detail. Returns
 * new rgb bytes.
 */
export function blendTangentNormals(base, detail, detailWeight = 1) {
  if (base.length !== detail.length) throw new Error('normal maps differ in size');
  const out = new Uint8Array(base.length);
  const dec = (v) => (v / 255) * 2 - 1;
  for (let i = 0; i < base.length; i += 3) {
    const bx = dec(base[i]);
    const by = dec(base[i + 1]);
    const bz = Math.max(1e-3, dec(base[i + 2]));
    const dx = dec(detail[i]) * detailWeight;
    const dy = dec(detail[i + 1]) * detailWeight;
    const dz = Math.max(1e-3, 1 + (dec(detail[i + 2]) - 1) * detailWeight);
    const x = bx + dx;
    const y = by + dy;
    const z = bz * dz;
    const len = Math.hypot(x, y, z);
    out[i] = Math.round(((x / len) * 0.5 + 0.5) * 255);
    out[i + 1] = Math.round(((y / len) * 0.5 + 0.5) * 255);
    out[i + 2] = Math.round(((z / len) * 0.5 + 0.5) * 255);
  }
  return out;
}

/** Share of the painted relief layered over a rock's own baked normal map. */
export const ROCK_RELIEF_OVER_BAKED = 0.6;

/** Kinds whose own sheet carries a painted relief normal map. */
export const RELIEF_KINDS = Object.freeze({
  rock: Object.freeze({ strength: 3.2, blur: 2 }),
  mushroom: Object.freeze({ strength: 2.2, blur: 1 }),
});
