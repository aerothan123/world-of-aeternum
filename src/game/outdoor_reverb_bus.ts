// The shared outdoor reverb send (the thin WebAudio consumer of
// outdoor_reverb_ir.ts): one bus per audio context, built on the first
// gathering strike (sfx.ts gatherStrike) and fed by every strike's pre-panner
// send. Two convolver lanes, so a change of environment (walking from a meadow
// into a canyon, entering a mine) crossfades the INPUT to the new space while
// the old lane's tail rings out untouched. The bus feeds the effects master,
// so the Sound Effects volume scales the echo with the hit.
//
// `normalize` is off: the responses are energy-normalized at the source, so
// the send level alone sets the wet level, exactly as the offline demo render
// (scripts/sfx/gather_reverb_demo.mjs) assumes.

import { outdoorImpulseResponse, type ReverbEnv } from './outdoor_reverb_ir';

/** Seconds the input crossfades between environments. */
const CROSSFADE_SECONDS = 0.6;

interface Lane {
  readonly gain: GainNode;
  readonly conv: ConvolverNode;
  env: ReverbEnv | null;
}

export class OutdoorReverbBus {
  /** Where every strike's send connects. */
  readonly input: GainNode;
  private readonly lanes: Lane[];
  private active = 0;
  private env: ReverbEnv | null = null;
  private readonly irs = new Map<ReverbEnv, AudioBuffer>();

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    env: ReverbEnv,
  ) {
    this.input = ctx.createGain();
    this.lanes = [0, 1].map(() => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const conv = ctx.createConvolver();
      conv.normalize = false;
      this.input.connect(gain).connect(conv).connect(out);
      return { gain, conv, env: null };
    });
    this.setEnvironment(env);
  }

  /** The space strikes ring out in from now on. Cheap to call every frame: a
   *  no-op unless the environment actually changed. */
  setEnvironment(env: ReverbEnv): void {
    if (env === this.env) return;
    const first = this.env === null;
    this.env = env;
    const from = this.lanes[this.active];
    const toIndex = first ? this.active : 1 - this.active;
    const to = this.lanes[toIndex];
    if (to.env !== env) {
      to.conv.buffer = this.responseFor(env);
      to.env = env;
    }
    const now = this.ctx.currentTime;
    if (first) {
      to.gain.gain.value = 1;
    } else {
      from.gain.gain.setTargetAtTime(0, now, CROSSFADE_SECONDS / 3);
      to.gain.gain.setTargetAtTime(1, now, CROSSFADE_SECONDS / 3);
    }
    this.active = toIndex;
  }

  private responseFor(env: ReverbEnv): AudioBuffer {
    const cached = this.irs.get(env);
    if (cached) return cached;
    const [left, right] = outdoorImpulseResponse(env, this.ctx.sampleRate);
    const buf = this.ctx.createBuffer(2, left.length, this.ctx.sampleRate);
    buf.getChannelData(0).set(left);
    buf.getChannelData(1).set(right);
    this.irs.set(env, buf);
    return buf;
  }
}
