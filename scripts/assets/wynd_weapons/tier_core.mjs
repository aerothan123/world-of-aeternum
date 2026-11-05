// WYNDLEWOOD weapon tiers: the pure half of the tier builder (no file IO, no sharp, no
// gltf-transform). One generated base model per weapon type is repainted into the tier
// looks by a LOCAL recolour of its own atlas: every texel is classified by what it shows
// (bare metal, brass, warm wood or leather, a coloured accent, deep shadow) and by WHERE it
// sits on the weapon (its zone, from the texel's 3D position baked through the UVs), and
// each tier recipe says what each (class, zone) pair becomes. Small add-ons (a band of
// gilt, a set gem) are placed by measured anchors and drawn from swatches painted into an
// unused corner of the same atlas, so a tier never adds a material or a texture.
//
// Everything here is deterministic: same base, same recipe, same bytes.

/** The tiers, lowest first. */
export const WYND_TIERS = ['starter', 'mid', 'fine'];

/** The weapon types the base set covers: the pipeline family each base was normalized as,
 *  and the held-model key stem its tiers are named from. */
export const WYND_TYPES = {
  sword: { family: 'sword', key: 'sword_wynd' },
  axe2h: { family: 'axe', key: 'axe_wynd_2h' },
  mace: { family: 'mace', key: 'mace_wynd' },
  staff: { family: 'staff', key: 'staff_wynd' },
  bow: { family: 'bow', key: 'bow_wynd' },
  shield: { family: 'book', key: 'shield_wynd' },
  tome: { family: 'book', key: 'tome_wynd' },
};

/** The held-model key of one type's tier. */
export function wyndTierKey(type, tier) {
  const def = WYND_TYPES[type];
  if (!def) throw new Error(`unknown wynd weapon type ${type}`);
  if (!WYND_TIERS.includes(tier)) throw new Error(`unknown wynd tier ${tier}`);
  return `${def.key}_${tier}`;
}

// ---------------------------------------------------------------------------
// colour
// ---------------------------------------------------------------------------

/** sRGB bytes to HSV (h in degrees 0..360, s and v 0..1). */
export function rgbToHsv(r, g, b) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max <= 1e-6 ? 0 : d / max, max];
}

