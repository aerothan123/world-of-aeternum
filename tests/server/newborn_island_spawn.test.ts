// The newborn spawn: a CREATED character's persisted row starts on the
// Eastbrook Vale mainland (owner, 2026-11: the Proving Shore tutorial is
// retired). The row is what decides an online spawn (Sim.addPlayer prefers
// savedPos over playerStart), so the server-side row and the offline default
// spawn name the same spot: the v2 design's player start below the town's
// south gate (src/sim/vale_bounds.ts MAINLAND_START).

import { describe, expect, it } from 'vitest';
import { characterCreationTestSeam } from '../../server/main';
import { isOnProvingShore } from '../../src/sim/content/proving_shore';
import { PLAYER_START } from '../../src/sim/data';
import { MAINLAND_START } from '../../src/sim/vale_bounds';

describe('newborn mainland spawn (the island is retired)', () => {
  it('rolls every fresh character state at the mainland start, never on the island', () => {
    const state = characterCreationTestSeam.initialCharacterState('warrior', 'Newborn', 0);
    expect(state.pos).toEqual({ x: MAINLAND_START.x, z: MAINLAND_START.z });
    expect(state.facing).toBe(MAINLAND_START.facing);
    expect(isOnProvingShore(state.pos.x, state.pos.z)).toBe(false);
  });

  it('keeps the offline default spawn on the same mainland start', () => {
    // Eastbrook Vale v2: the owner-approved start is the design's player_spawn
    // below the town's south gate.
    expect(PLAYER_START).toEqual({ x: -16, z: -158 });
    expect({ x: MAINLAND_START.x, z: MAINLAND_START.z }).toEqual(PLAYER_START);
  });
});
