// World Style Refined foliage (src/render/world_style_foliage_core.ts and its
// painter world_style_foliage.ts): the painted meadow grass and the painterly
// canopies. Classic must stay the shipped material byte for byte (no hook, no
// key change, placement factors exactly 1); Refined chains one compile-time
// arm onto the material it is handed (no new material, no new sampler, the
// arm named in the program key) and its JS mirrors pin the look.
import * as THREE from 'three';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  canopyLeafWeight,
  PAINTED_CANOPY,
  PAINTED_CLUMP_COVER,
  PAINTED_GRASS,
  paintedCanopyColor,
  paintedCanopyFragGlsl,
  paintedCanopyRim,
  paintedClumpCoverage,
  paintedClumpField,
  paintedClumpHeight,
  paintedGrassColor,
  paintedGrassFlower,
  paintedGrassFragGlsl,
} from '../src/render/world_style_foliage_core';

interface FakeShader {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

const luma = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const spread = (c: readonly number[]): number => Math.max(...c) - Math.min(...c);
const samplerCount = (src: string): number => (src.match(/uniform\s+sampler\w*/g) ?? []).length;

function stubSearch(search: string): void {
  vi.stubGlobal('location', { search });
}

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('painted clump placement', () => {
  it('is exactly 1 under Classic everywhere', () => {
    for (let x = -50; x <= 50; x += 3.7)
      for (let z = -50; z <= 50; z += 4.1) {
        expect(paintedClumpCoverage('classic', x, z)).toBe(1);
        expect(paintedClumpHeight('classic', x, z)).toBe(1);
      }
  });
  it('is deterministic, bounded, and denser than Classic on average', () => {
    let sum = 0;
    let n = 0;
    for (let x = -80; x <= 80; x += 1.3)
      for (let z = -80; z <= 80; z += 1.7) {
        const f = paintedClumpField(x, z);
        expect(f).toBe(paintedClumpField(x, z));
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
        const c = paintedClumpCoverage('refined', x, z);
        expect(c).toBeGreaterThanOrEqual(PAINTED_CLUMP_COVER[0]);
        expect(c).toBeLessThanOrEqual(PAINTED_CLUMP_COVER[1]);
        sum += c;
        n++;
      }
    expect(sum / n).toBeGreaterThan(1);
  });
});

describe('painted grass colour', () => {
  const neon: [number, number, number] = [0.25, 0.62, 0.12];
  it('runs a cool darker root to a warm lighter tip', () => {
    const root = paintedGrassColor(neon, 0, 0.5);
    const tip = paintedGrassColor(neon, 1, 0.5);
    expect(luma(tip)).toBeGreaterThan(luma(root));
    // warm tip: more red relative to green than the root
    expect(tip[0] / tip[1]).toBeGreaterThan(root[0] / root[1]);
  });
  it('pulls the neon out (softer, lower-chroma greens)', () => {
    const mid = paintedGrassColor(neon, 0.5, 0.25);
    expect(spread(mid) / luma(mid)).toBeLessThan(spread(neon) / luma(neon));
  });
  it('drifts hue per clump', () => {
    const a = paintedGrassColor(neon, 0.6, 0);
    const b = paintedGrassColor(neon, 0.6, 0.5);
    const c = paintedGrassColor(neon, 0.6, 1);
    expect(b[0] / b[1]).toBeGreaterThan(a[0] / a[1]); // golden warmer than olive
    expect(c[2] / c[1]).toBeGreaterThan(b[2] / b[1]); // sage cooler than golden
  });
  it('carries wildflower specks on a small share of clumps, tips only', () => {
    let flowered = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (paintedGrassFlower((i + 0.5) / N) > 0) flowered++;
    expect(flowered / N).toBeCloseTo(PAINTED_GRASS.flowerShare, 2);
    const kinds = new Set<number>();
    for (let i = 0; i < N; i++) kinds.add(paintedGrassFlower((i + 0.5) / N));
    expect([...kinds].sort()).toEqual([0, 1, 2, 3, 4]);
    const sel = 0.999;
    expect(paintedGrassColor(neon, 0.3, 0.5, sel)).toEqual(paintedGrassColor(neon, 0.3, 0.5, 0));
    const tip = paintedGrassColor(neon, 1, 0.5, sel);
    const want = PAINTED_GRASS.flowers[paintedGrassFlower(sel) - 1];
    for (let k = 0; k < 3; k++) expect(tip[k]).toBeCloseTo(want[k], 5);
  });
  it('generates GLSL from the same constants and flower table', () => {
    const glsl = paintedGrassFragGlsl();
    expect(glsl).toContain('vec3(0.62000, 0.74000, 0.72000)');
    for (const c of PAINTED_GRASS.flowers) expect(glsl).toContain(`vec3(${c[0].toFixed(5)}`);
    expect(samplerCount(glsl)).toBe(0);
  });
});

describe('painterly canopy', () => {
  const leaf: [number, number, number] = [0.18, 0.36, 0.08];
  it('lights the crown top warm and shades the underside cool', () => {
    const top = paintedCanopyColor(leaf, 1, 0.5);
    const under = paintedCanopyColor(leaf, -1, 0.5);
    expect(luma(top)).toBeGreaterThan(luma(under));
    expect(under[2] / under[1]).toBeGreaterThan(top[2] / top[1]);
    expect(top[0] / top[1]).toBeGreaterThan(under[0] / under[1]);
  });
  it('keeps the underside a soft shade, never a black clump', () => {
    const under = paintedCanopyColor(leaf, -1, 0);
    expect(luma(under)).toBeGreaterThan(luma(leaf) * 0.6);
  });
  it('softens leaf-texture contrast toward a painted mass', () => {
    const dark: [number, number, number] = [0.05, 0.1, 0.03];
    const light: [number, number, number] = [0.3, 0.5, 0.16];
    const a = paintedCanopyColor(dark, 0.3, 0.5);
    const b = paintedCanopyColor(light, 0.3, 0.5);
    expect(luma(b) / luma(a)).toBeLessThan(luma(light) / luma(dark));
    expect(PAINTED_CANOPY.contrast).toBeLessThan(1);
  });
  it('paints green texels and spares bark, stone and caps on an unknown model', () => {
    expect(canopyLeafWeight(leaf)).toBe(1);
    expect(canopyLeafWeight([0.3, 0.4, 0.15])).toBeGreaterThan(0.9);
    expect(canopyLeafWeight([0.4, 0.26, 0.15])).toBe(0); // bark
    expect(canopyLeafWeight([0.5, 0.5, 0.5])).toBe(0); // stone
    expect(canopyLeafWeight([0.7, 0.12, 0.1])).toBe(0); // mushroom cap
    const bark: [number, number, number] = [0.4, 0.26, 0.15];
    expect(paintedCanopyColor(bark, 1, 0.5, canopyLeafWeight(bark))).toEqual(bark);
  });
  it('rims warm by day, strongest at golden hour, never at night', () => {
    expect(paintedCanopyRim(1, 0)).toBeGreaterThan(paintedCanopyRim(0, 0));
    expect(paintedCanopyRim(0, 0)).toBeGreaterThan(0);
    expect(paintedCanopyRim(1, 1)).toBe(0);
  });
  it('compiles a weight-free arm for a known leaf and a chroma arm otherwise', () => {
    expect(paintedCanopyFragGlsl(true)).toContain('float wsLeafW = 1.0;');
    expect(paintedCanopyFragGlsl(false)).toContain('diffuseColor.g - max(diffuseColor.r * 0.82');
  });
});

async function painter(style: 'classic' | 'refined') {
  vi.resetModules();
  stubSearch(`?gfx=high&worldstyle=${style}`);
  return import('../src/render/world_style_foliage');
}

function hooked(kind: 'standard' | 'lambert'): THREE.Material {
  const mat =
    kind === 'standard'
      ? new THREE.MeshStandardMaterial({ vertexColors: true })
      : new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n// prior');
  };
  mat.customProgramCacheKey = () => 'prior-key';
  return mat;
}

