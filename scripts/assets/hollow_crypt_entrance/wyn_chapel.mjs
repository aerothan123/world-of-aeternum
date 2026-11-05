// The Fallen Chapel, Wyndlewood's own build: the Hollow Crypt's world
// entrance authored in code from the sim's collider table
// (src/sim/hollow_crypt_entrance.ts HOLLOW_CRYPT_ENTRANCE_COLLIDERS), so every
// solid you see is exactly a solid the sim collides with, and every footing
// reaches down into the sim's own terrain (terrainHeight). It writes the four
// raw GLBs scripts/assets/hollow_crypt_entrance/build.mjs ships, with the
// nodes and materials the runtime keys on (src/render/hollow_crypt_entrance.ts:
// KitStone lit, KitLeaf lit double sided, KitVoid the unlit dark of the stair).
// Texture free: hand-painted look from vertex colour only (stone courses and
// block tones, moss low and on the broken tops, lichen, ivy and grass cards).
// Original design; no reference images. Deterministic: same inputs, same bytes.
//
//   node scripts/assets/hollow_crypt_entrance/wyn_chapel.mjs
//   node scripts/assets/hollow_crypt_entrance/build.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = path.join(ROOT, 'tmp/asset_src/hollow_crypt_entrance/glb_raw');

async function loadShared() {
  const entry = `
    export { terrainHeight } from './src/sim/world';
    export { HOLLOW_CRYPT_ENTRANCE_COLLIDERS, HOLLOW_CRYPT_ENTRANCE_DUNGEON_ID } from './src/sim/hollow_crypt_entrance';
    export { activeDungeonDoorPos, DUNGEONS } from './src/sim/data';
    export { WORLD_SEED } from './src/sim/world_seed';
    export { CRYPT_CANDLE_WICKS, CRYPT_STAIR, CRYPT_ROSE } from './src/render/hollow_crypt_entrance_core';
  `;
  const out = await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
    external: ['three'],
  });
  const tmp = path.join(ROOT, 'tmp/asset_src/hollow_crypt_entrance');
  mkdirSync(tmp, { recursive: true });
  const file = path.join(tmp, 'wyn_chapel_shared.mjs');
  writeFileSync(file, out.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

const S = await loadShared();
const door = S.activeDungeonDoorPos(S.DUNGEONS[S.HOLLOW_CRYPT_ENTRANCE_DUNGEON_ID]);
const SEED = S.WORLD_SEED;
const base = S.terrainHeight(door.x, door.z, SEED);
/** Ground under a local point, relative to the door's height. */
const ground = (lx, lz) => S.terrainHeight(door.x + lx, door.z + lz, SEED) - base;
const COL = Object.fromEntries(S.HOLLOW_CRYPT_ENTRANCE_COLLIDERS.map((c) => [c.name, c]));

// ---- deterministic noise ------------------------------------------------------------
function hash(...v) {
  let h = 2166136261;
  for (const x of v) {
    h ^= Math.floor(x * 1000) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 100000) / 100000;
}
const smooth = (t) => t * t * (3 - 2 * t);
function noise2(x, y, k = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, k);
  const b = hash(xi + 1, yi, k);
  const c = hash(xi, yi + 1, k);
  const d = hash(xi + 1, yi + 1, k);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

// ---- palette (sRGB, converted to linear on write) ------------------------------------
const STONE = [0.74, 0.7, 0.62];
const STONE_COOL = [0.62, 0.63, 0.6];
const MOSS = [0.38, 0.5, 0.24];
const LICHEN = [0.66, 0.66, 0.42];
const WOOD = [0.46, 0.32, 0.2];
const SLATE = [0.38, 0.4, 0.44];
const BRONZE = [0.42, 0.52, 0.44];
const WAX = [0.92, 0.88, 0.76];
const LEAF_YEW = [0.17, 0.3, 0.16];
const LEAF_IVY = [0.27, 0.46, 0.2];
const GRASS = [0.42, 0.56, 0.26];
const VOID = [0.02, 0.02, 0.03];
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const mul = (a, k) => a.map((x) => x * k);
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// ---- mesh builder: one per (piece, material) ----------------------------------------
class Mesh {
  constructor() {
    this.p = [];
    this.c = [];
    this.i = [];
  }
  vert(p, c) {
    this.p.push(p[0], p[1], p[2]);
    this.c.push(toLin(Math.min(1, c[0])), toLin(Math.min(1, c[1])), toLin(Math.min(1, c[2])), 1);
    return this.p.length / 3 - 1;
  }
  /** A (nu x nv) grid; f(u, v) returns [position, colour]. */
  grid(nu, nv, f, flip = false) {
    const at = [];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const [p, c] = f(i / nu, j / nv);
        at.push(this.vert(p, c));
      }
    const w = nu + 1;
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = at[j * w + i];
        const b = at[j * w + i + 1];
        const c = at[(j + 1) * w + i];
        const d = at[(j + 1) * w + i + 1];
        if (flip) this.i.push(a, d, b, a, c, d);
        else this.i.push(a, b, d, a, d, c);
      }
  }
  grid2(nu, nv, f) {
    this.grid(nu, nv, f);
    this.grid(nu, nv, f, true);
  }
  tri(a, b, c, col) {
    const ia = this.vert(a, col);
    const ib = this.vert(b, col);
    const ic = this.vert(c, col);
    this.i.push(ia, ib, ic);
  }
  quad2(a, b, c, d, col) {
    this.quad(a, b, c, d, col);
    this.quad(d, c, b, a, col);
  }
  quad(a, b, c, d, col) {
    const ia = this.vert(a, col);
    const ib = this.vert(b, col);
    const ic = this.vert(c, col);
    const id = this.vert(d, col);
    this.i.push(ia, ib, ic, ia, ic, id);
  }
  get triangles() {
    return this.i.length / 3;
  }
}
const pieces = {};
const mesh = (piece, mat) => {
  pieces[piece] ??= {};
  pieces[piece][mat] ??= new Mesh();
  return pieces[piece][mat];
};