/** HSV back to sRGB bytes (rounded, clamped). */
export function hsvToRgb(h, s, v) {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = clamp01(v) * clamp01(s);
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = clamp01(v) - c;
  let rgb;
  if (hh < 1) rgb = [c, x, 0];
  else if (hh < 2) rgb = [x, c, 0];
  else if (hh < 3) rgb = [0, c, x];
  else if (hh < 4) rgb = [0, x, c];
  else if (hh < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((u) => Math.round(clamp01(u + m) * 255));
}

function clamp01(u) {
  return u < 0 ? 0 : u > 1 ? 1 : u;
}

/** What a texel shows. Order matters: shadow first, then the warm metal (brass) before
 *  the warm organics it shares a hue band with. `metal` is the texel's metalness from the
 *  model's own metallic-roughness map (0..1), or null when it has none: where it is known
 *  it decides metal from not-metal, so a steel blade painted with warm grime stays steel
 *  and a book's cream pages are not mistaken for it. */
export function classifyTexel(r, g, b, metal = null) {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (v < 0.13) return 'shadow';
  if (metal !== null) {
    // brass is yellow (hue 34 and up); a warm-grimed steel sits nearer orange and stays steel
    if (metal >= 0.5) return h >= 34 && h <= 62 && s >= 0.3 && v >= 0.45 ? 'brass' : 'metal';
    if (s < 0.2) return 'pale';
  }
  if (s < 0.2) return 'metal';
  if (h >= 36 && h <= 62 && s >= 0.25 && v >= 0.55) return 'brass';
  if ((h >= 8 && h < 62) || h >= 345) return 'warm';
  return 'accent';
}

// ---------------------------------------------------------------------------
// zones
// ---------------------------------------------------------------------------

/** Whether a texel at (t, r) on a weapon of `type` lies in the type's TRIM zone: the
 *  parts a better tier gilds (a sword's hilt fittings, an axe's collar and butt cap, a
 *  mace's head core and pommel, a staff's bands, a bow's tips, a shield's rim, a book's
 *  fittings). `t` is the height along the weapon (0 foot, 1 tip), `r` the distance off
 *  its axis as a fraction of the widest (a board's: off its middle, in its own plane). */
export function inTrimZone(type, t, r) {
  switch (type) {
    case 'sword':
      return t < 0.3;
    case 'axe2h':
      return (t > 0.6 && r < 0.22) || t < 0.05;
    case 'mace':
      // the pommel cap and the studs round the head
      return t < 0.1 || (t > 0.5 && r > 0.88);
    case 'staff':
      return t > 0.55;
    case 'bow':
      return t < 0.07 || t > 0.93;
    case 'shield':
      return r > 0.88;
    case 'tome':
      return true;
    default:
      return false;
  }
}

/** Types whose trim zone is fitted metal whatever its paint reads as: a shield's rim, a
 *  bow's tip caps, a sword's guard and pommel and a mace's studs are painted dark and
 *  warm, so on these a tier recolours every non-shadow texel of the zone outside the grip
 *  wrap, not only the grey ones. */
export const TRIM_GILDS_ALL = new Set(['shield', 'bow', 'sword', 'mace']);

/** Whether a texel lies in the type's GRIP zone: where its leather wrap is, the one warm
 *  surface a better tier dyes rather than merely deepens (wood and leather share a hue, so
 *  the zone is what tells a bow's grip from its limbs). */
export function inGripZone(type, t) {
  switch (type) {
    case 'sword':
      return t > 0.04 && t < 0.22;
    case 'axe2h':
      return t < 0.24;
    case 'mace':
      return t > 0.08 && t < 0.42;
    case 'staff':
      return t > 0.62 && t < 0.8;
    case 'bow':
      return t > 0.4 && t < 0.6;
    case 'tome':
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// recipes
// ---------------------------------------------------------------------------

/** The tier recipes. Each maps a texel's (class, trim, grip) to a new HSV from its own,
 *  so the painted shading and brushwork survive every repaint. Material factors ride
 *  along (`roughness`, `metalness`: multipliers on the base material's). */
export const WYND_RECIPES = {
  // Starter: a hand-me-down. Dull, a little rusty in the dark of the metal, the leather
  // and wood bleached and dry, accents faded.
  starter: {
    roughness: 1.2,
    metalness: 0.55,
    texel(cls, z, h, s, v) {
      if (z.gildAll && cls !== 'shadow') return [24, Math.min(1, s * 0.7 + 0.12), v * 0.7];
      switch (cls) {
        case 'metal': {
          // a grey has no hue of its own: the rust brings one, strongest in the dark
          const rust = 0.5 * (1 - v);
          return [24, Math.min(1, s * 0.5 + rust * 0.75), v * 0.74 - rust * 0.05];
        }
        case 'brass':
          return [h - 8, s * 0.4, v * 0.66];
        case 'warm':
          // weathered: the wood and leather bleached toward a dry grey tan
          return [h + 6, s * 0.45, v * 0.82 + 0.08];
        case 'accent':
          return [h, s * 0.4, v * 0.8];
        case 'pale':
          // cream pages and pale stone yellowed with handling
          return [42, Math.min(1, s * 0.8 + 0.07), v * 0.9];
        default:
          return [h, s, v];
      }
    },
  },
  // Mid: the base as generated, its steel cleaner and its wood and leather a touch richer.
  mid: {
    roughness: 1,
    metalness: 1,
    texel(cls, _z, h, s, v) {
      if (cls === 'metal') return [210, Math.min(0.12, s * 0.6 + 0.04), Math.min(1, v * 1.06)];
      if (cls === 'warm') return [h, Math.min(1, s * 1.08), v];
      return [h, s, v];
    },
  },
  // Fine: gilt fittings in the trim zone, bright polished steel elsewhere, the grip wrap
  // dyed a deep oxblood, wood deepened to walnut, accents richer.
  fine: {
    roughness: 0.8,
    metalness: 1,
    texel(cls, z, h, s, v) {
      const gilt = [44, 0.7, Math.min(1, v * 1.15 + 0.08)];
      if (z.trim && z.gildAll && cls !== 'shadow') return gilt;
      switch (cls) {
        case 'metal':
          if (z.trim) return gilt;
          return [208, Math.min(0.12, s * 0.6 + 0.05), Math.min(1, v * 1.15 + 0.05)];
        case 'brass':
          return [44, Math.min(1, s * 1.2), Math.min(1, v * 1.15)];
        case 'warm':
          if (z.grip) return [354, Math.min(1, s * 1.05 + 0.12), v * 0.82];
          return [h - 5, Math.min(1, s * 1.12), v * 0.78];
        case 'accent':
          return [h, Math.min(1, s * 1.3), Math.min(1, v * 1.1)];
        default:
          return [h, s, v];
      }
    },
  },
};

/** Repaint one texel for a tier. `pos` is its zone coords (zoneCoords), or null for a
 *  texel no triangle covers (it keeps the zone-free answer). */
export function repaintTexel(tier, type, rgb, pos, metal = null) {
  const recipe = WYND_RECIPES[tier];
  const cls = classifyTexel(rgb[0], rgb[1], rgb[2], metal);
  const trim = pos ? inTrimZone(type, pos.t, pos.r) : false;
  const grip = pos ? inGripZone(type, pos.t) : false;
  const z = { trim, grip, gildAll: trim && !grip && TRIM_GILDS_ALL.has(type) };
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  const out = recipe.texel(cls, z, h, s, v);
  return hsvToRgb(out[0], out[1], out[2]);
}

// ---------------------------------------------------------------------------
// add-ons
// ---------------------------------------------------------------------------

/** The swatch colours the add-ons sample (sRGB bytes), in block order. */
export const WYND_SWATCHES = {
  gilt: [214, 170, 82],
  giltDark: [150, 108, 46],
  gem: [62, 168, 150],
  gemWarm: [196, 58, 52],
};

/** The add-ons each tier hangs on each type: a gilt band round the shaft at height `t`,
 *  or a set gem at an anchor (`size` as a fraction of the weapon's half height). Only the
 *  fine tier carries any; the starter and mid tiers read through paint alone. */
export const WYND_ADDONS = {
  fine: {
    sword: [{ kind: 'gem', at: 'foot', swatch: 'gemWarm', size: 0.05 }],
    axe2h: [
      { kind: 'band', t: 0.42, swatch: 'gilt' },
      { kind: 'band', t: 0.47, swatch: 'gilt' },
    ],
    mace: [{ kind: 'band', t: 0.36, swatch: 'gilt' }],
    staff: [
      { kind: 'band', t: 0.5, swatch: 'gilt' },
      { kind: 'band', t: 0.3, swatch: 'gilt' },
    ],
    bow: [{ kind: 'gem', at: 'front-mid', swatch: 'gem', size: 0.045 }],
    shield: [{ kind: 'gem', at: 'front-center', swatch: 'gemWarm', size: 0.06 }],
    tome: [{ kind: 'gem', at: 'front-center', swatch: 'gem', size: 0.07 }],
  },
};

/** The add-ons a (tier, type) pair carries (empty when none). */
export function addonsFor(tier, type) {
  return WYND_ADDONS[tier]?.[type] ?? [];
}

/** A cut gem: an eight-sided girdle in the plane normal to `depthAxis`, its crown toward
 *  +depthAxis (the viewer) and a shallow pavilion sunk behind. Triangle soup, flat
 *  normals. */
export function gemGeometry(c, size, depthAxis = 2) {
  const [u, w] = [0, 1, 2].filter((i) => i !== depthAxis);
  const seg = 8;
  const ring = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const v = [0, 0, 0];
    v[u] = Math.cos(a) * size;
    v[w] = Math.sin(a) * size;
    ring.push(v);
  }
  const tip = [0, 0, 0];
  tip[depthAxis] = size * 0.75;
  const back = [0, 0, 0];
  back[depthAxis] = -size * 0.3;
  const pos = [];
  const add = (p) => pos.push(c[0] + p[0], c[1] + p[1], c[2] + p[2]);
  for (let i = 0; i < seg; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % seg];
    add(tip);
    add(a);
    add(b);
    add(back);
    add(b);
    add(a);
  }
  return { positions: pos, normals: faceNormals(pos) };
}

/** A gilt band (a short open cylinder, slightly proud of the shaft) round the Y axis at
 *  height y, radius r, `seg` sides. Triangle soup, outward normals. */
export function bandGeometry(cx, cz, y, r, height, seg = 12) {
  const pos = [];
  const y0 = y - height / 2;
  const y1 = y + height / 2;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p00 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r];
    const p01 = [cx + Math.cos(a0) * r, y1, cz + Math.sin(a0) * r];
    const p10 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
    const p11 = [cx + Math.cos(a1) * r, y1, cz + Math.sin(a1) * r];
    pos.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11);
  }
  return { positions: pos, normals: faceNormals(pos) };
}

