// The stylized hand-painted pass over one texture: masked edge-preserving flattening into
// painted planes (guided filter), exaggerated painted light and shadow (mid-scale value
// clarity in log luminance), brush strokes that follow the paint's own forms (line integral
// convolution of seeded noise along the structure tensor's flow), and optional bolder colour.
// Every luminance change is a zero-mean LOG modulation, so a tinted material's median keeps
// its measured reference (the head tint keys off it). Deterministic: a fixed integer hash.

const LUM = [0.2126, 0.7152, 0.0722];

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / (2 * r + 1);
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Gaussian approximated by three box passes. */
function gauss(src, w, h, sigma) {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  return boxBlur(boxBlur(boxBlur(src, w, h, r), w, h, r), w, h, r);
}

/** Blur that ignores texels outside the mask (atlas padding never bleeds in). */
function maskedGauss(src, mask, w, h, sigma) {
  const n = w * h;
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) sm[i] = src[i] * mask[i];
  const a = gauss(sm, w, h, sigma);
  const b = gauss(mask, w, h, sigma);
  for (let i = 0; i < n; i++) a[i] = b[i] > 1e-4 ? a[i] / b[i] : src[i];
  return a;
}

function maskedBox(src, mask, w, h, r) {
  const n = w * h;
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) sm[i] = src[i] * mask[i];
  const a = boxBlur(sm, w, h, r);
  const b = boxBlur(mask, w, h, r);
  for (let i = 0; i < n; i++) a[i] = b[i] > 1e-4 ? a[i] / b[i] : src[i];
  return a;
}

/** Guided filter of channel p by guide I (both [0,1]), masked. */
function guided(I, p, mask, w, h, r, eps) {
  const n = w * h;
  const mI = maskedBox(I, mask, w, h, r);
  const mp = maskedBox(p, mask, w, h, r);
  const Ip = new Float32Array(n);
  const II = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    Ip[i] = I[i] * p[i];
    II[i] = I[i] * I[i];
  }
  const mIp = maskedBox(Ip, mask, w, h, r);
  const mII = maskedBox(II, mask, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = mIp[i] - mI[i] * mp[i];
    const v = mII[i] - mI[i] * mI[i];
    a[i] = cov / (v + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = maskedBox(a, mask, w, h, r);
  const mb = maskedBox(b, mask, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = ma[i] * I[i] + mb[i];
  return q;
}

/** Flow field (unit vectors along the paint's forms) from the smoothed structure tensor. */
function flow(L, w, h, sigma, seed) {
  const n = w * h;
  const xx = new Float32Array(n);
  const xy = new Float32Array(n);
  const yy = new Float32Array(n);
  const at = (x, y) => L[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx =
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy =
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const i = y * w + x;
      xx[i] = gx * gx;
      xy[i] = gx * gy;
      yy[i] = gy * gy;
    }
  // a weak seeded drift so flat paint still gets coherent (not random) strokes
  const sx = gauss(xx, w, h, sigma);
  const sxy = gauss(xy, w, h, sigma);
  const sy = gauss(yy, w, h, sigma);
  const fx = new Float32Array(n);
  const fy = new Float32Array(n);
  const coh = new Float32Array(n);
  // fallback where the paint has no clear direction: a slowly turning seeded field (patches
  // of parallel dabs, as a brush lays them), never the contour of a soft blob
  const cell = 48;
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const ga = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) ga[j * gw + i] = hash(i, j, seed + 99) * Math.PI;
  for (let i = 0; i < n; i++) {
    const tr = sx[i] + sy[i];
    const det = Math.sqrt((sx[i] - sy[i]) ** 2 + 4 * sxy[i] ** 2);
    const c = tr > 1e-6 ? det / tr : 0;
    const cc = Math.min(1, Math.max(0, (c - 0.25) / 0.5)) * Math.min(1, tr / 0.004);
    coh[i] = cc;
    const sa = 0.5 * Math.atan2(2 * sxy[i], sx[i] - sy[i]) + Math.PI / 2;
    const x = i % w;
    const y = (i / w) | 0;
    const u = x / cell;
    const v = y / cell;
    const i0 = Math.floor(u);
    const j0 = Math.floor(v);
    const tu = u - i0;
    const tv = v - j0;
    let rx = 0;
    let ry = 0;
    for (const [di, dj, wt] of [
      [0, 0, (1 - tu) * (1 - tv)],
      [1, 0, tu * (1 - tv)],
      [0, 1, (1 - tu) * tv],
      [1, 1, tu * tv],
    ]) {
      const a2 = 2 * ga[(j0 + dj) * gw + i0 + di];
      rx += wt * Math.cos(a2);
      ry += wt * Math.sin(a2);
    }
    const rl = Math.hypot(rx, ry) || 1;
    // blend in doubled-angle space (orientation has no sign)
    const bx = cc * Math.cos(2 * sa) + (1 - cc) * (rx / rl);
    const by = cc * Math.sin(2 * sa) + (1 - cc) * (ry / rl);
    const ang = 0.5 * Math.atan2(by, bx);
    fx[i] = Math.cos(ang);
    fy[i] = Math.sin(ang);
  }
  return { fx, fy, coh };
}

/** Brush strokes: LIC of seeded noise along the flow, zero mean, unit deviation. */
function strokes(w, h, fl, len, grain, seed) {
  const n = w * h;
  const noise = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gxq = Math.floor(x / grain);
      const gyq = Math.floor(y / grain);
      noise[y * w + x] = hash(gxq, gyq, seed) - 0.5;
    }
  const nz = grain > 1 ? gauss(noise, w, h, grain * 0.5) : noise;
  const out = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let wsum = 0;
      for (const dir of [1, -1]) {
        let px = x + 0.5;
        let py = y + 0.5;
        let pdx = 0;
        let pdy = 0;
        for (let s = 0; s < len; s++) {
          const ix = Math.min(w - 1, Math.max(0, px | 0));
          const iy = Math.min(h - 1, Math.max(0, py | 0));
          const i = iy * w + ix;
          let dx = fl.fx[i] * dir;
          let dy = fl.fy[i] * dir;
          if (dx * pdx + dy * pdy < 0) {
            dx = -dx;
            dy = -dy;
          }
          const k = 0.5 + 0.5 * Math.cos((Math.PI * s) / len);
          acc += nz[i] * k;
          wsum += k;
          px += dx;
          py += dy;
          pdx = dx;
          pdy = dy;
        }
      }
      out[y * w + x] = acc / wsum;
    }
  let m = 0;
  for (let i = 0; i < n; i++) m += out[i];
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (out[i] - m) ** 2;
  const sd = Math.sqrt(v / n) || 1;
  for (let i = 0; i < n; i++) out[i] = (out[i] - m) / sd;
  return out;
}

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const LIN = new Float32Array(256).map((_, i) => toLin(i / 255));