function compile(mat: THREE.Material, kind: 'standard' | 'lambert'): FakeShader {
  const lib = kind === 'standard' ? THREE.ShaderLib.physical : THREE.ShaderLib.lambert;
  const shader: FakeShader = {
    uniforms: {},
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
  };
  mat.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    null as unknown as THREE.WebGLRenderer,
  );
  return shader;
}

describe('the foliage painter', () => {
  it('leaves every Classic material exactly as it was', async () => {
    const p = await painter('classic');
    for (const kind of ['standard', 'lambert'] as const) {
      const mat = hooked(kind);
      const hook = mat.onBeforeCompile;
      const key = mat.customProgramCacheKey;
      p.paintRefinedGrass(mat, 'uv.y');
      p.paintRefinedCanopy(mat);
      p.paintRefinedCanopy(mat, false);
      expect(mat.onBeforeCompile).toBe(hook);
      expect(mat.customProgramCacheKey).toBe(key);
    }
  });

  for (const kind of ['standard', 'lambert'] as const) {
    it(`chains the grass arm after the prior hook (${kind})`, async () => {
      const p = await painter('refined');
      const mat = hooked(kind);
      p.paintRefinedGrass(mat, '(color.r - 0.86) / 0.24');
      const sh = compile(mat, kind);
      expect(sh.vertexShader).toContain('// prior');
      expect(sh.vertexShader).toContain('vWsGrass = vec3(clamp((color.r - 0.86) / 0.24');
      expect(sh.fragmentShader).toContain('varying vec3 vWsGrass;');
      expect(sh.fragmentShader.indexOf('#include <color_fragment>')).toBeLessThan(
        sh.fragmentShader.indexOf('float wsT = vWsGrass.x;'),
      );
      expect(samplerCount(sh.fragmentShader)).toBe(
        samplerCount(compile(hooked(kind), kind).fragmentShader),
      );
      expect(mat.customProgramCacheKey()).toBe('prior-key|ws-grass:(color.r - 0.86) / 0.24');
    });

    it(`chains the canopy arm with its shared rim uniform (${kind})`, async () => {
      const p = await painter('refined');
      const ws = await import('../src/render/world_style');
      const mat = hooked(kind);
      p.paintRefinedCanopy(mat, false);
      const sh = compile(mat, kind);
      expect(sh.uniforms.uWsFoliage).toBe(ws.worldStyleUniforms.uWsFoliage);
      expect(sh.vertexShader).toContain('vWsCanopy = vec2(');
      const rimAt = sh.fragmentShader.indexOf('totalEmissiveRadiance += diffuseColor.rgb');
      expect(rimAt).toBeGreaterThan(sh.fragmentShader.indexOf('float wsLeafW'));
      expect(rimAt).toBeLessThan(sh.fragmentShader.indexOf('#include <aomap_fragment>'));
      expect(mat.customProgramCacheKey()).toBe('prior-key|ws-canopy:auto');
      // every preprocessor anchor still starts its own line
      expect(sh.fragmentShader).not.toMatch(/[^\s][ \t]*#include/);
      expect(sh.vertexShader).not.toMatch(/[^\s][ \t]*#include/);
    });
  }

  it('writes a daylight rim strength per frame and zero at night', async () => {
    vi.resetModules();
    stubSearch('?gfx=high&worldstyle=refined');
    const ws = await import('../src/render/world_style');
    const { dayNightGrade } = await import('../src/render/day_night_core');
    ws.applyWorldStyleGrade(dayNightGrade(1), 0.1);
    expect(ws.worldStyleUniforms.uWsFoliage.value.x).toBeGreaterThan(0.2);
    ws.applyWorldStyleGrade(dayNightGrade(0), -0.6);
    expect(ws.worldStyleUniforms.uWsFoliage.value.x).toBe(0);
  });
});