function faceNormals(pos) {
  const n = [];
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i + 3] - pos[i];
    const ay = pos[i + 4] - pos[i + 1];
    const az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i];
    const by = pos[i + 7] - pos[i + 1];
    const bz = pos[i + 8] - pos[i + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
  return n;
}

// ---------------------------------------------------------------------------
// UV coverage and the swatch block
// ---------------------------------------------------------------------------

/** Rasterize UV triangles into a coverage + position map of a W x H texture. `uvs` and
 *  `positions` are flat arrays, `indices` a triangle list. Returns { covered: Uint8Array,
 *  pos: Float32Array (xyz per texel) }. glTF UV (0,0) is the image's top-left. */
export function rasterizeUv(W, H, uvs, positions, indices) {
  const covered = new Uint8Array(W * H);
  const pos = new Float32Array(W * H * 3);
  for (let f = 0; f < indices.length; f += 3) {
    const ia = indices[f];
    const ib = indices[f + 1];
    const ic = indices[f + 2];
    const ax = uvs[ia * 2] * W - 0.5;
    const ay = uvs[ia * 2 + 1] * H - 0.5;
    const bx = uvs[ib * 2] * W - 0.5;
    const by = uvs[ib * 2 + 1] * H - 0.5;
    const cx = uvs[ic * 2] * W - 0.5;
    const cy = uvs[ic * 2 + 1] * H - 0.5;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const w0 = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
        const w1 = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        const k = y * W + x;
        covered[k] = 1;
        for (let d = 0; d < 3; d++) {
          pos[k * 3 + d] =
            w0 * positions[ia * 3 + d] + w1 * positions[ib * 3 + d] + w2 * positions[ic * 3 + d];
        }
      }
    }
  }
  return { covered, pos };
}

