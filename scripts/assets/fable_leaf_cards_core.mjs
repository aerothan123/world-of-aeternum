// Pure core of the storybook leaf cards (scripts/assets/fit_fable_foliage.mjs).
//
// The Tripo storybook crowns are single closed hulls: up close they read as
// faceted low-poly blobs. The fit keeps each hull as a shrunk, darker inner
// mass and covers it with leaf cards: alpha-cut quads that each carry one
// painted leaf cluster (a twig of broad leaves, a drooping frond, a needle
// spray), scattered over the hull surface and oriented outward with a droop,
// so a crown reads as many layered clusters with gaps, a lit outer layer and
// a shaded inner one. The cluster art is cut out of painted sprite sheets
// (assets_src/fable_foliage/leaf_sheets/) into one shared atlas.
//
// Every step here is pure: the sprite islands come from the sheet pixels,
// the scatter from a seeded generator, so the same inputs give the same
// atlas rectangles and the same card geometry byte for byte. No IO, no
// clock, no Math.random.

/** Small deterministic generator (mulberry32). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit seed from a string (FNV-1a). */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Sprite sheets: background key and island cut

/** Median colour of the sheet border (the flat background the art sits on). */
export function backgroundColour(image, band = 6) {
  const { data, width, height, channels } = image;
  const ch = [[], [], []];
  const take = (x, y) => {
    const o = (y * width + x) * channels;
    for (let k = 0; k < 3; k++) ch[k].push(data[o + k]);
  };
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < band; x++) {
      take(x, y);
      take(width - 1 - x, y);
    }
  }
  for (let x = 0; x < width; x += 4) {
    for (let y = 0; y < band; y++) {
      take(x, y);
      take(x, height - 1 - y);
    }
  }
  return ch.map((c) => {
    c.sort((a, b) => a - b);
    return c[c.length >> 1];
  });
}

/** Key window on the max per-channel distance from the background: a dark
 *  sheet keys tighter (its shadowed inner leaves sit close to black), a
 *  light one wider (a pale painted rim sits close to white). */
export const SHEET_KEY = Object.freeze({
  dark: Object.freeze({ lo: 9, hi: 30 }),
  light: Object.freeze({ lo: 24, hi: 64 }),
});

/** The key window for a background colour. */
export function sheetKeyFor(bg) {
  return bg[0] + bg[1] + bg[2] < 384 ? SHEET_KEY.dark : SHEET_KEY.light;
}

/**
 * Alpha 0..255 per pixel from its distance to the background colour: a
 * smooth ramp across `key`, so a cut edge keeps a soft painted falloff the
 * renderer's alpha test then trims.
 */
export function keyAlpha(image, bg, key = sheetKeyFor(bg)) {
  const { data, width, height, channels } = image;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const d = Math.max(
      Math.abs(data[o] - bg[0]),
      Math.abs(data[o + 1] - bg[1]),
      Math.abs(data[o + 2] - bg[2]),
    );
    const t = Math.min(1, Math.max(0, (d - key.lo) / (key.hi - key.lo)));
    out[i] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  return out;
}

/**
 * The separate sprite islands of a keyed sheet, as pixel rectangles
 * `{ x0, y0, x1, y1, area }` (x1/y1 exclusive), row-major order. Islands are
 * found on a coarse block grid (a block is solid when any of its pixels is
 * past half alpha) grown by `grow` blocks, so the loose leaves of one
 * cluster join it; islands under `minShare` of the largest are dropped.
 */
