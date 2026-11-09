// The main levels 1 to 20 leveling path: the hub of each zone a player levels
// through, in level order. Pure: measures straight hub to hub legs over any
// zone table, so the run-time target is pinned by tests/frontier_spread.test.ts.

export const MAIN_PATH_ZONES: readonly string[] = [
  'proving_shore',
  'eastbrook_vale',
  'farshore_isle',
  'applewold',
  'kindlemoor',
  'chalkbarrow_coast',
  'saltmeads',
  'wychwold',
  'tinmarch',
  'rookcliffs',
  'sedgemarch',
  'harrowfells',
  'wardmere',
];

interface HubZone {
  id: string;
  hub: { x: number; z: number; name: string };
}

export function mainPathLength(zones: readonly HubZone[]): {
  legs: { from: string; to: string; yards: number }[];
  total: number;
} {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const hubs = MAIN_PATH_ZONES.map((id) => {
    const z = byId.get(id);
    if (!z) throw new Error(`main path zone missing: ${id}`);
    return z.hub;
  });
  const legs = [];
  let total = 0;
  for (let i = 1; i < hubs.length; i++) {
    const a = hubs[i - 1];
    const b = hubs[i];
    const yards = Math.hypot(a.x - b.x, a.z - b.z);
    legs.push({ from: a.name, to: b.name, yards });
    total += yards;
  }
  return { legs, total };
}
