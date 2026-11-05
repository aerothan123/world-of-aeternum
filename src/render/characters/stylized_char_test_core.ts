// The stylized character review (owner look review, not yet a shipping lane), drawn ONLY when a
// dev session opts in with `?stylizedchars=1`. Default visuals are untouched: with the flag off
// (every production build, every headless host, every test) `stylizedTestKeyFor` answers null
// and no def is registered.
//
// Players are MODULAR: a player of any WOC class, of either body pick, draws the stylized WOC
// kit (stylized_kit_core.ts), a WOC character def like its shipped class def, with its gear
// shown as stylized armor pieces on the same rig, clip library and ClipMap. NPCs wear FIXED
// outfits: one finished, single-mesh body each, refit onto the WOC rig by
// scripts/assets/stylized_char_test/fit_woc_rig.mjs, plus per-NPC bone dials where a build
// needs them (a stout belly the arms must clear).
//
// Pure and three-free: the switch, the entity-to-key rule and the defs as data derived from the
// shipped WOC class defs.

import type { Entity } from '../../sim/types';
import type { BoneDialDef } from './bone_dials';
import type { VisualDef } from './manifest';
import {
  isStylizedKit,
  STYLIZED_CLASS_SET,
  type StylizedSet,
  stylizedKitSets,
  stylizedManifest,
} from './stylized_kit_core';
import {
  STYLIZED_NPC_LOOKS,
  stylizedNpcKey,
  stylizedNpcLookFor,
  stylizedNpcUrl,
} from './stylized_npc_looks';
import { WOC_STYLIZED_DIR, type WocFit } from './woc_armor_core';

/** The URL switch, read once per session. */
export const STYLIZED_CHARS_PARAM = 'stylizedchars';

/** The review key of one class and body fit. */
export function stylizedPlayerKey(cls: string, fit: WocFit): string {
  return `stylized_player_${cls}_${fit}`;
}
export const STYLIZED_BASE_MALE_URL = `${WOC_STYLIZED_DIR}/base_male.glb`;
export const STYLIZED_BASE_FEMALE_URL = `${WOC_STYLIZED_DIR}/base_female.glb`;

/** True when `search` (a location.search string) opts in. Only `1`/`on` do. */
export function stylizedCharsRequested(search: string): boolean {
  const v = new URLSearchParams(search).get(STYLIZED_CHARS_PARAM);
  return v === '1' || v === 'on';
}

/** The review key an entity draws with while the review is on, else null: a player of a WOC
 *  class (by body pick) and a townsperson with a fixed-outfit body; nothing else. */
export function stylizedTestKeyFor(
  e: Pick<Entity, 'kind' | 'templateId'> & {
    readonly modularAppearance?: { gender?: unknown } | null;
  },
  enabled: boolean,
): string | null {
  if (!enabled) return null;
  if (e.kind === 'player' && STYLIZED_CLASS_SET[e.templateId]) {
    return stylizedPlayerKey(
      e.templateId,
      e.modularAppearance?.gender === 'female' ? 'female' : 'male',
    );
  }
  if (e.kind === 'npc') {
    const look = stylizedNpcLookFor(e.templateId);
    return look ? stylizedNpcKey(look.look) : null;
  }
  return null;
}

/** A stout townsperson's arm dials: the upper arms swing out a little so the hands clear the
 *  belly through every clip (a rest offset on top of the WOC library's own rotations). */
export const STOUT_ARM_ABDUCTION = 0.22;
export const STOUT_ARM_DIALS: readonly BoneDialDef[] = [
  // a dial rests at its first stop: one stop is a constant turn on top of every clip
  { bone: 'upperarm.l', axis: [0, 0, 1], stops: { rest: STOUT_ARM_ABDUCTION }, rate: 20 },
  { bone: 'upperarm.r', axis: [0, 0, 1], stops: { rest: -STOUT_ARM_ABDUCTION }, rate: 20 },
];

/**
 * The review defs, derived from the shipped WOC class defs (`player_<class>` and
 * `player_<class>_female`): same clip library, ClipMap, gait refs and weapon layout, the
 * stylized kit's manifest and base file in place of the WOC one. `reviewKit` (the dev
 * `stylizedkit` pick) adds the sets it borrows to every manifest, so only a review that asks
 * for a mix loads more than a body's own set. Each townsperson (stylized_npc_looks.ts) is one
 * fixed body holding nothing, its run a calm jog (the walk cycle played faster), a stout one's
 * arms dialled clear of its belly.
 */
export function stylizedTestDefs(
  visuals: Readonly<Record<string, VisualDef>>,
  reviewKit: string | null = null,
): Record<string, VisualDef> {
  const defs: Record<string, VisualDef> = {};
  const warrior = visuals.player_warrior;
  if (warrior) {
    const { wocCharacter: _woc, ...shared } = warrior;
    for (const npc of STYLIZED_NPC_LOOKS) {
      defs[stylizedNpcKey(npc.look)] = {
        ...shared,
        url: stylizedNpcUrl(npc.look),
        lazyPreload: true,
        attach: [],
        weaponSlots: [],
        offhandSlot: undefined,
        clips: { ...shared.clips, run: shared.clips.walk },
        runRef: shared.walkRef,
        dials: npc.stout ? STOUT_ARM_DIALS : undefined,
      };
    }
  }
  const kit = reviewKit && isStylizedKit(reviewKit) ? reviewKit : 'class';
  for (const [cls, classSet] of Object.entries(STYLIZED_CLASS_SET) as [string, StylizedSet][]) {
    const extra = stylizedKitSets(kit, classSet).filter((s) => s !== classSet);
    for (const fit of ['male', 'female'] as const) {
      const def = visuals[fit === 'female' ? `player_${cls}_female` : `player_${cls}`];
      if (!def?.wocCharacter) continue;
      defs[stylizedPlayerKey(cls, fit)] = {
        ...def,
        url: fit === 'female' ? STYLIZED_BASE_FEMALE_URL : STYLIZED_BASE_MALE_URL,
        lazyPreload: true,
        wocCharacter: stylizedManifest(fit, def.wocCharacter, classSet, extra),
      };
    }
  }
  return defs;
}
