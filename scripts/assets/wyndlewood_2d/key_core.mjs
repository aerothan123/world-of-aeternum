// Pure alpha keying for Wyndlewood medallion and badge masters (no I/O; pinned by
// tests/wyndlewood_2d_grid_core.test.ts). The sheets paint each subject on a plain dark
// backdrop; the backdrop colour is the median of the cell's outer ring, and alpha ramps with
// the colour distance from it.

export function ringMedian(rgb, size, ring = 6) {
  const ch = [[], [], []];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x >= ring && y >= ring && x < size - ring && y < size - ring) continue;
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) ch[c].push(rgb[i + c]);
    }
  }
  return ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
}

/** RGBA buffer: the RGB with alpha keyed off the backdrop colour (t0..t1 distance ramp). */
export function keyAlpha(rgb, size, { t0 = 22, t1 = 56 } = {}) {
  const bg = ringMedian(rgb, size);
  const out = Buffer.alloc(size * size * 4);
  for (let p = 0; p < size * size; p++) {
    const r = rgb[p * 3];
    const g = rgb[p * 3 + 1];
    const b = rgb[p * 3 + 2];
    const d = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2);
    const a = Math.max(0, Math.min(1, (d - t0) / (t1 - t0)));
    out[p * 4] = r;
    out[p * 4 + 1] = g;
    out[p * 4 + 2] = b;
    out[p * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/** Alpha bounding box, centroid and coverage (fraction of pixels above `threshold`). */
export function alphaStats(rgba, width, height, threshold = 8) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] <= threshold) continue;
      n++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return {
    bbox: n ? { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    cx: n ? sx / n : width / 2,
    cy: n ? sy / n : height / 2,
    coverage: n / (width * height),
  };
}

/** Zero every keyed pixel not connected to the subject at the cell's centre (a neighbour's
 *  edge that bled across the rule, stray grain). Connectivity is 4-way over alpha > floor. */
export function keepCenterComponent(rgba, size, floor = 24) {
  const n = size * size;
  const seen = new Uint8Array(n);
  let seed = -1;
  const c = size >> 1;
  for (let r = 0; r < size / 4 && seed < 0; r++) {
    for (let dy = -r; dy <= r && seed < 0; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const p = (c + dy) * size + (c + dx);
        if (rgba[p * 4 + 3] > floor) {
          seed = p;
          break;
        }
      }
    }
  }
  if (seed < 0) return rgba;
  const stack = [seed];
  seen[seed] = 1;
  while (stack.length) {
    const p = stack.pop();
    const x = p % size;
    const y = (p - x) / size;
    for (const q of [
      x > 0 ? p - 1 : -1,
      x < size - 1 ? p + 1 : -1,
      y > 0 ? p - size : -1,
      y < size - 1 ? p + size : -1,
    ]) {
      if (q < 0 || seen[q] || rgba[q * 4 + 3] <= floor) continue;
      seen[q] = 1;
      stack.push(q);
    }
  }
  for (let p = 0; p < n; p++) if (!seen[p]) rgba[p * 4 + 3] = 0;
  return rgba;
}
