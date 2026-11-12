import type { Sim } from '../../src/sim/sim';
import { groundHeight } from '../../src/sim/world';

// A clear, level meadow on the Eastbrook Vale v2 design ground, west of Mirror
// Lake: dry, no solid or tree within 24 yd, sight lines clear 20 yd out in
// every direction, and no camp or NPC near (pinned by
// tests/vale_meadow_fixture.test.ts). The v2 design turns the procedural
// scatter off on its ground, so unlike the OPEN_FIELD lane (whose trees and
// rocks follow the seed) this spot is clear on EVERY seed. For seed-pinned
// suites that used to stand at the old player start (-94, -58) and place
// targets at fixed offsets around it: the v2 start (-16, -158) sits among the
// south gate's solids.
export const VALE_MEADOW = Object.freeze({ x: -196, z: 70 });

/** The open radius the fixture test pins round VALE_MEADOW. */
export const VALE_MEADOW_RADIUS = 24;

export function placePlayerInValeMeadow(sim: Sim, pid = sim.playerId): void {
  const player = sim.entities.get(pid);
  if (!player) throw new Error(`missing vale-meadow player ${pid}`);
  const { x, z } = VALE_MEADOW;
  player.pos = { x, y: groundHeight(x, z, sim.cfg.seed), z };
  player.prevPos = { ...player.pos };
  player.fallStartY = player.pos.y;
  player.onGround = true;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
}
