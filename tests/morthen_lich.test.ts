// Morthen the Gravecaller as the Lich Bishop (the art guide's model,
// scripts/assets/specs/woc_crypt_morthen.json): his own body and clips, the entrance
// casts played on his own rise, proclamation and ward, the Shadow Pulse on the staff,
// and the Last Rites stance (the crozier unfolding into the scythe) read off his
// mirrored health alone, so offline and online see the same beat.

import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  DISSOLVE_SEC,
  dissolveLevels,
  MORTHEN_DEATH_LIFT,
  MORTHEN_GROWTH,
  MORTHEN_HOVER,
  MORTHEN_MITRE_EYE,
  MORTHEN_REST_MINZ,
  MORTHEN_RIBS,
  MORTHEN_RIG_Y,
  MORTHEN_SCYTHE_HELD,
  MORTHEN_SCYTHE_UNFOLD,
  MORTHEN_SINK,
  MORTHEN_SMOKE_BASE,
  MORTHEN_SOUL_COUNT,
  MORTHEN_SOUL_RADIUS,
  MORTHEN_STAFF_HELD,
  MORTHEN_STAFF_RESTORED_FRACTION,
  morthenAnchor,
  morthenBodyY,
  morthenDrawScale,
  morthenEmitY,
  morthenStance,
  morthenStanceGesture,
  SWING_CUT_START_SEC,
  scytheTrail,
  soulOrbit,
} from '../src/render/hollow_crypt/morthen_fx_core';
import { MOBS } from '../src/sim/data';
import { MORTHEN_LAST_RITES_FRACTION } from '../src/sim/encounters/hollow_crypt/ids';
import type { Entity } from '../src/sim/types';

const PLAYER_HEIGHT = 2.6;
const GLB = 'public/models/creatures/woc_crypt_morthen.glb';

