// The world rock material (src/render/rock_material.ts + rock_material_core.ts):
// the baked top tint, the Refined sky-fill correction, Classic untouched.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bakeRockTopTint, createRockMaterial, rockColorway } from '../src/render/rock_material';
import {
  patchRefinedRockFragment,
  REFINED_ROCK_FILL,
  ROCK_FILL_ANCHOR,
  refinedRockIndirect,
  rockTopTint,
} from '../src/render/rock_material_core';

describe('rock top tint', () => {
  it('tints only upward faces and darkens the underside a little', () => {
    const moss: [number, number, number] = [0.58, 0.88, 0.42];
    expect(rockTopTint(1, moss).map((x) => +x.toFixed(6))).toEqual(moss);
    expect(rockTopTint(0.2, moss)).toEqual([1, 1, 1]);
    expect(rockTopTint(-1, moss)).toEqual([0.75, 0.75, 0.75]);
    const half = rockTopTint(0.55, moss);
    expect(half[0]).toBeCloseTo(1 + (0.58 - 1) * 0.5, 6);
  });

  it('bakes the same colours into geometry and builds the cluster', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const baked = bakeRockTopTint(geo.clone(), new THREE.Color(0.58, 0.88, 0.42));
    expect(baked.getAttribute('color').count).toBe(geo.getAttribute('position').count);
    const way = rockColorway([geo, geo, geo], new THREE.Color(1.5, 1.55, 1.65));
    expect(way).toHaveLength(4);
    expect(way[3].getAttribute('position').count).toBe(3 * geo.getAttribute('position').count);
  });
});

describe('refined rock fill', () => {
  it('keeps the fill brightness and pulls the sky blue toward warm grey', () => {
    const sky: [number, number, number] = [0.2, 0.32, 0.6];
    const out = refinedRockIndirect(sky);
    const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(Math.abs(luma(out) - luma(sky)) / luma(sky)).toBeLessThan(0.08);
    // blue no longer dominates
    expect(out[2] / out[0]).toBeLessThan(sky[2] / sky[0] / 2);
    expect(REFINED_ROCK_FILL.saturation).toBeLessThan(0.5);
  });

  it('patches the standard fragment once, after the indirect light is complete', () => {
    const frag = THREE.ShaderLib.standard.fragmentShader;
    expect(frag.split(ROCK_FILL_ANCHOR).length - 1).toBe(1);
    const out = patchRefinedRockFragment(frag);
    expect(out).toContain('reflectedLight.indirectDiffuse = mix(');
    expect(out).toContain('reflectedLight.indirectSpecular = mix(');
    expect(out.indexOf('reflectedLight.indirectDiffuse = mix(')).toBeGreaterThan(
      out.indexOf(ROCK_FILL_ANCHOR),
    );
    expect(() => patchRefinedRockFragment('void main(){}')).toThrow(/anchor missing/);
  });

  it('leaves the Classic material on the shipped program, Refined on its own key', () => {
    const base = new THREE.MeshStandardMaterial();
    const classic = createRockMaterial(base, false);
    const refined = createRockMaterial(base, true);
    expect(classic.vertexColors).toBe(true);
    expect(classic.customProgramCacheKey()).not.toContain('ws-rock-fill');
    expect(refined.customProgramCacheKey()).toContain('ws-rock-fill');
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    const classicShader = { ...shader };
    classic.onBeforeCompile(classicShader, {} as THREE.WebGLRenderer);
    expect(classicShader.fragmentShader).toBe(THREE.ShaderLib.standard.fragmentShader);
    refined.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('World Style Refined: warm grey stone in shade');
  });
});
