// The storybook leaf cards (scripts/assets/fable_leaf_cards_core.mjs): the
// sheet key and island cut, the atlas placement, and the card and hull
// geometry the foliage fit builds every storybook crown from. Pure and
// deterministic: the same inputs give the same rectangles and bytes.
import { describe, expect, it } from 'vitest';
import type { CardGroup } from '../scripts/assets/fable_leaf_cards_core.mjs';
import {
  atlasPlacements,
  backgroundColour,
  bleedColour,
  cellsOf,
  coniferCoreToCrown,
  denseStampPlan,
  innerHull,
  isLeafTexel,
  KIND_ATLAS,
  keyAlpha,
  kindColourFactor,
  LEAF_ATLASES,
  LEAF_CARD_KINDS,
  LEAF_CARD_RECIPES,
  LEAF_GROUP_ALBEDO,
  LEAF_KIND_ALBEDO,
  mergeParts,
  scatterLeafCards,
  scatterTwigCards,
  seededRandom,
  seedOf,
  sheetKeyFor,
  spriteIslands,
  surfaceCentre,
} from '../scripts/assets/fable_leaf_cards_core.mjs';

/** A card group the scatter must have produced. */
function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('missing card group');
  return v;
}

/** A W x H rgb sheet on `bg` with solid squares at the given rects. */
function sheet(w: number, h: number, bg: number[], rects: number[][], fg = [60, 140, 40]) {
  const data = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) data.set(bg, i * 3);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set(fg, (y * w + x) * 3);
  }
  return { data, width: w, height: h, channels: 3 };
}

/** A unit sphere crown (latitude-longitude mesh) at `c` of radius `r`. */
function sphere(c: number[], r: number, seg = 12) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j <= seg * 2; j++) {
      const th = (Math.PI * i) / seg;
      const ph = (Math.PI * j) / seg;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      pos.push(c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r);
      nrm.push(...n);
    }
  }
  const row = seg * 2 + 1;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < seg * 2; j++) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  return {
    indices: Uint32Array.from(idx),
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nrm),
  };
}

describe('fable leaf cards: sheets', () => {
  it('keys a dark and a light background and keeps a soft edge ramp', () => {
    const dark = sheet(40, 40, [3, 2, 1], [[10, 10, 20, 20]]);
    const bg = backgroundColour(dark);
    expect(bg).toEqual([3, 2, 1]);
    expect(sheetKeyFor(bg)).toBe(sheetKeyFor([0, 0, 0]));
    expect(sheetKeyFor([250, 250, 248])).not.toBe(sheetKeyFor(bg));
    const a = keyAlpha(dark, bg);
    expect(a[15 * 40 + 15]).toBe(255);
    expect(a[2 * 40 + 2]).toBe(0);
    // a texel just past the key floor is partly transparent, not cut hard
    const soft = sheet(4, 4, [0, 0, 0], [[1, 1, 2, 2]], [18, 18, 18]);
    const sa = keyAlpha(soft, [0, 0, 0]);
    expect(sa[5]).toBeGreaterThan(0);
    expect(sa[5]).toBeLessThan(255);
  });

  it('cuts separate islands row-major and drops specks', () => {
    const s = sheet(
      200,
      200,
      [0, 0, 0],
      [
        [120, 20, 180, 80],
        [20, 20, 80, 80],
        [20, 120, 80, 180],
        [150, 150, 152, 152],
      ],
    );
    const isl = spriteIslands(keyAlpha(s, [0, 0, 0]), 200, 200);
    expect(isl.map((r) => [r.x0, r.y0, r.x1, r.y1])).toEqual([
      [20, 20, 80, 80],
      [120, 20, 180, 80],
      [20, 120, 80, 180],
    ]);
  });

  it('joins the loose leaves of one cluster into one island', () => {
    // two blocks one key block apart join through the grown grid
    const s = sheet(
      120,
      60,
      [0, 0, 0],
      [
        [10, 10, 40, 50],
        [48, 10, 80, 50],
      ],
    );
    const isl = spriteIslands(keyAlpha(s, [0, 0, 0]), 120, 60);
    expect(isl).toHaveLength(1);
    expect([isl[0].x0, isl[0].x1]).toEqual([10, 80]);
  });

  it('bleeds leaf colour under the cut so mips never darken an edge', () => {
    const rgba = new Uint8Array(3 * 1 * 4);
    rgba.set([0, 200, 0, 255], 0);
    const out = bleedColour(rgba, 3, 1);
    expect(Array.from(out.slice(4, 8))).toEqual([0, 200, 0, 0]);
    expect(Array.from(out.slice(8, 12))).toEqual([0, 200, 0, 0]);
  });

  it('tells a blossom leaf texel from a petal', () => {
    expect(isLeafTexel(70, 140, 40)).toBe(true);
    expect(isLeafTexel(240, 170, 190)).toBe(false);
    expect(isLeafTexel(245, 245, 240)).toBe(false);
  });
});

