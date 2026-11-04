// The gathering strike mix (src/game/gather_strike_mix.ts) and the outdoor
// reverb's impulse responses (src/game/outdoor_reverb_ir.ts): the echo's share
// of a strike grows with distance, the space follows the listener's biome, a
// crowd keeps its nearest strikes, and the responses are deterministic and
// energy-normalized so the send alone sets the wet level.
import { describe, expect, it } from 'vitest';
import {
  admitStrikeVoice,
  GATHER_HEAR_RANGE,
  GATHER_REF_DISTANCE,
  GATHER_STRIKE_SFX,
  GATHER_STRIKE_VOICES,
  gatherDryFalloff,
  gatherStrikeMix,
  newStrikeVoicePool,
  releaseStrikeVoice,
  reverbEnvFor,
} from '../src/game/gather_strike_mix';
import {
  outdoorImpulseResponse,
  REVERB_IR_MAX_SECONDS,
  REVERB_PROFILES,
  type ReverbEnv,
  reverbIrSeconds,
} from '../src/game/outdoor_reverb_ir';
import { SFX_CLIPS } from '../src/game/sfx_manifest.generated';

const ENVS: ReverbEnv[] = ['open', 'forest', 'cliffs', 'cave'];

describe('gatherStrikeMix', () => {
  it('is silent past the hearing range and full-strength up close', () => {
    expect(gatherStrikeMix(GATHER_HEAR_RANGE + 0.1, 'open', 'mine')).toBeNull();
    expect(gatherStrikeMix(-1, 'open', 'mine')).toBeNull();
    expect(gatherDryFalloff(GATHER_REF_DISTANCE)).toBe(1);
    expect(gatherDryFalloff(GATHER_HEAR_RANGE)).toBe(0);
    const close = gatherStrikeMix(2, 'open', 'mine');
    expect(close?.send).toBeCloseTo(REVERB_PROFILES.open.send, 9);
  });

  it('carries 60 to 80 yards', () => {
    expect(GATHER_HEAR_RANGE).toBeGreaterThanOrEqual(60);
    expect(GATHER_HEAR_RANGE).toBeLessThanOrEqual(80);
  });

  it('grows the echo against the dry hit with distance, and darkens the dry hit', () => {
    let lastRatio = 0;
    let lastHz = Number.POSITIVE_INFINITY;
    for (let d = 10; d <= 70; d += 10) {
      const mix = gatherStrikeMix(d, 'cliffs', 'mine');
      if (!mix) throw new Error(`no mix at ${d}`);
      const ratio = mix.send / gatherDryFalloff(d);
      expect(ratio, `at ${d} yd`).toBeGreaterThan(lastRatio);
      expect(mix.lowpassHz).toBeLessThan(lastHz);
      lastRatio = ratio;
      lastHz = mix.lowpassHz;
    }
    // a strike across the zone is still clearly heard through its echo
    const far = gatherStrikeMix(60, 'cliffs', 'mine');
    expect(far?.send).toBeGreaterThan(0.2);
  });

  it('rings out more off cliffs and in caves than in the open, least under trees', () => {
    const send = (env: ReverbEnv) => gatherStrikeMix(20, env, 'mine')?.send ?? 0;
    expect(send('cliffs')).toBeGreaterThan(send('open'));
    expect(send('cave')).toBeGreaterThan(send('open'));
    expect(send('open')).toBeGreaterThan(send('forest'));
  });

  it('names a catalogued clip for every strike kind', () => {
    for (const key of Object.values(GATHER_STRIKE_SFX)) expect(key in SFX_CLIPS, key).toBe(true);
  });
});

describe('reverbEnvFor', () => {
  it('follows the listener: dungeons and caves are caves, mountains are cliffs, woods are forest', () => {
    expect(reverbEnvFor('vale', true)).toBe('cave');
    expect(reverbEnvFor('cave', false)).toBe('cave');
    expect(reverbEnvFor('peaks', false)).toBe('cliffs');
    expect(reverbEnvFor('jungle', false)).toBe('forest');
    expect(reverbEnvFor('vale', false)).toBe('open');
  });
});

