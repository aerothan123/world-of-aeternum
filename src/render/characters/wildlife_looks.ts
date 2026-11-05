// WYNDLEWOOD wildlife: painted bodies, each rigged and animated in Blender on its
// own skeleton (scripts/assets/creatures/README.md: a measured bone spec, or the
// leg finder for the many-legged ones, then scripts/assets/hoard_mobs/
// quadruped_rig.py for the clips). Pure data: manifest.ts merges WILDLIFE_LOOKS
// over its VISUALS and maps the templates through MOB_KEYS (WILDLIFE_MOB_KEYS),
// the same seam the dungeon creature looks use.
//
// Every body is addressed by a MODEL id (`wolf`, `boar`), and its visual key is
// `wildlife_<model>` (wildlifeVisualKey). A branch adding a mob wires it by naming
// that key in WILDLIFE_MOB_KEYS (or its own MOB_KEYS row); nothing else changes.
// A model only joins WILDLIFE_MODELS once its GLB ships (tests/wildlife_looks.test.ts
// checks every file is on disk and every clip is in it), so a template that is not
// mapped, or whose model has not shipped, keeps its old family body: the defaults
// never point at a missing file. Variants are the template's own colour (the entity
// tint) and scale over one shared body, never a second file.

import { MOBS } from '../../sim/data';
import type { ClipMap, VisualDef } from './manifest';

const CREATURES = 'models/creatures';

/** The clip set quadruped_rig.py bakes onto every wildlife body. */
export const WILDLIFE_CLIPS: ClipMap = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  attack: ['Attack'],
  hit: ['Hit'],
  death: 'Death',
  cast: 'Cast',
  // a paddling walk beats the steep no-clip procedural prone on a quadruped
  // (the call the wolf and bear forms make)
  swim: 'Walk',
};

/** One shipped wildlife body. `height` is the drawn idle height at template
 *  scale 1 (the game scales the posed idle to it). `legs` names the skeleton:
 *  `four` is the measured fore and hind leg chain, `many` the found legs of a
 *  spider, crab or beetle (Leg<n>Upper/Lower per side). */
export interface WildlifeModel {
  readonly file: string;
  readonly height: number;
  readonly tintStrength: number;
  readonly legs: 'four' | 'many';
  readonly clickRadius?: number;
}

/** Every shipped wildlife body, by model id. */
export const WILDLIFE_MODELS: Readonly<Record<string, WildlifeModel>> = {
  // Lean grey forest wolf, cream ruff and legs. Drawn as tall as the old
  // mob_wolf (1.47) so a pack reads the same size in the world.
  wolf: { file: 'wildlife_wolf.glb', height: 1.47, tintStrength: 0.3, legs: 'four' },
  // Stocky black-brown boar with a bristle crest and ivory tusks, the old
  // mob_boar's height (the crest makes it read a touch bigger).
  boar: { file: 'wildlife_boar.glb', height: 1.45, tintStrength: 0.3, legs: 'four' },
  // Slender russet fox, white tail tip and black socks: a little under the old
  // mob_fox (1.0), so it reads smaller than a wolf beside one.
  fox: { file: 'wildlife_fox.glb', height: 0.95, tintStrength: 0.3, legs: 'four' },
  // Heavy brown bear on all fours (the old mob_bear was the upright yeti body).
  bear: { file: 'wildlife_bear.glb', height: 1.8, tintStrength: 0.3, legs: 'four' },
  // Big bristly shore rat, bare tail and yellowed teeth: knee high on a person.
  rat: { file: 'wildlife_rat.glb', height: 0.8, tintStrength: 0.3, legs: 'four' },
  // Round furry forest spider, the old mob_spider's height.
  spider: {
    file: 'wildlife_spider.glb',
    height: 1.3,
    tintStrength: 0.3,
    legs: 'many',
    clickRadius: 1.1,
  },
  // Sandy orange shore crab, both pincers held forward.
  crab: { file: 'wildlife_crab.glb', height: 1.2, tintStrength: 0.3, legs: 'many', clickRadius: 1 },
  // Moss-green ground beetle with a bronze sheen.
  beetle: { file: 'wildlife_beetle.glb', height: 0.9, tintStrength: 0.3, legs: 'many' },
};