// ---- stone colouring ---------------------------------------------------------------------
function stoneColour(x, y, z, top, seedK, tint = STONE) {
  const course = Math.floor(y / 0.42);
  const block = Math.floor((x + z) / 0.85 + (course % 2) * 0.5);
  let c = mul(tint, 0.86 + 0.22 * hash(course, block, seedK));
  const fy = y / 0.42 - course;
  if (fy < 0.12 || fy > 0.92) c = mul(c, 0.82); // mortar line, soft
  const n = noise2(x * 0.9 + seedK, z * 0.9 + y * 0.7, 3);
  c = mix(c, STONE_COOL, 0.25 * n);
  const g = ground(x, z);
  const low = Math.max(0, 1 - (y - g) / 0.9);
  c = mix(c, MOSS, 0.55 * low * (0.6 + 0.4 * n));
  const nearTop = Math.max(0, 1 - (top - y) / 0.5);
  c = mix(c, MOSS, 0.45 * nearTop * noise2(x * 2, z * 2, 7));
  if (noise2(x * 1.7, y * 1.7 + z, 11) > 0.78) c = mix(c, LICHEN, 0.35);
  return c;
}

// ---- solids ------------------------------------------------------------------------------
const burial = 0.45;
/** Corner ground under an oriented footprint (local axes u along hw, v along hd). */
function footing(cx, cz, hw, hd, rot, bury = burial) {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  let lo = Infinity;
  for (const [u, v] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const x = u * hw;
    const z = v * hd;
    lo = Math.min(lo, ground(cx + x * cs + z * sn, cz - x * sn + z * cs));
  }
  return lo - bury;
}

/**
 * A masonry block on an oriented footprint, its top edge broken by `profile`
 * (u in -1..1 along the long axis to a height), its faces gently rough.
 */
function block(
  m,
  {
    cx,
    cz,
    hw,
    hd,
    rot = 0,
    top,
    profile,
    bottom,
    seedK = 0,
    tint = STONE,
    rough = 0.05,
    step = 0.45,
  },
) {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const y0 = bottom ?? footing(cx, cz, hw, hd, rot);
  const along = hw >= hd;
  const topAt = (u, v) => {
    const t = profile ? profile(along ? u : v) : top;
    return Math.max(y0 + 0.2, t + (along ? 0 : 0) + 0.06 * (noise2(u * 3 + seedK, v * 3, 5) - 0.5));
  };
  const world = (x, y, z, nx, nz) => {
    const r = rough * (noise2(x * 2.3 + seedK, y * 2.3 + z * 2.3, 9) - 0.5) * 2;
    const px = x + nx * r;
    const pz = z + nz * r;
    return [cx + px * cs + pz * sn, y, cz - px * sn + pz * cs];
  };
  const col = (p, t) => stoneColour(p[0], p[1], p[2], t, seedK, tint);
  const nu = Math.max(1, Math.ceil((2 * hw) / step));
  const nd = Math.max(1, Math.ceil((2 * hd) / step));
  const hMax = top;
  const nv = Math.max(1, Math.ceil((hMax - y0) / step));
  // four sides: each side runs along one axis at a fixed other coordinate
  const sides = [
    { n: nu, fix: 'z', at: hd, dir: 1, nx: 0, nz: 1 },
    { n: nu, fix: 'z', at: -hd, dir: -1, nx: 0, nz: -1 },
    { n: nd, fix: 'x', at: hw, dir: -1, nx: 1, nz: 0 },
    { n: nd, fix: 'x', at: -hw, dir: 1, nx: -1, nz: 0 },
  ];
  for (const s of sides) {
    m.grid(s.n, nv, (a, b) => {
      const t = s.dir > 0 ? a : 1 - a;
      let x;
      let z;
      if (s.fix === 'z') {
        x = -hw + 2 * hw * t;
        z = s.at;
      } else {
        x = s.at;
        z = -hd + 2 * hd * t;
      }
      const u = x / hw;
      const v = z / hd;
      const ty = topAt(u, v);
      const y = y0 + (ty - y0) * b;
      const p = world(x, y, z, b > 0 && b < 1 ? s.nx : 0, b > 0 && b < 1 ? s.nz : 0);
      return [p, col(p, ty)];
    });
  }
  // the top, following the broken profile
  m.grid(nu, nd, (a, b) => {
    const x = -hw + 2 * hw * a;
    const z = hd - 2 * hd * b;
    const ty = topAt(x / hw, z / hd) + 0.05 * (noise2(a * 4, b * 4, 13) - 0.5);
    const p = world(x, ty, z, 0, 0);
    return [p, mix(col(p, ty), MOSS, 0.35 * noise2(a * 3 + seedK, b * 3, 17))];
  });
  return y0;
}