/** Spread covered texels' positions into uncovered neighbours (`passes` rings), so a
 *  bilinear tap at an island's edge reads a texel of the same zone. Mutates `pos`;
 *  returns the coverage after spreading (1 = original, 2 = spread). */
export function dilatePositions(W, H, covered, pos, passes = 4) {
  const cov = Uint8Array.from(covered);
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let p = 0; p < passes; p++) {
    const next = Uint8Array.from(cov);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (cov[k]) continue;
        for (const [dx, dy] of steps) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!cov[j]) continue;
          pos[k * 3] = pos[j * 3];
          pos[k * 3 + 1] = pos[j * 3 + 1];
          pos[k * 3 + 2] = pos[j * 3 + 2];
          next[k] = 2;
          break;
        }
      }
    }
    cov.set(next);
  }
  return cov;
}

/** Find a free square block of `size` texels (no coverage within `margin`), scanning from
 *  the bottom-right corner. Returns {x, y} of its top-left, or null. */
export function findFreeBlock(W, H, cov, size, margin = 3) {
  const s = size + margin * 2;
  for (let y = H - s; y >= 0; y -= 2) {
    for (let x = W - s; x >= 0; x -= 2) {
      let free = true;
      for (let yy = y; yy < y + s && free; yy++) {
        for (let xx = x; xx < x + s; xx++) {
          if (cov[yy * W + xx]) {
            free = false;
            break;
          }
        }
      }
      if (free) return { x: x + margin, y: y + margin };
    }
  }
  return null;
}

/** Height along the weapon (t), radial fraction (r) and face sign (z) of a position, from
 *  the base model's bounds. A board (shield, book) faces +Z, so its radius is measured in
 *  its own plane, as an ellipse. */
export function zoneCoords(p, bounds, type) {
  const [min, max] = bounds;
  const h = max[1] - min[1] || 1;
  const t = (p[1] - min[1]) / h;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  let r;
  if (type === 'shield' || type === 'tome') {
    const rx = (max[0] - min[0]) / 2 || 1;
    r = Math.hypot((p[0] - cx) / rx, (p[1] - cy) / (h / 2));
  } else {
    const rx = Math.max(max[0] - cx, cx - min[0]) || 1;
    const rz = Math.max(max[2] - cz, cz - min[2]) || 1;
    r = Math.hypot(p[0] - cx, p[2] - cz) / Math.max(rx, rz);
  }
  return { t, r, z: p[2] >= cz ? 1 : -1 };
}
