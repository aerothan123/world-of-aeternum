import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAINTED_WATER, paintedWaterGlsl } from '../src/render/ocean/ocean_painted_core';
import {
  type OceanSurfaceShaderOptions,
  oceanSurfaceFragment,
} from '../src/render/ocean/ocean_surface_glsl';

const opts = (over: Partial<OceanSurfaceShaderOptions> = {}): OceanSurfaceShaderOptions => ({
  cascades: 4,
  underside: false,
  shoreEdgeFade: false,
  zoneHaze: true,
  ssrSteps: 22,
  apron: false,
  ...over,
});

const variants: Partial<OceanSurfaceShaderOptions>[] = [
  {},
  { ssrSteps: 0 },
  { underside: true, ssrSteps: 0 },
  { shoreEdgeFade: true, cascades: 3 },
  { apron: true, zoneHaze: false },
];

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

describe('refined painted water', () => {
  it('leaves the Classic fragment byte-identical (refined absent or false)', () => {
    for (const v of variants) {
      const classic = oceanSurfaceFragment(opts(v));
      expect(oceanSurfaceFragment(opts({ ...v, refined: false }))).toBe(classic);
      expect(classic).not.toContain('painted water');
    }
  });

  it('matches the pre-change Classic text when git history is available', () => {
    // The Classic text must equal what the generator emitted before the
    // painted pass existed: splice-free source equals the parent file's.
    let parent: string | null = null;
    try {
      parent = execFileSync('git', ['show', 'bfc6440a:src/render/ocean/ocean_surface_glsl.ts'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      parent = null;
    }
    if (parent === null) return;
    const now = readFileSync('src/render/ocean/ocean_surface_glsl.ts', 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    parent = parent.replace(/\r\n/g, '\n');
    expect(now.length).toBeGreaterThan(0);
    // Only the import, the option doc and the splice differ.
    const strip = (s: string) =>
      s
        .replace("import { paintedWaterGlsl } from './ocean_painted_core';\n", '')
        .replace(
          / {2}\/\*\*\n {3}\* World Style Refined's painted pass[\s\S]*?refined\?: boolean;\n/,
          '',
        )
        .replace("${opts.refined === true ? paintedWaterGlsl() : ''}", '');
    expect(sha(strip(now))).toBe(sha(parent));
  });

  it('splices the painted pass into the above-water arm only when refined', () => {
    const frag = oceanSurfaceFragment(opts({ refined: true }));
    expect(frag).toContain(paintedWaterGlsl());
    const at = frag.indexOf('painted water');
    expect(at).toBeGreaterThan(frag.indexOf('#else\n  // ---- reflection ----'));
    expect(at).toBeLessThan(frag.indexOf('gl_FragColor = vec4(col, alpha);'));
    // Underside keeps its own arm: the splice sits inside the #else branch.
    expect(frag.lastIndexOf('#ifdef WATER_UNDERSIDE', at)).toBeGreaterThan(-1);
  });

  it('paints hue and highlights, never the transmitted share outside the foam rings', () => {
    const g = paintedWaterGlsl();
    expect(g.match(/keep \*=/g)?.length).toBe(1);
    expect(g).toContain('keep *= 1.0 - pwRing;');
    expect(g).not.toContain('alpha');
    expect(g).not.toContain('edge');
    expect(PAINTED_WATER.ringCover).toBeLessThan(0.7);
    expect(PAINTED_WATER.bandMix).toBeLessThan(0.35);
  });

  it('keeps every literal smoothstep pair ordered and no pow', () => {
    const g = paintedWaterGlsl();
    expect(g).not.toMatch(/\bpow\s*\(/);
    for (const m of g.matchAll(/smoothstep\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,/g)) {
      expect(Number(m[1])).toBeLessThan(Number(m[2]));
    }
  });
});
