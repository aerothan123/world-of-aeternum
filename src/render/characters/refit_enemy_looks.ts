// WYNDLEWOOD's rebuilt enemy and boss bodies: original painted single meshes, each
// refit onto the shipped WOC_Armored_Rig (scripts/assets/stylized_char_test/
// fit_woc_rig.mjs, the same refit as story_mob_looks.ts), so each plays the WOC
// animation library and ClipMap of the class it fights like. They replace the
// inherited bodies IN PLACE: the same file under models/creatures and the same
// visual keys, so no template, MOB_KEYS row or encounter changes.
// Pure data: manifest.ts merges refitEnemyLooks(VISUALS) over its VISUALS after the
// WOC class defs exist. Every def drawing a listed file is rebuilt from its class
// def: the library, ClipMap and gait refs ride along, and the old def keeps only its
// size, colour, click, hover and glow facts and the props it hung on a hand slot.
// The old bodies' bespoke clips (a boss's signature moves, a risen skeleton's
// Awaken) are gone with them, so an ability that named one plays the class def's
// own cast or strike; the cast bar is the HUD's and is unchanged.

import type { VisualDef } from './manifest';
import { WILDLIFE_CLIPS } from './wildlife_looks';

const CREATURES = 'models/creatures/';

/** The WOC class def a rebuilt body fights like. */
export type RefitBase =
  | 'player_warrior'
  | 'player_rogue'
  | 'player_priest'
  | 'player_warlock'
  | 'player_paladin'
  | 'player_hunter';

/** One rebuilt body: the class it plays, and whether the old def's hand-slot props
 *  still hang on it (false when the new mesh carries its own weapons). */
export interface RefitBody {
  /** `beast`: a four-legged body on its own quadruped_rig.py skeleton, playing the
   *  painted wildlife clip set (WILDLIFE_CLIPS) it ships, with no class library. */
  readonly base: RefitBase | 'beast';
  readonly props?: boolean;
}

/** Every rebuilt file (under models/creatures), by the class def it plays. */
export const REFIT_ENEMY_FILES: Readonly<Record<string, RefitBody>> = {
  // every risen skeleton in the vale, the crypt and the drowned keep
  'woc_skeleton_minion.glb': { base: 'player_warrior' },
  // the Hollow Crypt
  'woc_crypt_ossuary_warrior.glb': { base: 'player_warrior' },
  // its curved bone knives are part of the mesh
  'woc_crypt_ossuary_cutthroat.glb': { base: 'player_rogue', props: false },
  'woc_crypt_bone_brute.glb': { base: 'player_warrior' },
  'woc_crypt_gravecaller_adept.glb': { base: 'player_warlock' },
  'woc_crypt_gravecaller_necromancer.glb': { base: 'player_warlock' },
  'woc_crypt_hollow_chorister.glb': { base: 'player_priest' },
  'woc_crypt_cantor_ilvane.glb': { base: 'player_priest' },
  'woc_crypt_sexton_marrow.glb': { base: 'player_warrior' },
  'woc_crypt_morthen.glb': { base: 'player_warlock' },
  // the Sunken Bastion
  'woc_bastion_olen.glb': { base: 'player_paladin' },
  'woc_bastion_vael.glb': { base: 'player_priest' },
  // the gaol's master and his turnkey hold their cudgel and key in the mesh
  'woc_bastion_ossick.glb': { base: 'player_warrior', props: false },
  'woc_bastion_turnkey.glb': { base: 'player_warrior', props: false },
  // the shipwreck captain, his cutlass in the mesh
  'woc_bastion_captain.glb': { base: 'player_warrior', props: false },
  // the drowned garrison and the hymn's living cult
  'drowned_revenant.glb': { base: 'player_warrior' },
  'drowned_watchman.glb': { base: 'player_warrior' },
  'drowned_sergeant.glb': { base: 'player_warrior' },
  'tidebound_acolyte.glb': { base: 'player_priest' },
  'mist_chanter.glb': { base: 'player_warlock' },
  // the Hollow Crypt's ice bride
  'woc_crypt_lady_bonechill.glb': { base: 'player_priest' },
  // the garrison's war mastiff, on its own four-legged rig
  'bastion_warhound.glb': { base: 'beast' },
  // the wall's marksman (his crossbow slung on his back) and the gaol's chained dead
  'drowned_arbalest.glb': { base: 'player_hunter', props: false },
  'drowned_prisoner.glb': { base: 'player_warrior' },
  // the Wreckbound Sailor the barnacle crawler key draws
  'bastion_ghost_sailor.glb': { base: 'player_warrior' },
  // the Drowned Temple's Pale Choir Acolyte
  'temple_acolyte.glb': { base: 'player_priest' },
  // the Drowned Temple's sea-glass giant
  'woc_temple_colossus.glb': { base: 'player_warrior', props: false },
};

/** The facts of the old def a rebuilt body keeps (none of them names a clip). */
const KEPT = [
  'height',
  'tint',
  'tintStrength',
  'clickRadius',
  'hover',
  'deathLift',
  'lazyPreload',
  'selfIllumination',
] as const;

/** The rebuilt file a def draws, or null for any other def. */
export function refitFileOf(def: Pick<VisualDef, 'url'>): string | null {
  const url = def.url ?? '';
  if (!url.startsWith(CREATURES)) return null;
  const file = url.slice(CREATURES.length);
  return Object.hasOwn(REFIT_ENEMY_FILES, file) ? file : null;
}

/** The rebuilt defs, keyed as the defs they replace (merged into VISUALS). */
export function refitEnemyLooks(
  visuals: Readonly<Record<string, VisualDef>>,
): Record<string, VisualDef> {
  const out: Record<string, VisualDef> = {};
  for (const [key, def] of Object.entries(visuals)) {
    const file = refitFileOf(def);
    if (!file) continue;
    const body = REFIT_ENEMY_FILES[file];
    const kept: Partial<VisualDef> = {};
    for (const field of KEPT) {
      if (def[field] !== undefined) (kept as Record<string, unknown>)[field] = def[field];
    }
    if (body.base === 'beast') {
      out[key] = { url: def.url, ...kept, clips: WILDLIFE_CLIPS, attach: [], authoredAtlas: true };
      continue;
    }
    const base = visuals[body.base];
    if (!base) continue;
    const { wocCharacter: _woc, rightShoulderSheathe: _sheathe, ...shared } = base;
    out[key] = {
      ...shared,
      url: def.url,
      ...kept,
      // a prop the old body held in a hand still hangs on the WOC hand slots
      attach:
        body.props === false ? [] : (def.attach ?? []).filter((a) => a.bone.startsWith('handslot')),
      weaponSlots: [],
      offhandSlot: undefined,
      authoredAtlas: true,
    };
  }
  return out;
}
