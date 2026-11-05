// WYNDLEWOOD weapon tiers: build the tier GLBs of one base model.
//
//   node scripts/assets/wynd_weapons/build_tiers.mjs --type sword --base <normalized.glb> \
//     [--out public/models/weapons] [--tiers starter,mid,fine]
//
// The base is a pipeline-normalized held model (origin at the grip, along +Y, one atlas).
// Each tier is the same mesh and UVs with its atlas repainted by the tier recipe
// (tier_core.mjs) and, for the tiers that carry them, small add-ons drawn from swatches
// painted into a free corner of that same atlas: no tier adds a material or a texture.
// Deterministic: rerunning on the same base writes the same files.
// biome-ignore assist/source/organizeImports: sharp must initialize before @gltf-transform on Windows.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dedup, prune, quantize } from '@gltf-transform/functions';
import { openGlb, saveGlb } from '../../asset_pipeline/lib/glb.mjs';
import {
  addonsFor,
  bandGeometry,
  dilatePositions,
  findFreeBlock,
  gemGeometry,
  rasterizeUv,
  repaintTexel,
  WYND_RECIPES,
  WYND_SWATCHES,
  WYND_TIERS,
  WYND_TYPES,
  wyndTierKey,
  zoneCoords,
} from './tier_core.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : dflt;
};

const type = opt('type');
const basePath = opt('base');
const outDir = opt('out', 'public/models/weapons');
const tiers = opt('tiers', WYND_TIERS.join(',')).split(',');
if (!WYND_TYPES[type] || !basePath) {
  console.error('usage: --type <sword|axe2h|mace|staff|bow|shield|tome> --base <glb>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const SWATCH_CELL = 4;
const SWATCH_ORDER = Object.keys(WYND_SWATCHES);

function primitivesOf(doc) {
  const out = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) out.push({ mesh, prim });
  }
  return out;
}

function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { prim } of prims) {
    const a = prim.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i += 3) {
      for (let d = 0; d < 3; d++) {
        if (a[i + d] < min[d]) min[d] = a[i + d];
        if (a[i + d] > max[d]) max[d] = a[i + d];
      }
    }
  }
  return [min, max];
}

function indicesOf(prim) {
  const idx = prim.getIndices();
  if (idx) return idx.getArray();
  const n = prim.getAttribute('POSITION').getCount();
  return Uint32Array.from({ length: n }, (_, i) => i);
}

async function decode(texture) {
  const { data, info } = await sharp(Buffer.from(texture.getImage()))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

async function encode(texture, data, W, H) {
  const buf = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 84, alphaQuality: 100, effort: 6 })
    .toBuffer();
  texture.setImage(new Uint8Array(buf)).setMimeType('image/webp');
}

/** Vertices of all primitives inside a height band, as [x, y, z] triples. */
function band(prims, y, halfH) {
  const pts = [];
  for (const { prim } of prims) {
    const a = prim.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i += 3) {
      if (Math.abs(a[i + 1] - y) <= halfH) pts.push([a[i], a[i + 1], a[i + 2]]);
    }
  }
  return pts;
}

function anchorFor(addon, prims, bounds) {
  const [min, max] = bounds;
  const h = max[1] - min[1];
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const at = (y, half0) => {
    // a low-poly shaft has vertices only at its ends: widen the band until it holds a
    // ring's worth of them
    let half = half0;
    let pts = band(prims, y, half);
    while (pts.length < 6 && half < 0.15 * h) {
      half *= 2;
      pts = band(prims, y, half);
    }
    if (!pts.length) return null;
    let x = 0;
    let z = 0;
    let zMax = -Infinity;
    let rMax = 0;
    for (const p of pts) {
      x += p[0];
      z += p[2];
    }
    x /= pts.length;
    z /= pts.length;
    for (const p of pts) {
      zMax = Math.max(zMax, p[2]);
      rMax = Math.max(rMax, Math.hypot(p[0] - x, p[2] - z));
    }
    return { x, z, zMax, rMax };
  };
  if (addon.kind === 'band') {
    const y = min[1] + addon.t * h;
    const s = at(y, 0.012 * h);
    return s && { y, ...s };
  }
  if (addon.at === 'foot') {
    const y = min[1] + 0.035 * h;
    const s = at(y, 0.02 * h);
    return s && { c: [s.x, y, s.zMax + addon.size * 0.15] };
  }
  if (addon.at === 'front-mid') {
    const s = at(cy, 0.03 * h);
    return s && { c: [s.x, cy, s.zMax + addon.size * 0.15] };
  }
  if (addon.at === 'front-center') {
    // the highest face point near the board's middle
    let zMax = -Infinity;
    const rad = 0.08 * h;
    for (const { prim } of prims) {
      const a = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < a.length; i += 3) {
        if (Math.hypot(a[i] - cx, a[i + 1] - cy) < rad) zMax = Math.max(zMax, a[i + 2]);
      }
    }
    return Number.isFinite(zMax) ? { c: [cx, cy, zMax + addon.size * 0.1] } : null;
  }
  return null;
}

