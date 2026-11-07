// Parity cases for the Unreal client's animation-state port (WyndAnimSelect in the
// Unreal project): the web renderer's own pose machine run over fixed inputs.
//  - `loco`: a scripted travel trace (start, walk, run, backpedal, strafe, stop, a
//    teleport snap) through updateLocomotionInto, one LocoState per frame;
//  - `base`: a grid of AnimState facts through desiredBaseState;
//  - `scale`: locomotionTimeScale for each gait over a speed sweep.
// The C++ automation test replays the same inputs and must match exactly (to 1e-9).
// tests/unreal_character_export.test.ts keeps the committed copy fresh.

import {
  type AnimState,
  desiredBaseState,
  locomotionTimeScale,
} from '../../src/render/characters/anim_state';
import { newLocoState, newLocoTrack, updateLocomotionInto } from '../../src/render/locomotion';

export const ANIM_SELECT_EXPORT_FILE = 'anim_select_cases.json';

interface LocoFrame {
  vx: number;
  vz: number;
  facing: number;
  dt: number;
}

/** The scripted trace: speeds in yd/s along a heading, sampled at uneven frame times. */
function trace(): LocoFrame[] {
  const out: LocoFrame[] = [];
  const dts = [1 / 60, 1 / 144, 1 / 30, 1 / 60, 0.05, 1 / 75];
  let i = 0;
  const leg = (frames: number, speed: number, travel: number, facing: number) => {
    for (let k = 0; k < frames; k++) {
      const dt = dts[i++ % dts.length];
      out.push({
        vx: Math.sin(travel) * speed * dt,
        vz: Math.cos(travel) * speed * dt,
        facing,
        dt,
      });
    }
  };
  leg(10, 0, 0, 0); // standing
  leg(40, 2.2, 0.3, 0.3); // walking forward
  leg(60, 7, 0.3, 0.3); // running forward
  leg(30, 4.55, 0.3 + Math.PI, 0.3); // backpedal
  leg(40, 7, 0.3 - Math.PI / 2, 0.3); // strafe (left of facing)
  leg(40, 7, 0.3 + Math.PI / 2, 0.3); // strafe (right of facing)
  leg(25, 0.1, 0.3, 0.3); // creeping below the enter speed
  out.push({ vx: 40, vz: 0, facing: 0.3, dt: 1 / 60 }); // a teleport snap
  leg(30, 0, 0, 0.3); // stopped
  return out;
}

function locoCases() {
  const t = newLocoTrack();
  const s = newLocoState();
  return trace().map((f) => {
    updateLocomotionInto(s, t, f.vx, f.vz, f.facing, f.dt);
    return { in: f, out: { ...s } };
  });
}

function baseCases() {
  const out: unknown[] = [];
  const bools = [false, true];
  for (const swimming of bools)
    for (const airborne of bools)
      for (const casting of bools)
        for (const moving of bools)
          for (const running of bools)
            for (const backwards of bools)
              for (const strafe of [null, 'left', 'right'] as const)
                for (const combat of bools)
                  for (const dead of bools) {
                    const s = {
                      speed: running ? 7 : 2,
                      moving,
                      running,
                      airborne,
                      falling: false,
                      backwards,
                      strafe,
                      dead,
                      casting,
                      swimming,
                      submerged: false,
                      swimPitch: 0,
                      wading: false,
                      sitting: false,
                      combat,
                    } as AnimState;
                    // the WOC body: walkBack, combat idle and both strafe clips present
                    const state = desiredBaseState(
                      s,
                      true,
                      true,
                      true,
                      false,
                      false,
                      false,
                      true,
                      false,
                    );
                    out.push({
                      in: {
                        swimming,
                        airborne,
                        casting,
                        moving,
                        running,
                        backwards,
                        strafe,
                        combat,
                        dead,
                      },
                      out: state,
                    });
                  }
  return out;
}

function scaleCases() {
  const out: unknown[] = [];
  for (const state of ['walk', 'walkBack', 'run', 'strafeLeft', 'idle'] as const) {
    for (const speed of [0, 1, 2.2, 3.5, 4.55, 6, 7, 9, 14]) {
      out.push({
        state,
        speed,
        walkBackRef: 4.55,
        out: locomotionTimeScale(
          state,
          { speed, backwards: state === 'walkBack' },
          undefined,
          undefined,
          undefined,
          4.55,
        ),
      });
    }
  }
  return out;
}

export function buildAnimSelectExport() {
  return { loco: locoCases(), base: baseCases(), scale: scaleCases() };
}