/** A round column (pier, buttress) with a plinth and a broken top. */
function column(m, { cx, cz, r, top, seedK = 0, sides = 14, tint = STONE, plinth = true }) {
  const y0 = footing(cx, cz, r, r, 0);
  if (plinth)
    block(m, {
      cx,
      cz,
      hw: r * 1.08,
      hd: r * 1.08,
      top: Math.min(top, 0.55 + ground(cx, cz)),
      bottom: y0,
      seedK: seedK + 1,
      tint,
      rough: 0.03,
    });
  const nv = Math.max(2, Math.ceil((top - y0) / 0.45));
  const topAt = (a) =>
    top -
    0.45 *
      noise2(Math.cos(a * 6.283) * 1.5 + seedK, Math.sin(a * 6.283) * 1.5, 19) *
      Math.min(1, top / 3);
  m.grid(sides, nv, (a, b) => {
    const ang = -a * Math.PI * 2;
    const ty = topAt(a);
    const y = y0 + (ty - y0) * b;
    const rr = r * 0.92 * (1 + 0.05 * (noise2(a * 8 + seedK, y * 1.3, 23) - 0.5));
    const p = [cx + Math.cos(ang) * rr, y, cz + Math.sin(ang) * rr];
    return [p, stoneColour(p[0], p[1], p[2], ty, seedK, tint)];
  });
  m.grid(sides, 1, (a, b) => {
    const ang = -a * Math.PI * 2;
    const ty = topAt(a);
    const rr = r * 0.92 * (1 - b);
    const p = [cx + Math.cos(ang) * rr, ty + 0.04 * b, cz + Math.sin(ang) * rr];
    return [p, mix(stoneColour(p[0], p[1], p[2], ty, seedK, tint), MOSS, 0.4)];
  });
}

/** A lathe (surface of revolution) around a vertical axis, profile [[r, y], ...]. */
function lathe(m, cx, cz, prof, colour, sides = 16, tilt = null) {
  m.grid(sides, prof.length - 1, (a, b) => {
    const k = Math.min(prof.length - 1, Math.round(b * (prof.length - 1)));
    const [r, y] = prof[k];
    const ang = -a * Math.PI * 2;
    let p = [Math.cos(ang) * r, y, Math.sin(ang) * r];
    if (tilt) p = tilt(p);
    return [[cx + p[0], p[1], cz + p[2]], colour(p, k)];
  });
}

/** A leaf or grass card: a bent quad (double sided at runtime). */
function card(m, x, y, z, w, h, yaw, colour, lean = 0.25) {
  const cs = Math.cos(yaw) * w * 0.5;
  const sn = Math.sin(yaw) * w * 0.5;
  const lx = Math.sin(yaw) * lean;
  const lz = -Math.cos(yaw) * lean;
  m.grid(2, 2, (a, b) => {
    const t = a * 2 - 1;
    const bend = b * b;
    return [
      [x + cs * t + lx * bend * h, y + h * b, z + sn * t + lz * bend * h],
      mix(mul(colour, 0.7), colour, b),
    ];
  });
}

const C = (n) => {
  const c = COL[n];
  if (!c) throw new Error(`no collider ${n}`);
  return c;
};

// ======================= Entrance_StairHouse (main) =======================
{
  const m = mesh('Entrance_StairHouse', 'KitStone');
  const st = S.CRYPT_STAIR;
  for (const side of ['stairhouse_e', 'stairhouse_w']) {
    const c = C(side);
    block(m, {
      cx: c.lx,
      cz: c.lz,
      hw: c.hw,
      hd: c.hd,
      top: c.top - 0.9,
      seedK: side.length,
      profile: (v) => c.top - 0.9 - 0.25 * Math.abs(v),
    });
  }
  // the pointed front over the portal: two jamb heads and a gabled face
  const zf = C('stairhouse_e').lz - C('stairhouse_e').hd;
  const zb = C('stairhouse_e').lz + C('stairhouse_e').hd;
  const hw = st.halfWidth;
  const outer = C('stairhouse_w').lx + C('stairhouse_w').hw;
  for (const [z0, z1] of [
    [zf - 0.15, zf + 0.55],
    [zb - 0.6, zb],
  ]) {
    // a stone face spanning the lane above the pointed arch, up to a gable apex
    const n = 12;
    for (let i = 0; i < n; i++) {
      const xa = -hw + (2 * hw * i) / n;
      const xb = -hw + (2 * hw * (i + 1)) / n;
      const arch = (x) =>
        st.spring + (st.apex - st.spring) * Math.sqrt(Math.max(0, 1 - (x / hw) ** 2));
      const roof = (x) => C('stairhouse_e').top - 0.9 + 1.4 * (1 - Math.abs(x) / outer);
      const col = (x, y, z) => stoneColour(x, y, z, roof(x), 5);
      for (const z of [z0, z1]) {
        const pa = [xa, arch(xa), z];
        const pb = [xb, arch(xb), z];
        const pc = [xb, roof(xb), z];
        const pd = [xa, roof(xa), z];
        if (z === z0) m.quad(pd, pc, pb, pa, col(xa, pa[1], z));
        else m.quad(pa, pb, pc, pd, col(xa, pa[1], z));
      }
      // the soffit of the arch (the pointed vault's lip), facing down
      m.quad(
        [xb, arch(xb), z0],
        [xb, arch(xb), z1],
        [xa, arch(xa), z1],
        [xa, arch(xa), z0],
        mul(STONE, 0.7),
      );
    }
    // the roof ridge across the whole house
  }
  // the pitched slate roof over the stair-house
  const ridge = C('stairhouse_e').top + 0.5;
  const eave = C('stairhouse_e').top - 1.0;
  for (const s of [-1, 1]) {
    m.grid2(6, 8, (a, b) => {
      const x = s * (outer + 0.25) * (1 - a);
      const z = zf - 0.3 + (zb - zf + 0.6) * b;
      const y = eave + (ridge - eave) * a + 0.05 * (noise2(a * 6, b * 6, 29) - 0.5);
      const row = Math.floor(b * 14 + (Math.floor(a * 8) % 2) * 0.5);
      return [[x, y, z], mul(SLATE, 0.85 + 0.25 * hash(row, Math.floor(a * 8), 31))];
    });
  }
  // the mourners: hooded robed figures on their pedestals, lanterns held low
  for (const name of ['mourner_e', 'mourner_w']) {
    const c = C(name);
    const pedTop = ground(c.lx, c.lz) + 1.0;
    block(m, {
      cx: c.lx,
      cz: c.lz,
      hw: c.hw,
      hd: c.hd,
      top: pedTop,
      seedK: name.length + 3,
      rough: 0.02,
      step: 0.3,
    });
    const h = c.top - pedTop;
    lathe(
      m,
      c.lx,
      c.lz,
      [
        [0.4, pedTop],
        [0.36, pedTop + h * 0.3],
        [0.27, pedTop + h * 0.62],
        [0.22, pedTop + h * 0.72],
        [0.24, pedTop + h * 0.8],
        [0.2, pedTop + h * 0.93],
        [0.04, pedTop + h],
      ],
      (p, k) => mix(STONE_COOL, MOSS, k < 2 ? 0.25 : 0.05),
      12,
    );
  }
  // the dark of the stair: the well's walls and vault inside the house
  const v = mesh('Entrance_StairHouse', 'KitVoid');
  for (const s of [-1, 1])
    v.quad2(
      [s * hw, st.lid, st.z0],
      [s * hw, st.lid, st.z1],
      [s * hw, st.spring, st.z1],
      [s * hw, st.spring, st.z0],
      VOID,
    );
  for (let i = 0; i < 8; i++) {
    const xa = -hw + (2 * hw * i) / 8;
    const xb = -hw + (2 * hw * (i + 1)) / 8;
    const arch = (x) =>
      st.spring + (st.apex - st.spring) * Math.sqrt(Math.max(0, 1 - (x / hw) ** 2));
    v.quad2(
      [xa, arch(xa), st.z0],
      [xb, arch(xb), st.z0],
      [xb, arch(xb), st.z1],
      [xa, arch(xa), st.z1],
      VOID,
    );
  }
}

