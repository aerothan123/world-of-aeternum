// @vitest-environment jsdom
//
// World Style Refined shader arms (src/render/world_style_glsl.ts) compiled
// through the REAL material builders: every anchor resolves, no Refined arm
// adds a sampler (the splat terrain sits at 15 of 16 fragment units), every
// variant names itself in the program cache key (so the boot compile links
// the Refined program, never a Classic one by key collision), and the Refined
// state reuses the SAME materials the Classic world builds (no new GPU
// producer: one splat, one Lambert, one dome, one grade program per builder,
// all with the prewarm homes the Classic world already gives them).
//
// jsdom: the splat material packs its albedo photos through a 2D canvas.
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

interface FakeShader {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

function stubSearch(search: string): void {
  vi.stubGlobal('location', { search });
}

async function compileTerrain(
  preset: string,
  style: 'classic' | 'refined',
  lambert: boolean,
): Promise<{ shader: FakeShader; key: string }> {
  vi.resetModules();
  stubSearch(`?gfx=${preset}&worldstyle=${style}`);
  const { terrainInternalsForTest } = await import('../src/render/terrain');
  const material = lambert
    ? terrainInternalsForTest.createLambertMaterial()
    : terrainInternalsForTest.createSplatMaterial();
  const lib = lambert ? THREE.ShaderLib.lambert : THREE.ShaderLib.physical;
  const shader: FakeShader = {
    uniforms: {},
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
  };
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    null as unknown as THREE.WebGLRenderer,
  );
  return { shader, key: material.customProgramCacheKey() };
}

const samplerCount = (src: string): number => (src.match(/uniform\s+sampler\w*/g) ?? []).length;

