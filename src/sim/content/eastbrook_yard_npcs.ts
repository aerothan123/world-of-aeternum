// The Eastbrook crafting yard's residents added by the town kit relayout
// (docs/design/town-layout-eastbrook.md, phase 2). The yard gave Eastbrook its
// own tannery (content/professions.ts STATIONS station_eastbrook_tannery), so
// the starter town gains a tannery master beside the racks. Her stand comes
// from the layout (sim/eastbrook_layout.ts services.npcs) like every other
// Eastbrook NPC. Merged LAST into NPCS (data.ts) so every NPC placed before
// her keeps its entity id.
//
// Name originality (src/sim/content/CLAUDE.md): "Tamsin" is a common English
// given name; "Tanwick" is coined. Exact-phrase and coined-token searches
// (2026-11-04) found no game character, place or item by either name, and the
// repo has no other Tamsin or Tanwick (docs/design/naming-audit.md).
import { EASTBROOK_NPC_PLACEMENTS_BY_ID } from '../eastbrook_layout';
import type { NpcDef } from '../types';

export const EASTBROOK_YARD_NPCS: Record<string, NpcDef> = {
  tanner_tamsin: {
    id: 'tanner_tamsin',
    name: 'Tamsin Tanwick',
    title: 'Tanner of the Yard',
    pos: { ...EASTBROOK_NPC_PLACEMENTS_BY_ID.tanner_tamsin.position },
    facing: EASTBROOK_NPC_PLACEMENTS_BY_ID.tanner_tamsin.facing,
    color: 0x8f6a3c,
    questIds: [],
    // The same tannery staples the Fenbridge master stocks: her own goods and
    // the vendor-only tanning agent, never a gathered material.
    vendorItems: ['travelers_knapsack', 'tough_jerky', 'tanning_agent'],
    greeting: 'Fresh hides on the racks today, $C. Scrape with the grain, never against it.',
  },
};