// ======================= Entrance_Gable (main) =======================
{
  const m = mesh('Entrance_Gable', 'KitStone');
  const e = C('gable_wall_e');
  const w = C('gable_wall_w');
  const rose = S.CRYPT_ROSE;
  // the gable roofline: an apex over the doorway, the east half fallen
  const gableTop = (lx) => {
    if (lx >= 0) return Math.min(w.top - 1.6, 16 - lx * 0.62);
    return Math.max(5.5, Math.min(e.top, 14.5 + lx * 0.4 - 3.2 * noise2(lx * 0.6, 0, 37)));
  };
  for (const c of [e, w]) {
    block(m, {
      cx: c.lx,
      cz: c.lz,
      hw: c.hw,
      hd: c.hd,
      top: c === w ? w.top - 1.6 : e.top,
      profile: (u) => gableTop(c.lx + u * c.hw),
      seedK: c === w ? 41 : 43,
    });
  }
  // the bellcote on the west shoulder
  block(m, {
    cx: 2.9,
    cz: w.lz,
    hw: 0.6,
    hd: 0.55,
    top: w.top,
    bottom: gableTop(2.9) - 0.5,
    seedK: 47,
    rough: 0.03,
  });
  // its pitched cap and the iron finial over it
  lathe(
    m,
    2.9,
    w.lz,
    [
      [0.66, w.top],
      [0.5, w.top + 0.9],
      [0.08, w.top + 2.2],
      [0.05, w.top + 3.6],
      [0.01, w.top + 3.7],
    ],
    (p, k) => (k < 2 ? SLATE : mul(SLATE, 0.55)),
    8,
  );
  // the wall over the doorway, holed by the rose window
  const span = e.lx + e.hw; // the doorway's east edge (negative)
  const x0 = span;
  const x1 = w.lx - w.hw;
  const doorTop = 6.4;
  const n = 18;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < 22; j++) {
      const xa = x0 + ((x1 - x0) * i) / n;
      const xb = x0 + ((x1 - x0) * (i + 1)) / n;
      const ya = doorTop + j * 0.5;
      const yb = ya + 0.5;
      const xm = (xa + xb) / 2;
      const ym = (ya + yb) / 2;
      if (ym > gableTop(xm)) continue;
      if (Math.hypot(xm - rose.lx, ym - rose.y) < rose.radius) continue;
      for (const z of [e.lz - e.hd, e.lz + e.hd]) {
        const c = stoneColour(xm, ym, z, gableTop(xm), 53);
        const q = [
          [xa, ya, z],
          [xb, ya, z],
          [xb, Math.min(yb, gableTop(xb)), z],
          [xa, Math.min(yb, gableTop(xa)), z],
        ];
        if (z < e.lz) m.quad(q[3], q[2], q[1], q[0], c);
        else m.quad(q[0], q[1], q[2], q[3], c);
      }
    }
  // the rose window's ring and its six spokes of tracery
  const ring = 36;
  for (let i = 0; i < ring; i++) {
    const a0 = (i / ring) * Math.PI * 2;
    const a1 = ((i + 1) / ring) * Math.PI * 2;
    for (const [r0, r1] of [[rose.radius - 0.28, rose.radius]]) {
      const P = (a, r, z) => [rose.lx + Math.cos(a) * r, rose.y + Math.sin(a) * r, z];
      const zf = e.lz - e.hd - 0.05;
      const zb = e.lz + e.hd + 0.05;
      const col = mul(STONE, 0.92 + 0.12 * hash(i, 3, 59));
      m.quad(P(a0, r0, zf), P(a1, r0, zf), P(a1, r1, zf), P(a0, r1, zf), col);
      m.quad(P(a0, r0, zb), P(a0, r1, zb), P(a1, r1, zb), P(a1, r0, zb), col);
      m.quad(P(a0, r0, zf), P(a0, r0, zb), P(a1, r0, zb), P(a1, r0, zf), mul(col, 0.8));
    }
  }
  for (let k = 0; k < 6; k++) {
    if (k === 4) continue; // one spoke has fallen
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = 0.11;
    const zz = e.lz;
    m.quad2(
      [rose.lx - dy * t, rose.y + dx * t, zz],
      [rose.lx + dx * (rose.radius - 0.2) - dy * t, rose.y + dy * (rose.radius - 0.2) + dx * t, zz],
      [rose.lx + dx * (rose.radius - 0.2) + dy * t, rose.y + dy * (rose.radius - 0.2) - dx * t, zz],
      [rose.lx + dy * t, rose.y - dx * t, zz],
      mul(STONE, 0.95),
    );
  }
  // the pointed arch of the gable doorway (a rib on both faces)
  const half = (x1 - x0) / 2;
  const mid = (x0 + x1) / 2;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI;
    const b = ((i + 1) / 14) * Math.PI;
    const P = (t, r, z) => [
      mid - Math.cos(t) * r,
      4.4 + Math.sin(t) * (doorTop - 4.4) * (r / half),
      z,
    ];
    for (const z of [e.lz - e.hd - 0.04, e.lz + e.hd + 0.04])
      m.quad2(
        P(a, half - 0.35, z),
        P(b, half - 0.35, z),
        P(b, half, z),
        P(a, half, z),
        mul(STONE, 0.9),
      );
  }
  for (const name of ['gable_buttress_e', 'gable_buttress_w']) {
    const c = C(name);
    block(m, {
      cx: c.lx,
      cz: c.lz,
      hw: c.hw,
      hd: c.hd,
      top: c.top,
      profile: (u) => c.top - 0.6 * (u + 1),
      seedK: name.length,
    });
  }
}

