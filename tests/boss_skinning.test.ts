// Which bones the shipped boss bodies' regions ride, read from their GLBs' skins at rest
// (tests/helpers/posed_glb.ts restSkinnedVertices). Each pin is a fault a per-bone floor and
// edge-stretch audit found in a body that had already shipped (the retired Hollow Crypt's two
// dragons, whose wing membranes rode their hips, left with their GLBs on 2026-11-11):
// - the Shipwreck Captain's forearms were fused to his waist where they hang against it, so every
//   swing dragged a sheet out of his side;
// - the Great Jaguar's left forepaw rode its spine, so it sank through the floor in every crouch.

import { describe, expect, it } from 'vitest';
import { restSkinnedVertices } from './helpers/posed_glb';

const CREATURES = 'public/models/creatures';

function share(w: Map<string, number>, pick: (bone: string) => boolean): number {
  let s = 0;
  for (const [bone, x] of w) if (pick(bone)) s += x;
  return s;
}

const isTorso = (b: string) => b === 'hips' || b === 'spine' || b === 'chest';
const isForearm = (b: string) => /^(lowerarm|hand|fingers)\.[lr]$/.test(b);

describe('the boss bodies ride the right bones', () => {
  it('the Shipwreck Captain: no forearm pulls on his waist below the armpits', async () => {
    // His armpits stand at 1.33 of his 1.9.
    const vs = await restSkinnedVertices(`${CREATURES}/woc_bastion_captain.glb`);
    expect(Math.max(...vs.map((v) => v.pos[1]))).toBeCloseTo(1.9, 1);
    const mixed = vs.filter(
      (v) =>
        v.pos[1] < 1.33 && share(v.weights, isForearm) >= 0.1 && share(v.weights, isTorso) >= 0.1,
    );
    expect(mixed.length).toBe(0);
  });

  it('the Great Jaguar: nothing at its soles rides its body', async () => {
    // At its in-game size (6.2 yd to the headdress): the soles' band, 0.3 yd up.
    const vs = await restSkinnedVertices(`${CREATURES}/woc_basin_jaguar.glb`);
    const soles = vs.filter((v) => v.pos[1] < 0.3);
    expect(soles.length, 'the paws are there').toBeGreaterThan(100);
    expect(soles.filter((v) => share(v.weights, isTorso) > 0.5).length).toBe(0);
  });
});
