// World Style Refined foliage: the thin painter over world_style_foliage_core.ts.
// It chains the painted-grass and painterly-canopy shader arms onto foliage
// materials that ALREADY exist and already have their prewarm homes (the
// blade carpet and mid band, the grass tuft cards and the ground-decor
// prewarm draw, the kit and generated tree canopies with their bucket gates).
// The arm is chosen once when the material is made: the World Style is fixed
// for the renderer's lifetime and a style change rides the full graphics
// rebuild, so no program is ever keyed per frame.
//
// Classic: every entry point returns before touching the material, so its
// onBeforeCompile, its customProgramCacheKey and therefore its program are the
// shipped ones byte for byte (pinned in tests/world_style_foliage.test.ts).

import type * as THREE from 'three';
import { worldStyleRefined, worldStyleUniforms } from './world_style';
import {
  PAINTED_CANOPY_FRAG_DECL,
  PAINTED_CANOPY_VERT_DECL,
  PAINTED_CANOPY_VERT_GLSL,
  PAINTED_GRASS_FRAG_DECL,
  PAINTED_GRASS_VERT_DECL,
  paintedCanopyFragGlsl,
  paintedCanopyRimGlsl,
  paintedCanopyVertGlsl,
  paintedGrassFragGlsl,
  paintedGrassVertGlsl,
} from './world_style_foliage_core';

type Shader = THREE.WebGLProgramParametersWithUniforms;

/** Splice once at an anchor; a missing anchor is loud (a three bump or a
 *  Classic edit moved it), never a silent no-op. */
function spliceAfter(src: string, anchor: string, add: string, what: string): string {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`world style foliage: ${what} anchor missing: ${anchor}`);
  const end = at + anchor.length;
  return src.slice(0, end) + add + src.slice(end);
}
function spliceBefore(src: string, anchor: string, add: string, what: string): string {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`world style foliage: ${what} anchor missing: ${anchor}`);
  // The anchor is a preprocessor line: it must keep starting its own line.
  return `${src.slice(0, at)}${add}\n${src.slice(at)}`;
}

/** Chain `patch` after the material's existing hook and name it in the key. */
function chainPatch(mat: THREE.Material, tag: string, patch: (sh: Shader) => void): void {
  const prev = mat.onBeforeCompile;
  const prevSrc = typeof prev === 'function' ? prev.toString() : '';
  const prevKey =
    typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    patch(shader);
  };
  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : prevSrc}|${tag}`;
}

/** The painted-grass shader arm (Refined only). `heightExpr` is a vertex
 *  expression for the blade's 0..1 height, read from the LOCAL vertex. */
export function paintRefinedGrass(mat: THREE.Material, heightExpr: string): void {
  if (!worldStyleRefined()) return;
  chainPatch(mat, `ws-grass:${heightExpr}`, (sh) => {
    let v = spliceAfter(
      sh.vertexShader,
      '#include <common>',
      PAINTED_GRASS_VERT_DECL,
      'grass vert common',
    );
    v = spliceAfter(
      v,
      '#include <begin_vertex>',
      paintedGrassVertGlsl(heightExpr),
      'grass begin_vertex',
    );
    sh.vertexShader = v;
    let fr = spliceAfter(
      sh.fragmentShader,
      '#include <common>',
      PAINTED_GRASS_FRAG_DECL,
      'grass frag common',
    );
    fr = spliceAfter(
      fr,
      '#include <color_fragment>',
      paintedGrassFragGlsl(),
      'grass color_fragment',
    );
    sh.fragmentShader = fr;
  });
}

/** The painterly canopy shader arm (Refined only): top-light and
 *  under-shadow along the canopy normal, per-tree hue, a softened leaf
 *  texture and a warm daylight rim. `knownLeaf` false (a material the caller
 *  cannot name as a leaf, such as a regenerated GLB's) paints only its green
 *  texels, so bark and stone keep their look on any model. */
export function paintRefinedCanopy(mat: THREE.Material, knownLeaf = true, upExpr?: string): void {
  if (!worldStyleRefined()) return;
  const tag = `ws-canopy:${knownLeaf ? 'leaf' : 'auto'}${upExpr ? `:${upExpr}` : ''}`;
  chainPatch(mat, tag, (sh) => {
    sh.uniforms.uWsFoliage = worldStyleUniforms.uWsFoliage;
    let v = spliceAfter(
      sh.vertexShader,
      '#include <common>',
      PAINTED_CANOPY_VERT_DECL,
      'canopy vert common',
    );
    v = spliceAfter(
      v,
      '#include <defaultnormal_vertex>',
      upExpr ? paintedCanopyVertGlsl(upExpr) : PAINTED_CANOPY_VERT_GLSL,
      'canopy normal',
    );
    sh.vertexShader = v;
    let fr = spliceAfter(
      sh.fragmentShader,
      '#include <common>',
      PAINTED_CANOPY_FRAG_DECL,
      'canopy frag common',
    );
    fr = spliceAfter(
      fr,
      '#include <color_fragment>',
      paintedCanopyFragGlsl(knownLeaf),
      'canopy color_fragment',
    );
    fr = spliceBefore(fr, '#include <aomap_fragment>', paintedCanopyRimGlsl(), 'canopy aomap');
    sh.fragmentShader = fr;
  });
}
