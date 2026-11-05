// WYN-H1, the Wyndlewood-owned humanoid rig (docs/design/wyndlewood-rig.md), as the
// renderer reads it: where a fit's base and clip files live, the P0 clip vocabulary and
// its gait references. The skeleton is built by scripts/rig/build_wyn_h1.mjs from landmarks
// on our own body meshes and the clips by scripts/rig/build_wyn_clips.mjs, from scratch.
// P0 is dev-only (`?stylizedchars=1&stylizedrig=wyn`); every ClipMap field the P0 library
// has no clip for yet plays Idle until its phase lands. Pure data, three-free.

import type { ClipMap } from './manifest';
import type { WocFit } from './woc_armor_core';

/** The rig's shipped directory under `public/`. */
export const WYN_DIR = 'models/chars/wyn';

/** A body fit's base file: the stylized body bound to WYN-H1. */
export function wynBaseUrl(fit: WocFit): string {
  return `${WYN_DIR}/base_${fit}.glb`;
}

/** A body fit's clip library (mesh-free). */
export function wynAnimsUrl(fit: WocFit): string {
  return `${WYN_DIR}/anims_${fit}.glb`;
}

/** The clips the P0 library ships, by name (the same names the WOC ClipMaps use). */
export const WYN_P0_CLIP_NAMES = ['Idle', 'Walk', 'Run'] as const;

/** The P0 ClipMap: the gaits it has, Idle for every one-shot it does not have yet. */
export const WYN_P0_CLIPS: ClipMap = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  walkBack: 'Walk',
  strafeLeft: 'Walk',
  strafeRight: 'Walk',
  attack: ['Idle'],
  death: 'Idle',
};

/** World speeds at which each fit's P0 gaits keep the planted foot on the ground (printed
 *  by build_wyn_clips.mjs for the 2.86-unit drawn height; the female legs are longer). */
export const WYN_P0_GAIT: Readonly<Record<WocFit, { walkRef: number; runRef: number }>> = {
  male: { walkRef: 1.75, runRef: 4.89 },
  female: { walkRef: 2.2, runRef: 6.12 },
};