/** The visual key of a wildlife model id. */
export function wildlifeVisualKey(model: string): string {
  return `wildlife_${model}`;
}

function look(model: WildlifeModel): VisualDef {
  return {
    url: `${CREATURES}/${model.file}`,
    height: model.height,
    // The rigged body faces +x; yaw swings it onto the game's facing.
    yaw: -Math.PI / 2,
    clips: WILDLIFE_CLIPS,
    authoredAtlas: true,
    // A light entity tint keeps each template's colour (a snowdrift wolf paler,
    // a thicket boar darker) without painting over the hand-painted texture.
    tint: 'entity',
    tintStrength: model.tintStrength,
    ...(model.clickRadius ? { clickRadius: model.clickRadius } : {}),
  };
}

/** The wildlife VisualDefs, keyed by wildlifeVisualKey (merged into VISUALS). */
export const WILDLIFE_LOOKS: Readonly<Record<string, VisualDef>> = Object.fromEntries(
  Object.entries(WILDLIFE_MODELS).map(([id, model]) => [wildlifeVisualKey(id), look(model)]),
);

/** Each mapped template's wildlife key (merged LAST into manifest MOB_KEYS, so it
 *  wins over the older family bodies those templates drew). Only open-world
 *  wildlife is mapped: dungeon trash and bosses keep their pinned bodies, and the
 *  beast family fallback and the shaman's Shadewolf keep the old wolf. */
export const WILDLIFE_MOB_KEYS: Readonly<Record<string, string>> = {
  // Wolves: the vale pack, the snowline pack, the marsh and ridge hunters and
  // the terrace howlers (each keeps its own colour and scale).
  forest_wolf: wildlifeVisualKey('wolf'),
  snowdrift_wolf: wildlifeVisualKey('wolf'),
  mire_prowler: wildlifeVisualKey('wolf'),
  ridge_stalker: wildlifeVisualKey('wolf'),
  terrace_howler: wildlifeVisualKey('wolf'),
  wild_boar: wildlifeVisualKey('boar'),
  thicket_boar: wildlifeVisualKey('boar'),
  gloam_fox: wildlifeVisualKey('fox'),
  // The ridge's elite bear rare drew the upright yeti body.
  old_cragmaw: wildlifeVisualKey('bear'),
  webwood_spider: wildlifeVisualKey('spider'),
  mire_widow: wildlifeVisualKey('spider'),
  mirefen_widowling: wildlifeVisualKey('spider'),
  canopy_weaver: wildlifeVisualKey('spider'),
  widowsilk_spinner: wildlifeVisualKey('spider'),
  shore_scuttler: wildlifeVisualKey('crab'),
  mister_crabs: wildlifeVisualKey('crab'),
  tide_scuttler: wildlifeVisualKey('crab'),
  shoal_scuttler: wildlifeVisualKey('crab'),
  old_marrowshell: wildlifeVisualKey('crab'),
  // (The Packlord Stampede's guardians keep their pinned bodies: greyjaw, the
  // old boar and the raptor, tests/visual_manifest.test.ts.)
  // Templates another branch is still adding (the Chapter One mobs of
  // feature/wyndlewood-story): each row takes effect only once its template
  // exists, so this branch and that one merge in either order.
  ...presentOnly({
    orchard_boar: wildlifeVisualKey('boar'),
    briarbitten_fox: wildlifeVisualKey('fox'),
    bristlejaw_shore_rat: wildlifeVisualKey('rat'),
    culvert_rat: wildlifeVisualKey('rat'),
    // A burrowing quarry pest: the ground beetle, not the kobold digger the
    // story template inherits from the tunnel rat.
    quarry_burrower: wildlifeVisualKey('beetle'),
  }),
};

/** The rows of `rows` whose template exists in the live content table. */
function presentOnly(rows: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(rows).filter(([id]) => MOBS[id] !== undefined));
}
