// Quest Workshop content index: the read-only picture of the shipped content the
// workshop's pickers list and its validator checks ids against (NPCs grouped by
// zone, mobs, items, recipes, gather node types, the built-in quests, and the
// set of items a collect objective can legitimately ask for).
//
// A pure core: deterministic, DOM-free, i18n-free. It is built ONCE per host
// from the merged tables (`buildContentIndex` reads src/sim/data on the page and
// on the dev-server save endpoint alike, so both validate against the same
// picture) and handed to quest_editor_core.ts, which never touches the tables
// itself and so stays unit-testable over a hand-built index.

import { FARM_CROPS } from '../sim/content/farm_crops';
import { HARVEST_COMPONENT_ITEMS } from '../sim/content/professions';
import { WORKSHOP_QUEST_IDS } from '../sim/content/workshop_quests.generated';
import {
  ALL_RECIPES,
  CAMPS,
  GATHER_NODES,
  GROUND_OBJECTS,
  ITEMS,
  MOBS,
  NPCS,
  QUESTS,
  ZONES,
  zoneAt,
} from '../sim/data';
import { NODE_MATERIAL_TABLE } from '../sim/professions/gathering_materials';
import type { GatherNodeType, PlayerClass } from '../sim/types';

export interface IndexedNpc {
  id: string;
  name: string;
  title: string;
  zoneId: string;
  zoneName: string;
  /** The quest ids the shipped content lists on this NPC (workshop additions
   *  excluded: the workshop shows those as its own editable rows). */
  questIds: readonly string[];
}

export interface IndexedMob {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  /** The zone of the mob's first camp, or null for a mob no camp spawns. */
  zoneId: string | null;
  zoneName: string | null;
}

export interface IndexedItem {
  id: string;
  name: string;
  kind: string;
  quality: string;
  requiredLevel: number | null;
  requiredClass: readonly PlayerClass[] | null;
}

export interface IndexedRecipe {
  id: string;
  professionId: string;
  resultItemId: string;
  resultName: string;
}

export interface IndexedQuest {
  id: string;
  name: string;
  giverNpcId: string;
  requiresQuest: string | null;
}

export interface IndexedZone {
  id: string;
  name: string;
}

export interface ContentIndex {
  zones: readonly IndexedZone[];
  npcs: Readonly<Record<string, IndexedNpc>>;
  mobs: Readonly<Record<string, IndexedMob>>;
  items: Readonly<Record<string, IndexedItem>>;
  recipes: Readonly<Record<string, IndexedRecipe>>;
  /** The shipped quests (the merged table minus the workshop's own rows, so a
   *  workshop quest never reads as a taken id or as its own prerequisite). */
  quests: Readonly<Record<string, IndexedQuest>>;
  nodeTypes: readonly GatherNodeType[];
  /** Items a collect objective can legitimately ask for: mob loot, ground
   *  objects, gather nodes, corpse harvest, farm produce, vendor stock, craft
   *  outputs (the same model tests/progression.test.ts holds every shipped
   *  collect objective to). */
  acquirableItemIds: ReadonlySet<string>;
  /** Item ids a ground object in the world carries (interact targets). */
  groundObjectItemIds: ReadonlySet<string>;
  /** Item ids a gather node yields in some zone (gather targets). */
  nodeItemIds: ReadonlySet<string>;
}

export const PLAYER_CLASSES: readonly PlayerClass[] = [
  'warrior',
  'paladin',
  'hunter',
  'rogue',
  'priest',
  'shaman',
  'mage',
  'warlock',
  'druid',
];

function sortedById<T extends { id: string }>(rows: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const row of [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    out[row.id] = row;
  }
  return out;
}

/** Build the index over the live merged tables. Called once per host. */
export function buildContentIndex(): ContentIndex {
  const zones: IndexedZone[] = ZONES.map((zone) => ({ id: zone.id, name: zone.name }));
  const zoneNameById = new Map(zones.map((zone) => [zone.id, zone.name]));
  const workshopIds = new Set(WORKSHOP_QUEST_IDS);

  const npcs = sortedById(
    Object.values(NPCS).map((npc) => {
      const zone = zoneAt(npc.pos.x, npc.pos.z);
      return {
        id: npc.id,
        name: npc.name,
        title: npc.title,
        zoneId: zone.id,
        zoneName: zoneNameById.get(zone.id) ?? zone.name,
        questIds: npc.questIds.filter((id) => !workshopIds.has(id)),
      };
    }),
  );

  const firstCampZone = new Map<string, string>();
  for (const camp of CAMPS) {
    if (firstCampZone.has(camp.mobId)) continue;
    firstCampZone.set(camp.mobId, zoneAt(camp.center.x, camp.center.z).id);
  }
  const mobs = sortedById(
    Object.values(MOBS).map((mob) => {
      const zoneId = firstCampZone.get(mob.id) ?? null;
      return {
        id: mob.id,
        name: mob.name,
        minLevel: mob.minLevel,
        maxLevel: mob.maxLevel,
        zoneId,
        zoneName: zoneId === null ? null : (zoneNameById.get(zoneId) ?? null),
      };
    }),
  );

  const items = sortedById(
    Object.values(ITEMS).map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      quality: item.quality ?? 'common',
      requiredLevel: item.requiredLevel ?? null,
      requiredClass: item.requiredClass ? [...item.requiredClass] : null,
    })),
  );

  const recipes = sortedById(
    ALL_RECIPES.map((recipe) => ({
      id: recipe.id,
      professionId: recipe.professionId,
      resultItemId: recipe.resultItemId,
      resultName: ITEMS[recipe.resultItemId]?.name ?? recipe.resultItemId,
    })),
  );

  const quests = sortedById(
    Object.values(QUESTS)
      .filter((quest) => !workshopIds.has(quest.id))
      .map((quest) => ({
        id: quest.id,
        name: quest.name,
        giverNpcId: quest.giverNpcId,
        requiresQuest: quest.requiresQuest ?? null,
      })),
  );

  const nodeTypes = [...new Set(GATHER_NODES.map((node) => node.type))].sort();

  const nodeItemIds = new Set<string>();
  for (const byZone of Object.values(NODE_MATERIAL_TABLE)) {
    for (const row of Object.values(byZone)) nodeItemIds.add(row.itemId);
  }
  const groundObjectItemIds = new Set(GROUND_OBJECTS.map((object) => object.itemId));

  const acquirableItemIds = new Set<string>();
  for (const mob of Object.values(MOBS)) {
    for (const drop of mob.loot) if (drop.itemId !== undefined) acquirableItemIds.add(drop.itemId);
  }
  for (const id of groundObjectItemIds) acquirableItemIds.add(id);
  for (const id of nodeItemIds) acquirableItemIds.add(id);
  for (const id of Object.values(HARVEST_COMPONENT_ITEMS)) acquirableItemIds.add(id);
  for (const crop of Object.values(FARM_CROPS)) acquirableItemIds.add(crop.produceItemId);
  for (const npc of Object.values(NPCS))
    for (const id of npc.vendorItems ?? []) acquirableItemIds.add(id);
  for (const recipe of ALL_RECIPES) {
    if (recipe.resultCount > 0) acquirableItemIds.add(recipe.resultItemId);
  }

  return {
    zones,
    npcs,
    mobs,
    items,
    recipes,
    quests,
    nodeTypes,
    acquirableItemIds,
    groundObjectItemIds,
    nodeItemIds,
  };
}
