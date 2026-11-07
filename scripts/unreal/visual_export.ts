// The entity-visual export for the native (Unreal) client: for every mob, NPC and
// player class, the web client's visual key, its model (the GLB path, which is also
// the key the Unreal asset registry uses: E:\WyndlewoodUnreal\EnvSlice\Content\
// Wyndlewood\Assets\asset_registry.json), and its authored height in yards. Read
// straight from the renderer's dispatch (visualKeyFor, VISUALS in
// src/render/characters/manifest.ts) so the Unreal client picks the same body the
// web client does. tests/unreal_visual_export.test.ts fails when the committed copy
// is stale; scripts/unreal/export_protocol.ts writes it.

import { VISUALS, visualKeyFor } from '../../src/render/characters/manifest';
import { CLASSES, MOBS, NPCS } from '../../src/sim/data';
import type { Entity } from '../../src/sim/types';

export interface EntityVisual {
  key: string;
  /** Registry key: the model path without the models/ prefix and .glb suffix, or null. */
  model: string | null;
  height: number | null;
}

export interface VisualExport {
  mobs: Record<string, EntityVisual>;
  npcs: Record<string, EntityVisual>;
  players: Record<string, EntityVisual>;
}

function modelKey(url: string | undefined): string | null {
  if (!url) return null;
  const m = /(?:^|\/)models\/(.+)\.glb$/.exec(url);
  return m ? m[1] : null;
}

function visualFor(kind: Entity['kind'], templateId: string): EntityVisual {
  // visualKeyFor reads only identity fields; a minimal entity carries them.
  const key = visualKeyFor({ kind, templateId, modularAppearance: null } as unknown as Entity);
  const def = VISUALS[key];
  return {
    key,
    model: modelKey(def?.url),
    height: typeof def?.height === 'number' ? def.height : null,
  };
}

function sortedRecord<T>(ids: string[], f: (id: string) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of [...ids].sort()) out[id] = f(id);
  return out;
}

export function buildVisualExport(): VisualExport {
  return {
    mobs: sortedRecord(Object.keys(MOBS), (id) => visualFor('mob', id)),
    npcs: sortedRecord(Object.keys(NPCS), (id) => visualFor('npc', id)),
    players: sortedRecord(Object.keys(CLASSES), (id) => visualFor('player', id)),
  };
}

export const VISUAL_EXPORT_FILE = 'entity_visuals.json';