// ======================= Entrance_Details (main) =======================
{
  const m = mesh('Entrance_Details', 'KitStone');
  // the fallen bell lying on its side, its lip cracked
  const b = C('fallen_bell');
  const g = ground(b.lx, b.lz);
  lathe(
    m,
    b.lx,
    b.lz,
    [
      [0.12, 0],
      [0.55, 0.15],
      [0.7, 0.7],
      [0.95, 1.4],
      [1.12, 1.9],
      [1.05, 1.95],
    ],
    (p, k) => mix(BRONZE, [0.5, 0.38, 0.22], noise2(p[0] * 2, p[2] * 2, 61) * 0.6),
    18,
    (p) => [p[1] - 0.95, g + b.r * 0.92 + p[2] * 0.95, p[0] * 0.95],
  );
  // the dragged altar slab on its two low blocks
  const al = C('altar_slab');
  block(m, {
    cx: al.lx,
    cz: al.lz,
    hw: al.hw,
    hd: al.hd,
    rot: al.rot,
    top: al.top + ground(al.lx, al.lz),
    bottom: al.top + ground(al.lx, al.lz) - 0.26,
    seedK: 67,
    rough: 0.02,
    step: 0.3,
  });
  for (const s of [-0.6, 0.6]) {
    const cx = al.lx + s * al.hd * Math.sin(al.rot);
    const cz = al.lz + s * al.hd * Math.cos(al.rot);
    block(m, {
      cx,
      cz,
      hw: al.hw * 0.7,
      hd: 0.25,
      rot: al.rot,
      top: al.top + ground(al.lx, al.lz) - 0.25,
      seedK: 71,
      step: 0.3,
    });
  }
  // the ledger lectern: a stone post and a slanted reading board
  const le = C('lectern');
  const lg = ground(le.lx, le.lz);
  column(m, {
    cx: le.lx,
    cz: le.lz,
    r: 0.22,
    top: lg + le.top - 0.35,
    seedK: 73,
    sides: 8,
    plinth: false,
  });
  block(m, {
    cx: le.lx,
    cz: le.lz,
    hw: le.r,
    hd: 0.36,
    top: lg + le.top,
    profile: (u) => lg + le.top - 0.25 * (u + 1),
    bottom: lg + le.top - 0.42,
    seedK: 79,
    step: 0.3,
    tint: WOOD,
  });
  // the vestry nook
  for (const name of ['vestry_wall', 'vestry_return']) {
    const c = C(name);
    block(m, {
      cx: c.lx,
      cz: c.lz,
      hw: c.hw,
      hd: c.hd,
      top: c.top,
      profile: (u) => c.top - 0.5 * noise2(u * 2, 0, c.hw * 10),
      seedK: name.length + 83,
    });
  }
  // the shrouded font
  const f = C('font');
  const fg = ground(f.lx, f.lz);
  lathe(
    m,
    f.lx,
    f.lz,
    [
      [0.55, fg - 0.2],
      [0.5, fg + 0.3],
      [0.3, fg + 0.5],
      [0.3, fg + 1.0],
      [0.85, fg + 1.35],
      [0.9, fg + f.top - fg],
      [0.6, fg + f.top - 0.12],
    ],
    (p, k) => (k >= 4 ? mix(STONE, [0.85, 0.84, 0.8], 0.5) : STONE_COOL),
    16,
  );
  // the candle clusters: each wick on a stub of wax on a small stone heap
  const wicks = S.CRYPT_CANDLE_WICKS;
  const heaps = new Map();
  for (const [x, y, z] of wicks) {
    const key = `${Math.round(x * 2)}_${Math.round(z * 2)}`;
    if (!heaps.has(key)) heaps.set(key, []);
    heaps.get(key).push([x, y, z]);
  }
  for (const group of heaps.values()) {
    const minY = Math.min(...group.map((w) => w[1]));
    const cx = group.reduce((s, w) => s + w[0], 0) / group.length;
    const cz = group.reduce((s, w) => s + w[2], 0) / group.length;
    const heapTop = minY - 0.16;
    if (heapTop > ground(cx, cz) + 0.05)
      column(m, { cx, cz, r: 0.28, top: heapTop, seedK: cx * 7 + cz, sides: 9, plinth: false });
    for (const [x, y, z] of group) {
      const footY = Math.min(y - 0.02, Math.max(heapTop, ground(x, z)));
      const h = Math.max(0.06, y - 0.015 - footY);
      lathe(
        m,
        x,
        z,
        [
          [0.034, footY - 0.02],
          [0.034, footY + h * 0.9],
          [0.026, footY + h],
          [0.004, footY + h + 0.01],
        ],
        () => WAX,
        6,
      );
    }
  }
  // the nave's flagstones, each on its own ground
  for (let k = 0; k < 70; k++) {
    const x = -7 + 14 * hash(k, 1, 89);
    const z = -20.5 + 19 * hash(k, 2, 89);
    if (Math.abs(x) > 3.2 && Math.abs(x) < 6) continue; // clear of the pier lines
    const s = 0.38 + 0.3 * hash(k, 3, 89);
    const gy = ground(x, z);
    block(m, {
      cx: x,
      cz: z,
      hw: s,
      hd: s * (0.7 + 0.4 * hash(k, 4, 89)),
      rot: hash(k, 5, 89) * 0.4,
      top: gy + 0.05,
      bottom: gy - 0.08,
      seedK: k,
      rough: 0.01,
      step: 1,
    });
  }
}