function median(arr, pick) {
  const v = [];
  for (let i = 0; i < arr.length; i += 3) if (pick(i)) v.push(arr[i]);
  if (!v.length) return null;
  v.sort((a, b) => a - b);
  return v[v.length >> 1];
}

/**
 * Paint one RGBA8 image (sRGB) in LINEAR luminance only: each texel keeps its own chroma
 * ratios (r : g : b), so hue and saturation never move (a tint keys on both), and only its
 * light changes. opts:
 *  smoothR, smoothEps   guided-filter flattening of the luminance into painted planes
 *  clarity, claritySigma, claritySmall   painted light/shadow (log-luminance band gain)
 *  stroke, strokeLen, strokeGrain, strokeFloor, flowSigma   brush strokes along the flow
 *  mottle, mottleSigma  soft isotropic value variation
 *  maps                 bake.mjs maps at this size: light, curv, fu, fv, cov, mat
 *  lightGain, curvGain  the baked key light and curvature (log-luminance gains)
 *  saturation           chroma gain for cloth (1 = keep); grey: force neutral
 * The linear median luminance of every material region the maps name (and of the rest) is
 * restored at the end: a tinted material keeps its measured reference.
 */
export function paint(rgba, w, h, opts) {
  const n = w * h;
  const L = new Float32Array(n);
  const mask = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = LIN[rgba[4 * i]];
    const g = LIN[rgba[4 * i + 1]];
    const b = LIN[rgba[4 * i + 2]];
    L[i] = LUM[0] * r + LUM[1] * g + LUM[2] * b;
    mask[i] = rgba[4 * i] + rgba[4 * i + 1] + rgba[4 * i + 2] > 4 ? 1 : 0;
  }
  // 1. painted planes (guided by itself: an edge-preserving smooth of the light)
  // in perceptual (gamma) units, so the epsilon means the same on dark and light paint
  let FL = L;
  if (opts.smoothR) {
    const G = new Float32Array(n);
    for (let i = 0; i < n; i++) G[i] = Math.max(0, L[i]) ** (1 / 2.2);
    const FG = guided(G, G, mask, w, h, opts.smoothR, opts.smoothEps);
    FL = new Float32Array(n);
    for (let i = 0; i < n; i++) FL[i] = Math.max(0, FG[i]) ** 2.2;
  }
  const logL = new Float32Array(n);
  for (let i = 0; i < n; i++) logL[i] = Math.log(Math.max(2e-4, FL[i]));
  // 2. light and shadow
  const lo = maskedGauss(logL, mask, w, h, opts.claritySmall ?? 1.5);
  const hi = maskedGauss(logL, mask, w, h, opts.claritySigma ?? 12);
  const maps = opts.maps;
  // 3. strokes: along the mesh's strand flow where it is baked, else the paint's own forms
  let fl = null;
  if (opts.stroke) {
    fl = flow(lo, w, h, opts.flowSigma ?? 4, opts.seed ?? 1);
    if (maps?.fu && opts.meshFlow) {
      const sfu = gauss(maps.fu, w, h, 2);
      const sfv = gauss(maps.fv, w, h, 2);
      for (let i = 0; i < n; i++) {
        const l = Math.hypot(sfu[i], sfv[i]);
        if (maps.cov[i] && l > 0.2) {
          fl.fx[i] = sfu[i] / l;
          fl.fy[i] = sfv[i] / l;
          fl.coh[i] = 1;
        }
      }
    }
  }
  const st = fl
    ? strokes(w, h, fl, opts.strokeLen ?? 10, opts.strokeGrain ?? 1, opts.seed ?? 1)
    : null;
  // broad locks (hair): the same flow at a coarser grain, so strands gather into painted clumps
  const lk =
    fl && opts.lock
      ? strokes(w, h, fl, opts.lockLen ?? 18, opts.lockGrain ?? 4, (opts.seed ?? 1) + 17)
      : null;
  let mot = null;
  if (opts.mottle) {
    const nz = new Float32Array(n);
    for (let i = 0; i < n; i++) nz[i] = hash(i % w, (i / w) | 0, (opts.seed ?? 1) + 5) - 0.5;
    mot = gauss(nz, w, h, opts.mottleSigma ?? 5);
    let v = 0;
    for (let i = 0; i < n; i++) v += mot[i] * mot[i];
    const sd = Math.sqrt(v / n) || 1;
    for (let i = 0; i < n; i++) mot[i] /= sd;
  }
  let lightM = null;
  let curvM = null;
  if (maps) {
    const cm = new Float32Array(n);
    for (let i = 0; i < n; i++) cm[i] = maps.cov[i];
    lightM = maskedGauss(maps.light, cm, w, h, 1.2);
    curvM = maskedGauss(maps.curv, cm, w, h, 1.2);
  }
  const floor = opts.strokeFloor ?? 1;
  // a painted highlight ADDS light on lit planes and ridges, scaled to the paint's median, so
  // near-black cloth (where a ratio changes nothing visible) still catches a stroke of light
  const medAll = median(FL, (i) => mask[i] > 0) ?? 0;
  const hl = (opts.highlight ?? 0) * medAll;
  const outL = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const band = Math.max(-0.8, Math.min(0.8, lo[i] - hi[i]));
    let m = (opts.clarity ?? 0) * band;
    if (st) m += opts.stroke * (floor + (1 - floor) * fl.coh[i]) * st[i];
    if (mot) m += opts.mottle * mot[i];
    if (lk) m += opts.lock * (floor + (1 - floor) * fl.coh[i]) * lk[i];
    let lit = 0;
    if (maps?.cov[i]) {
      lit = (opts.lightGain ?? 0) * lightM[i] + (opts.curvGain ?? 0) * curvM[i];
      m += lit;
    }
    outL[i] = FL[i] * Math.exp(m) + (hl && lit > 0 ? hl * lit * (st ? 1 + 0.5 * st[i] : 1) : 0);
  }
  // restore each material region's linear median (and the rest's)
  const regions = new Map();
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const id = maps?.mat ? maps.mat[i] : -1;
    if (!regions.has(id)) regions.set(id, true);
  }
  const gain = new Map();
  for (const id of regions.keys()) {
    const pick = (i) => mask[i] && (maps?.mat ? maps.mat[i] : -1) === id;
    const a = median(L, pick);
    const b = median(outL, pick);
    gain.set(id, a && b ? a / b : 1);
  }
  const out = Buffer.alloc(n * 4);
  const sat = opts.saturation ?? 1;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) {
      for (let k = 0; k < 4; k++) out[4 * i + k] = rgba[4 * i + k];
      continue;
    }
    const lt = outL[i] * gain.get(maps?.mat ? maps.mat[i] : -1);
    const r = LIN[rgba[4 * i]];
    const g = LIN[rgba[4 * i + 1]];
    const b = LIN[rgba[4 * i + 2]];
    const l0 = Math.max(1e-5, L[i]);
    let cr = (r / l0) * lt;
    let cg = (g / l0) * lt;
    let cb = (b / l0) * lt;
    if (opts.grey) cr = cg = cb = lt;
    else if (sat !== 1) {
      cr = lt + (cr - lt) * sat;
      cg = lt + (cg - lt) * sat;
      cb = lt + (cb - lt) * sat;
    }
    const mx = Math.max(cr, cg, cb);
    if (mx > 1) {
      cr /= mx;
      cg /= mx;
      cb /= mx;
    }
    out[4 * i] = Math.round(255 * toSrgb(Math.max(0, cr)));
    out[4 * i + 1] = Math.round(255 * toSrgb(Math.max(0, cg)));
    out[4 * i + 2] = Math.round(255 * toSrgb(Math.max(0, cb)));
    out[4 * i + 3] = rgba[4 * i + 3];
  }
  return out;
}