describe('fable leaf cards: atlases', () => {
  it('places every cell inside its own cell, aspect kept, uv in range', () => {
    for (const spec of Object.values(LEAF_ATLASES)) {
      expect(spec.cells.length).toBeLessThanOrEqual(spec.cols * spec.rows);
      const rects = spec.cells.map((c, i) =>
        c.sheet ? { x0: 0, y0: 0, x1: 100 + i * 10, y1: 200 } : null,
      );
      const pl = atlasPlacements(rects, spec);
      pl.forEach((p, i) => {
        expect(p.left).toBeGreaterThanOrEqual(p.cell.left);
        expect(p.top).toBeGreaterThanOrEqual(p.cell.top);
        expect(p.left + p.width).toBeLessThanOrEqual(p.cell.left + p.cell.width);
        expect(p.top + p.height).toBeLessThanOrEqual(p.cell.top + p.cell.height);
        for (const v of p.uv) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        const r = rects[i];
        if (r) expect(p.aspect).toBeCloseTo((r.x1 - r.x0) / (r.y1 - r.y0), 1);
      });
    }
  });

  it('gives every card kind an atlas with the groups its recipe draws', () => {
    for (const [kind, cfg] of Object.entries(LEAF_CARD_KINDS)) {
      const spec = LEAF_ATLASES[KIND_ATLAS[kind as keyof typeof KIND_ATLAS]];
      expect(spec, kind).toBeDefined();
      if ('twigs' in cfg) {
        expect(cellsOf('twig', spec.cells).length).toBeGreaterThan(0);
        continue;
      }
      const recipe = LEAF_CARD_RECIPES[cfg.recipe as keyof typeof LEAF_CARD_RECIPES];
      for (const group of Object.keys(recipe.groups)) {
        expect(cellsOf(group as CardGroup, spec.cells).length, `${kind} ${group}`).toBeGreaterThan(
          0,
        );
      }
      // the hull's dense cell lives in the same atlas
      expect(spec.cells.some((c) => c.group === 'dense' && c.of === cfg.hull.dense)).toBe(true);
    }
  });

  it('lands each kind on its own leaf mean through a base colour factor of at most 1', () => {
    for (const kind of ['broadleaf', 'conifer', 'bush', 'flowering_bush'] as const) {
      const f = kindColourFactor(kind);
      const base = kind === 'conifer' ? LEAF_GROUP_ALBEDO.conifer : LEAF_GROUP_ALBEDO.broadleaf;
      f.forEach((v, k) => {
        expect(v).toBeLessThanOrEqual(1);
        expect(v * base[k]).toBeCloseTo(Math.min(LEAF_KIND_ALBEDO[kind][k], base[k]), 3);
      });
    }
    expect(kindColourFactor('broadleaf')).toEqual([1, 1, 1]);
  });

  it('plans the dense stamps from the seed alone, darker underneath', () => {
    const a = denseStampPlan(seedOf('dense:broadleaf'), [0, 1, 2]);
    const b = denseStampPlan(seedOf('dense:broadleaf'), [0, 1, 2]);
    expect(a).toEqual(b);
    expect(a[0].shade).toBeLessThan(a[a.length - 1].shade + 0.2);
    expect(new Set(a.map((s) => s.cell))).toEqual(new Set([0, 1, 2]));
  });
});