beforeAll(() => {
  vi.doMock('../src/render/assets/loader', () => ({
    loadTexture: () => Promise.resolve(new THREE.Texture()),
    loadKtx2Texture: () => Promise.resolve(new THREE.Texture()),
    releaseKtx2Texture: () => undefined,
    releaseTexture: () => undefined,
  }));
  vi.doMock('../src/render/assets/preload', () => ({
    registerPreload: () => undefined,
    registerDeferredPreload: () => undefined,
  }));
  vi.doMock('../src/render/textures', () => ({
    groundDetailTexture: () => new THREE.Texture(),
    groundSplatMaps: () => ({}),
    macroNoiseTexture: () => new THREE.Texture(),
    skyTexture: () => new THREE.Texture(),
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../src/render/assets/loader');
  vi.doUnmock('../src/render/assets/preload');
  vi.doUnmock('../src/render/textures');
});

describe('Refined splat terrain', () => {
  for (const preset of ['medium', 'high', 'insane']) {
    it(`compiles its arm without a new sampler (${preset})`, async () => {
      const classic = await compileTerrain(preset, 'classic', false);
      const refined = await compileTerrain(preset, 'refined', false);
      const frag = refined.shader.fragmentShader;
      expect(frag).toContain('World Style Refined (world_style_glsl.ts)');
      expect(frag).toContain('uniform vec4 uWsAerial;');
      expect(frag).toContain('wocWsPalette(alb)');
      // the arm sits between the composed albedo and the snow mix
      expect(frag.indexOf('World Style Refined')).toBeLessThan(
        frag.indexOf('// snow cover on the peaks/rim'),
      );
      // the aerial term lands right before the scene fog
      expect(frag.indexOf('wocWsA')).toBeLessThan(frag.lastIndexOf('#include <fog_fragment>'));
      expect(samplerCount(frag)).toBe(samplerCount(classic.shader.fragmentShader));
      expect(refined.key).not.toBe(classic.key);
      expect(refined.key).toContain('|ws-refined:');
      expect(refined.shader.uniforms.uWsAerial).toBeDefined();
      expect(refined.shader.uniforms.uWsLayers).toBeDefined();
      // the Classic arm is untouched by construction
      expect(classic.shader.fragmentShader).not.toContain('uWs');
    }, 60_000);
  }

  it('takes the cheaper arm on medium (no dedicated noise taps)', async () => {
    const medium = (await compileTerrain('medium', 'refined', false)).shader.fragmentShader;
    const high = (await compileTerrain('high', 'refined', false)).shader.fragmentShader;
    const taps = (src: string) => (src.match(/texture2D\(uMacro/g) ?? []).length;
    expect(taps(high)).toBeGreaterThan(taps(medium));
    expect(medium).not.toContain('WOC_ALB(tuv * 0.8, WOC_L_MUD) * wocWsTint');
  }, 60_000);
});

// Static tap budget: the texture fetches each Refined arm adds over Classic
// (the WOC_ALB macro and textureLod/texture2D calls in the composed fragment).
// Several sit behind a weight branch, so this is the worst case per pixel.
// The painted ground (world_style_ground_core.ts) adds up to six: two painted
// meadow octaves on the baked-grass arm, then forest floor, wet moss, paving
// and dune ripples, each behind its own weight branch.
const REFINED_TAP_BUDGET: Record<string, number> = { medium: 10, high: 14, insane: 14 };
const taps = (src: string): number =>
  (src.match(/\bWOC_ALB\s*\(|\btexture2D\s*\(|\btextureLod\s*\(|\btexture\s*\(/g) ?? []).length;

describe('Refined splat tap budget', () => {
  for (const preset of Object.keys(REFINED_TAP_BUDGET)) {
    it(`adds at most ${REFINED_TAP_BUDGET[preset]} fetches on ${preset}`, async () => {
      const classic = taps((await compileTerrain(preset, 'classic', false)).shader.fragmentShader);
      const refined = taps((await compileTerrain(preset, 'refined', false)).shader.fragmentShader);
      console.info(`world style taps ${preset}: classic ${classic}, refined ${refined}`);
      expect(refined - classic).toBeGreaterThan(0);
      expect(refined - classic).toBeLessThanOrEqual(REFINED_TAP_BUDGET[preset]);
    }, 60_000);
  }
});

describe('Refined Low ground', () => {
  it('adds only arithmetic to the Lambert ground', async () => {
    const classic = await compileTerrain('low', 'classic', true);
    const refined = await compileTerrain('low', 'refined', true);
    const frag = refined.shader.fragmentShader;
    expect(frag).toContain('wocWsPalette(gl_FragColor.rgb)');
    expect(samplerCount(frag)).toBe(samplerCount(classic.shader.fragmentShader));
    const texCalls = (src: string) => (src.match(/texture2?D?\s*\(/g) ?? []).length;
    expect(texCalls(frag)).toBe(texCalls(classic.shader.fragmentShader));
    expect(refined.key).not.toBe(classic.key);
  }, 60_000);
});

describe('Refined far vista patch', () => {
  it('splices the same aerial term on its own world-position varying', async () => {
    const { patchRefinedFarTerrainShader } = await import('../src/render/world_style_glsl');
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    patchRefinedFarTerrainShader(shader, true);
    expect(shader.vertexShader).toContain('vWsWPos = (modelMatrix');
    expect(shader.fragmentShader).toContain('varying vec3 vWsWPos;');
    expect(shader.fragmentShader).toContain('distance(cameraPosition, vWsWPos)');
  });
});

describe('Refined sky dome', () => {
  it('adds the gradient, sun glow, cloud layer and haze to the one dome program', async () => {
    vi.resetModules();
    stubSearch('?gfx=high&worldstyle=refined');
    const { skyZoneHazeInternalsForTest } = await import('../src/render/sky');
    const { withRefinedSky } = await import('../src/render/world_style_glsl');
    for (const zoneHaze of [false, true]) {
      const classic = skyZoneHazeInternalsForTest.skyFrag(zoneHaze);
      const refined = withRefinedSky(classic);
      expect(refined).toContain('Cloud layer: billowy painted cumulus');
      expect(refined).toContain('uniform vec2 uWsCloudDrift;');
      expect(refined).toContain('Refined horizon haze');
      expect(samplerCount(refined)).toBe(samplerCount(classic));
      // clouds before the stars, haze after the fog band
      expect(refined.indexOf('Cloud layer')).toBeLessThan(refined.indexOf('if (uStarAmt > 0.001)'));
      expect(refined.indexOf('Refined horizon haze')).toBeGreaterThan(
        refined.indexOf('c = mix(uFog, c, smoothstep(0.1, 0.36, dir.y));'),
      );
    }
  });
});

describe('Refined output grade', () => {
  it('is a define-free source splice on the existing grade pass', async () => {
    vi.resetModules();
    stubSearch('?gfx=high&worldstyle=refined');
    const { OutputGradePass, OUTPUT_GRADE_FRAGMENT_SHADER } = await import(
      '../src/render/post_output_grade'
    );
    const plain = new OutputGradePass({ value: 0 }, null, {});
    const graded = new OutputGradePass({ value: 0 }, null, { worldGrade: true });
    expect(plain.material.fragmentShader).toBe(OUTPUT_GRADE_FRAGMENT_SHADER);
    expect(graded.material.fragmentShader).toContain('uniform vec4 uWsGradeGain;');
    expect(graded.material.fragmentShader).toContain('* uWsGradeLift.a;');
    expect(graded.material.uniforms.uWsGradeGain).toBeDefined();
    expect(samplerCount(graded.material.fragmentShader)).toBe(
      samplerCount(OUTPUT_GRADE_FRAGMENT_SHADER),
    );
  });

  it('is what post.ts asks for under each style', async () => {
    vi.resetModules();
    stubSearch('?gfx=high&worldstyle=refined');
    expect((await import('../src/render/world_style')).worldGradeEnabled()).toBe(true);
    vi.resetModules();
    stubSearch('?gfx=high&worldstyle=classic');
    expect((await import('../src/render/world_style')).worldGradeEnabled()).toBe(false);
  });
});

describe('Refined per-frame painter', () => {
  it('returns the Classic grade untouched and writes nothing', async () => {
    vi.resetModules();
    stubSearch('?gfx=high&worldstyle=classic');
    const ws = await import('../src/render/world_style');
    const { dayNightGrade } = await import('../src/render/day_night_core');
    const g = dayNightGrade(1);
    const before = ws.worldStyleUniforms.uWsGradeGain.value.clone();
    expect(ws.applyWorldStyleGrade(g, 0.1)).toBe(g);
    expect(ws.worldStyleUniforms.uWsGradeGain.value.equals(before)).toBe(true);
    const c = new THREE.Color(0.5, 0.5, 0.5);
    ws.applyWorldStyleSunTint(c);
    expect(c.r).toBe(0.5);
    expect(ws.activeShadowRadius(2.25)).toBe(2.25);
  });

  it('grades light and fog by time of day but never the fog range', async () => {
    vi.resetModules();
    stubSearch('?gfx=high&worldstyle=refined');
    const ws = await import('../src/render/world_style');
    const { dayNightGrade } = await import('../src/render/day_night_core');
    const day = dayNightGrade(1);
    const golden = ws.applyWorldStyleGrade(day, 0.1);
    expect(golden.farScale).toBe(day.farScale);
    expect(golden.fog[0]).toBeGreaterThan(golden.fog[2]);
    expect(ws.worldStyleUniforms.uWsGradeGain.value.x).toBeGreaterThan(
      ws.worldStyleUniforms.uWsGradeGain.value.z,
    );
    const night = dayNightGrade(0);
    const graded = ws.applyWorldStyleGrade(night, -0.6);
    // night readability floors stay where day_night_core put them
    expect(graded.ambientScale).toBe(night.ambientScale);
    expect(graded.lightScale).toBe(night.lightScale);
    expect(graded.farScale).toBe(night.farScale);
  });
});
