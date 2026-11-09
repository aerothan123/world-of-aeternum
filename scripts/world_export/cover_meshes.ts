// The slice's own stylized ground cover, built in code so it matches the
// client's painted blades (bright, saturated, a dark root and a sunlit tip)
// instead of a photoscanned plant: grass clumps and meadow wildflowers as
// vertex-coloured geometry, written as plain GLBs by procedural_glb.ts.
// Deterministic: a fixed-seed LCG, so a re-export writes the same bytes.
import * as THREE from 'three';
import { object3DToGlb } from './procedural_glb';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = readonly [number, number, number];

class Builder {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(p: THREE.Vector3, c: Rgb): number {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c[0], c[1], c[2]);
    return this.pos.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  mesh(name: string): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ name, roughness: 0.85, side: THREE.DoubleSide }),
    );
    m.name = name;
    return m;
  }
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** One tapered, bent blade from `base` along a lean direction. */
function blade(
  b: Builder,
  base: THREE.Vector3,
  height: number,
  width: number,
  yaw: number,
  lean: number,
  root: Rgb,
  tip: Rgb,
  segments = 4,
): void {
  const side = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
  let prev: [number, number] | null = null;
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const p = base
      .clone()
      .addScaledVector(fwd, lean * height * t * t)
      .add(new THREE.Vector3(0, height * t * (1 - 0.25 * lean * t), 0));
    const c = mix(root, tip, t ** 0.8);
    if (s === segments) {
      const top = b.vert(p, c);
      if (prev) b.tri(prev[0], prev[1], top);
      break;
    }
    const w = width * (1 - t * 0.85) * 0.5;
    const l = b.vert(p.clone().addScaledVector(side, -w), c);
    const r = b.vert(p.clone().addScaledVector(side, w), c);
    if (prev) b.quad(prev[0], prev[1], r, l);
    prev = [l, r];
  }
}

const GRASS_ROOT: Rgb = [0.03, 0.11, 0.015];
const GRASS_TIPS: Rgb[] = [
  [0.2, 0.52, 0.06],
  [0.3, 0.6, 0.08],
  [0.42, 0.62, 0.1],
];

/** A clump of blades on a disc of `radius` metres. */
export function grassClump(
  seed: number,
  blades: number,
  radius: number,
  h0: number,
  h1: number,
): THREE.Mesh {
  const rnd = lcg(seed);
  const b = new Builder();
  for (let i = 0; i < blades; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * radius;
    const base = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const tip = mix(
      GRASS_TIPS[Math.floor(rnd() * GRASS_TIPS.length)],
      [0.62, 0.66, 0.16],
      rnd() * 0.25,
    );
    blade(
      b,
      base,
      h0 + (h1 - h0) * rnd(),
      0.05 + rnd() * 0.03,
      rnd() * Math.PI * 2,
      0.15 + rnd() * 0.45,
      GRASS_ROOT,
      tip,
    );
  }
  return b.mesh('cover_grass');
}

export interface FlowerStyle {
  name: string;
  petal: Rgb;
  centre: Rgb;
  petals: number;
  size: number;
}

export const FLOWER_STYLES: FlowerStyle[] = [
  { name: 'daisy', petal: [0.92, 0.92, 0.86], centre: [0.85, 0.6, 0.05], petals: 9, size: 0.05 },
  {
    name: 'buttercup',
    petal: [0.95, 0.72, 0.04],
    centre: [0.7, 0.45, 0.02],
    petals: 5,
    size: 0.04,
  },
  { name: 'campion', petal: [0.85, 0.32, 0.5], centre: [0.95, 0.8, 0.85], petals: 5, size: 0.045 },
  {
    name: 'cornflower',
    petal: [0.25, 0.35, 0.85],
    centre: [0.15, 0.15, 0.45],
    petals: 8,
    size: 0.04,
  },
];

/** A small tuft of leaves with a few stems, each crowned by a flat flower head. */
export function flowerTuft(seed: number, style: FlowerStyle, heads: number): THREE.Mesh {
  const rnd = lcg(seed);
  const b = new Builder();
  for (let i = 0; i < 6; i++) {
    blade(
      b,
      new THREE.Vector3((rnd() - 0.5) * 0.1, 0, (rnd() - 0.5) * 0.1),
      0.12 + rnd() * 0.1,
      0.05,
      rnd() * 6.28,
      0.6,
      GRASS_ROOT,
      [0.22, 0.48, 0.07],
      3,
    );
  }
  for (let h = 0; h < heads; h++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 0.12;
    const base = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const height = 0.22 + rnd() * 0.18;
    blade(b, base, height, 0.012, rnd() * 6.28, 0.1, GRASS_ROOT, [0.18, 0.4, 0.06], 3);
    const top = base.clone().add(new THREE.Vector3(0, height * 0.98, 0));
    const tilt = new THREE.Euler((rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7);
    const q = new THREE.Quaternion().setFromEuler(tilt);
    const s = style.size * (0.85 + rnd() * 0.3);
    const centre = b.vert(
      top.clone().add(new THREE.Vector3(0, s * 0.15, 0).applyQuaternion(q)),
      style.centre,
    );
    const ring: number[] = [];
    const n = style.petals * 2;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const rr = k % 2 === 0 ? s : s * 0.35;
      const p = new THREE.Vector3(Math.cos(ang) * rr, 0, Math.sin(ang) * rr)
        .applyQuaternion(q)
        .add(top);
      ring.push(b.vert(p, k % 2 === 0 ? style.petal : mix(style.petal, style.centre, 0.5)));
    }
    for (let k = 0; k < n; k++) b.tri(centre, ring[k], ring[(k + 1) % n]);
  }
  return b.mesh(`cover_${style.name}`);
}

/** Every cover mesh as `cover/<name>.glb` bytes. */
export async function coverGlbs(): Promise<{ name: string; bytes: Uint8Array }[]> {
  const out: { name: string; bytes: Uint8Array }[] = [];
  const add = async (name: string, mesh: THREE.Mesh) => {
    const g = new THREE.Group();
    g.add(mesh);
    out.push({ name, bytes: await object3DToGlb(g, { name }) });
  };
  await add('grass_clump_a', grassClump(11, 22, 0.22, 0.28, 0.5));
  await add('grass_clump_b', grassClump(23, 16, 0.18, 0.4, 0.68));
  await add('grass_clump_c', grassClump(37, 28, 0.26, 0.18, 0.34));
  for (const [i, style] of FLOWER_STYLES.entries())
    await add(`flower_${style.name}`, flowerTuft(101 + i, style, 3 + (i % 2)));
  return out;
}