describe('fable leaf cards: geometry', () => {
  const crown = sphere([0, 5, 0], 2);
  const cells = {
    broadleaf: [
      { uv: [0, 0, 0.3, 0.3], aspect: 1, hang: false },
      { uv: [0.3, 0, 0.5, 0.4], aspect: 0.5, hang: true },
    ],
    blossom: [{ uv: [0.6, 0.6, 0.9, 0.9], aspect: 1, hang: false }],
  };
  const opts = {
    recipe: LEAF_CARD_RECIPES.broadleaf,
    cells,
    height: 7,
    centre: [0, 5, 0],
    seed: 7,
  };

  it('is seeded: the same crown and seed give the same bytes, another seed does not', () => {
    const a = must(scatterLeafCards(crown, opts).broadleaf);
    const b = must(scatterLeafCards(crown, opts).broadleaf);
    const c = must(scatterLeafCards(crown, { ...opts, seed: 8 }).broadleaf);
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true);
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(c.positions.buffer))).toBe(false);
    expect(seededRandom(3)()).toBe(seededRandom(3)());
  });

  it('scatters quads (two triangles each) near the crown surface, facing out', () => {
    const broadleaf = must(scatterLeafCards(crown, opts).broadleaf);
    const quads = broadleaf.positions.length / 12;
    expect(broadleaf.indices.length).toBe(quads * 6);
    expect(broadleaf.cards).toBeGreaterThan(20);
    let outward = 0;
    for (let q = 0; q < quads; q++) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let k = 0; k < 4; k++) {
        const v = q * 4 + k;
        cx += broadleaf.positions[v * 3] / 4;
        cy += broadleaf.positions[v * 3 + 1] / 4;
        cz += broadleaf.positions[v * 3 + 2] / 4;
        nx += broadleaf.normals[v * 3];
        ny += broadleaf.normals[v * 3 + 1];
        nz += broadleaf.normals[v * 3 + 2];
      }
      const r = Math.hypot(cx, cy - 5, cz);
      // a card sits on the crown shell: never deep inside, never far out
      expect(r).toBeGreaterThan(1.2);
      expect(r).toBeLessThan(3.6);
      if (nx * cx + ny * (cy - 5) + nz * cz > 0) outward++;
    }
    expect(outward / quads).toBeGreaterThan(0.95);
    // uvs stay inside the cells they were cut from
    for (let i = 0; i < broadleaf.uvs.length; i += 2) {
      expect(broadleaf.uvs[i]).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(broadleaf.uvs[i + 1]).toBeLessThanOrEqual(0.4 + 1e-6);
    }
  });

  it('scales the card count with the crown area over the height squared', () => {
    const small = must(scatterLeafCards(sphere([0, 5, 0], 1), opts).broadleaf).cards;
    const big = must(scatterLeafCards(crown, opts).broadleaf).cards;
    expect(big / small).toBeGreaterThan(3);
    expect(big / small).toBeLessThan(5);
  });

  it('splits a mixed recipe into its groups by share', () => {
    const mixed = scatterLeafCards(crown, {
      ...opts,
      recipe: LEAF_CARD_RECIPES.flowering_bush,
      height: 2,
    });
    const leaves = must(mixed.broadleaf);
    const blossoms = must(mixed.blossom);
    expect(leaves.cards).toBeGreaterThan(blossoms.cards);
    expect(blossoms.cards).toBeGreaterThan(0);
    for (let i = 0; i < blossoms.uvs.length; i++)
      expect(blossoms.uvs[i]).toBeGreaterThanOrEqual(0.6);
  });

  it('shrinks the hull toward the centre, unwelds it and paints it from the dense cell', () => {
    const rect = [0.5, 0.5, 1, 1];
    const hull = innerHull(crown, [0, 5, 0], rect, { shrink: 0.8 });
    const tris = crown.indices.length / 3;
    expect(hull.positions.length).toBe(tris * 9);
    expect(Array.from(hull.indices)).toEqual(Array.from({ length: tris * 3 }, (_, i) => i));
    for (let v = 0; v < hull.positions.length / 3; v++) {
      const r = Math.hypot(
        hull.positions[v * 3],
        hull.positions[v * 3 + 1] - 5,
        hull.positions[v * 3 + 2],
      );
      expect(r).toBeLessThanOrEqual(1.6 + 1e-4);
      const n = [hull.normals[v * 3], hull.normals[v * 3 + 1], hull.normals[v * 3 + 2]];
      expect(Math.hypot(...n)).toBeCloseTo(1, 4);
    }
    for (let i = 0; i < hull.uvs.length; i++) {
      expect(hull.uvs[i]).toBeGreaterThanOrEqual(0.5);
      expect(hull.uvs[i]).toBeLessThanOrEqual(1);
    }
  });

  it('puts twig cards out on the branch ends of a snag, none on the low trunk', () => {
    // a trunk pole plus one high side branch, as two boxes of triangles
    const quad = (pts: number[][]) => pts.flat();
    const positions = Float32Array.from([
      ...quad([
        [-0.2, 0, 0],
        [0.2, 0, 0],
        [0.2, 8, 0],
        [-0.2, 8, 0],
      ]),
      ...quad([
        [1.5, 6, -0.2],
        [3.5, 6.5, -0.2],
        [3.5, 6.5, 0.2],
        [1.5, 6, 0.2],
      ]),
    ]);
    const indices = Uint32Array.from([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const twigs = scatterTwigCards(
      { indices, positions },
      {
        cells: [{ uv: [0, 0, 0.5, 1], aspect: 0.8, hang: false }],
        height: 8,
        axis: [0, 0],
        seed: 3,
      },
    );
    expect(twigs.cards).toBeGreaterThan(0);
    for (let v = 0; v < twigs.positions.length / 3; v++) {
      expect(twigs.positions[v * 3 + 1]).toBeGreaterThan(3);
    }
  });

  it('merges parts with re-based indices', () => {
    const a = {
      positions: new Float32Array(9),
      normals: new Float32Array(9),
      uvs: new Float32Array(6),
      indices: Uint32Array.from([0, 1, 2]),
    };
    const m = mergeParts([a, a]);
    expect(Array.from(m.indices)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(m.positions.length).toBe(18);
    expect(surfaceCentre(crown.indices, crown.positions)[1]).toBeCloseTo(5, 1);
  });

  it('hands the upper trunk core of a conifer to the crown, never its low trunk', () => {
    // three bark triangles at heights 1, 5 and 9 of a 10-tall tree, one crown
    const positions = Float32Array.from([
      0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 5, 0, 1, 5, 0, 0, 5, 1, 0, 9, 0, 1, 9, 0, 0, 9, 1, 2, 6, 0, 3,
      6, 0, 2, 6, 1,
    ]);
    const indices = Uint32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const bounds = { min: [0, 0, 0], max: [3, 10, 1] };
    const labels = Int8Array.from([0, 0, 0, 1]);
    const out = coniferCoreToCrown(labels, { indices, positions }, bounds);
    expect(Array.from(out)).toEqual([0, 0, 1, 1]);
    expect(Array.from(labels)).toEqual([0, 0, 0, 1]);
  });
});
