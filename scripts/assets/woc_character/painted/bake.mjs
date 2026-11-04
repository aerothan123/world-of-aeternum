// Mesh-driven maps for the paint pass, rasterized into a texture's own UV space: the painted
// key light a stylized texture carries (up-facing planes lit, undersides and the lower body in
// shade), a curvature term (convex edges catch a highlight, creases hold shadow) and the strand
// flow of hair (the 3D hang of each lock projected into UV space), so strokes follow the real
// strands instead of the atlas layout. Read from the shipped GLB itself (meshopt decoded).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { WocLodExtension } from '../woc_lod_extension.mjs';

let io = null;
async function getIo() {
  if (io) return io;
  await MeshoptDecoder.ready;
  io = new NodeIO()
    .registerExtensions([...ALL_EXTENSIONS, WocLodExtension])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io;
}

function readAttr(acc) {
  const n = acc.getCount();
  const k = acc.getElementSize();
  const out = new Float32Array(n * k);
  const el = [];
  for (let i = 0; i < n; i++) {
    acc.getElement(i, el);
    for (let j = 0; j < k; j++) out[i * k + j] = el[j];
  }
  return out;
}

/** Every primitive drawing image `imageName` (by texture image name), in world rest space. */
export async function primitivesFor(file, imageName) {
  const doc = await (await getIo()).read(file);
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const tex = mat?.getBaseColorTexture();
      if (!tex || (imageName && tex.getName() !== imageName && tex.getURI() !== imageName))
        continue;
      const pos = readAttr(prim.getAttribute('POSITION'));
      const uv = readAttr(prim.getAttribute('TEXCOORD_0'));
      const nrmA = prim.getAttribute('NORMAL');
      const nrm = nrmA ? readAttr(nrmA) : null;
      const idx = prim.getIndices()
        ? Array.from(prim.getIndices().getArray())
        : [...Array(pos.length / 3).keys()];
      // to world (rest): positions by the full matrix, normals by its 3x3 (no shear here)
      const P = new Float32Array(pos.length);
      const N = new Float32Array(pos.length);
      for (let i = 0; i < pos.length / 3; i++) {
        const [x, y, z] = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
        P[3 * i] = m[0] * x + m[4] * y + m[8] * z + m[12];
        P[3 * i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        P[3 * i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (nrm) {
          const [a, b, c] = [nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]];
          const nx = m[0] * a + m[4] * b + m[8] * c;
          const ny = m[1] * a + m[5] * b + m[9] * c;
          const nz = m[2] * a + m[6] * b + m[10] * c;
          const l = Math.hypot(nx, ny, nz) || 1;
          N[3 * i] = nx / l;
          N[3 * i + 1] = ny / l;
          N[3 * i + 2] = nz / l;
        }
      }
      out.push({ name: node.getName(), mat: mat.getName(), P, N: nrm ? N : null, uv, idx });
    }
  }
  return out;
}

function vertexNormals(p) {
  const N = new Float32Array(p.P.length);
  for (let t = 0; t < p.idx.length; t += 3) {
    const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
    const e1 = [0, 1, 2].map((k) => p.P[3 * b + k] - p.P[3 * a + k]);
    const e2 = [0, 1, 2].map((k) => p.P[3 * c + k] - p.P[3 * a + k]);
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) N[3 * v + k] += n[k];
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l;
    N[i + 1] /= l;
    N[i + 2] /= l;
  }
  return N;
}

/** Per vertex convexity: the mean of n . (neighbour - p) / |neighbour - p| over its edges
 *  (negative: a ridge, positive: a crease), welded by position so UV seams do not break it. */
function curvature(p) {
  const nv = p.P.length / 3;
  const key = (i) =>
    `${Math.round(p.P[3 * i] * 2e4)},${Math.round(p.P[3 * i + 1] * 2e4)},${Math.round(p.P[3 * i + 2] * 2e4)}`;
  const weld = new Map();
  const rep = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = key(i);
    if (!weld.has(k)) weld.set(k, i);
    rep[i] = weld.get(k);
  }
  const sum = new Float32Array(nv);
  const cnt = new Float32Array(nv);
  const N = p.N;
  const edge = (i, j) => {
    const a = rep[i];
    const b = rep[j];
    const d = [0, 1, 2].map((k) => p.P[3 * b + k] - p.P[3 * a + k]);
    const l = Math.hypot(...d);
    if (l < 1e-7) return;
    sum[a] += (N[3 * a] * d[0] + N[3 * a + 1] * d[1] + N[3 * a + 2] * d[2]) / l;
    cnt[a] += 1;
  };
  for (let t = 0; t < p.idx.length; t += 3) {
    const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
    edge(a, b);
    edge(b, a);
    edge(b, c);
    edge(c, b);
    edge(a, c);
    edge(c, a);
  }
  const C = new Float32Array(nv);
  for (let i = 0; i < nv; i++) C[i] = cnt[rep[i]] ? sum[rep[i]] / cnt[rep[i]] : 0;
  return C;
}

/**
 * Rasterize the maps for a w x h texture. Returns Float32 maps (per texel) and a coverage mask:
 *  light   painted key light term in [-1, 1] (n . key, lifted toward the top of the model)
 *  curv    convexity, scaled to about [-1, 1] (positive: ridge)
 *  fu, fv  unit strand flow in texel space (hair), 0 where not covered
 */
