// The Wyndlewood props kit (assets_src/wyndlewood_props/): the generated
// painted quest objects, landmarks and housing furniture shipped under
// public/models/props/wyn_*.glb.
//
// World models (quest objects, ruins, shrines, bridges, Pale Accord traces,
// outposts) join the props registry (props.ts PROP_ASSET_DEFS) so a zone's
// decorProps names a model by its stable prop key (src/sim/content/
// wyndlewood_props.ts WYN_PROP_MODELS). The registry preloads its whole
// catalogue at boot (a placement key must always be preloaded), so only what
// the world can place belongs there.
//
// Furniture stays OUT of the registry: it only ever draws inside a player's
// house, where src/render/house_furniture.ts loads its models on demand and
// attaches each piece behind its compile gate. Keeping the catalogue's dozens
// of furniture GLBs out of the boot preload and the props material prewarm is
// the point; WYN_FURNITURE_MODEL_URLS is the house renderer's lookup.
//
// Registering a model draws nothing by itself: the story crew places quest
// objects through their own content records. Quest objects and landmarks are
// things a player walks to and interacts with, so every world model renders
// on every graphics tier (the gameplay-neutral graphics rule, src/ui/CLAUDE.md):
// they all join the low-tier key list.
import { WYN_PROP_MODELS } from '../sim/content/wyndlewood_props';

const WYN_PROP_KIT = 'wynprops';
const MODELS = Object.values(WYN_PROP_MODELS);

export const WYN_PROP_DEFS: Readonly<Record<string, { url: string; kit: string }>> = Object.freeze(
  Object.fromEntries(
    MODELS.filter((model) => model.category !== 'furniture').map((model) => [
      model.propKey,
      { url: model.url, kit: WYN_PROP_KIT },
    ]),
  ),
);

/** Every world kit key, for the low-tier render list. */
export const WYN_PROP_LOW_TIER_KEYS: readonly string[] = Object.freeze(Object.keys(WYN_PROP_DEFS));

/** The painted furniture models by render key (house_furniture.ts loads them on demand). */
export const WYN_FURNITURE_MODEL_URLS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    MODELS.filter((model) => model.category === 'furniture').map((model) => [
      model.propKey,
      model.url,
    ]),
  ),
);