// ======================= Entrance_Nave (walls) =======================
{
  const m = mesh('Entrance_Nave', 'KitStone');
  for (const c of S.HOLLOW_CRYPT_ENTRANCE_COLLIDERS) {
    const n = c.name;
    if (n.startsWith('nave_wall') || n.startsWith('chancel_wall') || n.startsWith('apse_wall')) {
      const k = n.length * 3 + Math.round(c.lz);
      const prof = (u) =>
        c.top - (0.7 + 0.5 * noise2(u * 2.5 + k, 0, 97)) * (n.startsWith('apse') ? 0.6 : 1) + 0.35;
      block(m, {
        cx: c.lx,
        cz: c.lz,
        hw: c.hw,
        hd: c.hd,
        rot: c.rot ?? 0,
        top: c.top,
        profile: (u) => Math.min(c.top, prof(u)),
        seedK: k,
      });
    } else if (n.startsWith('nave_buttress')) {
      block(m, {
        cx: c.lx,
        cz: c.lz,
        hw: c.r,
        hd: c.r,
        top: c.top,
        profile: (u) => c.top - 0.4 * (u + 1),
        seedK: n.length * 5,
      });
    } else if (n.startsWith('nave_pier_')) {
      column(m, {
        cx: c.lx,
        cz: c.lz,
        r: c.r,
        top: c.standTop ?? c.top,
        seedK: n.length * 7 + c.lz,
      });
    } else if (n === 'fallen_pier') {
      const g = ground(c.lx, c.lz);
      const r = c.hd * 0.85;
      lathe(
        m,
        c.lx,
        c.lz,
        Array.from({ length: 7 }, (_, i) => [
          r * (1 + 0.04 * (hash(i, 7, 101) - 0.5)),
          -c.hw + (2 * c.hw * i) / 6,
        ]),
        (p) => stoneColour(p[0] + c.lx, p[1], p[2] + c.lz, 1, 103),
        12,
        (p) => {
          // lay the drum along the footprint's long axis
          const x = p[1];
          const y = g + r - 0.05 + p[2];
          const z = p[0];
          const cs = Math.cos(c.rot);
          const sn = Math.sin(c.rot);
          return [x * cs + z * sn, y, -x * sn + z * cs];
        },
      );
    }
  }
}