function accessor(doc, buffer, type, array) {
  return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

/** Seat the base in the fist: the pipeline centres a model on its bounding BOX, so a
 *  one-sided head (an axe) leaves the haft beside the origin and the weapon floats beside
 *  the hand. Re-centre X and Z on the handle where the hand holds it (the vertices around
 *  the grip height, y = 0), and turn a one-sided head to the hand's +X, the side the
 *  WOC hold presents to the cut (src/render/characters/weapon_grip.ts, the axe rows). */
function seatInFist(prims, bounds) {
  if (BOARD_TYPES.has(type)) return;
  const h = bounds[1][1] - bounds[0][1];
  let pts = band(prims, 0, 0.03 * h);
  for (let half = 0.06 * h; pts.length < 6 && half < 0.2 * h; half *= 2) pts = band(prims, 0, half);
  if (!pts.length) return;
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p[0];
    cz += p[2];
  }
  cx /= pts.length;
  cz /= pts.length;
  // the head's side, from the upper part of the weapon after the re-centre
  let hx = 0;
  let hn = 0;
  for (const { prim } of prims) {
    const a = prim.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i += 3) {
      if (a[i + 1] > bounds[0][1] + 0.6 * h) {
        hx += a[i] - cx;
        hn++;
      }
    }
  }
  const flip = ONE_SIDED_HEAD.has(type) && hn > 0 && hx / hn < 0;
  for (const { prim } of prims) {
    const pos = prim.getAttribute('POSITION');
    const a = pos.getArray();
    for (let i = 0; i < a.length; i += 3) {
      a[i] -= cx;
      a[i + 2] -= cz;
      if (flip) {
        a[i] = -a[i];
        a[i + 2] = -a[i + 2];
      }
    }
    pos.setArray(a);
    if (!flip) continue;
    for (const sem of ['NORMAL', 'TANGENT']) {
      const acc = prim.getAttribute(sem);
      if (!acc) continue;
      const v = acc.getArray();
      const n = acc.getElementSize();
      for (let i = 0; i < v.length; i += n) {
        v[i] = -v[i];
        v[i + 2] = -v[i + 2];
      }
      acc.setArray(v);
    }
  }
}

// boards seat on their middle; a bow's grip band also cuts its string, so its box centre stays
const BOARD_TYPES = new Set(['shield', 'tome', 'bow']);
const ONE_SIDED_HEAD = new Set(['axe2h', 'axe1h']);

