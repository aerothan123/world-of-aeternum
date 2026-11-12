// The one raised-plank surface query every walkable deck family answers
// through: Wickharbor's stilt piers (gale_harbor), New Eastbrook's quay and
// piers (eastbrook_harbor), Palmreach's bridges and lagoon decks
// (reach_decks), the far ferry piers (ferry_piers), and the pirate-kit
// fishing docks (dock_layout). Extracted
// from world.ts under the monolith ratchet; pure leaf, terrain and water
// level and the dock list are passed in, so no world.ts import and no cycle.
import { dockLocalPoint, dockSectionAtLocal, dockSurfaceLine, dockSurfaceYAt } from './dock_layout';
import { eastbrookDeckSurface } from './eastbrook_harbor';
import { ebv2OwnsBuiltin } from './eastbrook_v2/ground';
import { ferryPierSurface } from './ferry_piers';
import { galeDeckSurface } from './gale_harbor';
import { gliderWharfSurface } from './glider_wharf_layout';
import { reachDeckSurface } from './reach_decks';
import type { ZonePropsDef } from './types';

export function dockSurfaceHeight(
  x: number,
  z: number,
  terrainAt: (x: number, z: number) => number,
  waterLevel: number,
  docks: ZonePropsDef['docks'],
): number {
  // Wickharbor's stilt piers and boardwalk ride the same raised-surface arm
  // (an absolute plank plane, never a terrain lift; see sim/gale_harbor.ts).
  let surface = galeDeckSurface(x, z, terrainAt, waterLevel);
  // ...New Eastbrook's quay boardwalk and piers, the same idiom, except where the
  // Eastbrook Vale v2 design owns the ground (the built-in world: the old harbor cove
  // is the design's mill ground, and the Moonrest ferry berths at its west cove pier,
  // ferry_piers.ts)
  if (!ebv2OwnsBuiltin(x, z)) {
    surface = Math.max(surface, eastbrookDeckSurface(x, z, terrainAt, waterLevel));
  }
  // ...and the Palmreach's river bridges and lagoon decks, the same idiom
  surface = Math.max(surface, reachDeckSurface(x, z, terrainAt, waterLevel));
  // ...and Zephyr's launch wharf on the crest of the Shear, the same idiom
  surface = Math.max(surface, gliderWharfSurface(x, z, terrainAt, waterLevel));
  // ...and the ferry piers at the far berths, the same idiom
  surface = Math.max(surface, ferryPierSurface(x, z, terrainAt, waterLevel));
  for (const dock of docks) {
    const local = dockLocalPoint(dock, x, z);
    if (dockSectionAtLocal(local.x, local.z) < 0) continue;
    const line = dockSurfaceLine(dock, terrainAt);
    surface = Math.max(surface, dockSurfaceYAt(line, local.z));
  }
  return surface;
}

/** Whether (x, z) lies under a harbor's planks: Wickharbor's, New
 *  Eastbrook's, or a far ferry pier's (decoration never grows up through
 *  them, world.ts). */
export function onHarborPlanks(
  x: number,
  z: number,
  terrainAt: (x: number, z: number) => number,
  waterLevel: number,
): boolean {
  return (
    galeDeckSurface(x, z, terrainAt, waterLevel) !== -Infinity ||
    (!ebv2OwnsBuiltin(x, z) && eastbrookDeckSurface(x, z, terrainAt, waterLevel) !== -Infinity) ||
    ferryPierSurface(x, z, terrainAt, waterLevel) !== -Infinity
  );
}
