// WYNDLEWOOD's Chapter One humanoid mobs: hand-painted single-mesh bodies refit
// onto the shipped WOC_Armored_Rig (scripts/assets/stylized_char_test/
// fit_woc_rig.mjs, a Tripo biped rig turned onto the WOC joints), so each plays
// the WOC animation library and ClipMap of the class it fights like, unchanged.
// Pure data: manifest.ts merges storyMobLooks(VISUALS) over its VISUALS (after the
// WOC class defs exist) and maps the templates through MOB_KEYS (STORY_MOB_KEYS).
//
// The templates themselves are the story branch's (feature/wyndlewood-story,
// src/sim/content/chapter_one.ts), so every row waits until its template exists:
// before that nothing maps, and after it the mob draws this body. Either branch
// can merge first. A template named in MOB_LOOK_IDS (an authored WOC look) keeps
// that look: mobVisualKey resolves the look before MOB_KEYS, so only a new id
// with no roster row draws one of these bodies.

import { MOBS } from '../../sim/data';
import type { VisualDef } from './manifest';

const DIR = 'models/creatures/story';

/** One Chapter One humanoid body: its file and the class def it fights like. */
export interface StoryMobModel {
  readonly file: string;
  /** The WOC class def whose library, ClipMap and gait refs it plays. */
  readonly base: 'player_warrior' | 'player_priest' | 'player_rogue';
}

/** Every shipped body, by its mob template id. */
export const STORY_MOB_MODELS: Readonly<Record<string, StoryMobModel>> = {
  // A risen farm labourer (straw hat, patched smock, grave soil): swings like
  // a brawler, so the warrior's strikes, empty-handed.
  gravestirred_fieldhand: { file: 'gravestirred_fieldhand.glb', base: 'player_warrior' },
  // A Pale Accord rite tender (pale layered robes, a gauze veil, bone charms):
  // casts like a priest.
  veiled_rite_tender: { file: 'veiled_rite_tender.glb', base: 'player_priest' },
};

/** The visual key of a story mob body. */
export function storyMobVisualKey(templateId: string): string {
  return `story_${templateId}`;
}

/** The defs, each derived from its class def: the library, ClipMap and gait
 *  refs ride along; the WOC-only composition (split armor, streamed head) and
 *  every held weapon do not, because the body is one finished mesh. */
export function storyMobLooks(
  visuals: Readonly<Record<string, VisualDef>>,
): Record<string, VisualDef> {
  const out: Record<string, VisualDef> = {};
  for (const [id, model] of Object.entries(STORY_MOB_MODELS)) {
    const base = visuals[model.base];
    if (!base) continue;
    const { wocCharacter: _woc, rightShoulderSheathe: _sheathe, ...shared } = base;
    out[storyMobVisualKey(id)] = {
      ...shared,
      url: `${DIR}/${model.file}`,
      lazyPreload: true,
      attach: [],
      weaponSlots: [],
      offhandSlot: undefined,
    };
  }
  return out;
}

/** Each present template's body key (merged into manifest MOB_KEYS). */
export const STORY_MOB_KEYS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(STORY_MOB_MODELS)
    .filter((id) => MOBS[id] !== undefined)
    .map((id) => [id, storyMobVisualKey(id)]),
);
