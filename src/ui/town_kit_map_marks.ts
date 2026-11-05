// Map marks for Eastbrook's town kit (town kit phase 2). The kit's houses,
// trading post, storage shed and stable stand as decor props
// (content/zone1.ts appends EASTBROOK_LAYOUT.townKit to decorProps), never as
// props.buildings, so the map's detail overlay reads their silhouettes from
// the active world's own decor rows: a custom world without the kit draws
// none of it. The well and the two square stalls read as the map's well and
// stall dots. Pure and DOM-free; map_window_view.ts consumes it.
import { TOWN_KIT_ASSETS, type TownKitAsset } from '../sim/eastbrook_layout';
import type { ZonePropsDef } from '../sim/types';

export interface TownKitMapFootprint {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly rot: number;
}

export interface TownKitMapMarks {
  readonly buildings: TownKitMapFootprint[];
  readonly wells: { x: number; z: number }[];
  readonly stalls: { x: number; z: number }[];
}

type KitMark = 'building' | 'well' | 'stall';

const MARK_BY_PROP_KEY: ReadonlyMap<string, KitMark> = new Map(
  (Object.entries(TOWN_KIT_ASSETS) as [string, TownKitAsset][]).flatMap(
    ([assetId, asset]): [string, KitMark][] => {
      if (assetId === 'civic_well') return [[asset.propKey, 'well']];
      if (assetId.startsWith('civic_market_stall')) return [[asset.propKey, 'stall']];
      if (assetId.startsWith('house_') || assetId.startsWith('civic_'))
        return [[asset.propKey, 'building']];
      return [];
    },
  ),
);

export function townKitMapMarks(props: Pick<ZonePropsDef, 'decorProps'>): TownKitMapMarks {
  const marks: TownKitMapMarks = { buildings: [], wells: [], stalls: [] };
  for (const decor of props.decorProps ?? []) {
    const mark = MARK_BY_PROP_KEY.get(decor.key);
    if (!mark) continue;
    if (mark === 'well') marks.wells.push({ x: decor.x, z: decor.z });
    else if (mark === 'stall') marks.stalls.push({ x: decor.x, z: decor.z });
    else if (decor.hw !== undefined && decor.hd !== undefined)
      marks.buildings.push({
        id: `${decor.key}@${decor.x},${decor.z}`,
        x: decor.x,
        z: decor.z,
        w: decor.hw * 2,
        d: decor.hd * 2,
        rot: decor.rot ?? 0,
      });
  }
  return marks;
}