export function spriteIslands(alpha, width, height, { block = 8, grow = 1, minShare = 0.15 } = {}) {
  const gw = Math.ceil(width / block);
  const gh = Math.ceil(height / block);
  const solid = new Uint8Array(gw * gh);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > 127) solid[Math.floor(y / block) * gw + Math.floor(x / block)] = 1;
    }
  }
  let grown = solid;
  for (let r = 0; r < grow; r++) {
    const next = Uint8Array.from(grown);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grown[y * gw + x]) continue;
        for (let dy = -1; dy <= 1 && !next[y * gw + x]; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && grown[ny * gw + nx]) {
              next[y * gw + x] = 1;
              break;
            }
          }
        }
      }
    }
    grown = next;
  }
  const label = new Int32Array(gw * gh).fill(-1);
  const islands = [];
  const stack = [];
  for (let s = 0; s < gw * gh; s++) {
    if (!grown[s] || label[s] >= 0) continue;
    const id = islands.length;
    const isl = { bx0: gw, by0: gh, bx1: 0, by1: 0, area: 0 };
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop();
      const cx = c % gw;
      const cy = (c - cx) / gw;
      if (solid[c]) isl.area++;
      isl.bx0 = Math.min(isl.bx0, cx);
      isl.by0 = Math.min(isl.by0, cy);
      isl.bx1 = Math.max(isl.bx1, cx + 1);
      isl.by1 = Math.max(isl.by1, cy + 1);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx;
        if (grown[n] && label[n] < 0) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    islands.push(isl);
  }
  const biggest = Math.max(0, ...islands.map((i) => i.area));
  const kept = islands
    .filter((i) => i.area >= biggest * minShare)
    .map((i) => {
      // tighten to the real pixels inside the block bounds
      let x0 = width;
      let y0 = height;
      let x1 = 0;
      let y1 = 0;
      for (let y = i.by0 * block; y < Math.min(height, i.by1 * block); y++) {
        for (let x = i.bx0 * block; x < Math.min(width, i.bx1 * block); x++) {
          if (alpha[y * width + x] > 8) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x + 1);
            y1 = Math.max(y1, y + 1);
          }
        }
      }
      return { x0, y0, x1, y1, area: i.area };
    })
    .filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
  // row-major: rows are islands whose vertical centres sit within a third
  // of the median island height of each other
  const hMed = [...kept].map((r) => r.y1 - r.y0).sort((a, b) => a - b)[kept.length >> 1] ?? 1;
  kept.sort((a, b) => {
    const ra = Math.floor((a.y0 + a.y1) / 2 / (hMed * 0.9));
    const rb = Math.floor((b.y0 + b.y1) / 2 / (hMed * 0.9));
    return ra - rb || a.x0 - b.x0;
  });
  return kept;
}

// ---------------------------------------------------------------------------
// The shared leaf atlas

/**
 * The leaf atlases. Each one is embedded in the GLB of every model that
 * draws from it (the GLB contract forbids external images), so a model
 * carries only its own family's cells: the broadleaf family (oaks and both
 * bushes, blossoms included), the conifers, and the snags' twigs. Every
 * file of a family embeds the same bytes under the same texture name, so
 * the renderer's per-(role, name, map) material cache keeps one GPU copy.
 * `cells` order is the atlas cell order (row-major); `dense` cells are an
 * opaque painted foliage mass (stamps of the family's clusters over its own
 * dark tone) for the shrunk inner hull; `hang` marks a sprite whose twig
 * enters at the top edge (a drooping frond): its card hangs from the hull.
 */
export const LEAF_ATLASES = Object.freeze({
  broadleaf: Object.freeze({
    name: 'Fable_LeafCards_Broadleaf',
    width: 1024,
    height: 1024,
    cols: 3,
    rows: 3,
    pad: 6,
    cells: Object.freeze([
      { group: 'broadleaf', sheet: 'broadleaf_b', island: 0 },
      { group: 'broadleaf', sheet: 'broadleaf_b', island: 1 },
      { group: 'broadleaf', sheet: 'broadleaf_b', island: 3 },
      { group: 'broadleaf', sheet: 'broadleaf_b', island: 7 },
      { group: 'broadleaf', sheet: 'broadleaf_a', island: 1 },
      { group: 'broadleaf', sheet: 'broadleaf_b', island: 4, hang: true },
      { group: 'blossom', sheet: 'blossom', island: 1 },
      { group: 'blossom', sheet: 'blossom', island: 3 },
      { group: 'dense', sheet: null, island: -1, of: 'broadleaf' },
    ]),
  }),
  conifer: Object.freeze({
    name: 'Fable_LeafCards_Conifer',
    width: 1024,
    height: 1024,
    cols: 2,
    rows: 2,
    pad: 8,
    cells: Object.freeze([
      { group: 'conifer', sheet: 'pine_a', island: 0 },
      { group: 'conifer', sheet: 'pine_b', island: 1 },
      { group: 'conifer', sheet: 'pine_b', island: 5 },
      { group: 'dense', sheet: null, island: -1, of: 'conifer' },
    ]),
  }),
  twig: Object.freeze({
    name: 'Fable_LeafCards_Twig',
    width: 512,
    height: 512,
    cols: 2,
    rows: 1,
    pad: 6,
    cells: Object.freeze([
      { group: 'twig', sheet: 'twig_dry', island: 1 },
      { group: 'twig', sheet: 'twig_dry', island: 3 },
    ]),
  }),
});

