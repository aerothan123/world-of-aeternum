// The Eastbrook town kit's props (docs/design/town-layout-eastbrook.md, phase
// 2): the generated painted set shipped under public/models/props/town_*.glb,
// joined into the props registry (props.ts PROP_ASSET_DEFS) so the zone decor
// walk places them (content/zone1.ts decorProps from
// sim/eastbrook_layout.ts TOWN_KIT). One preload per GLB through the props
// registry's tier-independent deferred lane, merged with the rest of the
// static decor, and revealed behind the props band gate like every decor row.
//
// Every kit piece collides (box colliders on its walls and benches), so every
// one renders on every graphics tier: a tier may never draw less than what
// blocks (the gameplay-neutral graphics rule, src/ui/CLAUDE.md).
import { TOWN_KIT_ASSETS } from '../sim/eastbrook_layout';

const TOWN_KIT_PROP_KIT = 'townkit';

export const TOWN_KIT_PROP_DEFS: Readonly<Record<string, { url: string; kit: string }>> =
  Object.freeze(
    Object.fromEntries(
      Object.values(TOWN_KIT_ASSETS).map((asset) => [
        asset.propKey,
        { url: asset.url, kit: TOWN_KIT_PROP_KIT },
      ]),
    ),
  );

/** Every kit key, for the low-tier render list (structure and benches both). */
export const TOWN_KIT_LOW_TIER_KEYS: readonly string[] = Object.freeze(
  Object.keys(TOWN_KIT_PROP_DEFS),
);
