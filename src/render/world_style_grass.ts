// World Style Refined grass: the thin painter over world_style_grass_core.ts.
// Chains the flower-cluster and per-blade wash arm onto the blade carpet and
// mid-band materials, AFTER their painted-grass arm (world_style_foliage.ts),
// at material build. The style is fixed for the renderer's lifetime (a style
// change rides the full graphics rebuild), so no program is keyed per frame
// and the materials keep the prewarm homes they already have.
//
// Classic: returns before touching the material, so its hook, its program
// key and its program are the shipped ones byte for byte.

import type * as THREE from 'three';
import { worldStyleRefined } from './world_style';
import {
  PAINTED_BLOOM_FRAG_DECL,
  PAINTED_BLOOM_VERT_DECL,
  paintedBloomFragGlsl,
  paintedBloomVertGlsl,
} from './world_style_grass_core';

function spliceAfter(src: string, anchor: string, add: string, what: string): string {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`world style grass: ${what} anchor missing: ${anchor}`);
  const end = at + anchor.length;
  return src.slice(0, end) + add + src.slice(end);
}

/** The flower-cluster arm (Refined only). `heightExpr` is the blade's 0..1
 *  height from the LOCAL vertex, the same expression the painted-grass arm
 *  reads. Call after paintRefinedGrass so the heads paint over its tips. */
export function paintRefinedBloom(mat: THREE.Material, heightExpr: string): void {
  if (!worldStyleRefined()) return;
  const prev = mat.onBeforeCompile;
  const prevKey =
    typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
  const prevSrc = typeof prev === 'function' ? prev.toString() : '';
  mat.onBeforeCompile = (sh, renderer) => {
    prev?.call(mat, sh, renderer);
    let v = spliceAfter(
      sh.vertexShader,
      '#include <common>',
      PAINTED_BLOOM_VERT_DECL,
      'vert common',
    );
    v = spliceAfter(v, '#include <begin_vertex>', paintedBloomVertGlsl(heightExpr), 'begin_vertex');
    sh.vertexShader = v;
    let fr = spliceAfter(
      sh.fragmentShader,
      '#include <common>',
      PAINTED_BLOOM_FRAG_DECL,
      'frag common',
    );
    // Anchored on the stock chunk AFTER <color_fragment>, so the block lands
    // behind the painted-grass block that arm spliced right after it.
    fr = spliceBefore(fr, '#include <alphamap_fragment>', paintedBloomFragGlsl(), 'alphamap');
    sh.fragmentShader = fr;
  };
  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : prevSrc}|ws-bloom:${heightExpr}`;
}

function spliceBefore(src: string, anchor: string, add: string, what: string): string {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`world style grass: ${what} anchor missing: ${anchor}`);
  return `${src.slice(0, at)}${add}\n${src.slice(at)}`;
}