/** Which atlas a storybook kind draws its cards from. */
export const KIND_ATLAS = Object.freeze({
  broadleaf: 'broadleaf',
  bush: 'broadleaf',
  flowering_bush: 'broadleaf',
  conifer: 'conifer',
  dead: 'twig',
});

/**
 * Where each cell's sprite lands in its atlas: the sprite is scaled to fit
 * the padded cell, keeping its aspect, centred. Returns pixel placement and
 * the uv rectangle `[u0, vTop, u1, vBottom]` the cards use (glTF uv, v down
 * from the image top). `rects[i]` null is a dense cell (it fills the cell).
 */
export function atlasPlacements(rects, atlas) {
  const cw = atlas.width / atlas.cols;
  const ch = atlas.height / atlas.rows;
  return rects.map((r, i) => {
    const col = i % atlas.cols;
    const row = Math.floor(i / atlas.cols);
    const iw = cw - atlas.pad * 2;
    const ih = ch - atlas.pad * 2;
    const w = r ? r.x1 - r.x0 : iw;
    const h = r ? r.y1 - r.y0 : ih;
    const k = Math.min(iw / w, ih / h);
    const pw = Math.max(1, Math.round(w * k));
    const ph = Math.max(1, Math.round(h * k));
    const left = Math.round(col * cw + (cw - pw) / 2);
    const top = Math.round(row * ch + (ch - ph) / 2);
    return {
      left,
      top,
      width: pw,
      height: ph,
      aspect: pw / ph,
      cell: {
        left: Math.round(col * cw),
        top: Math.round(row * ch),
        width: Math.round(cw),
        height: Math.round(ch),
      },
      uv: [
        left / atlas.width,
        top / atlas.height,
        (left + pw) / atlas.width,
        (top + ph) / atlas.height,
      ],
    };
  });
}

/** Index lists of the cells of each card group. */
export function cellsOf(group, cells) {
  const out = [];
  cells.forEach((c, i) => {
    if (c.group === group) out.push(i);
  });
  return out;
}

/** Linear-light per-channel gains that land a group's mean on `target`. */
export function groupGains(meanLinear, target, clamp = [0.05, 2.5]) {
  return meanLinear.map((m, k) =>
    Math.min(clamp[1], Math.max(clamp[0], target[k] / Math.max(m, 1e-4))),
  );
}

/**
 * Colour the transparent texels of an RGBA image with their nearest opaque
 * neighbour's colour (a few rings of dilation), so the mip chain never
 * pulls the black background into a leaf edge.
 */
export function bleedColour(rgba, width, height, rings = 8, cut = 16) {
  const data = Uint8Array.from(rgba);
  let known = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) known[i] = data[i * 4 + 3] > cut ? 1 : 0;
  for (let r = 0; r < rings; r++) {
    const next = Uint8Array.from(known);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (known[i]) continue;
        let n = 0;
        const s = [0, 0, 0];
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (!known[j]) continue;
          for (let k = 0; k < 3; k++) s[k] += data[j * 4 + k];
          n++;
        }
        if (n === 0) continue;
        for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(s[k] / n);
        next[i] = 1;
      }
    }
    known = next;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Geometry helpers

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};
const lerp = (a, b, t) => a + (b - a) * t;
const vtx = (positions, i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];

/** Area-weighted centre of an indexed surface. */
export function surfaceCentre(indices, positions) {
  const c = [0, 0, 0];
  let w = 0;
  for (let t = 0; t < indices.length / 3; t++) {
    const a = vtx(positions, indices[t * 3]);
    const b = vtx(positions, indices[t * 3 + 1]);
    const d = vtx(positions, indices[t * 3 + 2]);
    const area = Math.hypot(...cross(sub(b, a), sub(d, a))) / 2;
    for (let k = 0; k < 3; k++) c[k] += ((a[k] + b[k] + d[k]) / 3) * area;
    w += area;
  }
  return w > 0 ? scale(c, 1 / w) : [0, 0, 0];
}

