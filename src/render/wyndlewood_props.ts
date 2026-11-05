// The Wyndlewood props kit (assets_src/wyndlewood_props/): the generated
// painted quest objects, landmarks and housing furniture shipped under
// public/models/props/wyn_*.glb, joined into the props registry (props.ts
// PROP_ASSET_DEFS) so a zone's decorProps or the house furniture renderer
// names a model by its stable prop key (src/sim/content/wyndlewood_props.ts
// WYN_PROP_MODELS). One preload per GLB through the registry's deferred lane,
// merged with the rest of the static decor, revealed behind the props band
// gate like every decor row.
//
// Registering a model draws nothing by itself: the story crew places quest
// objects through their own content records, and placed furniture draws
// through src/render/house_furniture.ts.
//
// Quest objects and landmarks are things a player walks to and interacts
// with, so every model renders on every graphics tier (the gameplay-neutral
// graphics rule, src/ui/CLAUDE.md): they all join the low-tier key list.
import { WYN_PROP_MODELS } from '../sim/content/wyndlewood_props';

const WYN_PROP_KIT = 'wynprops';

export const WYN_PROP_DEFS: Readonly<Record<string, { url: string; kit: string }>> =
  Object.freeze(
    Object.fromEntries(
      Object.values(WYN_PROP_MODELS).map((model) => [
        model.propKey,
        { url: model.url, kit: WYN_PROP_KIT },
      ]),
    ),
  );

/** Every kit key, for the low-tier render list. */
export const WYN_PROP_LOW_TIER_KEYS: readonly string[] = Object.freeze(Object.keys(WYN_PROP_DEFS));
