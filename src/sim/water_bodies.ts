// The declared lakes' footprints: a pure leaf extracted out of world.ts (which
// re-exports both names), so the lake reach constant and the render/authoring
// footprint list live beside each other. Sim layer: no rng, no DOM.

import { getActiveWorldContent } from './data';

// A declared lake's footprint reaches this multiple past its authored radius
// (the same soft-edge basin blend baseHeight uses below), so the render plane,
// the walkable-depth floor, and the terrain basin itself all agree on where a
// lake actually ends.
export const LAKE_BLEND_RADIUS_MULT = 1.6;

// Every declared lake across the active content's zones, in render/authoring
// footprint (radius already includes the basin blend margin). Used to draw
// water only where it is actually declared.
export function waterBodies(): { x: number; z: number; radius: number }[] {
  const out: { x: number; z: number; radius: number }[] = [];
  for (const zone of getActiveWorldContent().zones) {
    for (const lake of zone.lakes) {
      out.push({ x: lake.x, z: lake.z, radius: lake.radius * LAKE_BLEND_RADIUS_MULT });
    }
  }
  return out;
}