/**
 * The inner hull: the crown mesh pulled toward its centre by `shrink`,
 * unwelded (each triangle its own three vertices) with normals bent toward
 * the radial direction for a soft volumetric shade, and uvs projected per
 * triangle into the dense cell `uvRect` at `texelsPerUnit` cell widths per
 * model unit, so the opaque mass reads as small painted leaves everywhere.
 */
export function innerHull(
  { indices, positions, normals },
  centre,
  uvRect,
  { shrink = 0.86, shrinkY = shrink, normalBend = 0.65, cellsPerUnit = 0.45, seed = 1 } = {},
) {
  const tris = indices.length / 3;
  const pos = new Float32Array(tris * 9);
  const nrm = new Float32Array(tris * 9);
  const uv = new Float32Array(tris * 6);
  const idx = new Uint32Array(tris * 3);
  const rnd = seededRandom(seed);
  const [u0, v0, u1, v1] = uvRect;
  const inset = 0.04;
  for (let t = 0; t < tris; t++) {
    const p = [0, 1, 2].map((k) => {
      const v = vtx(positions, indices[t * 3 + k]);
      const d = sub(v, centre);
      return add(centre, [d[0] * shrink, d[1] * shrinkY, d[2] * shrink]);
    });
    const fn = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    // project on the face's dominant plane
    const ax = Math.abs(fn[0]);
    const ay = Math.abs(fn[1]);
    const az = Math.abs(fn[2]);
    const pick = ay >= ax && ay >= az ? [0, 2] : ax >= az ? [2, 1] : [0, 1];
    const q = p.map((v) => [v[pick[0]] * cellsPerUnit, v[pick[1]] * cellsPerUnit]);
    const minU = Math.min(q[0][0], q[1][0], q[2][0]);
    const minV = Math.min(q[0][1], q[1][1], q[2][1]);
    const span = Math.max(
      Math.max(q[0][0], q[1][0], q[2][0]) - minU,
      Math.max(q[0][1], q[1][1], q[2][1]) - minV,
      1e-6,
    );
    // a triangle wider than the usable cell is squeezed into it
    const room = 1 - 2 * inset;
    const k = span > room ? room / span : 1;
    const offU = inset + rnd() * Math.max(0, room - span * k);
    const offV = inset + rnd() * Math.max(0, room - span * k);
    for (let c = 0; c < 3; c++) {
      const o = t * 3 + c;
      pos.set(p[c], o * 3);
      const src = normals ? vtx(normals, indices[t * 3 + c]) : fn;
      const radial = norm(sub(p[c], centre));
      nrm.set(
        norm([
          lerp(src[0], radial[0], normalBend),
          lerp(src[1], radial[1], normalBend),
          lerp(src[2], radial[2], normalBend),
        ]),
        o * 3,
      );
      const lu = offU + (q[c][0] - minU) * k;
      const lv = offV + (q[c][1] - minV) * k;
      uv[o * 2] = lerp(u0, u1, lu);
      uv[o * 2 + 1] = lerp(v0, v1, lv);
      idx[o] = o;
    }
  }
  return { indices: idx, positions: pos, normals: nrm, uvs: uv };
}

/**
 * Card scatter recipe per crown kind. Sizes are in model units of the
 * SOURCE mesh as a share of its height (the fit scales them with it).
 * - count: cards per unit of hull area over height squared
 * - size: card height range as a share of the model height
 * - lift: card centre offset along the outward normal, in card heights
 * - droop: how far each card's face tips toward the ground
 * - roll: random spin of the card about its face normal (radians)
 * - bend: vertex normal blend toward the radial direction
 * - cross: share of cards that get a second quad crossed through them
 */
