// Pure grid detection for Wyndlewood painted sheets (no I/O, pinned by
// tests/wyndlewood_2d_grid_core.test.ts). A sheet is GRID x GRID cells split by thin dark
// rules; the generator does not always place them exactly on the even split, so each rule is
// found as the darkest band near its expected position.

/** Mean of each column (axis 'x') or row (axis 'y') of a greyscale raster. */
export function profile(gray, width, height, axis) {
  const n = axis === 'x' ? width : height;
  const out = new Float64Array(n);
  if (axis === 'x') {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[x] += gray[y * width + x];
    for (let x = 0; x < width; x++) out[x] /= height;
  } else {
    for (let y = 0; y < height; y++) {
      let s = 0;
      for (let x = 0; x < width; x++) s += gray[y * width + x];
      out[y] = s / width;
    }
  }
  return out;
}

function smooth(p, r) {
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(p.length - 1, i + r); j++) {
      s += p[j];
      c++;
    }
    out[i] = s / c;
  }
  return out;
}

/** Rule positions [0..grid] along one axis. Interior rules: darkest smoothed sample within
 *  +-window of the even split. Outer edges: a dark band near the border counts only when it is
 *  clearly darker than the profile median, else the image edge. */
export function findRules(p, grid, { windowFrac = 0.18 } = {}) {
  const n = p.length;
  const cell = n / grid;
  const s = smooth(p, Math.max(1, Math.round(n / 400)));
  const sorted = [...s].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const rules = [];
  for (let k = 0; k <= grid; k++) {
    const c = k * cell;
    const w = cell * windowFrac;
    const lo = Math.max(0, Math.round(c - w));
    const hi = Math.min(n - 1, Math.round(c + w));
    let best = Math.round(Math.min(Math.max(c, 0), n - 1));
    for (let i = lo; i <= hi; i++) if (s[i] < s[best]) best = i;
    if (k === 0 || k === grid) {
      const d = Math.max(4, Math.round(n / 100));
      const around = Math.min(s[Math.max(0, best - d)], s[Math.min(n - 1, best + d)]);
      if (!(s[best] < median * 0.8 && s[best] < around * 0.85)) best = k === 0 ? 0 : n - 1;
    }
    rules.push(best);
  }
  return rules;
}

/** Cell rectangles (row-major) inside the rules, inset by `insetFrac` of the cell size and
 *  center-cropped to a square. */
export function cellRects(xRules, yRules, { insetFrac = 0.035 } = {}) {
  const rects = [];
  for (let r = 0; r < yRules.length - 1; r++) {
    for (let c = 0; c < xRules.length - 1; c++) {
      const x0 = xRules[c];
      const x1 = xRules[c + 1];
      const y0 = yRules[r];
      const y1 = yRules[r + 1];
      const inset = Math.round(Math.min(x1 - x0, y1 - y0) * insetFrac);
      const w = x1 - x0 - 2 * inset;
      const h = y1 - y0 - 2 * inset;
      const side = Math.max(1, Math.min(w, h));
      rects.push({
        left: x0 + inset + Math.floor((w - side) / 2),
        top: y0 + inset + Math.floor((h - side) / 2),
        width: side,
        height: side,
      });
    }
  }
  return rects;
}

/** Pull each side of a cell rectangle in past a dark rule that sits inside its outer band
 *  (double gutters, an outer frame line), so no rule survives in the master. */
export function refineRect(gray, width, rect, { bandFrac = 0.14 } = {}) {
  const { left, top, width: w, height: h } = rect;
  const lineMean = (axis, pos) => {
    let sum = 0;
    if (axis === 'x') for (let y = top; y < top + h; y++) sum += gray[y * width + pos];
    else for (let x = left; x < left + w; x++) sum += gray[pos * width + x];
    return sum / (axis === 'x' ? h : w);
  };
  const band = Math.round(Math.min(w, h) * bandFrac);
  const centre = (() => {
    let s = 0;
    let c = 0;
    for (let i = Math.round(w * 0.3); i < Math.round(w * 0.7); i += 4) {
      s += lineMean('x', left + i);
      c++;
    }
    return s / c;
  })();
  const scan = (axis, from, dir) => {
    let best = -1;
    let bestV = Infinity;
    for (let i = 0; i < band; i++) {
      const v = lineMean(axis, from + dir * i);
      if (v < bestV) {
        bestV = v;
        best = i;
      }
    }
    return bestV < centre * 0.6 ? best + Math.max(3, Math.round(band * 0.08)) : 0;
  };
  const dl = scan('x', left, 1);
  const dr = scan('x', left + w - 1, -1);
  const dt = scan('y', top, 1);
  const db = scan('y', top + h - 1, -1);
  const nw = w - dl - dr;
  const nh = h - dt - db;
  const side = Math.max(1, Math.min(nw, nh));
  return {
    left: left + dl + Math.floor((nw - side) / 2),
    top: top + dt + Math.floor((nh - side) / 2),
    width: side,
    height: side,
  };
}