describe('strike voice pool', () => {
  it('fills free voices, then steals the farthest for a nearer strike, else drops it', () => {
    const pool = newStrikeVoicePool();
    for (let i = 0; i < GATHER_STRIKE_VOICES; i++) {
      expect(admitStrikeVoice(pool, 20 + i * 5, 0, 1)).toBe(i);
    }
    const farthest = GATHER_STRIKE_VOICES - 1;
    // a nearer miner takes the farthest one's voice
    expect(admitStrikeVoice(pool, 10, 0.1, 1)).toBe(farthest);
    // a strike farther than every live one is dropped
    expect(admitStrikeVoice(pool, 70, 0.2, 1)).toBe(-1);
    // the listener's own strikes (distance 0) always get a voice
    expect(admitStrikeVoice(pool, 0, 0.3, 1)).toBeGreaterThanOrEqual(0);
    // voices free up when their strikes end
    expect(admitStrikeVoice(pool, 70, 5, 1)).toBe(0);
  });

  it('frees a voice whose strike never started', () => {
    const pool = newStrikeVoicePool(1);
    const slot = admitStrikeVoice(pool, 30, 0, 1);
    releaseStrikeVoice(pool, slot);
    expect(admitStrikeVoice(pool, 60, 0, 1)).toBe(slot);
  });
});

describe('outdoorImpulseResponse', () => {
  it('is deterministic, stereo, bounded and unit energy per channel', () => {
    for (const env of ENVS) {
      const [l, r] = outdoorImpulseResponse(env, 22050);
      const [l2] = outdoorImpulseResponse(env, 22050);
      expect(l).toEqual(l2);
      expect(l.length).toBe(r.length);
      expect(l.length / 22050).toBeLessThanOrEqual(REVERB_IR_MAX_SECONDS + 1e-6);
      expect(reverbIrSeconds(REVERB_PROFILES[env])).toBeGreaterThan(0.5);
      const energy = [...l].reduce((s, v) => s + v * v, 0) + [...r].reduce((s, v) => s + v * v, 0);
      expect(energy).toBeCloseTo(2, 3);
      // decorrelated channels: a real stereo space, not a mono echo
      expect(l).not.toEqual(r);
    }
  });

  it('renders an audition profile in place of the environment, and the default is unchanged', () => {
    const sr = 8000;
    const [def] = outdoorImpulseResponse('open', sr);
    const [same] = outdoorImpulseResponse('open', sr, REVERB_PROFILES.open);
    expect(def).toEqual(same);
    const longer = { ...REVERB_PROFILES.open, decay: 3, seed: 7 };
    const [l, r] = outdoorImpulseResponse('open', sr, longer);
    expect(l.length).toBeGreaterThan(def.length);
    const energy = [...l, ...r].reduce((s, v) => s + v * v, 0);
    expect(energy).toBeCloseTo(2, 3);
  });

  it('rings longer off cliffs than under trees, and its echoes come back after the hit', () => {
    expect(reverbIrSeconds(REVERB_PROFILES.cliffs)).toBeGreaterThan(
      reverbIrSeconds(REVERB_PROFILES.forest),
    );
    const sr = 22050;
    const [l, r] = outdoorImpulseResponse('cliffs', sr);
    const first = REVERB_PROFILES.cliffs.echoes[0].at;
    const peakNear = (ch: Float32Array, at: number) => {
      let peak = 0;
      for (let i = Math.round((at - 0.01) * sr); i < Math.round((at + 0.03) * sr); i++) {
        peak = Math.max(peak, Math.abs(ch[i]));
      }
      return peak;
    };
    const before = peakNear(l, 0.06) + peakNear(r, 0.06);
    expect(peakNear(l, first) + peakNear(r, first)).toBeGreaterThan(before * 3);
  });
});