// ======================= Entrance_Outside (props) =======================
{
  const m = mesh('Entrance_Outside', 'KitStone');
  const leaf = mesh('Entrance_Outside', 'KitLeaf');
  for (const c of S.HOLLOW_CRYPT_ENTRANCE_COLLIDERS) {
    const n = c.name;
    if (n.startsWith('headstone_')) {
      const g = footing(c.lx, c.lz, c.hw, c.hd, c.rot, 0.35);
      const k = Math.round(c.lx * 10 + c.lz);
      const shoulder = c.top - c.hw * 0.7 + ground(c.lx, c.lz) - 0;
      const top = c.top + ground(c.lx, c.lz);
      block(m, {
        cx: c.lx,
        cz: c.lz,
        hw: c.hw,
        hd: c.hd * 0.6,
        rot: c.rot,
        top,
        profile: (u) => shoulder + (top - shoulder) * Math.sqrt(Math.max(0, 1 - u * u)),
        bottom: g,
        seedK: k,
        tint: STONE_COOL,
        step: 0.22,
        rough: 0.02,
      });
    } else if (n.startsWith('table_tomb')) {
      const gt = ground(c.lx, c.lz);
      block(m, {
        cx: c.lx,
        cz: c.lz,
        hw: c.hw * 0.86,
        hd: c.hd * 0.86,
        rot: c.rot,
        top: gt + (c.standTop ?? c.top) - 0.12,
        seedK: n.length * 11,
        step: 0.35,
      });
      block(m, {
        cx: c.lx,
        cz: c.lz,
        hw: c.hw,
        hd: c.hd,
        rot: c.rot,
        top: gt + c.top,
        bottom: gt + (c.standTop ?? c.top) - 0.14,
        seedK: n.length * 13,
        step: 0.4,
        rough: 0.015,
      });
    } else if (n.startsWith('yard_wall')) {
      const gt = ground(c.lx, c.lz);
      block(m, {
        cx: c.lx,
        cz: c.lz,
        hw: c.hw,
        hd: c.hd,
        rot: c.rot,
        top: gt + (c.standTop ?? c.top),
        profile: (u) => gt + (c.standTop ?? c.top) - 0.25 * noise2(u * 3, 1, 107),
        seedK: n.length * 17,
      });
    } else if (n.startsWith('lychgate_wall')) {
      const gt = ground(c.lx, c.lz);
      block(m, { cx: c.lx, cz: c.lz, hw: c.hw, hd: c.hd, top: gt + 1.5, seedK: n.length * 19 });
    } else if (n === 'yew') {
      const g = ground(c.lx, c.lz);
      lathe(
        m,
        c.lx,
        c.lz,
        [
          [c.r * 1.15, g - 0.3],
          [c.r, g + 0.6],
          [c.r * 0.72, g + 2.6],
          [c.r * 0.55, g + 4.2],
          [c.r * 0.3, g + 5.6],
          [0.05, g + 6.4],
        ],
        (p) => mix(WOOD, [0.3, 0.24, 0.2], noise2(p[0] * 4, p[1] * 1.5, 109)),
        12,
        (p) => [p[0] + 0.12 * Math.sin(p[1] * 1.3), p[1], p[2] + 0.1 * Math.cos(p[1])],
      );
      // its dark crown: tiers of drooping needle cards
      for (let k = 0; k < 90; k++) {
        const t = hash(k, 1, 113);
        const y = g + 2.4 + t * (c.top - 2.6);
        const rad = (1 - t) * 2.6 + 0.6;
        const ang = hash(k, 2, 113) * Math.PI * 2;
        card(
          leaf,
          c.lx + Math.cos(ang) * rad * 0.8,
          y - 0.6,
          c.lz + Math.sin(ang) * rad * 0.8,
          1.3,
          1.2,
          ang + 1.57,
          mul(LEAF_YEW, 0.8 + 0.4 * hash(k, 3, 113)),
          -0.35,
        );
      }
    }
  }
  // the lychgate: oak posts and a shingled roof over the approach lane
  const le = C('lychgate_wall_e');
  const lw = C('lychgate_wall_w');
  const gy = ground((le.lx + lw.lx) / 2, le.lz);
  const xa = le.lx + le.hw;
  const xb = lw.lx - lw.hw;
  for (const x of [xa - 0.15, xb + 0.15])
    for (const z of [le.lz - le.hd + 0.25, le.lz + le.hd - 0.25])
      block(m, {
        cx: x,
        cz: z,
        hw: 0.14,
        hd: 0.14,
        top: gy + 3.3,
        bottom: gy + 1.4,
        seedK: x * 3 + z,
        tint: WOOD,
        rough: 0.015,
        step: 0.6,
      });
  const ridgeY = gy + le.top;
  for (const s of [-1, 1]) {
    m.grid2(6, 5, (a, b) => {
      const x = le.lx - le.hw + (lw.lx + lw.hw - (le.lx - le.hw)) * a;
      const z = le.lz + s * (le.hd + 0.4) * (1 - b);
      const y = gy + 3.2 + (ridgeY - gy - 3.2) * b;
      return [[x, y, z], mul(WOOD, 0.75 + 0.3 * hash(Math.floor(a * 9), Math.floor(b * 5), 127))];
    });
  }
}