async function buildTier(tier) {
  const doc = await openGlb(basePath);
  const prims = primitivesOf(doc);
  seatInFist(prims, boundsOf(prims));
  const bounds = boundsOf(prims);
  const h = bounds[1][1] - bounds[0][1];
  const material = prims[0].prim.getMaterial();
  const colorTex = material.getBaseColorTexture();
  if (!colorTex) throw new Error('base has no base colour texture');
  for (const { prim } of prims) {
    if (prim.getMaterial() !== material) throw new Error('base must carry one material');
  }

  const { data, W, H } = await decode(colorTex);
  const cov = new Uint8Array(W * H);
  const pos = new Float32Array(W * H * 3);
  for (const { prim } of prims) {
    const uv = prim.getAttribute('TEXCOORD_0').getArray();
    const p = prim.getAttribute('POSITION').getArray();
    const r = rasterizeUv(W, H, uv, p, indicesOf(prim));
    for (let k = 0; k < W * H; k++) {
      if (r.covered[k]) {
        cov[k] = 1;
        pos[k * 3] = r.pos[k * 3];
        pos[k * 3 + 1] = r.pos[k * 3 + 1];
        pos[k * 3 + 2] = r.pos[k * 3 + 2];
      }
    }
  }
  const spread = dilatePositions(W, H, cov, pos, 4);

  // the model's own metalness (B of its metallic-roughness map), when it carries one
  const mrSrc = material.getMetallicRoughnessTexture();
  const mr = mrSrc && mrSrc !== colorTex ? await decode(mrSrc) : null;
  const metalAt = (k) => {
    if (!mr) return null;
    const x = Math.min(mr.W - 1, Math.floor(((k % W) + 0.5) * (mr.W / W)));
    const y = Math.min(mr.H - 1, Math.floor((Math.floor(k / W) + 0.5) * (mr.H / H)));
    return (mr.data[(y * mr.W + x) * 4 + 2] / 255) * material.getMetallicFactor();
  };

  // repaint
  const out = Buffer.from(data);
  const P = [0, 0, 0];
  for (let k = 0; k < W * H; k++) {
    const i = k * 4;
    let zone = null;
    if (spread[k]) {
      P[0] = pos[k * 3];
      P[1] = pos[k * 3 + 1];
      P[2] = pos[k * 3 + 2];
      zone = zoneCoords(P, bounds, type);
    }
    const rgb = repaintTexel(tier, type, [data[i], data[i + 1], data[i + 2]], zone, metalAt(k));
    out[i] = rgb[0];
    out[i + 1] = rgb[1];
    out[i + 2] = rgb[2];
  }

  // add-ons, drawn from swatches in a free block of the same atlas
  const addons = addonsFor(tier, type);
  let placed = 0;
  if (addons.length) {
    const blockSize = SWATCH_CELL * SWATCH_ORDER.length;
    const block = findFreeBlock(W, H, spread, blockSize, 3);
    const swatchUv = {};
    if (!block) {
      // a packed atlas: borrow, for each swatch, the repainted texel nearest its colour
      // inside a fully painted 3x3 neighbourhood (so the bilinear tap stays on it)
      for (const name of SWATCH_ORDER) {
        const want = WYND_SWATCHES[name];
        let best = -1;
        let bestD = Infinity;
        for (let y = 1; y < H - 1; y++) {
          for (let x = 1; x < W - 1; x++) {
            let inside = true;
            for (let dy = -1; dy <= 1 && inside; dy++)
              for (let dx = -1; dx <= 1; dx++) if (cov[(y + dy) * W + x + dx] !== 1) inside = false;
            if (!inside) continue;
            const i = (y * W + x) * 4;
            const d =
              (out[i] - want[0]) ** 2 + (out[i + 1] - want[1]) ** 2 + (out[i + 2] - want[2]) ** 2;
            if (d < bestD) {
              bestD = d;
              best = y * W + x;
            }
          }
        }
        swatchUv[name] = [((best % W) + 0.5) / W, (Math.floor(best / W) + 0.5) / H];
      }
      console.warn(`  ${type}/${tier}: packed atlas, add-ons borrow the nearest painted texels`);
    }
    if (block)
      SWATCH_ORDER.forEach((name, n) => {
        const rgb = WYND_SWATCHES[name];
        const x0 = block.x + n * SWATCH_CELL;
        for (let y = block.y; y < block.y + SWATCH_CELL; y++) {
          for (let x = x0; x < x0 + SWATCH_CELL; x++) {
            const i = (y * W + x) * 4;
            out[i] = rgb[0];
            out[i + 1] = rgb[1];
            out[i + 2] = rgb[2];
            out[i + 3] = 255;
          }
        }
        swatchUv[name] = [(x0 + SWATCH_CELL / 2) / W, (block.y + SWATCH_CELL / 2) / H];
      });
    // the other maps get the same block made plain: polished metal in a
    // metallic-roughness map (G roughness, B metalness), a flat normal in a normal map
    const paintBlock = async (tex, write) => {
      if (!block || !tex || tex === colorTex) return;
      const m = await decode(tex);
      const sx = m.W / W;
      const sy = m.H / H;
      for (let y = Math.floor(block.y * sy); y < Math.ceil((block.y + SWATCH_CELL) * sy); y++) {
        for (let x = Math.floor(block.x * sx); x < Math.ceil((block.x + blockSize) * sx); x++) {
          write(m.data, (y * m.W + x) * 4);
        }
      }
      await encode(tex, m.data, m.W, m.H);
    };
    await paintBlock(material.getMetallicRoughnessTexture(), (d, i) => {
      d[i + 1] = 90;
      d[i + 2] = 230;
    });
    await paintBlock(material.getNormalTexture(), (d, i) => {
      d[i] = 128;
      d[i + 1] = 128;
      d[i + 2] = 255;
    });
    const mesh = prims[0].mesh;
    const buffer = doc.getRoot().listBuffers()[0];
    const ref = prims[0].prim;
    for (const addon of addons) {
      const anchor = anchorFor(addon, prims, bounds);
      if (!anchor) {
        console.warn(`  ${type}/${tier}: no anchor for ${addon.kind} ${addon.at ?? addon.t}`);
        continue;
      }
      const geo =
        addon.kind === 'band'
          ? bandGeometry(
              anchor.x,
              anchor.z,
              anchor.y,
              anchor.rMax * 1.1 + 0.004,
              Math.max(0.03 * h, 0.025),
            )
          : gemGeometry(anchor.c, addon.size * (h / 2), 2);
      const n = geo.positions.length / 3;
      const uv = new Float32Array(n * 2);
      for (let v = 0; v < n; v++) {
        uv[v * 2] = swatchUv[addon.swatch][0];
        uv[v * 2 + 1] = swatchUv[addon.swatch][1];
      }
      const prim = doc
        .createPrimitive()
        .setMaterial(material)
        .setAttribute('POSITION', accessor(doc, buffer, 'VEC3', new Float32Array(geo.positions)))
        .setAttribute('NORMAL', accessor(doc, buffer, 'VEC3', new Float32Array(geo.normals)))
        .setAttribute('TEXCOORD_0', accessor(doc, buffer, 'VEC2', uv));
      // match the base primitive's attribute set, so the loader keys the add-on on the
      // SAME material variant (a missing COLOR_0 or TANGENT would mint another program)
      for (const sem of ref.listSemantics()) {
        if (prim.getAttribute(sem)) continue;
        const src = ref.getAttribute(sem);
        const size = src.getElementSize();
        const arr = new Float32Array(n * size);
        const fill =
          sem === 'TANGENT' ? [1, 0, 0, 1] : sem.startsWith('COLOR') ? [1, 1, 1, 1] : [0, 0, 0, 0];
        for (let v = 0; v < n; v++) {
          for (let d = 0; d < size; d++) arr[v * size + d] = fill[d];
          if (sem.startsWith('TEXCOORD')) arr.set(uv.subarray(v * 2, v * 2 + 2), v * 2);
        }
        prim.setAttribute(sem, accessor(doc, buffer, src.getType(), arr));
      }
      mesh.addPrimitive(prim);
      placed++;
    }
  }
  await encode(colorTex, out, W, H);

  const recipe = WYND_RECIPES[tier];
  material
    .setRoughnessFactor(Math.min(1, material.getRoughnessFactor() * recipe.roughness))
    .setMetallicFactor(Math.min(1, material.getMetallicFactor() * recipe.metalness));
  material.setName(`${wyndTierKey(type, tier)}_mat`);

  // quantized attributes, like the shipped painted packs (a third of the float bytes)
  await doc.transform(prune(), dedup(), quantize());
  const dest = join(outDir, `${wyndTierKey(type, tier)}.glb`);
  await saveGlb(doc, dest);
  return { tier, dest, addons: placed, atlas: `${W}x${H}` };
}

for (const tier of tiers) {
  const r = await buildTier(tier);
  console.log(`${type} ${r.tier}: ${r.dest} (${r.atlas}, ${r.addons} add-ons)`);
}
