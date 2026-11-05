// Sfx.gatherStrike (src/game/sfx.ts): a gathering strike plays its catalogued
// clip through a long-range panner with a pre-panner send into the ONE shared
// outdoor reverb (built once, on the effects master so the Sound Effects volume
// scales the echo too), follows the listener's environment, and a crowd of
// strikes is capped nearest first. Driven through a minimal WebAudio stub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GATHER_HEAR_RANGE,
  GATHER_REF_DISTANCE,
  GATHER_STRIKE_SFX,
  GATHER_STRIKE_VOICES,
} from '../src/game/gather_strike_mix';
import { sfx } from '../src/game/sfx';

interface Node {
  kind: string;
  outs: Node[];
  connect(n: Node): Node;
  disconnect(): void;
  [key: string]: unknown;
}

let nowT = 0;
const nodes: Node[] = [];
const param = () => ({
  value: 0,
  setValueAtTime(v: number) {
    this.value = v;
  },
  linearRampToValueAtTime() {},
  setTargetAtTime(v: number) {
    this.value = v;
  },
});
function node(kind: string, extra: Record<string, unknown> = {}): Node {
  const n: Node = {
    kind,
    outs: [],
    connect(to: Node) {
      n.outs.push(to);
      return to;
    },
    disconnect() {},
    ...extra,
  };
  nodes.push(n);
  return n;
}

class FakeCtx {
  sampleRate = 8000;
  get currentTime() {
    return nowT;
  }
  destination = node('destination');
  listener = {} as Record<string, unknown>;
  createGain() {
    return node('gain', { gain: param() });
  }
  createBiquadFilter() {
    return node('biquad', { type: '', Q: { value: 1 }, frequency: param() });
  }
  createPanner() {
    return node('panner', { refDistance: 0, maxDistance: 0, setPosition() {} });
  }
  createConvolver() {
    return node('convolver', { normalize: true, buffer: null });
  }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, duration: length / 8000, getChannelData: (c: number) => data[c] };
  }
  createBufferSource() {
    return node('source', {
      buffer: null,
      playbackRate: param(),
      onended: null,
      start() {},
      stop() {},
    });
  }
  resume() {
    return Promise.resolve();
  }
}
(globalThis as never as { AudioContext: unknown }).AudioContext = FakeCtx;

const buffers = () => (sfx as unknown as { buffers: Map<string, { duration: number }> }).buffers;
const pick = GATHER_STRIKE_SFX.mine;

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  nowT += 100;
  nodes.length = 0;
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  sfx.init();
  (sfx as unknown as { active: number }).active = 0;
  for (const key of Object.values(GATHER_STRIKE_SFX)) {
    for (let take = 0; take < 4; take++) {
      buffers().set(take === 0 ? key : `${key}:${take}`, { duration: 0.5 });
    }
  }
  sfx.setListener(0, 0, 0, 0, 0, -1);
});

describe('Sfx.gatherStrike', () => {
  it('plays the strike clip on a long-range panner with a darkened dry path and a reverb send', () => {
    const playAt = vi.spyOn(sfx, 'playAt');
    sfx.gatherStrike('mine', 40, 1, 0, false);
    expect(playAt).toHaveBeenCalledTimes(1);
    const [key, , , , opts] = playAt.mock.calls[0];
    expect(key).toBe(pick);
    expect(opts?.maxDistance).toBe(GATHER_HEAR_RANGE);
    expect(opts?.refDistance).toBe(GATHER_REF_DISTANCE);
    expect(opts?.lowpassHz).toBeLessThan(18000);
    expect(opts?.sendGain).toBeGreaterThan(0);
    const panner = nodes.find((n) => n.kind === 'panner');
    expect(panner?.maxDistance).toBe(GATHER_HEAR_RANGE);
    expect(nodes.some((n) => n.kind === 'biquad')).toBe(true);
  });

  it('builds one shared reverb, unnormalized, feeding the effects master', () => {
    sfx.gatherStrike('mine', 10, 1, 0, false);
    const convolvers = nodes.filter((n) => n.kind === 'convolver');
    // (built on the first strike of the file; a later strike reuses it)
    nodes.length = 0;
    sfx.gatherStrike('chop', 12, 1, 0, false);
    expect(nodes.some((n) => n.kind === 'convolver')).toBe(false);
    const reverb = (sfx as unknown as { reverb: { input: Node } | null }).reverb;
    expect(reverb).not.toBeNull();
    for (const c of convolvers) expect(c.normalize).toBe(false);
    // the send reaches the reverb input
    const send = nodes.find((n) => n.kind === 'gain' && n.outs.includes(reverb?.input as Node));
    expect(send).toBeDefined();
    // and the reverb comes out on the effects master, not the destination directly
    const master = (sfx as unknown as { master: Node }).master;
    const lanes = convolvers.flatMap((c) => c.outs);
    for (const out of lanes) expect(out).toBe(master);
  });

  it('is silent past the hearing range', () => {
    const playAt = vi.spyOn(sfx, 'playAt');
    sfx.gatherStrike('mine', GATHER_HEAR_RANGE + 5, 1, 0, false);
    expect(playAt).not.toHaveBeenCalled();
  });

  it('caps a crowd of strikes, keeping the nearest and always the listener', () => {
    const playAt = vi.spyOn(sfx, 'playAt');
    nowT += 10; // every earlier voice has ended
    for (let i = 0; i < GATHER_STRIKE_VOICES + 4; i++)
      sfx.gatherStrike('mine', 30 + i, 1, 0, false);
    expect(playAt).toHaveBeenCalledTimes(GATHER_STRIKE_VOICES);
    playAt.mockClear();
    sfx.gatherStrike('mine', 60, 1, 0, false); // farther than all: dropped
    expect(playAt).not.toHaveBeenCalled();
    sfx.gatherStrike('mine', 5, 1, 0, false); // nearer: steals the farthest voice
    sfx.gatherStrike('mine', 50, 1, 0, true); // the listener's own: always heard
    expect(playAt).toHaveBeenCalledTimes(2);
  });

  it('follows the listener into a cave and onto the cliffs', () => {
    const env = () => (sfx as unknown as { reverbEnv: string }).reverbEnv;
    sfx.ambience('peaks', false, null, false);
    expect(env()).toBe('cliffs');
    sfx.ambience('vale', true, null, false);
    expect(env()).toBe('cave');
    sfx.ambience('jungle', false, null, false);
    expect(env()).toBe('forest');
  });
});