function glbJson(): {
  animations?: { name: string }[];
  meshes: { primitives: { indices: number }[] }[];
  accessors: { count: number }[];
} {
  const buf = readFileSync(GLB);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

const def = VISUALS[visualKeyFor({ kind: 'mob', templateId: 'morthen' } as Entity)];

async function readGlb() {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.read(GLB);
}

/** The angle (degrees) between two unit quaternions [x, y, z, w]. */
function quatAngleDeg(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

describe('Morthen, the Lich Bishop: his own body', () => {
  it('stands as tall over the flags as the body he replaced, and floats', () => {
    const drawn = def.height * MOBS.morthen.scale;
    expect(drawn / PLAYER_HEIGHT).toBeGreaterThan(2.9);
    // Even with his smoke funnel sunk, what stands over the floor towers: the
    // old body's 7.85 yd, three players (Reuben 2026-10-11: a remade boss keeps
    // its height). The authored rig alone stood 6.88, so he is drawn grown.
    expect((def.height + (def.hover ?? 0)) * MOBS.morthen.scale).toBeCloseTo(7.85, 1);
    expect(def.height).toBeCloseTo(5.85 * MORTHEN_GROWTH, 9);
  });

  it('sinks his smoke funnel into the ring floor so his whole body reads from the camera', () => {
    // One constant drives the manifest's hover and every body anchor.
    expect(def.hover).toBeCloseTo(MORTHEN_HOVER * MORTHEN_GROWTH, 9);
    expect(MORTHEN_HOVER).toBeCloseTo(MORTHEN_REST_MINZ - MORTHEN_SINK, 9);
    expect(MORTHEN_RIG_Y).toBeCloseTo(-MORTHEN_SINK, 9);
    expect(MORTHEN_SINK).toBeGreaterThan(0.5);
    // Every body anchor rides his grown size.
    const s = morthenDrawScale(MOBS.morthen.scale);
    expect(s).toBeCloseTo(MOBS.morthen.scale * MORTHEN_GROWTH, 9);
    // The burning eye under the mitre sits under the old 7 yd for the default
    // camera, and well over a player's head.
    const eye = morthenBodyY(0, MORTHEN_MITRE_EYE.y, s);
    expect(eye).toBeLessThan(7);
    expect(eye).toBeGreaterThan(PLAYER_HEIGHT * 1.6);
    // He still floats: the lowest tatter of his robe (rig 1.23 half a second
    // into Idle) clears the flags, the smoke's last wisps under it (their tops
    // near 1.26), the ribs well above both.
    expect(morthenBodyY(0, 1.23, s)).toBeGreaterThan(0.3);
    expect(morthenBodyY(0, 1.26, s)).toBeGreaterThan(0.3);
    expect(morthenBodyY(0, MORTHEN_RIBS.y, s)).toBeGreaterThan(2.5);
    // The smoke base is under the floor now: its emitters boil out at the flags.
    expect(morthenBodyY(0, MORTHEN_SMOKE_BASE.y, s)).toBeLessThan(0);
    expect(morthenEmitY(morthenBodyY(0, MORTHEN_SMOKE_BASE.y, s), 0, s)).toBeGreaterThan(0);
    expect(morthenEmitY(3, 0, s)).toBe(3);
    // His corpse is lifted by the very sink, so the folded vestments rest on the floor.
    expect(def.deathLift).toEqual(MORTHEN_DEATH_LIFT);
    expect(MORTHEN_DEATH_LIFT.yards).toBeCloseTo(MORTHEN_SINK * MORTHEN_GROWTH, 9);
    expect(MORTHEN_DEATH_LIFT.to).toBeGreaterThan(MORTHEN_DEATH_LIFT.from);
  });

  it('sheds his sparks off the mitre eye, not the retired shoulder candles', () => {
    // The art guide's body has no shoulder candles: the sparks rise off the
    // green eye on the mitre's front plate, on his centre line, above the
    // skull's eye sockets (about 4.95) and the ribs, below the mitre's spikes.
    expect(MORTHEN_MITRE_EYE.x).toBe(0);
    expect(MORTHEN_MITRE_EYE.y).toBeGreaterThan(4.95);
    expect(MORTHEN_MITRE_EYE.y).toBeGreaterThan(MORTHEN_RIBS.y);
    expect(MORTHEN_MITRE_EYE.y).toBeLessThan(def.height);
    expect(MORTHEN_MITRE_EYE.z).toBeGreaterThan(0);
  });
});

describe('Morthen, the Lich Bishop: the souls circling him', () => {
  it('flies every soul round him, evenly spaced, about his ribs', () => {
    const at = Array.from({ length: MORTHEN_SOUL_COUNT }, (_, k) => soulOrbit(k, 0, false, false));
    const angles = at.map((p) => Math.atan2(p.z, p.x)).sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i++)
      expect(angles[i] - angles[i - 1]).toBeCloseTo((Math.PI * 2) / MORTHEN_SOUL_COUNT, 6);
    for (let t = 0; t < 20; t += 0.37) {
      for (let k = 0; k < MORTHEN_SOUL_COUNT; k++) {
        const p = soulOrbit(k, t, false, false);
        const r = Math.hypot(p.x, p.z);
        expect(r).toBeGreaterThan(MORTHEN_SOUL_RADIUS * 0.85);
        expect(r).toBeLessThan(MORTHEN_SOUL_RADIUS * 1.15);
        // his ribs are at 4.15
        expect(p.y).toBeGreaterThan(3.2);
        expect(p.y).toBeLessThan(4.8);
        // drawn over the ring floor even with his funnel sunk into it
        expect(morthenBodyY(0, p.y, morthenDrawScale(MOBS.morthen.scale))).toBeGreaterThan(1);
      }
    }
  });

  it('draws them wider and higher while he casts, and hurries them', () => {
    const rest = soulOrbit(0, 3, false, false);
    const cast = soulOrbit(0, 3, true, false);
    expect(Math.hypot(cast.x, cast.z)).toBeGreaterThan(Math.hypot(rest.x, rest.z) * 1.2);
    expect(cast.y).toBeGreaterThan(rest.y);
    // over the same second a hurried soul sweeps a longer arc
    const arc = (casting: boolean, rites: boolean) => {
      const a = soulOrbit(2, 1, casting, rites);
      const b = soulOrbit(2, 1.1, casting, rites);
      return Math.abs(Math.atan2(b.z, b.x) - Math.atan2(a.z, a.x));
    };
    expect(arc(true, false)).toBeGreaterThan(arc(false, false));
    expect(arc(false, true)).toBeGreaterThan(arc(false, false));
  });
});

describe('Morthen, the Lich Bishop: the Last Rites stance', () => {
  it('keys on the design line (hollow_crypt.md 5.4: phase 3 at 35 percent)', () => {
    expect(MORTHEN_LAST_RITES_FRACTION).toBe(0.35);
    expect(morthenStance(null, 1)).toBe('staff');
    expect(morthenStance('staff', 0.36)).toBe('staff');
    expect(morthenStance('staff', 0.35)).toBe('scythe');
    expect(morthenStance(null, 0.2)).toBe('scythe');
  });

  it('never flips back on a heal inside the phase, only when he is whole again', () => {
    expect(morthenStance('scythe', 0.5)).toBe('scythe');
    expect(morthenStance('scythe', MORTHEN_STAFF_RESTORED_FRACTION - 0.01)).toBe('scythe');
    expect(morthenStance('scythe', MORTHEN_STAFF_RESTORED_FRACTION)).toBe('staff');
    expect(morthenStance('scythe', Number.NaN)).toBe('scythe');
  });

  it('plays the unfolding only on a live staff-to-scythe edge', () => {
    expect(morthenStanceGesture('staff', 'scythe')).toBe(MORTHEN_SCYTHE_UNFOLD);
    // a late joiner (first sight) and the periodic refresh swap silently
    expect(morthenStanceGesture(null, 'scythe')).toBe(MORTHEN_SCYTHE_HELD);
    expect(morthenStanceGesture('scythe', 'scythe')).toBe(MORTHEN_SCYTHE_HELD);
    expect(morthenStanceGesture('scythe', 'staff')).toBe(MORTHEN_STAFF_HELD);
    expect(morthenStanceGesture(null, 'staff')).toBe(MORTHEN_STAFF_HELD);
  });
});

describe('Morthen, the Lich Bishop: effect plan', () => {
  it('turns body anchors with his facing', () => {
    const at = { x: 0, y: 3, z: 1 };
    const north = morthenAnchor({ x: 10, y: 2, z: 5 }, 0, 1, at);
    expect(north.x).toBe(10);
    expect(north.z).toBe(6);
    // Rig-frame heights ride the sink onto his pivot.
    expect(north.y).toBeCloseTo(2 + 3 + MORTHEN_RIG_Y, 9);
    const east = morthenAnchor({ x: 0, y: 0, z: 0 }, Math.PI / 2, 2, at);
    expect(east.x).toBeCloseTo(2);
    expect(east.z).toBeCloseTo(0);
    expect(east.y).toBeCloseTo((3 + MORTHEN_RIG_Y) * 2);
    expect(morthenBodyY(1, 3, 2)).toBeCloseTo(east.y + 1, 9);
  });

  it('cuts a swing trail forward along the arc, then fades it', () => {
    expect(scytheTrail(0)).toBeNull();
    let lastHead = -1;
    for (let t = SWING_CUT_START_SEC; t < SWING_CUT_START_SEC + 0.28; t += 0.02) {
      const p = scytheTrail(t);
      expect(p).not.toBeNull();
      expect(p?.head ?? 0).toBeGreaterThanOrEqual(lastHead);
      expect(p?.tail ?? 1).toBeLessThanOrEqual(p?.head ?? 0);
      lastHead = p?.head ?? 0;
    }
    expect(scytheTrail(SWING_CUT_START_SEC + 2)).toBeNull();
  });

  it('dissolves into smoke, lets the souls go, and ends', () => {
    expect(dissolveLevels(0).flash).toBe(1);
    expect(dissolveLevels(0.5).smoke).toBeGreaterThan(0.8);
    expect(dissolveLevels(1).souls).toBeGreaterThan(0.5);
    expect(dissolveLevels(DISSOLVE_SEC + 0.1)).toEqual({ smoke: 0, souls: 0, flash: 0 });
  });
});
