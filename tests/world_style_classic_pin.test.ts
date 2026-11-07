// @vitest-environment jsdom
//
// World Style: Classic must render EXACTLY as the world did before the
// Refined style existed. These pins hash every compile-time output the
// Refined style touches (the terrain splat and Lambert shaders and their
// program cache keys, the sky dome fragment, the output grade fragment and
// the derived graphics settings) under the Classic style and compare them to
// hashes captured from the code base BEFORE the style switch landed. A
// change to any of these sources is still possible, but it has to be a
// deliberate re-pin here, never a side effect of a Refined edit.
//
// jsdom: the splat material packs its albedo photos through a 2D canvas.
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

interface FakeShader {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

// Captured from feature/player-housing at 5026b480, before the World Style
// switch, with the same harness below.
const CLASSIC_PINS: Record<string, string> = {
  'terrain.splat.medium': 'cabafe3f811fbc4a',
  'terrain.splat.high': '03953f522820d52a',
  'terrain.splat.ultra': 'fb15c29c28059137',
  'terrain.splat.insane': 'fb15c29c28059137',
  // Re-pinned for the world expansion: the GLSL this hashes is byte-identical
  // to the pre-expansion tree (64d84727), verified by dumping both. The key
  // also hashes the hook SOURCE, whose detail-map uv now reads the frozen
  // shipped box (DETAIL_MAP_BOX, terrain_grid_core.ts) instead of the live
  // world bounds, so the frontier never stretches the Classic ground texture.
  'terrain.lambert.low': 'b52d9c7c3af617f3',
  'sky.frag.plain': '943ec6e020bc2d08',
  'sky.frag.zoneHaze': '30b94a672d2f46d6',
  'grade.frag': '70a8a3a8f9a8d222',
  'gfx.settings.low': '63c522fef695890b',
  'gfx.settings.medium': '1410dbebb009f914',
  'gfx.settings.high': '942ee859338c62bf',
  'gfx.settings.ultra': '50435f5859db0775',
  'gfx.settings.insane': '674811b749d6d9e7',
};

const observed: Record<string, string> = {};

function stubSearch(search: string): void {
  vi.stubGlobal('location', { search });
}

async function terrainShaderHash(preset: string, lambert: boolean): Promise<string> {
  vi.resetModules();
  stubSearch(`?gfx=${preset}&worldstyle=classic`);
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
  const key = material.customProgramCacheKey();
  return sha(`${shader.vertexShader}\n----\n${shader.fragmentShader}\n----\n${key}`);
}

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
  // Printed so a deliberate re-pin can copy the new values.
  console.info(`world style classic pins: ${JSON.stringify(observed, null, 2)}`);
});

describe('World Style Classic is byte-identical to the pre-switch world', () => {
  for (const preset of ['medium', 'high', 'ultra', 'insane']) {
    it(`terrain splat shader (${preset})`, async () => {
      const key = `terrain.splat.${preset}`;
      observed[key] = await terrainShaderHash(preset, false);
      expect(observed[key]).toBe(CLASSIC_PINS[key]);
    }, 60_000);
  }

  it('terrain Lambert shader (low)', async () => {
    const key = 'terrain.lambert.low';
    observed[key] = await terrainShaderHash('low', true);
    expect(observed[key]).toBe(CLASSIC_PINS[key]);
  }, 60_000);

  it('sky dome fragment', async () => {
    vi.resetModules();
    stubSearch('?gfx=high&worldstyle=classic');
    const { skyZoneHazeInternalsForTest } = await import('../src/render/sky');
    observed['sky.frag.plain'] = sha(skyZoneHazeInternalsForTest.skyFrag(false));
    observed['sky.frag.zoneHaze'] = sha(skyZoneHazeInternalsForTest.skyFrag(true));
    expect(observed['sky.frag.plain']).toBe(CLASSIC_PINS['sky.frag.plain']);
    expect(observed['sky.frag.zoneHaze']).toBe(CLASSIC_PINS['sky.frag.zoneHaze']);
  }, 60_000);

  it('output grade fragment', async () => {
    vi.resetModules();
    stubSearch('?gfx=high&worldstyle=classic');
    const { OutputGradePass } = await import('../src/render/post_output_grade');
    const { worldGradeEnabled } = await import('../src/render/world_style').catch(() => ({
      worldGradeEnabled: () => false,
    }));
    const pass = new OutputGradePass({ value: 0 }, null, { worldGrade: worldGradeEnabled() });
    observed['grade.frag'] = sha(pass.material.fragmentShader);
    expect(observed['grade.frag']).toBe(CLASSIC_PINS['grade.frag']);
  }, 60_000);

  for (const tier of ['low', 'medium', 'high', 'ultra', 'insane'] as const) {
    it(`derived graphics settings (${tier}), worldStyle aside`, async () => {
      vi.resetModules();
      stubSearch('');
      const { gfxInternalsForTest } = await import('../src/render/gfx');
      const settings = {
        ...gfxInternalsForTest.settingsFor(tier, { search: '', worldStyle: 0 } as never),
      } as Record<string, unknown>;
      delete settings.worldStyle;
      const key = `gfx.settings.${tier}`;
      observed[key] = sha(gfxInternalsForTest.stableFingerprintValue(settings));
      expect(observed[key]).toBe(CLASSIC_PINS[key]);
    }, 60_000);
  }
});
