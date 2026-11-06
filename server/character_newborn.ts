// The newborn character state: what character creation persists for a fresh
// character, and what the launch wipe (server/launch_wipe_db.ts) resets a
// character to. Extracted from server/main.ts so the offline wipe tool builds
// the identical state without importing the server entry.

import { randomUUID } from 'node:crypto';
import { PROVING_SHORE_ARRIVAL } from '../src/sim/content/proving_shore';
import type { CharacterState } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import type { PlayerClass } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';

export function initialCharacterState(
  cls: PlayerClass,
  name: string,
  skin: number,
): CharacterState {
  // Wall-clock injection is load-bearing for persistence: every blob that
  // reaches Postgres must be written on the epoch base (farm_persist.ts
  // clock-base doctrine), never the sim-clock default that starts at zero.
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: cls,
    playerName: name,
    lockoutNowMs: () => Date.now(),
    mintItemGuid: randomUUID,
  });
  sim.setPlayerSkin(sim.playerId, skin);
  const character = sim.serializeCharacter(sim.playerId);
  if (!character) throw new Error('failed to serialize initial character');
  // A newborn begins ON the Proving Shore (the coached tutorial), no opt-in
  // ferry ride: the persisted row is what decides an online spawn (addPlayer
  // prefers savedPos over playerStart), so island entry costs no sim change,
  // keeps the offline default spawn untouched, and leaves every parity
  // golden byte-identical. The greeting sweep sees the fresh character
  // already ashore and plays Odo's arrival instead of Bryn's ferry offer.
  character.pos = { x: PROVING_SHORE_ARRIVAL.x, z: PROVING_SHORE_ARRIVAL.z };
  character.facing = PROVING_SHORE_ARRIVAL.facing;
  return character;
}
