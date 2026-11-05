// WYNDLEWOOD wildlife: painted four-legged bodies, each rigged and animated in
// Blender on its own skeleton (scripts/assets/creatures/README.md: a measured
// bone spec, scripts/assets/hoard_mobs/quadruped_rig.py for the clips). Pure data:
// manifest.ts merges WILDLIFE_LOOKS over its VISUALS and maps the templates through
// MOB_KEYS (WILDLIFE_MOB_KEYS), the same seam the dungeon creature looks use.
//
// Every body is addressed by a MODEL id (`wolf`, `boar`), and its visual key is
// `wildlife_<model>` (wildlifeVisualKey). A branch adding a mob wires it by naming
// that key in WILDLIFE_MOB_KEYS (or its own MOB_KEYS row); nothing else changes.
// A model only joins WILDLIFE_MODELS once its GLB ships (tests/wildlife_looks.test.ts
// checks every file is on disk and every clip is in it), so a template that is not
// mapped, or whose model has not shipped, keeps its old family body: the defaults
// never point at a missing file.

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
 *  scale 1 (the game scales the posed idle to it). */
export interface WildlifeModel {
  readonly file: string;
  readonly height: number;
  readonly tintStrength: number;
  readonly clickRadius?: number;
}

/** Every shipped wildlife body, by model id. */
export const WILDLIFE_MODELS: Readonly<Record<string, WildlifeModel>> = {
  // Lean grey forest wolf, cream ruff and legs. Drawn as tall as the old
  // mob_wolf (1.47) so a pack reads the same size in the world.
  wolf: { file: 'wildlife_wolf.glb', height: 1.47, tintStrength: 0.3 },
  // Stocky black-brown boar with a bristle crest and ivory tusks, the old
  // mob_boar's height (the crest makes it read a touch bigger).
  boar: { file: 'wildlife_boar.glb', height: 1.45, tintStrength: 0.3 },
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
 *  wins over the older family bodies those templates drew). The beast family
 *  fallback and the shaman's Shadewolf keep the old wolf: they are not wildlife. */
export const WILDLIFE_MOB_KEYS: Readonly<Record<string, string>> = {
  forest_wolf: wildlifeVisualKey('wolf'),
  snowdrift_wolf: wildlifeVisualKey('wolf'),
  wild_boar: wildlifeVisualKey('boar'),
  thicket_boar: wildlifeVisualKey('boar'),
  // (The Packlord Stampede's guardians keep their pinned bodies: greyjaw, the
  // old boar and the raptor, tests/visual_manifest.test.ts.)
  // Templates another branch is still adding (the Chapter One mobs of
  // feature/wyndlewood-story): each row takes effect only once its template
  // exists, so this branch and that one merge in either order.
  ...presentOnly({
    orchard_boar: wildlifeVisualKey('boar'),
  }),
};

/** The rows of `rows` whose template exists in the live content table. */
function presentOnly(rows: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(rows).filter(([id]) => MOBS[id] !== undefined));
}