export const LEAF_CARD_RECIPES = Object.freeze({
  broadleaf: Object.freeze({
    density: 150,
    size: [0.1, 0.16],
    lift: [-0.12, 0.3],
    droop: 0.32,
    roll: 1.1,
    bend: 0.6,
    cross: 0.25,
    groups: Object.freeze({ broadleaf: 1 }),
  }),
  // conifers: many small needle sprays held close to the tier surface and
  // tipped well down, so the tiered cone keeps its silhouette
  conifer: Object.freeze({
    density: 260,
    size: [0.06, 0.1],
    lift: [-0.2, 0.1],
    droop: 0.8,
    roll: 0.3,
    bend: 0.55,
    cross: 0.3,
    groups: Object.freeze({ conifer: 1 }),
  }),
  bush: Object.freeze({
    density: 80,
    size: [0.32, 0.48],
    lift: [-0.1, 0.25],
    droop: 0.2,
    roll: 1.4,
    bend: 0.6,
    cross: 0.3,
    groups: Object.freeze({ broadleaf: 1 }),
  }),
  flowering_bush: Object.freeze({
    density: 80,
    size: [0.32, 0.46],
    lift: [-0.1, 0.25],
    droop: 0.2,
    roll: 1.4,
    bend: 0.6,
    cross: 0.3,
    groups: Object.freeze({ broadleaf: 0.62, blossom: 0.38 }),
  }),
});

/**
 * Leaf cards scattered over a crown surface. `cells` maps a group name to
 * its atlas placements (`{ uv, aspect, hang }`). Returns one primitive per
 * group: `{ [group]: { indices, positions, normals, uvs, cards } }`.
 * `height` is the model height the recipe sizes are shares of; `centre` the
 * crown centre the cards face away from; `seed` the scatter seed.
 */
