// The Galecrest's late terrain shaping, moved verbatim out of world.ts
// applyTerrainPads (the monolith ratchet: world.ts is extracted, never grown):
// the Mirror Tarn's bathing shore, the level pads under the raider camps, the
// stable barns and the Old Beacon, and the Beacon dock stair's cutting. Float
// evaluation order is part of the terrain parity contract, so the body is the
// original line for line; world.ts passes its own unpadded height function in
// (the wisp maze pad precedent) because this leaf cannot import world.ts.
// Pinned by tests/world_core_terrain_parity.test.ts and tests/galecrest.test.ts.

/** Mirror of world.ts WATER_LEVEL (same literal, so the same float math). */
const WATER_LEVEL = -4.3;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// The Galecrest's level ground (terrainHeight above): each pad blends the
// finished height to its center's, wide enough that every tent, tower,
// palisade run, and barn sits flush instead of sinking into a rise.
export const GALE_LEVEL_PADS: { x: number; z: number; r: number; h?: number }[] = [
  { x: 252, z: 250, r: 14 },
  { x: 210, z: 410, r: 14 },
  { x: 354, z: 664, r: 14 },
  // the stable barns' lakeside terrace on the Mirror Tarn's north bank: an
  // explicit height keeps it a low shelf above the beach, the downs rising
  // behind it, instead of a high pad with a sheer rim over the water
  { x: 299, z: 531, r: 12, h: WATER_LEVEL + 3.2 },
  // the Old Beacon's lawn: one flat disc under the whole tower and spiral
  // stair, so the stair foot always meets level ground (a sloping lawn left
  // the first tread hovering and broke click-to-move approaches)
  { x: 498, z: 308, r: 11 },
];

/** The Galecrest's shaping, over the finished height like the bed pads. */
export function applyGalecrestShaping(
  x: number,
  z: number,
  seed: number,
  h: number,
  terrainHeightUnpadded: (x: number, z: number, seed: number) => number,
): number {
  if (x > 180 && x < 540 && z > 180 && z < 700) {
    // the Mirror Tarn's bathing shore FIRST: pull the carved banks down onto
    // one long gentle sandy ramp, so the water is waded into, never fallen
    // into (the level pads below then win wherever the two overlap)
    const tdx = x - 300,
      tdz = z - 560;
    if (tdx * tdx + tdz * tdz < 32 * 32) {
      const d = Math.sqrt(tdx * tdx + tdz * tdz);
      const target = WATER_LEVEL - 2.2 + smoothstep(5, 26, d) * 8.2;
      const w = 1 - smoothstep(26, 32, d);
      if (h > target) h = h * (1 - w) + target * w;
    }
    // level pads under the raider encampments and the tarn's north-bank
    // stable barns (the built-in camp flatten only reaches the mob spawn
    // ring; tents and barns stand wider than that)
    for (const pad of GALE_LEVEL_PADS) {
      const dx = x - pad.x,
        dz = z - pad.z;
      const padGate = pad.r + 5;
      if (dx * dx + dz * dz >= padGate * padGate) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      const ch = pad.h ?? terrainHeightUnpadded(pad.x, pad.z, seed);
      const blend = smoothstep(pad.r, pad.r + 5, d);
      h = h * blend + ch * (1 - blend);
    }
    // the Beacon dock stair's cutting: the headland face is carved down to
    // the stair's ramp line so the treads climb an open notch instead of
    // vanishing inside the cliff (mirror of the beacon stair deck in
    // sim/gale_harbor.ts: center 503.3,325.3 rot 0.99 hl 6.94)
    const sdx = x - 503.3,
      sdz = z - 325.3;
    if (sdx * sdx + sdz * sdz < 10.6 * 10.6) {
      const dirx = 0.8360259786005205; // sin(0.99)
      const dirz = 0.5486979929717658; // cos(0.99)
      const along = sdx * dirx + sdz * dirz;
      const across = sdx * dirz - sdz * dirx;
      if (along > -8.4 && along < 8.4 && Math.abs(across) < 4.4) {
        const topY = terrainHeightUnpadded(497, 321, seed) + 0.1;
        const botY = Math.max(terrainHeightUnpadded(507, 327, seed), WATER_LEVEL + 0.55) + 0.1;
        const t = Math.min(1, Math.max(0, (along + 6.94) / 13.88));
        const rampY = topY + (botY - topY) * t - 0.25;
        const w =
          (1 - smoothstep(1.4, 4.4, Math.abs(across))) *
          (1 - smoothstep(6.94, 8.4, Math.abs(along)));
        if (h > rampY) h = h * (1 - w) + rampY * w;
      }
    }
  }
  return h;
}
