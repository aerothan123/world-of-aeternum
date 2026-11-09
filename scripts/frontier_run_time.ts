// Prints the main levels 1 to 20 leveling path (hub to hub, in level order)
// and its run time at RUN_SPEED, from the live zone table. Used to check the
// frontier spread's 15 to 20 minute target: npx tsx scripts/frontier_run_time.ts

import { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z, ZONES } from '../src/sim/data';
import { MAIN_PATH_ZONES, mainPathLength } from '../src/sim/frontier/main_path';
import { RUN_SPEED } from '../src/sim/types';

const { legs, total } = mainPathLength(ZONES);
for (const l of legs) console.log(`${l.from} -> ${l.to}: ${l.yards.toFixed(0)} yd`);
console.log(`zones: ${MAIN_PATH_ZONES.join(', ')}`);
console.log(`bounds x ${WORLD_MIN_X}..${WORLD_MAX_X} z ${WORLD_MIN_Z}..${WORLD_MAX_Z}`);
console.log(
  `total ${total.toFixed(0)} yd, ${(total / RUN_SPEED / 60).toFixed(1)} min at ${RUN_SPEED} yd/s`,
);
