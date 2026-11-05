// The per-strike gathering audio consumer (src/render/gather_strike_audio.ts):
// every gathering body in hearing range (self or other) strikes on its own
// swing's contact, a frozen rig (behind the camera) keeps striking on the
// coast, nothing past the range or off a non-gathering cast, and every cue it
// and the tree fall reach for is a real catalogued clip with its takes on disk.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GATHER_HEAR_RANGE, GATHER_STRIKE_SFX } from '../src/game/gather_strike_mix';
import { SFX_CLIPS } from '../src/game/sfx_manifest.generated';
import type { GatherStrikeKind, SpatialAudioSink } from '../src/render/audio_sink';
import { GATHER_MINE_CAST_CLIP } from '../src/render/gather_pose_core';
import { GATHER_STRIKE_RANGE, GatherStrikeAudio } from '../src/render/gather_strike_audio';
import type { GatherSwingCycle } from '../src/render/gather_strike_core';
import { TREE_CHOP_CAST_CLIP } from '../src/render/tree_felling_core';

const ROOT = resolve(__dirname, '..');

type Strike = [GatherStrikeKind, number, number, number, boolean];

function harness() {
  const strikes: Strike[] = [];
  const sink = {
    gatherStrike: (kind: GatherStrikeKind, x: number, y: number, z: number, self: boolean) =>
      strikes.push([kind, x, y, z, self]),
  } as unknown as SpatialAudioSink;
  return { strikes, audio: new GatherStrikeAudio(() => sink) };
}

/** A rig looping a swing at `period` seconds with its tool landing at `contact`. */
function rig(kind: GatherSwingCycle['kind'], period: number, contact: number) {
  let t = 0;
  let frozen = false;
  return {
    advance(dt: number) {
      if (!frozen) t += dt;
    },
    freeze(on: boolean) {
      frozen = on;
    },
    gatherSwingCycle(out: GatherSwingCycle) {
      out.kind = frozen ? null : kind;
      out.phase = (t / period) % 1;
      out.contact = contact;
      out.period = period;
    },
  };
}

describe('GatherStrikeAudio', () => {
  it('hears the engine range: the render gate matches the mix range', () => {
    expect(GATHER_STRIKE_RANGE).toBe(GATHER_HEAR_RANGE);
  });

  it('strikes once per swing for the local player and every other gatherer in range', () => {
    const { strikes, audio } = harness();
    const me = rig('mine', 1.2, 0.45);
    const other = rig('chop', 1, 0.5);
    const dt = 1 / 60;
    for (let f = 0; f < 6 * 60; f++) {
      me.advance(dt);
      other.advance(dt);
      audio.observe(f, dt, 1, me, { castingAbility: GATHER_MINE_CAST_CLIP }, 4, 0, 0, 0, true);
      audio.observe(
        f,
        dt,
        2,
        other,
        { castingAbility: TREE_CHOP_CAST_CLIP },
        60 * 60,
        60,
        0,
        0,
        false,
      );
    }
    const mine = strikes.filter((s) => s[0] === 'mine');
    const chop = strikes.filter((s) => s[0] === 'chop');
    expect(mine.length).toBe(5);
    expect(chop.length).toBe(6);
    expect(mine.every((s) => s[4] === true)).toBe(true);
    expect(chop.every((s) => s[4] === false && s[1] === 60)).toBe(true);
    // sounded at tool height, not at the feet
    expect(mine[0][2]).toBeGreaterThan(0);
  });

  it('keeps a frozen rig striking on the coast', () => {
    const { strikes, audio } = harness();
    const body = rig('mine', 1, 0.5);
    const dt = 1 / 60;
    body.freeze(true);
    for (let f = 0; f < 5 * 60; f++) {
      audio.observe(
        f,
        dt,
        7,
        body,
        { castingAbility: GATHER_MINE_CAST_CLIP },
        100,
        10,
        0,
        0,
        false,
      );
    }
    expect(strikes.length).toBe(5);
  });

  it('stays silent past the hearing range, for a non-gathering cast, and with no sink path', () => {
    const { strikes, audio } = harness();
    const body = rig('mine', 1, 0.5);
    const far = (GATHER_STRIKE_RANGE + 1) ** 2;
    for (let f = 0; f < 3 * 60; f++) {
      body.advance(1 / 60);
      audio.observe(
        f,
        1 / 60,
        1,
        body,
        { castingAbility: GATHER_MINE_CAST_CLIP },
        far,
        0,
        0,
        0,
        false,
      );
      audio.observe(f, 1 / 60, 2, body, { castingAbility: 'fireball' }, 1, 0, 0, 0, false);
      audio.observe(f, 1 / 60, 3, body, { castingAbility: null }, 1, 0, 0, 0, false);
    }
    expect(strikes.length).toBe(0);
    expect(audio.tracked).toBe(0);
    const silent = new GatherStrikeAudio(() => ({}) as SpatialAudioSink);
    silent.observe(0, 1 / 60, 1, body, { castingAbility: GATHER_MINE_CAST_CLIP }, 1, 0, 0, 0, true);
    expect(silent.tracked).toBe(0);
  });

  it('drops the track of a body that stops being drawn', () => {
    const { audio } = harness();
    const body = rig('mine', 1, 0.5);
    audio.observe(0, 1 / 60, 9, body, { castingAbility: GATHER_MINE_CAST_CLIP }, 1, 0, 0, 0, false);
    expect(audio.tracked).toBe(1);
    // body 9 is never observed again; another body keeps the frames ticking
    for (let f = 1; f < 300; f++) {
      audio.observe(f, 1 / 60, 10, body, { castingAbility: null }, 1, 0, 0, 0, false);
    }
    expect(audio.tracked).toBe(0);
  });
});

describe('gathering strike clips', () => {
  it('ships every strike and tree-fall cue as a catalogued multi-take clip', () => {
    for (const key of Object.values(GATHER_STRIKE_SFX)) {
      expect(key in SFX_CLIPS, key).toBe(true);
      expect(existsSync(resolve(ROOT, `public/audio/sfx/${key}_1.mp3`)), key).toBe(true);
      expect(existsSync(resolve(ROOT, `public/audio/sfx/${key}_2.mp3`)), key).toBe(true);
    }
  });
});