export function scatterLeafCards(
  { indices, positions, normals },
  { recipe, cells, height, centre, seed, minY = -Infinity, countScale = 1 },
) {
  const rnd = seededRandom(seed);
  const tris = indices.length / 3;
  const cum = new Float64Array(tris);
  let total = 0;
  for (let t = 0; t < tris; t++) {
    const a = vtx(positions, indices[t * 3]);
    const b = vtx(positions, indices[t * 3 + 1]);
    const d = vtx(positions, indices[t * 3 + 2]);
    const cy = (a[1] + b[1] + d[1]) / 3;
    const area = cy < minY ? 0 : Math.hypot(...cross(sub(b, a), sub(d, a))) / 2;
    total += area;
    cum[t] = total;
  }
  const count = Math.max(
    1,
    Math.round(((recipe.density * total) / (height * height)) * countScale),
  );
  const groups = Object.entries(recipe.groups);
  const out = {};
  for (const [g] of groups) out[g] = { positions: [], normals: [], uvs: [], indices: [], cards: 0 };
  const up = [0, 1, 0];
  const pushQuad = (dst, c, right, upAxis, w, h, face, uvRect, hang) => {
    const base = dst.positions.length / 3;
    const [u0, vTop, u1, vBot] = uvRect; // atlas y down: top edge first
    // corners: bottom-left, bottom-right, top-right, top-left
    const off = hang ? 0.5 : 0; // a hanging frond attaches at its top edge
    const corners = [
      [-0.5, -0.5 - off, u0, vBot],
      [0.5, -0.5 - off, u1, vBot],
      [0.5, 0.5 - off, u1, vTop],
      [-0.5, 0.5 - off, u0, vTop],
    ];
    for (const [sx, sy, u, v] of corners) {
      const p = add(c, add(scale(right, sx * w), scale(upAxis, sy * h)));
      dst.positions.push(...p);
      const radial = norm(sub(p, centre));
      dst.normals.push(
        ...norm([
          lerp(face[0], radial[0], recipe.bend),
          lerp(face[1], radial[1], recipe.bend),
          lerp(face[2], radial[2], recipe.bend),
        ]),
      );
      // glTF uv: v down from the image top
      dst.uvs.push(u, v);
    }
    dst.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < count && total > 0; i++) {
    // area-weighted triangle, uniform point on it
    const r = rnd() * total;
    let lo = 0;
    let hi = tris - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const t = lo;
    let b1 = rnd();
    let b2 = rnd();
    if (b1 + b2 > 1) {
      b1 = 1 - b1;
      b2 = 1 - b2;
    }
    const a = vtx(positions, indices[t * 3]);
    const b = vtx(positions, indices[t * 3 + 1]);
    const d = vtx(positions, indices[t * 3 + 2]);
    const p = add(a, add(scale(sub(b, a), b1), scale(sub(d, a), b2)));
    let fn = norm(cross(sub(b, a), sub(d, a)));
    const radial = norm(sub(p, centre));
    if (normals) {
      const na = vtx(normals, indices[t * 3]);
      if (dot(na, fn) < 0) fn = scale(fn, -1);
    }
    if (dot(fn, radial) < 0) fn = scale(fn, -1);
    const out0 = norm(add(fn, radial));
    // group and cell
    let gr = rnd();
    let group = groups[groups.length - 1][0];
    for (const [g, share] of groups) {
      if (gr < share) {
        group = g;
        break;
      }
      gr -= share;
    }
    const list = cells[group];
    const cell = list[Math.floor(rnd() * list.length) % list.length];
    const h = height * lerp(recipe.size[0], recipe.size[1], rnd());
    const w = h * cell.aspect;
    const lift = h * lerp(recipe.lift[0], recipe.lift[1], rnd());
    // face: outward, jittered, tipped toward the ground by the droop
    const jit = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
    let face = norm(add(out0, scale(jit, 0.5)));
    face = norm(add(face, scale(up, -recipe.droop * Math.max(0.2, 1 - Math.abs(face[1])))));
    // the card's up axis: world up flattened onto the card, then rolled
    let upAxis = sub(up, scale(face, dot(up, face)));
    if (Math.hypot(...upAxis) < 1e-3) upAxis = sub([1, 0, 0], scale(face, face[0]));
    upAxis = norm(upAxis);
    let right = norm(cross(upAxis, face));
    const roll = (rnd() * 2 - 1) * (cell.hang ? recipe.roll * 0.25 : recipe.roll);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const up2 = norm(add(scale(upAxis, cr), scale(right, sr)));
    right = norm(cross(up2, face));
    const c = add(p, scale(out0, lift));
    const dst = out[group];
    // a hanging frond attaches at the hull point and hangs outward-down
    pushQuad(dst, c, right, up2, w, h, face, cell.uv, cell.hang);
    dst.cards++;
    if (rnd() < recipe.cross) {
      // a second quad crossed through the first about its up axis, so the
      // cluster keeps its body seen edge-on
      const face2 = norm(cross(up2, face));
      const right2 = norm(cross(up2, face2));
      pushQuad(
        dst,
        c,
        right2,
        up2,
        w * 0.9,
        h * 0.9,
        norm(add(face2, scale(out0, 0.8))),
        cell.uv,
        cell.hang,
      );
    }
  }
  const result = {};
  for (const [g, dst] of Object.entries(out)) {
    if (dst.cards === 0) continue;
    result[g] = {
      indices: Uint32Array.from(dst.indices),
      positions: Float32Array.from(dst.positions),
      normals: Float32Array.from(dst.normals),
      uvs: Float32Array.from(dst.uvs),
      cards: dst.cards,
    };
  }
  return result;
}

/**
 * Twig cards for a bare snag: scattered on the bark triangles out at the
 * branch ends (above `minHeight` of the model height and past `minReach`
 * of the widest reach from the trunk axis), each sprite standing out of
 * the branch with its base at the bark and its tips outward and up.
 */
