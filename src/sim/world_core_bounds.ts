// The frozen bounds of the shipped zone grid (the fifteen bible regions as they
// stood before the world expansion): x -540..540, z -180..2420.
//
// Why a frozen copy: data.ts WORLD_MIN_X..WORLD_MAX_Z are the bounding box of
// ALL zone rects, so they grow the moment an expansion zone is appended. The
// shipped terrain rules (world.ts: the world-edge rims, the north rim, the
// Amberfall sea edge, the east-coast exterior band) were written against the
// old box and must keep reading it, or the coasts every crew has built on would
// move. Those rules read CORE_WORLD; the grid-wide consumers (terrain chunk
// grid, decoration anchors, far terrain, minimap strip) keep the live bounds.
// Pinned by tests/world_core_terrain_parity.test.ts.

export const CORE_WORLD = Object.freeze({
  minX: -540,
  maxX: 540,
  minZ: -180,
  maxZ: 2420,
});

export const CORE_WORLD_MIN_X = CORE_WORLD.minX;
export const CORE_WORLD_MAX_X = CORE_WORLD.maxX;
export const CORE_WORLD_MIN_Z = CORE_WORLD.minZ;
export const CORE_WORLD_MAX_Z = CORE_WORLD.maxZ;
