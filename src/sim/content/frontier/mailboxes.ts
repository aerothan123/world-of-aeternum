// Ravenpost perches for the expansion frontier's towns (src/sim/frontier/):
// one per hub, appended after the shipped MAILBOXES in data.ts so the shipped
// list (and every test that pins it) keeps its order. Mailboxes spawn at their
// exact spot (no safe-position nudge, ground_object_spawns.ts), so each offset
// was measured clear of the hub's board and giver plots, its tents, crates and
// fire, on dry level ground.

import type { MailboxDef } from '../../types';
import { LOW_REACHES_ZONES } from './low_reaches';
import { SOUTHERN_REACHES_ZONES } from './southern_reaches';
import { WEST_MARCH_ZONES } from './west_march';

/** Every frontier hub's perch: five strides east of the hub fire. */
const PERCH_OFFSET = { x: 5, z: 0 } as const;

export const FRONTIER_MAILBOXES: readonly MailboxDef[] = [
  ...SOUTHERN_REACHES_ZONES,
  ...LOW_REACHES_ZONES,
  ...WEST_MARCH_ZONES,
].map((zone) => ({ x: zone.hub.x + PERCH_OFFSET.x, z: zone.hub.z + PERCH_OFFSET.z }));