export function scatterTwigCards(
  { indices, positions },
  {
    cells,
    height,
    axis,
    seed,
    density = 4.5,
    size = [0.12, 0.19],
    minHeight = 0.4,
    minReach = 0.35,
  },
) {
  const rnd = seededRandom(seed);
  const tris = indices.length / 3;
  let minY = Infinity;
  let maxReach = 0;
  for (let i = 0; i < positions.length / 3; i++) {
    minY = Math.min(minY, positions[i * 3 + 1]);
    maxReach = Math.max(
      maxReach,
      Math.hypot(positions[i * 3] - axis[0], positions[i * 3 + 2] - axis[1]),
    );
  }
  const cum = new Float64Array(tris);
  let total = 0;
  for (let t = 0; t < tris; t++) {
    const a = vtx(positions, indices[t * 3]);
    const b = vtx(positions, indices[t * 3 + 1]);
    const d = vtx(positions, indices[t * 3 + 2]);
    const cx = (a[0] + b[0] + d[0]) / 3;
    const cy = (a[1] + b[1] + d[1]) / 3;
    const cz = (a[2] + b[2] + d[2]) / 3;
    const ok =
      cy - minY > height * minHeight &&
      Math.hypot(cx - axis[0], cz - axis[1]) > maxReach * minReach;
    total += ok ? Math.hypot(...cross(sub(b, a), sub(d, a))) / 2 : 0;
    cum[t] = total;
  }
  const count = Math.round((density * total) / ((height * height) / 100));
  const dst = { positions: [], normals: [], uvs: [], indices: [], cards: 0 };
  for (let i = 0; i < count && total > 0; i++) {
    const r = rnd() * total;
    let lo = 0;
    let hi = tris - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const a = vtx(positions, indices[lo * 3]);
    const b = vtx(positions, indices[lo * 3 + 1]);
    const d = vtx(positions, indices[lo * 3 + 2]);
    const p = scale(add(a, add(b, d)), 1 / 3);
    const outward = norm([p[0] - axis[0], 0, p[2] - axis[1]]);
    const grow = norm(add(outward, [rnd() - 0.5, 0.6 + rnd() * 0.6, rnd() - 0.5]));
    let face = norm(cross(grow, [0, 1, 0]));
    if (Math.hypot(...face) < 1e-3) face = [1, 0, 0];
    const roll = (rnd() - 0.5) * 1.2;
    face = norm(add(face, scale(outward, roll)));
    const right = norm(cross(grow, face));
    const cell = cells[Math.floor(rnd() * cells.length) % cells.length];
    const h = height * lerp(size[0], size[1], rnd());
    const w = h * cell.aspect;
    const c = add(p, scale(grow, h * 0.45));
    const base = dst.positions.length / 3;
    const [u0, vTop, u1, vBot] = cell.uv;
    for (const [sx, sy, u, v] of [
      [-0.5, -0.5, u0, vBot],
      [0.5, -0.5, u1, vBot],
      [0.5, 0.5, u1, vTop],
      [-0.5, 0.5, u0, vTop],
    ]) {
      dst.positions.push(...add(c, add(scale(right, sx * w), scale(grow, sy * h))));
      dst.normals.push(...norm(add(face, scale([0, 1, 0], 0.5))));
      dst.uvs.push(u, v);
    }
    dst.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    dst.cards++;
  }
  return {
    indices: Uint32Array.from(dst.indices),
    positions: Float32Array.from(dst.positions),
    normals: Float32Array.from(dst.normals),
    uvs: Float32Array.from(dst.uvs),
    cards: dst.cards,
  };
}

/** Concatenate primitive data sets into one. */
export function mergeParts(parts) {
  const n = parts.reduce((s, p) => s + p.positions.length / 3, 0);
  const m = parts.reduce((s, p) => s + p.indices.length, 0);
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  const indices = new Uint32Array(m);
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    positions.set(p.positions, vo * 3);
    normals.set(p.normals, vo * 3);
    uvs.set(p.uvs, vo * 2);
    for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i] + vo;
    vo += p.positions.length / 3;
    io += p.indices.length;
  }
  return { positions, normals, uvs, indices };
}

// ---------------------------------------------------------------------------
// Per-kind wiring and the colour grade

/**
 * How each storybook kind takes its leaf cards. `hull` is the inner mass the
 * crown mesh becomes (simplified to `budget` triangles, pulled toward the
 * crown centre by `shrink`, painted from the `dense` cell); the dead snags
 * take twig cards on their branch ends instead.
 */
export const LEAF_CARD_KINDS = Object.freeze({
  broadleaf: Object.freeze({
    recipe: 'broadleaf',
    hull: Object.freeze({ budget: 900, shrink: 0.92, dense: 'broadleaf' }),
  }),
  conifer: Object.freeze({
    recipe: 'conifer',
    // a conifer's hull keeps its height: the trunk tip stays under the apex
    hull: Object.freeze({ budget: 1100, shrink: 0.96, shrinkY: 1, dense: 'conifer' }),
  }),
  bush: Object.freeze({
    recipe: 'bush',
    hull: Object.freeze({ budget: 420, shrink: 0.84, dense: 'broadleaf' }),
  }),
  flowering_bush: Object.freeze({
    recipe: 'flowering_bush',
    hull: Object.freeze({ budget: 420, shrink: 0.84, dense: 'broadleaf' }),
  }),
  dead: Object.freeze({ twigs: true }),
});