export function bakeMaps(prims, w, h, opts = {}) {
  const n = w * h;
  const light = new Float32Array(n);
  const curv = new Float32Array(n);
  const fu = new Float32Array(n);
  const fv = new Float32Array(n);
  const cov = new Uint8Array(n);
  const mat = new Int16Array(n).fill(-1);
  const matIds = new Map();
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const p of prims)
    for (let i = 1; i < p.P.length; i += 3) {
      ymin = Math.min(ymin, p.P[i]);
      ymax = Math.max(ymax, p.P[i]);
    }
  // symmetric key (mirrored UV halves share texels): from above and in front
  const key = opts.key ?? [0, 0.85, 0.5];
  const kl = Math.hypot(...key);
  const K = key.map((x) => x / kl);
  const center = opts.flowCenter ?? null; // hair: strands run away from the crown, then down
  for (const p of prims) {
    if (!p.N) p.N = vertexNormals(p);
    if (!matIds.has(p.mat)) matIds.set(p.mat, matIds.size);
    const mid = matIds.get(p.mat);
    const C = curvature(p);
    // robust scale of the convexity
    const abs = Array.from(C, Math.abs).sort((a, b) => a - b);
    const cs = abs[Math.floor(abs.length * 0.9)] || 1;
    for (let t = 0; t < p.idx.length; t += 3) {
      const vi = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
      const U = vi.map((v) => p.uv[2 * v] * w - 0.5);
      const V = vi.map((v) => p.uv[2 * v + 1] * h - 0.5);
      const area = (U[1] - U[0]) * (V[2] - V[0]) - (U[2] - U[0]) * (V[1] - V[0]);
      if (Math.abs(area) < 1e-9) continue;
      // 3D strand direction for this triangle, projected to texel space
      let du = 0;
      let dv = 0;
      if (center) {
        const P0 = [0, 1, 2].map((k) => p.P[3 * vi[0] + k]);
        const e1 = [0, 1, 2].map((k) => p.P[3 * vi[1] + k] - P0[k]);
        const e2 = [0, 1, 2].map((k) => p.P[3 * vi[2] + k] - P0[k]);
        const tc = [0, 1, 2].map(
          (k) => (p.P[3 * vi[0] + k] + p.P[3 * vi[1] + k] + p.P[3 * vi[2] + k]) / 3,
        );
        const out = tc.map((x, k) => x - center[k]);
        const ol = Math.hypot(...out) || 1;
        // away from the crown, bending down as a lock falls
        const d = [out[0] / ol, out[1] / ol - 1.2, out[2] / ol];
        // d = a e1 + b e2 (least squares)
        const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
        const a11 = dot(e1, e1);
        const a12 = dot(e1, e2);
        const a22 = dot(e2, e2);
        const b1 = dot(d, e1);
        const b2 = dot(d, e2);
        const det = a11 * a22 - a12 * a12;
        if (Math.abs(det) > 1e-14) {
          const a = (b1 * a22 - b2 * a12) / det;
          const b = (a11 * b2 - a12 * b1) / det;
          du = a * (U[1] - U[0]) + b * (U[2] - U[0]);
          dv = a * (V[1] - V[0]) + b * (V[2] - V[0]);
          const l = Math.hypot(du, dv) || 1;
          du /= l;
          dv /= l;
        }
      }
      const x0 = Math.max(0, Math.floor(Math.min(...U)));
      const x1 = Math.min(w - 1, Math.ceil(Math.max(...U)));
      const y0 = Math.max(0, Math.floor(Math.min(...V)));
      const y1 = Math.min(h - 1, Math.ceil(Math.max(...V)));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const l1 = ((U[1] - x) * (V[2] - y) - (U[2] - x) * (V[1] - y)) / area;
          const l2 = ((U[2] - x) * (V[0] - y) - (U[0] - x) * (V[2] - y)) / area;
          const l3 = 1 - l1 - l2;
          if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
          const i = y * w + x;
          const nn = [0, 1, 2].map(
            (k) => l1 * p.N[3 * vi[0] + k] + l2 * p.N[3 * vi[1] + k] + l3 * p.N[3 * vi[2] + k],
          );
          const nl = Math.hypot(...nn) || 1;
          const ndl = (nn[0] * K[0] + nn[1] * K[1] + nn[2] * K[2]) / nl;
          const yy = l1 * p.P[3 * vi[0] + 1] + l2 * p.P[3 * vi[1] + 1] + l3 * p.P[3 * vi[2] + 1];
          const hgt = (yy - ymin) / Math.max(1e-6, ymax - ymin);
          light[i] = 0.75 * ndl + (opts.heightGain ?? 0) * (hgt - 0.5);
          curv[i] = -Math.max(
            -1.5,
            Math.min(1.5, (l1 * C[vi[0]] + l2 * C[vi[1]] + l3 * C[vi[2]]) / cs),
          );
          fu[i] = du;
          fv[i] = dv;
          cov[i] = 1;
          mat[i] = mid;
        }
    }
  }
  return { light, curv, fu, fv, cov, mat, matIds };
}