// ======================= Entrance_Growth =======================
{
  const leaf = mesh('Entrance_Growth', 'KitLeaf');
  const m = mesh('Entrance_Growth', 'KitStone');
  // ivy falls from the wall heads, grass and bramble crowd every footing
  let k = 0;
  for (const c of S.HOLLOW_CRYPT_ENTRANCE_COLLIDERS) {
    if (c.name.startsWith('stairhouse_back')) continue;
    const hw = c.hw ?? c.r;
    const hd = c.hd ?? c.r;
    const cs = Math.cos(c.rot ?? 0);
    const sn = Math.sin(c.rot ?? 0);
    const perim = 2 * (hw + hd);
    const tufts = Math.min(30, Math.ceil(perim * 1.6));
    for (let t = 0; t < tufts; t++, k++) {
      const u = hash(k, 1, 131) * 2 - 1;
      const side = hash(k, 2, 131) > 0.5 ? 1 : -1;
      const alongX = hash(k, 3, 131) > hd / (hw + hd);
      const x = alongX ? u * hw : side * (hw + 0.12);
      const z = alongX ? side * (hd + 0.12) : u * hd;
      const wx = c.lx + x * cs + z * sn;
      const wz = c.lz - x * sn + z * cs;
      const gy = ground(wx, wz) - 0.05;
      card(
        leaf,
        wx,
        gy,
        wz,
        0.5 + 0.4 * hash(k, 4, 131),
        0.35 + 0.4 * hash(k, 5, 131),
        hash(k, 6, 131) * 6.28,
        mul(GRASS, 0.8 + 0.4 * hash(k, 7, 131)),
      );
    }
    if ((c.top ?? 0) > 3 && c.type === 'obb' && !c.name.startsWith('mourner')) {
      const drapes = Math.ceil(hw * 1.2);
      for (let t = 0; t < drapes; t++, k++) {
        const u = hash(k, 8, 137) * 2 - 1;
        const side = hash(k, 9, 137) > 0.5 ? 1 : -1;
        const x = u * hw * 0.9;
        const z = side * (hd + 0.04);
        const wx = c.lx + x * cs + z * sn;
        const wz = c.lz - x * sn + z * cs;
        const len = 1.2 + 2.2 * hash(k, 10, 137);
        const y = Math.min(c.top - 0.9, ground(wx, wz) + 1 + 4 * hash(k, 11, 137));
        // a hanging ivy sheet: a flat card against the face, hanging down
        const yaw = (c.rot ?? 0) + (side > 0 ? Math.PI : 0);
        leaf.grid(2, 3, (a, b) => {
          const tt = a * 2 - 1;
          return [
            [wx + Math.cos(yaw) * 0.45 * tt * cs, y - len * b, wz - Math.sin(yaw) * 0.45 * tt],
            mul(LEAF_IVY, 0.75 + 0.35 * hash(k, Math.floor(b * 3), 139)),
          ];
        });
      }
    }
  }
  // fallen blocks and rubble across the nave
  for (let r = 0; r < 26; r++) {
    const x = -8 + 16 * hash(r, 1, 149);
    const z = -21 + 22 * hash(r, 2, 149);
    const s = 0.18 + 0.3 * hash(r, 3, 149);
    const gy = ground(x, z);
    block(m, {
      cx: x,
      cz: z,
      hw: s,
      hd: s * 0.8,
      rot: hash(r, 4, 149) * 3,
      top: gy + s * 1.2,
      bottom: gy - 0.1,
      seedK: r,
      step: 1,
      rough: 0.03,
    });
  }
}

// ---- write the four raw GLBs ------------------------------------------------------------
const FILES = [
  [
    'hollow_crypt_entrance.glb',
    'CryptEntrance_ROOT',
    ['Entrance_Details', 'Entrance_Gable', 'Entrance_StairHouse'],
  ],
  ['hollow_crypt_entrance_walls.glb', 'CryptEntranceWalls_ROOT', ['Entrance_Nave']],
  ['hollow_crypt_entrance_props.glb', 'CryptEntranceProps_ROOT', ['Entrance_Outside']],
  ['hollow_crypt_entrance_growth.glb', 'CryptEntranceGrowth_ROOT', ['Entrance_Growth']],
];
mkdirSync(RAW, { recursive: true });
const io = new NodeIO();
let total = 0;
for (const [file, rootName, names] of FILES) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const root = doc.createNode(rootName);
  scene.addChild(root);
  const mats = {};
  const matFor = (name) => {
    mats[name] ??= doc
      .createMaterial(name)
      .setBaseColorFactor(name === 'KitVoid' ? [0, 0, 0, 1] : [1, 1, 1, 1])
      .setRoughnessFactor(name === 'KitLeaf' ? 0.82 : name === 'KitVoid' ? 1 : 0.92)
      .setMetallicFactor(0)
      .setDoubleSided(name === 'KitLeaf');
    return mats[name];
  };
  let tris = 0;
  for (const name of names) {
    const meshDoc = doc.createMesh(name);
    for (const [matName, mm] of Object.entries(pieces[name] ?? {})) {
      const pos = new Float32Array(mm.p);
      const col = new Float32Array(mm.c);
      const idx = new Uint32Array(mm.i);
      // flat-ish smooth normals per vertex from the triangles that use it
      const nor = new Float32Array(pos.length);
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
        const ux = pos[b] - pos[a];
        const uy = pos[b + 1] - pos[a + 1];
        const uz = pos[b + 2] - pos[a + 2];
        const vx = pos[c] - pos[a];
        const vy = pos[c + 1] - pos[a + 1];
        const vz = pos[c + 2] - pos[a + 2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        for (const v of [a, b, c]) {
          nor[v] += nx;
          nor[v + 1] += ny;
          nor[v + 2] += nz;
        }
      }
      for (let v = 0; v < nor.length; v += 3) {
        const l = Math.hypot(nor[v], nor[v + 1], nor[v + 2]) || 1;
        nor[v] /= l;
        nor[v + 1] /= l;
        nor[v + 2] /= l;
      }
      const prim = doc
        .createPrimitive()
        .setAttribute(
          'POSITION',
          doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer),
        )
        .setAttribute(
          'NORMAL',
          doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buffer),
        )
        .setAttribute(
          'COLOR_0',
          doc.createAccessor().setType('VEC4').setArray(col).setBuffer(buffer),
        )
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer))
        .setMaterial(matFor(matName));
      meshDoc.addPrimitive(prim);
      tris += mm.triangles;
    }
    root.addChild(doc.createNode(name).setMesh(meshDoc));
  }
  await io.write(path.join(RAW, file), doc);
  total += tris;
  console.log(`${file}: ${tris} triangles, materials ${Object.keys(mats).sort().join(',')}`);
}
console.log(`total ${total} triangles; door (${door.x}, ${door.z}) base ${base.toFixed(3)}`);