/**
 * Mean linear albedo each card group is graded onto in the atlas (over the
 * texels the alpha test keeps). Natural, not neon: a little blue in every
 * green so a crown under the warm Refined top light stays leaf green, the
 * conifers darker and cooler. Blossom cells grade only their green texels
 * (onto the broadleaf mean); twigs keep their painted bark and dry leaves.
 */
export const LEAF_GROUP_ALBEDO = Object.freeze({
  broadleaf: Object.freeze([0.095, 0.185, 0.034]),
  conifer: Object.freeze([0.04, 0.088, 0.036]),
});

/** The mean each kind's leaf material lands on (the shared broadleaf
 *  cells times the material's base colour factor). */
export const LEAF_KIND_ALBEDO = Object.freeze({
  broadleaf: LEAF_GROUP_ALBEDO.broadleaf,
  conifer: LEAF_GROUP_ALBEDO.conifer,
  bush: Object.freeze([0.03, 0.12, 0.03]),
  flowering_bush: Object.freeze([0.065, 0.145, 0.03]),
});

/** The glTF base colour factor a kind's leaf material carries: its own
 *  mean over the shared cells' mean, per channel, never above 1. */
export function kindColourFactor(kind) {
  const group = kind === 'conifer' ? 'conifer' : 'broadleaf';
  const own = LEAF_KIND_ALBEDO[kind] ?? LEAF_GROUP_ALBEDO[group];
  const base = LEAF_GROUP_ALBEDO[group];
  return own.map((v, k) => +Math.min(1, v / base[k]).toFixed(4));
}

/** Green-dominant test for a blossom texel (sRGB bytes): leaves grade, petals keep. */
export function isLeafTexel(r, g, b) {
  return g > r * 1.08 && g > b * 1.08;
}

/**
 * The stamps a dense cell is painted from: `count` sprites of the group's
 * cells, each at a seeded spot (allowed past the cell edge, the painter
 * clips), scale (share of the cell side), horizontal flip and shade.
 */
export function denseStampPlan(seed, cellIndices, count = 46) {
  const rnd = seededRandom(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      cell: cellIndices[Math.floor(rnd() * cellIndices.length) % cellIndices.length],
      x: rnd() * 1.2 - 0.1,
      y: rnd() * 1.2 - 0.1,
      size: 0.3 + rnd() * 0.22,
      flip: rnd() < 0.5,
      // early stamps sit under later ones: deeper means darker
      shade: 0.5 + 0.45 * (i / Math.max(1, count - 1)) * (0.7 + 0.3 * rnd()),
    });
  }
  return out;
}

/** Base fill of a dense cell as a share of its group's mean colour. */
export const DENSE_BASE_SHADE = 0.42;

/** Height share above which a conifer's geometric trunk core is crown. */
export const CONIFER_CROWN_CORE_FROM = 0.6;

/**
 * A conifer's split takes the geometric core up to the apex as bark (the
 * trunk hides inside the tiers there). Once the crown is leaf cards over a
 * shrunk hull, that upper core would poke out of the needles as bark, so
 * above `from` of the height it joins the crown hull instead. Returns new
 * labels (0 bark, 1 crown); the input is left as it was.
 */
export function coniferCoreToCrown(
  labels,
  { indices, positions },
  bounds,
  from = CONIFER_CROWN_CORE_FROM,
) {
  const out = Int8Array.from(labels);
  const cut = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * from;
  for (let t = 0; t < indices.length / 3; t++) {
    if (out[t] !== 0) continue;
    const y =
      (positions[indices[t * 3] * 3 + 1] +
        positions[indices[t * 3 + 1] * 3 + 1] +
        positions[indices[t * 3 + 2] * 3 + 1]) /
      3;
    if (y > cut) out[t] = 1;
  }
  return out;
}
